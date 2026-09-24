/**
 * Connects Vigía to YOUR channel with your own Twitch app, for trying it for real
 * (for example the !vigia commands). Starts in observe mode: nothing is deleted or
 * timed out unless you pass --act. Command replies are posted to your chat.
 *
 *   TWITCH_CLIENT_ID=... AI_GATEWAY_API_KEY=vck_... pnpm live [--rules file.yaml] [--act] [--logout]
 *
 * The Twitch login is stored in ~/.config/vigia/dev-tokens.json (readable only by you).
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createEngine, jevEvaluator, parseConfig } from "@vigia/engine";
import { createTokenManager, refreshTokens, SCOPES, startDeviceLogin, validateToken, type Tokens } from "../src/auth";
import { connectTwitch, createTwitchPlatform } from "../src/connect";
import { createHelix } from "../src/helix";
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

async function save(t: Tokens) {
  await mkdir(dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_FILE, JSON.stringify({ clientId, ...t }, null, 2), { mode: 0o600 });
  await chmod(TOKEN_FILE, 0o600);
}

async function stored(): Promise<Tokens | null> {
  try {
    const t = JSON.parse(await readFile(TOKEN_FILE, "utf8"));
    return t.clientId === clientId ? t : null;
  } catch {
    return null;
  }
}

async function login(): Promise<Tokens> {
  const flow = await startDeviceLogin({ clientId: clientId! }).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
  console.log(`\nOpen ${color(36, flow.verificationUri)}`);
  console.log(`and confirm the code ${color(32, flow.userCode)} (valid ${Math.round(flow.expiresIn / 60)} min).\n`);
  const t = await flow.poll();
  await save(t);
  console.log("Logged in.");
  return t;
}

// Reuse the stored login when it still works (refreshing it if needed), otherwise log in.
let tokens = await stored();
let who = tokens ? await validateToken(tokens.accessToken) : null;
if (tokens && !who) {
  try {
    tokens = await refreshTokens({ clientId, refreshToken: tokens.refreshToken });
    await save(tokens);
    who = await validateToken(tokens.accessToken);
  } catch {
    who = null;
  }
}
if (!tokens || !who || !SCOPES.every((s) => who!.scopes.includes(s))) {
  tokens = await login();
  who = await validateToken(tokens.accessToken);
}
if (!who) throw new Error("Twitch did not accept the new login.");
const manager = createTokenManager({ clientId, tokens, save });

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
  color(2, `Vigía on #${who.login} with ${rulesPath} — ${values.act ? color(31, "ACTING (deletes and timeouts are real)") : "observe mode (nothing is deleted)"}. Ctrl+C to stop.`),
);
process.on("SIGINT", () => {
  conn.close();
  process.exit(0);
});
