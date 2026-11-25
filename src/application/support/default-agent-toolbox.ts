import { markResolvedByAgent, type HandoffReason } from "@/domain/conversation/conversation";
import type { MessageBlock, TicketSnapshot } from "@/domain/conversation/message";
import { supersedeAction, type PendingAction } from "@/domain/conversation/pending-action";
import { rankArticles } from "@/domain/helpdesk/article";
import type { User } from "@/domain/identity/user";
import { decideOnExistingTicket, findLikelyDuplicate } from "@/domain/ticketing/duplicate-policy";
import type { SlaPolicy } from "@/domain/ticketing/sla-policy";
import { isOpen } from "@/domain/ticketing/ticket";
import { createTicketDraft } from "@/domain/ticketing/ticket-draft";
import type {
  AgentToolbox,
  DraftResult,
  DraftTicketInput,
  HandoffResult,
  ToolOutcome,
  UpdateDraftResult,
} from "../ports/agent-toolbox";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type {
  ConversationRepository,
  HelpdeskRepository,
  MessageRepository,
  PendingActionRepository,
} from "../ports/repositories";
import type { TicketingGateway } from "../ports/ticketing-gateway";
import { NotFoundError } from "../errors";
import type { HandoffService } from "./handoff-service";
import { systemMessage } from "./messages";
import { toSnapshot, toSummary } from "./ticket-presenter";

const MAX_ARTICLE_CHARS = 700;
const NOT_FOUND_MESSAGE = "Chamado não encontrado entre os seus chamados.";

export interface ToolboxDependencies {
  readonly ticketing: TicketingGateway;
  readonly helpdesk: HelpdeskRepository;
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly pendingActions: PendingActionRepository;
  readonly handoff: HandoffService;
  readonly sla: SlaPolicy;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * The agent's hands. Bound to one employee and one conversation at creation:
 * every ticket lookup is scoped to `employee.id`, so even a successful prompt
 * injection cannot read or touch somebody else's data.
 */
export class DefaultAgentToolbox implements AgentToolbox {
  constructor(
    private readonly deps: ToolboxDependencies,
    private readonly employee: User,
    private readonly conversationId: string,
  ) {}

  async listMyTickets(input: {
    onlyOpen: boolean;
    showList: boolean;
  }): Promise<ToolOutcome<{ tickets: readonly TicketSnapshot[] }>> {
    const { ticketing, sla, clock } = this.deps;
    const now = clock.now();
    const all = await ticketing.listByRequester(this.employee.id);
    const tickets = all
      .filter((ticket) => (input.onlyOpen ? isOpen(ticket) : true))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    // The selectable list only offers open tickets (PRD, tela 3), even when the model
    // fetched resolved ones too for context.
    const selectable = tickets.filter(isOpen);
    const blocks: MessageBlock[] =
      input.showList && selectable.length > 0
        ? [{ type: "ticket_list", items: selectable.map(toSummary) }]
        : [];
    return {
      data: { tickets: tickets.map((ticket) => toSnapshot(ticket, sla, now)) },
      blocks,
      labels: ["consultou seus chamados"],
      summary: { found: tickets.length, onlyOpen: input.onlyOpen, ids: tickets.map((t) => t.id) },
    };
  }

  async getTicket(input: {
    ticketId: string;
  }): Promise<ToolOutcome<{ ticket: TicketSnapshot } | { error: string }>> {
    const { ticketing, sla, clock } = this.deps;
    const ticket = await ticketing.findById(input.ticketId.trim().toUpperCase());
    // Same answer for "missing" and "someone else's": no existence oracle.
    if (!ticket || ticket.requesterId !== this.employee.id) {
      return {
        data: { error: NOT_FOUND_MESSAGE },
        labels: [`consultou o ${input.ticketId}`],
        summary: { found: false, rule: "privacidade: apenas chamados do próprio funcionário" },
      };
    }
    const snapshot = toSnapshot(ticket, sla, clock.now());
    return {
      data: { ticket: snapshot },
      blocks: [{ type: "ticket_card", ticket: snapshot }],
      labels: [`consultou o ${ticket.id}`, "calculou o prazo"],
      summary: {
        ticket: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        slaTarget: snapshot.slaLabel,
        dueAt: snapshot.dueAt,
        overdue: snapshot.overdue,
      },
    };
  }

  async searchHelpCenter(input: {
    query: string;
  }): Promise<
    ToolOutcome<{ articles: readonly { id: string; title: string; content: string }[] }>
  > {
    const articles = await this.deps.helpdesk.listArticles();
    const ranked = rankArticles(input.query, articles, 3);
    return {
      data: {
        articles: ranked.map(({ article }) => ({
          id: article.id,
          title: article.title,
          content: article.content.slice(0, MAX_ARTICLE_CHARS),
        })),
      },
      labels: ["buscou na central de ajuda"],
      summary: {
        query: input.query,
        matches: ranked.map(({ article, score }) => ({
          id: article.id,
          title: article.title,
          score: Number(score.toFixed(2)),
        })),
      },
    };
  }

  async draftTicket(input: DraftTicketInput): Promise<ToolOutcome<DraftResult>> {
    const { ticketing, clock } = this.deps;
    const now = clock.now();

    const built = createTicketDraft(input, this.deps.sla);
    if (!built.ok) {
      return {
        data: { status: "invalid", problems: built.error.problems },
        labels: ["tentou montar o rascunho"],
        summary: { problems: built.error.problems },
      };
    }
    const draft = built.value;

    const existing = await ticketing.listByRequester(this.employee.id);
    const duplicate = findLikelyDuplicate(draft, existing, now);
    if (duplicate) {
      const mode = decideOnExistingTicket(duplicate, now);
      return {
        data: {
          status: "duplicate",
          ticketId: duplicate.id,
          advice:
            mode === "reopen"
              ? `O ${duplicate.id} foi resolvido há pouco e pode ser reaberto: use draftTicketUpdate.`
              : `Já existe o ${duplicate.id} aberto sobre isso: atualize-o com draftTicketUpdate em vez de criar outro.`,
        },
        labels: ["verificou duplicidade"],
        summary: {
          duplicateOf: duplicate.id,
          rule: "sem duplicidade: atualizar/reabrir em vez de criar",
        },
      };
    }

    const action = await this.savePendingAction({ kind: "create_ticket", draft });
    return {
      data: { status: "drafted", priority: draft.priority, slaLabel: draft.slaLabel },
      blocks: [{ type: "pending_action", actionId: action.id }],
      labels: [
        "verificou duplicidade",
        "classificou a prioridade",
        "consultou o SLA",
        "montou o rascunho",
      ],
      summary: {
        draftId: action.id,
        priority: draft.priority,
        rationale: draft.priorityRationale,
        sla: draft.slaLabel,
        category: draft.category,
      },
    };
  }

  async draftTicketUpdate(input: {
    ticketId: string;
    information: string;
  }): Promise<ToolOutcome<UpdateDraftResult>> {
    const { ticketing, clock } = this.deps;
    const ticket = await ticketing.findById(input.ticketId.trim().toUpperCase());
    if (!ticket || ticket.requesterId !== this.employee.id) {
      return {
        data: { status: "rejected", reason: NOT_FOUND_MESSAGE },
        labels: [`consultou o ${input.ticketId}`],
        summary: { found: false, rule: "privacidade: apenas chamados do próprio funcionário" },
      };
    }
    const mode = decideOnExistingTicket(ticket, clock.now());
    if (mode === "create_new") {
      return {
        data: {
          status: "rejected",
          reason: `O ${ticket.id} foi resolvido há mais de 7 dias e não pode ser reaberto: abra um novo chamado com draftTicket.`,
        },
        labels: [`consultou o ${ticket.id}`],
        summary: { ticket: ticket.id, rule: "chamado resolvido há mais de 7 dias não é reaberto" },
      };
    }
    const action = await this.savePendingAction({
      kind: mode === "reopen" ? "reopen_ticket" : "update_ticket",
      ticketId: ticket.id,
      note: input.information.trim(),
    });
    return {
      data: { status: "drafted", mode },
      blocks: [{ type: "pending_action", actionId: action.id }],
      labels: [
        `consultou o ${ticket.id}`,
        mode === "reopen" ? "preparou a reabertura" : "montou a atualização",
      ],
      summary: { draftId: action.id, ticket: ticket.id, mode },
    };
  }

  async askWithOptions(input: {
    question: string;
    options: readonly string[];
  }): Promise<ToolOutcome<{ shown: true }>> {
    const options = [
      ...new Set(input.options.map((option) => option.trim()).filter(Boolean)),
    ].slice(0, 5);
    return {
      data: { shown: true },
      blocks: [{ type: "options", question: input.question, options }],
      labels: ["ofereceu opções rápidas"],
      summary: { question: input.question, options },
    };
  }

  async transferToAnalyst(input: {
    reason: HandoffReason;
    summary: string;
    ticketId?: string | undefined;
  }): Promise<ToolOutcome<HandoffResult>> {
    const { conversations, handoff, ticketing } = this.deps;
    const conversation = await conversations.findById(this.conversationId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");

    let ticketId = input.ticketId?.trim().toUpperCase();
    if (ticketId) {
      const ticket = await ticketing.findById(ticketId);
      if (!ticket || ticket.requesterId !== this.employee.id) ticketId = undefined;
    }

    const result = await handoff.handOff(conversation, {
      reason: input.reason,
      summary: input.summary,
      ...(ticketId ? { ticketId } : {}),
    });
    if (!result.ok) {
      return {
        data: { status: "not_possible", reason: result.error.message },
        labels: ["tentou transferir"],
        summary: { reason: result.error.message },
      };
    }
    const group = result.value.handoff?.targetGroup ?? "Suporte N1";
    return {
      data: { status: "transferred", group },
      labels: ["transferiu para um analista"],
      summary: { group, reason: input.reason, ticketId, caseSummary: input.summary },
    };
  }

  async markConversationResolved(): Promise<ToolOutcome<{ resolved: boolean }>> {
    const { conversations, messages, ids, clock } = this.deps;
    const conversation = await conversations.findById(this.conversationId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");
    const now = clock.now();
    const next = markResolvedByAgent(conversation, now);
    if (!next.ok) {
      return {
        data: { resolved: false },
        labels: ["tentou encerrar a conversa"],
        summary: { reason: next.error.message },
      };
    }
    await conversations.save(next.value, conversation);
    await messages.append(
      systemMessage(
        { id: ids.next(), conversationId: conversation.id, createdAt: now },
        "resolved",
        "Resolvida pelo agent",
      ),
    );
    return {
      data: { resolved: true },
      labels: ["marcou como resolvida"],
      summary: { resolved: true },
    };
  }

  /** At most one draft is pending per conversation: a new one replaces the old. */
  private async savePendingAction(payload: PendingAction["payload"]): Promise<PendingAction> {
    const { pendingActions, ids, clock } = this.deps;
    const now = clock.now();
    const previous = await pendingActions.findPendingByConversation(this.conversationId);
    if (previous) await pendingActions.save(supersedeAction(previous, now));
    const action: PendingAction = {
      id: ids.next(),
      conversationId: this.conversationId,
      employeeId: this.employee.id,
      payload,
      status: "pending",
      createdAt: now,
    };
    await pendingActions.save(action);
    return action;
  }
}
