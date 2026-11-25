"use client";

import { LogOut, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ConsoleListDto, UserDto } from "../api-types";
import { Avatar } from "../components/Avatar";
import { NexoMark } from "../components/NexoMark";
import { api } from "../lib/api";
import { ConversationList } from "./ConversationList";

export function ConsoleShell({
  analyst,
  initialList,
  children,
}: {
  analyst: UserDto;
  initialList: ConsoleListDto;
  children: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen bg-paper">
      <nav
        aria-label="Principal"
        className="hidden w-16 shrink-0 flex-col items-center border-r border-rule bg-paper py-4 sm:flex"
      >
        <NexoMark size={22} className="text-cta" />
        <div className="mt-6">
          <span
            aria-current="page"
            className="relative flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-text"
            title="Conversas"
          >
            <MessageSquare className="size-5" />
            {initialList.counts.for_you > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-cta text-[9px] font-bold text-white">
                {initialList.counts.for_you}
              </span>
            )}
          </span>
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
            className="rounded-md p-2 text-ink-3 hover:bg-desk hover:text-ink"
          >
            <LogOut className="size-4" />
          </button>
          <Avatar name={analyst.name} size={34} online />
        </div>
      </nav>
      <ConversationList analyst={analyst} initial={initialList} />
      <div className="hidden min-w-0 flex-1 md:flex">{children}</div>
    </div>
  );
}
