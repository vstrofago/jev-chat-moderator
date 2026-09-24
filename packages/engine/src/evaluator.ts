import { evaluate, GatewayError, RateLimitError, type BooleanQuestion, type ClientOptions } from "@vigia/core";

/** Asks Jev the questions and returns one probability (0..1) per question id. */
export type Evaluator = (state: unknown, questions: Record<string, BooleanQuestion>) => Promise<Record<string, number>>;

export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries: number;
  /** Chat is live, so never wait longer than this, whatever retry-after says. */
  maxWaitMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface JevEvaluatorOptions extends Partial<RetryOptions> {
  /** Called with the input tokens of every successful call, for cost estimates. */
  onUsage?(inputTokens: number): void;
}

const DEFAULT_RETRY: RetryOptions = { retries: 2, maxWaitMs: 3000 };
const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Jev over the core client. Rate limits wait as told (capped) and provider errors back
 * off; a bad key (AuthError) is never retried.
 */
export function jevEvaluator(o: ClientOptions, opts: JevEvaluatorOptions = {}): Evaluator {
  const retry = { ...DEFAULT_RETRY, ...opts };
  const sleep = retry.sleep ?? sleepFor;
  return async (state, questions) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const ev = await evaluate(state, questions, o);
        if (ev.inputTokens !== undefined) opts.onUsage?.(ev.inputTokens);
        const probabilities: Record<string, number> = {};
        for (const [id, answer] of Object.entries(ev.answers)) {
          if (answer.type !== "boolean") throw new GatewayError(`Expected a yes/no answer for "${id}"`);
          probabilities[id] = answer.probability;
        }
        return probabilities;
      } catch (e) {
        const retryable = e instanceof RateLimitError || e instanceof GatewayError;
        if (!retryable || attempt >= retry.retries) throw e;
        const wait = e instanceof RateLimitError ? e.retryAfterMs : 500 * 2 ** attempt;
        await sleep(Math.min(wait, retry.maxWaitMs));
      }
    }
  };
}
