import { MessagesSquare } from "lucide-react";

export const metadata = { title: "Console · Nexo Assist" };

export default function ConsoleHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-desk text-center">
      <MessagesSquare className="size-10 text-ink-3/50" />
      <h2 className="mt-4 font-display text-2xl text-ink">Selecione uma conversa</h2>
      <p className="mt-1 max-w-[320px] text-sm text-ink-3">
        As conversas que precisam de você aparecem em “Para você”, com o resumo do caso do agent.
      </p>
    </div>
  );
}
