import { describe, expect, it } from "vitest";
import type { AgentTrace } from "@/domain/agent/trace";
import { startConversation, type Conversation } from "@/domain/conversation/conversation";
import type { AgentEvent, AgentPort, AgentTurn } from "@/application/ports/agent";
import { SendEmployeeMessage, type ChatEvent } from "@/application/use-cases/send-employee-message";
import { InMemoryUsage, ana, carla } from "../support/in-memory";
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

function buildHarnessSend(h: Awaited<ReturnType<typeof setup>>, agent: ScriptedAgent) {
  return new SendEmployeeMessage({
    conversations: h.conversations,
    messages: h.messages,
    pendingActions: h.pendingActions,
    agent,
    toolboxFor: h.toolboxFor,
    handoff: h.handoff,
    clock: h.clock,
    ids: h.ids,
    messageLimit: 30,
    usage: new InMemoryUsage(h.messages),
    dailyLimit: 150,
  });
}

async function collect(stream: AsyncGenerator<ChatEvent>) {
  const events: ChatEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

async function setup(agent: ScriptedAgent, patch: Partial<Conversation> = {}, dailyLimit?: number) {
  const h = buildHarness({ agent, ...(dailyLimit ? { dailyLimit } : {}) });
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

  it("enforces a rolling 24h cap per employee across conversations", async () => {
    const h = await setup(new ScriptedAgent(), {}, 2);
    const at = h.clock.now();
    for (const [i, offset] of [
      [0, 26],
      [1, 3],
      [2, 1],
    ] as const) {
      await h.messages.append({
        id: `old-${i}`,
        conversationId: "other",
        role: "employee",
        authorId: ana.id,
        content: "x",
        blocks: [],
        createdAt: new Date(at.getTime() - offset * 3_600_000),
      });
    }
    // Two messages inside the window (3h and 1h ago); the 26h-old one does not count.
    const blocked = await h.send!.begin(ana, "c1", "mais uma");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("DAILY_LIMIT_REACHED");
    expect(h.messages.rows.filter((m) => m.conversationId === "c1")).toHaveLength(0);
  });

  it("does not meter messages that go to a human", async () => {
    const h = await setup(
      new ScriptedAgent(),
      { status: "with_analyst", assignedAnalystId: "an-rafael" },
      1,
    );
    await h.messages.append({
      id: "old",
      conversationId: "other",
      role: "employee",
      authorId: ana.id,
      content: "x",
      blocks: [],
      createdAt: h.clock.now(),
    });
    expect((await h.send!.begin(ana, "c1", "obrigada")).ok).toBe(true);
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

  describe("retry after a failure", () => {
    it("re-runs the agent for the same message without duplicating it or spending the limit", async () => {
      const failing = new ScriptedAgent(0.9, true);
      const h = await setup(failing);
      const first = await h.send!.begin(ana, "c1", "Oi");
      if (!first.ok) throw first.error;
      await collect(first.value.run());
      expect(h.messages.rows).toHaveLength(1);

      const working = new ScriptedAgent();
      const retry = await buildHarnessSend(h, working).beginRetry(ana, "c1");
      if (!retry.ok) throw retry.error;
      const events = await collect(retry.value.run());

      expect(events.map((e) => e.type)).toContain("agent_message");
      expect(h.messages.rows.map((m) => m.role)).toEqual(["employee", "agent"]);
      expect((await h.conversations.findById("c1"))?.employeeMessageCount).toBe(1);
    });

    it("refuses when the last message already has an answer", async () => {
      const h = await setup(new ScriptedAgent());
      const first = await h.send!.begin(ana, "c1", "Oi");
      if (!first.ok) throw first.error;
      await collect(first.value.run());
      expect((await h.send!.beginRetry(ana, "c1")).ok).toBe(false);
    });

    it("refuses while the conversation is with an analyst", async () => {
      const h = await setup(new ScriptedAgent(), {
        status: "with_analyst",
        assignedAnalystId: "an-rafael",
      });
      await h.messages.append({
        id: "m",
        conversationId: "c1",
        role: "employee",
        content: "oi",
        blocks: [],
        createdAt: h.clock.now(),
      });
      expect((await h.send!.beginRetry(ana, "c1")).ok).toBe(false);
    });
  });
});
