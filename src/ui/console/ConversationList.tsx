"use client";

import { Check, CheckCheck, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  ConsoleFilterDto,
  ConsoleListDto,
  ConversationListItemDto,
  UserDto,
} from "../api-types";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import { formatListTime } from "../lib/format";

const FILTERS: { id: ConsoleFilterDto; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "for_you", label: "Para você" },
  { id: "with_agent", label: "Com o agent" },
  { id: "mine", label: "Minhas" },
];

const POLL_MS = 3000;

/** The colored status line under each conversation (prototype screen 4). */
function statusLine(
  item: ConversationListItemDto,
  analyst: UserDto,
): { text: string; tone: string } {
  const { conversation } = item;
  switch (conversation.status) {
    case "awaiting_analyst": {
      const handoff = conversation.handoff;
      if (handoff?.reason === "low_confidence") {
        const percent =
          handoff.confidence !== undefined
            ? ` · confiança ${Math.round(handoff.confidence * 100)}%`
            : "";
        return { text: `Agent pediu ajuda${percent}`, tone: "text-warning-text" };
      }
      return {
        text: `Transferida${handoff?.ticketId ? ` · ${handoff.ticketId}` : ""}`,
        tone: "text-danger-text",
      };
    }
    case "with_analyst":
      return conversation.assignedAnalystId === analyst.id
        ? { text: "Você está atendendo", tone: "text-primary-text" }
        : { text: "Com outro analista", tone: "text-ink-3" };
    case "agent":
      return { text: "Agent atendendo", tone: "text-ink-3" };
    case "resolved":
      return { text: "Resolvida pelo agent", tone: "text-ink-3" };
    case "closed":
      return { text: "Atendimento encerrado", tone: "text-ink-3" };
  }
}

function Preview({ item }: { item: ConversationListItemDto }) {
  const last = item.lastMessage;
  if (!last) return <span className="text-ink-3">Sem mensagens</span>;
  const fromHuman = last.role === "analyst";
  const prefix = last.role === "agent" ? "Nexo: " : fromHuman ? "Você: " : "";
  return (
    <span className="flex min-w-0 items-center gap-1 text-ink-3">
      {last.role === "agent" && <CheckCheck className="size-3 shrink-0 text-primary" />}
      {fromHuman && <Check className="size-3 shrink-0" />}
      <span className="truncate">
        {prefix}
        {last.content}
      </span>
    </span>
  );
}

export function ConversationList({
  analyst,
  initial,
  hiddenOnMobile,
}: {
  analyst: UserDto;
  initial: ConsoleListDto;
  /** On phones the list yields the screen to the open conversation. */
  hiddenOnMobile: boolean;
}) {
  const pathname = usePathname();
  const [filter, setFilter] = useState<ConsoleFilterDto>("for_you");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ConsoleListDto>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          filter,
          ...(query.trim() ? { q: query.trim() } : {}),
        });
        const next = await api<ConsoleListDto>(`/api/console/conversations?${params}`);
        if (!cancelled) {
          setData(next);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [filter, query]);

  const now = new Date();
  return (
    <section
      aria-label="Conversas"
      className={`${hiddenOnMobile ? "hidden" : "flex"} w-full shrink-0 flex-col border-r border-rule bg-paper md:flex md:w-[340px]`}
    >
      <header className="flex items-center justify-between px-5 pb-3 pt-5">
        <h1 className="text-lg font-semibold text-ink">Conversas</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success-text">
          <span className="size-1.5 rounded-full bg-success" />
          Disponível
        </span>
      </header>

      <div className="px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa ou chamado"
            className="h-9 w-full rounded-lg border border-rule bg-desk pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-cta"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtros">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                filter === id
                  ? "bg-primary-soft font-medium text-primary-text"
                  : "text-ink-2 hover:bg-desk"
              }`}
            >
              {label} <span className="ml-0.5 text-ink-3">{data.counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <p
          role="alert"
          className="mx-5 mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger-text"
        >
          Não foi possível atualizar a lista. Tentando de novo…
        </p>
      )}

      <ul className="mt-3 flex-1 overflow-y-auto">
        {data.items.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-ink-3">
            Nenhuma conversa neste filtro.
          </li>
        )}
        {data.items.map((item) => {
          const href = `/console/${item.conversation.id}`;
          const active = pathname === href;
          const line = statusLine(item, analyst);
          const waiting = item.conversation.status === "awaiting_analyst";
          return (
            <li key={item.conversation.id}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex gap-3 border-b border-rule/60 px-5 py-3.5 transition ${active ? "bg-primary-soft/60" : "hover:bg-desk"}`}
              >
                <Avatar name={item.employee.name} size={40} online />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">
                      {item.employee.name}
                    </span>
                    <time
                      dateTime={item.conversation.updatedAt}
                      className={`shrink-0 text-[11px] ${waiting ? "font-semibold text-primary-text" : "text-ink-3"}`}
                    >
                      {formatListTime(item.conversation.updatedAt, now)}
                    </time>
                  </span>
                  <span className="mt-0.5 block text-[13px]">
                    <Preview item={item} />
                  </span>
                  <span className={`mt-0.5 block text-[11px] font-medium ${line.tone}`}>
                    {line.text}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
