import { asc, desc, eq } from "drizzle-orm";
import type { Message } from "@/domain/conversation/message";
import type { MessageRepository } from "@/application/ports/repositories";
import type { Database } from "../database";
import { messages } from "../schema";

export function toMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    ...(row.authorId ? { authorId: row.authorId } : {}),
    ...(row.authorName ? { authorName: row.authorName } : {}),
    ...(row.authorBadge ? { authorBadge: row.authorBadge } : {}),
    content: row.content,
    blocks: row.blocks,
    ...(row.systemEvent ? { systemEvent: row.systemEvent } : {}),
    ...(row.trace ? { trace: row.trace } : {}),
    createdAt: row.createdAt,
  };
}

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: Database) {}

  async append(message: Message) {
    await this.db.insert(messages).values({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      authorId: message.authorId ?? null,
      authorName: message.authorName ?? null,
      authorBadge: message.authorBadge ?? null,
      content: message.content,
      blocks: [...message.blocks],
      systemEvent: message.systemEvent ?? null,
      trace: message.trace ?? null,
      createdAt: message.createdAt,
    });
  }

  async list(conversationId: string) {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.seq));
    return rows.map(toMessage);
  }

  async listRecent(conversationId: string, limit: number) {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.seq))
      .limit(limit);
    return rows.reverse().map(toMessage);
  }
}
