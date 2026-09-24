import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatEventToMessage, connectEventSub } from "../src/eventsub";

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  push(type: string, payload: unknown = {}, id = Math.random().toString(36)) {
    this.onmessage?.({ data: JSON.stringify({ metadata: { message_id: id, message_type: type }, payload }) });
  }
  welcome(sessionId: string, keepalive = 10) {
    this.push("session_welcome", { session: { id: sessionId, keepalive_timeout_seconds: keepalive } });
  }
}

const Socket = FakeSocket as unknown as typeof WebSocket;
const last = () => FakeSocket.all.at(-1)!;
const flush = () => new Promise((r) => setImmediate(r));

function handlers() {
  const log: string[] = [];
  return {
    log,
    on: {
      welcome: async (sessionId: string) => void log.push(`subscribe ${sessionId}`),
      notification: (type: string, event: any) => void log.push(`${type} ${event.n}`),
      revocation: (type: string, status: string) => void log.push(`revoked ${type} ${status}`),
      status: (s: string) => void log.push(`[${s}]`),
    },
  };
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("connectEventSub", () => {
  it("subscribes after the welcome and delivers notifications once", async () => {
    const h = handlers();
    connectEventSub(h.on, { WebSocket: Socket });
    expect(last().url).toBe("wss://eventsub.wss.twitch.tv/ws");
    last().welcome("s1");
    await flush();
    last().push("notification", { subscription: { type: "channel.chat.message" }, event: { n: 1 } }, "dup");
    last().push("notification", { subscription: { type: "channel.chat.message" }, event: { n: 1 } }, "dup");
    expect(h.log).toEqual(["[connecting]", "subscribe s1", "[connected]", "channel.chat.message 1"]);
  });

  it("moves to the reconnect URL without subscribing again", async () => {
    const h = handlers();
    connectEventSub(h.on, { WebSocket: Socket });
    const first = last();
    first.welcome("s1");
    await flush();
    first.push("session_reconnect", { session: { id: "s1", reconnect_url: "wss://eventsub.wss.twitch.tv/ws?id=x" } });
    const second = last();
    expect(second.url).toBe("wss://eventsub.wss.twitch.tv/ws?id=x");
    expect(first.closed).toBe(false);
    second.welcome("s1");
    await flush();
    expect(first.closed).toBe(true);
    expect(h.log.filter((l) => l.startsWith("subscribe"))).toEqual(["subscribe s1"]);
  });

  it("starts a fresh session when keepalives stop", async () => {
    const h = handlers();
    connectEventSub(h.on, { WebSocket: Socket, backoffMs: 1000 });
    last().welcome("s1", 10);
    await flush();
    vi.advanceTimersByTime(10_000 + 5_000);
    expect(FakeSocket.all[0].closed).toBe(true);
    vi.advanceTimersByTime(1000);
    last().welcome("s2");
    await flush();
    expect(h.log.filter((l) => l.startsWith("subscribe"))).toEqual(["subscribe s1", "subscribe s2"]);
  });

  it("keeps the connection alive while keepalives arrive", async () => {
    const h = handlers();
    connectEventSub(h.on, { WebSocket: Socket });
    last().welcome("s1", 10);
    await flush();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(9_000);
      last().push("session_keepalive");
    }
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("reports revocations", async () => {
    const h = handlers();
    connectEventSub(h.on, { WebSocket: Socket });
    last().welcome("s1");
    await flush();
    last().push("revocation", { subscription: { type: "channel.chat.message", status: "authorization_revoked" } });
    expect(h.log).toContain("revoked channel.chat.message authorization_revoked");
  });

  it("closes a session whose subscriptions fail, and retries later", async () => {
    const log: string[] = [];
    connectEventSub(
      {
        welcome: async () => {
          throw new Error("403 missing scope");
        },
        notification: () => {},
        revocation: () => {},
        status: (s, d) => void log.push(`${s}${d ? `: ${d}` : ""}`),
      },
      { WebSocket: Socket, backoffMs: 1000 },
    );
    last().welcome("s1");
    await flush();
    expect(FakeSocket.all[0].closed).toBe(true);
    expect(log).toContain("error: 403 missing scope");
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stops for good after close()", async () => {
    const h = handlers();
    const es = connectEventSub(h.on, { WebSocket: Socket, backoffMs: 1000 });
    last().welcome("s1");
    await flush();
    es.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(h.log.at(-1)).toBe("[closed]");
  });
});

describe("chatEventToMessage", () => {
  const event = {
    broadcaster_user_id: "100",
    chatter_user_id: "7",
    chatter_user_login: "viewer",
    chatter_user_name: "Viewer",
    message_id: "msg-1",
    message: {
      text: "hola Kappa @bob",
      fragments: [
        { type: "text", text: "hola " },
        { type: "emote", text: "Kappa", emote: { id: "25" } },
        { type: "text", text: " " },
        { type: "mention", text: "@bob", mention: { user_login: "bob" } },
      ],
    },
    badges: [{ set_id: "vip", id: "1", info: "" }],
    reply: null,
  };

  it("maps text, author, roles and fragments", () => {
    expect(chatEventToMessage(event)).toEqual({
      id: "msg-1",
      text: "hola Kappa @bob",
      author: { id: "7", login: "viewer", displayName: "Viewer", broadcaster: false, moderator: false, vip: true },
      fragments: [
        { type: "text", text: "hola " },
        { type: "emote", text: "Kappa", id: "25" },
        { type: "text", text: " @bob" },
      ],
    });
  });

  it("recognizes the broadcaster and moderators, and maps replies", () => {
    const m = chatEventToMessage({
      ...event,
      chatter_user_id: "100",
      badges: [{ set_id: "moderator", id: "1", info: "" }],
      reply: { parent_message_id: "p1", parent_message_body: "how do you parry?", parent_user_login: "bob" },
    });
    expect(m.author).toMatchObject({ broadcaster: true, moderator: true });
    expect(m.replyTo).toEqual({ id: "p1", text: "how do you parry?", authorLogin: "bob" });
  });
});
