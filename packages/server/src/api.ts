import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChatPlatform, ConfigResult, Engine, HighlightItem, Rule } from "@vigia/engine";
import type { Auth, Role, User } from "./auth";
import type { ConfigFile, RulePatch, SettingsPatch } from "./config-file";
import type { HighlightQueue } from "./highlights";
import type { SpoilerGuard } from "./spoiler-guard";
import type { StoredDecision, Store } from "./store";
import type { UsageMeter } from "./usage";

export interface ApiContext {
  auth: Auth;
  engine: Engine;
  store: Store;
  file: ConfigFile;
  highlights: HighlightQueue;
  platform: ChatPlatform;
  usage: UsageMeter;
  overlayUrl: () => string;
  twitchClientId?: string;
  /** Call after a successful config edit so the engine and queue follow the file. */
  configChanged(): void;
  spoilers: SpoilerGuard;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const MAX_BODY = 64 * 1024;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "Request too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const authRequest = (req: IncomingMessage) => ({
  method: req.method ?? "GET",
  host: req.headers.host,
  cookie: req.headers.cookie,
  xVigia: req.headers["x-vigia"] as string | undefined,
});

const configResult = (r: ConfigResult) => {
  if (!r.ok) throw new HttpError(400, "The rules would be invalid", { errors: r.errors });
};

/** The dashboard's JSON API. Returns false when the path is not an API route. */
export function createApi(ctx: ApiContext) {
  const { auth, engine, store, file, highlights, platform, usage } = ctx;

  function decisionOr404(id: unknown): StoredDecision {
    const d = store.decision(Number(id));
    if (!d) throw new HttpError(404, "No such message");
    return d;
  }

  function audit(user: User, action: string, target: string, detail = "") {
    store.recordAudit({ login: user.login, role: user.role, action, target, detail });
  }

  function highlightFrom(d: StoredDecision): Omit<HighlightItem, "id"> {
    if (d.spoiler) throw new HttpError(400, "Possible spoilers are never highlighted");
    return { kind: "highlight", text: d.text, authorName: d.authorName, source: "command" };
  }

  let highlightSeq = 0;
  const showNow = (item: Omit<HighlightItem, "id">) => highlights.showNow({ id: `d${++highlightSeq}`, ...item });

  /** delete / timeout / ban on the author of a stored decision. */
  async function moderate(user: User, action: string, d: StoredDecision, seconds?: number) {
    if (action === "delete") await platform.deleteMessage(d.messageId);
    else if (action === "timeout") await platform.timeout(d.authorId, seconds ?? 600, `Vigia: ${user.login}`);
    else if (action === "ban") {
      if (!platform.ban) throw new HttpError(501, "This source cannot ban");
      await platform.ban(d.authorId, `Vigia: ${user.login}`);
    }
    usage.action();
    audit(user, action, d.authorLogin, action === "timeout" ? `${seconds ?? 600} s` : "");
  }

  async function edited(user: User, r: ConfigResult, action: string, target: string) {
    configResult(r);
    ctx.configChanged();
    audit(user, action, target);
    return { ok: true, config: file.config() };
  }

  type Handler = (a: { req: IncomingMessage; res: ServerResponse; user: User; params: string[]; url: URL }) => Promise<unknown>;
  interface Route {
    method: string;
    path: RegExp;
    write?: boolean;
    role?: Role;
    handler: Handler;
  }

  const routes: Route[] = [
    { method: "GET", path: /^\/api\/me$/, handler: async ({ user }) => ({ user, mode: auth.mode }) },

    {
      method: "GET",
      path: /^\/api\/overview$/,
      handler: async ({ user }) => ({
        user,
        mode: auth.mode,
        state: engine.state(),
        config: file.config(),
        overlayUrl: user.role === "broadcaster" ? ctx.overlayUrl() : undefined,
        setupDone: store.setting<boolean>("setupDone") ?? false,
      }),
    },

    {
      method: "GET",
      path: /^\/api\/decisions$/,
      handler: async ({ url }) => store.recentDecisions(Math.min(Number(url.searchParams.get("limit")) || 100, 500)),
    },
    { method: "GET", path: /^\/api\/uncertain$/, handler: async () => store.uncertain(200) },

    {
      method: "POST",
      path: /^\/api\/uncertain\/(\d+)\/(apply|dismiss)$/,
      write: true,
      handler: async ({ user, params: [id, how] }) => {
        const d = decisionOr404(id);
        if (how === "apply") {
          // The strongest unsure rule decides what "apply" means.
          const order = { timeout: 3, delete: 2, log: 1 } as const;
          const verdict = [...d.outcome.uncertain].sort(
            (a, b) => (order[b.action as keyof typeof order] ?? 0) - (order[a.action as keyof typeof order] ?? 0),
          )[0];
          const rule = file.config().rules.find((r) => r.id === verdict?.ruleId);
          if (verdict?.action === "delete" || verdict?.action === "timeout") {
            await moderate(user, verdict.action, d, rule?.seconds);
          }
          store.resolve(d.id, "applied");
        } else {
          store.resolve(d.id, "dismissed");
          audit(user, "dismiss", d.authorLogin);
        }
        return { ok: true };
      },
    },

    {
      method: "POST",
      path: /^\/api\/actions$/,
      write: true,
      handler: async ({ req, user }) => {
        const body = await readJson(req);
        switch (body.action) {
          case "delete":
          case "timeout":
          case "ban":
            await moderate(user, body.action, decisionOr404(body.decisionId), Number(body.seconds) || undefined);
            return { ok: true };
          case "highlight": {
            showNow(highlightFrom(decisionOr404(body.decisionId)));
            audit(user, "highlight", decisionOr404(body.decisionId).authorLogin);
            return { ok: true };
          }
          case "announce": {
            const text = String(body.text ?? "").trim();
            if (!text) throw new HttpError(400, "Write the announcement text");
            showNow({ kind: "announcement", text: text.slice(0, 300), source: "command" });
            audit(user, "announce", "overlay");
            return { ok: true };
          }
          default:
            throw new HttpError(400, "Unknown action");
        }
      },
    },

    {
      method: "GET",
      path: /^\/api\/highlights$/,
      handler: async () => ({ current: highlights.current(), waiting: highlights.waiting() }),
    },
    {
      method: "POST",
      path: /^\/api\/highlights\/(clear|next)$/,
      write: true,
      handler: async ({ params: [what] }) => {
        if (what === "clear") highlights.clear();
        else highlights.next();
        return { ok: true };
      },
    },

    { method: "GET", path: /^\/api\/config$/, handler: async () => ({ text: file.text(), config: file.config() }) },
    {
      method: "PUT",
      path: /^\/api\/config$/,
      write: true,
      handler: async ({ req, user }) => edited(user, await file.replaceText(String((await readJson(req)).text ?? "")), "edit-file", "vigia.yaml"),
    },
    {
      method: "PATCH",
      path: /^\/api\/rules\/([a-z0-9_-]+)$/,
      write: true,
      handler: async ({ req, user, params: [id] }) =>
        edited(user, await file.setRule(id, (await readJson(req)) as RulePatch), "rule-edit", id),
    },
    {
      method: "POST",
      path: /^\/api\/rules$/,
      write: true,
      handler: async ({ req, user }) => {
        const rule = (await readJson(req)) as Rule;
        return edited(user, await file.addRule(rule), "rule-add", String(rule.id));
      },
    },
    {
      method: "DELETE",
      path: /^\/api\/rules\/([a-z0-9_-]+)$/,
      write: true,
      handler: async ({ user, params: [id] }) => edited(user, await file.removeRule(id), "rule-remove", id),
    },
    {
      method: "PATCH",
      path: /^\/api\/settings$/,
      write: true,
      handler: async ({ req, user }) => edited(user, await file.setSettings((await readJson(req)) as SettingsPatch), "settings", "vigia.yaml"),
    },

    {
      method: "POST",
      path: /^\/api\/test$/,
      write: true,
      handler: async ({ req }) => {
        const text = String((await readJson(req)).text ?? "").slice(0, 500);
        if (!text.trim()) throw new HttpError(400, "Write a message to test");
        return { verdicts: await engine.test(text) };
      },
    },

    {
      method: "GET",
      path: /^\/api\/topics$/,
      handler: async ({ user }) => {
        const topics = store.setting<string[]>("protectedTopics") ?? [];
        // The streamer must never read them: that would spoil the game for them.
        return user.role === "moderator" ? { topics } : { count: topics.length };
      },
    },
    {
      method: "PUT",
      path: /^\/api\/topics$/,
      write: true,
      handler: async ({ req, user }) => {
        if (user.role !== "moderator") throw new HttpError(403, "Only moderators manage protected topics");
        const raw = (await readJson(req)).topics;
        if (!Array.isArray(raw)) throw new HttpError(400, "topics must be a list");
        const topics = raw.map((t) => String(t).trim().slice(0, 200)).filter(Boolean).slice(0, 100);
        ctx.spoilers.setModTopics(topics);
        audit(user, "topics", "antispoiler", `${topics.length} topics`);
        return { ok: true, count: topics.length };
      },
    },
    {
      method: "GET",
      path: /^\/api\/spoiler-pack$/,
      // Names and counts only: a pack's topics are never sent to anyone.
      handler: async () => ctx.spoilers.status(),
    },
    {
      method: "PUT",
      path: /^\/api\/spoiler-pack\/checkpoint$/,
      write: true,
      handler: async ({ req, user }) => {
        const raw = (await readJson(req)).checkpoint;
        const name = raw === null || raw === undefined || raw === "" ? null : String(raw);
        if (!ctx.spoilers.setCheckpoint(name)) throw new HttpError(400, "No such checkpoint in the current pack");
        audit(user, "checkpoint", "antispoiler", name ?? "all topics");
        return { ok: true, ...ctx.spoilers.status() };
      },
    },

    {
      method: "POST",
      path: /^\/api\/state$/,
      write: true,
      handler: async ({ req, user }) => {
        const body = await readJson(req);
        if (typeof body.paused === "boolean") {
          engine.setPaused(body.paused);
          audit(user, body.paused ? "pause" : "resume", "moderation");
        }
        if (typeof body.observe === "boolean") {
          engine.setObserve(body.observe);
          audit(user, body.observe ? "observe-on" : "observe-off", "moderation");
        }
        if (body.setupDone === true) store.setSetting("setupDone", true);
        return { ok: true, state: engine.state() };
      },
    },

    { method: "GET", path: /^\/api\/stats$/, handler: async () => usage.snapshot() },
    { method: "GET", path: /^\/api\/audit$/, role: "broadcaster", handler: async () => store.audit(200) },
  ];

  /** Login endpoints need no session, but still the X-Vigia header. */
  async function login(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const secure = auth.mode === "exposed" && req.headers["x-forwarded-proto"] === "https";
    if (url.pathname === "/api/login-info" && req.method === "GET") {
      send(res, 200, { mode: auth.mode, twitchClientId: ctx.twitchClientId ?? null });
      return true;
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      auth.logout(req.headers.cookie);
      send(res, 200, { ok: true }, { "Set-Cookie": auth.clearCookie() });
      return true;
    }
    if (!/^\/api\/login\/(code|twitch)$/.test(url.pathname) || req.method !== "POST") return false;
    if (req.headers["x-vigia"] !== "1") {
      send(res, 403, { error: "Missing X-Vigia header" });
      return true;
    }
    const body = await readJson(req);
    const r = url.pathname.endsWith("code")
      ? auth.loginWithCode(String(body.code ?? ""))
      : await auth.loginWithTwitch(String(body.token ?? ""));
    if (!r.ok) send(res, 401, { error: r.error });
    else send(res, 200, { user: r.user }, { "Set-Cookie": auth.cookie(r.sessionId, secure) });
    return true;
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      if (await login(req, res, url)) return true;
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.path.exec(url.pathname);
        if (!match) continue;
        const g = auth.guard(authRequest(req), { write: route.write, role: route.role });
        if (!g.ok) {
          send(res, g.status, { error: g.error });
          return true;
        }
        send(res, 200, await route.handler({ req, res, user: g.user, params: match.slice(1), url }));
        return true;
      }
      send(res, 404, { error: "Not found" });
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message, ...e.extra });
      else send(res, 502, { error: (e as Error).message });
    }
    return true;
  };
}
