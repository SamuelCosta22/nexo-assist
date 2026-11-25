import {
  assumeConversation,
  closeConversation,
  ensureAssignedAnalyst,
  handBackToAgent,
  type Conversation,
  type ConversationError,
} from "@/domain/conversation/conversation";
import type { Message, SystemEventKind, TicketSnapshot } from "@/domain/conversation/message";
import { analystCovers, type User } from "@/domain/identity/user";
import type { SlaPolicy } from "@/domain/ticketing/sla-policy";
import { err, ok, type Result } from "@/domain/shared/result";
import { DomainError } from "@/domain/shared/domain-error";
import { TicketingUnavailableError } from "../errors";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type {
  ConversationRepository,
  ConversationSummary,
  MessageRepository,
} from "../ports/repositories";
import type { TicketingGateway } from "../ports/ticketing-gateway";
import { assertIsAnalyst } from "../support/access";
import { loadAuthorizedConversation } from "../support/conversation-guard";
import { newMessageBase } from "../support/ids";
import { analystMessage, systemMessage } from "../support/messages";
import { toSnapshot } from "../support/ticket-presenter";

export type ConsoleFilter = "all" | "for_you" | "with_agent" | "mine";

export interface ConsoleList {
  readonly items: readonly ConversationSummary[];
  /** Counts for every filter tab, independent of the selected one. */
  readonly counts: Readonly<Record<ConsoleFilter, number>>;
}

function belongs(
  filter: ConsoleFilter,
  analyst: User,
  { conversation }: ConversationSummary,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "for_you":
      return (
        conversation.status === "awaiting_analyst" &&
        (!conversation.handoff ||
          analystCovers(analyst.supportLevel, conversation.handoff.targetGroup))
      );
    case "with_agent":
      return conversation.status === "agent";
    case "mine":
      return (
        conversation.status === "with_analyst" && conversation.assignedAnalystId === analyst.id
      );
  }
}

/** Waiting conversations first (oldest handoff first), then by recent activity. */
function byUrgency(a: ConversationSummary, b: ConversationSummary): number {
  const waiting = (s: ConversationSummary) =>
    s.conversation.status === "awaiting_analyst" ? 0 : 1;
  if (waiting(a) !== waiting(b)) return waiting(a) - waiting(b);
  return b.conversation.updatedAt.getTime() - a.conversation.updatedAt.getTime();
}

export class ListConsoleConversations {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(analyst: User, filter: ConsoleFilter, search?: string): Promise<ConsoleList> {
    assertIsAnalyst(analyst);
    const all = await this.conversations.listSummaries({});
    const counts: Record<ConsoleFilter, number> = { all: 0, for_you: 0, with_agent: 0, mine: 0 };
    for (const summary of all) {
      for (const key of Object.keys(counts) as ConsoleFilter[]) {
        if (belongs(key, analyst, summary)) counts[key] += 1;
      }
    }
    const term = search?.trim().toLowerCase();
    const items = all
      .filter((summary) => belongs(filter, analyst, summary))
      .filter((summary) =>
        term
          ? `${summary.employee.name} ${summary.conversation.title} ${summary.conversation.handoff?.ticketId ?? ""}`
              .toLowerCase()
              .includes(term)
          : true,
      )
      .sort(byUrgency);
    return { items, counts };
  }
}

export interface EmployeeTickets {
  readonly tickets: readonly TicketSnapshot[];
  readonly open: number;
  readonly closed: number;
  /** False when the legacy system could not be reached; the console still works. */
  readonly available: boolean;
}

/** The "Chamados da Ana" side panel. */
export class ListEmployeeTickets {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly ticketing: TicketingGateway,
    private readonly sla: SlaPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(analyst: User, conversationId: string): Promise<EmployeeTickets> {
    assertIsAnalyst(analyst);
    const conversation = await loadAuthorizedConversation(
      this.conversations,
      analyst,
      conversationId,
    );
    try {
      const tickets = await this.ticketing.listByRequester(conversation.employeeId);
      const now = this.clock.now();
      const snapshots = tickets
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((ticket) => toSnapshot(ticket, this.sla, now));
      const open = snapshots.filter((t) => t.status !== "Resolvido").length;
      return { tickets: snapshots, open, closed: snapshots.length - open, available: true };
    } catch (error) {
      if (!(error instanceof TicketingUnavailableError)) throw error;
      return { tickets: [], open: 0, closed: 0, available: false };
    }
  }
}

export class EmptyMessageError extends DomainError {
  readonly code = "INVALID_MESSAGE";
  constructor() {
    super("A mensagem está vazia.");
  }
}

interface ConsoleDependencies {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly ticketing: TicketingGateway;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

abstract class ConsoleTransition {
  constructor(protected readonly deps: ConsoleDependencies) {}

  protected async announce(
    conversationId: string,
    event: SystemEventKind,
    content: string,
  ): Promise<void> {
    const { messages, ids, clock } = this.deps;
    await messages.append(
      systemMessage(newMessageBase(ids, clock, conversationId), event, content),
    );
  }
}

export class AssumeConversation extends ConsoleTransition {
  async execute(
    analyst: User,
    conversationId: string,
  ): Promise<Result<Conversation, ConversationError>> {
    assertIsAnalyst(analyst);
    const { conversations, ticketing, clock } = this.deps;
    const conversation = await loadAuthorizedConversation(conversations, analyst, conversationId);
    const next = assumeConversation(conversation, analyst, clock.now());
    if (!next.ok) return err(next.error);
    // Re-assuming your own conversation is a no-op, not a duplicate event.
    if (next.value === conversation) return ok(conversation);

    await conversations.save(next.value, conversation);
    await this.announce(conversationId, "assumed", `${analyst.name} assumiu · agent pausado`);

    const ticketId = conversation.handoff?.ticketId;
    if (ticketId) {
      try {
        await ticketing.addAnalystUpdate(ticketId, {
          authorName: analyst.name,
          note: `Atendimento assumido por ${analyst.name}.`,
          status: "Em andamento",
        });
      } catch (error) {
        if (!(error instanceof TicketingUnavailableError)) throw error;
      }
    }
    return ok(next.value);
  }
}

export class HandBackConversation extends ConsoleTransition {
  async execute(
    analyst: User,
    conversationId: string,
  ): Promise<Result<Conversation, ConversationError>> {
    assertIsAnalyst(analyst);
    const { conversations, clock } = this.deps;
    const conversation = await loadAuthorizedConversation(conversations, analyst, conversationId);
    const next = handBackToAgent(conversation, analyst.id, clock.now());
    if (!next.ok) return err(next.error);
    await conversations.save(next.value, conversation);
    await this.announce(
      conversationId,
      "handed_back",
      `${analyst.name} devolveu a conversa ao agent`,
    );
    return ok(next.value);
  }
}

export class CloseConversation extends ConsoleTransition {
  async execute(
    analyst: User,
    conversationId: string,
  ): Promise<Result<Conversation, ConversationError>> {
    assertIsAnalyst(analyst);
    const { conversations, clock } = this.deps;
    const conversation = await loadAuthorizedConversation(conversations, analyst, conversationId);
    const next = closeConversation(conversation, analyst.id, clock.now());
    if (!next.ok) return err(next.error);
    await conversations.save(next.value, conversation);
    await this.announce(conversationId, "closed", `${analyst.name} encerrou o atendimento`);
    return ok(next.value);
  }
}

export class SendAnalystMessage {
  constructor(private readonly deps: ConsoleDependencies) {}

  async execute(
    analyst: User,
    conversationId: string,
    content: string,
  ): Promise<Result<Message, ConversationError | EmptyMessageError>> {
    assertIsAnalyst(analyst);
    const text = content.trim();
    if (!text) return err(new EmptyMessageError());
    const { conversations, messages, ids, clock } = this.deps;
    const conversation = await loadAuthorizedConversation(conversations, analyst, conversationId);

    const owned = ensureAssignedAnalyst(conversation, analyst.id);
    if (!owned.ok) return err(owned.error);

    const message = analystMessage(newMessageBase(ids, clock, conversationId), analyst, text);
    await messages.append(message);
    await conversations.save({ ...conversation, updatedAt: message.createdAt }, conversation);
    return ok(message);
  }
}
