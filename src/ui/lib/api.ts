import type { ApiErrorBody } from "../api-types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    // Non-JSON error (proxy/gateway): fall through to the generic message.
  }
  return new ApiError(
    response.status,
    body.code ?? "UNKNOWN",
    body.message ?? "Não foi possível completar a ação. Tente novamente.",
  );
}

/** JSON request helper: throws ApiError with the server's stable code and message. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    ...rest,
    ...(json !== undefined
      ? {
          method: rest.method ?? "POST",
          body: JSON.stringify(json),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
    cache: "no-store",
  });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}
