"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationViewDto, EmployeeTicketsDto } from "../api-types";
import { api, ApiError } from "../lib/api";

const POLL_MS = 2500;
const TICKETS_POLL_MS = 8000;

export type ConsoleAction = "assume" | "hand-back" | "close";

/** Live view of one conversation for the analyst: messages, tickets and the three transitions. */
export function useConsoleConversation(conversationId: string, initial: ConversationViewDto) {
  const [view, setView] = useState(initial);
  const [tickets, setTickets] = useState<EmployeeTicketsDto | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setView(await api<ConversationViewDto>(`/api/console/conversations/${conversationId}`));
  }, [conversationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await api<EmployeeTicketsDto>(
          `/api/console/conversations/${conversationId}/tickets`,
        );
        if (!cancelled) setTickets(next);
      } catch {
        if (!cancelled) setTickets({ tickets: [], open: 0, closed: 0, available: false });
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, TICKETS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId]);

  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      setError(undefined);
      setPending(true);
      try {
        await work();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Não foi possível completar a ação.");
      } finally {
        setPending(false);
      }
      await refresh().catch(() => {});
    },
    [refresh],
  );

  const transition = useCallback(
    (action: ConsoleAction) =>
      run(() => api(`/api/console/conversations/${conversationId}/${action}`, { method: "POST" })),
    [conversationId, run],
  );

  const send = useCallback(
    (content: string) =>
      run(() =>
        api(`/api/console/conversations/${conversationId}/messages`, { json: { content } }),
      ),
    [conversationId, run],
  );

  return {
    view,
    tickets,
    error,
    pending,
    transition,
    send,
    dismissError: () => setError(undefined),
  };
}
