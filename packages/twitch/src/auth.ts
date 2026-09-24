/** Exactly the permissions the spec lists, nothing more. */
export const SCOPES = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
  "channel:bot",
  "moderator:manage:chat_messages",
  "moderator:manage:banned_users",
  "moderation:read",
];

export interface Tokens {
  accessToken: string;
  /** One-time use for Public clients: every refresh returns a new one. */
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scopes: string[];
}

interface Deps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const ID = "https://id.twitch.tv/oauth2";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function deps(d: Deps) {
  return {
    fetch: d.fetch ?? globalThis.fetch,
    sleep: d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    now: d.now ?? Date.now,
  };
}

async function post(doFetch: typeof fetch, path: string, form: Record<string, string>) {
  const res = await doFetch(`${ID}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as any };
}

function toTokens(body: any, now: number): Tokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
    scopes: body.scope ?? [],
  };
}

/**
 * OAuth Device Code Flow for a Public client: no secret and no redirect URL. The user opens
 * `verificationUri`, confirms `userCode`, and `poll()` resolves with the tokens.
 */
export async function startDeviceLogin(o: { clientId: string; scopes?: string[] } & Deps) {
  const d = deps(o);
  const scopes = (o.scopes ?? SCOPES).join(" ");
  const start = await post(d.fetch, "/device", { client_id: o.clientId, scopes });
  if (!start.ok) {
    throw new Error(
      `Twitch rejected the client ID (${start.body.message ?? start.status}). ` +
        "Check that the app at dev.twitch.tv is registered with client type Public.",
    );
  }
  const { device_code, user_code, verification_uri, expires_in, interval } = start.body;
  const deadline = d.now() + expires_in * 1000;

  return {
    userCode: user_code as string,
    verificationUri: verification_uri as string,
    expiresIn: expires_in as number,
    async poll(): Promise<Tokens> {
      let wait = (interval ?? 5) * 1000;
      for (;;) {
        await d.sleep(wait);
        if (d.now() > deadline) throw new Error("The login code expired. Start the login again.");
        const r = await post(d.fetch, "/token", { client_id: o.clientId, scopes, device_code, grant_type: DEVICE_GRANT });
        if (r.ok) return toTokens(r.body, d.now());
        const message = String(r.body.message ?? "");
        if (message === "authorization_pending") continue;
        if (message === "slow_down") {
          wait += 5000;
          continue;
        }
        throw new Error(`Login was denied or expired (${message || r.status}). Start the login again.`);
      }
    },
  };
}

/** Public clients refresh without a client secret. */
export async function refreshTokens(o: { clientId: string; refreshToken: string } & Deps): Promise<Tokens> {
  const d = deps(o);
  const r = await post(d.fetch, "/token", { client_id: o.clientId, grant_type: "refresh_token", refresh_token: o.refreshToken });
  if (!r.ok) throw new Error(`Could not refresh the Twitch login (${r.body.message ?? r.status}). Log in again.`);
  return toTokens(r.body, d.now());
}

/** Who a token belongs to, or null when Twitch says it is invalid. */
export async function validateToken(accessToken: string, o: Deps = {}) {
  const res = await deps(o).fetch(`${ID}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Twitch token validation failed: HTTP ${res.status}`);
  const b: any = await res.json();
  return { userId: b.user_id as string, login: b.login as string, clientId: b.client_id as string, scopes: (b.scopes ?? []) as string[] };
}

const REFRESH_AHEAD_MS = 5 * 60_000;

/**
 * Hands out a valid access token, refreshing ahead of expiry. Refreshes are single-flight:
 * a refresh token works once, so concurrent callers must share one refresh.
 */
export function createTokenManager(o: { clientId: string; tokens: Tokens; save(t: Tokens): Promise<void> } & Deps) {
  const d = deps(o);
  let tokens = o.tokens;
  let inflight: Promise<string> | null = null;

  function refresh(): Promise<string> {
    inflight ??= (async () => {
      try {
        tokens = await refreshTokens({ clientId: o.clientId, refreshToken: tokens.refreshToken, fetch: d.fetch, now: d.now });
        await o.save(tokens);
        return tokens.accessToken;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    async token(): Promise<string> {
      if (inflight) return inflight;
      if (tokens.expiresAt - d.now() < REFRESH_AHEAD_MS) return refresh();
      return tokens.accessToken;
    },
    refresh,
  };
}
