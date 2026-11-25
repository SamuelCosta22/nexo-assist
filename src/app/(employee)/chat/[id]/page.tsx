import { notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/application/errors";
import { getContainer } from "@/infrastructure/container";
import { ChatView } from "@/ui/chat/ChatView";
import { modelChoices } from "../../../_server/models";
import { requirePageUser } from "../../../_server/auth";
import { toConversationViewDto, toUserDto } from "../../../_server/dto";

export const metadata = { title: "Atendimento · Nexo Assist" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const user = await requirePageUser("employee");
  const { id } = await params;
  const container = getContainer();

  const view = await container.getConversation.execute(user, id).catch((error: unknown) => {
    // Someone else's conversation looks exactly like a missing one.
    if (error instanceof NotFoundError || error instanceof ForbiddenError) return undefined;
    throw error;
  });
  if (!view) notFound();

  return (
    <ChatView
      key={id}
      user={toUserDto(user)}
      models={modelChoices()}
      initial={toConversationViewDto(view, container.env.CHAT_MESSAGE_LIMIT)}
    />
  );
}
