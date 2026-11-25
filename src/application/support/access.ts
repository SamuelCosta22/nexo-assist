import type { Conversation } from "@/domain/conversation/conversation";
import type { User } from "@/domain/identity/user";
import type { Ticket } from "@/domain/ticketing/ticket";
import { ForbiddenError } from "../errors";

/**
 * Single place where the privacy rule lives (Anexo A: "informações de um
 * chamado só podem ser passadas a quem o abriu"). Analysts work every queue;
 * employees see only what is theirs.
 */
export function assertCanViewTicket(actor: User, ticket: Ticket): void {
  if (actor.role === "analyst") return;
  if (ticket.requesterId !== actor.id) throw new ForbiddenError("Chamado não pertence a você.");
}

export function assertCanViewConversation(actor: User, conversation: Conversation): void {
  if (actor.role === "analyst") return;
  if (conversation.employeeId !== actor.id)
    throw new ForbiddenError("Conversa não pertence a você.");
}

export function assertIsAnalyst(actor: User): void {
  if (actor.role !== "analyst") throw new ForbiddenError("Apenas analistas acessam o console.");
}

export function assertIsEmployee(actor: User): void {
  if (actor.role !== "employee") throw new ForbiddenError("Apenas funcionários usam o chat.");
}
