import { DomainError } from "../shared/domain-error";
import { err, ok, type Result } from "../shared/result";
import { decidePriority } from "./priority-policy";
import { SlaPolicy } from "./sla-policy";
import {
  CATEGORIES,
  IMPACTS,
  TICKET_TYPES,
  URGENCIES,
  type Category,
  type Impact,
  type Priority,
  type TicketType,
  type Urgency,
} from "./vocabulary";

export class InvalidDraftError extends DomainError {
  readonly code = "INVALID_DRAFT";
  constructor(readonly problems: readonly string[]) {
    super(`Rascunho inválido: ${problems.join("; ")}`);
  }
}

/** Everything an opened ticket needs (Anexo A: "Abertura"). */
export interface TicketDraft {
  readonly type: TicketType;
  readonly title: string;
  readonly description: string;
  readonly category: Category;
  readonly subcategory?: string;
  readonly impact: Impact;
  readonly urgency: Urgency;
  readonly priority: Priority;
  readonly priorityRationale: string;
  readonly slaLabel: string;
}

export interface TicketDraftInput {
  readonly type: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly subcategory?: string | undefined;
  readonly impact: string;
  readonly urgency: string;
}

const MIN_TITLE = 8;
const MAX_TITLE = 120;
const MIN_DESCRIPTION = 20;

const oneOf = <T extends string>(options: readonly T[], value: string): value is T =>
  (options as readonly string[]).includes(value);

/**
 * Builds a draft, computing the priority from impact x urgency: the caller
 * (the LLM, or the user editing the card) never chooses it directly. The
 * payload is plain JSON-safe data; deadlines are derived when presenting.
 */
export function createTicketDraft(
  input: TicketDraftInput,
  sla: SlaPolicy = new SlaPolicy(),
): Result<TicketDraft, InvalidDraftError> {
  const problems: string[] = [];
  const title = input.title.trim();
  const description = input.description.trim();

  if (!oneOf(TICKET_TYPES, input.type)) problems.push(`tipo deve ser ${TICKET_TYPES.join(" ou ")}`);
  if (!oneOf(CATEGORIES, input.category))
    problems.push(`categoria deve ser uma de: ${CATEGORIES.join(", ")}`);
  if (!oneOf(IMPACTS, input.impact)) problems.push("afetados inválido");
  if (!oneOf(URGENCIES, input.urgency)) problems.push("urgência inválida");
  if (title.length < MIN_TITLE || title.length > MAX_TITLE) {
    problems.push(`título deve ter entre ${MIN_TITLE} e ${MAX_TITLE} caracteres`);
  }
  if (description.length < MIN_DESCRIPTION) {
    problems.push(`descrição deve ter ao menos ${MIN_DESCRIPTION} caracteres`);
  }
  if (
    problems.length > 0 ||
    !oneOf(TICKET_TYPES, input.type) ||
    !oneOf(CATEGORIES, input.category) ||
    !oneOf(IMPACTS, input.impact) ||
    !oneOf(URGENCIES, input.urgency)
  ) {
    return err(new InvalidDraftError(problems));
  }

  const decision = decidePriority(input.impact, input.urgency);
  const subcategory = input.subcategory?.trim();
  return ok({
    type: input.type,
    title,
    description,
    category: input.category,
    ...(subcategory ? { subcategory } : {}),
    impact: input.impact,
    urgency: input.urgency,
    priority: decision.priority,
    priorityRationale: decision.rationale,
    slaLabel: sla.label(decision.priority),
  });
}
