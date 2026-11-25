import {
  ActionNotPendingError,
  cancelAction,
  confirmAction,
  editDraft,
  type DraftEdits,
  type InvalidEditError,
  type PendingAction,
} from "@/domain/conversation/pending-action";
import type { Message } from "@/domain/conversation/message";
import type { User } from "@/domain/identity/user";
import { decideOnExistingTicket, findLikelyDuplicate } from "@/domain/ticketing/duplicate-policy";
import type { SlaPolicy } from "@/domain/ticketing/sla-policy";
import type { Ticket } from "@/domain/ticketing/ticket";
import type { InvalidDraftError } from "@/domain/ticketing/ticket-draft";
import { err, ok, type Result } from "@/domain/shared/result";
import { ForbiddenError, NotFoundError } from "../errors";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type {
  ConversationRepository,
  MessageRepository,
  PendingActionRepository,
} from "../ports/repositories";
import type { TicketingGateway } from "../ports/ticketing-gateway";
import { assertIsEmployee } from "../support/access";
import { deterministicTrace } from "../support/deterministic-trace";
import type { HandoffService } from "../support/handoff-service";
import { newMessageBase } from "../support/ids";
import { agentMessage } from "../support/messages";
import { toSnapshot } from "../support/ticket-presenter";

export interface PendingActionDependencies {
  readonly pendingActions: PendingActionRepository;
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly ticketing: TicketingGateway;
  readonly handoff: HandoffService;
  readonly sla: SlaPolicy;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

async function loadOwnedAction(
  deps: PendingActionDependencies,
  actor: User,
  actionId: string,
): Promise<PendingAction> {
  assertIsEmployee(actor);
  const action = await deps.pendingActions.findById(actionId);
  if (!action) throw new NotFoundError("Rascunho não encontrado.");
  if (action.employeeId !== actor.id) throw new ForbiddenError("Rascunho não pertence a você.");
  return action;
}

export interface ConfirmationOutcome {
  readonly action: PendingAction;
  readonly ticket: Ticket;
  readonly messages: readonly Message[];
}

/**
 * "Confirmar" on the draft card. This is the ONLY code path that creates,
 * updates or reopens a ticket on the employee's behalf, and it is triggered by
 * a button, never by the model: confirmation cannot be hallucinated.
 */
export class ConfirmPendingAction {
  constructor(private readonly deps: PendingActionDependencies) {}

  async execute(
    actor: User,
    actionId: string,
  ): Promise<Result<ConfirmationOutcome, ActionNotPendingError>> {
    const { pendingActions, messages, conversations, ids, clock, sla, handoff } = this.deps;
    const started = Date.now();
    const action = await loadOwnedAction(this.deps, actor, actionId);
    if (action.status !== "pending") return err(new ActionNotPendingError());

    const applied = await this.apply(action, actor);

    const confirmed = confirmAction(action, applied.ticket.id, clock.now());
    if (!confirmed.ok) return err(confirmed.error);
    await pendingActions.save(confirmed.value);

    const now = clock.now();
    const snapshot = toSnapshot(applied.ticket, sla, now);
    const reply = agentMessage(
      newMessageBase(ids, clock, action.conversationId),
      applied.text,
      [{ type: "ticket_card", ticket: snapshot }],
      deterministicTrace(ids, {
        understanding: "O funcionário confirmou o rascunho pelo botão Confirmar.",
        intent: action.payload.kind === "create_ticket" ? "abrir_chamado" : "atualizar_chamado",
        rationale: applied.rationale,
        rulesApplied: applied.rules,
        steps: [
          {
            tool: applied.tool,
            label: applied.label,
            input: { actionId: action.id, kind: action.payload.kind },
            output: {
              ticket: applied.ticket.id,
              status: applied.ticket.status,
              priority: applied.ticket.priority,
            },
          },
        ],
        latencyMs: Date.now() - started,
      }),
    );
    await messages.append(reply);
    const produced: Message[] = [reply];

    // Critical tickets are handed to a human right away (Anexo A: "Transferência").
    if (applied.ticket.priority === "Crítica" && action.payload.kind === "create_ticket") {
      const conversation = await conversations.findById(action.conversationId);
      if (conversation) {
        const result = await handoff.handOff(conversation, {
          reason: "critical_ticket",
          summary: `Chamado crítico ${applied.ticket.id}: ${applied.ticket.title}`,
          ticketId: applied.ticket.id,
        });
        if (result.ok) {
          const notice = agentMessage(
            newMessageBase(ids, clock, action.conversationId),
            "Como o chamado é crítico, já encaminhei sua conversa para o Suporte N2. Um analista assume em seguida.",
            [],
            deterministicTrace(ids, {
              understanding: `${applied.ticket.id} foi criado com prioridade Crítica.`,
              intent: "falar_com_analista",
              rationale:
                "Casos críticos são transferidos para uma pessoa assim que o chamado é aberto.",
              rulesApplied: ["Transferência obrigatória em casos críticos (Anexo A)"],
              steps: [
                {
                  tool: "transferir_para_analista",
                  label: "transferiu para um analista",
                  input: { reason: "critical_ticket", ticketId: applied.ticket.id },
                  output: { group: result.value.handoff?.targetGroup },
                },
              ],
              latencyMs: 0,
            }),
          );
          await messages.append(notice);
          produced.push(notice);
        }
      }
    }
    return ok({ action: confirmed.value, ticket: applied.ticket, messages: produced });
  }

  private async apply(action: PendingAction, actor: User) {
    const { ticketing, clock } = this.deps;
    const payload = action.payload;

    if (payload.kind === "create_ticket") {
      const { draft } = payload;
      const existing = await ticketing.listByRequester(actor.id);
      // Code-level safety net: a duplicate the model missed is caught here.
      const duplicate = findLikelyDuplicate(draft, existing, clock.now());
      if (duplicate) {
        const mode = decideOnExistingTicket(duplicate, clock.now());
        const note = `Nova informação do funcionário: ${draft.description}`;
        if (mode === "reopen") {
          const ticket = await ticketing.reopen(duplicate.id, { authorName: actor.name, note });
          return {
            ticket,
            tool: "reabrir_chamado",
            label: "reabriu o chamado",
            text: `Já existia o ${ticket.id}, resolvido há poucos dias, sobre o mesmo problema. Reabri esse chamado em vez de abrir outro.`,
            rationale: `Já existia um chamado resolvido há até 7 dias sobre o mesmo problema.`,
            rules: ["Sem duplicidade: chamados resolvidos há até 7 dias são reabertos"],
          };
        }
        const ticket = await ticketing.addRequesterUpdate(duplicate.id, {
          authorName: actor.name,
          note,
        });
        return {
          ticket,
          tool: "atualizar_chamado",
          label: "atualizou o chamado",
          text: `Já existe o ${ticket.id} aberto sobre o mesmo problema, então adicionei suas informações a ele em vez de abrir um chamado duplicado.`,
          rationale: "Foi encontrado um chamado aberto sobre o mesmo problema.",
          rules: ["Sem duplicidade: chamado aberto é atualizado, não duplicado"],
        };
      }
      const ticket = await ticketing.create({
        requesterId: actor.id,
        requesterName: actor.name,
        draft,
      });
      return {
        ticket,
        tool: "criar_chamado",
        label: "criou o chamado",
        text: `Pronto! Abri o ${ticket.id} com prioridade ${ticket.priority}. A primeira resposta de um analista chega em até ${draft.slaLabel}.`,
        rationale: draft.priorityRationale,
        rules: [
          "Chamado só é criado após confirmação do funcionário",
          `Prazo da prioridade ${ticket.priority}: ${draft.slaLabel}`,
        ],
      };
    }

    const owned = await ticketing.findById(payload.ticketId);
    if (!owned || owned.requesterId !== actor.id)
      throw new ForbiddenError("Chamado não pertence a você.");

    if (payload.kind === "reopen_ticket") {
      const ticket = await ticketing.reopen(owned.id, {
        authorName: actor.name,
        note: payload.note,
      });
      return {
        ticket,
        tool: "reabrir_chamado",
        label: "reabriu o chamado",
        text: `Reabri o ${ticket.id} com a sua informação. Ele volta para a fila de atendimento.`,
        rationale: "Chamado resolvido há até 7 dias pode ser reaberto.",
        rules: ["Chamados resolvidos há até 7 dias podem ser reabertos (Anexo A)"],
      };
    }
    const ticket = await ticketing.addRequesterUpdate(owned.id, {
      authorName: actor.name,
      note: payload.note,
    });
    return {
      ticket,
      tool: "atualizar_chamado",
      label: "atualizou o chamado",
      text: `Adicionei a informação ao ${ticket.id}.`,
      rationale: "O funcionário complementou um chamado aberto.",
      rules: ["Atualização só acontece após confirmação do funcionário"],
    };
  }
}

export class CancelPendingAction {
  constructor(private readonly deps: PendingActionDependencies) {}

  async execute(
    actor: User,
    actionId: string,
  ): Promise<Result<PendingAction, ActionNotPendingError>> {
    const { pendingActions, messages, ids, clock } = this.deps;
    const action = await loadOwnedAction(this.deps, actor, actionId);
    const cancelled = cancelAction(action, clock.now());
    if (!cancelled.ok) return err(cancelled.error);
    await pendingActions.save(cancelled.value);
    await messages.append(
      agentMessage(
        newMessageBase(ids, clock, action.conversationId),
        "Tudo bem, cancelei o rascunho e nada foi criado. Posso ajudar com mais alguma coisa?",
        [],
        deterministicTrace(ids, {
          understanding: "O funcionário cancelou o rascunho pelo botão Cancelar.",
          intent: "conversa",
          rationale: "Nada é criado sem confirmação; o rascunho foi descartado.",
          rulesApplied: ["Chamado só é criado após confirmação do funcionário"],
          steps: [
            {
              tool: "cancelar_rascunho",
              label: "cancelou o rascunho",
              input: { actionId },
              output: { status: "cancelled" },
            },
          ],
          latencyMs: 0,
        }),
      ),
    );
    return ok(cancelled.value);
  }
}

export class EditPendingAction {
  constructor(private readonly deps: PendingActionDependencies) {}

  async execute(
    actor: User,
    actionId: string,
    edits: DraftEdits,
  ): Promise<Result<PendingAction, ActionNotPendingError | InvalidDraftError | InvalidEditError>> {
    const action = await loadOwnedAction(this.deps, actor, actionId);
    const edited = editDraft(action, edits);
    if (!edited.ok) return err(edited.error);
    await this.deps.pendingActions.save(edited.value);
    return ok(edited.value);
  }
}
