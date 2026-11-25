import { getContainer } from "@/infrastructure/container";
import { ConsoleShell } from "@/ui/console/ConsoleShell";
import { requirePageUser } from "../_server/auth";
import { toListItemDto, toUserDto } from "../_server/dto";

export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const analyst = await requirePageUser("analyst");
  const container = getContainer();
  const list = await container.listConsoleConversations.execute(analyst, "for_you");
  return (
    <ConsoleShell
      analyst={toUserDto(analyst)}
      initialList={{
        items: list.items.map((item) => toListItemDto(item, container.env.CHAT_MESSAGE_LIMIT)),
        counts: list.counts,
      }}
    >
      {children}
    </ConsoleShell>
  );
}
