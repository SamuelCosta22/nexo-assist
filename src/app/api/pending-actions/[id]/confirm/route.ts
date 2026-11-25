import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../_server/auth";
import { errorResponse, json, respond } from "../../../../_server/http";

/**
 * "Confirmar": the only way a ticket is created, updated or reopened for an
 * employee. If the legacy system is down this answers 503 and the draft stays
 * pending, so the employee can simply press the button again.
 */
export function POST(
  _request: Request,
  context: RouteContext<"/api/pending-actions/[id]/confirm">,
) {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const { id } = await context.params;
    const result = await getContainer().confirmPendingAction.execute(user, id);
    return result.ok ? json({ ticketId: result.value.ticket.id }) : errorResponse(result.error);
  });
}
