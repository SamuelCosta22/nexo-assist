import { notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/application/errors";
import { getContainer } from "@/infrastructure/container";
import { ConsoleConversation } from "@/ui/console/ConsoleConversation";
import { requirePageUser } from "../../../_server/auth";
import { toConversationViewDto, toUserDto } from "../../../_server/dto";

export const metadata = { title: "Console · Nexo Assist" };

export default async function ConsoleConversationPage({ params }: PageProps<"/console/[id]">) {
  const analyst = await requirePageUser("analyst");
  const { id } = await params;
  const container = getContainer();

  const view = await container.getConversation.execute(analyst, id).catch((error: unknown) => {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) return undefined;
    throw error;
  });
  if (!view) notFound();

  return (
    <ConsoleConversation
      key={id}
      analyst={toUserDto(analyst)}
      initial={toConversationViewDto(view, container.env.CHAT_MESSAGE_LIMIT)}
    />
  );
}
