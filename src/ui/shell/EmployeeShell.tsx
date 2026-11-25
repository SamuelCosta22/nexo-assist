"use client";

import { LogOut, MessageSquare, MessageSquarePlus, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { ConversationListItemDto, UserDto } from "../api-types";
import { Avatar } from "../components/Avatar";
import { NexoMark } from "../components/NexoMark";
import { api } from "../lib/api";
import { onConversationsChanged } from "../lib/events";
import { formatListTime } from "../lib/format";

const STATUS_DOT: Record<string, string> = {
  agent: "bg-success",
  awaiting_analyst: "bg-warning",
  with_analyst: "bg-primary",
  resolved: "bg-ink-3/40",
  closed: "bg-ink-3/40",
};

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-primary-soft font-medium text-primary-text" : "text-ink-2 hover:bg-desk"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

export function EmployeeShell({
  user,
  conversations: initialConversations,
  children,
}: {
  user: UserDto;
  conversations: ConversationListItemDto[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const onChat = pathname.startsWith("/atendimento");
  const onProfile = pathname.startsWith("/perfil");

  // Fresh list after every chat action, and now and then for changes made by an analyst.
  useEffect(() => {
    const load = async () => {
      try {
        const { items } = await api<{ items: ConversationListItemDto[] }>("/api/conversations");
        setConversations(items);
      } catch {
        // Keep showing the last known list.
      }
    };
    const stop = onConversationsChanged(() => void load());
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen bg-paper">
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-rule bg-paper md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5 text-ink">
          <NexoMark size={22} className="text-cta" />
          <span className="text-[15px] font-bold tracking-tight">Nexo Assist</span>
        </div>

        <nav className="space-y-1 px-3" aria-label="Principal">
          <NavLink href="/atendimento" active={onChat} icon={<MessageSquare className="size-4" />}>
            Atendimento
          </NavLink>
          <NavLink href="/perfil" active={onProfile} icon={<User className="size-4" />}>
            Meu perfil
          </NavLink>
        </nav>

        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Conversas
            </h2>
            <Link
              href="/atendimento"
              className="rounded p-1 text-ink-3 hover:bg-desk hover:text-cta"
              aria-label="Nova conversa"
              title="Nova conversa"
            >
              <MessageSquarePlus className="size-4" />
            </Link>
          </div>
          <ul className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
            {conversations.length === 0 && (
              <li className="px-3 py-2 text-xs text-ink-3">Nenhuma conversa ainda.</li>
            )}
            {conversations.map(({ conversation }) => {
              const href = `/atendimento/${conversation.id}`;
              const active = pathname === href;
              return (
                <li key={conversation.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${active ? "bg-desk text-ink" : "text-ink-2 hover:bg-desk"}`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[conversation.status] ?? "bg-ink-3/40"}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                    <span className="shrink-0 text-[10px] text-ink-3">
                      {formatListTime(conversation.updatedAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-rule p-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-[11px] text-ink-3">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 flex items-center gap-2 text-sm text-ink-2 hover:text-ink"
          >
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-rule px-4 sm:px-8">
          <nav aria-label="Você está em" className="flex items-center gap-2 text-[13px] text-ink-3">
            <span>Service desk de TI</span>
            <span aria-hidden="true">›</span>
            <span className="font-medium text-ink">{onProfile ? "Meu perfil" : "Atendimento"}</span>
          </nav>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success-text">
            <span className="size-1.5 rounded-full bg-success" />
            Assistente online
          </span>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
