import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/args";

const env = { AI_GATEWAY_API_KEY: "vck_x" };

describe("parseCliArgs", () => {
  it("uses safe defaults", () => {
    expect(parseCliArgs(["--source", "observe:xqc"], env)).toEqual({
      ok: true,
      options: {
        configPath: "vigia.yaml",
        dataDir: "vigia-data",
        host: "127.0.0.1",
        port: 7777,
        source: { kind: "observe", channel: "xqc", rate: 1 },
        jev: { apiKey: "vck_x", provider: "gateway" },
      },
    });
  });

  it("reads the twitch source, a TypeSafe key and every flag", () => {
    const r = parseCliArgs(
      ["--source", "twitch", "--config", "/etc/vigia.yaml", "--data", "/data", "--host", "0.0.0.0", "--port", "8080"],
      { TYPESAFE_API_KEY: "ts_x", TWITCH_CLIENT_ID: "cid" },
    );
    expect(r).toMatchObject({
      ok: true,
      options: {
        configPath: "/etc/vigia.yaml",
        dataDir: "/data",
        host: "0.0.0.0",
        port: 8080,
        source: { kind: "twitch", clientId: "cid" },
        jev: { apiKey: "ts_x", provider: "typesafe" },
      },
    });
  });

  it("takes the observe rate and category", () => {
    const r = parseCliArgs(["--source", "observe:Ibai", "--rate", "2", "--category", "Just Chatting"], env);
    expect(r).toMatchObject({ ok: true, options: { source: { kind: "observe", channel: "ibai", rate: 2, category: "Just Chatting" } } });
  });

  it("explains what is missing", () => {
    expect(parseCliArgs([], env)).toMatchObject({ ok: false, error: expect.stringContaining("--source") });
    expect(parseCliArgs(["--source", "observe:x"], {})).toMatchObject({ ok: false, error: expect.stringContaining("AI_GATEWAY_API_KEY") });
    expect(parseCliArgs(["--source", "twitch"], env)).toMatchObject({ ok: false, error: expect.stringContaining("TWITCH_CLIENT_ID") });
    expect(parseCliArgs(["--source", "kick"], env)).toMatchObject({ ok: false, error: expect.stringContaining("--source") });
    expect(parseCliArgs(["--source", "observe:x", "--port", "abc"], env)).toMatchObject({ ok: false, error: expect.stringContaining("--port") });
  });
});
