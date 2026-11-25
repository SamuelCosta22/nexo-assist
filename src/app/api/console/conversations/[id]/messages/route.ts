import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../../_server/auth";
import { toMessageDto } from "../../../../../_server/dto";
import { errorResponse, json, respond } from "../../../../../_server/http";

const body = z.object({ content: z.string() });

export function POST(
  request: Request,
  context: RouteContext<"/api/console/conversations/[id]/messages">,
) {
  return respond(async () => {
    const analyst = await requireApiUser("analyst");
    const { id } = await context.params;
    const { content } = body.parse(await request.json());
    const result = await getContainer().sendAnalystMessage.execute(analyst, id, content);
    return result.ok
      ? json({ message: toMessageDto(result.value) }, { status: 201 })
      : errorResponse(result.error);
  });
}
