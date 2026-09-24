import { describe, expect, it } from "vitest";
import { computeStats, type StatItem } from "../src/client/stats";
import type { Category, ModerationResult } from "@vigia/core";

function done(offensive: number, expected?: Category, latencyMs = 100, inputTokens = 1000): StatItem {
  const result: ModerationResult = {
    offensive,
    category: "ok",
    categoryProbabilities: { ok: 1, insult: 0, hate: 0, spam: 0, threat: 0 },
    latencyMs,
    inputTokens,
    raw: {},
  };
  return { status: "done", result, expected };
}

const t = { remove: 0.8, review: 0.5 };

describe("computeStats", () => {
  it("counts verdicts, averages latency and estimates cost", () => {
    const s = computeStats([done(0.9, "insult", 100), done(0.6, "ok", 300), done(0.1, "ok", 200)], t);
    expect(s).toMatchObject({ processed: 3, removed: 1, review: 1, errors: 0, avgLatencyMs: 200 });
    expect(s.costUsd).toBeCloseTo((3000 * 0.042) / 1e6);
  });

  it("measures agreement only on labelled items: ok must be allowed, anything else must be acted on", () => {
    const s = computeStats([done(0.9, "insult"), done(0.6, "ok"), done(0.1, "ok"), done(0.1)], t);
    expect(s.agreement).toBeCloseTo(2 / 3);
  });

  it("counts failed calls as errors, never as processed or allowed", () => {
    const s = computeStats([{ status: "error", expected: "insult" }, done(0.1, "ok")], t);
    expect(s).toMatchObject({ processed: 1, errors: 1, removed: 0 });
    expect(s.agreement).toBe(1);
  });

  it("reports no latency or agreement before anything is processed", () => {
    const s = computeStats([{ status: "pending" }], t);
    expect(s.avgLatencyMs).toBeUndefined();
    expect(s.agreement).toBeUndefined();
  });
});
