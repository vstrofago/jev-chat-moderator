import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { createEngine, type ChatPlatform, type Engine, type Evaluator } from "@vigia/engine";
import { validateToken } from "@vigia/twitch";
import { WebSocketServer, type WebSocket } from "ws";
import { createApi } from "./api";
import { createAuth, type User } from "./auth";
import { openConfigFile } from "./config-file";
import { createHighlightQueue } from "./highlights";
import { createLogDedupe } from "./log-dedupe";
import { defaultSpoilerPackDir } from "./paths";
import { createSpoilerGuard } from "./spoiler-guard";
import { openStore } from "./store";
import { createUsageMeter, type UsageMeter } from "./usage";

/** Where chat comes from: Twitch for real, or a read-only channel for trying things out. */
export interface ChatSource {
  platform: ChatPlatform;
  /** Read-only sources can never act, whatever the config says. */
  forceObserve?: boolean;
  /** Needed for "Sign in with Twitch" on the dashboard. */
  identity?: { clientId: string; broadcasterId: string };
  connect(
    engine: Engine,
    on: { warning(text: string): void; status(text: string): void; moderators?(ids: string[]): void },
  ): { close(): void };
}

export interface VigiaOptions {
  configPath: string;
  dataDir: string;
  /** Built UI files (packages/ui/dist). */
  uiDir: string;
  exampleText: string;
  source: ChatSource;
  evaluate: Evaluator;
  /** 127.0.0.1 by default: only this machine can connect. */
  host?: string;
  port?: number;
  /** Defaults to local for loopback hosts and exposed for anything else. */
  authMode?: "local" | "exposed";
  /** Feed it from the evaluator's onUsage to get cost estimates. */
  usage?: UsageMeter;
  /** Community spoiler packs; earlier folders win. Defaults to <dataDir>/spoiler-packs, then the bundled ones. */
  spoilerPackDirs?: string[];
  validateTwitchToken?: (token: string) => Promise<{ userId: string; login: string; clientId: string } | null>;
  log?: (line: string) => void;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Runs Vigía: config file, engine, history, highlights, overlay, dashboard and its API. */
export async function startVigia(o: VigiaOptions) {
  const log = createLogDedupe(o.log ?? ((line: string) => console.log(line)));
  await mkdir(o.dataDir, { recursive: true });
  const store = openStore(join(o.dataDir, "vigia.db"));
  store.prune();
  const pruneTimer = setInterval(() => store.prune(), 3600_000);
  const usage = o.usage ?? createUsageMeter();

  function secret(key: string, make: () => string) {
    let value = store.setting<string>(key);
    if (!value) {
      value = make();
      store.setSetting(key, value);
    }
    return value;
  }
  const overlayToken = secret("overlayToken", () => randomBytes(24).toString("base64url"));
  const adminCode = secret("adminCode", () => Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(""));

  const file = await openConfigFile(o.configPath, {
    exampleText: o.exampleText,
    onChange: () => {
      configChanged();
      log(`Reloaded ${o.configPath}`);
    },
    onError: (errors) => {
      log(`${o.configPath} has errors; still using the previous rules:`);
      for (const e of errors) log(`  line ${e.line ?? "?"}: ${e.path || "(file)"} ${e.message}`);
    },
  });

  const engine = createEngine({
    config: file.config(),
    platform: o.source.platform,
    evaluate: o.evaluate,
    forceObserve: o.source.forceObserve,
  });

  function configChanged() {
    engine.setConfig(file.config());
    highlights.setSeconds(file.config().highlights.seconds);
  }

  const bindHost = o.host ?? "127.0.0.1";
  const auth = createAuth({
    mode: o.authMode ?? (LOOPBACK_HOSTS.has(bindHost) ? "local" : "exposed"),
    adminCode,
    clientId: o.source.identity?.clientId,
    broadcasterId: o.source.identity?.broadcasterId,
    validate: o.validateTwitchToken ?? ((t) => validateToken(t)),
  });

  // Connected clients
  const overlays = new Set<WebSocket>();
  const dashboards = new Map<WebSocket, User>();
  const send = (clients: Iterable<WebSocket>, msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) ws.send(data);
  };
  const toDashboards = (msg: unknown) => send(dashboards.keys(), msg);
  const highlightState = () => ({ type: "highlight", current: highlights.current(), waiting: highlights.waiting() });

  const highlights = createHighlightQueue({
    seconds: file.config().highlights.seconds,
    onShow: (item) => {
      send(overlays, { type: "show", item });
      toDashboards(highlightState());
    },
    onClear: () => {
      send(overlays, { type: "clear" });
      toDashboards(highlightState());
    },
  });

  const spoilers = createSpoilerGuard({
    engine,
    store,
    dirs: o.spoilerPackDirs ?? [join(o.dataDir, "spoiler-packs"), defaultSpoilerPackDir()],
    log,
    onChange: (status) => toDashboards({ type: "spoilers", ...status }),
  });
  spoilers.stateChanged();

  // Persist state changes (chat commands, dashboard) back to vigia.yaml, one write at a time.
  let persisting = Promise.resolve();
  engine.on((e) => {
    switch (e.type) {
      case "decision": {
        usage.message();
        if (e.applied) usage.action();
        const id = store.recordDecision(e);
        return toDashboards({ type: "decision", decision: store.decision(id) });
      }
      case "highlight":
        highlights.push(e.item);
        return toDashboards(highlightState());
      case "clear-highlight":
        return highlights.clear();
      case "warning":
        log(`! ${e.code}: ${e.detail}`);
        return toDashboards({ type: "warning", code: e.code, detail: e.detail });
      case "state": {
        const s = e.state;
        spoilers.stateChanged();
        toDashboards({ type: "state", state: s });
        const observe = o.source.forceObserve ? file.config().observe : s.observe;
        persisting = persisting
          .then(() => file.persistState({ observe, disabledRules: s.disabledRules, progress: s.progress }))
          .catch((err) => log(`Could not save ${o.configPath}: ${err.message}`));
      }
    }
  });
  const statsTimer = setInterval(() => toDashboards({ type: "stats", stats: usage.snapshot() }), 5000);

  const keyOk = (key: string | null) => {
    if (!key) return false;
    const a = Buffer.from(key);
    const b = Buffer.from(overlayToken);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const uiRoot = resolve(o.uiDir);
  const notFound = (res: ServerResponse) => res.writeHead(404).end("Not found");
  async function serveFile(res: ServerResponse, relative: string) {
    const path = resolve(uiRoot, relative);
    if (!path.startsWith(uiRoot + sep)) return notFound(res);
    try {
      const body = await readFile(path);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...(extname(path) === ".html" ? { "X-Frame-Options": "DENY" } : {}),
      });
      res.end(body);
    } catch {
      notFound(res);
    }
  }

  let overlayUrl = "";
  const api = createApi({
    auth,
    engine,
    store,
    file,
    highlights,
    platform: o.source.platform,
    usage,
    overlayUrl: () => overlayUrl,
    twitchClientId: o.source.identity?.clientId,
    configChanged,
    spoilers,
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (await api(req, res, url)) return;
    if (req.method !== "GET") return res.writeHead(405).end();
    switch (url.pathname) {
      case "/health":
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      case "/overlay":
      case "/overlay.html":
        if (!keyOk(url.searchParams.get("key"))) return res.writeHead(401).end("Missing or wrong overlay key");
        // The overlay is embedded by OBS, so it may be framed; skip the dashboard headers.
        return serveFile(res, "overlay.html");
      case "/login":
      case "/auth/callback":
        return serveFile(res, "login.html");
      case "/": {
        const g = auth.guard({ method: "GET", host: req.headers.host, cookie: req.headers.cookie }, {});
        if (!g.ok) {
          if (g.status === 401) return res.writeHead(302, { Location: "/login" }).end();
          return res.writeHead(403).end("Forbidden");
        }
        return serveFile(res, "index.html");
      }
    }
    if (url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.slice(1));
    notFound(res);
  });

  const wss = new WebSocketServer({ noServer: true });
  const refuse = (socket: import("node:stream").Duplex, status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/ws/overlay") {
      if (!keyOk(url.searchParams.get("key"))) return refuse(socket, "401 Unauthorized");
      return wss.handleUpgrade(req, socket, head, (ws) => {
        overlays.add(ws);
        ws.on("close", () => overlays.delete(ws));
        const current = highlights.current();
        ws.send(JSON.stringify(current ? { type: "show", item: current } : { type: "clear" }));
      });
    }
    if (url.pathname === "/ws/dashboard") {
      // WebSockets skip CORS: check the origin ourselves, then the session.
      if (!auth.originAllowed(req.headers.origin, req.headers.host)) return refuse(socket, "403 Forbidden");
      const g = auth.guard({ method: "GET", host: req.headers.host, cookie: req.headers.cookie }, {});
      if (!g.ok) return refuse(socket, g.status === 401 ? "401 Unauthorized" : "403 Forbidden");
      return wss.handleUpgrade(req, socket, head, (ws) => {
        dashboards.set(ws, g.user);
        ws.on("close", () => dashboards.delete(ws));
        ws.send(JSON.stringify({ type: "state", state: engine.state() }));
        ws.send(JSON.stringify(highlightState()));
      });
    }
    refuse(socket, "404 Not Found");
  });

  await new Promise<void>((r) => server.listen(o.port ?? 7777, bindHost, r));
  const { port } = server.address() as AddressInfo;
  const shownHost = LOOPBACK_HOSTS.has(bindHost) || bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost;
  const url = `http://${shownHost}:${port}`;
  overlayUrl = `${url}/overlay?key=${overlayToken}&lang=${file.config().language}`;

  const source = o.source.connect(engine, {
    warning: (t) => log(`! ${t}`),
    status: (t) => log(`[${t}]`),
    moderators: (ids) => {
      auth.setModerators(ids);
      // A mod removed on Twitch also loses the dashboard they have open.
      const current = new Set(ids);
      for (const [ws, user] of dashboards) if (user.role === "moderator" && !current.has(user.id)) ws.close();
    },
  });

  return {
    url,
    overlayUrl,
    /** Printed by the CLI: logs in as the broadcaster when the dashboard is exposed. */
    adminCode,
    authMode: auth.mode,
    engine,
    store,
    usage,
    spoilers,
    async close() {
      source.close();
      highlights.close();
      clearInterval(pruneTimer);
      clearInterval(statsTimer);
      log.close();
      for (const ws of [...overlays, ...dashboards.keys()]) ws.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      await persisting;
    await spoilers.settled();
      file.close();
      store.close();
    },
  };
}

export type Vigia = Awaited<ReturnType<typeof startVigia>>;
