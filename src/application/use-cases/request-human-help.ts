import type { Conversation, InvalidTransitionError } from "@/domain/conversation/conversation";
import type { User } from "@/domain/identity/user";
import type { Result } from "@/domain/shared/result";
import type { MessageRepository, ConversationRepository } from "../ports/repositories";
import { assertIsEmployee } from "../support/access";
import { loadAuthorizedConversation } from "../support/conversation-guard";
import type { HandoffService } from "../support/handoff-service";

const RECENT_MESSAGES = 8;
const QUOTED_MESSAGES = 3;

/**
 * "Falar com um analista" without going through the model. It exists for the
 * moment the agent cannot answer (outage, quota): the employee is never stuck
 * with a broken assistant. The summary is built from the employee's own words.
 */
export class RequestHumanHelp {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly handoff: HandoffService,
  ) {}

  async execute(
    actor: User,
    conversationId: string,
  ): Promise<Result<Conversation, InvalidTransitionError>> {
    assertIsEmployee(actor);
    const conversation = await loadAuthorizedConversation(
      this.conversations,
      actor,
      conversationId,
    );
    const recent = await this.messages.listRecent(conversation.id, RECENT_MESSAGES);
    const said = recent
      .filter((message) => message.role === "employee")
      .slice(-QUOTED_MESSAGES)
      .map((message) => `"${message.content}"`)
      .join("; ");
    return this.handoff.handOff(conversation, {
      reason: "user_request",
      summary: `${actor.name} pediu um analista (o assistente estava indisponível). Últimas mensagens: ${said || "(nenhuma)"}`,
    });
  }
}
