import { startConversation, type Conversation } from "@/domain/conversation/conversation";
import type { Message } from "@/domain/conversation/message";
import type { User } from "@/domain/identity/user";
import type { SlaPolicy } from "@/domain/ticketing/sla-policy";
import { NotFoundError } from "../errors";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type {
  ConversationRepository,
  ConversationSummary,
  MessageRepository,
  PendingActionRepository,
  UserRepository,
} from "../ports/repositories";
import { assertIsEmployee } from "../support/access";
import { loadAuthorizedConversation } from "../support/conversation-guard";
import { toPendingActionView, type PendingActionView } from "../support/pending-action-view";

export class StartConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(actor: User): Promise<Conversation> {
    assertIsEmployee(actor);
    const conversation = startConversation({
      id: this.ids.next(),
      employeeId: actor.id,
      now: this.clock.now(),
    });
    await this.conversations.create(conversation);
    return conversation;
  }
}

export class ListMyConversations {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(actor: User): Promise<ConversationSummary[]> {
    assertIsEmployee(actor);
    const summaries = await this.conversations.listSummaries({ employeeId: actor.id });
    return summaries.sort(
      (a, b) => b.conversation.updatedAt.getTime() - a.conversation.updatedAt.getTime(),
    );
  }
}

export interface ConversationView {
  readonly conversation: Conversation;
  readonly employee: User;
  readonly messages: readonly Message[];
  readonly pendingActions: readonly PendingActionView[];
  /** The analyst currently handling it, if any. */
  readonly analyst?: User;
}

/** Everything a screen needs to render a conversation, for its owner or any analyst. */
export class GetConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly pendingActions: PendingActionRepository,
    private readonly users: UserRepository,
    private readonly sla: SlaPolicy,
  ) {}

  async execute(actor: User, conversationId: string): Promise<ConversationView> {
    const conversation = await loadAuthorizedConversation(
      this.conversations,
      actor,
      conversationId,
    );
    const [messages, employee, analysts] = await Promise.all([
      this.messages.list(conversation.id),
      this.users.findById(conversation.employeeId),
      conversation.assignedAnalystId
        ? this.users.findManyByIds([conversation.assignedAnalystId])
        : Promise.resolve([]),
    ]);
    if (!employee) throw new NotFoundError("Funcionário não encontrado.");

    const actionIds = messages.flatMap((message) =>
      message.blocks.flatMap((block) => (block.type === "pending_action" ? [block.actionId] : [])),
    );
    const actions = await this.pendingActions.findManyByIds(actionIds);
    const analyst = analysts[0];
    return {
      conversation,
      employee,
      messages,
      pendingActions: actions.map((action) => toPendingActionView(action, this.sla)),
      ...(analyst ? { analyst } : {}),
    };
  }
}
