import { and, eq, inArray, desc } from "drizzle-orm";
import type { Conversation, Handoff } from "@/domain/conversation/conversation";
import { ConcurrencyError } from "@/application/errors";
import type {
  ConversationFilter,
  ConversationRepository,
  ConversationSummary,
} from "@/application/ports/repositories";
import type { Database } from "../database";
import { conversations, messages, users, type HandoffRow } from "../schema";
import { toMessage } from "./message-repository";
import { toUser } from "./user-repository";

const toHandoffRow = (handoff: Handoff): HandoffRow => ({
  reason: handoff.reason,
  summary: handoff.summary,
  targetGroup: handoff.targetGroup,
  requestedAt: handoff.requestedAt.toISOString(),
  ...(handoff.ticketId ? { ticketId: handoff.ticketId } : {}),
  ...(handoff.confidence !== undefined ? { confidence: handoff.confidence } : {}),
});

const fromHandoffRow = (row: HandoffRow): Handoff => ({
  reason: row.reason,
  summary: row.summary,
  targetGroup: row.targetGroup,
  requestedAt: new Date(row.requestedAt),
  ...(row.ticketId ? { ticketId: row.ticketId } : {}),
  ...(row.confidence !== undefined ? { confidence: row.confidence } : {}),
});

function toConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    employeeId: row.employeeId,
    title: row.title,
    status: row.status,
    ...(row.assignedAnalystId ? { assignedAnalystId: row.assignedAnalystId } : {}),
    ...(row.handoff ? { handoff: fromHandoffRow(row.handoff) } : {}),
    employeeMessageCount: row.employeeMessageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(conversation: Conversation) {
  return {
    id: conversation.id,
    employeeId: conversation.employeeId,
    title: conversation.title,
    status: conversation.status,
    assignedAnalystId: conversation.assignedAnalystId ?? null,
    handoff: conversation.handoff ? toHandoffRow(conversation.handoff) : null,
    employeeMessageCount: conversation.employeeMessageCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: Database) {}

  async create(conversation: Conversation) {
    await this.db.insert(conversations).values(toValues(conversation));
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return row ? toConversation(row) : undefined;
  }

  async save(next: Conversation, previous: Conversation) {
    const updated = await this.db
      .update(conversations)
      .set({
        title: next.title,
        status: next.status,
        assignedAnalystId: next.assignedAnalystId ?? null,
        handoff: next.handoff ? toHandoffRow(next.handoff) : null,
        employeeMessageCount: next.employeeMessageCount,
        updatedAt: next.updatedAt,
      })
      .where(
        and(
          eq(conversations.id, previous.id),
          eq(conversations.status, previous.status),
          eq(conversations.updatedAt, previous.updatedAt),
        ),
      )
      .returning({ id: conversations.id });
    if (updated.length === 0) throw new ConcurrencyError();
  }

  async listSummaries(filter: ConversationFilter): Promise<ConversationSummary[]> {
    const conditions = [
      filter.employeeId ? eq(conversations.employeeId, filter.employeeId) : undefined,
      filter.statuses ? inArray(conversations.status, [...filter.statuses]) : undefined,
    ].filter((condition) => condition !== undefined);

    const rows = await this.db
      .select({ conversation: conversations, employee: users })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.employeeId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(conversations.updatedAt));
    if (rows.length === 0) return [];

    // Latest message of each conversation in one query (DISTINCT ON).
    const latest = await this.db
      .selectDistinctOn([messages.conversationId])
      .from(messages)
      .where(
        inArray(
          messages.conversationId,
          rows.map((row) => row.conversation.id),
        ),
      )
      .orderBy(messages.conversationId, desc(messages.seq));
    const lastByConversation = new Map(latest.map((row) => [row.conversationId, toMessage(row)]));

    return rows.map((row) => {
      const lastMessage = lastByConversation.get(row.conversation.id);
      return {
        conversation: toConversation(row.conversation),
        employee: toUser(row.employee),
        ...(lastMessage ? { lastMessage } : {}),
      };
    });
  }
}
