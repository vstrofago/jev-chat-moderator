/**
 * Runs every scripted message through Jev once and saves the answers to replay.json,
 * so the published site can show real Jev output without spending anyone's budget.
 *
 *   AI_GATEWAY_API_KEY=vck_... pnpm record
 */
import { readFileSync, writeFileSync } from "node:fs";
import { GatewayError, RateLimitError } from "../src/core/jev-client";
import { moderate } from "../src/core/moderate";
import { decide, DEFAULT_THRESHOLDS } from "../src/core/policy";
import { createQueue } from "../src/core/queue";
import { CATEGORIES, type Category, type ModerationResult } from "../src/core/types";

interface Message {
  id: string;
  user: string;
  lang: "es" | "en";
  text: string;
  expected: Category;
}

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) {
  console.error("Set AI_GATEWAY_API_KEY to record.");
  process.exit(1);
}

const messages: Message[] = JSON.parse(readFileSync("src/data/messages.json", "utf8"));
const queue = createQueue(4);

/** Rate limits wait as told; transient provider errors get a few backed-off retries. */
async function withRetry(text: string): Promise<ModerationResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await moderate(text, { apiKey: apiKey!, provider: "gateway" });
    } catch (e) {
      if (e instanceof RateLimitError) await sleep(e.retryAfterMs);
      else if (e instanceof GatewayError && attempt < 5) await sleep(1000 * 2 ** attempt);
      else throw e;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Drop gateway routing metadata from the stored raw response; it is noise for readers. */
function slim(r: ModerationResult): ModerationResult {
  const raw = structuredClone(r.raw) as { providerMetadata?: { gateway?: unknown } };
  if (raw?.providerMetadata) delete raw.providerMetadata.gateway;
  return { ...r, raw };
}

const started = Date.now();
const results: Record<string, ModerationResult> = {};
await Promise.all(
  messages.map((m) =>
    queue.push(async () => {
      results[m.id] = slim(await withRetry(m.text));
      process.stdout.write(".");
    }),
  ),
);
console.log(`\n${messages.length} messages in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const model = Object.values(results)[0]?.model ?? "unknown";
writeFileSync(
  "src/data/replay.json",
  JSON.stringify({ recordedAt: new Date().toISOString(), model, results }, null, 1) + "\n",
);

// Agreement report: does the default policy act the way our labels expect?
let actionAgree = 0;
let categoryAgree = 0;
const confusion: Record<string, Record<string, number>> = {};
const misses: string[] = [];
for (const m of messages) {
  const r = results[m.id];
  const verdict = decide(r, DEFAULT_THRESHOLDS);
  const shouldAct = m.expected !== "ok";
  const acted = verdict !== "allow";
  if (shouldAct === acted) actionAgree++;
  else misses.push(`  [${m.expected} → ${verdict} ${r.offensive.toFixed(2)} ${r.category}] ${m.lang} ${m.text}`);
  if (r.category === m.expected) categoryAgree++;
  confusion[m.expected] ??= {};
  confusion[m.expected][r.category] = (confusion[m.expected][r.category] ?? 0) + 1;
}

const pct = (n: number) => `${((100 * n) / messages.length).toFixed(1)}%`;
const tokens = Object.values(results).reduce((s, r) => s + (r.inputTokens ?? 0), 0);
const latencies = Object.values(results).map((r) => r.latencyMs).sort((a, b) => a - b);
console.log(`model ${model}`);
console.log(`action agreement (allow vs review/remove): ${pct(actionAgree)}`);
console.log(`category agreement: ${pct(categoryAgree)}`);
console.log(`median latency ${latencies[Math.floor(latencies.length / 2)]} ms, input tokens ${tokens} (~$${((tokens * 0.042) / 1e6).toFixed(5)})`);
console.log("\nexpected \\ jev  " + CATEGORIES.map((c) => c.padStart(7)).join(""));
for (const e of CATEGORIES) {
  console.log(e.padEnd(16) + CATEGORIES.map((c) => String(confusion[e]?.[c] ?? 0).padStart(7)).join(""));
}
if (misses.length) console.log(`\nDisagreements (${misses.length}):\n${misses.join("\n")}`);
