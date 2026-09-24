import { decide } from "@vigia/core";
import type { Category, ModerationResult, Thresholds } from "@vigia/core";

/** Jev 1.13 input price: $0.042 per million tokens; output is free. */
const USD_PER_INPUT_TOKEN = 0.042 / 1e6;

export interface StatItem {
  status: "queued" | "pending" | "done" | "error";
  result?: ModerationResult;
  expected?: Category;
}

export interface Stats {
  processed: number;
  removed: number;
  review: number;
  errors: number;
  avgLatencyMs?: number;
  costUsd: number;
  /** Share of labelled messages where the policy acted as the label expects (0..1). */
  agreement?: number;
}

export function computeStats(items: StatItem[], t: Thresholds): Stats {
  let processed = 0, removed = 0, review = 0, errors = 0, latency = 0, tokens = 0, labelled = 0, agreed = 0;
  for (const item of items) {
    if (item.status === "error") errors++;
    if (item.status !== "done" || !item.result) continue;
    processed++;
    latency += item.result.latencyMs;
    tokens += item.result.inputTokens ?? 0;
    const verdict = decide(item.result, t);
    if (verdict === "remove") removed++;
    if (verdict === "review") review++;
    if (item.expected) {
      labelled++;
      if ((item.expected === "ok") === (verdict === "allow")) agreed++;
    }
  }
  return {
    processed,
    removed,
    review,
    errors,
    avgLatencyMs: processed ? Math.round(latency / processed) : undefined,
    costUsd: tokens * USD_PER_INPUT_TOKEN,
    agreement: labelled ? agreed / labelled : undefined,
  };
}
