"use client";

import { AlertCircle, Headset, Lock, MessageSquarePlus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentTrace, ConversationViewDto, UserDto } from "../api-types";
import { TraceChips } from "../trace/TraceChips";
import { TracePanel } from "../trace/TracePanel";
import { Composer } from "./Composer";
import { MessageItem, type ChatActions } from "./MessageItem";
import { useEmployeeChat } from "./useEmployeeChat";

const SUGGESTIONS = [
  "Meu notebook não conecta na VPN. Erro 809.",
  "Qual o status do meu chamado?",
  "Preciso de um segundo monitor para home office",
  "Qual o horário do service desk?",
];

function TypingBubble() {
  return (
    <div
      className="inline-flex w-fit items-center gap-1 rounded-xl border border-rule bg-paper px-4 py-3 shadow-sm"
      role="status"
      aria-label="O assistente está digitando"
    >
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="size-1.5 animate-bounce rounded-full bg-ink-3/60"
          style={{ animationDelay: `${dot * 150}ms` }}
        />
      ))}
    </div>
  );
}

function StatusBanner({ view }: { view: ConversationViewDto }) {
  const { conversation, analyst } = view;
  if (conversation.status === "awaiting_analyst") {
    return (
      <div
        className="mb-3 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-text"
        role="status"
      >
        <Headset className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Aguardando atendente</strong>
          {conversation.handoff ? ` · ${conversation.handoff.targetGroup}` : ""}. O assistente está
          pausado até um analista assumir; ele recebe o resumo do seu caso.
        </p>
      </div>
    );
  }
  if (conversation.status === "with_analyst") {
    return (
      <div
        className="mb-3 flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success-text"
        role="status"
      >
        <Headset className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">{analyst?.name ?? "Um analista"}</strong>
          {analyst?.supportLevel ? ` (${analyst.supportLevel})` : ""} está atendendo você. O
          assistente está pausado.
        </p>
      </div>
    );
  }
  if (conversation.status === "resolved" || conversation.status === "closed") {
    return (
      <div
        className="mb-3 rounded-xl border border-rule bg-desk px-4 py-3 text-sm text-ink-3"
        role="status"
      >
        {conversation.status === "resolved" ? "Conversa resolvida." : "Atendimento encerrado."}{" "}
        Envie uma mensagem para continuar de onde parou.
      </div>
    );
  }
  return null;
}

export function ChatView({ user, initial }: { user: UserDto; initial?: ConversationViewDto }) {
  const chat = useEmployeeChat(user, initial);
  const { view, streaming, error } = chat;
  const [trace, setTrace] = useState<AgentTrace | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const messageCount = view?.messages.length ?? 0;
  const streamedText = streaming?.text.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, streamedText, streaming?.steps.length]);

  const actions: ChatActions = {
    sendText: (text) => void chat.send(text),
    confirm: (id) => void chat.confirm(id),
    cancel: (id) => void chat.cancel(id),
    edit: chat.edit,
    openTrace: setTrace,
    busyActionId: chat.busyActionId,
  };

  const conversation = view?.conversation;
  const limit = conversation?.messageLimit ?? 30;
  const count = conversation?.employeeMessageCount ?? 0;
  const withHuman =
    conversation?.status === "awaiting_analyst" || conversation?.status === "with_analyst";
  const limitReached = !withHuman && count >= limit;
  const messages = view?.messages ?? [];
  const lastAgentIndex = messages.reduce((last, m, i) => (m.role === "agent" ? i : last), -1);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-8 sm:px-8">
          <div className="mx-auto flex max-w-[680px] flex-col gap-4">
            {messages.length === 0 && !streaming && (
              <div className="py-16 text-center">
                <h1 className="font-display text-4xl text-ink">Olá, {user.name.split(" ")[0]}.</h1>
                <p className="mt-2 text-sm text-ink-3">
                  Descreva o que está acontecendo. Eu cuido do resto.
                </p>
                <div className="mx-auto mt-8 flex max-w-[520px] flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void chat.send(suggestion)}
                      className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-[13px] text-ink-2 transition hover:border-cta hover:text-ink"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                pendingActions={view?.pendingActions ?? {}}
                isLast={index === lastAgentIndex && index === messages.length - 1}
                readOnly={Boolean(streaming) || withHuman}
                actions={actions}
              />
            ))}

            {streaming && (
              <div className="flex max-w-[92%] flex-col gap-1.5">
                <TraceChips actions={streaming.steps} />
                {streaming.text ? (
                  <div className="whitespace-pre-wrap rounded-xl border border-rule bg-paper px-4 py-3 text-sm leading-relaxed text-ink shadow-sm">
                    {streaming.text}
                  </div>
                ) : (
                  <TypingBubble />
                )}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-text"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="flex-1">
                  <p>{error.message}</p>
                  {error.retryable && (
                    <button
                      type="button"
                      onClick={() => void chat.retry()}
                      className="mt-2 inline-flex items-center gap-1.5 font-semibold underline"
                    >
                      <RotateCcw className="size-3.5" /> Tentar novamente
                    </button>
                  )}
                </div>
                <button type="button" onClick={chat.dismissError} className="text-xs underline">
                  fechar
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-rule/60 bg-paper px-4 pb-4 pt-3 sm:px-8">
          <div className="mx-auto max-w-[680px]">
            {view && <StatusBanner view={view} />}
            {limitReached ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-desk px-4 py-3 text-sm text-ink-2">
                <Lock className="size-4 text-ink-3" />
                <p className="flex-1">
                  Esta conversa atingiu o limite de {limit} mensagens. Comece uma nova conversa para
                  continuar.
                </p>
                <Link
                  href="/atendimento"
                  className="inline-flex items-center gap-1.5 rounded-md bg-cta px-3 py-1.5 text-sm font-semibold text-white"
                >
                  <MessageSquarePlus className="size-4" /> Nova conversa
                </Link>
              </div>
            ) : (
              <Composer
                disabled={Boolean(streaming)}
                placeholder={withHuman ? "Escreva para o analista…" : "Escreva para o Nexo…"}
                onSend={(text) => void chat.send(text)}
                counter={`${count}/${limit} mensagens nesta sessão`}
              />
            )}
          </div>
        </div>
      </div>

      {trace && (
        <div className="fixed inset-0 z-40 bg-paper lg:static lg:z-auto lg:w-[380px] lg:shrink-0 lg:border-l lg:border-rule">
          <TracePanel trace={trace} onClose={() => setTrace(undefined)} />
        </div>
      )}
    </div>
  );
}
