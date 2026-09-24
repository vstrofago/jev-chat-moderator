import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readChannel } from "../src/irc-reader";

class FakeSocket {
  static all: FakeSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  // test helpers
  open() {
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
}

const Socket = FakeSocket as unknown as typeof WebSocket;
const last = () => FakeSocket.all.at(-1)!;

function events() {
  const log: string[] = [];
  const messages: string[] = [];
  return {
    log,
    messages,
    on: {
      message: (m: { text: string }) => void messages.push(m.text),
      status: (s: string) => void log.push(s),
      warning: (w: string) => void log.push(`warning: ${w}`),
    },
  };
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("readChannel", () => {
  it("logs in anonymously and joins the lowercased channel", () => {
    const e = events();
    readChannel("Dallas", e.on, { WebSocket: Socket });
    last().open();
    expect(last().url).toBe("wss://irc-ws.chat.twitch.tv:443");
    expect(last().sent[0]).toBe("CAP REQ :twitch.tv/tags twitch.tv/commands");
    expect(last().sent[1]).toBe("PASS SCHMOOPIIE");
    expect(last().sent[2]).toMatch(/^NICK justinfan\d+$/);
    expect(last().sent[3]).toBe("JOIN #dallas");
  });

  it("answers PING and reports joining", () => {
    const e = events();
    readChannel("dallas", e.on, { WebSocket: Socket });
    last().open();
    last().receive("PING :tmi.twitch.tv\r\n@room-id=1 :tmi.twitch.tv ROOMSTATE #dallas\r\n");
    expect(last().sent.at(-1)).toBe("PONG :tmi.twitch.tv");
    expect(e.log).toContain("joined");
  });

  it("reports the channel's Twitch id once joined", () => {
    const rooms: string[] = [];
    readChannel("dallas", { ...events().on, room: (id) => void rooms.push(id) }, { WebSocket: Socket });
    last().open();
    last().receive("@emote-only=0;room-id=12826 :tmi.twitch.tv ROOMSTATE #dallas\r\n@emote-only=1;room-id=12826 :tmi.twitch.tv ROOMSTATE #dallas\r\n");
    expect(rooms).toEqual(["12826"]);
  });

  it("emits every chat message in a frame", () => {
    const e = events();
    readChannel("dallas", e.on, { WebSocket: Socket });
    last().open();
    last().receive(
      "@id=1;user-id=1 :a!a@a.tmi.twitch.tv PRIVMSG #dallas :first\r\n@id=2;user-id=2 :b!b@b.tmi.twitch.tv PRIVMSG #dallas :second\r\n",
    );
    expect(e.messages).toEqual(["first", "second"]);
  });

  it("reconnects with backoff when the socket drops, and on RECONNECT", () => {
    const e = events();
    readChannel("dallas", e.on, { WebSocket: Socket, backoffMs: 1000 });
    last().open();
    last().close();
    expect(e.log).toContain("reconnecting");
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);

    last().open();
    last().receive(":tmi.twitch.tv RECONNECT\r\n");
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all).toHaveLength(3);
  });

  it("stops for good after close()", () => {
    const e = events();
    const reader = readChannel("dallas", e.on, { WebSocket: Socket, backoffMs: 1000 });
    last().open();
    reader.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(e.log.at(-1)).toBe("closed");
  });

  it("warns when the channel never confirms the join", () => {
    const e = events();
    readChannel("no_such_channel_xyz", e.on, { WebSocket: Socket, joinTimeoutMs: 10_000 });
    last().open();
    vi.advanceTimersByTime(10_000);
    expect(e.log.some((l) => l.startsWith("warning:") && l.includes("no_such_channel_xyz"))).toBe(true);
  });

  it("never sends a chat message", () => {
    const e = events();
    readChannel("dallas", e.on, { WebSocket: Socket });
    last().open();
    last().receive("PING :x\r\n@id=1;user-id=1 :a!a@a.tmi.twitch.tv PRIVMSG #dallas :!vigia pause\r\n");
    expect(last().sent.some((s) => s.startsWith("PRIVMSG"))).toBe(false);
  });
});
