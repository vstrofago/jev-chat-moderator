import { describe, expect, it } from "vitest";
import { createTokenManager, refreshTokens, SCOPES, startDeviceLogin, validateToken, type Tokens } from "../src/auth";

type Reply = [number, unknown];

function fakeId(replies: Reply[]) {
  const calls: { url: string; body: URLSearchParams | null; headers: Record<string, string> }[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? new URLSearchParams(String(init.body)) : null, headers: (init.headers ?? {}) as Record<string, string> });
    const [status, body] = replies.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const TOKEN_REPLY = { access_token: "a1", refresh_token: "r1", expires_in: 14400, scope: SCOPES, token_type: "bearer" };

describe("startDeviceLogin", () => {
  it("asks for a user code with the spec's scopes, then polls until approved", async () => {
    const t = fakeId([
      [200, { device_code: "dev", user_code: "ABCD-1234", verification_uri: "https://www.twitch.tv/activate?device-code=ABCD-1234", expires_in: 1800, interval: 5 }],
      [400, { status: 400, message: "authorization_pending" }],
      [200, TOKEN_REPLY],
    ]);
    const waits: number[] = [];
    const login = await startDeviceLogin({ clientId: "cid", fetch: t.fetch, sleep: async (ms) => void waits.push(ms), now: () => 0 });
    expect(login.userCode).toBe("ABCD-1234");
    expect(t.calls[0].url).toBe("https://id.twitch.tv/oauth2/device");
    expect(t.calls[0].body?.get("scopes")).toBe(SCOPES.join(" "));

    const tokens = await login.poll();
    expect(tokens).toEqual({ accessToken: "a1", refreshToken: "r1", expiresAt: 14_400_000, scopes: SCOPES });
    expect(waits).toEqual([5000, 5000]);
    expect(t.calls[2].body?.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(t.calls[2].body?.get("device_code")).toBe("dev");
  });

  it("gives up when the code expires or is denied", async () => {
    const t = fakeId([
      [200, { device_code: "dev", user_code: "X", verification_uri: "u", expires_in: 1800, interval: 5 }],
      [400, { status: 400, message: "invalid device code" }],
    ]);
    const login = await startDeviceLogin({ clientId: "cid", fetch: t.fetch, sleep: async () => {} });
    await expect(login.poll()).rejects.toThrow(/expired|denied|invalid device code/i);
  });

  it("explains a client id that is not a Public app", async () => {
    const t = fakeId([[400, { status: 400, message: "invalid client" }]]);
    await expect(startDeviceLogin({ clientId: "bad", fetch: t.fetch })).rejects.toThrow(/Public/);
  });
});

describe("refreshTokens", () => {
  it("refreshes without a client secret", async () => {
    const t = fakeId([[200, { ...TOKEN_REPLY, access_token: "a2", refresh_token: "r2" }]]);
    const tokens = await refreshTokens({ clientId: "cid", refreshToken: "r1", fetch: t.fetch, now: () => 1000 });
    expect(tokens).toMatchObject({ accessToken: "a2", refreshToken: "r2", expiresAt: 1000 + 14_400_000 });
    expect(t.calls[0].body?.get("grant_type")).toBe("refresh_token");
    expect(t.calls[0].body?.has("client_secret")).toBe(false);
  });
});

describe("validateToken", () => {
  it("returns the user and scopes, or null when the token is invalid", async () => {
    const t = fakeId([
      [200, { client_id: "cid", login: "streamer", user_id: "100", scopes: ["user:read:chat"], expires_in: 100 }],
      [401, { status: 401, message: "invalid access token" }],
    ]);
    await expect(validateToken("a1", { fetch: t.fetch })).resolves.toEqual({
      userId: "100",
      login: "streamer",
      clientId: "cid",
      scopes: ["user:read:chat"],
    });
    expect(t.calls[0].headers.Authorization).toBe("OAuth a1");
    await expect(validateToken("bad", { fetch: t.fetch })).resolves.toBeNull();
  });
});

describe("createTokenManager", () => {
  const tokens = (expiresAt: number): Tokens => ({ accessToken: "a1", refreshToken: "r1", expiresAt, scopes: SCOPES });

  it("refreshes ahead of expiry and saves the new tokens", async () => {
    const t = fakeId([[200, { ...TOKEN_REPLY, access_token: "a2", refresh_token: "r2" }]]);
    const saved: Tokens[] = [];
    const m = createTokenManager({ clientId: "cid", tokens: tokens(60_000), save: async (x) => void saved.push(x), fetch: t.fetch, now: () => 0 });
    await expect(m.token()).resolves.toBe("a2");
    expect(saved.map((s) => s.refreshToken)).toEqual(["r2"]);
  });

  it("uses one refresh for concurrent callers (refresh tokens are one-time use)", async () => {
    const t = fakeId([[200, { ...TOKEN_REPLY, access_token: "a2", refresh_token: "r2" }]]);
    const m = createTokenManager({ clientId: "cid", tokens: tokens(10 * 3600_000), save: async () => {}, fetch: t.fetch, now: () => 0 });
    await expect(Promise.all([m.refresh(), m.refresh(), m.refresh()])).resolves.toEqual(["a2", "a2", "a2"]);
    expect(t.calls).toHaveLength(1);
    await expect(m.token()).resolves.toBe("a2");
  });
});
