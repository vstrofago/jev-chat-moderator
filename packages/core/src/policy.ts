import type { ModerationResult, Thresholds, Verdict } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = { remove: 0.8, review: 0.5 };

/**
 * Jev only reports probabilities; this is where we decide what to do with them.
 * Spam is not "offensive" but should still go, so a confident spam answer removes too.
 */
export function decide(
  r: Pick<ModerationResult, "offensive" | "category" | "categoryProbabilities">,
  t: Thresholds,
): Verdict {
  const review = Math.min(t.review, t.remove);
  if (r.offensive >= t.remove) return "remove";
  if (r.category === "spam" && r.categoryProbabilities.spam >= t.remove) return "remove";
  if (r.offensive >= review) return "review";
  return "allow";
}
