import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { sessionLifetime, signSession, verifySession } from "./session";

const secret = "s".repeat(32);

describe("session", () => {
  it("round-trips the user id", async () => {
    const token = await signSession("u-ana", secret, false);
    expect(await verifySession(token, secret)).toBe("u-ana");
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession("u-ana", "x".repeat(32), false);
    expect(await verifySession(token, secret)).toBeUndefined();
  });

  it("rejects tampered, empty and garbage tokens", async () => {
    const token = await signSession("u-ana", secret, false);
    expect(await verifySession(`${token}x`, secret)).toBeUndefined();
    expect(await verifySession("", secret)).toBeUndefined();
    expect(await verifySession("not-a-jwt", secret)).toBeUndefined();
  });

  it("rejects expired tokens", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u-ana")
      .setIssuer("nexo-assist")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(expired, secret)).toBeUndefined();
  });

  it("rejects tokens from another issuer", async () => {
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u-ana")
      .setIssuer("someone-else")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(foreign, secret)).toBeUndefined();
  });

  it("keeps the session longer when the user asks to stay signed in", () => {
    expect(sessionLifetime(true)).toBeGreaterThan(sessionLifetime(false));
  });
});
