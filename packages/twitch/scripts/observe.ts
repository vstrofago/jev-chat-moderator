/**
 * Watches a public Twitch channel's chat and prints what Vigía *would* do, without doing
 * anything: observe mode, anonymous read-only connection, nothing written to chat or disk.
 * A development tool for calibrating rules against real chat.
 *
 *   AI_GATEWAY_API_KEY=vck_... pnpm observe <channel> [--rules file.yaml] [--rate 1] [--category "Elden Ring"]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createEngine, jevEvaluator, parseConfig, type ChatPlatform } from "@vigia/engine";
import { readChannel } from "../src/irc-reader";
import { loadThirdPartyEmotes, withThirdPartyEmotes } from "../src/third-party-emotes";
import { createRateGate } from "../src/rate-gate";

const PRICE_PER_TOKEN = 0.042 / 1_000_000;
const SUMMARY_EVERY_MS = 30_000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rules: { type: "string", default: new URL("../../engine/examples/vigia.yaml", import.meta.url).pathname },
    rate: { type: "string", default: "1" },
    category: { type: "string" },
  },
});

const channel = positionals[0];
const rate = Number(values.rate);
if (!channel || !(rate > 0)) {
  console.error('Usage: pnpm observe <channel> [--rules file.yaml] [--rate 1] [--category "Game"]');
  process.exit(1);
}

const gatewayKey = process.env.AI_GATEWAY_API_KEY;
const typesafeKey = process.env.TYPESAFE_API_KEY;
if (!gatewayKey && !typesafeKey) {
  console.error("Set AI_GATEWAY_API_KEY (vck_...) or TYPESAFE_API_KEY.");
  process.exit(1);
}

// pnpm runs scripts from the package folder; resolve --rules against where the user typed it.
const rulesPath = resolve(process.env.INIT_CWD ?? process.cwd(), values.rules!);
const parsed = parseConfig(readFileSync(rulesPath, "utf8"));
if (!parsed.ok) {
  for (const e of parsed.errors) console.error(`${rulesPath}:${e.line ?? "?"} ${e.path} ${e.message}`);
  process.exit(1);
}

// Observe mode never calls the platform; this guard makes sure of it.
const refuse = async () => {
  throw new Error("read-only tool: chat actions are disabled");
};
const platform: ChatPlatform = { deleteMessage: refuse, timeout: refuse, sendChat: refuse };

let tokens = 0;
const engine = createEngine({
  config: parsed.config,
  platform,
  observe: true,
  evaluate: jevEvaluator(
    gatewayKey ? { apiKey: gatewayKey, provider: "gateway" } : { apiKey: typesafeKey!, provider: "typesafe" },
    { onUsage: (n) => (tokens += n) },
  ),
});
if (values.category) engine.setCategory(values.category);

const stats = { seen: 0, evaluated: 0, wouldModerate: 0, uncertain: 0, highlights: 0, suggestions: 0, errors: 0 };
const gate = createRateGate(rate);
const started = Date.now();

const color = (code: number, s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const pct = (p: number) => p.toFixed(2);

engine.on((e) => {
  if (e.type === "warning") {
    stats.errors++;
    return console.log(color(33, `  ! ${e.code}: ${e.detail}`));
  }
  if (e.type !== "decision") return;
  stats.evaluated++;
  const { outcome: o, message: m } = e;
  const tags: string[] = [];
  if (o.moderation) {
    stats.wouldModerate++;
    const v = o.verdicts.find((x) => x.ruleId === o.moderation!.ruleId)!;
    const note = o.moderation.downgraded ? " (emotes only → log)" : "";
    tags.push(color(31, `WOULD ${o.moderation.action.toUpperCase()} ${v.ruleId} ${pct(v.probability)}${note}`));
  }
  if (o.highlight) {
    stats.highlights++;
    tags.push(color(32, `HIGHLIGHT ${o.highlight.ruleId} ${pct(o.highlight.probability)}`));
  }
  if (o.suggestion) {
    stats.suggestions++;
    tags.push(color(36, `SUGGEST ${o.suggestion.ruleId} ${pct(o.suggestion.probability)}`));
  }
  if (o.uncertain.length > 0) stats.uncertain++;
  for (const u of o.uncertain) tags.push(color(35, `UNSURE ${u.ruleId} ${pct(u.probability)}`));
  if (tags.length === 0) return;
  // Possible spoilers are hidden here too, as they will be in the dashboard.
  const text = o.spoiler ? color(2, "[possible spoiler hidden]") : m.text;
  console.log(`${tags.join(" | ")}  ${color(2, m.author.displayName + ":")} ${text}`);
});

function summary() {
  const minutes = (Date.now() - started) / 60_000;
  const costPerHour = minutes > 0 ? ((tokens * PRICE_PER_TOKEN) / minutes) * 60 : 0;
  console.log(
    color(
      2,
      `— ${stats.seen} seen, ${stats.evaluated} evaluated, ${gate.skipped()} skipped by --rate ${rate}/s | ` +
        `would moderate ${stats.wouldModerate}, unsure ${stats.uncertain}, highlights ${stats.highlights}, ` +
        `suggestions ${stats.suggestions}, warnings ${stats.errors} | ~$${costPerHour.toFixed(4)}/h at this rate`,
    ),
  );
}

let thirdPartyEmotes = new Set<string>();

const reader = readChannel(channel, {
  message: (m) => {
    stats.seen++;
    if (gate.allow()) void engine.handleMessage(withThirdPartyEmotes(m, thirdPartyEmotes));
  },
  room: async (id) => {
    const { names, warnings } = await loadThirdPartyEmotes(id);
    thirdPartyEmotes = names;
    for (const w of warnings) console.log(color(33, `  ! ${w}`));
    console.log(color(2, `[${names.size} 7TV/BTTV/FFZ emotes loaded]`));
  },
  status: (s, detail) => console.log(color(2, `[${s}${detail ? ` ${detail}` : ""}]`)),
  warning: (w) => console.log(color(33, `  ! ${w}`)),
});

console.log(color(2, `Observing #${channel.toLowerCase()} read-only with ${rulesPath} (Ctrl+C to stop)`));
const timer = setInterval(summary, SUMMARY_EVERY_MS);
process.on("SIGINT", () => {
  clearInterval(timer);
  summary();
  reader.close();
  process.exit(0);
});
