import { ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  ConcurrencyError,
  ForbiddenError,
  NotFoundError,
  TicketingUnavailableError,
} from "@/application/errors";
import { MessageLimitReachedError } from "@/domain/conversation/conversation";
import { errorResponse } from "./http";

describe("errorResponse", () => {
  it.each([
    [new NotFoundError("x"), 404, "NOT_FOUND"],
    [new ForbiddenError("x"), 403, "FORBIDDEN"],
    [new ConcurrencyError(), 409, "CONCURRENT_MODIFICATION"],
    [new TicketingUnavailableError(), 503, "TICKETING_UNAVAILABLE"],
    [new MessageLimitReachedError(30), 429, "MESSAGE_LIMIT_REACHED"],
  ])("maps %s to its HTTP status", async (error, status, code) => {
    const response = errorResponse(error);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });

  it("turns validation failures into 400", async () => {
    const response = errorResponse(new ZodError([]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("never leaks the message of an unexpected error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new Error("password=hunter2 in connection string"));
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("hunter2");
  });
});
