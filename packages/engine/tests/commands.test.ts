import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands";
import { reply } from "../src/replies";

describe("parseCommand", () => {
  it("ignores normal chat", () => {
    expect(parseCommand("hola a todos")).toBeNull();
    expect(parseCommand("!vigiatest")).toBeNull();
    expect(parseCommand("I love !vigia pause")).toBeNull();
  });

  it.each([
    ["!vigia pause", { kind: "pause" }],
    ["!vigia pausa", { kind: "pause" }],
    ["!vigia resume", { kind: "resume" }],
    ["!vigia sigue", { kind: "resume" }],
    ["!vigia status", { kind: "status" }],
    ["!vigia estado", { kind: "status" }],
    ["!vigia clear", { kind: "clear" }],
    ["!vigia limpia", { kind: "clear" }],
    ["!VIGIA PAUSE", { kind: "pause" }],
    ["  !vigia   pause  ", { kind: "pause" }],
  ])("parses %s", (text, cmd) => {
    expect(parseCommand(text)).toEqual(cmd);
  });

  it("parses progress with straight, curly or no quotes", () => {
    expect(parseCommand('!vigia progress "just reached Liurnia"')).toEqual({ kind: "progress", text: "just reached Liurnia" });
    expect(parseCommand("!vigia progreso “llegó a Liurnia”")).toEqual({ kind: "progress", text: "llegó a Liurnia" });
    expect(parseCommand("!vigia progreso capítulo 3")).toEqual({ kind: "progress", text: "capítulo 3" });
  });

  it("parses rule toggles in both languages", () => {
    expect(parseCommand("!vigia rule backseat off")).toEqual({ kind: "rule", id: "backseat", enabled: false });
    expect(parseCommand("!vigia regla backseat on")).toEqual({ kind: "rule", id: "backseat", enabled: true });
    expect(parseCommand("!vigia regla backseat no")).toEqual({ kind: "rule", id: "backseat", enabled: false });
    expect(parseCommand("!vigia regla backseat si")).toEqual({ kind: "rule", id: "backseat", enabled: true });
    expect(parseCommand("!vigia regla backseat sí")).toEqual({ kind: "rule", id: "backseat", enabled: true });
  });

  it("parses highlight with and without text", () => {
    expect(parseCommand("!vigia highlight")).toEqual({ kind: "highlight" });
    expect(parseCommand('!vigia destaca "Sorteo a las 9pm 🎉"')).toEqual({ kind: "highlight", text: "Sorteo a las 9pm 🎉" });
  });

  it("strips the @mention Twitch puts in front of replies", () => {
    expect(parseCommand("@bob !vigia destaca")).toEqual({ kind: "highlight" });
    expect(parseCommand("@Some_User123 !vigia pause")).toEqual({ kind: "pause" });
  });

  it("marks malformed commands as invalid", () => {
    expect(parseCommand("!vigia")).toEqual({ kind: "invalid" });
    expect(parseCommand("!vigia foo")).toEqual({ kind: "invalid" });
    expect(parseCommand("!vigia rule x maybe")).toEqual({ kind: "invalid" });
    expect(parseCommand("!vigia rule")).toEqual({ kind: "invalid" });
    expect(parseCommand("!vigia progress")).toEqual({ kind: "invalid" });
    expect(parseCommand('!vigia progress ""')).toEqual({ kind: "invalid" });
  });
});

describe("reply", () => {
  it("speaks the configured language", () => {
    expect(reply("en", "paused")).not.toBe(reply("es", "paused"));
    expect(reply("es", "paused")).toMatch(/pausa/i);
  });

  it("fills in variables", () => {
    expect(reply("en", "unknownRule", { id: "backseat" })).toContain("backseat");
    const status = reply("es", "status", { rules: "toxicity, questions", paused: "no", observe: "sí" });
    expect(status).toContain("toxicity, questions");
  });
});
