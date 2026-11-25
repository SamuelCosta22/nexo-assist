/**
 * Decision trace: the structured answer to "what did the agent understand,
 * what did it do and why?". Persisted with every agent message and rendered in
 * the UI (summary chips + detail panel) and in the analyst console.
 */
export const AGENT_INTENTS = [
  "duvida",
  "consultar_chamado",
  "abrir_chamado",
  "atualizar_chamado",
  "falar_com_analista",
  "fora_de_escopo",
  "conversa",
] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];

export interface TraceAction {
  readonly id: string;
  /** Technical identifier of the tool, e.g. "consultar_meus_chamados". */
  readonly tool: string;
  /** Short human label shown in the chip, e.g. "consultou seus chamados". */
  readonly label: string;
  readonly status: "ok" | "error";
  /** Sanitised summary of what was asked (never secrets). */
  readonly input: unknown;
  /** Sanitised summary of what came back. */
  readonly output: unknown;
  readonly durationMs: number;
  readonly error?: string;
}

export interface AgentDecision {
  readonly understanding: string;
  readonly intent: AgentIntent;
  /** Self-assessed confidence, 0 to 1. Below the threshold the agent hands off. */
  readonly confidence: number;
  readonly rationale: string;
  readonly rulesApplied: readonly string[];
}

export interface TraceMetrics {
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface AgentTrace {
  /** False when the model skipped the mandatory decision report. */
  readonly decisionReported: boolean;
  readonly decision: AgentDecision;
  readonly actions: readonly TraceAction[];
  readonly metrics: TraceMetrics;
}

/** Below this self-assessed confidence the agent must involve a human. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}
