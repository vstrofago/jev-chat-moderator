import type { ChatMessage, Fragment } from "@vigia/engine";

export interface EventSubHandlers {
  /** A fresh session: create the subscriptions for `sessionId` (within 10 s). */
  welcome(sessionId: string): Promise<void>;
  notification(type: string, event: any): void;
  revocation(type: string, status: string): void;
  status(s: "connecting" | "connected" | "reconnecting" | "error" | "closed", detail?: string): void;
}

export interface EventSubOptions {
  WebSocket?: typeof WebSocket;
  url?: string;
  /** First reconnect delay; doubles on every failure up to 30 s. */
  backoffMs?: number;
}

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE_MS = 5000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Twitch EventSub over WebSocket. Handles the welcome/subscribe handshake, keepalive
 * timeouts, `session_reconnect` migrations (which keep their subscriptions) and duplicate
 * deliveries.
 */
export function connectEventSub(on: EventSubHandlers, o: EventSubOptions = {}) {
  const Socket = o.WebSocket ?? globalThis.WebSocket;
  const backoffMs = o.backoffMs ?? 1000;
  let active: WebSocket | null = null;
  let stopped = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
  const retired = new WeakSet<WebSocket>();
  const seen: string[] = [];

  function retire(ws: WebSocket) {
    retired.add(ws);
    ws.close();
  }

  function armKeepalive(ws: WebSocket, seconds: number) {
    clearTimeout(keepaliveTimer);
    keepaliveTimer = setTimeout(() => {
      if (ws === active) ws.close(); // silent socket: start over
    }, seconds * 1000 + KEEPALIVE_GRACE_MS);
  }

  function connect(url: string, migrating: boolean) {
    if (!migrating) on.status("connecting");
    const ws = new Socket(url);
    if (!migrating) active = ws;
    let keepaliveSeconds = 10;

    ws.onmessage = async (e) => {
      let msg: any;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const id: string | undefined = msg?.metadata?.message_id;
      if (id) {
        if (seen.includes(id)) return;
        seen.push(id);
        if (seen.length > 500) seen.shift();
      }
      const payload = msg?.payload ?? {};
      if (ws === active) armKeepalive(ws, keepaliveSeconds);

      switch (msg?.metadata?.message_type) {
        case "session_welcome": {
          keepaliveSeconds = payload.session?.keepalive_timeout_seconds ?? keepaliveSeconds;
          if (migrating) {
            const old = active;
            active = ws;
            if (old) retire(old);
            armKeepalive(ws, keepaliveSeconds);
            return;
          }
          armKeepalive(ws, keepaliveSeconds);
          try {
            await on.welcome(payload.session.id);
            failures = 0;
            on.status("connected");
          } catch (err) {
            on.status("error", (err as Error).message);
            ws.close();
          }
          return;
        }
        case "notification":
          return on.notification(payload.subscription?.type, payload.event);
        case "session_reconnect":
          return connect(payload.session.reconnect_url, true);
        case "revocation":
          return on.revocation(payload.subscription?.type, payload.subscription?.status);
      }
    };

    ws.onclose = () => {
      if (retired.has(ws) || ws !== active) return;
      clearTimeout(keepaliveTimer);
      active = null;
      if (stopped) return on.status("closed");
      const delay = Math.min(backoffMs * 2 ** failures++, MAX_BACKOFF_MS);
      on.status("reconnecting", `in ${delay / 1000} s`);
      retryTimer = setTimeout(() => connect(o.url ?? EVENTSUB_URL, false), delay);
    };
  }

  connect(o.url ?? EVENTSUB_URL, false);
  return {
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(keepaliveTimer);
      if (active) active.close();
      else on.status("closed");
    },
  };
}

/** Converts a `channel.chat.message` event into the engine's ChatMessage. */
export function chatEventToMessage(event: any): ChatMessage {
  const badges = new Set<string>((event.badges ?? []).map((b: { set_id: string }) => b.set_id));
  const fragments: Fragment[] = [];
  for (const f of event.message?.fragments ?? []) {
    if (f.type === "emote") fragments.push({ type: "emote", text: f.text, id: String(f.emote?.id ?? "") });
    else {
      // Mentions and cheermotes are plain text for our purposes.
      const prev = fragments.at(-1);
      if (prev?.type === "text") prev.text += f.text;
      else fragments.push({ type: "text", text: f.text });
    }
  }

  const message: ChatMessage = {
    id: event.message_id,
    text: event.message?.text ?? "",
    author: {
      id: event.chatter_user_id,
      login: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
      broadcaster: event.chatter_user_id === event.broadcaster_user_id || badges.has("broadcaster"),
      moderator: badges.has("moderator"),
      vip: badges.has("vip"),
    },
    fragments: fragments.length > 0 ? fragments : [{ type: "text", text: event.message?.text ?? "" }],
  };
  if (event.reply?.parent_message_id) {
    message.replyTo = {
      id: event.reply.parent_message_id,
      text: event.reply.parent_message_body ?? "",
      authorLogin: event.reply.parent_user_login ?? "",
    };
  }
  return message;
}
