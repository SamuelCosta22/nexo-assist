import { describe, expect, it } from "vitest";
import { isNeonUrl } from "./database";

describe("isNeonUrl", () => {
  it("recognises Neon hosts, pooled or not", () => {
    expect(
      isNeonUrl("postgresql://u:p@ep-cool-123.sa-east-1.aws.neon.tech/db?sslmode=require"),
    ).toBe(true);
    expect(isNeonUrl("postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/db")).toBe(true);
  });

  it("treats every other Postgres as a regular server", () => {
    expect(isNeonUrl("postgresql://nexo:nexo@localhost:54329/nexo_assist")).toBe(false);
    expect(isNeonUrl("postgresql://u:p@db.example.com/app")).toBe(false);
    expect(isNeonUrl("postgresql://u:p@evil-neon.tech.example.com/app")).toBe(false);
  });
});
