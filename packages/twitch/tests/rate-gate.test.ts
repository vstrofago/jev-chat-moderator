import { describe, expect, it } from "vitest";
import { createRateGate } from "../src/rate-gate";

describe("createRateGate", () => {
  it("allows N per second, counts the rest, and recovers next second", () => {
    let t = 0;
    const gate = createRateGate(2, () => t);
    expect([gate.allow(), gate.allow(), gate.allow()]).toEqual([true, true, false]);
    expect(gate.skipped()).toBe(1);
    t = 999;
    expect(gate.allow()).toBe(false);
    t = 1000;
    expect(gate.allow()).toBe(true);
    expect(gate.skipped()).toBe(2);
  });
});
