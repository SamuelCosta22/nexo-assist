import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "nexo_session";

const ISSUER = "nexo-assist";
const SHORT_SESSION_SECONDS = 60 * 60 * 8; // 8 hours
const LONG_SESSION_SECONDS = 60 * 60 * 24 * 30; // "Manter conectado": 30 days

/** Cookie lifetime in seconds for the chosen "keep me signed in" option. */
export function sessionLifetime(remember: boolean): number {
  return remember ? LONG_SESSION_SECONDS : SHORT_SESSION_SECONDS;
}

const key = (secret: string) => new TextEncoder().encode(secret);

/**
 * Signed, stateless session. The token only says WHO the user is; role and
 * permissions are always re-read from the database, so demoting or deleting a
 * user takes effect immediately instead of when the cookie expires.
 */
export async function signSession(
  userId: string,
  secret: string,
  remember: boolean,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetime(remember)}s`)
    .sign(key(secret));
}

/** Returns the user id, or undefined for any invalid, tampered or expired token. */
export async function verifySession(token: string, secret: string): Promise<string | undefined> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER });
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}
