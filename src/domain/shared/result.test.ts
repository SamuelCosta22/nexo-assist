import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error";
import { err, ok } from "./result";

class SampleError extends DomainError {
  readonly code = "SAMPLE";
}

describe("Result", () => {
  it("wraps a success value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("wraps a failure value", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" });
  });
});

describe("DomainError", () => {
  it("exposes a stable code and the subclass name", () => {
    const error = new SampleError("mensagem");
    expect(error.code).toBe("SAMPLE");
    expect(error.name).toBe("SampleError");
    expect(error).toBeInstanceOf(Error);
  });
});
