"use client";

import { ArrowLeft, Hand, Headset, MoreVertical, PanelRight, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentTrace, ConversationViewDto, MessageDto, UserDto } from "../api-types";
import { AgentBlocks, type ChatActions } from "../chat/MessageItem";
import { Composer } from "../chat/Composer";
import { Avatar } from "../components/Avatar";
import { RichText } from "../components/RichText";
import { formatTime } from "../lib/format";
import { TracePanel } from "../trace/TracePanel";
import { HandoffSummary } from "./HandoffSummary";
import { TicketsPanel } from "./TicketsPanel";
import { useConsoleConversation } from "./useConsoleConversation";

const noop = () => {};
const readOnlyActions: ChatActions = {
  sendText: noop,
  confirm: noop,
  cancel: noop,
  edit: async () => {},
  openTrace: noop,
};

function StatusPill({ view, analyst }: { view: ConversationViewDto; analyst: UserDto }) {
  const { status, assignedAnalystId } = view.conversation;
  const map = {
    agent: { text: "Agent atendendo", cls: "bg-desk text-ink-2" },
    awaiting_analyst: { text: "Aguardando atendente", cls: "bg-warning-soft text-warning-text" },
    with_analyst: {
      text: assignedAnalystId === analyst.id ? "Você está atendendo" : "Em atendimento",
      cls: "bg-primary-soft text-primary-text",
    },
    resolved: { text: "Resolvida pelo agent", cls: "bg-success-soft text-success-text" },
    closed: { text: "Encerrada", cls: "bg-desk text-ink-3" },
  } as const;
  const { text, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cls}`}
    >
      {status === "awaiting_analyst" && <Hand className="size-3.5" />}
      {text}
    </span>
  );
}

function Bubble({
  message,
  onTrace,
}: {
  message: MessageDto;
  onTrace: (trace: AgentTrace) => void;
}) {
  const time = formatTime(message.createdAt);

  if (message.role === "system") {
    return (
      <div className="flex items-center gap-3 py-1 text-[11px] text-ink-3" role="status">
        <span className="h-px flex-1 bg-rule" />
        <span>
          {message.content} · {time}
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    );
  }
  if (message.role === "employee") {
    return (
      <div className="flex max-w-[78%] flex-col items-start gap-1">
        <p className="whitespace-pre-wrap break-words rounded-xl border border-rule bg-paper px-4 py-2.5 text-sm leading-relaxed text-ink shadow-sm">
          {message.content}
        </p>
        <span className="text-[10px] text-ink-3">{time}</span>
      </div>
    );
  }

  const isAgent = message.role === "agent";
  return (
    <div className="ml-auto flex max-w-[78%] flex-col items-end gap-1">
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        <span className="font-semibold text-ink">{message.authorName}</span>
        <span
          className={`rounded px-1.5 py-0.5 font-semibold ${isAgent ? "bg-primary-soft text-primary-text" : "bg-success-soft text-success-text"}`}
        >
          {isAgent ? "IA" : (message.authorBadge ?? "Analista")}
        </span>
        <span>{time}</span>
        {isAgent && message.trace && (
          <button
            type="button"
            onClick={() => message.trace && onTrace(message.trace)}
            className="font-medium text-cta hover:underline"
          >
            ver decisão
          </button>
        )}
      </div>
      <div
        className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed text-ink ${
          isAgent ? "bg-primary-soft" : "border border-success/30 bg-success-soft"
        }`}
      >
        {isAgent ? (
          <RichText text={message.content} />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
      </div>
    </div>
  );
}

export function ConsoleConversation({
  analyst,
  initial,
}: {
  analyst: UserDto;
  initial: ConversationViewDto;
}) {
  const { view, tickets, error, pending, transition, send, dismissError } = useConsoleConversation(
    initial.conversation.id,
    initial,
  );
  const [trace, setTrace] = useState<AgentTrace | undefined>();
  const [showTickets, setShowTickets] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messageCount = view.messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount]);

  const { conversation, employee } = view;
  const mine =
    conversation.status === "with_analyst" && conversation.assignedAnalystId === analyst.id;
  const waiting = conversation.status === "awaiting_analyst";
  const needsAssume = waiting || conversation.status === "agent";
  const ticketId = conversation.handoff?.ticketId;
  const firstName = employee.name.split(" ")[0];

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col bg-desk">
        <header className="flex items-center gap-3 border-b border-rule bg-paper px-5 py-3">
          <Link
            href="/console"
            aria-label="Voltar para a lista"
            className="-ml-2 rounded-md p-2 text-ink-2 hover:bg-desk md:hidden"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <Avatar name={employee.name} size={36} online />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink">{employee.name}</h2>
            <p className="truncate text-xs text-ink-3">
              online{employee.department ? ` · ${employee.department}` : ""}
              {ticketId ? ` · ${ticketId}` : ""}
            </p>
          </div>
          {mine ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void transition("hand-back")}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-rule bg-paper px-3 text-sm font-medium text-ink hover:bg-desk disabled:opacity-60"
              >
                <Undo2 className="size-4" /> Devolver ao agent
              </button>
              <button
                type="button"
                onClick={() => void transition("close")}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 text-sm font-medium text-danger-text hover:bg-danger-soft/70 disabled:opacity-60"
              >
                Encerrar atendimento
              </button>
            </div>
          ) : (
            <StatusPill view={view} analyst={analyst} />
          )}
          <button
            type="button"
            onClick={() => setShowTickets((value) => !value)}
            aria-label="Chamados do funcionário"
            aria-pressed={showTickets}
            className="rounded-md p-2 text-ink-3 hover:bg-desk xl:hidden"
          >
            <PanelRight className="size-4" />
          </button>
          <MoreVertical className="hidden size-4 text-ink-3 sm:block" aria-hidden="true" />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto flex max-w-[760px] flex-col gap-3">
            {conversation.handoff && <HandoffSummary handoff={conversation.handoff} />}
            {view.messages.map((message) => (
              <div key={message.id} className="flex flex-col gap-2">
                <Bubble message={message} onTrace={setTrace} />
                {message.role === "agent" && message.blocks.some((b) => b.type !== "options") && (
                  <div className="ml-auto w-full max-w-[78%]">
                    <AgentBlocks
                      message={message}
                      pendingActions={view.pendingActions}
                      isLast={false}
                      readOnly
                      viewer="analyst"
                      actions={readOnlyActions}
                    />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="border-t border-rule bg-paper px-5 py-3">
          {error && (
            <p
              role="alert"
              className="mb-2 flex items-start justify-between gap-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text"
            >
              {error}
              <button type="button" onClick={dismissError} className="text-xs underline">
                fechar
              </button>
            </p>
          )}

          {waiting && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-warning-soft text-warning-text">
                <Hand className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{firstName} espera um atendente</p>
                <p className="text-xs text-ink-3">
                  Agent pausado · {conversation.handoff?.targetGroup}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void transition("hand-back")}
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-rule bg-paper px-4 text-sm font-medium text-ink hover:bg-desk disabled:opacity-60"
              >
                <Undo2 className="size-4" /> Devolver ao agent
              </button>
              <button
                type="button"
                onClick={() => void transition("assume")}
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-cta px-4 text-sm font-semibold text-white hover:bg-cta/90 disabled:opacity-60"
              >
                <Headset className="size-4" /> {pending ? "Assumindo…" : "Assumir atendimento"}
              </button>
            </div>
          )}

          {conversation.status === "agent" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-ink-3">O agent está atendendo esta conversa.</p>
              <button
                type="button"
                onClick={() => void transition("assume")}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-rule bg-paper px-3 text-sm font-medium text-ink hover:bg-desk disabled:opacity-60"
              >
                <Headset className="size-4" /> Assumir atendimento
              </button>
            </div>
          )}

          {conversation.status === "with_analyst" && !mine && (
            <p className="text-sm text-ink-3">
              {view.analyst?.name ?? "Outro analista"} está atendendo esta conversa.
            </p>
          )}
          {(conversation.status === "resolved" || conversation.status === "closed") && (
            <p className="text-sm text-ink-3">Esta conversa foi finalizada.</p>
          )}

          {mine && (
            <Composer
              disabled={pending}
              placeholder={`Escreva para ${firstName}…`}
              onSend={(text) => void send(text)}
            />
          )}
          {needsAssume && (
            <div className="mt-2 rounded-lg bg-desk px-3 py-2 text-sm text-ink-3">
              Assuma o atendimento para responder.
            </div>
          )}
        </footer>
      </section>

      {trace ? (
        <div className="fixed inset-0 z-40 bg-paper xl:static xl:z-auto xl:w-[380px] xl:shrink-0 xl:border-l xl:border-rule">
          <TracePanel trace={trace} onClose={() => setTrace(undefined)} />
        </div>
      ) : (
        <div
          className={`${showTickets ? "fixed inset-0 z-40 block" : "hidden"} bg-paper xl:static xl:block xl:w-[340px] xl:shrink-0 xl:border-l xl:border-rule`}
        >
          <TicketsPanel view={view} tickets={tickets} onClose={() => setShowTickets(false)} />
        </div>
      )}
    </div>
  );
}
