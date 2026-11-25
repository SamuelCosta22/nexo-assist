import { TicketingUnavailableError } from "@/application/errors";
import type { TicketingGateway } from "@/application/ports/ticketing-gateway";

export interface RetryOptions {
  /** Extra attempts after the first one. */
  readonly retries: number;
  readonly delayMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resilience for an unreliable dependency: brief outages ("indisponível por
 * alguns segundos") are absorbed with a few quick retries, so the employee
 * rarely notices. Anything still failing surfaces as TicketingUnavailableError
 * and the agent says so honestly instead of inventing an answer.
 */
export class RetryingTicketingGateway implements TicketingGateway {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly inner: TicketingGateway,
    private readonly options: RetryOptions,
  ) {
    this.sleep = options.sleep ?? defaultSleep;
  }

  private async attempt<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        if (!(error instanceof TicketingUnavailableError) || attempt >= this.options.retries)
          throw error;
        await this.sleep(this.options.delayMs * (attempt + 1));
      }
    }
  }

  listByRequester: TicketingGateway["listByRequester"] = (...args) =>
    this.attempt(() => this.inner.listByRequester(...args));
  findById: TicketingGateway["findById"] = (...args) =>
    this.attempt(() => this.inner.findById(...args));
  create: TicketingGateway["create"] = (...args) => this.attempt(() => this.inner.create(...args));
  addRequesterUpdate: TicketingGateway["addRequesterUpdate"] = (...args) =>
    this.attempt(() => this.inner.addRequesterUpdate(...args));
  addAnalystUpdate: TicketingGateway["addAnalystUpdate"] = (...args) =>
    this.attempt(() => this.inner.addAnalystUpdate(...args));
  reopen: TicketingGateway["reopen"] = (...args) => this.attempt(() => this.inner.reopen(...args));
  transfer: TicketingGateway["transfer"] = (...args) =>
    this.attempt(() => this.inner.transfer(...args));
}
