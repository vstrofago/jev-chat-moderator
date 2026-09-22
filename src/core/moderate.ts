import { evaluate, GatewayError, type ClientOptions } from "./jev-client";
import { MODERATION_QUESTIONS } from "./questions";
import { CATEGORIES, type Category, type ModerationResult } from "./types";

function isCategory(c: string): c is Category {
  return (CATEGORIES as readonly string[]).includes(c);
}

/** Ask Jev about one chat message. Throws AuthError / RateLimitError / GatewayError. */
export async function moderate(text: string, o: ClientOptions): Promise<ModerationResult> {
  const started = performance.now();
  const ev = await evaluate({ message: text }, MODERATION_QUESTIONS, o);
  const latencyMs = Math.round(performance.now() - started);

  const offensive = ev.answers.offensive;
  const category = ev.answers.category;
  if (offensive.type !== "boolean" || category.type !== "choice") throw new GatewayError("Unexpected answer types");
  if (!isCategory(category.choice)) throw new GatewayError(`Unknown category "${category.choice}"`);

  const categoryProbabilities = Object.fromEntries(
    CATEGORIES.map((c) => [c, category.probabilities[c] ?? 0]),
  ) as Record<Category, number>;

  return {
    offensive: offensive.probability,
    category: category.choice,
    categoryProbabilities,
    confidence: category.confidence,
    latencyMs,
    inputTokens: ev.inputTokens,
    model: ev.model,
    raw: ev.raw,
  };
}
