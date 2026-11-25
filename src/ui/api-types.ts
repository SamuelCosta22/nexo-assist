import type { AgentTrace, TraceAction } from "@/domain/agent/trace";
import type { ConversationStatus, HandoffReason } from "@/domain/conversation/conversation";
import type { Message, TicketSnapshot } from "@/domain/conversation/message";
import type { PendingPayload, PendingStatus } from "@/domain/conversation/pending-action";
import type { Role } from "@/domain/identity/user";
import type { SupportGroup } from "@/domain/ticketing/vocabulary";

/**
 * The HTTP contract between server and browser. Dates travel as ISO strings;
 * everything else reuses the domain's own JSON-safe types, so the UI never
 * invents a parallel model of messages, blocks or traces.
 */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  supportLevel?: SupportGroup;
}

export type MessageDto = Omit<Message, "createdAt"> & { createdAt: string };

export interface HandoffDto {
  reason: HandoffReason;
  summary: string;
  targetGroup: SupportGroup;
  requestedAt: string;
  ticketId?: string;
  confidence?: number;
}

export interface ConversationDto {
  id: string;
  employeeId: string;
  title: string;
  status: ConversationStatus;
  assignedAnalystId?: string;
  handoff?: HandoffDto;
  employeeMessageCount: number;
  /** Per-conversation cap on employee messages (CHAT_MESSAGE_LIMIT). */
  messageLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingActionDto {
  id: string;
  conversationId: string;
  status: PendingStatus;
  payload: PendingPayload;
  resultTicketId?: string;
  createdAt: string;
  /** For new-ticket drafts: when the first response would be due. */
  firstResponseDueAt?: string;
}

export interface ConversationViewDto {
  conversation: ConversationDto;
  employee: UserDto;
  analyst?: UserDto;
  messages: MessageDto[];
  pendingActions: Record<string, PendingActionDto>;
}

export interface LastMessageDto {
  role: Message["role"];
  content: string;
  authorName?: string;
  createdAt: string;
}

export interface ConversationListItemDto {
  conversation: ConversationDto;
  employee: UserDto;
  lastMessage?: LastMessageDto;
}

export type ConsoleFilterDto = "all" | "for_you" | "with_agent" | "mine";

export interface ConsoleListDto {
  items: ConversationListItemDto[];
  counts: Record<ConsoleFilterDto, number>;
}

export interface EmployeeTicketsDto {
  tickets: TicketSnapshot[];
  open: number;
  closed: number;
  available: boolean;
}

/** Server-sent events of POST /api/conversations/:id/messages. */
export type ChatStreamEvent =
  | { type: "user_message"; message: MessageDto }
  | { type: "step"; action: TraceAction }
  | { type: "text_delta"; text: string }
  | { type: "agent_message"; message: MessageDto }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

export interface ApiErrorBody {
  code: string;
  message: string;
}

export type { AgentTrace, TraceAction, TicketSnapshot };
