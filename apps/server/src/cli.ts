/**
 * Headless Vigia, for a terminal, a VPS or Docker.
 *
 *   pnpm vigia                       set it up in the browser (settings kept in --data)
 *   AI_GATEWAY_API_KEY=vck_... pnpm vigia --source observe:<channel>
 *   AI_GATEWAY_API_KEY=vck_... TWITCH_CLIENT_ID=... pnpm vigia --source twitch
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectProvider, type ClientOptions } from "@vigia/core";
import { jevEvaluator } from "@vigia/engine";
import {
  ConfigFileError,
  createUsageMeter,
  defaultUiDir,
  exampleConfigText,
  LOOPBACK_HOSTS,
  NeedsLogin,
  nextStep,
  observeSource,
  openSecrets,
  readAdminCode,
  sourceFromSettings,
  startSetupServer,
  startVigia,
  twitchSource,
  type ChatSource,
} from "@vigia/server";
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
const log = (line: string) => console.log(line);

const uiDir = defaultUiDir();
if (!existsSync(join(uiDir, "overlay.html"))) {
  console.error(`The web UI is not built (${uiDir}). Run: pnpm --filter @vigia/ui build`);
  process.exit(1);
}

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

let source: ChatSource;
let jev: Pick<ClientOptions, "apiKey" | "provider">;
let readOnly: boolean;

if (o.setup) {
  // Settings mode: everything the browser setup asked is kept in the data folder.
  const secrets = await openSecrets(join(dataDir, "settings.json"), null);
  const s = secrets.get();
  if (o.setup.force) await secrets.update({ source: undefined, observeChannel: undefined, twitchClientId: undefined, twitchTokens: undefined });
  const seed = o.setup.seed;
  if (seed.jevKey && !s.jevKey) await secrets.update({ jevKey: seed.jevKey });
  if (seed.twitchClientId && !s.twitchClientId) await secrets.update({ twitchClientId: seed.twitchClientId });

  // Reachable from other machines (Docker, a VPS): only whoever reads the logs may set it up.
  const code = LOOPBACK_HOSTS.has(o.host) ? undefined : await readAdminCode(dataDir);

  for (;;) {
    if (nextStep(secrets.get()) !== "done") {
      await new Promise<void>((finished, failed) => {
        startSetupServer({ host: o.host, port: o.port, uiDir, secrets, code, onFinish: finished, log }).then((setup) => {
          console.log(`
Vigia needs to be set up. Open ${setup.url} in your browser.${code ? `\n  Setup code: ${code}  (the same admin code logs you in to the dashboard later)` : ""}
`);
        }, failed);
      }).catch((e: Error) => fail(`Could not start the setup page: ${e.message}`));
    }
    try {
      source = await sourceFromSettings(secrets, { log });
      break;
    } catch (e) {
      if (!(e instanceof NeedsLogin)) fail(`Could not connect: ${(e as Error).message}`);
      console.log("The saved Twitch login stopped working. Log in again from the setup page.");
    }
  }
  const key = secrets.get().jevKey!;
  jev = { apiKey: key, provider: detectProvider(key) };
  readOnly = secrets.get().source === "observe";
} else {
  const src = o.source!;
  if (src.kind === "twitch") {
    const session = await openTwitchSession({
      clientId: src.clientId,
      tokenFile: join(dataDir, "twitch-login.json"),
      onCode: (uri, code, minutes) => console.log(`\nLog in to Twitch: open ${uri} and confirm ${code} (valid ${minutes} min).\n`),
    }).catch((e: Error) => fail(e.message));
    console.log(`Logged in as ${session.login}.`);
    source = twitchSource(session, src.clientId);
  } else {
    source = observeSource(src.channel, { rate: src.rate, category: src.category });
  }
  jev = o.jev!;
  readOnly = src.kind === "observe";
}

const usage = createUsageMeter();
const vigia = await startVigia({
  configPath,
  dataDir,
  uiDir,
  exampleText: exampleConfigText(),
  source,
  evaluate: jevEvaluator(jev, { onUsage: (n) => usage.tokens(n) }),
  usage,
  host: o.host,
  port: o.port,
  log,
}).catch((e: Error) => fail(e instanceof ConfigFileError ? e.message : `Could not start: ${e.message}`));

const mode = readOnly
  ? "watching a channel read-only (observe mode, nothing is ever deleted)"
  : vigia.engine.state().observe
    ? "observe mode: decisions are logged, nothing is deleted yet (set observe: false in the rules file to act)"
    : "ACTING: deletes and timeouts are real";
const access =
  vigia.authMode === "exposed"
    ? `  Dashboard: ${vigia.url} (exposed: sign in with Twitch, or with the admin code ${vigia.adminCode})`
    : `  Dashboard: ${vigia.url} (only this computer can open it)`;
console.log(`
Vigia is running — ${mode}
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
