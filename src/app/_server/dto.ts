import type { Conversation } from "@/domain/conversation/conversation";
import type { Message } from "@/domain/conversation/message";
import type { User } from "@/domain/identity/user";
import type { ConversationSummary } from "@/application/ports/repositories";
import type { ConversationView } from "@/application/use-cases/conversations";
import type { PendingActionView } from "@/application/support/pending-action-view";
import type {
  ConversationDto,
  ConversationListItemDto,
  ConversationViewDto,
  MessageDto,
  PendingActionDto,
  UserDto,
} from "@/ui/api-types";

export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  ...(user.department ? { department: user.department } : {}),
  ...(user.supportLevel ? { supportLevel: user.supportLevel } : {}),
});

export const toMessageDto = (message: Message): MessageDto => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
});

export const toConversationDto = (
  conversation: Conversation,
  messageLimit: number,
): ConversationDto => ({
  id: conversation.id,
  employeeId: conversation.employeeId,
  title: conversation.title,
  status: conversation.status,
  ...(conversation.assignedAnalystId ? { assignedAnalystId: conversation.assignedAnalystId } : {}),
  ...(conversation.handoff
    ? {
        handoff: {
          reason: conversation.handoff.reason,
          summary: conversation.handoff.summary,
          targetGroup: conversation.handoff.targetGroup,
          requestedAt: conversation.handoff.requestedAt.toISOString(),
          ...(conversation.handoff.ticketId ? { ticketId: conversation.handoff.ticketId } : {}),
          ...(conversation.handoff.confidence !== undefined
            ? { confidence: conversation.handoff.confidence }
            : {}),
        },
      }
    : {}),
  employeeMessageCount: conversation.employeeMessageCount,
  messageLimit,
  createdAt: conversation.createdAt.toISOString(),
  updatedAt: conversation.updatedAt.toISOString(),
});

export const toPendingActionDto = ({
  action,
  firstResponseDueAt,
}: PendingActionView): PendingActionDto => ({
  id: action.id,
  conversationId: action.conversationId,
  status: action.status,
  payload: action.payload,
  ...(action.resultTicketId ? { resultTicketId: action.resultTicketId } : {}),
  createdAt: action.createdAt.toISOString(),
  ...(firstResponseDueAt ? { firstResponseDueAt: firstResponseDueAt.toISOString() } : {}),
});

export function toConversationViewDto(
  view: ConversationView,
  messageLimit: number,
): ConversationViewDto {
  return {
    conversation: toConversationDto(view.conversation, messageLimit),
    employee: toUserDto(view.employee),
    ...(view.analyst ? { analyst: toUserDto(view.analyst) } : {}),
    messages: view.messages.map(toMessageDto),
    pendingActions: Object.fromEntries(
      view.pendingActions.map((entry) => [entry.action.id, toPendingActionDto(entry)]),
    ),
  };
}

export function toListItemDto(
  summary: ConversationSummary,
  messageLimit: number,
): ConversationListItemDto {
  const last = summary.lastMessage;
  return {
    conversation: toConversationDto(summary.conversation, messageLimit),
    employee: toUserDto(summary.employee),
    ...(last
      ? {
          lastMessage: {
            role: last.role,
            content: last.content,
            ...(last.authorName ? { authorName: last.authorName } : {}),
            createdAt: last.createdAt.toISOString(),
          },
        }
      : {}),
  };
}
