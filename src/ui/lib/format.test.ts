import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatDayLabel,
  formatDeadline,
  formatListTime,
  formatTime,
  initials,
} from "./format";

const at = (iso: string) => new Date(`${iso}-03:00`);
const now = at("2026-11-24T10:00:00");

describe("format", () => {
  it("formats times in São Paulo regardless of the server timezone", () => {
    expect(formatTime("2026-11-24T13:43:00-03:00")).toBe("13:43");
    expect(formatTime("2026-11-24T16:43:00Z")).toBe("13:43");
  });

  it("labels days relative to now", () => {
    expect(formatDayLabel("2026-11-24T08:00:00-03:00", now)).toBe("Hoje");
    expect(formatDayLabel("2026-11-23T20:00:00-03:00", now)).toBe("Ontem");
    expect(formatDayLabel("2026-10-16T14:20:00-03:00", now)).toBe("16 out");
  });

  it("describes elapsed time", () => {
    expect(formatAgo("2026-11-24T09:59:40-03:00", now)).toBe("agora");
    expect(formatAgo("2026-11-24T09:35:00-03:00", now)).toBe("há 25 min");
    expect(formatAgo("2026-11-24T07:00:00-03:00", now)).toBe("há 3 h");
    expect(formatAgo("2026-11-19T10:00:00-03:00", now)).toBe("há 5 dias");
    expect(formatAgo("2026-11-23T09:00:00-03:00", now)).toBe("há 1 dia");
  });

  it("shows only the time for deadlines due today", () => {
    expect(formatDeadline("2026-11-24T13:43:00-03:00", now)).toBe("13:43");
    expect(formatDeadline("2026-11-27T13:43:00-03:00", now)).toBe("27 nov, 13:43");
  });

  it("formats list timestamps and initials", () => {
    expect(formatListTime("2026-11-24T09:00:00-03:00", now)).toBe("09:00");
    expect(formatListTime("2026-11-23T09:00:00-03:00", now)).toBe("ontem");
    expect(initials("Ana Souza")).toBe("AS");
    expect(initials("Rafael")).toBe("R");
  });
});
