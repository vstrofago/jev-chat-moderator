import { AuthError, detectProvider, evaluate } from "@vigia/core";
import { openTwitchSession, type TokenStore } from "@vigia/twitch";
import { nextStep, type Secrets, type SetupStep, type VigiaSettings } from "./settings";
import { observeSource, twitchSource } from "./sources";
import type { ChatSource } from "./host";

/** What the setup page shows. The desktop and the web setup send exactly this. */
export interface SetupState {
  step: SetupStep;
  source?: "twitch" | "observe";
  observeChannel?: string;
  twitchClientId?: string;
  /** The settings are stored without encryption (a desktop with no keychain). */
  weak: boolean;
}

export type SetupErrorCode = "invalid-channel" | "invalid-client-id" | "no-client-id" | "bad-key" | "unreachable";

/** A setup call the page made wrong; `code` is translated by the page. */
export class SetupError extends Error {
  constructor(
    public code: SetupErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type JevKeyCheck = (key: string) => Promise<{ code: "bad-key" | "unreachable"; detail?: string } | null>;
export type TwitchLoginResult = { ok: boolean; login?: string; error?: string };

/** One tiny yes/no question: proves a Jev key works before it is saved. */
export const checkJevKey: JevKeyCheck = async (apiKey) => {
  try {
    await evaluate(
      { message: "hello chat!" },
      { greeting: { type: "boolean", instructions: "Is this message a greeting?" } },
      { apiKey, provider: detectProvider(apiKey), timeoutMs: 20_000 },
    );
    return null;
  } catch (e) {
    return e instanceof AuthError ? { code: "bad-key" } : { code: "unreachable", detail: (e as Error).message };
  }
};

const tokenStore = (secrets: Secrets, current: () => boolean = () => true): TokenStore => ({
  load: async () => secrets.get().twitchTokens ?? null,
  save: async (text) => {
    if (current()) await secrets.update({ twitchTokens: text });
  },
});

/**
 * The setup steps (where to watch, the Twitch app, the device login and the Jev key),
 * shared by the desktop window and the web setup of the server.
 */
export function createSetupFlow(o: {
  secrets: Secrets;
  /** Tells the page when a device login ends (it may take minutes). */
  onLogin(r: TwitchLoginResult): void;
  /** The desktop opens the browser at the Twitch page; the web page shows a link instead. */
  openExternal?(url: string): void;
  checkKey?: JevKeyCheck;
  openSession?: typeof openTwitchSession;
}) {
  const { secrets } = o;
  const openSession = o.openSession ?? openTwitchSession;
  const checkKey = o.checkKey ?? checkJevKey;
  // A device login keeps polling Twitch until it is confirmed or expires; one started before
  // "Back" must not save anything afterwards.
  let loginRun = 0;

  const state = (): SetupState => {
    const s = secrets.get();
    return { step: nextStep(s), source: s.source, observeChannel: s.observeChannel, twitchClientId: s.twitchClientId, weak: secrets.weak };
  };

  return {
    state,

    async chooseSource(source: unknown, channel?: unknown): Promise<SetupState> {
      if (source === "observe") {
        if (typeof channel !== "string" || !/^[a-z0-9_]{3,25}$/.test(channel)) throw new SetupError("invalid-channel", "Invalid channel name");
        await secrets.update({ source, observeChannel: channel });
      } else if (source === "twitch") {
        await secrets.update({ source, observeChannel: undefined });
      }
      return state();
    },

    async saveClientId(clientId: unknown): Promise<SetupState> {
      if (typeof clientId !== "string" || !/^[a-z0-9]{10,64}$/i.test(clientId)) throw new SetupError("invalid-client-id", "Invalid Client ID");
      await secrets.update({ twitchClientId: clientId, twitchTokens: undefined });
      return state();
    },

    /** Starts the device login; resolves with the code to confirm, and reports the end through onLogin. */
    startTwitchLogin(): Promise<{ uri: string; code: string; minutes: number }> {
      const clientId = secrets.get().twitchClientId;
      if (!clientId) return Promise.reject(new SetupError("no-client-id", "No Client ID"));
      const run = ++loginRun;
      const current = () => run === loginRun;
      return new Promise((resolveCode, rejectCode) => {
        let gotCode = false;
        openSession({
          clientId,
          tokenStore: tokenStore(secrets, current),
          onCode: (uri, code, minutes) => {
            gotCode = true;
            o.openExternal?.(uri);
            resolveCode({ uri, code, minutes });
          },
        }).then(
          (s) => {
            if (!current()) return;
            if (!gotCode) resolveCode({ uri: "", code: "", minutes: 0 });
            o.onLogin({ ok: true, login: s.login });
          },
          (err: Error) => {
            if (!current()) return;
            if (!gotCode) rejectCode(err);
            else o.onLogin({ ok: false, error: err.message });
          },
        );
      });
    },

    async saveJevKey(key: unknown): Promise<{ ok: true; state: SetupState } | { ok: false; code: string; error: string }> {
      if (typeof key !== "string" || !key.trim()) return { ok: false, code: "bad-key", error: "Jev rejected the key." };
      const problem = await checkKey(key.trim());
      if (problem) return { ok: false, code: problem.code, error: problem.detail ?? problem.code };
      await secrets.update({ jevKey: key.trim() });
      return { ok: true, state: state() };
    },

    async back(): Promise<SetupState> {
      loginRun++;
      const s = secrets.get();
      const patch: Partial<Record<keyof VigiaSettings, undefined>> = {};
      switch (nextStep(s)) {
        case "twitch-app":
          patch.source = undefined;
          break;
        case "twitch-login":
          patch.twitchClientId = undefined;
          break;
        case "jev-key":
          if (s.source === "observe") Object.assign(patch, { source: undefined, observeChannel: undefined });
          else patch.twitchTokens = undefined;
          break;
        case "done":
          patch.jevKey = undefined;
          break;
      }
      await secrets.update(patch);
      return state();
    },

    /** Forgets where to watch (and the Twitch login), keeping the Jev key and the port. */
    async reset(): Promise<SetupState> {
      loginRun++;
      await secrets.update({ source: undefined, observeChannel: undefined, twitchClientId: undefined, twitchTokens: undefined });
      return state();
    },
  };
}

export type SetupFlow = ReturnType<typeof createSetupFlow>;

/** The saved Twitch login no longer works (revoked, or new scopes): run setup again. */
export class NeedsLogin extends Error {}

/**
 * The chat source the saved settings describe. For Twitch, the stored login is reused (and
 * refreshed); if it cannot be, this throws NeedsLogin and the tokens are forgotten.
 */
export async function sourceFromSettings(
  secrets: Secrets,
  o: { log(line: string): void; openSession?: typeof openTwitchSession },
): Promise<ChatSource> {
  const s = secrets.get();
  if (s.source === "observe") return observeSource(s.observeChannel!);
  const clientId = s.twitchClientId!;
  try {
    const session = await (o.openSession ?? openTwitchSession)({
      clientId,
      tokenStore: tokenStore(secrets),
      onCode: () => {
        throw new NeedsLogin("The Twitch login stopped working; log in again.");
      },
    });
    o.log(`Logged in to Twitch as ${session.login}`);
    return twitchSource(session, clientId);
  } catch (e) {
    if (e instanceof NeedsLogin) await secrets.update({ twitchTokens: undefined });
    throw e;
  }
}
