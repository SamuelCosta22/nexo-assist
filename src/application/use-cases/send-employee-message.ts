import type { AgentTrace, TraceAction } from "@/domain/agent/trace";
import { isLowConfidence, LOW_CONFIDENCE_THRESHOLD } from "@/domain/agent/trace";
import {
  canAgentReply,
  registerEmployeeMessage,
  type Conversation,
  type MessageLimitReachedError,
} from "@/domain/conversation/conversation";
import type { Message } from "@/domain/conversation/message";
import type { User } from "@/domain/identity/user";
import { err, ok, type Result } from "@/domain/shared/result";
import { DomainError } from "@/domain/shared/domain-error";
import type { AgentPort } from "../ports/agent";
import type { AgentToolboxFactory } from "../ports/agent-toolbox";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type {
  ConversationRepository,
  MessageRepository,
  PendingActionRepository,
  UsageRepository,
} from "../ports/repositories";
import { DailyLimitReachedError } from "../errors";
import { assertIsEmployee } from "../support/access";
import { loadAuthorizedConversation } from "../support/conversation-guard";
import { deterministicTrace } from "../support/deterministic-trace";
import type { HandoffService } from "../support/handoff-service";
import { newMessageBase } from "../support/ids";
import { agentMessage, employeeMessage } from "../support/messages";

export const MAX_MESSAGE_LENGTH = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How many past messages the model sees: bounds cost per turn (README, efficiency). */
export const HISTORY_WINDOW = 20;

export class InvalidMessageError extends DomainError {
  readonly code = "INVALID_MESSAGE";
}

/** What the delivery layer streams to the browser while the agent works. */
export type ChatEvent =
  | { readonly type: "step"; readonly action: TraceAction }
  | { readonly type: "text_delta"; readonly text: string }
  | { readonly type: "agent_message"; readonly message: Message }
  | { readonly type: "system_message"; readonly message: Message }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "done"; readonly conversation: Conversation };

export interface MessageTurn {
  /** The employee message, already saved. */
  readonly userMessage: Message;
  readonly conversation: Conversation;
  /** Runs the agent (if it is allowed to answer) and streams events. */
  run(signal?: AbortSignal): AsyncGenerator<ChatEvent>;
}

export interface SendEmployeeMessageDependencies {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly pendingActions: PendingActionRepository;
  readonly agent: AgentPort;
  readonly toolboxFor: AgentToolboxFactory;
  readonly handoff: HandoffService;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly messageLimit: number;
  readonly usage: UsageRepository;
  /** Messages per employee in a rolling 24h window (protects model cost). */
  readonly dailyLimit: number;
}

/**
 * The heart of the product: an employee writes, the agent answers.
 *
 * `begin` validates and persists the employee message (so errors become proper
 * HTTP statuses before any streaming starts); `run` then streams the agent.
 * Code, not the prompt, decides whether the agent may answer at all: when the
 * conversation is with an analyst the agent is never invoked.
 */
export class SendEmployeeMessage {
  constructor(private readonly deps: SendEmployeeMessageDependencies) {}

  async begin(
    actor: User,
    conversationId: string,
    rawContent: string,
  ): Promise<
    Result<MessageTurn, MessageLimitReachedError | DailyLimitReachedError | InvalidMessageError>
  > {
    assertIsEmployee(actor);
    const content = rawContent.trim();
    if (content.length === 0) return err(new InvalidMessageError("A mensagem está vazia."));
    if (content.length > MAX_MESSAGE_LENGTH) {
      return err(new InvalidMessageError(`A mensagem passa de ${MAX_MESSAGE_LENGTH} caracteres.`));
    }

    const { conversations, messages, clock, ids, messageLimit } = this.deps;
    const conversation = await loadAuthorizedConversation(conversations, actor, conversationId);
    // Only messages the agent would answer cost money, so only those are metered.
    if (canAgentReply(conversation)) {
      const since = new Date(clock.now().getTime() - DAY_MS);
      const sent = await this.deps.usage.countEmployeeMessagesSince(actor.id, since);
      if (sent >= this.deps.dailyLimit)
        return err(new DailyLimitReachedError(this.deps.dailyLimit));
    }

    const registered = registerEmployeeMessage(conversation, content, messageLimit, clock.now());
    if (!registered.ok) return err(registered.error);

    await conversations.save(registered.value, conversation);
    const userMessage = employeeMessage(
      newMessageBase(ids, clock, conversation.id),
      actor,
      content,
    );
    await messages.append(userMessage);

    return ok({
      userMessage,
      conversation: registered.value,
      run: (signal) => this.run(actor, registered.value, signal),
    });
  }

  /**
   * Re-runs the agent for the employee's last message after a failure, without
   * saving it again or spending another message of the limit. Only allowed
   * while the agent owns the conversation and nobody has answered yet.
   */
  async beginRetry(
    actor: User,
    conversationId: string,
  ): Promise<Result<MessageTurn, InvalidMessageError>> {
    assertIsEmployee(actor);
    const { conversations, messages } = this.deps;
    const conversation = await loadAuthorizedConversation(conversations, actor, conversationId);
    const [last] = await messages.listRecent(conversation.id, 1);
    if (!canAgentReply(conversation) || last?.role !== "employee") {
      return err(new InvalidMessageError("Não há nada para tentar de novo nesta conversa."));
    }
    return ok({
      userMessage: last,
      conversation,
      run: (signal) => this.run(actor, conversation, signal),
    });
  }

  private async *run(
    employee: User,
    conversation: Conversation,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const { agent, messages, pendingActions, conversations, clock, ids } = this.deps;

    if (!canAgentReply(conversation)) {
      yield { type: "done", conversation };
      return;
    }

    const [history, pendingAction] = await Promise.all([
      messages.listRecent(conversation.id, HISTORY_WINDOW),
      pendingActions.findPendingByConversation(conversation.id),
    ]);

    let final: { text: string; blocks: Message["blocks"]; trace: AgentTrace } | undefined;
    try {
      const stream = agent.respond(
        {
          employee,
          conversation,
          history,
          ...(pendingAction ? { pendingAction } : {}),
          now: clock.now(),
          toolbox: this.deps.toolboxFor(employee, conversation.id),
        },
        signal,
      );
      for await (const event of stream) {
        if (event.type === "done") final = event;
        else yield event;
      }
    } catch (error) {
      console.error("[agent] turn failed", error);
      yield {
        type: "error",
        code: "AGENT_UNAVAILABLE",
        message:
          "O assistente está indisponível agora. Sua mensagem foi salva: tente novamente em instantes ou peça para falar com um analista.",
      };
      return;
    }

    if (!final) {
      yield {
        type: "error",
        code: "AGENT_NO_RESPONSE",
        message: "O assistente não conseguiu responder. Tente de novo.",
      };
      return;
    }

    // Safety net owned by code: low self-assessed confidence always reaches a human.
    const current = (await conversations.findById(conversation.id)) ?? conversation;
    const escalate =
      current.status === "agent" &&
      final.trace.decisionReported &&
      isLowConfidence(final.trace.decision.confidence);
    const trace = escalate ? withLowConfidenceRule(final.trace) : final.trace;

    const text = final.text.trim() || "Não consegui formular uma resposta. Pode reformular?";
    const reply = agentMessage(
      newMessageBase(ids, clock, conversation.id),
      text,
      final.blocks,
      trace,
    );
    await messages.append(reply);
    yield { type: "agent_message", message: reply };

    if (escalate) yield* this.escalateLowConfidence(current, trace, employee);

    const latest = (await conversations.findById(conversation.id)) ?? current;
    yield { type: "done", conversation: latest };
  }

  private async *escalateLowConfidence(
    conversation: Conversation,
    trace: AgentTrace,
    employee: User,
  ): AsyncGenerator<ChatEvent> {
    const { handoff, messages, ids, clock } = this.deps;
    const confidence = trace.decision.confidence;
    const lastEmployeeMessages = await messages.listRecent(conversation.id, 6);
    const lastQuestion =
      [...lastEmployeeMessages].reverse().find((m) => m.role === "employee")?.content ?? "";
    const result = await handoff.handOff(conversation, {
      reason: "low_confidence",
      summary: `${employee.name} perguntou: "${lastQuestion}". Entendimento do agent: ${trace.decision.understanding}`,
      confidence,
    });
    if (!result.ok) return;

    const started = Date.now();
    const notice = agentMessage(
      newMessageBase(ids, clock, conversation.id),
      "Não tenho segurança suficiente para resolver isso sozinho, então encaminhei sua conversa para um analista. Ele já recebe o resumo do caso.",
      [],
      deterministicTrace(ids, {
        understanding: trace.decision.understanding,
        intent: "falar_com_analista",
        confidence,
        rationale: `Confiança ${Math.round(confidence * 100)}% abaixo do mínimo de ${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}%.`,
        rulesApplied: ["Transferência: o agent não tem segurança sobre o que fazer (Anexo A)"],
        steps: [
          {
            tool: "transferir_para_analista",
            label: "transferiu para um analista",
            input: { reason: "low_confidence", confidence },
            output: { group: result.value.handoff?.targetGroup },
          },
        ],
        latencyMs: Date.now() - started,
      }),
    );
    await messages.append(notice);
    yield { type: "agent_message", message: notice };
  }
}

function withLowConfidenceRule(trace: AgentTrace): AgentTrace {
  const percent = Math.round(trace.decision.confidence * 100);
  return {
    ...trace,
    decision: {
      ...trace.decision,
      rulesApplied: [
        ...trace.decision.rulesApplied,
        `Confiança ${percent}% < ${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}%: transferência automática para um analista`,
      ],
    },
  };
}
