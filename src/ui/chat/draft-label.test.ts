import { describe, expect, it } from "vitest";
import { draftLabel } from "./PendingActionCard";

describe("draftLabel", () => {
  it("is stable, three digits and prefixed", () => {
    const id = "4b177dec-206b-46c0-9782-e8b6a2cad685";
    expect(draftLabel(id)).toBe(draftLabel(id));
    expect(draftLabel(id)).toMatch(/^D-\d{3}$/);
  });

  it("differs between drafts", () => {
    expect(draftLabel("a")).not.toBe(draftLabel("b"));
  });
});
