import { DomainError } from "../shared/domain-error";
import { err, ok, type Result } from "../shared/result";
import { analystCovers, type User } from "../identity/user";
import type { SupportGroup } from "../ticketing/vocabulary";

export const CONVERSATION_STATUSES = [
  "agent",
  "awaiting_analyst",
  "with_analyst",
  "resolved",
  "closed",
] as const;
/**
 * agent             the agent is answering
 * awaiting_analyst  transferred; the agent is silent until an analyst takes over
 * with_analyst      an analyst is answering; the agent is paused
 * resolved          the agent finished it ("Resolvida pelo agent")
 * closed            an analyst finished it
 */
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type HandoffReason =
  "user_request" | "critical_ticket" | "overdue_ticket" | "low_confidence";

export interface Handoff {
  readonly reason: HandoffReason;
  /** Case summary the analyst reads before answering (Anexo A: "Leva um resumo do caso"). */
  readonly summary: string;
  readonly targetGroup: SupportGroup;
  readonly requestedAt: Date;
  readonly ticketId?: string;
  readonly confidence?: number;
}

export interface Conversation {
  readonly id: string;
  readonly employeeId: string;
  readonly title: string;
  readonly status: ConversationStatus;
  readonly assignedAnalystId?: string;
  readonly handoff?: Handoff;
  /** Messages written by the employee; drives the per-conversation limit. */
  readonly employeeMessageCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class MessageLimitReachedError extends DomainError {
  readonly code = "MESSAGE_LIMIT_REACHED";
  constructor(readonly limit: number) {
    super(`Esta conversa atingiu o limite de ${limit} mensagens.`);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = "INVALID_TRANSITION";
}

export class NotAuthorizedError extends DomainError {
  readonly code = "NOT_AUTHORIZED";
}

export type ConversationError =
  MessageLimitReachedError | InvalidTransitionError | NotAuthorizedError;

const MAX_TITLE_LENGTH = 60;
export const DEFAULT_TITLE = "Nova conversa";

/** Which support level a transfer goes to (README, decision 21). */
export function targetGroupFor(reason: HandoffReason): SupportGroup {
  return reason === "critical_ticket" || reason === "overdue_ticket" ? "Suporte N2" : "Suporte N1";
}

export function titleFromMessage(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return DEFAULT_TITLE;
  return clean.length <= MAX_TITLE_LENGTH
    ? clean
    : `${clean.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

export function startConversation(input: {
  id: string;
  employeeId: string;
  now: Date;
}): Conversation {
  return {
    id: input.id,
    employeeId: input.employeeId,
    title: DEFAULT_TITLE,
    status: "agent",
    employeeMessageCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Only the agent is metered: once an analyst is involved the cap no longer blocks the employee. */
export function canAgentReply(conversation: Conversation): boolean {
  return conversation.status === "agent";
}

/** Drops the analyst assignment and handoff, leaving the agent in charge. */
function backToAgent(conversation: Conversation): Conversation {
  return {
    id: conversation.id,
    employeeId: conversation.employeeId,
    title: conversation.title,
    status: "agent",
    employeeMessageCount: conversation.employeeMessageCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function registerEmployeeMessage(
  conversation: Conversation,
  content: string,
  limit: number,
  now: Date,
): Result<Conversation, MessageLimitReachedError> {
  if (conversation.status === "agent" && conversation.employeeMessageCount >= limit) {
    return err(new MessageLimitReachedError(limit));
  }
  // Writing again in a finished conversation brings the agent back.
  const reactivated = conversation.status === "resolved" || conversation.status === "closed";
  const base = reactivated ? backToAgent(conversation) : conversation;
  return ok({
    ...base,
    title: conversation.employeeMessageCount === 0 ? titleFromMessage(content) : conversation.title,
    employeeMessageCount: conversation.employeeMessageCount + 1,
    updatedAt: now,
  });
}

export interface HandoffRequest {
  readonly reason: HandoffReason;
  readonly summary: string;
  readonly ticketId?: string;
  readonly confidence?: number;
}

export function requestHandoff(
  conversation: Conversation,
  request: HandoffRequest,
  now: Date,
): Result<Conversation, InvalidTransitionError> {
  if (conversation.status !== "agent") {
    return err(new InvalidTransitionError("A conversa já foi transferida ou finalizada."));
  }
  return ok({
    ...conversation,
    status: "awaiting_analyst",
    handoff: {
      reason: request.reason,
      summary: request.summary,
      targetGroup: targetGroupFor(request.reason),
      requestedAt: now,
      ...(request.ticketId ? { ticketId: request.ticketId } : {}),
      ...(request.confidence !== undefined ? { confidence: request.confidence } : {}),
    },
    updatedAt: now,
  });
}

export function assumeConversation(
  conversation: Conversation,
  analyst: User,
  now: Date,
): Result<Conversation, InvalidTransitionError | NotAuthorizedError> {
  if (analyst.role !== "analyst")
    return err(new NotAuthorizedError("Apenas analistas podem assumir."));
  if (conversation.status === "with_analyst") {
    return conversation.assignedAnalystId === analyst.id
      ? ok(conversation)
      : err(new InvalidTransitionError("Outro analista já assumiu esta conversa."));
  }
  if (conversation.status !== "awaiting_analyst" && conversation.status !== "agent") {
    return err(new InvalidTransitionError("Esta conversa já foi finalizada."));
  }
  if (
    conversation.handoff &&
    !analystCovers(analyst.supportLevel, conversation.handoff.targetGroup)
  ) {
    return err(new NotAuthorizedError(`Esta conversa é do ${conversation.handoff.targetGroup}.`));
  }
  return ok({
    ...conversation,
    status: "with_analyst",
    assignedAnalystId: analyst.id,
    updatedAt: now,
  });
}

/** Only the analyst who assumed a conversation may answer, hand back or close it. */
export function ensureAssignedAnalyst(
  conversation: Conversation,
  analystId: string,
): Result<Conversation, InvalidTransitionError | NotAuthorizedError> {
  if (conversation.status !== "with_analyst") {
    return err(new InvalidTransitionError("Nenhum analista está atendendo esta conversa."));
  }
  if (conversation.assignedAnalystId !== analystId) {
    return err(new NotAuthorizedError("Esta conversa está com outro analista."));
  }
  return ok(conversation);
}

export function handBackToAgent(
  conversation: Conversation,
  analystId: string,
  now: Date,
): Result<Conversation, InvalidTransitionError | NotAuthorizedError> {
  const owned = ensureAssignedAnalyst(conversation, analystId);
  if (!owned.ok) return owned;
  return ok({ ...backToAgent(conversation), updatedAt: now });
}

/**
 * An analyst who covers the queue sends a transferred conversation back to the
 * agent without taking it (the console's "Devolver ao agent" before assuming).
 */
export function declineHandoff(
  conversation: Conversation,
  analyst: User,
  now: Date,
): Result<Conversation, InvalidTransitionError | NotAuthorizedError> {
  if (analyst.role !== "analyst")
    return err(new NotAuthorizedError("Apenas analistas podem devolver."));
  if (conversation.status !== "awaiting_analyst") {
    return err(new InvalidTransitionError("Esta conversa não está aguardando um analista."));
  }
  if (
    conversation.handoff &&
    !analystCovers(analyst.supportLevel, conversation.handoff.targetGroup)
  ) {
    return err(new NotAuthorizedError(`Esta conversa é do ${conversation.handoff.targetGroup}.`));
  }
  return ok({ ...backToAgent(conversation), updatedAt: now });
}

export function closeConversation(
  conversation: Conversation,
  analystId: string,
  now: Date,
): Result<Conversation, InvalidTransitionError | NotAuthorizedError> {
  const owned = ensureAssignedAnalyst(conversation, analystId);
  if (!owned.ok) return owned;
  return ok({ ...conversation, status: "closed", updatedAt: now });
}

export function markResolvedByAgent(
  conversation: Conversation,
  now: Date,
): Result<Conversation, InvalidTransitionError> {
  if (conversation.status !== "agent") {
    return err(
      new InvalidTransitionError("Só o agent pode resolver uma conversa que está com ele."),
    );
  }
  return ok({ ...conversation, status: "resolved", updatedAt: now });
}
