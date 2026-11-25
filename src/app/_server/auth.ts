import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ForbiddenError } from "@/application/errors";
import type { Role, User } from "@/domain/identity/user";
import { DomainError } from "@/domain/shared/domain-error";
import { SESSION_COOKIE, verifySession } from "@/infrastructure/auth/session";
import { getContainer } from "@/infrastructure/container";

export class UnauthenticatedError extends DomainError {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Faça login para continuar.");
  }
}

/** The signed-in user (fresh from the database), or undefined. Cached per request. */
export const getSessionUser = cache(async (): Promise<User | undefined> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const container = getContainer();
  const userId = await verifySession(token, container.env.SESSION_SECRET);
  return userId ? container.users.findById(userId) : undefined;
});

/** For route handlers: throws (mapped to 401) instead of redirecting. */
export async function requireApiUser(role?: Role): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  if (role && user.role !== role) {
    throw new ForbiddenError("Você não tem acesso a este recurso.");
  }
  return user;
}

/** For pages: redirects to the right place instead of throwing. */
export async function requirePageUser(role: Role): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "analyst" ? "/console" : "/chat");
  return user;
}

export const homeFor = (user: User) => (user.role === "analyst" ? "/console" : "/chat");
