import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOCS = new URL("../src/content/docs/", import.meta.url);
const pages = (dir: URL) => readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

describe("docs", () => {
  it("have every page in both Spanish and English", () => {
    expect(pages(new URL("en/", DOCS))).toEqual(pages(DOCS));
  });

  it("keep the eval markers that pnpm eval fills in", () => {
    for (const file of [new URL("accuracy.md", DOCS), new URL("en/accuracy.md", DOCS)]) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain("<!-- evals:start -->");
      expect(text).toContain("<!-- evals:end -->");
    }
  });
});
