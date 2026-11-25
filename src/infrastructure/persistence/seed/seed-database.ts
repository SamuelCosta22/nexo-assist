import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../database";
import {
  conversations,
  helpdeskArticles,
  messages,
  ticketingSequences,
  ticketingTickets,
  ticketingUpdates,
  users,
} from "../schema";
import {
  ANALYSTS,
  ARTICLES,
  EMPLOYEES,
  TICKET_SEQUENCES,
  buildConversations,
  buildTickets,
} from "./seed-data";

/**
 * Idempotent: people, articles and tickets are refreshed (ticket dates are
 * re-anchored to `now`, so "overdue" stays true); seeded conversations are
 * inserted once and then left alone, so anything done in the demo is kept.
 */
export async function seedDatabase(db: Database, now: Date = new Date()): Promise<void> {
  for (const employee of EMPLOYEES) {
    const row = { ...employee, role: "employee" as const, supportLevel: null };
    await db.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
  }
  for (const analyst of ANALYSTS) {
    const row = { ...analyst, role: "analyst" as const, department: "Service Desk" };
    await db.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
  }

  for (const article of ARTICLES) {
    const row = { ...article, tags: [...article.tags] };
    await db
      .insert(helpdeskArticles)
      .values(row)
      .onConflictDoUpdate({ target: helpdeskArticles.id, set: row });
  }

  const tickets = buildTickets(now);
  for (const { updates, ...ticket } of tickets) {
    const row = {
      ...ticket,
      subcategory: ticket.subcategory ?? null,
      assignedGroup: ticket.assignedGroup ?? null,
      resolvedAt: ticket.resolvedAt ?? null,
    };
    await db
      .insert(ticketingTickets)
      .values(row)
      .onConflictDoUpdate({ target: ticketingTickets.id, set: row });
    await db.delete(ticketingUpdates).where(eq(ticketingUpdates.ticketId, ticket.id));
    if (updates.length > 0) {
      await db
        .insert(ticketingUpdates)
        .values(updates.map((update) => ({ ...update, ticketId: ticket.id })));
    }
  }

  for (const sequence of TICKET_SEQUENCES) {
    // Never move a sequence backwards: tickets created in the demo keep their codes.
    await db
      .insert(ticketingSequences)
      .values(sequence)
      .onConflictDoUpdate({
        target: ticketingSequences.name,
        set: { value: sql`GREATEST(${ticketingSequences.value}, ${sequence.value})` },
      });
  }

  const seeded = buildConversations(now);
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      inArray(
        conversations.id,
        seeded.map((c) => c.id),
      ),
    );
  const already = new Set(existing.map((row) => row.id));

  for (const { messages: seedMessages, ...conversation } of seeded) {
    if (already.has(conversation.id)) continue;
    await db.insert(conversations).values({
      ...conversation,
      assignedAnalystId: null,
      handoff: conversation.handoff ?? null,
    });
    for (const message of seedMessages) {
      await db.insert(messages).values({
        id: message.id,
        conversationId: conversation.id,
        role: message.role,
        authorName: message.authorName ?? null,
        content: message.content,
        blocks: message.blocks ?? [],
        systemEvent: message.systemEvent ?? null,
        trace: message.trace ?? null,
        createdAt: message.at,
      });
    }
  }
}
