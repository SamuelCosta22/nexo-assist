import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@host/db",
  GOOGLE_GENERATIVE_AI_API_KEY: "key",
  SESSION_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults for optional settings", () => {
    const env = parseEnv(valid);
    expect(env.LLM_MODEL).toBe("gemini-3.5-flash");
    expect(env.TICKETING_FAILURE_RATE).toBe(0);
    expect(env.CHAT_MESSAGE_LIMIT).toBe(30);
    expect(env.DAILY_MESSAGE_LIMIT).toBe(150);
  });

  it("coerces numeric strings", () => {
    const env = parseEnv({ ...valid, TICKETING_FAILURE_RATE: "0.2", CHAT_MESSAGE_LIMIT: "10" });
    expect(env.TICKETING_FAILURE_RATE).toBe(0.2);
    expect(env.CHAT_MESSAGE_LIMIT).toBe(10);
  });

  it("fails fast listing every problem", () => {
    expect(() => parseEnv({ SESSION_SECRET: "curto" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ SESSION_SECRET: "curto" })).toThrow(/SESSION_SECRET/);
  });

  it("rejects an out-of-range failure rate", () => {
    expect(() => parseEnv({ ...valid, TICKETING_FAILURE_RATE: "2" })).toThrow();
  });

  it("offers the default model first, trimmed and without duplicates", () => {
    const env = parseEnv({
      ...valid,
      LLM_MODEL: "gemini-3.5-flash",
      LLM_MODEL_OPTIONS: " gemini-2.5-flash , gemini-3.5-flash,, x ",
    });
    expect(env.LLM_MODEL_OPTIONS).toEqual(["gemini-3.5-flash", "gemini-2.5-flash", "x"]);
  });

  it("always includes the default model even if the list omits it", () => {
    const env = parseEnv({ ...valid, LLM_MODEL: "meu-modelo", LLM_MODEL_OPTIONS: "a,b" });
    expect(env.LLM_MODEL_OPTIONS).toEqual(["meu-modelo", "a", "b"]);
  });
});
