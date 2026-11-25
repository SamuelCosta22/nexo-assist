import {
  requestHandoff,
  type Conversation,
  type HandoffRequest,
} from "@/domain/conversation/conversation";
import { err, ok, type Result } from "@/domain/shared/result";
import type { InvalidTransitionError } from "@/domain/conversation/conversation";
import { TicketingUnavailableError } from "../errors";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ConversationRepository, MessageRepository } from "../ports/repositories";
import type { TicketingGateway } from "../ports/ticketing-gateway";
import { systemMessage } from "./messages";

/**
 * Transfers a conversation to a human. Used by every path that can trigger a
 * transfer (employee request, critical ticket, overdue ticket, low confidence),
 * so the rule "the agent goes silent and the analyst gets a summary" is
 * implemented exactly once.
 */
export class HandoffService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly ticketing: TicketingGateway,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async handOff(
    conversation: Conversation,
    request: HandoffRequest,
  ): Promise<Result<Conversation, InvalidTransitionError>> {
    const now = this.clock.now();
    const next = requestHandoff(conversation, request, now);
    if (!next.ok) return err(next.error);

    await this.conversations.save(next.value, conversation);
    await this.messages.append(
      systemMessage(
        { id: this.ids.next(), conversationId: conversation.id, createdAt: now },
        "handoff",
        `Transferida para ${next.value.handoff?.targetGroup ?? "um analista"}`,
      ),
    );

    // The ticket follows the conversation. If the legacy system is down the
    // human handoff must still happen: the person matters more than the field.
    if (request.ticketId && next.value.handoff) {
      try {
        await this.ticketing.transfer(request.ticketId, {
          group: next.value.handoff.targetGroup,
          reason: request.summary,
        });
      } catch (error) {
        if (!(error instanceof TicketingUnavailableError)) throw error;
      }
    }
    return ok(next.value);
  }
}
