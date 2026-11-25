import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../_server/auth";
import { toConversationDto, toListItemDto } from "../../_server/dto";
import { json, respond } from "../../_server/http";

export function GET() {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const container = getContainer();
    const summaries = await container.listMyConversations.execute(user);
    return json({
      items: summaries.map((s) => toListItemDto(s, container.env.CHAT_MESSAGE_LIMIT)),
    });
  });
}

export function POST() {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const container = getContainer();
    const conversation = await container.startConversation.execute(user);
    return json(
      { conversation: toConversationDto(conversation, container.env.CHAT_MESSAGE_LIMIT) },
      { status: 201 },
    );
  });
}
