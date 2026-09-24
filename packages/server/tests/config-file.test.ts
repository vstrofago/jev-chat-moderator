import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VigiaConfig } from "@vigia/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileError, openConfigFile } from "../src/config-file";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vigia-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const EXAMPLE = `# my rules
version: 1
observe: true
rules:
  # delete spam
  - id: spam
    pack: spam
    action: delete
  - id: sp
    pack: antispoiler
    action: delete
`;

describe("openConfigFile", () => {
  it("creates the file from the example when it is missing", async () => {
    const path = join(dir, "vigia.yaml");
    const file = await openConfigFile(path, { exampleText: EXAMPLE, onChange() {}, onError() {} });
    expect(await readFile(path, "utf8")).toBe(EXAMPLE);
    expect(file.config().rules.map((r) => r.id)).toEqual(["spam", "sp"]);
    file.close();
  });

  it("refuses to start from an invalid file, with line numbers", async () => {
    const path = join(dir, "vigia.yaml");
    await writeFile(path, "version: 1\nrules:\n  - {id: a, pack: nope, action: log}\n");
    const err = await openConfigFile(path, { exampleText: EXAMPLE, onChange() {}, onError() {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ConfigFileError);
    expect(err.errors[0]).toMatchObject({ path: "rules.0.pack", line: 3 });
  });

  it("picks up external edits, and keeps the old config when an edit is broken", async () => {
    const path = join(dir, "vigia.yaml");
    await writeFile(path, EXAMPLE);
    const changes: VigiaConfig[] = [];
    const errors: string[] = [];
    const file = await openConfigFile(path, {
      exampleText: EXAMPLE,
      onChange: (c) => void changes.push(c),
      onError: (e) => void errors.push(e[0].path),
    });

    await writeFile(path, EXAMPLE.replace("action: delete\n  - id: sp", "action: log\n  - id: sp"));
    await until(() => changes.length === 1);
    expect(changes[0].rules[0].action).toBe("log");

    await writeFile(path, "version: 1\nrules: [\n");
    await until(() => errors.length === 1);
    expect(file.config().rules[0].action).toBe("log");

    await writeFile(path, EXAMPLE);
    await until(() => changes.length === 2);
    expect(file.config().rules[0].action).toBe("delete");
    file.close();
  });

  it("writes runtime state back, keeping comments, without echoing its own write", async () => {
    const path = join(dir, "vigia.yaml");
    await writeFile(path, EXAMPLE);
    const changes: VigiaConfig[] = [];
    const file = await openConfigFile(path, { exampleText: EXAMPLE, onChange: (c) => void changes.push(c), onError() {} });

    await file.persistState({ observe: false, disabledRules: ["spam"], progress: "chapter 3" });
    const text = await readFile(path, "utf8");
    expect(text).toContain("# my rules");
    expect(text).toContain("# delete spam");
    expect(file.config()).toMatchObject({ observe: false });
    expect(file.config().rules[0]).toMatchObject({ id: "spam", enabled: false });
    expect(file.config().rules[1]).toMatchObject({ id: "sp", progress: "chapter 3" });

    await file.persistState({ observe: false, disabledRules: [], progress: undefined });
    const back = await readFile(path, "utf8");
    expect(back).not.toContain("enabled");
    expect(back).not.toContain("progress");

    await new Promise((r) => setTimeout(r, 400));
    expect(changes).toEqual([]);
    file.close();
  });

  it("does not touch the file when the state already matches", async () => {
    const path = join(dir, "vigia.yaml");
    await writeFile(path, EXAMPLE);
    const file = await openConfigFile(path, { exampleText: EXAMPLE, onChange() {}, onError() {} });
    await file.persistState({ observe: true, disabledRules: [], progress: undefined });
    expect(await readFile(path, "utf8")).toBe(EXAMPLE);
    file.close();

    const bare = join(dir, "bare.yaml");
    const minimal = "version: 1\nrules: []\n";
    await writeFile(bare, minimal);
    const f2 = await openConfigFile(bare, { exampleText: EXAMPLE, onChange() {}, onError() {} });
    await f2.persistState({ observe: true, disabledRules: [], progress: undefined });
    expect(await readFile(bare, "utf8")).toBe(minimal);
    f2.close();
  });
});

describe("config mutations", () => {
  const RULES = `# my rules
version: 1
rules:
  # delete spam
  - id: spam
    pack: spam
    action: delete
`;
  async function open() {
    const path = join(dir, "vigia.yaml");
    await writeFile(path, RULES);
    return { path, file: await openConfigFile(path, { exampleText: RULES, onChange() {}, onError() {} }) };
  }

  it("patches a rule and removes keys set to null", async () => {
    const { path, file } = await open();
    expect((await file.setRule("spam", { act: 0.9, action: "timeout", seconds: 30 })).ok).toBe(true);
    expect(file.config().rules[0]).toMatchObject({ act: 0.9, action: "timeout", seconds: 30 });
    await file.setRule("spam", { act: null, action: "delete", seconds: null });
    const text = await readFile(path, "utf8");
    expect(text).toContain("# delete spam");
    expect(text).not.toContain("act:");
    file.close();
  });

  it("rejects a patch that would make the file invalid, leaving it untouched", async () => {
    const { path, file } = await open();
    const r = await file.setRule("spam", { action: "timeout" });
    expect(r.ok).toBe(false);
    expect(await readFile(path, "utf8")).toBe(RULES);
    expect((await file.setRule("nope", { act: 0.5 })).ok).toBe(false);
    file.close();
  });

  it("adds and removes rules", async () => {
    const { file } = await open();
    const added = await file.addRule({ id: "backseat", question: "Backseating?", yes: "Advice", no: "Other", action: "log" });
    expect(added.ok).toBe(true);
    expect(file.config().rules.map((r) => r.id)).toEqual(["spam", "backseat"]);
    expect((await file.addRule({ id: "spam", pack: "toxicity", action: "log" })).ok).toBe(false);
    await file.removeRule("spam");
    expect(file.config().rules.map((r) => r.id)).toEqual(["backseat"]);
    file.close();
  });

  it("changes settings", async () => {
    const { file } = await open();
    await file.setSettings({ language: "es", observe: false, highlights: { mode: "approve", seconds: 8 }, exempt: ["broadcaster"] });
    expect(file.config()).toMatchObject({
      language: "es",
      observe: false,
      highlights: { mode: "approve", seconds: 8, includeBroadcaster: false },
      exempt: ["broadcaster"],
    });
    file.close();
  });

  it("replaces the whole text only when it is valid", async () => {
    const { path, file } = await open();
    expect((await file.replaceText("version: 1\nrules: [\n")).ok).toBe(false);
    expect(await readFile(path, "utf8")).toBe(RULES);
    expect((await file.replaceText("version: 1\nlanguage: es\n")).ok).toBe(true);
    expect(file.config().language).toBe("es");
    file.close();
  });
});
