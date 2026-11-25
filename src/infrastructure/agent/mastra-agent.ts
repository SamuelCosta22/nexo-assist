import { Agent } from "@mastra/core/agent";
import type { AgentTrace } from "@/domain/agent/trace";
import type { Message, MessageBlock } from "@/domain/conversation/message";
import { AgentUnavailableError } from "@/application/errors";
import type { AgentEvent, AgentPort, AgentTurn } from "@/application/ports/agent";
import type { IdGenerator } from "@/application/ports/id-generator";
import { buildInstructions } from "./instructions";
import { buildTools, TurnRecorder } from "./tools";

/** A Mastra model id such as "google/gemini-3.5-flash", or a ready model object (tests). */
type ModelConfig = ConstructorParameters<typeof Agent>[0]["model"];

export interface MastraAgentOptions {
  readonly model: ModelConfig;
  /** Human-readable model name recorded in each trace. */
  readonly modelName: string;
  readonly ids: IdGenerator;
}

/** Hard cap on the tool loop: bounds latency and cost per turn. */
const MAX_STEPS = 8;
const MAX_OUTPUT_TOKENS = 900;

const DEFAULT_DECISION = {
  understanding: "(o agent não registrou o entendimento)",
  intent: "conversa",
  confidence: 0.5,
  rationale: "(o agent não registrou a justificativa)",
  rulesApplied: [],
} as const;

/** Short text the model can read about UI elements it already showed. */
function describeBlocks(blocks: readonly MessageBlock[]): string {
  const parts = blocks.map((block) => {
    switch (block.type) {
      case "options":
        return `[mostrou botões de resposta rápida: ${block.options.join(" | ")}]`;
      case "ticket_list":
        return `[mostrou a lista de chamados: ${block.items.map((item) => item.id).join(", ")}]`;
      case "ticket_card":
        return `[mostrou o cartão do chamado ${block.ticket.id}]`;
      case "pending_action":
        return "[mostrou um rascunho para confirmação]";
    }
  });
  return parts.length > 0 ? `\n${parts.join("\n")}` : "";
}

type ChatMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

/**
 * Conversation history as model messages. Analyst messages are labelled so the
 * agent knows a human spoke when the conversation is handed back to it, and
 * the list always starts with a user turn (some providers require it).
 */
export function toModelMessages(history: readonly Message[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const message of history) {
    switch (message.role) {
      case "employee":
        messages.push({ role: "user", content: message.content });
        break;
      case "agent":
        messages.push({
          role: "assistant",
          content: message.content + describeBlocks(message.blocks),
        });
        break;
      case "analyst":
        messages.push({
          role: "assistant",
          content: `[Analista ${message.authorName ?? ""} respondeu]: ${message.content}`,
        });
        break;
      case "system":
        break;
    }
  }
  while (messages[0] && messages[0].role !== "user") messages.shift();
  return messages;
}

function readTokens(usage: unknown): { inputTokens?: number; outputTokens?: number } {
  if (typeof usage !== "object" || usage === null) return {};
  const record = usage as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) if (typeof record[key] === "number") return record[key] as number;
    return undefined;
  };
  const inputTokens = pick("inputTokens", "promptTokens");
  const outputTokens = pick("outputTokens", "completionTokens");
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}

/**
 * Adapter: runs one turn of the Mastra agent and translates its stream into
 * the application's AgentEvents. A fresh Agent is built per turn because both
 * the instructions (employee, clock, pending draft) and the tools (bound to
 * that employee) are turn-specific; construction is cheap.
 */
export class MastraAgentAdapter implements AgentPort {
  constructor(private readonly options: MastraAgentOptions) {}

  async *respond(turn: AgentTurn, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const { model, modelName, ids } = this.options;
    const recorder = new TurnRecorder(ids);
    const started = Date.now();

    const agent = new Agent({
      id: "nexo-assist",
      name: "Nexo Assist",
      instructions: buildInstructions({
        employee: turn.employee,
        now: turn.now,
        pendingAction: turn.pendingAction,
      }),
      model,
      tools: buildTools(turn.toolbox, recorder),
    });

    let stepText = "";
    let finalText = "";
    let usage: { inputTokens?: number; outputTokens?: number } = {};

    try {
      const output = await agent.stream(toModelMessages(turn.history), {
        maxSteps: MAX_STEPS,
        modelSettings: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS },
        // Step 0 is forced to be the decision report: transparency is not optional.
        prepareStep: ({ stepNumber }) =>
          stepNumber === 0
            ? { toolChoice: { type: "tool", toolName: "registrar_decisao" } }
            : { toolChoice: "auto" },
        ...(signal ? { abortSignal: signal } : {}),
      });

      for await (const chunk of output.fullStream) {
        switch (chunk.type) {
          case "step-start":
            stepText = "";
            break;
          case "text-delta":
            stepText += chunk.payload.text;
            yield { type: "text_delta", text: chunk.payload.text };
            break;
          case "step-finish":
            // Only the last step that wrote text is the answer; earlier text is preamble.
            if (stepText.trim()) finalText = stepText;
            break;
          case "finish":
            usage = readTokens(chunk.payload.output.usage);
            break;
          case "error":
            throw new AgentUnavailableError(String(chunk.payload.error));
          default:
            break;
        }
        for (const action of recorder.takeNewActions()) yield { type: "step", action };
      }
    } catch (error) {
      if (error instanceof AgentUnavailableError) throw error;
      throw new AgentUnavailableError(error instanceof Error ? error.message : String(error));
    }

    for (const action of recorder.takeNewActions()) yield { type: "step", action };

    const reported = recorder.decision;
    const trace: AgentTrace = {
      decisionReported: reported !== undefined,
      decision: reported ?? DEFAULT_DECISION,
      actions: recorder.actions,
      metrics: { model: modelName, latencyMs: Date.now() - started, ...usage },
    };
    yield { type: "done", text: finalText, blocks: recorder.blocks, trace };
  }
}
