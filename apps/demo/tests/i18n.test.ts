import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";
import es from "../src/i18n/es.json";
import landingEn from "../src/i18n/landing.en.json";
import landingEs from "../src/i18n/landing.es.json";

describe.each([
  ["playground", es, en],
  ["landing", landingEs, landingEn],
] as const)("%s translations", (_name, spanish, english) => {
  it("have the same keys in Spanish and English", () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(spanish).sort());
  });

  it("have no empty strings", () => {
    const empty = [...Object.entries(spanish), ...Object.entries(english)].filter(([, v]) => !String(v).trim());
    expect(empty).toEqual([]);
  });
});
