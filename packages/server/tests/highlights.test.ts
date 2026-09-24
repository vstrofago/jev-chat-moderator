import type { HighlightItem } from "@vigia/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHighlightQueue } from "../src/highlights";

const item = (id: string): HighlightItem => ({ id, kind: "question", text: id, source: "rule" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(max = 20) {
  const log: string[] = [];
  const q = createHighlightQueue({ seconds: 10, max, onShow: (i) => void log.push(`show ${i.id}`), onClear: () => void log.push("clear") });
  return { q, log };
}

describe("createHighlightQueue", () => {
  it("shows one highlight at a time, each for its duration", () => {
    const { q, log } = setup();
    q.push(item("a"));
    q.push(item("b"));
    expect(log).toEqual(["show a"]);
    expect(q.current()?.id).toBe("a");
    vi.advanceTimersByTime(10_000);
    expect(log).toEqual(["show a", "show b"]);
    vi.advanceTimersByTime(10_000);
    expect(log).toEqual(["show a", "show b", "clear"]);
    expect(q.current()).toBeNull();
  });

  it("drops the oldest waiting highlight beyond the cap", () => {
    const { q, log } = setup(2);
    for (const id of ["a", "b", "c", "d"]) q.push(item(id));
    expect(q.waiting().map((i) => i.id)).toEqual(["c", "d"]);
    vi.advanceTimersByTime(30_000);
    expect(log).toEqual(["show a", "show c", "show d", "clear"]);
  });

  it("clear hides the current card and waits a full turn before the next", () => {
    const { q, log } = setup();
    q.push(item("a"));
    q.push(item("b"));
    vi.advanceTimersByTime(3_000);
    q.clear();
    expect(log).toEqual(["show a", "clear"]);
    vi.advanceTimersByTime(9_999);
    expect(log).toEqual(["show a", "clear"]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["show a", "clear", "show b"]);
  });

  it("can show an item right away, jumping the queue", () => {
    const { q, log } = setup();
    q.push(item("a"));
    q.push(item("b"));
    q.showNow(item("now"));
    expect(log).toEqual(["show a", "show now"]);
    vi.advanceTimersByTime(10_000);
    expect(log.at(-1)).toBe("show b");
  });

  it("follows a new duration", () => {
    const { q, log } = setup();
    q.setSeconds(2);
    q.push(item("a"));
    vi.advanceTimersByTime(2_000);
    expect(log).toEqual(["show a", "clear"]);
  });
});
