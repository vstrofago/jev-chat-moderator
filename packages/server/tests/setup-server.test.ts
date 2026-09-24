import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSecrets, type Secrets } from "../src/settings";
import { startSetupServer } from "../src/setup-server";

let dir: string;
let secrets: Secrets;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-setup-server-"));
  await mkdir(join(dir, "ui", "assets"), { recursive: true });
  await writeFile(join(dir, "ui", "setup.html"), "<html>setup page</html>");
  await writeFile(join(dir, "ui", "assets", "setup.js"), "console.log(1)");
  secrets = await openSecrets(join(dir, "settings.json"), null);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function start(code?: string) {
  let finished = false;
  const setup = await startSetupServer({
    host: code ? "0.0.0.0" : "127.0.0.1",
    port: 0,
    uiDir: join(dir, "ui"),
    secrets,
    code,
    checkKey: async (k) => (k === "vck_good" ? null : { code: "bad-key" }),
    onFinish: () => {
      finished = true;
    },
    log: () => {},
  });
  const call = async (name: string, args: unknown[] = [], headers: Record<string, string> = {}) => {
    const res = await fetch(`${setup.url}/api/setup/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vigia": "1", ...headers },
      body: JSON.stringify(name === "unlock" ? { code: args[0] } : { args }),
    });
    return { status: res.status, body: await res.json() };
  };
  return { setup, call, finished: () => finished };
}

describe("startSetupServer", () => {
  it("serves the setup page and runs setup to the end", async () => {
    const { setup, call, finished } = await start();
    expect(await (await fetch(`${setup.url}/`)).text()).toContain("setup page");
    expect((await fetch(`${setup.url}/assets/setup.js`)).status).toBe(200);
    expect((await fetch(`${setup.url}/assets/../settings.json`)).status).toBe(404);
    expect(await (await fetch(`${setup.url}/health`)).json()).toEqual({ ok: true, setup: true, locked: false });

    expect((await call("state")).body.result).toEqual({ step: "source", weak: false });
    expect(await call("chooseSource", ["observe", "NOT OK"])).toMatchObject({ status: 400, body: { code: "invalid-channel" } });
    expect((await call("chooseSource", ["observe", "xqc"])).body.result.step).toBe("jev-key");
    expect((await call("finish")).status).toBe(409);
    expect((await call("saveJevKey", ["nope"])).body.result).toMatchObject({ ok: false, code: "bad-key" });
    expect((await call("saveJevKey", ["vck_good"])).body.result).toMatchObject({ ok: true, state: { step: "done" } });
    expect((await call("finish")).status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(finished()).toBe(true);
    await expect(fetch(`${setup.url}/health`)).rejects.toThrow();
    expect(secrets.get()).toMatchObject({ source: "observe", observeChannel: "xqc", jevKey: "vck_good" });
  });

  it("refuses calls without the X-Vigia header, other methods, and unexpected hosts", async () => {
    const { setup, call } = await start();
    expect((await call("state", [], { "X-Vigia": "0" })).status).toBe(403);
    expect((await fetch(`${setup.url}/api/setup/state`)).status).toBe(403);
    expect((await call("nope")).status).toBe(404);
    // fetch() cannot fake the Host header; a DNS-rebinding page would send its own name.
    const status = await new Promise<number>((done) => {
      request(`${setup.url}/`, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        done(res.statusCode ?? 0);
      }).end();
    });
    expect(status).toBe(403);
    await setup.close();
  });

  it("needs the setup code when other machines can reach it", async () => {
    const { setup, call } = await start("ABCDEFGH2345");
    expect(await (await fetch(`${setup.url}/health`)).json()).toMatchObject({ locked: true });
    expect((await call("state")).status).toBe(401);
    expect((await call("unlock", ["wrong"])).status).toBe(401);
    expect((await call("unlock", ["abcdefgh2345"])).status).toBe(200);
    expect((await call("state", [], { "X-Vigia-Code": "ABCDEFGH2345" })).body.result.step).toBe("source");
    await setup.close();
  });
});
