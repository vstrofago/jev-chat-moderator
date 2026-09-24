import { describe, expect, it } from "vitest";
import type { Rule } from "../src/config";
import { isEmoteOnly, type ChatMessage, type Fragment } from "../src/message";
import { buildRequest, type RequestContext } from "../src/request";

function msg(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    text,
    author: { id: "u1", login: "viewer42", displayName: "Viewer42", broadcaster: false, moderator: false, vip: false },
    fragments: [{ type: "text", text }],
    ...extra,
  };
}

const ctx: RequestContext = { protectedTopics: [], emotes: {} };

describe("buildRequest", () => {
  it("asks one boolean question per rule, keyed by rule id", () => {
    const rules: Rule[] = [
      { id: "tox", pack: "toxicity", action: "delete" },
      { id: "q", pack: "questions", action: "highlight" },
    ];
    const { questions } = buildRequest(msg("hi"), rules, ctx);
    expect(Object.keys(questions)).toEqual(["tox", "q"]);
    expect(Object.values(questions).every((q) => q.type === "boolean")).toBe(true);
  });

  it("maps a custom rule's yes/no to the question criteria", () => {
    const rules: Rule[] = [{ id: "backseat", question: "Backseating?", yes: "Advice", no: "Other", action: "delete" }];
    const { questions } = buildRequest(msg("go left"), rules, ctx);
    expect(questions.backseat.instructions).toContain("Backseating?");
    expect(questions.backseat.criteria).toEqual({ true: "Advice", false: "Other" });
  });

  it("never sends the author", () => {
    const { state } = buildRequest(msg("hello"), [{ id: "q", pack: "questions", action: "highlight" }], ctx);
    expect(JSON.stringify(state)).not.toContain("viewer42");
    expect(JSON.stringify(state)).not.toContain("u1");
    expect(state).toEqual({ message: "hello" });
  });

  it("includes the parent text only for replies", () => {
    const reply = msg("@bob so true", { replyTo: { id: "m0", text: "this boss is hard", authorLogin: "bob" } });
    const { state } = buildRequest(reply, [{ id: "q", pack: "questions", action: "highlight" }], ctx);
    expect(state.replying_to).toBe("this boss is hard");
    expect(JSON.stringify(state)).not.toContain('"bob"');
  });

  it("sends meanings only for emotes present in the message", () => {
    const fragments: Fragment[] = [
      { type: "emote", text: "miCanalLlora", id: "e1" },
      { type: "text", text: " " },
      { type: "emote", text: "Kappa", id: "25" },
    ];
    const { state } = buildRequest(msg("miCanalLlora Kappa", { fragments }), [{ id: "q", pack: "questions", action: "highlight" }], {
      ...ctx,
      emotes: { miCanalLlora: "sadness", otherEmote: "unused" },
    });
    expect(state.emotes).toEqual({ miCanalLlora: "sadness", Kappa: expect.any(String) });
  });

  it("uses the Twitch category when antispoiler work is auto", () => {
    const rules: Rule[] = [{ id: "sp", pack: "antispoiler", action: "delete", work: "auto" }];
    const { state } = buildRequest(msg("x"), rules, { ...ctx, category: "Elden Ring" });
    expect(state.spoiler_guard).toEqual({ work: "Elden Ring" });
  });

  it("prefers runtime progress over the rule's progress, and passes protected topics", () => {
    const rules: Rule[] = [{ id: "sp", pack: "antispoiler", action: "delete", work: "Hades", progress: "old" }];
    const { state } = buildRequest(msg("x"), rules, { ...ctx, progress: "new", protectedTopics: ["the ending"] });
    expect(state.spoiler_guard).toEqual({ work: "Hades", progress: "new", protected_topics: ["the ending"] });
  });

  it("omits spoiler_guard without an antispoiler rule", () => {
    const { state } = buildRequest(msg("x"), [{ id: "q", pack: "questions", action: "highlight" }], {
      ...ctx,
      category: "Elden Ring",
      protectedTopics: ["secret"],
    });
    expect(state.spoiler_guard).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain("secret");
  });
});

describe("isEmoteOnly", () => {
  const emote = (text: string): Fragment => ({ type: "emote", text, id: text });
  const text = (t: string): Fragment => ({ type: "text", text: t });

  it("is true for emotes and emoji only", () => {
    expect(isEmoteOnly(msg("", { fragments: [emote("BibleThump"), text(" "), emote("BibleThump")] }))).toBe(true);
    expect(isEmoteOnly(msg("😭😭 💀", { fragments: [text("😭😭 💀")] }))).toBe(true);
    expect(isEmoteOnly(msg("👍🏽", { fragments: [text("👍🏽")] }))).toBe(true);
  });

  it("is false when there are words, digits or nothing", () => {
    expect(isEmoteOnly(msg("1111"))).toBe(false);
    expect(isEmoteOnly(msg("", { fragments: [emote("Kappa"), text(" he dies")] }))).toBe(false);
    expect(isEmoteOnly(msg(""))).toBe(false);
    expect(isEmoteOnly(msg("   "))).toBe(false);
  });
});
