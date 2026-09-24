/**
 * Headless Vigía, for a terminal or a VPS (Docker).
 *
 *   AI_GATEWAY_API_KEY=vck_... pnpm vigia --source observe:<channel>
 *   AI_GATEWAY_API_KEY=vck_... TWITCH_CLIENT_ID=... pnpm vigia --source twitch
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { jevEvaluator } from "@vigia/engine";
import { createUsageMeter, defaultUiDir, exampleConfigText, observeSource, startVigia, twitchSource, ConfigFileError } from "@vigia/server";
import { openTwitchSession } from "@vigia/twitch";
import { parseCliArgs } from "./args";

const parsed = parseCliArgs(process.argv.slice(2), process.env);
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}
const o = parsed.options;
// pnpm runs scripts from the package folder; resolve paths against where the user typed.
const cwd = process.env.INIT_CWD ?? process.cwd();
const configPath = resolve(cwd, o.configPath);
const dataDir = resolve(cwd, o.dataDir);

const uiDir = defaultUiDir();
if (!existsSync(join(uiDir, "overlay.html"))) {
  console.error(`The web UI is not built (${uiDir}). Run: pnpm --filter @vigia/ui build`);
  process.exit(1);
}

let source;
if (o.source.kind === "twitch") {
  const session = await openTwitchSession({
    clientId: o.source.clientId,
    tokenFile: join(dataDir, "twitch-login.json"),
    onCode: (uri, code, minutes) => console.log(`\nLog in to Twitch: open ${uri} and confirm ${code} (valid ${minutes} min).\n`),
  }).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
  console.log(`Logged in as ${session.login}.`);
  source = twitchSource(session, o.source.clientId);
} else {
  source = observeSource(o.source.channel, { rate: o.source.rate, category: o.source.category });
}

const usage = createUsageMeter();
const vigia = await startVigia({
  configPath,
  dataDir,
  uiDir,
  exampleText: exampleConfigText(),
  source,
  evaluate: jevEvaluator(o.jev, { onUsage: (n) => usage.tokens(n) }),
  usage,
  host: o.host,
  port: o.port,
}).catch((e: Error) => {
  console.error(e instanceof ConfigFileError ? e.message : `Could not start: ${e.message}`);
  process.exit(1);
});

const mode =
  o.source.kind === "observe"
    ? `watching #${o.source.channel} read-only (observe mode, nothing is ever deleted)`
    : vigia.engine.state().observe
      ? "observe mode: decisions are logged, nothing is deleted yet (set observe: false in the rules file to act)"
      : "ACTING: deletes and timeouts are real";
const access =
  vigia.authMode === "exposed"
    ? `  Dashboard: ${vigia.url} (exposed: sign in with Twitch, or with the admin code ${vigia.adminCode})`
    : `  Dashboard: ${vigia.url} (only this computer can open it)`;
console.log(`
Vigía is running — ${mode}
${access}
  Rules:     ${configPath}
  Overlay:   ${vigia.overlayUrl}
  Place it in OBS with the preview card: ${vigia.overlayUrl}&preview=1
`);

vigia.engine.on((e) => {
  if (e.type === "highlight") console.log(`[overlay] ${e.item.kind}: ${e.item.authorName ? `${e.item.authorName}: ` : ""}${e.item.text}`);
});

const stop = async () => {
  await vigia.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
