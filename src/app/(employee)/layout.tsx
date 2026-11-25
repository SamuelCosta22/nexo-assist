import { getContainer } from "@/infrastructure/container";
import { EmployeeShell } from "@/ui/shell/EmployeeShell";
import { requirePageUser } from "../_server/auth";
import { toListItemDto, toUserDto } from "../_server/dto";

export default async function EmployeeLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser("employee");
  const container = getContainer();
  const summaries = await container.listMyConversations.execute(user);
  return (
    <EmployeeShell
      user={toUserDto(user)}
      conversations={summaries.map((s) => toListItemDto(s, container.env.CHAT_MESSAGE_LIMIT))}
    >
      {children}
    </EmployeeShell>
  );
}
