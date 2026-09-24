import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeSpoilerTopics, findSpoilerPack, parseSpoilerPack, spoilerPackKey, summarizeSpoilerPack, type SpoilerPack } from "../src/spoiler-packs";

const PACK = `
version: 1
name: Example Quest
category_id: "12345"
category: Example Quest
topics:
  - who the narrator really is
checkpoints:
  - name: Chapter 1
    topics: [the mentor's fate]
  - name: Chapter 2
    topics: [the castle burns, the second villain]
  - name: Chapter 3
    topics: [the ending]
`;

const pack = (): SpoilerPack => {
  const r = parseSpoilerPack(PACK);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.pack;
};

describe("parseSpoilerPack", () => {
  it("reads a pack", () => {
    const p = pack();
    expect(p.name).toBe("Example Quest");
    expect(p.categoryId).toBe("12345");
    expect(p.checkpoints.map((c) => c.name)).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
  });

  it("explains what is wrong", () => {
    const r = parseSpoilerPack("version: 2\ntopics: oops\ncheckpoints:\n  - topics: [x]\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(
      expect.arrayContaining([
        "version: must be 1",
        "name: required",
        "category_id or category: one is required",
        "topics: must be a list",
        "checkpoints.0.name: required",
      ]),
    );
    expect(parseSpoilerPack("version: 1\nname: X\ncategory: X\n")).toEqual({ ok: false, errors: ["topics: the pack protects nothing"] });
    expect(parseSpoilerPack("a: [").ok).toBe(false);
  });

  it("accepts a numeric category id", () => {
    const r = parseSpoilerPack("version: 1\nname: X\ncategory_id: 512953\ntopics: [t]\n");
    expect(r.ok && r.pack.categoryId).toBe("512953");
  });
});

describe("findSpoilerPack", () => {
  it("prefers the id, falls back to the name, and takes the first match", () => {
    const a = { ...pack(), name: "A" };
    const b = { ...pack(), name: "B", categoryId: undefined };
    expect(findSpoilerPack([a, b], { id: "12345", name: "Other" })?.name).toBe("A");
    expect(findSpoilerPack([b, a], { name: "example QUEST" })?.name).toBe("B");
    expect(findSpoilerPack([a], { id: "999" })).toBeUndefined();
    expect(findSpoilerPack([a], {})).toBeUndefined();
  });

  it("keys checkpoints by id, or by name without one", () => {
    expect(spoilerPackKey(pack())).toBe("12345");
    expect(spoilerPackKey({ ...pack(), categoryId: undefined })).toBe("name:example quest");
  });
});

describe("activeSpoilerTopics", () => {
  it("protects everything without a checkpoint, and drops earlier parts with one", () => {
    const p = pack();
    expect(activeSpoilerTopics(p)).toHaveLength(5);
    expect(activeSpoilerTopics(p, "Unknown")).toHaveLength(5);
    expect(activeSpoilerTopics(p, "Chapter 2")).toEqual(["who the narrator really is", "the castle burns", "the second villain", "the ending"]);
    expect(activeSpoilerTopics(p, "Chapter 3")).toEqual(["who the narrator really is", "the ending"]);
  });

  it("summarizes without any topic", () => {
    const s = summarizeSpoilerPack(pack());
    expect(s).toEqual({ name: "Example Quest", checkpoints: ["Chapter 1", "Chapter 2", "Chapter 3"], topicCount: 5 });
    expect(JSON.stringify(s)).not.toContain("castle");
  });
});

describe("the repository's spoiler-packs folder", () => {
  const dir = new URL("../../../spoiler-packs/", import.meta.url);
  const files = readdirSync(dir).filter((n) => /\.ya?ml$/.test(n));

  it.each(files)("%s is a valid pack", (name) => {
    const r = parseSpoilerPack(readFileSync(new URL(name, dir), "utf8"));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("has at most one pack per category", () => {
    const keys = files
      .filter((n) => !n.startsWith("_"))
      .map((n) => parseSpoilerPack(readFileSync(new URL(n, dir), "utf8")))
      .flatMap((r) => (r.ok ? [spoilerPackKey(r.pack)] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
