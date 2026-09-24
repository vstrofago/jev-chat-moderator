/**
 * Runs the scripted playground chat through the engine with a fake platform and prints
 * every decision.
 *
 *   pnpm simulate                          # offline: replay answers, toxicity + spam only
 *   AI_GATEWAY_API_KEY=vck_... pnpm simulate  # live Jev, every rule
 */
import { readFileSync } from "node:fs";
import {
  createEngine,
  jevEvaluator,
  parseConfig,
  type ChatMessage,
  type ChatPlatform,
  type Evaluator,
} from "../src/index";

interface Scripted {
  id: string;
  user: string;
  text: string;
}
interface Replay {
  results: Record<string, { offensive: number; categoryProbabilities: { spam: number } }>;
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const messages: Scripted[] = JSON.parse(read("../../../apps/demo/src/data/messages.json"));
const parsed = parseConfig(read("../examples/vigia.yaml"));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors, null, 2));

const apiKey = process.env.AI_GATEWAY_API_KEY;
const byText = new Map(messages.map((m) => [m.text, m.id]));

/** Offline stand-in: recorded playground answers for toxicity and spam, 0 for the rest. */
function replayEvaluator(): Evaluator {
  const replay: Replay = JSON.parse(read("../../../apps/demo/src/data/replay.json"));
  return async (state, questions) => {
    const r = replay.results[byText.get((state as { message: string }).message) ?? ""];
    return Object.fromEntries(
      Object.keys(questions).map((id) => [
        id,
        id === "toxicity" ? (r?.offensive ?? 0) : id === "spam" ? (r?.categoryProbabilities.spam ?? 0) : 0,
      ]),
    );
  };
}

const actions: Record<string, number> = {};
const count = (k: string) => (actions[k] = (actions[k] ?? 0) + 1);
const platform: ChatPlatform = {
  deleteMessage: async () => void count("deleted"),
  timeout: async () => void count("timed out"),
  sendChat: async (text) => console.log(`  bot: ${text}`),
};

const engine = createEngine({
  config: parsed.config,
  platform,
  evaluate: apiKey ? jevEvaluator({ apiKey, provider: "gateway" }) : replayEvaluator(),
  observe: false,
  concurrency: 4,
});
engine.setCategory("Elden Ring");

engine.on((e) => {
  if (e.type === "warning") console.log(`  ! ${e.code}: ${e.detail}`);
  if (e.type !== "decision") return;
  const { outcome, message } = e;
  const pct = (p: number) => p.toFixed(2);
  const tags: string[] = [];
  if (outcome.moderation) {
    const v = outcome.verdicts.find((x) => x.ruleId === outcome.moderation!.ruleId)!;
    tags.push(`${outcome.moderation.action.toUpperCase()} ${v.ruleId} ${pct(v.probability)}`);
  }
  if (outcome.highlight) tags.push(`HIGHLIGHT ${outcome.highlight.ruleId} ${pct(outcome.highlight.probability)}`);
  if (outcome.suggestion) tags.push(`SUGGEST ${outcome.suggestion.ruleId} ${pct(outcome.suggestion.probability)}`);
  for (const u of outcome.uncertain) tags.push(`UNSURE ${u.ruleId} ${pct(u.probability)}`);
  if (tags.length === 0) return count("allowed");
  if (outcome.uncertain.length > 0) count("uncertain log");
  if (outcome.highlight) count("highlighted");
  console.log(`[${tags.join(" | ")}] ${message.text}`);
});

if (!apiKey) console.log("Offline mode: replaying recorded answers for toxicity and spam only. Set AI_GATEWAY_API_KEY for every rule.\n");

await Promise.all(
  messages.map((m, i) => {
    const message: ChatMessage = {
      id: m.id,
      text: m.text,
      author: { id: `u${i}`, login: m.user, displayName: m.user, broadcaster: false, moderator: false, vip: false },
      fragments: [{ type: "text", text: m.text }],
    };
    return engine.handleMessage(message);
  }),
);

console.log(`\n${messages.length} messages:`, actions);
