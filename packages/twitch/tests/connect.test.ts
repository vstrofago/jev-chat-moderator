import { createEngine, parseConfig, type EngineEvent } from "@vigia/engine";
import { describe, expect, it } from "vitest";
import { connectTwitch, createTwitchPlatform } from "../src/connect";
import type { Helix } from "../src/helix";

class FakeSocket {
  static all: FakeSocket[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    this.onclose?.();
  }
  push(type: string, payload: unknown) {
    this.onmessage?.({ data: JSON.stringify({ metadata: { message_id: Math.random().toString(36), message_type: type }, payload }) });
  }
}
const Socket = FakeSocket as unknown as typeof WebSocket;
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

function fakeHelix() {
  const calls: string[] = [];
  const helix = {
    deleteMessage: async (_b: string, m: string, id: string) => void calls.push(`delete ${id} as ${m}`),
    ban: async (_b: string, m: string, u: string, o: { duration?: number }) => void calls.push(`ban ${u} ${o.duration} as ${m}`),
    sendChat: async (_b: string, s: string, text: string, reply?: string) => void calls.push(`say "${text}" as ${s} reply ${reply}`),
    moderatorIds: async () => ["m1", "m2"],
    category: async () => "Elden Ring",
    subscribe: async (type: string, _v: string, condition: Record<string, string>) =>
      void calls.push(`sub ${type} ${JSON.stringify(condition)}`),
  } as unknown as Helix;
  return { helix, calls };
}

const chat = (id: string, chatter: string, text: string, badges: string[] = []) => ({
  subscription: { type: "channel.chat.message" },
  event: {
    broadcaster_user_id: "100",
    chatter_user_id: chatter,
    chatter_user_login: `user${chatter}`,
    chatter_user_name: `User${chatter}`,
    message_id: id,
    message: { text, fragments: [{ type: "text", text }] },
    badges: badges.map((set_id) => ({ set_id, id: "1", info: "" })),
    reply: null,
  },
});

function setup(actorId = "100") {
  FakeSocket.all = [];
  const { helix, calls } = fakeHelix();
  const cfg = parseConfig("version: 1\nrules:\n  - { id: spam, pack: spam, action: delete }\n");
  if (!cfg.ok) throw new Error("bad config");
  const engine = createEngine({
    config: cfg.config,
    platform: createTwitchPlatform(helix, { broadcasterId: "100", actorId }),
    evaluate: async (_s, q) => Object.fromEntries(Object.keys(q).map((id) => [id, 0.99])),
    observe: false,
  });
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  const mods: string[][] = [];
  const conn = connectTwitch({
    engine,
    helix,
    broadcasterId: "100",
    actorId,
    thirdPartyEmotes: false,
    WebSocket: Socket,
    onModerators: (ids) => void mods.push([...ids].sort()),
  });
  return { engine, calls, events, mods, conn, socket: () => FakeSocket.all.at(-1)! };
}

describe("connectTwitch", () => {
  it("subscribes to chat, category and moderator changes, then loads the category", async () => {
    const s = setup();
    s.socket().push("session_welcome", { session: { id: "sess", keepalive_timeout_seconds: 10 } });
    await flush();
    expect(s.calls.filter((c) => c.startsWith("sub"))).toEqual([
      'sub channel.chat.message {"broadcaster_user_id":"100","user_id":"100"}',
      'sub channel.update {"broadcaster_user_id":"100"}',
      'sub channel.moderator.add {"broadcaster_user_id":"100"}',
      'sub channel.moderator.remove {"broadcaster_user_id":"100"}',
    ]);
    expect(s.engine.state().category).toBe("Elden Ring");
    expect(s.mods.at(-1)).toEqual(["m1", "m2"]);
    s.conn.close();
  });

  it("moderates chat through Helix as the acting account", async () => {
    const s = setup();
    s.socket().push("session_welcome", { session: { id: "sess", keepalive_timeout_seconds: 10 } });
    await flush();
    s.socket().push("notification", chat("msg-9", "7", "buy followers"));
    await flush();
    expect(s.calls).toContain("delete msg-9 as 100");
    s.conn.close();
  });

  it("answers commands in chat as a reply", async () => {
    const s = setup();
    s.socket().push("session_welcome", { session: { id: "sess", keepalive_timeout_seconds: 10 } });
    await flush();
    s.socket().push("notification", chat("msg-1", "100", "!vigia pausa"));
    await flush();
    expect(s.calls.some((c) => c.startsWith('say "') && c.endsWith("as 100 reply msg-1"))).toBe(true);
    s.conn.close();
  });

  it("ignores its own messages when a separate bot account acts", async () => {
    const s = setup("555");
    s.socket().push("session_welcome", { session: { id: "sess", keepalive_timeout_seconds: 10 } });
    await flush();
    s.socket().push("notification", chat("msg-2", "555", "buy followers", ["moderator"]));
    await flush();
    expect(s.events.filter((e) => e.type === "decision")).toEqual([]);
    s.conn.close();
  });

  it("follows category and moderator changes", async () => {
    const s = setup();
    s.socket().push("session_welcome", { session: { id: "sess", keepalive_timeout_seconds: 10 } });
    await flush();
    s.socket().push("notification", { subscription: { type: "channel.update" }, event: { category_name: "Hades II" } });
    s.socket().push("notification", { subscription: { type: "channel.moderator.add" }, event: { user_id: "m3" } });
    s.socket().push("notification", { subscription: { type: "channel.moderator.remove" }, event: { user_id: "m1" } });
    expect(s.engine.state().category).toBe("Hades II");
    expect(s.mods.at(-1)).toEqual(["m2", "m3"]);
    s.conn.close();
  });
});
