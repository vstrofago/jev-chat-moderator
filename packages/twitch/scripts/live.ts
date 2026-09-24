/**
 * Connects Vigia to YOUR channel with your own Twitch app, for trying it for real
 * (for example the !vigia commands). Starts in observe mode: nothing is deleted or
 * timed out unless you pass --act. Command replies are posted to your chat.
 *
 *   TWITCH_CLIENT_ID=... AI_GATEWAY_API_KEY=vck_... pnpm live [--rules file.yaml] [--act] [--logout]
 *
 * The Twitch login is stored in ~/.config/vigia/dev-tokens.json (readable only by you).
 */
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createEngine, jevEvaluator, parseConfig } from "@vigia/engine";
import { connectTwitch, createTwitchPlatform } from "../src/connect";
import { createHelix } from "../src/helix";
import { openTwitchSession } from "../src/session";
import { color, formatDecision } from "./print";

const { values } = parseArgs({
  options: {
    rules: { type: "string", default: new URL("../../engine/examples/vigia.yaml", import.meta.url).pathname },
    act: { type: "boolean", default: false },
    logout: { type: "boolean", default: false },
  },
});

const TOKEN_FILE = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "vigia", "dev-tokens.json");
if (values.logout) {
  await rm(TOKEN_FILE, { force: true });
  console.log(`Removed ${TOKEN_FILE}`);
  process.exit(0);
}

const clientId = process.env.TWITCH_CLIENT_ID;
const gatewayKey = process.env.AI_GATEWAY_API_KEY;
const typesafeKey = process.env.TYPESAFE_API_KEY;
if (!clientId) {
  console.error("Set TWITCH_CLIENT_ID: the client ID of your own app at dev.twitch.tv (client type: Public).");
  process.exit(1);
}
if (!gatewayKey && !typesafeKey) {
  console.error("Set AI_GATEWAY_API_KEY (vck_...) or TYPESAFE_API_KEY.");
  process.exit(1);
}

const rulesPath = resolve(process.env.INIT_CWD ?? process.cwd(), values.rules!);
const parsed = parseConfig(await readFile(rulesPath, "utf8"));
if (!parsed.ok) {
  for (const e of parsed.errors) console.error(`${rulesPath}:${e.line ?? "?"} ${e.path} ${e.message}`);
  process.exit(1);
}

const session = await openTwitchSession({
  clientId,
  tokenFile: TOKEN_FILE,
  onCode: (uri, code, minutes) => {
    console.log(`\nOpen ${color(36, uri)}`);
    console.log(`and confirm the code ${color(32, code)} (valid ${minutes} min).\n`);
  },
}).catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
const who = { userId: session.userId, login: session.login };
const manager = session;

const helix = createHelix({ clientId, token: manager.token, refresh: manager.refresh });
const ids = { broadcasterId: who.userId, actorId: who.userId };

const engine = createEngine({
  config: { ...parsed.config, observe: !values.act },
  platform: createTwitchPlatform(helix, ids),
  evaluate: jevEvaluator(gatewayKey ? { apiKey: gatewayKey, provider: "gateway" } : { apiKey: typesafeKey!, provider: "typesafe" }),
});

engine.on((e) => {
  if (e.type === "warning") return console.log(color(33, `  ! ${e.code}: ${e.detail}`));
  if (e.type === "state") {
    const s = e.state;
    return console.log(
      color(2, `[state] paused=${s.paused} observe=${s.observe} category=${s.category ?? "-"} progress=${s.progress ?? "-"} off=${s.disabledRules.join(",") || "-"}`),
    );
  }
  if (e.type === "highlight") return console.log(color(32, `[overlay] ${e.item.kind}: ${e.item.authorName ? e.item.authorName + ": " : ""}${e.item.text}`));
  if (e.type === "clear-highlight") return console.log(color(32, "[overlay] cleared"));
  const line = formatDecision(e);
  if (line) console.log(line);
});

const conn = connectTwitch({
  engine,
  helix,
  ...ids,
  onStatus: (s, d) => console.log(color(2, `[${s}${d ? ` ${d}` : ""}]`)),
  onWarning: (w) => console.log(color(33, `  ! ${w}`)),
  onModerators: (m) => console.log(color(2, `[moderators] ${m.size}`)),
});

console.log(
  color(2, `Vigia on #${who.login} with ${rulesPath} — ${values.act ? color(31, "ACTING (deletes and timeouts are real)") : "observe mode (nothing is deleted)"}. Ctrl+C to stop.`),
);
process.on("SIGINT", () => {
  conn.close();
  process.exit(0);
});
