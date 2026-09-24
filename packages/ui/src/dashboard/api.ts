import type { ConfigError, HighlightItem, RuleVerdict, RuntimeState, VigiaConfig } from "@vigia/engine";
import type { AuditEntry, SpoilerStatus, StoredDecision, User } from "@vigia/server";

export type { AuditEntry, SpoilerStatus, ConfigError, HighlightItem, RuleVerdict, RuntimeState, StoredDecision, User, VigiaConfig };

export interface Overview {
  user: User;
  mode: "local" | "exposed";
  state: RuntimeState;
  config: VigiaConfig;
  overlayUrl?: string;
  setupDone: boolean;
}

export interface Stats {
  messagesPerMinute: number;
  messagesLastHour: number;
  actionsLastHour: number;
  tokensLastHour: number;
  costPerHour: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: ConfigError[] = [],
  ) {
    super(message);
  }
}

/** Every call carries X-Vigia, which the server requires for writes (a CSRF guard). */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "X-Vigia": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/login")) location.href = "/login";
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data.errors);
  return data as T;
}

export type LiveEvent =
  | { type: "decision"; decision: StoredDecision }
  | { type: "state"; state: RuntimeState }
  | { type: "highlight"; current: HighlightItem | null; waiting: HighlightItem[] }
  | { type: "warning"; code: string; detail: string }
  | { type: "stats"; stats: Stats }
  | ({ type: "spoilers" } & SpoilerStatus);

/** The dashboard WebSocket, reconnecting with backoff. */
export function connectLive(onEvent: (e: LiveEvent) => void, onStatus: (connected: boolean) => void) {
  let delay = 1000;
  let stopped = false;
  let ws: WebSocket;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/dashboard`);
    ws.onopen = () => {
      delay = 1000;
      onStatus(true);
    };
    ws.onmessage = (e) => onEvent(JSON.parse(e.data));
    ws.onclose = () => {
      onStatus(false);
      if (stopped) return;
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 15_000);
    };
  };
  open();
  return () => {
    stopped = true;
    ws.close();
  };
}
