import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { startConversation } from "@/domain/conversation/conversation";
import type { AgentEvent, AgentTurn } from "@/application/ports/agent";
import {
  MastraAgentAdapter,
  isQuotaFailure,
  toModelMessages,
} from "@/infrastructure/agent/mastra-agent";
import { ana, sp, ticket } from "../support/in-memory";
import { buildHarness } from "../support/harness";

type Part = Record<string, unknown>;

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
};

const toolCall = (id: string, toolName: string, input: unknown): Part[] => [
  { type: "stream-start", warnings: [] },
  { type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) },
  { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
];

/** Several tool calls in ONE model response (parallel function calling). */
const toolCalls = (...calls: [string, unknown][]): Part[] => [
  { type: "stream-start", warnings: [] },
  ...calls.map(([toolName, input], index) => ({
    type: "tool-call",
    toolCallId: `p${index}-${toolName}`,
    toolName,
    input: JSON.stringify(input),
  })),
  { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
];

const reply = (text: string): Part[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
];

/** A model that plays back one scripted response per LLM call. */
function scriptedModel(script: Part[][]) {
  let call = 0;
  const seenToolChoices: unknown[] = [];
  const calls = () => call;
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      seenToolChoices.push(options.toolChoice);
      const parts = script[call] ?? reply("(fim do roteiro)");
      call += 1;
      return { stream: simulateReadableStream({ chunks: parts as never[] }) };
    },
  });
  return { model, seenToolChoices, calls };
}

async function runTurn(script: Part[][], message: string, tickets = [ticket({ id: "INC-20311" })]) {
  const h = buildHarness({ tickets });
  await h.conversations.create(
    startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
  );
  const { model, seenToolChoices, calls } = scriptedModel(script);
  const adapter = new MastraAgentAdapter({
    model: model as never,
    modelName: "mock-model",
    ids: h.ids,
  });
  const turn: AgentTurn = {
    employee: ana,
    conversation: (await h.conversations.findById("c1"))!,
    history: [
      {
        id: "m1",
        conversationId: "c1",
        role: "employee",
        content: message,
        blocks: [],
        createdAt: h.clock.now(),
      },
    ],
    now: sp("2026-11-24T09:43:00"),
    toolbox: h.toolboxFor(ana, "c1"),
  };
  const events: AgentEvent[] = [];
  for await (const event of adapter.respond(turn)) events.push(event);
  const done = events.find((e) => e.type === "done");
  if (done?.type !== "done") throw new Error("no done event");
  return { events, done, seenToolChoices, calls: calls(), h };
}

const decision = {
  entendimento: "Quer saber o status dos chamados",
  intencao: "consultar_chamado",
  confianca: 0.93,
  justificativa: "Vou listar os chamados abertos para ele escolher.",
  regras: ["Privacidade: apenas chamados do próprio funcionário"],
};

describe("MastraAgentAdapter", () => {
  it("reports the decision in parallel with the first tool: two model calls for a consult", async () => {
    const { events, done, seenToolChoices, calls } = await runTurn(
      [
        toolCalls(
          ["registrar_decisao", decision],
          ["consultar_meus_chamados", { somenteAbertos: true, mostrarLista: true }],
        ),
        reply("Você tem 1 chamado aberto. Sobre qual quer saber?"),
      ],
      "Qual o status do meu chamado?",
    );

    // Cost: decision + tool share one model call, the answer is the second.
    expect(calls).toBe(2);
    expect(seenToolChoices[0]).toMatchObject({ type: "required" });
    expect(seenToolChoices[1]).toMatchObject({ type: "auto" });

    expect(done.text).toBe("Você tem 1 chamado aberto. Sobre qual quer saber?");
    expect(done.blocks[0]).toMatchObject({ type: "ticket_list" });
    expect(done.trace.decisionReported).toBe(true);
    expect(done.trace.decision).toMatchObject({
      intent: "consultar_chamado",
      confidence: 0.93,
      understanding: decision.entendimento,
    });
    expect(done.trace.decision.rulesApplied).toEqual(decision.regras);
    expect(done.trace.actions).toHaveLength(1);
    expect(done.trace.actions[0]).toMatchObject({
      tool: "consultar_meus_chamados",
      status: "ok",
      labels: ["consultou seus chamados"],
    });
    expect(done.trace.metrics.model).toBe("mock-model");

    const types = events.map((e) => e.type);
    expect(types.indexOf("step")).toBeLessThan(types.indexOf("done"));
    expect(types).toContain("text_delta");
  });

  it("forces the decision on the next step when the model skipped it, so no answer goes unexplained", async () => {
    const { done, seenToolChoices, calls } = await runTurn(
      [
        toolCall("c1", "consultar_meus_chamados", { somenteAbertos: true, mostrarLista: false }),
        toolCall("c2", "registrar_decisao", decision),
        reply("Você tem 1 chamado aberto."),
      ],
      "Qual o status do meu chamado?",
    );
    expect(seenToolChoices[0]).toMatchObject({ type: "required" });
    expect(seenToolChoices[1]).toMatchObject({ type: "tool", toolName: "registrar_decisao" });
    expect(seenToolChoices[2]).toMatchObject({ type: "auto" });
    expect(calls).toBe(3);
    expect(done.trace.decisionReported).toBe(true);
  });

  it("answers a plain question in two calls: decision, then the reply", async () => {
    const { done, calls } = await runTurn(
      [
        toolCalls(["registrar_decisao", { ...decision, intencao: "conversa" }]),
        reply("Olá! Como posso ajudar?"),
      ],
      "Oi",
    );
    expect(calls).toBe(2);
    expect(done.trace.actions).toEqual([]);
  });

  it("drafts a ticket through the tool without ever creating it", async () => {
    const { done, h } = await runTurn(
      [
        toolCalls(
          ["registrar_decisao", { ...decision, intencao: "abrir_chamado" }],
          [
            "montar_rascunho_chamado",
            {
              tipo: "INC",
              titulo: "VPN não conecta no notebook, erro 809",
              descricao:
                "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
              categoria: "Rede e VPN",
              impacto: "individual",
              urgencia: "deadline_today",
            },
          ],
        ),
        reply("Montei o rascunho, confira e confirme."),
      ],
      "Meu notebook não conecta na VPN, erro 809, tenho reunião às 14h.",
    );
    expect(done.blocks[0]).toMatchObject({ type: "pending_action" });
    expect(done.trace.actions[0]?.labels).toEqual([
      "verificou duplicidade",
      "classificou a prioridade",
      "consultou o SLA",
      "montou o rascunho",
    ]);
    expect(h.ticketing.tickets.size).toBe(1); // only the seeded ticket
  });

  it("keeps privacy structural: a stranger's ticket looks like a missing one", async () => {
    const { done } = await runTurn(
      [
        toolCalls(["registrar_decisao", decision], ["consultar_chamado", { numero: "INC-99999" }]),
        reply("Não encontrei esse chamado entre os seus."),
      ],
      "Me mostra o INC-99999",
    );
    expect(done.trace.actions[0]?.output).toMatchObject({ found: false });
    expect(done.blocks).toEqual([]);
  });

  it("survives a ticketing outage: records the error and lets the model explain", async () => {
    const h = buildHarness({ tickets: [ticket({ id: "INC-20311" })] });
    await h.conversations.create(
      startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
    );
    h.ticketing.down = true;
    const { model } = scriptedModel([
      toolCalls(
        ["registrar_decisao", decision],
        ["consultar_meus_chamados", { somenteAbertos: true, mostrarLista: false }],
      ),
      reply("O sistema de chamados está fora do ar agora. Quer que eu chame um analista?"),
    ]);
    const adapter = new MastraAgentAdapter({
      model: model as never,
      modelName: "mock-model",
      ids: h.ids,
    });
    const events: AgentEvent[] = [];
    for await (const event of adapter.respond({
      employee: ana,
      conversation: (await h.conversations.findById("c1"))!,
      history: [
        {
          id: "m1",
          conversationId: "c1",
          role: "employee",
          content: "status?",
          blocks: [],
          createdAt: h.clock.now(),
        },
      ],
      now: h.clock.now(),
      toolbox: h.toolboxFor(ana, "c1"),
    })) {
      events.push(event);
    }
    const done = events.find((e) => e.type === "done");
    if (done?.type !== "done") throw new Error("no done");
    expect(done.trace.actions[0]).toMatchObject({
      status: "error",
      error: "TICKETING_UNAVAILABLE",
      labels: ["sistema de chamados indisponível"],
    });
    expect(done.text).toContain("fora do ar");
  });

  it("flags a turn where the model skipped the decision report", async () => {
    const { done } = await runTurn([reply("Oi!")], "oi");
    expect(done.trace.decisionReported).toBe(false);
    expect(done.trace.decision.confidence).toBe(0.5);
  });
});

describe("model selection", () => {
  it("runs the turn on the chosen model and records it in the trace", async () => {
    const h = buildHarness({ tickets: [] });
    await h.conversations.create(
      startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
    );
    const defaultModel = scriptedModel([
      toolCalls(["registrar_decisao", decision]),
      reply("padrão"),
    ]);
    const pickedModel = scriptedModel([
      toolCalls(["registrar_decisao", decision]),
      reply("escolhido"),
    ]);
    const requested: string[] = [];
    const adapter = new MastraAgentAdapter({
      model: defaultModel.model as never,
      modelName: "default-model",
      ids: h.ids,
      forModel: (name) => {
        requested.push(name);
        return pickedModel.model as never;
      },
    });
    const turn = async (model?: string) => {
      let out: AgentEvent | undefined;
      for await (const event of adapter.respond({
        employee: ana,
        conversation: (await h.conversations.findById("c1"))!,
        history: [
          {
            id: "m1",
            conversationId: "c1",
            role: "employee",
            content: "oi",
            blocks: [],
            createdAt: h.clock.now(),
          },
        ],
        now: h.clock.now(),
        ...(model ? { model } : {}),
        toolbox: h.toolboxFor(ana, "c1"),
      })) {
        if (event.type === "done") out = event;
      }
      if (out?.type !== "done") throw new Error("no done");
      return out;
    };

    const picked = await turn("outro-modelo");
    expect(requested).toEqual(["outro-modelo"]);
    expect(picked.text).toBe("escolhido");
    expect(picked.trace.metrics.model).toBe("outro-modelo");
  });
});

describe("provider failures", () => {
  const failingTurn = async (failure: Error) => {
    const h = buildHarness({ tickets: [] });
    await h.conversations.create(
      startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
    );
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw failure;
      },
    });
    const adapter = new MastraAgentAdapter({
      model: model as never,
      modelName: "mock-model",
      ids: h.ids,
      maxRetries: 0,
    });
    const run = async () => {
      for await (const event of adapter.respond({
        employee: ana,
        conversation: (await h.conversations.findById("c1"))!,
        history: [
          {
            id: "m1",
            conversationId: "c1",
            role: "employee",
            content: "oi",
            blocks: [],
            createdAt: h.clock.now(),
          },
        ],
        now: h.clock.now(),
        toolbox: h.toolboxFor(ana, "c1"),
      })) {
        void event;
      }
    };
    return run();
  };

  it("tells a quota failure apart from a generic outage", async () => {
    const quota = Object.assign(new Error("You exceeded your current quota (RESOURCE_EXHAUSTED)"), {
      statusCode: 429,
    });
    await expect(failingTurn(quota)).rejects.toMatchObject({ code: "AGENT_QUOTA_EXCEEDED" });
    await expect(failingTurn(new Error("socket hang up"))).rejects.toMatchObject({
      code: "AGENT_UNAVAILABLE",
    });
  });
});

describe("isQuotaFailure", () => {
  it("recognises quota and rate-limit signals, not ordinary errors", () => {
    expect(isQuotaFailure(Object.assign(new Error("boom"), { statusCode: 429 }))).toBe(true);
    expect(isQuotaFailure(new Error("Quota exceeded for metric ..."))).toBe(true);
    expect(isQuotaFailure("RESOURCE_EXHAUSTED")).toBe(true);
    expect(isQuotaFailure(new Error("Too Many Requests"))).toBe(true);
    expect(isQuotaFailure(new Error("socket hang up"))).toBe(false);
    expect(isQuotaFailure(Object.assign(new Error("bad"), { statusCode: 500 }))).toBe(false);
  });
});

describe("toModelMessages", () => {
  const at = new Date();
  const base = { conversationId: "c", createdAt: at };

  it("maps roles, labels analyst messages and describes UI blocks", () => {
    const messages = toModelMessages([
      { ...base, id: "1", role: "employee", content: "oi", blocks: [] },
      {
        ...base,
        id: "2",
        role: "agent",
        content: "Quem está afetado?",
        blocks: [{ type: "options", question: "q", options: ["Só eu", "Equipe"] }],
      },
      {
        ...base,
        id: "3",
        role: "system",
        content: "Transferida",
        blocks: [],
        systemEvent: "handoff",
      },
      {
        ...base,
        id: "4",
        role: "analyst",
        authorName: "Rafael",
        content: "Verificando",
        blocks: [],
      },
    ]);
    expect(messages).toHaveLength(3);
    expect(messages[1]?.content).toContain("Só eu | Equipe");
    expect(messages[2]).toEqual({
      role: "assistant",
      content: "[Analista Rafael respondeu]: Verificando",
    });
  });

  it("never starts with an assistant turn", () => {
    const messages = toModelMessages([
      { ...base, id: "1", role: "agent", content: "resposta antiga", blocks: [] },
      { ...base, id: "2", role: "employee", content: "pergunta", blocks: [] },
    ]);
    expect(messages).toEqual([{ role: "user", content: "pergunta" }]);
  });
});
