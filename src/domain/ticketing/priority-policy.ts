import type { Impact, Priority, Urgency } from "./vocabulary";

export interface PriorityDecision {
  readonly priority: Priority;
  /** Human-readable reason; surfaced in the agent's decision trace. */
  readonly rationale: string;
}

/**
 * Priority = impact x urgency (Anexo A). The matrix is explicit so that the
 * same inputs always give the same answer, whatever the LLM "feels".
 *
 *                 individual   team      company
 *  blocking       Alta         Crítica   Crítica
 *  deadline_today Alta         Alta      Crítica
 *  workaround     Média        Média     Alta
 *  none           Baixa        Baixa     Média
 *
 * `unknown` impact is handled as `individual`: the safe, non-escalating default
 * (the agent is expected to ask who is affected before drafting).
 */
const MATRIX: Record<Urgency, Record<Exclude<Impact, "unknown">, Priority>> = {
  blocking: { individual: "Alta", team: "Crítica", company: "Crítica" },
  deadline_today: { individual: "Alta", team: "Alta", company: "Crítica" },
  workaround: { individual: "Média", team: "Média", company: "Alta" },
  none: { individual: "Baixa", team: "Baixa", company: "Média" },
};

const IMPACT_TEXT: Record<Impact, string> = {
  individual: "afeta apenas uma pessoa",
  team: "afeta uma equipe",
  company: "afeta a empresa toda",
  unknown: "o alcance é desconhecido (tratado como individual)",
};

const URGENCY_TEXT: Record<Urgency, string> = {
  blocking: "impede o trabalho",
  deadline_today: "há um compromisso no mesmo dia em risco",
  workaround: "atrapalha, mas existe alternativa",
  none: "é um pedido sem urgência",
};

export function decidePriority(impact: Impact, urgency: Urgency): PriorityDecision {
  const effective = impact === "unknown" ? "individual" : impact;
  const priority = MATRIX[urgency][effective];
  return {
    priority,
    rationale: `${priority}: ${IMPACT_TEXT[impact]} e ${URGENCY_TEXT[urgency]}.`,
  };
}
