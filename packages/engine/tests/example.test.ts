import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPackRule, parseConfig } from "../src/config";

describe("examples/vigia.yaml", () => {
  it("is a valid config with every bundled pack and a custom rule", () => {
    const r = parseConfig(readFileSync(new URL("../examples/vigia.yaml", import.meta.url), "utf8"));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const packs = r.config.rules.filter(isPackRule).map((rule) => rule.pack);
    expect(packs.sort()).toEqual(["antispoiler", "interesting", "questions", "spam", "toxicity"]);
    expect(r.config.rules.filter((rule) => !isPackRule(rule))).toHaveLength(1);
  });
});
