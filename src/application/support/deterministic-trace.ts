import type { AgentIntent, AgentTrace, TraceAction } from "@/domain/agent/trace";
import type { IdGenerator } from "../ports/id-generator";

export const DETERMINISTIC_MODEL = "regras determinísticas (sem LLM)";

interface DeterministicStep {
  readonly tool: string;
  readonly label: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly status?: "ok" | "error";
  readonly error?: string;
}

/**
 * Some replies are produced by code, not by the model (confirming a draft,
 * automatic handoffs). They still get a trace, so "why did it do that?" has an
 * answer for every message in the conversation.
 */
export function deterministicTrace(
  ids: IdGenerator,
  input: {
    understanding: string;
    intent: AgentIntent;
    rationale: string;
    rulesApplied: readonly string[];
    steps: readonly DeterministicStep[];
    latencyMs: number;
    confidence?: number;
  },
): AgentTrace {
  const actions: TraceAction[] = input.steps.map((step) => ({
    id: ids.next(),
    tool: step.tool,
    labels: [step.label],
    status: step.status ?? "ok",
    input: step.input,
    output: step.output,
    durationMs: 0,
    ...(step.error ? { error: step.error } : {}),
  }));
  return {
    decisionReported: true,
    decision: {
      understanding: input.understanding,
      intent: input.intent,
      confidence: input.confidence ?? 1,
      rationale: input.rationale,
      rulesApplied: input.rulesApplied,
    },
    actions,
    metrics: { model: DETERMINISTIC_MODEL, latencyMs: input.latencyMs },
  };
}
