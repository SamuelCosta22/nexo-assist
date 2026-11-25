import type { Conversation } from "@/domain/conversation/conversation";
import type { User } from "@/domain/identity/user";
import { NotFoundError } from "../errors";
import type { ConversationRepository } from "../ports/repositories";
import { assertCanViewConversation } from "./access";

/** Loads a conversation and enforces that the actor may see it. */
export async function loadAuthorizedConversation(
  repository: ConversationRepository,
  actor: User,
  conversationId: string,
): Promise<Conversation> {
  const conversation = await repository.findById(conversationId);
  if (!conversation) throw new NotFoundError("Conversa não encontrada.");
  assertCanViewConversation(actor, conversation);
  return conversation;
}
