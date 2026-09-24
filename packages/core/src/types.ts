export const CATEGORIES = ["ok", "insult", "hate", "spam", "threat"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface ModerationResult {
  /** Probability (0..1) that the message is offensive, from Jev's boolean question. */
  offensive: number;
  category: Category;
  categoryProbabilities: Record<Category, number>;
  /** Jev's confidence in the category answer (0..1), when the provider reports it. */
  confidence?: number;
  latencyMs: number;
  inputTokens?: number;
  model?: string;
  /** Untouched provider response, kept for inspection. */
  raw: unknown;
}

export type Verdict = "allow" | "review" | "remove";

export interface Thresholds {
  remove: number;
  review: number;
}
