import { randomBytes, timingSafeEqual } from "node:crypto";

export type Role = "broadcaster" | "moderator";

export interface User {
  id: string;
  login: string;
  role: Role;
}

/** The parts of an HTTP request that access control looks at. */
export interface AuthRequest {
  method: string;
  host?: string;
  cookie?: string;
  /** The `X-Vigia` header: cross-site forms can't send it. */
  xVigia?: string;
}

export interface AuthOptions {
  /** local: bound to loopback, no login. exposed: every request needs a session. */
  mode: "local" | "exposed";
  /** Printed in the server logs; grants the broadcaster role. */
  adminCode: string;
  /** The streamer's app: Twitch logins must be for this client. */
  clientId?: string;
  broadcasterId?: string;
  /** Checks a Twitch token (id.twitch.tv/oauth2/validate); null when invalid. */
  validate?: (token: string) => Promise<{ userId: string; login: string; clientId: string } | null>;
  now?: () => number;
}

export type LoginResult = { ok: true; sessionId: string; user: User } | { ok: false; error: string };
export type GuardResult = { ok: true; user: User } | { ok: false; status: 401 | 403; error: string };

const COOKIE = "vigia_session";
const SESSION_TTL_MS = 12 * 3600_000;
const MAX_CODE_FAILURES = 10;
const LOCKOUT_MS = 10 * 60_000;
const LOCAL_USER: User = { id: "local", login: "local", role: "broadcaster" };
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Who may use the dashboard, and how. See the M4 plan's auth rulings. */
export function createAuth(o: AuthOptions) {
  const now = o.now ?? Date.now;
  const sessions = new Map<string, { user: User; expires: number }>();
  let moderators = new Set<string>();
  let failures: number[] = [];

  function open(user: User): LoginResult {
    const sessionId = randomBytes(32).toString("base64url");
    sessions.set(sessionId, { user, expires: now() + SESSION_TTL_MS });
    return { ok: true, sessionId, user };
  }

  function sessionId(cookieHeader?: string) {
    for (const part of (cookieHeader ?? "").split(";")) {
      const [k, v] = part.trim().split("=");
      if (k === COOKIE && v) return v;
    }
    return undefined;
  }

  function userFrom(cookieHeader?: string): User | null {
    const id = sessionId(cookieHeader);
    const s = id ? sessions.get(id) : undefined;
    if (!s) return null;
    if (s.expires < now()) {
      sessions.delete(id!);
      return null;
    }
    return s.user;
  }

  return {
    mode: o.mode,

    loginWithCode(code: string): LoginResult {
      const t = now();
      failures = failures.filter((f) => t - f < LOCKOUT_MS);
      if (failures.length >= MAX_CODE_FAILURES) return { ok: false, error: "Too many wrong codes. Try again in 10 minutes." };
      if (!sameSecret(code.trim(), o.adminCode)) {
        failures.push(t);
        return { ok: false, error: "Wrong code." };
      }
      return open({ id: "admin", login: "admin", role: "broadcaster" });
    },

    /** Uses the token only to learn who the user is; it is not kept. */
    async loginWithTwitch(token: string): Promise<LoginResult> {
      if (!o.validate || !o.clientId) return { ok: false, error: "Twitch login is not available with this source." };
      const who = await o.validate(token).catch(() => null);
      if (!who) return { ok: false, error: "Twitch did not accept the login." };
      if (who.clientId !== o.clientId) return { ok: false, error: "That login was made for a different app." };
      if (who.userId === o.broadcasterId) return open({ id: who.userId, login: who.login, role: "broadcaster" });
      if (moderators.has(who.userId)) return open({ id: who.userId, login: who.login, role: "moderator" });
      return { ok: false, error: `${who.login} is not a moderator of this channel.` };
    },

    logout(cookieHeader?: string) {
      const id = sessionId(cookieHeader);
      if (id) sessions.delete(id);
    },

    /** The live moderator list; removed mods lose their sessions at once. */
    setModerators(ids: Iterable<string>) {
      moderators = new Set(ids);
      for (const [id, s] of sessions) {
        if (s.user.role === "moderator" && !moderators.has(s.user.id)) sessions.delete(id);
      }
    },

    guard(req: AuthRequest, need: { write?: boolean; role?: Role }): GuardResult {
      if (need.write && req.xVigia !== "1") return { ok: false, status: 403, error: "Missing X-Vigia header" };
      let user: User | null;
      if (o.mode === "local") {
        if (!LOOPBACK.test(req.host ?? "")) return { ok: false, status: 403, error: "Unexpected Host" };
        user = LOCAL_USER;
      } else {
        user = userFrom(req.cookie);
        if (!user) return { ok: false, status: 401, error: "Log in first" };
      }
      if (need.role === "broadcaster" && user.role !== "broadcaster") {
        return { ok: false, status: 403, error: "Only the broadcaster can do this" };
      }
      return { ok: true, user };
    },

    /** WebSockets skip CORS, so their Origin must be this very server. */
    originAllowed(origin: string | undefined, host: string | undefined): boolean {
      if (!origin || !host) return false;
      if (o.mode === "local" && !LOOPBACK.test(host)) return false;
      return origin === `http://${host}` || origin === `https://${host}`;
    },

    cookie(sessionId: string, secure: boolean): string {
      return `${COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
    },
    clearCookie: () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  };
}

export type Auth = ReturnType<typeof createAuth>;
