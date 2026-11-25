import type { TicketSnapshot, TicketSummary } from "@/domain/conversation/message";
import { slaAnchor, type Ticket } from "@/domain/ticketing/ticket";
import type { SlaPolicy } from "@/domain/ticketing/sla-policy";

/**
 * Turns a ticket into the read-only picture stored in messages: the card the
 * employee sees keeps showing what was true when it was written, and carries
 * the SLA verdict (deadline, overdue) computed by the domain.
 */
export function toSnapshot(ticket: Ticket, sla: SlaPolicy, now: Date): TicketSnapshot {
  const evaluation = sla.evaluate(
    { priority: ticket.priority, status: ticket.status, slaAnchorAt: slaAnchor(ticket) },
    now,
  );
  return {
    id: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    ...(ticket.subcategory ? { subcategory: ticket.subcategory } : {}),
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    lastUpdateAt: ticket.updatedAt.toISOString(),
    dueAt: evaluation.dueAt.toISOString(),
    slaLabel: evaluation.targetLabel,
    overdue: evaluation.overdue,
  };
}

export function toSummary(ticket: Ticket): TicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    lastUpdateAt: ticket.updatedAt.toISOString(),
  };
}
