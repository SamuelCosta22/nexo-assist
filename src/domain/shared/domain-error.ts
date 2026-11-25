/**
 * Base class for violations of a business rule.
 *
 * `code` is a stable, machine-readable identifier: the delivery layer maps it
 * to HTTP statuses and the agent layer exposes it in the decision trace, so it
 * must never be derived from the (translatable) message.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
