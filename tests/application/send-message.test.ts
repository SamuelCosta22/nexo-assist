import { describe, expect, it } from "vitest";
import type { AgentTrace } from "@/domain/agent/trace";
import { startConversation, type Conversation } from "@/domain/conversation/conversation";
import type { AgentEvent, AgentPort, AgentTurn } from "@/application/ports/agent";
import type { ChatEvent } from "@/application/use-cases/send-employee-message";
import { ana, carla } from "../support/in-memory";
import { buildHarness } from "../support/harness";

function traceWith(confidence: number): AgentTrace {
  return {
    decisionReported: true,
    decision: {
      understanding: "Funcionário pergunta algo ambíguo",
      intent: "duvida",
      confidence,
      rationale: "teste",
      rulesApplied: [],
    },
    actions: [],
    metrics: { model: "fake", latencyMs: 5 },
  };
}

class ScriptedAgent implements AgentPort {
  turns: AgentTurn[] = [];
  constructor(
    private readonly confidence = 0.9,
    private readonly fail = false,
  ) {}
  async *respond(turn: AgentTurn): AsyncGenerator<AgentEvent> {
    this.turns.push(turn);
    if (this.fail) throw new Error("llm down");
    yield { type: "text_delta", text: "Olá" };
    yield { type: "done", text: "Olá, Ana!", blocks: [], trace: traceWith(this.confidence) };
  }
}

async function collect(stream: AsyncGenerator<ChatEvent>) {
  const events: ChatEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

async function setup(agent: ScriptedAgent, patch: Partial<Conversation> = {}) {
  const h = buildHarness({ agent });
  await h.conversations.create({
    ...startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
    ...patch,
  });
  return h;
}

describe("SendEmployeeMessage", () => {
  it("saves the message, runs the agent and persists its reply with the trace", async () => {
    const agent = new ScriptedAgent();
    const h = await setup(agent);
    const begun = await h.send!.begin(ana, "c1", "Qual o horário do service desk?");
    if (!begun.ok) throw begun.error;
    const events = await collect(begun.value.run());

    expect(events.map((e) => e.type)).toEqual(["text_delta", "agent_message", "done"]);
    const stored = h.messages.rows;
    expect(stored.map((m) => m.role)).toEqual(["employee", "agent"]);
    expect(stored[1]?.trace?.metrics.model).toBe("fake");
    expect(agent.turns[0]?.history.at(-1)?.content).toBe("Qual o horário do service desk?");
  });

  it("never invokes the agent while the conversation is with an analyst", async () => {
    const agent = new ScriptedAgent();
    const h = await setup(agent, { status: "with_analyst", assignedAnalystId: "an-rafael" });
    const begun = await h.send!.begin(ana, "c1", "Posso sim, está ligado.");
    if (!begun.ok) throw begun.error;
    const events = await collect(begun.value.run());

    expect(agent.turns).toHaveLength(0);
    expect(events.map((e) => e.type)).toEqual(["done"]);
    expect(h.messages.rows).toHaveLength(1);
  });

  it("stays silent while waiting for an analyst", async () => {
    const agent = new ScriptedAgent();
    const h = await setup(agent, { status: "awaiting_analyst" });
    const begun = await h.send!.begin(ana, "c1", "Alguém aí?");
    if (!begun.ok) throw begun.error;
    await collect(begun.value.run());
    expect(agent.turns).toHaveLength(0);
  });

  it("blocks the 31st message to the agent with a clear error", async () => {
    const h = await setup(new ScriptedAgent(), { employeeMessageCount: 30 });
    const begun = await h.send!.begin(ana, "c1", "mais uma");
    expect(begun.ok).toBe(false);
    if (!begun.ok) expect(begun.error.code).toBe("MESSAGE_LIMIT_REACHED");
    expect(h.messages.rows).toHaveLength(0);
  });

  it("rejects empty and oversized messages", async () => {
    const h = await setup(new ScriptedAgent());
    expect((await h.send!.begin(ana, "c1", "   ")).ok).toBe(false);
    expect((await h.send!.begin(ana, "c1", "x".repeat(2001))).ok).toBe(false);
  });

  it("does not let an employee write in someone else's conversation", async () => {
    const h = await setup(new ScriptedAgent());
    await expect(h.send!.begin(carla, "c1", "oi")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("escalates to a human when the agent's confidence is below 50%", async () => {
    const h = await setup(new ScriptedAgent(0.41));
    const begun = await h.send!.begin(ana, "c1", "Coisa estranha acontecendo");
    if (!begun.ok) throw begun.error;
    const events = await collect(begun.value.run());

    const conversation = await h.conversations.findById("c1");
    expect(conversation?.status).toBe("awaiting_analyst");
    expect(conversation?.handoff?.reason).toBe("low_confidence");
    expect(conversation?.handoff?.confidence).toBe(0.41);
    expect(events.filter((e) => e.type === "agent_message")).toHaveLength(2);
    const first = h.messages.rows.find((m) => m.role === "agent");
    expect(first?.trace?.decision.rulesApplied.join(" ")).toContain("41%");
  });

  it("keeps the employee message and reports a friendly error when the model fails", async () => {
    const h = await setup(new ScriptedAgent(0.9, true));
    const begun = await h.send!.begin(ana, "c1", "Oi");
    if (!begun.ok) throw begun.error;
    const events = await collect(begun.value.run());

    expect(events[0]).toMatchObject({ type: "error", code: "AGENT_UNAVAILABLE" });
    expect(h.messages.rows.map((m) => m.role)).toEqual(["employee"]);
  });

  it("only sends the most recent messages to the model (cost control)", async () => {
    const agent = new ScriptedAgent();
    const h = await setup(agent);
    for (let i = 0; i < 25; i += 1) {
      await h.messages.append({
        id: `old-${i}`,
        conversationId: "c1",
        role: "employee",
        content: `m${i}`,
        blocks: [],
        createdAt: h.clock.now(),
      });
    }
    const begun = await h.send!.begin(ana, "c1", "nova");
    if (!begun.ok) throw begun.error;
    await collect(begun.value.run());
    expect(agent.turns[0]?.history).toHaveLength(20);
  });
});
