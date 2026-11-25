import { z } from "zod";
import { CATEGORIES, IMPACTS } from "@/domain/ticketing/vocabulary";
import { getContainer } from "@/infrastructure/container";
import { requireApiUser } from "../../../_server/auth";
import { errorResponse, json, respond } from "../../../_server/http";

const body = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  impact: z.enum(IMPACTS).optional(),
});

/** "Editar" on the draft card. */
export function PATCH(request: Request, context: RouteContext<"/api/pending-actions/[id]">) {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const { id } = await context.params;
    const edits = body.parse(await request.json());
    const result = await getContainer().editPendingAction.execute(user, id, edits);
    return result.ok ? json({ ok: true }) : errorResponse(result.error);
  });
}
