import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../../_server/auth";
import { json, respond } from "../../../../../_server/http";

/** The "Chamados da Ana" panel. Separate from the conversation so a slow or down legacy system never blocks the chat. */
export function GET(
  _request: Request,
  context: RouteContext<"/api/console/conversations/[id]/tickets">,
) {
  return respond(async () => {
    const analyst = await requireApiUser("analyst");
    const { id } = await context.params;
    return json(await getContainer().listEmployeeTickets.execute(analyst, id));
  });
}
