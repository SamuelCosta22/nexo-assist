import { DomainError } from "@/domain/shared/domain-error";
import type { User } from "@/domain/identity/user";
import { err, ok, type Result } from "@/domain/shared/result";
import type { UserRepository } from "../ports/repositories";

export class InvalidCredentialsError extends DomainError {
  readonly code = "INVALID_CREDENTIALS";
  constructor() {
    super("E-mail ou senha incorretos.");
  }
}

/**
 * The PRD asks for a login that "accepts the sample employees with any
 * password". The check is therefore: the e-mail must belong to a known user and
 * the password must be non-empty. A real deployment replaces this use case with
 * SSO/OIDC; nothing else in the system depends on how identity is proven.
 */
export class AuthenticateUser {
  constructor(private readonly users: UserRepository) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<Result<User, InvalidCredentialsError>> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) return err(new InvalidCredentialsError());
    const user = await this.users.findByEmail(email);
    return user ? ok(user) : err(new InvalidCredentialsError());
  }
}
