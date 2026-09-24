import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Encrypts the settings file: Electron's safeStorage on the desktop, injected for tests. */
export interface Cipher {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface VigiaSettings {
  lang?: "en" | "es";
  source?: "twitch" | "observe";
  observeChannel?: string;
  twitchClientId?: string;
  /** The Twitch login (tokens), as saved by openTwitchSession. */
  twitchTokens?: string;
  jevKey?: string;
  port?: number;
}

/**
 * Vigia's settings and secrets, in one file readable only by the user.
 * - On the desktop it is encrypted with the OS keychain. Without one (some Linux desktops) it
 *   still works, but `weak` is true so the setup page can say so.
 * - The server passes no cipher: the file sits in the data folder (a Docker volume), where
 *   file permissions are the protection, as for the Twitch login the CLI always kept.
 */
export async function openSecrets(path: string, cipher: Cipher | null) {
  const weak = cipher ? !cipher.available() : false;
  const plain = !cipher || weak;
  let settings: VigiaSettings = {};
  try {
    const file = JSON.parse(await readFile(path, "utf8"));
    const raw = Buffer.from(file.data, "base64");
    settings = JSON.parse(file.weak || !cipher ? raw.toString("utf8") : cipher.decrypt(raw));
  } catch {
    settings = {};
  }

  async function save() {
    const json = JSON.stringify(settings);
    const data = plain ? Buffer.from(json) : cipher!.encrypt(json);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify({ v: 1, weak: plain, data: data.toString("base64") }), { mode: 0o600 });
    await rename(tmp, path);
  }

  return {
    weak,
    get: (): VigiaSettings => ({ ...settings }),
    /** Merges `patch`; keys set to undefined are removed. */
    async update(patch: Partial<Record<keyof VigiaSettings, unknown>>) {
      const next: Record<string, unknown> = { ...settings };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      settings = next as VigiaSettings;
      await save();
    },
  };
}

export type Secrets = Awaited<ReturnType<typeof openSecrets>>;

export type SetupStep = "source" | "twitch-app" | "twitch-login" | "jev-key" | "done";

/** What the setup page must ask next, given what is already stored. */
export function nextStep(s: VigiaSettings): SetupStep {
  if (s.source === "observe") {
    if (!s.observeChannel) return "source";
  } else if (s.source === "twitch") {
    if (!s.twitchClientId) return "twitch-app";
    if (!s.twitchTokens) return "twitch-login";
  } else return "source";
  return s.jevKey ? "done" : "jev-key";
}
