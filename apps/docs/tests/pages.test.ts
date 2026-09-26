import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOCS = new URL("../src/content/docs/", import.meta.url);
const pages = (dir: URL) => readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

describe("docs", () => {
  it("have every page in both Spanish and English", () => {
    expect(pages(new URL("en/", DOCS))).toEqual(pages(DOCS));
  });
});
