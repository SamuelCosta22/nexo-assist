import { relations } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AgentTrace } from "@/domain/agent/trace";
import type { MessageBlock } from "@/domain/conversation/message";
import type { PendingPayload } from "@/domain/conversation/pending-action";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ------------------------------ identity ------------------------------ */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["employee", "analyst"] }).notNull(),
    department: text("department"),
    supportLevel: text("support_level", { enum: ["Suporte N1", "Suporte N2"] }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/* ------------------------------ help center ------------------------------ */

export const helpdeskArticles = pgTable("helpdesk_articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default([]),
});

/* --------------------------------------------------------------------------
 * Simulated legacy ticketing service. These tables belong to that service:
 * only src/infrastructure/ticketing touches them, and the rest of the system
 * sees them exclusively through the TicketingGateway port.
 * ------------------------------------------------------------------------ */

export const ticketingTickets = pgTable(
  "ticketing_tickets",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["INC", "REQ"] }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    impact: text("impact").notNull(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id),
    assignedGroup: text("assigned_group"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("ticketing_tickets_requester_idx").on(t.requesterId)],
);

export const ticketingUpdates = pgTable(
  "ticketing_ticket_updates",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticketingTickets.id, { onDelete: "cascade" }),
    authorKind: text("author_kind", { enum: ["requester", "analyst", "system"] }).notNull(),
    authorName: text("author_name").notNull(),
    kind: text("kind", { enum: ["comment", "status_change", "reopened", "transferred"] }).notNull(),
    note: text("note").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("ticketing_updates_ticket_idx").on(t.ticketId)],
);

/** Atomic counters for human ticket codes (INC-20xxx, REQ-10xxx). */
export const ticketingSequences = pgTable("ticketing_sequences", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

/* ------------------------------ conversations ------------------------------ */

export type HandoffRow = {
  reason: "user_request" | "critical_ticket" | "overdue_ticket" | "low_confidence";
  summary: string;
  targetGroup: "Suporte N1" | "Suporte N2";
  requestedAt: string;
  ticketId?: string;
  confidence?: number;
};

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["agent", "awaiting_analyst", "with_analyst", "resolved", "closed"],
    }).notNull(),
    assignedAnalystId: text("assigned_analyst_id").references(() => users.id),
    handoff: jsonb("handoff").$type<HandoffRow>(),
    employeeMessageCount: integer("employee_message_count").notNull().default(0),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    index("conversations_employee_idx").on(t.employeeId),
    index("conversations_status_idx").on(t.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    /** Monotonic order: timestamps can tie, this never does. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["employee", "agent", "analyst", "system"] }).notNull(),
    authorId: text("author_id"),
    authorName: text("author_name"),
    authorBadge: text("author_badge"),
    content: text("content").notNull(),
    blocks: jsonb("blocks").$type<MessageBlock[]>().notNull().default([]),
    systemEvent: text("system_event", {
      enum: ["handoff", "assumed", "handed_back", "closed", "resolved"],
    }),
    trace: jsonb("trace").$type<AgentTrace>(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.seq)],
);

export const pendingActions = pgTable(
  "pending_actions",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => users.id),
    payload: jsonb("payload").$type<PendingPayload>().notNull(),
    status: text("status", { enum: ["pending", "confirmed", "cancelled", "superseded"] }).notNull(),
    resultTicketId: text("result_ticket_id"),
    createdAt: ts("created_at").notNull(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("pending_actions_conversation_idx").on(t.conversationId, t.status)],
);

export const conversationRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));
