import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCOPES } from "../src/auth";
import { openTwitchSession } from "../src/session";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-session-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const VALID = { client_id: "cid", login: "streamer", user_id: "100", scopes: SCOPES, expires_in: 9999 };
const TOKENS = { access_token: "a2", refresh_token: "r2", expires_in: 14400, scope: SCOPES };

/** Routes by URL; each route replies from its own list in order. */
function fakeId(routes: Record<string, [number, unknown][]>) {
  const hits: string[] = [];
  const fetch = (async (url: string) => {
    const path = new URL(url).pathname;
    hits.push(path);
    const [status, body] = routes[path]?.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, hits };
}

const stored = (accessToken: string) =>
  JSON.stringify({ clientId: "cid", accessToken, refreshToken: "r1", expiresAt: Date.now() + 3600_000, scopes: SCOPES });

describe("openTwitchSession", () => {
  it("reuses a stored login that is still valid", async () => {
    const file = join(dir, "tokens.json");
    await writeFile(file, stored("a1"));
    const t = fakeId({ "/oauth2/validate": [[200, VALID]] });
    const s = await openTwitchSession({ clientId: "cid", tokenFile: file, onCode: () => {}, fetch: t.fetch, sleep: async () => {} });
    expect(s).toMatchObject({ userId: "100", login: "streamer" });
    await expect(s.token()).resolves.toBe("a1");
    expect(t.hits).toEqual(["/oauth2/validate"]);
  });

  it("refreshes a stored login that expired", async () => {
    const file = join(dir, "tokens.json");
    await writeFile(file, stored("old"));
    const t = fakeId({ "/oauth2/validate": [[401, {}], [200, VALID]], "/oauth2/token": [[200, TOKENS]] });
    const s = await openTwitchSession({ clientId: "cid", tokenFile: file, onCode: () => {}, fetch: t.fetch, sleep: async () => {} });
    await expect(s.token()).resolves.toBe("a2");
    expect(JSON.parse(await readFile(file, "utf8")).refreshToken).toBe("r2");
  });

  it("logs in with a device code when nothing is stored, saving tokens privately", async () => {
    const file = join(dir, "sub", "tokens.json");
    const codes: string[] = [];
    const t = fakeId({
      "/oauth2/device": [[200, { device_code: "d", user_code: "ABCD-1234", verification_uri: "https://twitch.tv/activate", expires_in: 1800, interval: 5 }]],
      "/oauth2/token": [[200, TOKENS]],
      "/oauth2/validate": [[200, VALID]],
    });
    const s = await openTwitchSession({
      clientId: "cid",
      tokenFile: file,
      onCode: (uri, code) => void codes.push(`${uri} ${code}`),
      fetch: t.fetch,
      sleep: async () => {},
    });
    expect(codes).toEqual(["https://twitch.tv/activate ABCD-1234"]);
    expect(s.userId).toBe("100");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("ignores tokens stored for another client id", async () => {
    const file = join(dir, "tokens.json");
    await writeFile(file, stored("a1").replace('"cid"', '"other"'));
    const t = fakeId({
      "/oauth2/device": [[200, { device_code: "d", user_code: "X", verification_uri: "u", expires_in: 1800, interval: 5 }]],
      "/oauth2/token": [[200, TOKENS]],
      "/oauth2/validate": [[200, VALID]],
    });
    const codes: string[] = [];
    await openTwitchSession({ clientId: "cid", tokenFile: file, onCode: (_u, c) => void codes.push(c), fetch: t.fetch, sleep: async () => {} });
    expect(codes).toEqual(["X"]);
  });
});
