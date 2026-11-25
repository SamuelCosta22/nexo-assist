import type { Article } from "@/domain/helpdesk/article";
import type { User } from "@/domain/identity/user";
import type { Conversation, ConversationStatus } from "@/domain/conversation/conversation";
import type { Message } from "@/domain/conversation/message";
import type { PendingAction } from "@/domain/conversation/pending-action";

export interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  findManyByIds(ids: readonly string[]): Promise<User[]>;
}

export interface HelpdeskRepository {
  listArticles(): Promise<Article[]>;
}

/** Read model for lists: a conversation with who wrote it and what was said last. */
export interface ConversationSummary {
  readonly conversation: Conversation;
  readonly employee: User;
  readonly lastMessage?: Message;
}

export interface ConversationFilter {
  readonly employeeId?: string;
  readonly statuses?: readonly ConversationStatus[];
}

export interface ConversationRepository {
  create(conversation: Conversation): Promise<void>;
  findById(id: string): Promise<Conversation | undefined>;
  /**
   * Compare-and-set: persists `next` only if the stored row still equals
   * `previous` (same status and updatedAt); otherwise throws ConcurrencyError.
   * This is what stops two analysts from assuming the same conversation.
   */
  save(next: Conversation, previous: Conversation): Promise<void>;
  listSummaries(filter: ConversationFilter): Promise<ConversationSummary[]>;
}

export interface MessageRepository {
  append(message: Message): Promise<void>;
  /** Oldest first. */
  list(conversationId: string): Promise<Message[]>;
  /** The latest `limit` messages, oldest first. */
  listRecent(conversationId: string, limit: number): Promise<Message[]>;
}

export interface PendingActionRepository {
  save(action: PendingAction): Promise<void>;
  findById(id: string): Promise<PendingAction | undefined>;
  findPendingByConversation(conversationId: string): Promise<PendingAction | undefined>;
  findManyByIds(ids: readonly string[]): Promise<PendingAction[]>;
}

/** Usage counters behind the cost/abuse guard. */
export interface UsageRepository {
  /** Messages the employee wrote since `since`, in any conversation. */
  countEmployeeMessagesSince(employeeId: string, since: Date): Promise<number>;
}
