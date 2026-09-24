import { describe, expect, it } from "vitest";
import { decide, DEFAULT_THRESHOLDS, type Category } from "../src/index";

function result(offensive: number, category: Category = "ok", categoryProbability = 1) {
  const categoryProbabilities = { ok: 0, insult: 0, hate: 0, spam: 0, threat: 0 };
  categoryProbabilities[category] = categoryProbability;
  return { offensive, category, categoryProbabilities };
}

describe("decide", () => {
  it("removes at or above the remove threshold", () => {
    expect(decide(result(0.8), DEFAULT_THRESHOLDS)).toBe("remove");
    expect(decide(result(0.99), DEFAULT_THRESHOLDS)).toBe("remove");
  });

  it("flags the grey zone between review and remove for review", () => {
    expect(decide(result(0.79), DEFAULT_THRESHOLDS)).toBe("review");
    expect(decide(result(0.5), DEFAULT_THRESHOLDS)).toBe("review");
  });

  it("allows below the review threshold", () => {
    expect(decide(result(0.49), DEFAULT_THRESHOLDS)).toBe("allow");
    expect(decide(result(0), DEFAULT_THRESHOLDS)).toBe("allow");
  });

  it("removes confident spam even when it is not offensive", () => {
    expect(decide(result(0.1, "spam", 0.9), DEFAULT_THRESHOLDS)).toBe("remove");
  });

  it("does not remove spam below the remove threshold", () => {
    expect(decide(result(0.1, "spam", 0.6), DEFAULT_THRESHOLDS)).toBe("allow");
  });

  it("treats a review threshold above remove as equal to remove", () => {
    const t = { remove: 0.8, review: 0.9 };
    expect(decide(result(0.85), t)).toBe("remove");
    expect(decide(result(0.79), t)).toBe("allow");
  });
});
