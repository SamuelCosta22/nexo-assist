import { similarity } from "../shared/text";
import { isOpen, type Ticket } from "./ticket";
import type { Category } from "./vocabulary";

/** Resolved tickets can be reopened for up to 7 days (Anexo A). */
export const REOPEN_WINDOW_DAYS = 7;
/** Token overlap above which two tickets are considered the same problem. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.5;

export type ExistingTicketAction = "update" | "reopen" | "create_new";

/**
 * What to do when a ticket about the same problem already exists:
 *  - open            -> update it, never duplicate
 *  - resolved <= 7d  -> reopen it
 *  - resolved  > 7d  -> a new ticket is the right call
 */
export function decideOnExistingTicket(ticket: Ticket, now: Date): ExistingTicketAction {
  if (isOpen(ticket)) return "update";
  const resolvedAt = ticket.resolvedAt ?? ticket.updatedAt;
  const ageMs = now.getTime() - resolvedAt.getTime();
  return ageMs <= REOPEN_WINDOW_DAYS * 86_400_000 ? "reopen" : "create_new";
}

export interface DuplicateCandidate {
  readonly title: string;
  readonly category: Category;
}

/**
 * Deterministic safety net behind the agent's own judgement: finds the open
 * (or recently resolved) ticket that most resembles a draft, so that a missed
 * duplicate is still caught by code and not only by the prompt.
 */
export function findLikelyDuplicate(
  candidate: DuplicateCandidate,
  tickets: readonly Ticket[],
  now: Date,
): Ticket | undefined {
  let best: { ticket: Ticket; score: number } | undefined;
  for (const ticket of tickets) {
    if (ticket.category !== candidate.category) continue;
    if (decideOnExistingTicket(ticket, now) === "create_new") continue;
    const score = similarity(candidate.title, `${ticket.title} ${ticket.description}`);
    const titleScore = similarity(candidate.title, ticket.title);
    const effective = Math.max(score, titleScore);
    if (effective >= DUPLICATE_SIMILARITY_THRESHOLD && (!best || effective > best.score)) {
      best = { ticket, score: effective };
    }
  }
  return best?.ticket;
}
