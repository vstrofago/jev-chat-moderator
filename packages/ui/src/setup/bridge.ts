/**
 * How the setup page talks to Vigia: the desktop app's preload (apps/desktop/src/preload.cts),
 * or, in a browser, the server's setup API (packages/server/src/setup-server.ts).
 */
import type { SetupState, SetupStep } from "@vigia/server";

export type { SetupState, SetupStep };

export type JevKeyResult = { ok: true; state: SetupState } | { ok: false; code?: string; error?: string };

export interface DesktopBridge {
  /** The desktop opens twitch.tv by itself; a web page shows a button instead. */
  autoOpens?: boolean;
  state(): Promise<SetupState>;
  chooseSource(source: "twitch" | "observe", channel?: string): Promise<SetupState>;
  saveClientId(clientId: string): Promise<SetupState>;
  /** Starts the device login; the desktop also opens the browser. */
  startTwitchLogin(): Promise<{ uri: string; code: string; minutes: number }>;
  onTwitchLogin(listener: (r: { ok: boolean; login?: string; error?: string }) => void): void;
  saveJevKey(key: string): Promise<JevKeyResult>;
  back(): Promise<SetupState>;
  finish(): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** Web only: the setup code printed in the logs, when the server is reachable from elsewhere. */
  unlock?(code: string): Promise<boolean>;
}

declare global {
  interface Window {
    vigiaDesktop?: DesktopBridge;
  }
}

/** The server wants the setup code before anything else. */
export class LockedError extends Error {}

const CODE_KEY = "vigia.setupCode";
const storedCode = () => {
  try {
    return sessionStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
};

async function post<T>(name: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api/setup/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vigia": "1", "X-Vigia-Code": storedCode() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new LockedError(data.error ?? "locked");
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { code: data.code });
  return data.result as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function webBridge(): DesktopBridge {
  let loginListener: ((r: { ok: boolean; login?: string; error?: string }) => void) | null = null;
  let polling = 0;

  async function pollLogin(run: number) {
    while (run === polling) {
      await sleep(2000);
      if (run !== polling) return;
      const r = await post<{ ok: boolean; login?: string; error?: string } | null>("twitchLogin", { args: [] }).catch(() => null);
      if (r) {
        polling++;
        loginListener?.(r);
      }
    }
  }

  const call =
    <T>(name: string) =>
    (...args: unknown[]) =>
      post<T>(name, { args });

  return {
    autoOpens: false,
    state: call("state"),
    chooseSource: call("chooseSource"),
    saveClientId: call("saveClientId"),
    async startTwitchLogin() {
      const r = await post<{ uri: string; code: string; minutes: number }>("startTwitchLogin", { args: [] });
      void pollLogin(++polling);
      return r;
    },
    onTwitchLogin(listener) {
      loginListener = listener;
    },
    saveJevKey: call("saveJevKey"),
    async back() {
      polling++;
      return post<SetupState>("back", { args: [] });
    },
    async finish() {
      await post("finish", { args: [] });
      // The setup server hands its port to Vigia: wait until the dashboard answers there.
      for (let i = 0; i < 120; i++) {
        await sleep(1000);
        const health = await fetch("/health", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null);
        if (health?.ok && !health.setup) break;
      }
      // Reachable from other machines: the setup code is also the admin code, so log in with it.
      const code = storedCode();
      if (code) {
        await fetch("/api/login/code", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Vigia": "1" },
          body: JSON.stringify({ code }),
        }).catch(() => {});
      }
      location.href = "/";
    },
    async openExternal(url) {
      if (/^https:\/\//.test(url)) window.open(url, "_blank", "noopener");
    },
    async unlock(code) {
      const res = await fetch("/api/setup/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vigia": "1" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) return false;
      try {
        sessionStorage.setItem(CODE_KEY, code.trim().toUpperCase());
      } catch {}
      return true;
    },
  };
}

let web: DesktopBridge | null = null;
export const desktop = (): DesktopBridge => window.vigiaDesktop ?? (web ??= webBridge());
