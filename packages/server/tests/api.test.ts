import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatAuthor, ChatMessage, Engine } from "@vigia/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startVigia, type ChatSource, type Vigia } from "../src/host";

const RULES = `version: 1
observe: true
rules:
  - { id: spam, pack: spam, action: delete }
  - { id: sp, pack: antispoiler, action: delete }
  - { id: q, pack: questions, action: highlight }
`;

const viewer: ChatAuthor = { id: "u9", login: "viewer", displayName: "Viewer", broadcaster: false, moderator: false, vip: false };
let seq = 0;
const msg = (text: string, author = viewer): ChatMessage => ({ id: `m${++seq}`, text, author, fragments: [{ type: "text", text }] });

let dir: string;
let engine: Engine;
let platformCalls: string[];
let moderatorsCallback: ((ids: string[]) => void) | undefined;
let probabilities: Record<string, number>;

function source(): ChatSource {
  return {
    platform: {
      deleteMessage: async (id) => void platformCalls.push(`delete ${id}`),
      timeout: async (user, s) => void platformCalls.push(`timeout ${user} ${s}`),
      ban: async (user) => void platformCalls.push(`ban ${user}`),
      sendChat: async () => {},
    },
    identity: { clientId: "cid", broadcasterId: "100" },
    connect(e, on) {
      engine = e;
      moderatorsCallback = on.moderators;
      on.moderators?.(["7"]);
      return { close() {} };
    },
  };
}

const TWITCH: Record<string, { userId: string; login: string; clientId: string }> = {
  streamer: { userId: "100", login: "streamer", clientId: "cid" },
  mod: { userId: "7", login: "mod1", clientId: "cid" },
};

async function start(authMode: "local" | "exposed"): Promise<Vigia> {
  return startVigia({
    configPath: join(dir, "vigia.yaml"),
    dataDir: join(dir, "data"),
    uiDir: join(dir, "ui"),
    exampleText: RULES,
    source: source(),
    evaluate: async (_s, q) => Object.fromEntries(Object.keys(q).map((id) => [id, probabilities[id] ?? 0])),
    port: 0,
    authMode,
    validateTwitchToken: async (t) => TWITCH[t] ?? null,
    log: () => {},
  });
}

interface Res {
  status: number;
  body: any;
  cookie?: string;
}

/** Raw HTTP so tests control Host, Origin and Cookie headers. */
function call(v: Vigia, method: string, path: string, o: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const url = new URL(path, v.url);
  const data = o.body === undefined ? undefined : JSON.stringify(o.body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { "Content-Type": "application/json", ...(o.headers ?? {}) },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          const setCookie = res.headers["set-cookie"]?.[0]?.split(";")[0];
          resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : undefined, cookie: setCookie });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const W = { "X-Vigia": "1" };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-api-"));
  await mkdir(join(dir, "ui"), { recursive: true });
  await writeFile(join(dir, "ui", "index.html"), "<html>dashboard</html>");
  await writeFile(join(dir, "ui", "login.html"), "<html>login</html>");
  platformCalls = [];
  probabilities = {};
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("local mode", () => {
  it("is open to this machine, but writes need the X-Vigia header", async () => {
    const v = await start("local");
    expect((await call(v, "GET", "/api/me")).body).toMatchObject({ user: { role: "broadcaster" }, mode: "local" });
    expect((await call(v, "POST", "/api/state", { body: { paused: true } })).status).toBe(403);
    expect((await call(v, "POST", "/api/state", { body: { paused: true }, headers: W })).status).toBe(200);
    expect(engine.state().paused).toBe(true);
    await v.close();
  });

  it("rejects a foreign Host header (DNS rebinding)", async () => {
    const v = await start("local");
    expect((await call(v, "GET", "/api/me", { headers: { Host: "evil.example" } })).status).toBe(403);
    await v.close();
  });

  it("serves the dashboard page", async () => {
    const v = await start("local");
    const res = await fetch(`${v.url}/`);
    expect(await res.text()).toContain("dashboard");
    await v.close();
  });
});

describe("exposed mode", () => {
  async function login(v: Vigia, as: "code" | "streamer" | "mod") {
    const r =
      as === "code"
        ? await call(v, "POST", "/api/login/code", { body: { code: v.adminCode }, headers: W })
        : await call(v, "POST", "/api/login/twitch", { body: { token: as }, headers: W });
    expect(r.status).toBe(200);
    return { ...W, Cookie: r.cookie! };
  }

  it("needs a login for everything but the login endpoints", async () => {
    const v = await start("exposed");
    expect((await call(v, "GET", "/api/me")).status).toBe(401);
    expect((await call(v, "GET", "/api/login-info")).body).toEqual({ mode: "exposed", twitchClientId: "cid" });
    expect((await call(v, "POST", "/api/login/code", { body: { code: "wrong" }, headers: W })).status).toBe(401);
    const res = await fetch(`${v.url}/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
    await v.close();
  });

  it("logs in with the admin code or Twitch, with the right role", async () => {
    const v = await start("exposed");
    expect((await call(v, "GET", "/api/me", { headers: await login(v, "code") })).body.user.role).toBe("broadcaster");
    expect((await call(v, "GET", "/api/me", { headers: await login(v, "mod") })).body.user).toEqual({
      id: "7",
      login: "mod1",
      role: "moderator",
    });
    await v.close();
  });

  it("ends a mod's session when Twitch removes them", async () => {
    const v = await start("exposed");
    const mod = await login(v, "mod");
    moderatorsCallback!([]);
    expect((await call(v, "GET", "/api/me", { headers: mod })).status).toBe(401);
    await v.close();
  });

  it("shows protected topics only to moderators", async () => {
    const v = await start("exposed");
    const mod = await login(v, "mod");
    const streamer = await login(v, "streamer");
    expect((await call(v, "PUT", "/api/topics", { body: { topics: ["the fate of Ranni"] }, headers: streamer })).status).toBe(403);
    expect((await call(v, "PUT", "/api/topics", { body: { topics: ["the fate of Ranni"] }, headers: mod })).status).toBe(200);
    expect((await call(v, "GET", "/api/topics", { headers: mod })).body).toEqual({ topics: ["the fate of Ranni"] });
    const seen = await call(v, "GET", "/api/topics", { headers: streamer });
    expect(seen.body).toEqual({ count: 1 });
    expect(JSON.stringify((await call(v, "GET", "/api/overview", { headers: streamer })).body)).not.toContain("Ranni");
    expect(JSON.stringify((await call(v, "GET", "/api/audit", { headers: streamer })).body)).not.toContain("Ranni");
    expect(engine.state().protectedTopicCount).toBe(1);
    await v.close();
  });

  it("keeps the audit log for the broadcaster only", async () => {
    const v = await start("exposed");
    expect((await call(v, "GET", "/api/audit", { headers: await login(v, "mod") })).status).toBe(403);
    await v.close();
  });
});

describe("moderation from the dashboard", () => {
  it("applies an uncertain decision and records who did it", async () => {
    const v = await start("local");
    probabilities = { spam: 0.6 };
    const m = msg("cheap followers here");
    await engine.handleMessage(m);
    const [entry] = (await call(v, "GET", "/api/uncertain")).body;
    expect(entry.text).toBe("cheap followers here");
    expect((await call(v, "POST", `/api/uncertain/${entry.id}/apply`, { headers: W })).status).toBe(200);
    expect(platformCalls).toEqual([`delete ${m.id}`]);
    expect((await call(v, "GET", "/api/uncertain")).body).toEqual([]);
    expect((await call(v, "GET", "/api/audit")).body[0]).toMatchObject({ login: "local", action: "delete", target: "viewer" });
    await v.close();
  });

  it("dismisses an uncertain decision without acting", async () => {
    const v = await start("local");
    probabilities = { spam: 0.6 };
    await engine.handleMessage(msg("maybe spam"));
    const [entry] = (await call(v, "GET", "/api/uncertain")).body;
    await call(v, "POST", `/api/uncertain/${entry.id}/dismiss`, { headers: W });
    expect(platformCalls).toEqual([]);
    expect((await call(v, "GET", "/api/uncertain")).body).toEqual([]);
    await v.close();
  });

  it("times out, bans and highlights from a decision, but never highlights a spoiler", async () => {
    const v = await start("local");
    await engine.handleMessage(msg("hello"));
    probabilities = { sp: 0.9 };
    await engine.handleMessage(msg("she dies at the end"));
    const [spoiler, hello] = (await call(v, "GET", "/api/decisions?limit=10")).body;
    expect(spoiler.spoiler).toBe(true);
    expect((await call(v, "POST", "/api/actions", { body: { action: "timeout", decisionId: hello.id, seconds: 600 }, headers: W })).status).toBe(200);
    expect((await call(v, "POST", "/api/actions", { body: { action: "ban", decisionId: hello.id }, headers: W })).status).toBe(200);
    expect(platformCalls).toEqual(["timeout u9 600", "ban u9"]);
    expect((await call(v, "POST", "/api/actions", { body: { action: "highlight", decisionId: spoiler.id }, headers: W })).status).toBe(400);
    expect((await call(v, "POST", "/api/actions", { body: { action: "highlight", decisionId: hello.id }, headers: W })).status).toBe(200);
    expect((await call(v, "GET", "/api/highlights")).body.current).toMatchObject({ text: "hello", authorName: "Viewer" });
    expect((await call(v, "POST", "/api/actions", { body: { action: "announce", text: "Giveaway at 9" }, headers: W })).status).toBe(200);
    expect((await call(v, "POST", "/api/actions", { body: { action: "nuke" }, headers: W })).status).toBe(400);
    await v.close();
  });
});

describe("rules and settings", () => {
  it("edits rules, applies them at once and keeps the file valid", async () => {
    const v = await start("local");
    expect((await call(v, "PATCH", "/api/rules/spam", { body: { enabled: false }, headers: W })).status).toBe(200);
    expect(engine.state().disabledRules).toEqual(["spam"]);
    const bad = await call(v, "PATCH", "/api/rules/spam", { body: { action: "timeout" }, headers: W });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].path).toBe("rules.0.seconds");
    const added = await call(v, "POST", "/api/rules", {
      body: { id: "backseat", question: "Backseating?", yes: "Advice", no: "Other", action: "log" },
      headers: W,
    });
    expect(added.status).toBe(200);
    expect((await readFile(join(dir, "vigia.yaml"), "utf8"))).toContain("backseat");
    expect((await call(v, "DELETE", "/api/rules/backseat", { headers: W })).status).toBe(200);
    expect((await call(v, "PATCH", "/api/settings", { body: { highlights: { mode: "approve" } }, headers: W })).status).toBe(200);
    expect((await call(v, "GET", "/api/config")).body.config.highlights.mode).toBe("approve");
    await v.close();
  });

  it("replaces the raw YAML only when it is valid", async () => {
    const v = await start("local");
    const bad = await call(v, "PUT", "/api/config", { body: { text: "version: 1\nrules: [\n" }, headers: W });
    expect(bad.status).toBe(400);
    expect((await call(v, "PUT", "/api/config", { body: { text: "version: 1\nlanguage: es\n" }, headers: W })).status).toBe(200);
    expect((await call(v, "GET", "/api/config")).body.config.language).toBe("es");
    await v.close();
  });

  it("tests a message against the rules without acting", async () => {
    const v = await start("local");
    probabilities = { spam: 0.95, q: 0.7 };
    const r = await call(v, "POST", "/api/test", { body: { text: "buy followers?" }, headers: W });
    expect(r.body.verdicts.map((x: any) => [x.ruleId, x.band])).toEqual([
      ["spam", "act"],
      ["sp", "none"],
      ["q", "unsure"],
    ]);
    expect(platformCalls).toEqual([]);
    await v.close();
  });

  it("switches observe mode and writes it to the file", async () => {
    const v = await start("local");
    await call(v, "POST", "/api/state", { body: { observe: false }, headers: W });
    expect(engine.state().observe).toBe(false);
    for (let i = 0; i < 50 && !(await readFile(join(dir, "vigia.yaml"), "utf8")).includes("observe: false"); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await readFile(join(dir, "vigia.yaml"), "utf8")).toContain("observe: false");
    await v.close();
  });
});

describe("dashboard websocket", () => {
  it("rejects foreign origins and streams decisions to its own", async () => {
    const v = await start("local");
    const wsUrl = `${v.url.replace("http", "ws")}/ws/dashboard`;
    const foreign = new WebSocket(wsUrl, { headers: { Origin: "https://evil.example" } });
    const status = await new Promise<number>((resolve) => {
      foreign.on("unexpected-response", (_q, res) => resolve(res.statusCode ?? 0));
      foreign.on("open", () => resolve(101));
    });
    expect(status).toBe(403);

    const ws = new WebSocket(wsUrl, { headers: { Origin: v.url } });
    const events: any[] = [];
    ws.on("message", (d) => events.push(JSON.parse(String(d))));
    await new Promise((r) => ws.on("open", r));
    await engine.handleMessage(msg("hello there"));
    for (let i = 0; i < 50 && !events.some((e) => e.type === "decision"); i++) await new Promise((r) => setTimeout(r, 20));
    const d = events.find((e) => e.type === "decision");
    expect(d.decision).toMatchObject({ text: "hello there", id: expect.any(Number) });
    ws.close();
    await v.close();
  });
});
