"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  ChatStreamEvent,
  ConversationDto,
  ConversationViewDto,
  MessageDto,
  TraceAction,
  UserDto,
} from "../api-types";
import { api, ApiError, toApiError } from "../lib/api";
import { readEventStream } from "../lib/sse";
import type { DraftEditsInput } from "./PendingActionCard";

export interface StreamingState {
  text: string;
  steps: TraceAction[];
}

export interface ChatError {
  message: string;
  /** The agent failed after the message was saved: offer "tentar novamente". */
  retryable: boolean;
}

const POLL_MS = 3000;
const AGENT_ERRORS = new Set(["AGENT_UNAVAILABLE", "AGENT_NO_RESPONSE"]);

/**
 * All the client-side state of an employee conversation: optimistic sending,
 * the SSE stream (chips and text arriving live), draft actions, retry, and
 * polling while a human is involved.
 */
export function useEmployeeChat(user: UserDto, initial?: ConversationViewDto) {
  const router = useRouter();
  const [view, setView] = useState<ConversationViewDto | null>(initial ?? null);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [error, setError] = useState<ChatError | undefined>();
  const [busyActionId, setBusyActionId] = useState<string | undefined>();

  const refresh = useCallback(async (conversationId: string) => {
    setView(await api<ConversationViewDto>(`/api/conversations/${conversationId}`));
  }, []);

  const fail = useCallback((cause: unknown) => {
    setError({
      message:
        cause instanceof ApiError
          ? cause.message
          : "Não foi possível completar a ação. Tente novamente.",
      retryable: false,
    });
  }, []);

  const append = useCallback((message: MessageDto) => {
    setView((current) =>
      current && !current.messages.some((m) => m.id === message.id)
        ? { ...current, messages: [...current.messages, message] }
        : current,
    );
  }, []);

  const handleEvent = useCallback(
    (event: ChatStreamEvent, optimisticId: string | undefined) => {
      switch (event.type) {
        case "user_message":
          setView((current) =>
            current
              ? {
                  ...current,
                  messages: current.messages.map((m) =>
                    m.id === optimisticId ? event.message : m,
                  ),
                }
              : current,
          );
          break;
        case "step":
          setStreaming((s) => (s ? { ...s, steps: [...s.steps, event.action] } : s));
          break;
        case "text_delta":
          setStreaming((s) => (s ? { ...s, text: s.text + event.text } : s));
          break;
        case "agent_message":
          append(event.message);
          setStreaming((s) => (s ? { text: "", steps: [] } : s));
          break;
        case "error":
          setError({ message: event.message, retryable: AGENT_ERRORS.has(event.code) });
          break;
        case "done":
          break;
      }
    },
    [append],
  );

  const stream = useCallback(
    async (conversationId: string, body: unknown, optimisticId: string | undefined) => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await toApiError(response);
      await readEventStream<ChatStreamEvent>(response, (event) => handleEvent(event, optimisticId));
    },
    [handleEvent],
  );

  const createConversation = useCallback(async (): Promise<ConversationDto> => {
    const { conversation } = await api<{ conversation: ConversationDto }>("/api/conversations", {
      method: "POST",
    });
    setView({ conversation, employee: user, messages: [], pendingActions: {} });
    // Reflect the new conversation in the address bar without remounting mid-stream.
    window.history.replaceState(null, "", `/atendimento/${conversation.id}`);
    return conversation;
  }, [user]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;
      setError(undefined);
      setStreaming({ text: "", steps: [] });
      const optimisticId = `tmp-${Date.now()}`;
      try {
        const conversationId = view?.conversation.id ?? (await createConversation()).id;
        append({
          id: optimisticId,
          conversationId,
          role: "employee",
          authorId: user.id,
          authorName: user.name,
          content,
          blocks: [],
          createdAt: new Date().toISOString(),
        });
        try {
          await stream(conversationId, { content }, optimisticId);
        } catch (cause) {
          // Rejected before saving (limit, empty...): take the optimistic message back.
          setView((current) =>
            current
              ? { ...current, messages: current.messages.filter((m) => m.id !== optimisticId) }
              : current,
          );
          throw cause;
        }
        await refresh(conversationId);
        router.refresh();
      } catch (cause) {
        fail(cause);
      } finally {
        setStreaming(null);
      }
    },
    [append, createConversation, fail, refresh, router, stream, streaming, user, view],
  );

  const retry = useCallback(async () => {
    const conversationId = view?.conversation.id;
    if (!conversationId || streaming) return;
    setError(undefined);
    setStreaming({ text: "", steps: [] });
    try {
      await stream(conversationId, { retry: true }, undefined);
      await refresh(conversationId);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setStreaming(null);
    }
  }, [fail, refresh, router, stream, streaming, view]);

  const afterAction = useCallback(async () => {
    if (view) await refresh(view.conversation.id);
    router.refresh();
  }, [refresh, router, view]);

  const confirm = useCallback(
    async (actionId: string) => {
      setError(undefined);
      setBusyActionId(actionId);
      try {
        await api(`/api/pending-actions/${actionId}/confirm`, { method: "POST" });
      } catch (cause) {
        fail(cause);
      } finally {
        setBusyActionId(undefined);
      }
      await afterAction();
    },
    [afterAction, fail],
  );

  const cancel = useCallback(
    async (actionId: string) => {
      setError(undefined);
      try {
        await api(`/api/pending-actions/${actionId}/cancel`, { method: "POST" });
      } catch (cause) {
        fail(cause);
      }
      await afterAction();
    },
    [afterAction, fail],
  );

  const edit = useCallback(
    async (actionId: string, edits: DraftEditsInput) => {
      await api(`/api/pending-actions/${actionId}`, { method: "PATCH", json: edits });
      await afterAction();
    },
    [afterAction],
  );

  // While a human is involved the conversation changes without us asking: poll.
  const status = view?.conversation.status;
  const conversationId = view?.conversation.id;
  useEffect(() => {
    if (!conversationId || (status !== "awaiting_analyst" && status !== "with_analyst")) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(conversationId).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [conversationId, status, refresh]);

  // ⌘/Ctrl + Enter confirms the pending draft, as the card's shortcut hint says.
  const pendingActionId = view
    ? Object.values(view.pendingActions).find((action) => action.status === "pending")?.id
    : undefined;
  useEffect(() => {
    if (!pendingActionId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !busyActionId) {
        event.preventDefault();
        void confirm(pendingActionId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingActionId, busyActionId, confirm]);

  return {
    view,
    streaming,
    error,
    busyActionId,
    send,
    retry,
    confirm,
    cancel,
    edit,
    dismissError: () => setError(undefined),
  };
}
