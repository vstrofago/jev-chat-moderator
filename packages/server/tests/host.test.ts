import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatAuthor, ChatMessage, Engine } from "@vigia/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startVigia, type ChatSource } from "../src/host";

const EXAMPLE = `version: 1
rules:
  - { id: spam, pack: spam, action: delete }
  - { id: q, pack: questions, action: highlight }
`;

const mod: ChatAuthor = { id: "m", login: "mod", displayName: "Mod", broadcaster: false, moderator: true, vip: false };
const msg = (text: string, author = mod): ChatMessage => ({ id: `id-${text}`, text, author, fragments: [{ type: "text", text }] });

let dir: string;
let engineRef: Engine | undefined;
const replies: string[] = [];

const fakeSource: ChatSource = {
  platform: {
    deleteMessage: async () => {},
    timeout: async () => {},
    sendChat: async (t) => void replies.push(t),
  },
  connect(engine) {
    engineRef = engine;
    return { close() {} };
  },
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-host-"));
  await mkdir(join(dir, "ui", "assets"), { recursive: true });
  await writeFile(join(dir, "ui", "overlay.html"), "<html>overlay page</html>");
  await writeFile(join(dir, "ui", "login.html"), "<html>login page</html>");
  await writeFile(join(dir, "ui", "assets", "overlay.js"), "console.log(1)");
  replies.length = 0;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const start = () =>
  startVigia({
    configPath: join(dir, "vigia.yaml"),
    dataDir: join(dir, "data"),
    uiDir: join(dir, "ui"),
    exampleText: EXAMPLE,
    source: fakeSource,
    evaluate: async (_s, q) => Object.fromEntries(Object.keys(q).map((id) => [id, 0])),
    port: 0,
    log: () => {},
  });

function connect(url: string) {
  const ws = new WebSocket(url);
  const messages: any[] = [];
  ws.on("message", (d) => messages.push(JSON.parse(String(d))));
  return { ws, messages };
}

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("startVigia", () => {
  it("serves health, and the overlay only with the right key", async () => {
    const v = await start();
    const base = v.url;
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/overlay`)).status).toBe(401);
    expect((await fetch(`${base}/overlay?key=wrong`)).status).toBe(401);
    const ok = await fetch(v.overlayUrl);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("overlay page");
    // OBS setups and preview tools may embed the overlay; the dashboard stays unframable.
    expect(ok.headers.get("x-frame-options")).toBeNull();
    expect((await fetch(`${base}/login`)).headers.get("x-frame-options")).toBe("DENY");
    expect((await fetch(`${base}/assets/overlay.js`)).status).toBe(200);
    expect((await fetch(`${base}/assets/../../vigia.yaml`)).status).toBe(404);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    await v.close();
  });

  it("refuses overlay websockets without the key", async () => {
    const v = await start();
    const ws = new WebSocket(`${v.url.replace("http", "ws")}/ws/overlay?key=wrong`);
    const status = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("open", () => resolve(101));
    });
    expect(status).toBe(401);
    await v.close();
  });

  it("pushes highlights and clears to connected overlays", async () => {
    const v = await start();
    const key = new URL(v.overlayUrl).searchParams.get("key");
    const c = connect(`${v.url.replace("http", "ws")}/ws/overlay?key=${key}`);
    await until(() => c.messages.length === 1);
    expect(c.messages[0]).toMatchObject({ type: "clear" });

    await engineRef!.handleMessage(msg('!vigia destaca "Sorteo a las 9"'));
    await until(() => c.messages.length === 2);
    expect(c.messages[1]).toMatchObject({ type: "show", item: { kind: "announcement", text: "Sorteo a las 9" } });

    await engineRef!.handleMessage(msg("!vigia limpia"));
    await until(() => c.messages.length === 3);
    expect(c.messages[2]).toMatchObject({ type: "clear" });
    c.ws.close();
    await v.close();
  });

  it("writes chat command changes back to vigia.yaml and keeps the overlay key", async () => {
    const v = await start();
    await engineRef!.handleMessage(msg("!vigia regla spam off"));
    await until(() => replies.length === 1);
    const text = await (async () => {
      for (let i = 0; i < 100; i++) {
        const t = await readFile(join(dir, "vigia.yaml"), "utf8");
        if (t.includes("enabled")) return t;
        await new Promise((r) => setTimeout(r, 20));
      }
      return "";
    })();
    expect(text).toContain("enabled: false");
    const first = v.overlayUrl;
    await v.close();

    const again = await start();
    expect(new URL(again.overlayUrl).searchParams.get("key")).toBe(new URL(first).searchParams.get("key"));
    expect(engineRef!.state().disabledRules).toEqual(["spam"]);
    await again.close();
  });

  it("records decisions in the local history", async () => {
    const v = await start();
    await engineRef!.handleMessage(msg("hello", { ...mod, moderator: false, id: "u" }));
    expect(v.store.recentDecisions(5).map((d) => d.text)).toEqual(["hello"]);
    await v.close();
  });
});
