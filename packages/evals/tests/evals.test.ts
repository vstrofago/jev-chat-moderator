import { PACK_NAMES } from "@vigia/engine";
import { describe, expect, it } from "vitest";
import { loadDatasets, requestFor } from "../src/dataset";
import { markdownTable, replaceBetweenMarkers, score, type Scored } from "../src/score";

describe("datasets", () => {
  const sets = loadDatasets();

  it("cover every pack in English and Spanish, with both answers", () => {
    for (const pack of PACK_NAMES)
      for (const lang of ["en", "es"]) {
        const s = sets.find((d) => d.pack === pack && d.lang === lang);
        expect(s, `${pack}.${lang}.yaml`).toBeDefined();
        expect(s!.examples.filter((e) => e.expect).length).toBeGreaterThanOrEqual(10);
        expect(s!.examples.filter((e) => !e.expect).length).toBeGreaterThanOrEqual(10);
      }
  });

  it("have no repeated messages", () => {
    for (const s of sets) expect(new Set(s.examples.map((e) => e.text)).size, s.file).toBe(s.examples.length);
  });

  it("build the same request the engine sends", () => {
    const r = requestFor("antispoiler", { text: "enjoy him while it lasts", expect: true, work: "RDR2", progress: "Chapter 2", topics: ["x"] });
    expect(Object.keys(r.questions)).toEqual(["antispoiler"]);
    expect(r.state).toMatchObject({ message: "enjoy him while it lasts", spoiler_guard: { work: "RDR2", progress: "Chapter 2", protected_topics: ["x"] } });
    expect(requestFor("questions", { text: "b", expect: false, replying_to: "a" }).state).toMatchObject({ replying_to: "a" });
  });
});

describe("score", () => {
  const row = (expect: boolean, p: number, text = `${expect}${p}`): Scored => ({ pack: "spam", lang: "en", text, expect, p });

  it("measures at the act threshold and counts the uncertain band", () => {
    const [m] = score([row(true, 0.9), row(true, 0.6), row(false, 0.95, "oops"), row(false, 0.1)]);
    expect(m).toMatchObject({ n: 4, accuracy: 0.5, precision: 0.5, recall: 0.5, uncertain: 0.25, falsePositives: ["oops"] });
    expect(score([row(false, 0.1)])[0].precision).toBeNull();
  });

  it("renders a table and replaces it between the markers", () => {
    const table = markdownTable(score([row(true, 0.9), row(false, 0.1)]), "en");
    expect(table).toContain("| `spam` | en | 2 | 100% | 100% | 100% | 0% |");
    expect(markdownTable([], "es")).toContain("Precisión");
    const doc = "a\n<!-- evals:start -->\nold\n<!-- evals:end -->\nb";
    expect(replaceBetweenMarkers(doc, "new")).toBe("a\n<!-- evals:start -->\nnew\n<!-- evals:end -->\nb");
    expect(replaceBetweenMarkers("no markers", "x")).toBeNull();
  });
});
