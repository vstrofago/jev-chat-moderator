import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickPort } from "../src/ports";
import { openSecrets, type Cipher } from "../src/secrets";
import { nextStep } from "../src/setup-state";

// A reversible stand-in for safeStorage.
const cipher = (available = true): Cipher => ({
  available: () => available,
  encrypt: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
  decrypt: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString(),
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-desktop-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("openSecrets", () => {
  it("keeps settings encrypted on disk and reads them back", async () => {
    const path = join(dir, "secrets.json");
    const s = await openSecrets(path, cipher());
    await s.update({ jevKey: "vck_supersecret", source: "twitch" });
    expect(await readFile(path, "utf8")).not.toContain("vck_supersecret");
    const again = await openSecrets(path, cipher());
    expect(again.get()).toEqual({ jevKey: "vck_supersecret", source: "twitch" });
    expect(again.weak).toBe(false);
  });

  it("removes keys set to undefined, and starts empty from a damaged file", async () => {
    const path = join(dir, "secrets.json");
    const s = await openSecrets(path, cipher());
    await s.update({ jevKey: "k", twitchTokens: "t" });
    await s.update({ twitchTokens: undefined });
    expect(s.get()).toEqual({ jevKey: "k" });
    const other = await openSecrets(path, { ...cipher(), decrypt: () => "not json" });
    expect(other.get()).toEqual({});
  });

  it("says when the system has no keychain to protect them", async () => {
    const s = await openSecrets(join(dir, "secrets.json"), cipher(false));
    await s.update({ jevKey: "k" });
    expect(s.weak).toBe(true);
    expect((await openSecrets(join(dir, "secrets.json"), cipher(false))).get()).toEqual({ jevKey: "k" });
  });
});

describe("nextStep", () => {
  it("walks through source, Twitch app, login and Jev key", () => {
    expect(nextStep({})).toBe("source");
    expect(nextStep({ source: "twitch" })).toBe("twitch-app");
    expect(nextStep({ source: "twitch", twitchClientId: "cid" })).toBe("twitch-login");
    expect(nextStep({ source: "twitch", twitchClientId: "cid", twitchTokens: "{}" })).toBe("jev-key");
    expect(nextStep({ source: "twitch", twitchClientId: "cid", twitchTokens: "{}", jevKey: "k" })).toBe("done");
  });

  it("skips Twitch for the read-only source", () => {
    expect(nextStep({ source: "observe" })).toBe("source");
    expect(nextStep({ source: "observe", observeChannel: "xqc" })).toBe("jev-key");
    expect(nextStep({ source: "observe", observeChannel: "xqc", jevKey: "k" })).toBe("done");
  });
});

describe("pickPort", () => {
  it("keeps the remembered port when free, else the first free one near 7777", async () => {
    const free = (ports: number[]) => async (p: number) => ports.includes(p);
    expect(await pickPort(7780, free([7777, 7780]))).toBe(7780);
    expect(await pickPort(undefined, free([7779, 7780]))).toBe(7779);
    expect(await pickPort(7780, free([7777]))).toBe(7777);
    await expect(pickPort(undefined, free([]))).rejects.toThrow(/7777/);
  });
});
