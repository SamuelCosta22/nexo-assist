import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../../_server/auth";
import { toConversationDto } from "../../../../../_server/dto";
import { errorResponse, json, respond } from "../../../../../_server/http";

export function POST(
  _request: Request,
  context: RouteContext<"/api/console/conversations/[id]/close">,
) {
  return respond(async () => {
    const analyst = await requireApiUser("analyst");
    const { id } = await context.params;
    const container = getContainer();
    const result = await container.closeConversation.execute(analyst, id);
    return result.ok
      ? json({ conversation: toConversationDto(result.value, container.env.CHAT_MESSAGE_LIMIT) })
      : errorResponse(result.error);
  });
}
