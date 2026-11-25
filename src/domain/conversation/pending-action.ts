import { DomainError } from "../shared/domain-error";
import { err, ok, type Result } from "../shared/result";
import {
  createTicketDraft,
  type InvalidDraftError,
  type TicketDraft,
} from "../ticketing/ticket-draft";
import type { Category, Impact } from "../ticketing/vocabulary";

/**
 * Anexo A: the agent only creates or updates a ticket after the employee
 * confirms. A pending action is that "draft awaiting confirmation".
 */
export type PendingPayload =
  | { readonly kind: "create_ticket"; readonly draft: TicketDraft }
  | { readonly kind: "update_ticket"; readonly ticketId: string; readonly note: string }
  | { readonly kind: "reopen_ticket"; readonly ticketId: string; readonly note: string };

export type PendingStatus = "pending" | "confirmed" | "cancelled" | "superseded";

export interface PendingAction {
  readonly id: string;
  readonly conversationId: string;
  readonly employeeId: string;
  readonly payload: PendingPayload;
  readonly status: PendingStatus;
  /** Set once confirmed: the ticket that was created, updated or reopened. */
  readonly resultTicketId?: string;
  readonly createdAt: Date;
  readonly resolvedAt?: Date;
}

export class ActionNotPendingError extends DomainError {
  readonly code = "ACTION_NOT_PENDING";
  constructor() {
    super("Este rascunho já foi confirmado, cancelado ou substituído.");
  }
}

export function confirmAction(
  action: PendingAction,
  resultTicketId: string,
  now: Date,
): Result<PendingAction, ActionNotPendingError> {
  if (action.status !== "pending") return err(new ActionNotPendingError());
  return ok({ ...action, status: "confirmed", resultTicketId, resolvedAt: now });
}

export function cancelAction(
  action: PendingAction,
  now: Date,
): Result<PendingAction, ActionNotPendingError> {
  if (action.status !== "pending") return err(new ActionNotPendingError());
  return ok({ ...action, status: "cancelled", resolvedAt: now });
}

export function supersedeAction(action: PendingAction, now: Date): PendingAction {
  return action.status === "pending"
    ? { ...action, status: "superseded", resolvedAt: now }
    : action;
}

export interface DraftEdits {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly category?: Category | undefined;
  readonly impact?: Impact | undefined;
}

/**
 * "Editar" on the draft card. Priority is recomputed from the (possibly
 * changed) impact, so an edit can never smuggle in an arbitrary priority.
 */
export function editDraft(
  action: PendingAction,
  edits: DraftEdits,
): Result<PendingAction, ActionNotPendingError | InvalidDraftError | InvalidEditError> {
  if (action.status !== "pending") return err(new ActionNotPendingError());
  if (action.payload.kind !== "create_ticket") {
    return err(new InvalidEditError());
  }
  const current = action.payload.draft;
  const rebuilt = createTicketDraft({
    type: current.type,
    title: edits.title ?? current.title,
    description: edits.description ?? current.description,
    category: edits.category ?? current.category,
    subcategory: current.subcategory,
    impact: edits.impact ?? current.impact,
    urgency: current.urgency,
  });
  if (!rebuilt.ok) return rebuilt;
  return ok({ ...action, payload: { kind: "create_ticket", draft: rebuilt.value } });
}

export class InvalidEditError extends DomainError {
  readonly code = "INVALID_EDIT";
  constructor() {
    super("Só rascunhos de novo chamado podem ser editados.");
  }
}
