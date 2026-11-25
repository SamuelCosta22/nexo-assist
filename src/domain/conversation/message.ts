import type { AgentTrace } from "../agent/trace";
import type { Category, Priority, TicketStatus, TicketType } from "../ticketing/vocabulary";

export type MessageRole = "employee" | "agent" | "analyst" | "system";
export type SystemEventKind = "handoff" | "assumed" | "handed_back" | "closed" | "resolved";

/** Read-only picture of a ticket at the time a message was written. */
export interface TicketSnapshot {
  readonly id: string;
  readonly type: TicketType;
  readonly title: string;
  readonly description: string;
  readonly category: Category;
  readonly subcategory?: string;
  readonly priority: Priority;
  readonly status: TicketStatus;
  readonly createdAt: string;
  readonly lastUpdateAt: string;
  readonly dueAt: string;
  readonly slaLabel: string;
  readonly overdue: boolean;
}

export type TicketSummary = Pick<TicketSnapshot, "id" | "title" | "status" | "lastUpdateAt">;

/** Structured UI elements an agent message can carry next to its text. */
export type MessageBlock =
  | { readonly type: "options"; readonly question: string; readonly options: readonly string[] }
  | { readonly type: "ticket_list"; readonly items: readonly TicketSummary[] }
  | { readonly type: "ticket_card"; readonly ticket: TicketSnapshot }
  | { readonly type: "pending_action"; readonly actionId: string };

export interface Message {
  readonly id: string;
  readonly conversationId: string;
  readonly role: MessageRole;
  readonly authorId?: string;
  readonly authorName?: string;
  /** Analyst support level, shown as a badge ("Suporte N2"). */
  readonly authorBadge?: string;
  readonly content: string;
  readonly blocks: readonly MessageBlock[];
  readonly systemEvent?: SystemEventKind;
  readonly trace?: AgentTrace;
  readonly createdAt: Date;
}
