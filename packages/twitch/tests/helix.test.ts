import { describe, expect, it } from "vitest";
import { createHelix, TwitchApiError, TwitchAuthError } from "../src/helix";

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

function fakeTwitch(responses: Array<[number, unknown?, Record<string, string>?]>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      method: init.method ?? "GET",
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const [status, body, headers] = responses.shift() ?? [500];
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const auth = (fetch: typeof globalThis.fetch, refresh?: () => Promise<string>) =>
  createHelix({ clientId: "cid", token: async () => "tok", refresh, fetch, sleep: async () => {} });

describe("helix", () => {
  it("sends the client id and bearer token", async () => {
    const t = fakeTwitch([[204]]);
    await auth(t.fetch).deleteMessage("b1", "m1", "msg1");
    expect(t.calls[0]).toMatchObject({
      method: "DELETE",
      url: "https://api.twitch.tv/helix/moderation/chat?broadcaster_id=b1&moderator_id=m1&message_id=msg1",
      headers: { "Client-Id": "cid", Authorization: "Bearer tok" },
    });
  });

  it("times out with a duration and a reason", async () => {
    const t = fakeTwitch([[200, { data: [] }]]);
    await auth(t.fetch).ban("b1", "m1", "u9", { duration: 60, reason: "Vigia: toxicity" });
    expect(t.calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.twitch.tv/helix/moderation/bans?broadcaster_id=b1&moderator_id=m1",
      body: { data: { user_id: "u9", duration: 60, reason: "Vigia: toxicity" } },
    });
  });

  it("sends chat replies and reports dropped messages", async () => {
    const t = fakeTwitch([
      [200, { data: [{ message_id: "x", is_sent: true }] }],
      [200, { data: [{ message_id: "", is_sent: false, drop_reason: { code: "msg_duplicate", message: "duplicate" } }] }],
    ]);
    const helix = auth(t.fetch);
    await helix.sendChat("b1", "s1", "hola", "parent1");
    expect(t.calls[0].body).toEqual({ broadcaster_id: "b1", sender_id: "s1", message: "hola", reply_parent_message_id: "parent1" });
    await expect(helix.sendChat("b1", "s1", "hola")).rejects.toThrow("duplicate");
  });

  it("follows pagination for the moderator list", async () => {
    const t = fakeTwitch([
      [200, { data: [{ user_id: "a" }, { user_id: "b" }], pagination: { cursor: "c1" } }],
      [200, { data: [{ user_id: "c" }], pagination: {} }],
    ]);
    await expect(auth(t.fetch).moderatorIds("b1")).resolves.toEqual(["a", "b", "c"]);
    expect(t.calls[1].url).toContain("after=c1");
  });

  it("reads the channel category and the token's user", async () => {
    const t = fakeTwitch([
      [200, { data: [{ broadcaster_id: "b1", game_id: "512953", game_name: "Elden Ring" }] }],
      [200, { data: [{ id: "b1", login: "streamer", display_name: "Streamer" }] }],
    ]);
    const helix = auth(t.fetch);
    await expect(helix.category("b1")).resolves.toEqual({ id: "512953", name: "Elden Ring" });
    await expect(helix.me()).resolves.toEqual({ id: "b1", login: "streamer", displayName: "Streamer" });
  });

  it("creates EventSub subscriptions on a websocket session", async () => {
    const t = fakeTwitch([[202, { data: [{ id: "sub1", status: "enabled" }] }]]);
    await auth(t.fetch).subscribe("channel.chat.message", "1", { broadcaster_user_id: "b1", user_id: "s1" }, "sess");
    expect(t.calls[0].body).toEqual({
      type: "channel.chat.message",
      version: "1",
      condition: { broadcaster_user_id: "b1", user_id: "s1" },
      transport: { method: "websocket", session_id: "sess" },
    });
  });

  it("refreshes the token once on 401 and retries", async () => {
    const t = fakeTwitch([[401, { message: "Invalid OAuth token" }], [204]]);
    let refreshed = 0;
    await auth(t.fetch, async () => (refreshed++, "new")).deleteMessage("b1", "m1", "x");
    expect(refreshed).toBe(1);
    expect(t.calls[1].headers.Authorization).toBe("Bearer new");
  });

  it("throws TwitchAuthError when the token stays invalid", async () => {
    const t = fakeTwitch([[401, { message: "Invalid OAuth token" }], [401, { message: "Invalid OAuth token" }]]);
    await expect(auth(t.fetch, async () => "new").deleteMessage("b1", "m1", "x")).rejects.toBeInstanceOf(TwitchAuthError);
    const t2 = fakeTwitch([[401, { message: "Invalid OAuth token" }]]);
    await expect(auth(t2.fetch).deleteMessage("b1", "m1", "x")).rejects.toBeInstanceOf(TwitchAuthError);
  });

  it("waits for the rate limit reset once, then retries", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 1);
    const t = fakeTwitch([[429, { message: "Too Many Requests" }, { "Ratelimit-Reset": reset }], [204]]);
    await auth(t.fetch).deleteMessage("b1", "m1", "x");
    expect(t.calls).toHaveLength(2);
  });

  it("surfaces Twitch's error message with the status", async () => {
    const t = fakeTwitch([[400, { error: "Bad Request", status: 400, message: "The user is already banned." }]]);
    const err = await auth(t.fetch).ban("b1", "m1", "u9", {}).catch((e) => e);
    expect(err).toBeInstanceOf(TwitchApiError);
    expect(err).toMatchObject({ status: 400, message: "The user is already banned." });
  });
});
