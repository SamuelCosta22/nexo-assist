import { DomainError } from "@/domain/shared/domain-error";

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
}

/** The actor is authenticated but may not touch this resource (privacy rule). */
export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
}

/** Two actors raced on the same conversation; the loser must reload. */
export class ConcurrencyError extends DomainError {
  readonly code = "CONCURRENT_MODIFICATION";
  constructor() {
    super("A conversa foi alterada por outra pessoa. Atualize e tente novamente.");
  }
}

/** The legacy ticketing system is down (the PRD says it sometimes is). */
export class TicketingUnavailableError extends DomainError {
  readonly code = "TICKETING_UNAVAILABLE";
  constructor() {
    super("O sistema de chamados está indisponível no momento.");
  }
}

export class AgentUnavailableError extends DomainError {
  readonly code = "AGENT_UNAVAILABLE";
  constructor(detail?: string) {
    super(detail ?? "O assistente está indisponível no momento.");
  }
}
