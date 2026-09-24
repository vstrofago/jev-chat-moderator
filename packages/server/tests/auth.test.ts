import { describe, expect, it } from "vitest";
import { createAuth, type AuthRequest } from "../src/auth";

const req = (over: Partial<AuthRequest> = {}): AuthRequest => ({ method: "GET", host: "127.0.0.1:7777", ...over });

describe("local mode", () => {
  const auth = createAuth({ mode: "local", adminCode: "CODE123456" });

  it("lets this machine in as the broadcaster", () => {
    expect(auth.guard(req(), {})).toEqual({ ok: true, user: { id: "local", login: "local", role: "broadcaster" } });
    expect(auth.guard(req({ host: "localhost:7777" }), {}).ok).toBe(true);
    expect(auth.guard(req({ host: "[::1]:7777" }), {}).ok).toBe(true);
  });

  it("rejects other Host names (DNS rebinding)", () => {
    expect(auth.guard(req({ host: "evil.example:7777" }), {})).toMatchObject({ ok: false, status: 403 });
  });

  it("requires the X-Vigia header for writes (cross-site requests can't send it)", () => {
    expect(auth.guard(req({ method: "POST" }), { write: true })).toMatchObject({ ok: false, status: 403 });
    expect(auth.guard(req({ method: "POST", xVigia: "1" }), { write: true }).ok).toBe(true);
  });

  it("only accepts websocket origins from itself", () => {
    expect(auth.originAllowed("http://127.0.0.1:7777", "127.0.0.1:7777")).toBe(true);
    expect(auth.originAllowed("https://evil.example", "127.0.0.1:7777")).toBe(false);
    expect(auth.originAllowed(undefined, "127.0.0.1:7777")).toBe(false);
  });
});

describe("exposed mode", () => {
  const TOKENS: Record<string, { userId: string; login: string; clientId: string }> = {
    streamer: { userId: "100", login: "streamer", clientId: "cid" },
    mod: { userId: "7", login: "mod1", clientId: "cid" },
    viewer: { userId: "9", login: "rando", clientId: "cid" },
    otherApp: { userId: "7", login: "mod1", clientId: "someone-else" },
  };
  function setup(now = { t: 0 }) {
    const auth = createAuth({
      mode: "exposed",
      adminCode: "CODE123456",
      clientId: "cid",
      broadcasterId: "100",
      validate: async (t) => TOKENS[t] ?? null,
      now: () => now.t,
    });
    auth.setModerators(["7"]);
    return auth;
  }
  const cookie = (id: string) => `other=1; vigia_session=${id}`;

  it("needs a session, and any Host is fine", () => {
    const auth = setup();
    expect(auth.guard(req({ host: "vigia.example.com" }), {})).toMatchObject({ ok: false, status: 401 });
  });

  it("logs in with the admin code as the broadcaster", () => {
    const auth = setup();
    expect(auth.loginWithCode("nope")).toMatchObject({ ok: false });
    const r = auth.loginWithCode("CODE123456");
    if (!r.ok) throw new Error(r.error);
    expect(auth.guard(req({ host: "vigia.example.com", cookie: cookie(r.sessionId) }), {})).toMatchObject({
      ok: true,
      user: { role: "broadcaster" },
    });
  });

  it("locks code logins after too many wrong guesses", () => {
    const now = { t: 0 };
    const auth = setup(now);
    for (let i = 0; i < 10; i++) auth.loginWithCode("wrong");
    expect(auth.loginWithCode("CODE123456")).toMatchObject({ ok: false, error: expect.stringMatching(/too many/i) });
    now.t = 10 * 60_000 + 1;
    expect(auth.loginWithCode("CODE123456").ok).toBe(true);
  });

  it("gives Twitch users their role, and refuses non-mods and other apps' tokens", async () => {
    const auth = setup();
    const s = await auth.loginWithTwitch("streamer");
    const m = await auth.loginWithTwitch("mod");
    if (!s.ok || !m.ok) throw new Error("login failed");
    expect(s.user.role).toBe("broadcaster");
    expect(m.user).toEqual({ id: "7", login: "mod1", role: "moderator" });
    expect(await auth.loginWithTwitch("viewer")).toMatchObject({ ok: false, error: expect.stringMatching(/moderator/i) });
    expect(await auth.loginWithTwitch("otherApp")).toMatchObject({ ok: false });
    expect(await auth.loginWithTwitch("garbage")).toMatchObject({ ok: false });
  });

  it("enforces broadcaster-only actions", async () => {
    const auth = setup();
    const m = await auth.loginWithTwitch("mod");
    if (!m.ok) throw new Error("login failed");
    const r = req({ host: "v.example", cookie: cookie(m.sessionId), method: "POST", xVigia: "1" });
    expect(auth.guard(r, { write: true }).ok).toBe(true);
    expect(auth.guard(r, { write: true, role: "broadcaster" })).toMatchObject({ ok: false, status: 403 });
  });

  it("ends a mod's sessions when they stop being a mod", async () => {
    const auth = setup();
    const m = await auth.loginWithTwitch("mod");
    if (!m.ok) throw new Error("login failed");
    auth.setModerators([]);
    expect(auth.guard(req({ host: "v.example", cookie: cookie(m.sessionId) }), {})).toMatchObject({ ok: false, status: 401 });
  });

  it("expires sessions after 12 hours and supports logout", () => {
    const now = { t: 0 };
    const auth = setup(now);
    const a = auth.loginWithCode("CODE123456");
    const b = auth.loginWithCode("CODE123456");
    if (!a.ok || !b.ok) throw new Error("login failed");
    auth.logout(cookie(b.sessionId));
    expect(auth.guard(req({ host: "v", cookie: cookie(b.sessionId) }), {}).ok).toBe(false);
    now.t = 12 * 3600_000 + 1;
    expect(auth.guard(req({ host: "v", cookie: cookie(a.sessionId) }), {}).ok).toBe(false);
  });

  it("builds a hardened cookie", () => {
    const auth = setup();
    expect(auth.cookie("abc", true)).toBe("vigia_session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200; Secure");
    expect(auth.cookie("abc", false)).not.toContain("Secure");
  });
});
