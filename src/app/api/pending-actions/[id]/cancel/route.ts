import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../../_server/auth";
import { errorResponse, json, respond } from "../../../../_server/http";

export function POST(_request: Request, context: RouteContext<"/api/pending-actions/[id]/cancel">) {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const { id } = await context.params;
    const result = await getContainer().cancelPendingAction.execute(user, id);
    return result.ok ? json({ ok: true }) : errorResponse(result.error);
  });
}
