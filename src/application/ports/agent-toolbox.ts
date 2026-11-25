import type { HandoffReason } from "@/domain/conversation/conversation";
import type { MessageBlock, TicketSnapshot } from "@/domain/conversation/message";
import type { Article } from "@/domain/helpdesk/article";
import type { User } from "@/domain/identity/user";

/** What one tool call produced: data for the LLM, UI blocks, and trace labels. */
export interface ToolOutcome<T> {
  readonly data: T;
  readonly blocks?: readonly MessageBlock[];
  /** Human labels for the trace chips, in order, e.g. "classificou a prioridade". */
  readonly labels: readonly string[];
  /** Sanitised summary for the detail panel. */
  readonly summary: unknown;
}

export interface DraftTicketInput {
  readonly type: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly subcategory?: string | undefined;
  readonly impact: string;
  readonly urgency: string;
}

export type DraftResult =
  | { readonly status: "drafted"; readonly priority: string; readonly slaLabel: string }
  | { readonly status: "duplicate"; readonly ticketId: string; readonly advice: string }
  | { readonly status: "invalid"; readonly problems: readonly string[] };

export type UpdateDraftResult =
  | { readonly status: "drafted"; readonly mode: "update" | "reopen" }
  | { readonly status: "rejected"; readonly reason: string };

export type HandoffResult =
  | { readonly status: "transferred"; readonly group: string }
  | { readonly status: "not_possible"; readonly reason: string };

export type TicketView = TicketSnapshot;

/**
 * Capabilities the agent may use. Implemented in the application layer and
 * bound to ONE employee and ONE conversation when created, so the LLM can
 * never name another user's id: privacy is structural, not prompt-based.
 */
export interface AgentToolbox {
  listMyTickets(input: {
    onlyOpen: boolean;
    showList: boolean;
  }): Promise<ToolOutcome<{ tickets: readonly TicketView[] }>>;
  getTicket(input: {
    ticketId: string;
  }): Promise<ToolOutcome<{ ticket: TicketView } | { error: string }>>;
  searchHelpCenter(input: {
    query: string;
  }): Promise<ToolOutcome<{ articles: readonly Pick<Article, "id" | "title" | "content">[] }>>;
  draftTicket(input: DraftTicketInput): Promise<ToolOutcome<DraftResult>>;
  draftTicketUpdate(input: {
    ticketId: string;
    information: string;
  }): Promise<ToolOutcome<UpdateDraftResult>>;
  askWithOptions(input: {
    question: string;
    options: readonly string[];
  }): Promise<ToolOutcome<{ shown: true }>>;
  transferToAnalyst(input: {
    reason: HandoffReason;
    summary: string;
    ticketId?: string | undefined;
  }): Promise<ToolOutcome<HandoffResult>>;
  markConversationResolved(): Promise<ToolOutcome<{ resolved: boolean }>>;
}

/** Builds a toolbox scoped to one employee and one conversation. */
export type AgentToolboxFactory = (employee: User, conversationId: string) => AgentToolbox;
