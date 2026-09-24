import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { openTwitchSession } from "@vigia/twitch";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSecrets, type Secrets } from "../src/settings";
import { createSetupFlow, NeedsLogin, SetupError, sourceFromSettings, type TwitchLoginResult } from "../src/setup-flow";

let dir: string;
let secrets: Secrets;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-setup-"));
  secrets = await openSecrets(join(dir, "settings.json"), null);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A device login that shows a code, then finishes when told to. */
function fakeTwitch() {
  let finish: (login: string) => Promise<void> = async () => {};
  let fail: (e: Error) => void = () => {};
  const openSession = (async (o: Parameters<typeof openTwitchSession>[0]) => {
    const stored = await o.tokenStore!.load();
    if (stored) return { userId: "1", login: "stored", token: async () => "t", refresh: async () => "t" };
    o.onCode("https://www.twitch.tv/activate", "ABCD-EFGH", 30);
    return new Promise((resolve, reject) => {
      fail = reject;
      finish = async (login) => {
        await o.tokenStore!.save(JSON.stringify({ clientId: o.clientId, login }));
        resolve({ userId: "1", login, token: async () => "t", refresh: async () => "t" });
      };
    });
  }) as unknown as typeof openTwitchSession;
  return { openSession, finish: (login: string) => finish(login), fail: (e: Error) => fail(e) };
}

function flowWith(o: { good?: string[] } = {}) {
  const logins: TwitchLoginResult[] = [];
  const opened: string[] = [];
  const twitch = fakeTwitch();
  const flow = createSetupFlow({
    secrets,
    onLogin: (r) => logins.push(r),
    openExternal: (u) => opened.push(u),
    openSession: twitch.openSession,
    checkKey: async (k) => ((o.good ?? ["vck_good"]).includes(k) ? null : k === "offline" ? { code: "unreachable", detail: "no network" } : { code: "bad-key" }),
  });
  return { flow, logins, opened, twitch };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("createSetupFlow", () => {
  it("walks the read-only source to done", async () => {
    const { flow } = flowWith();
    expect(flow.state()).toEqual({ step: "source", weak: false });
    await expect(flow.chooseSource("observe", "Bad Name!")).rejects.toBeInstanceOf(SetupError);
    expect((await flow.chooseSource("observe", "xqc")).step).toBe("jev-key");
    expect(await flow.saveJevKey("nope")).toMatchObject({ ok: false, code: "bad-key" });
    expect(await flow.saveJevKey("offline")).toMatchObject({ ok: false, code: "unreachable", error: "no network" });
    const r = await flow.saveJevKey(" vck_good ");
    expect(r.ok && r.state.step).toBe("done");
    expect(secrets.get()).toMatchObject({ source: "observe", observeChannel: "xqc", jevKey: "vck_good" });
  });

  it("runs the Twitch app and device login steps", async () => {
    const { flow, logins, opened, twitch } = flowWith();
    await flow.chooseSource("twitch");
    await expect(flow.saveClientId("short")).rejects.toMatchObject({ code: "invalid-client-id" });
    expect((await flow.saveClientId("abcdefghij0123456789")).step).toBe("twitch-login");
    expect(await flow.startTwitchLogin()).toEqual({ uri: "https://www.twitch.tv/activate", code: "ABCD-EFGH", minutes: 30 });
    expect(opened).toEqual(["https://www.twitch.tv/activate"]);
    await twitch.finish("streamer");
    await settle();
    expect(logins).toEqual([{ ok: true, login: "streamer" }]);
    expect(flow.state().step).toBe("jev-key");
  });

  it("ignores a login that finishes after going back", async () => {
    const { flow, logins, twitch } = flowWith();
    await flow.chooseSource("twitch");
    await flow.saveClientId("abcdefghij0123456789");
    await flow.startTwitchLogin();
    expect((await flow.back()).step).toBe("twitch-app");
    await twitch.finish("late");
    await settle();
    expect(logins).toEqual([]);
    expect(secrets.get().twitchTokens).toBeUndefined();
  });

  it("reports a failed login, and reset keeps the key and port", async () => {
    const { flow, logins, twitch } = flowWith();
    await flow.chooseSource("twitch");
    await flow.saveClientId("abcdefghij0123456789");
    await flow.startTwitchLogin();
    twitch.fail(new Error("expired"));
    await settle();
    expect(logins).toEqual([{ ok: false, error: "expired" }]);
    await secrets.update({ jevKey: "vck_good", port: 7778 });
    expect((await flow.reset()).step).toBe("source");
    expect(secrets.get()).toEqual({ jevKey: "vck_good", port: 7778 });
  });
});

describe("sourceFromSettings", () => {
  it("builds the read-only source, and forgets a Twitch login that stopped working", async () => {
    await secrets.update({ source: "observe", observeChannel: "xqc" });
    expect((await sourceFromSettings(secrets, { log: () => {} })).forceObserve).toBe(true);

    await secrets.update({ source: "twitch", twitchClientId: "abcdefghij0123456789", twitchTokens: undefined });
    const openSession = (async (o: Parameters<typeof openTwitchSession>[0]) => {
      o.onCode("u", "c", 1);
      throw new Error("unreachable");
    }) as unknown as typeof openTwitchSession;
    await secrets.update({ twitchTokens: "{}" });
    await expect(sourceFromSettings(secrets, { log: () => {}, openSession })).rejects.toBeInstanceOf(NeedsLogin);
    expect(secrets.get().twitchTokens).toBeUndefined();
  });
});
