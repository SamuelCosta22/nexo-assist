import { TicketingUnavailableError } from "@/application/errors";
import type { TicketingGateway } from "@/application/ports/ticketing-gateway";

/**
 * Decorator that makes the (simulated) legacy system occasionally unavailable,
 * as the PRD describes. The failure happens BEFORE the call reaches the real
 * service, so a failed write never half-applies and is safe to retry.
 */
export class FlakyTicketingGateway implements TicketingGateway {
  constructor(
    private readonly inner: TicketingGateway,
    private readonly failureRate: number,
    private readonly random: () => number = Math.random,
  ) {}

  private async through<T>(call: () => Promise<T>): Promise<T> {
    if (this.random() < this.failureRate) throw new TicketingUnavailableError();
    return call();
  }

  listByRequester: TicketingGateway["listByRequester"] = (...args) =>
    this.through(() => this.inner.listByRequester(...args));
  findById: TicketingGateway["findById"] = (...args) =>
    this.through(() => this.inner.findById(...args));
  create: TicketingGateway["create"] = (...args) => this.through(() => this.inner.create(...args));
  addRequesterUpdate: TicketingGateway["addRequesterUpdate"] = (...args) =>
    this.through(() => this.inner.addRequesterUpdate(...args));
  addAnalystUpdate: TicketingGateway["addAnalystUpdate"] = (...args) =>
    this.through(() => this.inner.addAnalystUpdate(...args));
  reopen: TicketingGateway["reopen"] = (...args) => this.through(() => this.inner.reopen(...args));
  transfer: TicketingGateway["transfer"] = (...args) =>
    this.through(() => this.inner.transfer(...args));
}
