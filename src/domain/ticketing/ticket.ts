import type {
  Category,
  Impact,
  Priority,
  SupportGroup,
  TicketStatus,
  TicketType,
} from "./vocabulary";

export type UpdateAuthorKind = "requester" | "analyst" | "system";
export type UpdateKind = "comment" | "status_change" | "reopened" | "transferred";

export interface TicketUpdate {
  readonly id: string;
  readonly authorKind: UpdateAuthorKind;
  readonly authorName: string;
  readonly kind: UpdateKind;
  readonly note: string;
  readonly createdAt: Date;
}

export interface Ticket {
  /** Human code, e.g. INC-20311. */
  readonly id: string;
  readonly type: TicketType;
  readonly title: string;
  readonly description: string;
  readonly category: Category;
  readonly subcategory?: string;
  readonly priority: Priority;
  readonly status: TicketStatus;
  readonly impact: Impact;
  readonly requesterId: string;
  readonly assignedGroup?: SupportGroup;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt?: Date;
  readonly updates: readonly TicketUpdate[];
}

/** Resolved tickets are the only closed ones: "Aprovado" requests are still open. */
export function isOpen(ticket: Pick<Ticket, "status">): boolean {
  return ticket.status !== "Resolvido";
}

/**
 * SLA clock anchor: the last response from the desk (an analyst), or creation
 * when nobody from the desk has answered yet. Requester comments do not stop
 * the clock, only a human answer does.
 */
export function slaAnchor(ticket: Pick<Ticket, "createdAt" | "updates">): Date {
  let anchor = ticket.createdAt;
  for (const update of ticket.updates) {
    if (update.authorKind === "analyst" && update.createdAt > anchor) anchor = update.createdAt;
  }
  return anchor;
}
