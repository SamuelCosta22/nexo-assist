import { and, desc, eq, inArray } from "drizzle-orm";
import type { PendingAction } from "@/domain/conversation/pending-action";
import type { PendingActionRepository } from "@/application/ports/repositories";
import type { Database } from "../database";
import { pendingActions } from "../schema";

function toAction(row: typeof pendingActions.$inferSelect): PendingAction {
  return {
    id: row.id,
    conversationId: row.conversationId,
    employeeId: row.employeeId,
    payload: row.payload,
    status: row.status,
    ...(row.resultTicketId ? { resultTicketId: row.resultTicketId } : {}),
    createdAt: row.createdAt,
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
  };
}

export class DrizzlePendingActionRepository implements PendingActionRepository {
  constructor(private readonly db: Database) {}

  async save(action: PendingAction) {
    const values = {
      id: action.id,
      conversationId: action.conversationId,
      employeeId: action.employeeId,
      payload: action.payload,
      status: action.status,
      resultTicketId: action.resultTicketId ?? null,
      createdAt: action.createdAt,
      resolvedAt: action.resolvedAt ?? null,
    };
    await this.db
      .insert(pendingActions)
      .values(values)
      .onConflictDoUpdate({ target: pendingActions.id, set: values });
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(pendingActions)
      .where(eq(pendingActions.id, id))
      .limit(1);
    return row ? toAction(row) : undefined;
  }

  async findPendingByConversation(conversationId: string) {
    const [row] = await this.db
      .select()
      .from(pendingActions)
      .where(
        and(
          eq(pendingActions.conversationId, conversationId),
          eq(pendingActions.status, "pending"),
        ),
      )
      .orderBy(desc(pendingActions.createdAt))
      .limit(1);
    return row ? toAction(row) : undefined;
  }

  async findManyByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(pendingActions)
      .where(inArray(pendingActions.id, [...ids]));
    return rows.map(toAction);
  }
}
