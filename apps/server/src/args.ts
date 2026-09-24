import { parseArgs } from "node:util";
import type { ClientOptions } from "@vigia/core";

export type SourceOption =
  | { kind: "twitch"; clientId: string }
  | { kind: "observe"; channel: string; rate: number; category?: string };

export interface CliOptions {
  configPath: string;
  dataDir: string;
  host: string;
  port: number;
  /** Set up in the browser instead of with --source: settings live in the data folder. */
  setup: { force: boolean; seed: { jevKey?: string; twitchClientId?: string } } | null;
  source?: SourceOption;
  jev?: Pick<ClientOptions, "apiKey" | "provider">;
}

export const USAGE = `Usage: vigia [--source twitch|observe:<channel>] [options]

  (no --source)              set Vigia up in the browser; the settings are kept in --data
  --setup                    run the browser setup again (keeps the Jev key)
  --source twitch            your own channel (needs TWITCH_CLIENT_ID of your Public app)
  --source observe:<channel> any public channel, read-only, never acts (for trying Vigia)
  --config <file>            rules file (default: vigia.yaml, created if missing)
  --data <dir>               history and login (default: vigia-data)
  --host <address>           default 127.0.0.1 (only this machine); 0.0.0.0 to expose
  --port <n>                 default 7777
  --rate <n>                 observe only: messages evaluated per second (default 1)
  --category <name>          observe only: game name for the anti-spoiler rule

Environment: AI_GATEWAY_API_KEY (vck_...) or TYPESAFE_API_KEY; TWITCH_CLIENT_ID. Without --source
they are optional and only fill in the browser setup.`;

export function parseCliArgs(
  argv: string[],
  env: Record<string, string | undefined>,
): { ok: true; options: CliOptions } | { ok: false; error: string } {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        source: { type: "string" },
        config: { type: "string", default: "vigia.yaml" },
        data: { type: "string", default: "vigia-data" },
        host: { type: "string", default: "127.0.0.1" },
        port: { type: "string", default: "7777" },
        rate: { type: "string", default: "1" },
        category: { type: "string" },
        setup: { type: "boolean", default: false },
      },
    }));
  } catch (e) {
    return { ok: false, error: `${(e as Error).message}\n\n${USAGE}` };
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return { ok: false, error: "--port must be a number from 0 to 65535" };

  const envKey = env.AI_GATEWAY_API_KEY || env.TYPESAFE_API_KEY || undefined;
  const common = { configPath: values.config!, dataDir: values.data!, host: values.host!, port };
  if (values.source === undefined) {
    return {
      ok: true,
      options: { ...common, setup: { force: values.setup!, seed: { jevKey: envKey, twitchClientId: env.TWITCH_CLIENT_ID || undefined } } },
    };
  }

  let source: SourceOption;
  const raw = values.source;
  if (raw === "twitch") {
    if (!env.TWITCH_CLIENT_ID) {
      return { ok: false, error: "Set TWITCH_CLIENT_ID to the client ID of your own app at dev.twitch.tv (client type: Public)." };
    }
    source = { kind: "twitch", clientId: env.TWITCH_CLIENT_ID };
  } else if (raw.startsWith("observe:") && raw.length > "observe:".length) {
    const rate = Number(values.rate);
    if (!(rate > 0)) return { ok: false, error: "--rate must be a positive number" };
    source = { kind: "observe", channel: raw.slice("observe:".length).toLowerCase(), rate };
    if (values.category) source.category = values.category;
  } else {
    return { ok: false, error: `--source must be twitch or observe:<channel>\n\n${USAGE}` };
  }

  const jev = env.AI_GATEWAY_API_KEY
    ? { apiKey: env.AI_GATEWAY_API_KEY, provider: "gateway" as const }
    : env.TYPESAFE_API_KEY
      ? { apiKey: env.TYPESAFE_API_KEY, provider: "typesafe" as const }
      : null;
  if (!jev) return { ok: false, error: "Set AI_GATEWAY_API_KEY (vck_...) or TYPESAFE_API_KEY for Jev." };

  return {
    ok: true,
    options: { ...common, setup: null, source, jev },
  };
}
