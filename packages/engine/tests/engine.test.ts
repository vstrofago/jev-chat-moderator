import { AuthError, GatewayError } from "@vigia/core";
import { describe, expect, it } from "vitest";
import { parseConfig, type VigiaConfig } from "../src/config";
import { createEngine, type ChatPlatform, type EngineEvent, type Evaluator } from "../src/engine";
import { jevEvaluator } from "../src/evaluator";
import type { ChatAuthor, ChatMessage } from "../src/message";

const YAML = `
version: 1
language: en
observe: false
rules:
  - { id: tox, pack: toxicity, action: timeout, seconds: 60 }
  - { id: spam, pack: spam, action: delete }
  - { id: sp, pack: antispoiler, action: delete }
  - { id: q, pack: questions, action: highlight }
`;

function config(text = YAML): VigiaConfig {
  const r = parseConfig(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.config;
}

const viewer: ChatAuthor = { id: "u1", login: "viewer", displayName: "Viewer", broadcaster: false, moderator: false, vip: false };
const mod: ChatAuthor = { ...viewer, id: "u2", login: "mod", displayName: "Mod", moderator: true };
const streamer: ChatAuthor = { ...viewer, id: "u3", login: "streamer", displayName: "Streamer", broadcaster: true };

let nextId = 0;
function msg(text: string, author: ChatAuthor = viewer, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `m${++nextId}`, text, author, fragments: [{ type: "text", text }], ...extra };
}

function fakePlatform() {
  const calls: string[] = [];
  const platform: ChatPlatform = {
    deleteMessage: async (id) => void calls.push(`delete ${id}`),
    timeout: async (userId, seconds) => void calls.push(`timeout ${userId} ${seconds}`),
    sendChat: async (text) => void calls.push(`say ${text}`),
  };
  return { platform, calls };
}

/** Answers every question with the probability given for its rule id (0 otherwise). */
function fixed(probabilities: Record<string, number>) {
  const seen: { state: any; questions: string[] }[] = [];
  const evaluate: Evaluator = async (state, questions) => {
    seen.push({ state, questions: Object.keys(questions) });
    return Object.fromEntries(Object.keys(questions).map((id) => [id, probabilities[id] ?? 0]));
  };
  return { evaluate, seen };
}

function setup(probabilities: Record<string, number> = {}, opts: { config?: VigiaConfig } = {}) {
  const { platform, calls } = fakePlatform();
  const ev = fixed(probabilities);
  const engine = createEngine({ config: opts.config ?? config(), platform, evaluate: ev.evaluate });
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  return { engine, calls, events, seen: ev.seen };
}

describe("createEngine", () => {
  it("starts in observe mode by default and never touches chat there", async () => {
    const { platform, calls } = fakePlatform();
    const engine = createEngine({ config: config(YAML.replace("observe: false\n", "")), platform, evaluate: fixed({ spam: 0.99 }).evaluate });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    expect(engine.state().observe).toBe(true);
    await engine.handleMessage(msg("buy followers"));
    expect(calls).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "decision", applied: false }));
  });

  it("deletes and times out when live", async () => {
    const { engine, calls, events } = setup({ spam: 0.99 });
    const m = msg("buy followers");
    await engine.handleMessage(m);
    expect(calls).toEqual([`delete ${m.id}`]);
    expect(events).toContainEqual(expect.objectContaining({ type: "decision", applied: true }));

    const s2 = setup({ tox: 0.95 });
    await s2.engine.handleMessage(msg("you idiot"));
    expect(s2.calls).toEqual(["timeout u1 60"]);
  });

  it("lets a mod pause moderation without evaluating the command", async () => {
    const { engine, calls, seen } = setup({ spam: 0.99, q: 0.99 });
    await engine.handleMessage(msg("!vigia pause", mod));
    expect(seen).toEqual([]);
    expect(engine.state().paused).toBe(true);
    expect(calls).toEqual([expect.stringMatching(/^say .*paused/)]);

    calls.length = 0;
    await engine.handleMessage(msg("buy followers?"));
    expect(calls).toEqual([]);
    expect(seen.at(-1)?.questions).toEqual(["q"]);
  });

  it("treats a viewer's command as ordinary chat", async () => {
    const { engine, calls, seen } = setup({ spam: 0.99 });
    const m = msg("!vigia pause");
    await engine.handleMessage(m);
    expect(engine.state().paused).toBe(false);
    expect(seen).toHaveLength(1);
    expect(calls).toEqual([`delete ${m.id}`]);
  });

  it("evaluates exempt authors only for highlights", async () => {
    const { engine, calls, seen, events } = setup({ spam: 0.99, q: 0.99 });
    await engine.handleMessage(msg("what's the build?", mod));
    expect(seen[0].questions).toEqual(["q"]);
    expect(calls).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "highlight" }));
  });

  it("skips the streamer's own messages for highlights by default", async () => {
    const { engine, seen } = setup({ q: 0.99 });
    await engine.handleMessage(msg("any questions?", streamer));
    expect(seen).toEqual([]);

    const s2 = setup({ q: 0.99 }, { config: config(YAML + "highlights: { includeBroadcaster: true }\n") });
    await s2.engine.handleMessage(msg("any questions?", streamer));
    expect(s2.seen[0].questions).toEqual(["q"]);
  });

  it("highlights the parent message when a mod replies with the command", async () => {
    const { engine, events } = setup();
    const parent = { id: "p1", text: "how do you parry?", authorLogin: "viewer" };
    await engine.handleMessage(msg("@viewer !vigia destaca", mod, { replyTo: parent }));
    const h = events.find((e) => e.type === "highlight");
    expect(h).toMatchObject({ item: { kind: "highlight", text: "how do you parry?", authorName: "viewer", source: "command" } });
  });

  it("creates an announcement from command text", async () => {
    const { engine, events } = setup();
    await engine.handleMessage(msg('!vigia highlight "Giveaway at 9pm"', streamer));
    expect(events).toContainEqual(
      expect.objectContaining({ type: "highlight", item: expect.objectContaining({ kind: "announcement", text: "Giveaway at 9pm" }) }),
    );
  });

  it("queues highlights as suggestions in approve mode", async () => {
    const { engine, events } = setup({ q: 0.99 }, { config: config(YAML + "highlights: { mode: approve }\n") });
    await engine.handleMessage(msg("how old are you?"));
    expect(events.some((e) => e.type === "highlight")).toBe(false);
    const d = events.find((e) => e.type === "decision");
    expect(d).toMatchObject({ outcome: { highlight: { ruleId: "q" } } });
  });

  it("halts on an auth error until a new evaluator is set", async () => {
    const { platform } = fakePlatform();
    let calls = 0;
    const engine = createEngine({
      config: config(),
      platform,
      evaluate: async () => {
        calls++;
        throw new AuthError("bad key");
      },
    });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.handleMessage(msg("hi"));
    await engine.handleMessage(msg("hi again"));
    expect(calls).toBe(1);
    expect(engine.state().halted).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: "warning", code: "jev-auth" }));

    engine.setEvaluator(fixed({ q: 0.99 }).evaluate);
    expect(engine.state().halted).toBe(false);
    await engine.handleMessage(msg("is this the final boss?"));
    expect(events.some((e) => e.type === "highlight")).toBe(true);
  });

  it("lets messages pass and keeps going when Jev is unavailable", async () => {
    const { platform, calls } = fakePlatform();
    let fail = true;
    const engine = createEngine({
      config: config(),
      platform,
      evaluate: async (_s, questions) => {
        if (fail) throw new GatewayError("Network error");
        return Object.fromEntries(Object.keys(questions).map((id) => [id, id === "spam" ? 0.99 : 0]));
      },
    });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await expect(engine.handleMessage(msg("buy followers"))).resolves.toBeUndefined();
    expect(calls).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "warning", code: "jev-unavailable" }));

    fail = false;
    const m = msg("buy followers");
    await engine.handleMessage(m);
    expect(calls).toEqual([`delete ${m.id}`]);
  });

  it("reports platform failures without throwing", async () => {
    const engine = createEngine({
      config: config(),
      evaluate: fixed({ spam: 0.99 }).evaluate,
      platform: {
        deleteMessage: async () => Promise.reject(new Error("403")),
        timeout: async () => {},
        sendChat: async () => {},
      },
    });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.handleMessage(msg("buy followers"));
    expect(events).toContainEqual(expect.objectContaining({ type: "warning", code: "platform-error" }));
  });

  it("keeps the old config when an update is invalid", async () => {
    const { engine, seen } = setup({});
    const r = engine.updateConfig("version: 1\nrules:\n  - { id: x, pack: nope, action: log }\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ path: "rules.0.pack", line: 3 });
    await engine.handleMessage(msg("hello"));
    expect(seen[0].questions).toEqual(["tox", "spam", "sp", "q"]);

    expect(engine.updateConfig("version: 1\nrules:\n  - { id: x, pack: spam, action: log }\n").ok).toBe(true);
    await engine.handleMessage(msg("hello"));
    expect(seen[1].questions).toEqual(["x"]);
  });

  it("toggles rules from chat and rejects unknown ids", async () => {
    const { engine, calls, seen } = setup({});
    await engine.handleMessage(msg("!vigia regla spam off", mod));
    expect(engine.state().disabledRules).toEqual(["spam"]);
    await engine.handleMessage(msg("!vigia rule nope on", mod));
    expect(calls.at(-1)).toMatch(/nope/);
    await engine.handleMessage(msg("hello"));
    expect(seen[0].questions).toEqual(["tox", "sp", "q"]);
  });

  it("sends runtime progress and the category to the anti-spoiler question", async () => {
    const { engine, seen } = setup({});
    engine.setCategory("Elden Ring");
    await engine.handleMessage(msg('!vigia progreso "Liurnia"', streamer));
    await engine.handleMessage(msg("nice"));
    expect(seen[0].state.spoiler_guard).toEqual({ work: "Elden Ring", progress: "Liurnia" });
  });

  it("never reveals protected topics in the status reply", async () => {
    const { engine, calls } = setup({});
    engine.setProtectedTopics(["the fate of Ranni"]);
    await engine.handleMessage(msg("!vigia status", streamer));
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Ranni");
    expect(engine.state().protectedTopicCount).toBe(1);
    expect(JSON.stringify(engine.state())).not.toContain("Ranni");
  });

  it("never highlights a possible spoiler", async () => {
    const { engine, events } = setup({ sp: 0.6, q: 0.99 });
    await engine.handleMessage(msg("does she die later?"));
    expect(events.some((e) => e.type === "highlight")).toBe(false);
  });

  it("downgrades moderation on emote-only messages", async () => {
    const { engine, calls, events } = setup({ sp: 0.95 });
    await engine.handleMessage(
      msg("BibleThump BibleThump", viewer, { fragments: [{ type: "emote", text: "BibleThump", id: "86" }] }),
    );
    expect(calls).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "decision", outcome: expect.objectContaining({ moderation: expect.objectContaining({ action: "log", downgraded: true }) }) }),
    );
  });

  it("clears the overlay and toggles observe mode", async () => {
    const { engine, events } = setup({});
    await engine.handleMessage(msg("!vigia limpia", mod));
    expect(events).toContainEqual({ type: "clear-highlight" });
    engine.setObserve(true);
    expect(events.at(-1)).toMatchObject({ type: "state", state: { observe: true } });
  });
});

describe("state from the config file", () => {
  it("takes observe mode, disabled rules and progress from the config", () => {
    const c = config(`
version: 1
observe: false
rules:
  - { id: spam, pack: spam, action: delete, enabled: false }
  - { id: sp, pack: antispoiler, action: delete, progress: "chapter 3" }
`);
    const engine = createEngine({ config: c, platform: fakePlatform().platform, evaluate: fixed({}).evaluate });
    expect(engine.state()).toMatchObject({ observe: false, disabledRules: ["spam"], progress: "chapter 3" });
  });

  it("re-reads them when the file changes, unless observe is forced", () => {
    const engine = createEngine({ config: config(), platform: fakePlatform().platform, evaluate: fixed({}).evaluate, forceObserve: true });
    engine.updateConfig("version: 1\nobserve: false\nrules:\n  - { id: x, pack: spam, action: log, enabled: false }\n");
    expect(engine.state()).toMatchObject({ observe: true, disabledRules: ["x"] });

    const free = createEngine({ config: config(), platform: fakePlatform().platform, evaluate: fixed({}).evaluate });
    expect(free.state().observe).toBe(false);
    free.updateConfig("version: 1\nobserve: true\n");
    expect(free.state().observe).toBe(true);
  });
});

describe("dashboard helpers", () => {
  it("tests a message against every enabled rule without acting", async () => {
    const { engine, calls, events } = setup({ spam: 0.99, q: 0.6 });
    await engine.handleMessage(msg("!vigia regla tox off", mod));
    calls.length = 0;
    events.length = 0;
    const verdicts = await engine.test("buy followers?");
    expect(verdicts.map((v) => [v.ruleId, v.band])).toEqual([
      ["spam", "act"],
      ["sp", "none"],
      ["q", "unsure"],
    ]);
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it("pauses and resumes like the chat command", () => {
    const { engine, events } = setup();
    engine.setPaused(true);
    expect(engine.state().paused).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "state", state: { paused: true } });
  });
});

describe("listeners", () => {
  it("keep the engine running when one of them throws", async () => {
    const { engine, calls } = setup({ spam: 0.99 });
    const seen: string[] = [];
    engine.on(() => {
      throw new Error("ui bug");
    });
    engine.on((e) => seen.push(e.type));
    const m = msg("buy followers");
    await expect(engine.handleMessage(m)).resolves.toBeUndefined();
    expect(calls).toEqual([`delete ${m.id}`]);
    expect(seen).toContain("decision");
  });
});

describe("load shedding", () => {
  it("stops asking highlight questions while the queue is backed up", async () => {
    const { platform } = fakePlatform();
    const asked: string[][] = [];
    let release!: () => void;
    const blocked = new Promise<void>((r) => (release = r));
    const engine = createEngine({
      config: config(),
      platform,
      concurrency: 1,
      maxPending: 4,
      evaluate: async (_s, questions) => {
        asked.push(Object.keys(questions));
        await blocked;
        return {};
      },
    });
    const all = [1, 2, 3, 4, 5].map((i) => engine.handleMessage(msg(`message ${i}`)));
    release();
    await Promise.all(all);
    expect(asked[0]).toContain("q");
    expect(asked.at(-1)).toEqual(["tox", "spam", "sp"]);
  });
});

describe("jevEvaluator", () => {
  it("returns one probability per question", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ answers: { q: { type: "boolean", probability: 0.7 } } }), { status: 200 })) as typeof globalThis.fetch;
    const evaluate = jevEvaluator({ apiKey: "vck_x", provider: "gateway", fetch });
    await expect(evaluate({ message: "hi" }, { q: { type: "boolean", instructions: "?" } })).resolves.toEqual({ q: 0.7 });
  });
});

describe("jevEvaluator usage", () => {
  it("reports input tokens for cost estimates", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ answers: { q: { type: "boolean", probability: 0.1 } }, usage: { inputTokens: 612 } }), {
        status: 200,
      })) as typeof globalThis.fetch;
    const used: number[] = [];
    const evaluate = jevEvaluator({ apiKey: "vck_x", provider: "gateway", fetch }, { onUsage: (n) => used.push(n) });
    await evaluate({ message: "hi" }, { q: { type: "boolean", instructions: "?" } });
    expect(used).toEqual([612]);
  });
});

describe("jevEvaluator retries", () => {
  const ok = () => new Response(JSON.stringify({ answers: { q: { type: "boolean", probability: 0.4 } } }), { status: 200 });
  const busy = (status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: { message: "high demand" } }), { status, headers });
  const q = { q: { type: "boolean" as const, instructions: "?" } };

  function scripted(responses: Response[]) {
    let calls = 0;
    const fetch = (async () => responses[calls++]) as typeof globalThis.fetch;
    return { fetch, calls: () => calls };
  }

  it("waits as told by retry-after, capped, and then succeeds", async () => {
    const f = scripted([busy(429, { "retry-after": "30" }), ok()]);
    const waits: number[] = [];
    const evaluate = jevEvaluator(
      { apiKey: "vck_x", provider: "gateway", fetch: f.fetch },
      { retries: 2, maxWaitMs: 3000, sleep: async (ms) => void waits.push(ms) },
    );
    await expect(evaluate({ message: "hi" }, q)).resolves.toEqual({ q: 0.4 });
    expect(waits).toEqual([3000]);
  });

  it("backs off on provider errors and gives up after the retries", async () => {
    const f = scripted([busy(503), busy(503), busy(503)]);
    const waits: number[] = [];
    const evaluate = jevEvaluator(
      { apiKey: "vck_x", provider: "gateway", fetch: f.fetch },
      { retries: 2, maxWaitMs: 3000, sleep: async (ms) => void waits.push(ms) },
    );
    await expect(evaluate({ message: "hi" }, q)).rejects.toBeInstanceOf(GatewayError);
    expect(f.calls()).toBe(3);
    expect(waits).toEqual([500, 1000]);
  });

  it("never retries a bad key", async () => {
    const f = scripted([busy(401), ok()]);
    const evaluate = jevEvaluator({ apiKey: "vck_x", provider: "gateway", fetch: f.fetch }, { retries: 2, maxWaitMs: 3000, sleep: async () => {} });
    await expect(evaluate({ message: "hi" }, q)).rejects.toBeInstanceOf(AuthError);
    expect(f.calls()).toBe(1);
  });
});
