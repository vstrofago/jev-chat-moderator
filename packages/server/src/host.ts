import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";
import { createEngine, type ChatPlatform, type Engine, type Evaluator, type HighlightItem } from "@vigia/engine";
import { WebSocketServer, type WebSocket } from "ws";
import { openConfigFile } from "./config-file";
import { createHighlightQueue } from "./highlights";
import { openStore } from "./store";

/** Where chat comes from: Twitch for real, or a read-only channel for trying things out. */
export interface ChatSource {
  platform: ChatPlatform;
  /** Read-only sources can never act, whatever the config says. */
  forceObserve?: boolean;
  connect(engine: Engine, on: { warning(text: string): void; status(text: string): void }): { close(): void };
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

/** Runs Vigía: config file, engine, history, highlight queue, and the overlay server. */
export async function startVigia(o: VigiaOptions) {
  const log = o.log ?? ((line: string) => console.log(line));
  await mkdir(o.dataDir, { recursive: true });
  const store = openStore(join(o.dataDir, "vigia.db"));
  store.prune();
  const pruneTimer = setInterval(() => store.prune(), 3600_000);

  let overlayToken = store.setting<string>("overlayToken");
  if (!overlayToken) {
    overlayToken = randomBytes(24).toString("base64url");
    store.setSetting("overlayToken", overlayToken);
  }

  const file = await openConfigFile(o.configPath, {
    exampleText: o.exampleText,
    onChange: (config) => {
      engine.setConfig(config);
      highlights.setSeconds(config.highlights.seconds);
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
  engine.setProtectedTopics(store.setting<string[]>("protectedTopics") ?? []);

  // Overlay clients
  const overlays = new Set<WebSocket>();
  const broadcast = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const ws of overlays) ws.send(data);
  };
  const highlights = createHighlightQueue({
    seconds: file.config().highlights.seconds,
    onShow: (item: HighlightItem) => broadcast({ type: "show", item }),
    onClear: () => broadcast({ type: "clear" }),
  });

  // Persist state changes (chat commands, dashboard) back to vigia.yaml, one write at a time.
  let persisting = Promise.resolve();
  engine.on((e) => {
    switch (e.type) {
      case "decision":
        return store.recordDecision(e);
      case "highlight":
        return highlights.push(e.item);
      case "clear-highlight":
        return highlights.clear();
      case "warning":
        return log(`! ${e.code}: ${e.detail}`);
      case "state": {
        const s = e.state;
        const observe = o.source.forceObserve ? file.config().observe : s.observe;
        persisting = persisting
          .then(() => file.persistState({ observe, disabledRules: s.disabledRules, progress: s.progress }))
          .catch((err) => log(`Could not save ${o.configPath}: ${err.message}`));
      }
    }
  });

  const keyOk = (key: string | null) => {
    if (!key) return false;
    const a = Buffer.from(key);
    const b = Buffer.from(overlayToken!);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const uiRoot = resolve(o.uiDir);
  async function serveFile(res: ServerResponse, relative: string) {
    const path = resolve(uiRoot, relative);
    if (!path.startsWith(uiRoot + sep)) return notFound(res);
    try {
      const body = await readFile(path);
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(body);
    } catch {
      notFound(res);
    }
  }
  const notFound = (res: ServerResponse) => res.writeHead(404).end("Not found");

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method !== "GET") return res.writeHead(405).end();
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/overlay" || url.pathname === "/overlay.html") {
      if (!keyOk(url.searchParams.get("key"))) return res.writeHead(401).end("Missing or wrong overlay key");
      return serveFile(res, "overlay.html");
    }
    if (url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.slice(1));
    notFound(res);
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws/overlay" || !keyOk(url.searchParams.get("key"))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      overlays.add(ws);
      ws.on("close", () => overlays.delete(ws));
      const current = highlights.current();
      ws.send(JSON.stringify(current ? { type: "show", item: current } : { type: "clear" }));
    });
  });

  await new Promise<void>((r) => server.listen(o.port ?? 7777, o.host ?? "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const shownHost = !o.host || o.host === "0.0.0.0" ? "127.0.0.1" : o.host;
  const url = `http://${shownHost}:${port}`;
  const overlayUrl = `${url}/overlay?key=${overlayToken}&lang=${file.config().language}`;

  const source = o.source.connect(engine, { warning: (t) => log(`! ${t}`), status: (t) => log(`[${t}]`) });

  return {
    url,
    overlayUrl,
    engine,
    store,
    async close() {
      source.close();
      highlights.close();
      clearInterval(pruneTimer);
      for (const ws of overlays) ws.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      await persisting;
      file.close();
      store.close();
    },
  };
}

export type Vigia = Awaited<ReturnType<typeof startVigia>>;
