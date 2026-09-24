import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createTokenManager, refreshTokens, SCOPES, startDeviceLogin, validateToken, type Tokens } from "./auth";

/** Keeps the login as text; the desktop app encrypts it. */
export interface TokenStore {
  load(): Promise<string | null>;
  save(text: string): Promise<void>;
}

export interface SessionOptions {
  /** The streamer's own Public app. */
  clientId: string;
  /** Where the login is kept: a file readable only by the user, or a custom store. */
  tokenFile?: string;
  tokenStore?: TokenStore;
  /** Show the user where to go and which code to confirm. */
  onCode(verificationUri: string, userCode: string, minutes: number): void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A logged-in Twitch account: reuses the stored login while it works (refreshing it when
 * needed), and otherwise runs the device-code login.
 */
export async function openTwitchSession(o: SessionOptions) {
  const deps = { fetch: o.fetch, sleep: o.sleep };

  const store: TokenStore = o.tokenStore ?? fileStore(o.tokenFile ?? "twitch-login.json");

  async function save(t: Tokens) {
    await store.save(JSON.stringify({ clientId: o.clientId, ...t }, null, 2));
  }

  async function stored(): Promise<Tokens | null> {
    try {
      const text = await store.load();
      const t = text ? JSON.parse(text) : null;
      return t?.clientId === o.clientId ? t : null;
    } catch {
      return null;
    }
  }

  async function login(): Promise<Tokens> {
    const flow = await startDeviceLogin({ clientId: o.clientId, ...deps });
    o.onCode(flow.verificationUri, flow.userCode, Math.round(flow.expiresIn / 60));
    const t = await flow.poll();
    await save(t);
    return t;
  }

  let tokens = await stored();
  let who = tokens ? await validateToken(tokens.accessToken, deps) : null;
  if (tokens && !who) {
    try {
      tokens = await refreshTokens({ clientId: o.clientId, refreshToken: tokens.refreshToken, ...deps });
      await save(tokens);
      who = await validateToken(tokens.accessToken, deps);
    } catch {
      who = null;
    }
  }
  if (!tokens || !who || !SCOPES.every((s) => who!.scopes.includes(s))) {
    tokens = await login();
    who = await validateToken(tokens.accessToken, deps);
  }
  if (!who) throw new Error("Twitch did not accept the new login.");

  const manager = createTokenManager({ clientId: o.clientId, tokens, save, ...deps });
  return { userId: who.userId, login: who.login, token: manager.token, refresh: manager.refresh };
}

export type TwitchSession = Awaited<ReturnType<typeof openTwitchSession>>;

/** A JSON file readable only by the user. */
function fileStore(path: string): TokenStore {
  return {
    async load() {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null;
      }
    },
    async save(text) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, text, { mode: 0o600 });
      await chmod(path, 0o600);
    },
  };
}
