import { ZodError } from "zod";
import { DomainError } from "@/domain/shared/domain-error";
import type { ApiErrorBody } from "@/ui/api-types";

/** Stable error codes -> HTTP status. Unknown codes are treated as bad requests. */
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_AUTHORIZED: 403,
  NOT_FOUND: 404,
  CONCURRENT_MODIFICATION: 409,
  INVALID_TRANSITION: 409,
  ACTION_NOT_PENDING: 409,
  MESSAGE_LIMIT_REACHED: 429,
  INVALID_MESSAGE: 400,
  INVALID_DRAFT: 422,
  INVALID_EDIT: 422,
  TICKETING_UNAVAILABLE: 503,
  AGENT_UNAVAILABLE: 503,
};

export function errorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    const body: ApiErrorBody = { code: error.code, message: error.message };
    return Response.json(body, { status: STATUS_BY_CODE[error.code] ?? 400 });
  }
  if (error instanceof ZodError) {
    const body: ApiErrorBody = { code: "INVALID_REQUEST", message: "Requisição inválida." };
    return Response.json(body, { status: 400 });
  }
  // Never leak internals to the client; the log has the detail.
  console.error("[api] unexpected error", error);
  const body: ApiErrorBody = {
    code: "INTERNAL_ERROR",
    message: "Algo deu errado. Tente novamente.",
  };
  return Response.json(body, { status: 500 });
}

/** Wraps a route handler so every failure becomes a consistent JSON error. */
export async function respond(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}

export function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, init);
}
