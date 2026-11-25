import type { Ticket } from "@/domain/ticketing/ticket";
import type { TicketDraft } from "@/domain/ticketing/ticket-draft";
import type { SupportGroup, TicketStatus } from "@/domain/ticketing/vocabulary";

/**
 * Port to the (legacy, occasionally unavailable) ticketing system.
 * Every method may reject with TicketingUnavailableError.
 *
 * The gateway is deliberately dumb: it does NOT know who is asking. Ownership
 * and role checks live in the use cases, in one place, so that the privacy
 * rule cannot be forgotten by a single adapter.
 */
export interface TicketingGateway {
  listByRequester(requesterId: string): Promise<Ticket[]>;
  findById(ticketId: string): Promise<Ticket | undefined>;
  create(input: {
    requesterId: string;
    requesterName: string;
    draft: TicketDraft;
  }): Promise<Ticket>;
  addRequesterUpdate(
    ticketId: string,
    input: { authorName: string; note: string },
  ): Promise<Ticket>;
  reopen(ticketId: string, input: { authorName: string; note: string }): Promise<Ticket>;
  /** An analyst answered: records it (restarting the SLA clock) and may move the status. */
  addAnalystUpdate(
    ticketId: string,
    input: { authorName: string; note: string; status?: TicketStatus },
  ): Promise<Ticket>;
  transfer(ticketId: string, input: { group: SupportGroup; reason: string }): Promise<Ticket>;
}
