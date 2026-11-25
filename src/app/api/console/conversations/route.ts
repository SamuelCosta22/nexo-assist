import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../_server/auth";
import { toListItemDto } from "../../../_server/dto";
import { json, respond } from "../../../_server/http";

const query = z.object({
  filter: z.enum(["all", "for_you", "with_agent", "mine"]).default("for_you"),
  q: z.string().max(100).optional(),
});

export function GET(request: Request) {
  return respond(async () => {
    const analyst = await requireApiUser("analyst");
    const params = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const container = getContainer();
    const list = await container.listConsoleConversations.execute(analyst, params.filter, params.q);
    return json({
      items: list.items.map((item) => toListItemDto(item, container.env.CHAT_MESSAGE_LIMIT)),
      counts: list.counts,
    });
  });
}
