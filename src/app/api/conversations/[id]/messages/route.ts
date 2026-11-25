import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import type { ChatEvent } from "@/application/use-cases/send-employee-message";
import type { ChatStreamEvent } from "@/ui/api-types";
import { requireApiUser } from "../../../../_server/auth";
import { toMessageDto } from "../../../../_server/dto";
import { errorResponse, respond } from "../../../../_server/http";

// The agent can take a while (several model calls); allow it on serverless hosts.
export const maxDuration = 60;

const body = z.union([
  z.object({ content: z.string() }),
  /** Re-run the agent for the last message after a failure. */
  z.object({ retry: z.literal(true) }),
]);

const encoder = new TextEncoder();
const frame = (event: ChatStreamEvent) =>
  encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

function toStreamEvent(event: ChatEvent): ChatStreamEvent {
  switch (event.type) {
    case "agent_message":
    case "system_message":
      return { type: "agent_message", message: toMessageDto(event.message) };
    case "done":
      return { type: "done" };
    default:
      return event;
  }
}

/**
 * Validation and persistence of the employee message happen BEFORE streaming
 * starts, so a rejected message (limit reached, empty, someone else's
 * conversation) is a normal HTTP error. Only the agent's work is streamed.
 */
export function POST(request: Request, context: RouteContext<"/api/conversations/[id]/messages">) {
  return respond(async () => {
    const user = await requireApiUser("employee");
    const { id } = await context.params;
    const input = body.parse(await request.json());

    const { sendEmployeeMessage } = getContainer();
    const begun =
      "retry" in input
        ? await sendEmployeeMessage.beginRetry(user, id)
        : await sendEmployeeMessage.begin(user, id, input.content);
    if (!begun.ok) return errorResponse(begun.error);
    const turn = begun.value;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(
            frame({ type: "user_message", message: toMessageDto(turn.userMessage) }),
          );
          for await (const event of turn.run(request.signal)) {
            controller.enqueue(frame(toStreamEvent(event)));
          }
        } catch (error) {
          console.error("[chat] stream failed", error);
          controller.enqueue(
            frame({
              type: "error",
              code: "INTERNAL_ERROR",
              message: "Algo deu errado. Tente novamente.",
            }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
