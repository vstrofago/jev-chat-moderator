import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Electron's safeStorage, injected so the store can be tested. */
export interface Cipher {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface DesktopSettings {
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
 * Settings and secrets of the desktop app, in one file encrypted with the OS keychain.
 * Without a keychain (some Linux desktops) it still works, but `weak` is true so the setup
 * page can say so.
 */
export async function openSecrets(path: string, cipher: Cipher) {
  const weak = !cipher.available();
  let settings: DesktopSettings = {};
  try {
    const file = JSON.parse(await readFile(path, "utf8"));
    const raw = Buffer.from(file.data, "base64");
    settings = JSON.parse(file.weak ? raw.toString("utf8") : cipher.decrypt(raw));
  } catch {
    settings = {};
  }

  async function save() {
    const json = JSON.stringify(settings);
    const data = weak ? Buffer.from(json) : cipher.encrypt(json);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify({ v: 1, weak, data: data.toString("base64") }), { mode: 0o600 });
    await rename(tmp, path);
  }

  return {
    weak,
    get: (): DesktopSettings => ({ ...settings }),
    /** Merges `patch`; keys set to undefined are removed. */
    async update(patch: Partial<Record<keyof DesktopSettings, unknown>>) {
      const next: Record<string, unknown> = { ...settings };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      settings = next as DesktopSettings;
      await save();
    },
  };
}

export type Secrets = Awaited<ReturnType<typeof openSecrets>>;
