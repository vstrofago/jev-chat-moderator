import type { ChatMessage } from "@vigia/engine";
import { parseIrcLine, toChatMessage } from "./irc";

export interface ReaderEvents {
  message(m: ChatMessage): void;
  status(s: "connecting" | "joined" | "reconnecting" | "closed", detail?: string): void;
  warning(text: string): void;
}

export interface ReaderOptions {
  WebSocket?: typeof WebSocket;
  /** First reconnect delay; doubles on every failure up to 30 s. */
  backoffMs?: number;
  /** Warn if the channel has not confirmed the join after this long. */
  joinTimeoutMs?: number;
}

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const MAX_BACKOFF_MS = 30_000;

/**
 * Reads a public channel's chat anonymously (a `justinfan` login, no account, no token).
 * Development only: it can read but never write, and nothing it receives is stored.
 */
export function readChannel(channel: string, on: ReaderEvents, o: ReaderOptions = {}) {
  const Socket = o.WebSocket ?? globalThis.WebSocket;
  const backoffMs = o.backoffMs ?? 1000;
  const joinTimeoutMs = o.joinTimeoutMs ?? 10_000;
  const room = channel.replace(/^#/, "").toLowerCase();

  let socket: WebSocket | null = null;
  let stopped = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let joinTimer: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    on.status("connecting");
    const ws = new Socket(IRC_URL);
    socket = ws;
    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(10_000 + Math.random() * 90_000)}`);
      ws.send(`JOIN #${room}`);
      joinTimer = setTimeout(
        () => on.warning(`#${room} has not confirmed the join. Check the channel name (it must exist).`),
        joinTimeoutMs,
      );
    };
    ws.onmessage = (e) => {
      for (const raw of String(e.data).split("\r\n")) {
        if (raw) handle(ws, raw);
      }
    };
    ws.onclose = () => {
      clearTimeout(joinTimer);
      if (socket !== ws) return;
      socket = null;
      if (stopped) return on.status("closed");
      const delay = Math.min(backoffMs * 2 ** failures++, MAX_BACKOFF_MS);
      on.status("reconnecting", `in ${delay / 1000} s`);
      retryTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => on.warning("Connection error");
  }

  function handle(ws: WebSocket, raw: string) {
    const line = parseIrcLine(raw);
    switch (line.command) {
      case "PING":
        return ws.send(`PONG :${line.params[0] ?? ""}`);
      case "RECONNECT":
        return ws.close();
      case "ROOMSTATE":
        clearTimeout(joinTimer);
        failures = 0;
        return on.status("joined", `#${room}`);
      case "PRIVMSG": {
        const m = toChatMessage(line);
        if (m) on.message(m);
      }
    }
  }

  connect();
  return {
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(joinTimer);
      if (socket) socket.close();
      else on.status("closed");
    },
  };
}
