import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../_server/auth";
import { toConversationViewDto } from "../../../../_server/dto";
import { json, respond } from "../../../../_server/http";

export function GET(_request: Request, context: RouteContext<"/api/console/conversations/[id]">) {
  return respond(async () => {
    const analyst = await requireApiUser("analyst");
    const { id } = await context.params;
    const container = getContainer();
    const view = await container.getConversation.execute(analyst, id);
    return json(toConversationViewDto(view, container.env.CHAT_MESSAGE_LIMIT));
  });
}
