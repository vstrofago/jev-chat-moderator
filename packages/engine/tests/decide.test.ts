import { describe, expect, it } from "vitest";
import type { Rule } from "../src/config";
import { band, combine } from "../src/decide";

const defaults = { act: 0.85, unsure: 0.5 };
const rules: Rule[] = [
  { id: "tox", pack: "toxicity", action: "timeout", seconds: 60 },
  { id: "spam", pack: "spam", action: "delete" },
  { id: "sp", pack: "antispoiler", action: "delete" },
  { id: "q", pack: "questions", action: "highlight" },
  { id: "fun", pack: "interesting", action: "highlight" },
  { id: "note", question: "Mentions the sponsor?", yes: "y", no: "n", action: "log" },
];
const none = { emoteOnly: false };

describe("band", () => {
  it("splits at act and unsure", () => {
    expect(band(0.85, defaults)).toBe("act");
    expect(band(0.84, defaults)).toBe("unsure");
    expect(band(0.5, defaults)).toBe("unsure");
    expect(band(0.49, defaults)).toBe("none");
  });

  it("clamps unsure to act when it is set higher", () => {
    expect(band(0.7, { act: 0.7, unsure: 0.9 })).toBe("act");
    expect(band(0.69, { act: 0.7, unsure: 0.9 })).toBe("none");
  });
});

describe("combine", () => {
  it("does nothing when every rule is below unsure", () => {
    const o = combine({ tox: 0.1, spam: 0.2, q: 0.3 }, rules, defaults, none);
    expect(o).toMatchObject({ moderation: null, highlight: null, suggestion: null, uncertain: [], spoiler: false });
    expect(o.verdicts.map((v) => v.ruleId)).toEqual(["tox", "spam", "q"]);
  });

  it("lets timeout beat delete", () => {
    const o = combine({ tox: 0.9, spam: 0.99 }, rules, defaults, none);
    expect(o.moderation).toEqual({ ruleId: "tox", action: "timeout", seconds: 60, downgraded: false });
  });

  it("picks the more confident rule on a tie", () => {
    const tied: Rule[] = [
      { id: "a", pack: "spam", action: "delete" },
      { id: "b", pack: "toxicity", action: "delete" },
    ];
    expect(combine({ a: 0.9, b: 0.95 }, tied, defaults, none).moderation?.ruleId).toBe("b");
  });

  it("downgrades delete and timeout to log on emote-only messages", () => {
    const o = combine({ tox: 0.95 }, rules, defaults, { emoteOnly: true });
    expect(o.moderation).toEqual({ ruleId: "tox", action: "log", downgraded: true });
  });

  it("treats an acting log rule as moderation", () => {
    expect(combine({ note: 0.9 }, rules, defaults, none).moderation).toEqual({
      ruleId: "note",
      action: "log",
      downgraded: false,
    });
  });

  it("never highlights a moderated message", () => {
    const o = combine({ spam: 0.9, q: 0.99 }, rules, defaults, none);
    expect(o.moderation?.ruleId).toBe("spam");
    expect(o.highlight).toBeNull();
  });

  it("never highlights a message the anti-spoiler rule is unsure about", () => {
    const o = combine({ sp: 0.6, q: 0.99 }, rules, defaults, none);
    expect(o.spoiler).toBe(true);
    expect(o.moderation).toBeNull();
    expect(o.highlight).toBeNull();
    expect(o.suggestion).toBeNull();
  });

  it("collects unsure moderation rules in uncertain", () => {
    const o = combine({ tox: 0.6, spam: 0.7 }, rules, defaults, none);
    expect(o.moderation).toBeNull();
    expect(o.uncertain.map((v) => v.ruleId)).toEqual(["tox", "spam"]);
  });

  it("highlights the most confident acting highlight rule", () => {
    const o = combine({ q: 0.9, fun: 0.95 }, rules, defaults, none);
    expect(o.highlight?.ruleId).toBe("fun");
    expect(o.suggestion).toBeNull();
  });

  it("turns an unsure highlight into a suggestion", () => {
    const o = combine({ q: 0.6 }, rules, defaults, none);
    expect(o.highlight).toBeNull();
    expect(o.suggestion?.ruleId).toBe("q");
  });

  it("uses a rule's own act threshold", () => {
    const strict: Rule[] = [{ id: "s", pack: "spam", action: "delete", act: 0.95 }];
    const o = combine({ s: 0.9 }, strict, defaults, none);
    expect(o.moderation).toBeNull();
    expect(o.uncertain.map((v) => v.ruleId)).toEqual(["s"]);
  });

  it("skips rules without a probability", () => {
    expect(combine({}, rules, defaults, none).verdicts).toEqual([]);
  });
});
