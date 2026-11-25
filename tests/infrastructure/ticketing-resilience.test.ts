import { describe, expect, it, vi } from "vitest";
import { TicketingUnavailableError } from "@/application/errors";
import type { TicketingGateway } from "@/application/ports/ticketing-gateway";
import { FlakyTicketingGateway } from "@/infrastructure/ticketing/flaky-ticketing-gateway";
import { RetryingTicketingGateway } from "@/infrastructure/ticketing/retrying-ticketing-gateway";

const inner = (impl: () => Promise<unknown[]>): TicketingGateway =>
  ({ listByRequester: vi.fn(impl) }) as unknown as TicketingGateway;

describe("FlakyTicketingGateway", () => {
  it("fails before reaching the real service when the dice say so", async () => {
    const real = inner(async () => []);
    const flaky = new FlakyTicketingGateway(real, 0.5, () => 0.1);
    await expect(flaky.listByRequester("u1")).rejects.toBeInstanceOf(TicketingUnavailableError);
    expect(real.listByRequester).not.toHaveBeenCalled();
  });

  it("passes through when the failure rate is 0", async () => {
    const real = inner(async () => []);
    await new FlakyTicketingGateway(real, 0, () => 0).listByRequester("u1");
    expect(real.listByRequester).toHaveBeenCalledTimes(1);
  });
});

describe("RetryingTicketingGateway", () => {
  const sleep = vi.fn(async () => {});

  it("absorbs a short outage", async () => {
    let calls = 0;
    const real = inner(async () => {
      calls += 1;
      if (calls < 3) throw new TicketingUnavailableError();
      return [];
    });
    const gateway = new RetryingTicketingGateway(real, { retries: 2, delayMs: 10, sleep });
    await expect(gateway.listByRequester("u1")).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it("gives up after the configured retries and surfaces the outage", async () => {
    const real = inner(async () => {
      throw new TicketingUnavailableError();
    });
    const gateway = new RetryingTicketingGateway(real, { retries: 2, delayMs: 10, sleep });
    await expect(gateway.listByRequester("u1")).rejects.toBeInstanceOf(TicketingUnavailableError);
    expect(real.listByRequester).toHaveBeenCalledTimes(3);
  });

  it("does not retry unrelated errors", async () => {
    const real = inner(async () => {
      throw new Error("bug");
    });
    const gateway = new RetryingTicketingGateway(real, { retries: 2, delayMs: 10, sleep });
    await expect(gateway.listByRequester("u1")).rejects.toThrow("bug");
    expect(real.listByRequester).toHaveBeenCalledTimes(1);
  });
});
