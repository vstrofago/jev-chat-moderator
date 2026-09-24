import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogDedupe } from "../src/log-dedupe";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createLogDedupe", () => {
  it("prints a repeated line once, then a count per window", () => {
    const out: string[] = [];
    const log = createLogDedupe((l) => out.push(l), 30_000);
    log("! jev-unavailable: busy");
    log("! jev-unavailable: busy");
    log("! jev-unavailable: busy");
    log("other");
    expect(out).toEqual(["! jev-unavailable: busy", "other"]);
    vi.advanceTimersByTime(30_000);
    expect(out).toEqual(["! jev-unavailable: busy", "other", "! jev-unavailable: busy (repeated 2 more times in 30 s)"]);
    vi.advanceTimersByTime(30_000);
    log("! jev-unavailable: busy");
    expect(out.at(-1)).toBe("! jev-unavailable: busy");
    log.close();
  });
});
