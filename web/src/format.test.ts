import { describe, expect, it } from "vitest";
import { formatDuration, formatTimestamp, formatDate } from "@/format";

describe("formatDuration", () => {
  it("formats seconds as H:MM:SS or MM:SS", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(125)).toBe("2:05");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("formatTimestamp", () => {
  it("formats float seconds as MM:SS", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(72.4)).toBe("01:12");
    expect(formatTimestamp(3725)).toBe("62:05");
  });
});

describe("formatDate", () => {
  it("returns a localized date string", () => {
    const out = formatDate("2026-05-09T14:00:00Z");
    expect(out).toContain("2026");
  });
});
