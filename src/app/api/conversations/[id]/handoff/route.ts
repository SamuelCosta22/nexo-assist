import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../_server/auth";
import { toConversationDto } from "../../../../_server/dto";
import { errorResponse, json, respond } from "../../../../_server/http";

/** Employee asks for a person directly, without the model (used when the assistant is down). */
export function POST(_request: Request, context: RouteContext<"/api/conversations/[id]/handoff">) {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const { id } = await context.params;
    const container = getContainer();
    const result = await container.requestHumanHelp.execute(user, id);
    return result.ok
      ? json({ conversation: toConversationDto(result.value, container.env.CHAT_MESSAGE_LIMIT) })
      : errorResponse(result.error);
  });
}
