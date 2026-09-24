import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import type { openTwitchSession } from "@vigia/twitch";
import type { Secrets } from "./settings";
import { createSetupFlow, SetupError, type JevKeyCheck, type TwitchLoginResult } from "./setup-flow";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const MAX_BODY = 16 * 1024;

export interface SetupServerOptions {
  host: string;
  port: number;
  /** Built UI files (packages/ui/dist): setup.html and its assets. */
  uiDir: string;
  secrets: Secrets;
  /** For tests: the Jev key check and the Twitch login. */
  checkKey?: JevKeyCheck;
  openSession?: typeof openTwitchSession;
  /**
   * When set (the server is reachable from other machines), every call needs this code,
   * printed in the logs, so nobody else can set Vigia up before its owner.
   */
  code?: string;
  /** Called once setup is complete and the page asked to start; the setup server is closed by then. */
  onFinish(): void;
  log(line: string): void;
}

/**
 * The setup page for the server and Docker: the same steps as the desktop window, over HTTP.
 * It runs until setup is finished, then gives its port to Vigia.
 */
export async function startSetupServer(o: SetupServerOptions) {
  const uiRoot = resolve(o.uiDir);
  let lastLogin: TwitchLoginResult | null = null;
  let finishing = false;
  const flow = createSetupFlow({
    secrets: o.secrets,
    checkKey: o.checkKey,
    openSession: o.openSession,
    onLogin: (r) => {
      lastLogin = r;
    },
  });

  const codeOk = (given: string | undefined) => {
    if (!o.code) return true;
    const a = Buffer.from(given ?? "");
    const b = Buffer.from(o.code);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  async function readJson(req: IncomingMessage): Promise<any> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new SetupHttpError(413, "Request too large");
      chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new SetupHttpError(400, "Invalid JSON");
    }
  }

  async function serveFile(res: ServerResponse, relative: string) {
    const path = resolve(uiRoot, relative);
    if (!path.startsWith(uiRoot + sep)) return res.writeHead(404).end("Not found");
    try {
      const body = await readFile(path);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...(extname(path) === ".html"
          ? {
              "X-Frame-Options": "DENY",
              "Content-Security-Policy":
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            }
          : {}),
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }

  // Each call is POST /api/setup/<name> with {args: [...]} and returns the flow's answer.
  const calls: Record<string, (...args: any[]) => unknown> = {
    state: () => flow.state(),
    chooseSource: (source, channel) => flow.chooseSource(source, channel),
    saveClientId: (clientId) => flow.saveClientId(clientId),
    startTwitchLogin: () => {
      lastLogin = null;
      return flow.startTwitchLogin();
    },
    // The page polls this while the streamer confirms the code on twitch.tv.
    twitchLogin: () => {
      const r = lastLogin;
      lastLogin = null;
      return r;
    },
    saveJevKey: (key) => flow.saveJevKey(key),
    back: () => flow.back(),
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Only loopback names when nothing else may reach it (DNS rebinding).
    if (!o.code && !LOOPBACK.test(req.headers.host ?? "")) return res.writeHead(403).end("Unexpected Host");

    if (url.pathname.startsWith("/api/setup/")) {
      const name = url.pathname.slice("/api/setup/".length);
      // A custom header can only come from the page itself: no form or other site can send it.
      if (req.method !== "POST" || req.headers["x-vigia"] !== "1") return send(res, 403, { error: "Forbidden" });
      if (name === "unlock") {
        const body = await readJson(req).catch(() => ({}));
        return codeOk(String(body.code ?? "").trim().toUpperCase()) ? send(res, 200, { ok: true }) : send(res, 401, { error: "Wrong setup code" });
      }
      if (!codeOk(req.headers["x-vigia-code"] as string | undefined)) return send(res, 401, { error: "locked" });
      try {
        if (name === "finish") {
          if (flow.state().step !== "done") return send(res, 409, { error: "Setup is not complete" });
          send(res, 200, { ok: true });
          if (!finishing) {
            finishing = true;
            // Free the port first: Vigia takes it next.
            setImmediate(() => void close().then(o.onFinish));
          }
          return;
        }
        const fn = Object.hasOwn(calls, name) ? calls[name] : undefined;
        if (!fn) return send(res, 404, { error: "No such setup call" });
        const body = await readJson(req);
        const args = Array.isArray(body.args) ? body.args : [];
        return send(res, 200, { result: (await fn(...args)) ?? null });
      } catch (e) {
        if (e instanceof SetupHttpError) return send(res, e.status, { error: e.message });
        if (e instanceof SetupError) return send(res, 400, { error: e.message, code: e.code });
        return send(res, 500, { error: (e as Error).message });
      }
    }

    if (req.method !== "GET") return res.writeHead(405).end();
    if (url.pathname === "/health") return send(res, 200, { ok: true, setup: true, locked: Boolean(o.code) });
    if (url.pathname === "/" || url.pathname === "/setup") return serveFile(res, "setup.html");
    if (url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.slice(1));
    res.writeHead(404).end("Not found");
  });

  await new Promise<void>((r, reject) => {
    server.once("error", reject);
    server.listen(o.port, o.host, () => r());
  });
  const { port } = server.address() as AddressInfo;
  const shownHost = LOOPBACK.test(o.host) || o.host === "0.0.0.0" ? "127.0.0.1" : o.host;

  function close() {
    return new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  }

  return { url: `http://${shownHost}:${port}`, port, close };
}

class SetupHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
