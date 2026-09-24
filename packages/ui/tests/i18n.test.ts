import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../src/i18n/", import.meta.url);
const load = (file: string): Record<string, string> => JSON.parse(readFileSync(new URL(file, dir), "utf8"));
const en = load("en.json");
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each(readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json"))("%s", (file) => {
  const other = load(file);

  it("has every English key and no extra ones", () => {
    expect(Object.keys(other).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in other))).toEqual([]);
  });

  it("keeps the same {placeholders}", () => {
    const wrong = Object.keys(en).filter((k) => k in other && vars(en[k]).join() !== vars(other[k]).join());
    expect(wrong).toEqual([]);
  });
});
