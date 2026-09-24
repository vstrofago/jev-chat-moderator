export class TwitchApiError extends Error {
  override name = "TwitchApiError";
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** The token is invalid or lacks a scope, even after a refresh. */
export class TwitchAuthError extends TwitchApiError {
  override name = "TwitchAuthError";
}

export interface HelixOptions {
  /** The streamer's own app (never a shared one). */
  clientId: string;
  token(): Promise<string>;
  /** Gets a fresh token after a 401; without it a 401 throws TwitchAuthError. */
  refresh?(): Promise<string>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const BASE = "https://api.twitch.tv/helix";
const MAX_RATE_WAIT_MS = 5000;

type Query = Record<string, string | undefined>;

export function createHelix(o: HelixOptions) {
  const doFetch = o.fetch ?? globalThis.fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function request<T = any>(method: string, path: string, query: Query = {}, body?: unknown): Promise<T> {
    const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined));
    const url = `${BASE}${path}${params.size ? `?${params}` : ""}`;
    let token = await o.token();
    let refreshed = false;
    let waited = false;

    for (;;) {
      const res = await doFetch(url, {
        method,
        headers: {
          "Client-Id": o.clientId,
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      const json = text ? safeJson(text) : undefined;

      if (res.ok) return json as T;
      const message = json?.message || json?.error || `HTTP ${res.status}`;
      if (res.status === 401) {
        if (o.refresh && !refreshed) {
          refreshed = true;
          token = await o.refresh();
          continue;
        }
        throw new TwitchAuthError(message, 401);
      }
      if (res.status === 429 && !waited) {
        waited = true;
        const reset = Number(res.headers.get("Ratelimit-Reset")) * 1000;
        await sleep(Math.min(Math.max(reset - Date.now(), 0), MAX_RATE_WAIT_MS));
        continue;
      }
      throw new TwitchApiError(message, res.status);
    }
  }

  return {
    request,

    async deleteMessage(broadcasterId: string, moderatorId: string, messageId: string) {
      await request("DELETE", "/moderation/chat", {
        broadcaster_id: broadcasterId,
        moderator_id: moderatorId,
        message_id: messageId,
      });
    },

    /** A ban, or a timeout when `duration` (seconds) is given. */
    async ban(broadcasterId: string, moderatorId: string, userId: string, opts: { duration?: number; reason?: string }) {
      await request(
        "POST",
        "/moderation/bans",
        { broadcaster_id: broadcasterId, moderator_id: moderatorId },
        { data: { user_id: userId, ...opts } },
      );
    },

    async sendChat(broadcasterId: string, senderId: string, message: string, replyToId?: string) {
      const body: Record<string, string> = { broadcaster_id: broadcasterId, sender_id: senderId, message };
      if (replyToId) body.reply_parent_message_id = replyToId;
      const res = await request<{ data: { is_sent: boolean; drop_reason?: { message: string } }[] }>("POST", "/chat/messages", {}, body);
      const sent = res.data?.[0];
      if (sent && !sent.is_sent) throw new TwitchApiError(sent.drop_reason?.message ?? "Message not sent", 200);
    },

    async moderatorIds(broadcasterId: string): Promise<string[]> {
      const ids: string[] = [];
      let after: string | undefined;
      do {
        const page = await request<{ data: { user_id: string }[]; pagination?: { cursor?: string } }>(
          "GET",
          "/moderation/moderators",
          { broadcaster_id: broadcasterId, first: "100", after },
        );
        ids.push(...page.data.map((m) => m.user_id));
        after = page.pagination?.cursor;
      } while (after);
      return ids;
    },

    /** The stream category (game) name, or undefined when none is set. */
    async category(broadcasterId: string): Promise<string | undefined> {
      const res = await request<{ data: { game_name?: string }[] }>("GET", "/channels", { broadcaster_id: broadcasterId });
      return res.data[0]?.game_name || undefined;
    },

    /** The user the token belongs to. */
    async me() {
      const res = await request<{ data: { id: string; login: string; display_name: string }[] }>("GET", "/users");
      const u = res.data[0];
      if (!u) throw new TwitchAuthError("The token has no user", 401);
      return { id: u.id, login: u.login, displayName: u.display_name };
    },

    async subscribe(type: string, version: string, condition: Record<string, string>, sessionId: string) {
      await request("POST", "/eventsub/subscriptions", {}, {
        type,
        version,
        condition,
        transport: { method: "websocket", session_id: sessionId },
      });
    },
  };
}

export type Helix = ReturnType<typeof createHelix>;

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
