import { evaluate, GatewayError, type BooleanQuestion, type ClientOptions } from "@vigia/core";

/** Asks Jev the questions and returns one probability (0..1) per question id. */
export type Evaluator = (state: unknown, questions: Record<string, BooleanQuestion>) => Promise<Record<string, number>>;

export function jevEvaluator(o: ClientOptions): Evaluator {
  return async (state, questions) => {
    const ev = await evaluate(state, questions, o);
    const probabilities: Record<string, number> = {};
    for (const [id, answer] of Object.entries(ev.answers)) {
      if (answer.type !== "boolean") throw new GatewayError(`Expected a yes/no answer for "${id}"`);
      probabilities[id] = answer.probability;
    }
    return probabilities;
  };
}
