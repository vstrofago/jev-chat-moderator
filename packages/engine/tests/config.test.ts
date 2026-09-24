import { describe, expect, it } from "vitest";
import { parseConfig, thresholdsFor, type ConfigResult } from "../src/config";

function errorsOf(r: ConfigResult) {
  if (r.ok) throw new Error("expected errors");
  return r.errors;
}

describe("parseConfig", () => {
  it("fills every default for a minimal file", () => {
    const r = parseConfig("version: 1\n");
    expect(r).toEqual({
      ok: true,
      config: {
        version: 1,
        language: "en",
        observe: true,
        defaults: { act: 0.85, unsure: 0.5 },
        exempt: ["broadcaster", "moderators", "vips"],
        highlights: { mode: "auto", seconds: 12, includeBroadcaster: false },
        emotes: {},
        rules: [],
      },
    });
  });

  it("parses pack and custom rules", () => {
    const r = parseConfig(`
version: 1
language: es
rules:
  - id: toxicity
    pack: toxicity
    action: timeout
    seconds: 60
  - id: spoilers
    pack: antispoiler
    action: delete
    work: auto
    progress: "just reached Liurnia"
  - id: backseat
    question: "Does it tell the streamer how to play?"
    yes: "Unrequested advice"
    no: "Anything else"
    action: delete
    act: 0.9
`);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.config.language).toBe("es");
    expect(r.config.rules).toEqual([
      { id: "toxicity", pack: "toxicity", action: "timeout", seconds: 60 },
      { id: "spoilers", pack: "antispoiler", action: "delete", work: "auto", progress: "just reached Liurnia" },
      {
        id: "backseat",
        question: "Does it tell the streamer how to play?",
        yes: "Unrequested advice",
        no: "Anything else",
        action: "delete",
        act: 0.9,
      },
    ]);
  });

  it("reports a bad action with its path and line", () => {
    const errors = errorsOf(parseConfig("version: 1\nrules:\n  - id: a\n    pack: spam\n    action: ban\n"));
    expect(errors).toEqual([
      { path: "rules.0.action", line: 5, message: "must be one of delete, timeout, highlight, log" },
    ]);
  });

  it("rejects duplicate rule ids", () => {
    const errors = errorsOf(
      parseConfig("version: 1\nrules:\n  - {id: a, pack: spam, action: log}\n  - {id: a, pack: toxicity, action: log}\n"),
    );
    expect(errors.map((e) => e.path)).toEqual(["rules.1.id"]);
  });

  it("requires seconds for timeout", () => {
    const errors = errorsOf(parseConfig("version: 1\nrules:\n  - {id: a, pack: spam, action: timeout}\n"));
    expect(errors.map((e) => e.path)).toEqual(["rules.0.seconds"]);
  });

  it("rejects unsure above act", () => {
    const errors = errorsOf(parseConfig("version: 1\ndefaults: {act: 0.5, unsure: 0.8}\n"));
    expect(errors.map((e) => e.path)).toEqual(["defaults.unsure"]);
  });

  it("allows only one antispoiler rule", () => {
    const errors = errorsOf(
      parseConfig(
        "version: 1\nrules:\n  - {id: a, pack: antispoiler, action: delete}\n  - {id: b, pack: antispoiler, action: log}\n",
      ),
    );
    expect(errors.map((e) => e.path)).toEqual(["rules.1.pack"]);
  });

  it("rejects a rule with both pack and question", () => {
    const errors = errorsOf(
      parseConfig("version: 1\nrules:\n  - {id: a, pack: spam, question: q, yes: y, no: n, action: log}\n"),
    );
    expect(errors.map((e) => e.path)).toEqual(["rules.0"]);
  });

  it("requires yes and no for custom questions", () => {
    const errors = errorsOf(parseConfig("version: 1\nrules:\n  - {id: a, question: q, action: log}\n"));
    expect(errors.map((e) => e.path)).toEqual(["rules.0.yes", "rules.0.no"]);
  });

  it("rejects unknown exempt roles and bad ids", () => {
    const errors = errorsOf(
      parseConfig("version: 1\nexempt: [mods]\nrules:\n  - {id: 'Bad Id', pack: spam, action: log}\n"),
    );
    expect(errors.map((e) => e.path)).toEqual(["exempt.0", "rules.0.id"]);
  });

  it("reads observe mode and per-rule enabled flags", () => {
    const r = parseConfig("version: 1\nobserve: false\nrules:\n  - {id: a, pack: spam, action: log, enabled: false}\n");
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.config.observe).toBe(false);
    expect(r.config.rules[0]).toMatchObject({ id: "a", enabled: false });
    const bad = parseConfig("version: 1\nobserve: maybe\nrules:\n  - {id: a, pack: spam, action: log, enabled: 1}\n");
    expect(errorsOf(bad).map((e) => e.path)).toEqual(["observe", "rules.0.enabled"]);
  });

  it("returns syntax errors instead of throwing", () => {
    const errors = errorsOf(parseConfig("version: 1\nrules: [\n"));
    expect(errors[0].path).toBe("");
    expect(errors[0].line).toBeGreaterThan(0);
  });

  it("requires version 1", () => {
    expect(errorsOf(parseConfig("rules: []\n")).map((e) => e.path)).toEqual(["version"]);
  });
});

describe("thresholdsFor", () => {
  it("lets a rule override the defaults", () => {
    const defaults = { act: 0.85, unsure: 0.5 };
    expect(thresholdsFor({ id: "a", pack: "spam", action: "log", act: 0.9 }, defaults)).toEqual({ act: 0.9, unsure: 0.5 });
    expect(thresholdsFor({ id: "a", pack: "spam", action: "log" }, defaults)).toEqual(defaults);
  });
});
