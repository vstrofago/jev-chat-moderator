import type { BooleanQuestion } from "@vigia/core";
import { isPackRule, type Rule } from "./config";
import type { ChatMessage } from "./message";
import { packQuestion } from "./packs";

export interface RequestContext {
  /** Current Twitch category, used when the anti-spoiler work is `auto`. */
  category?: string;
  /** Progress set at runtime (`!vigia progress`), which wins over the rule's. */
  progress?: string;
  /** Anti-spoiler topics added by mods; never shown to the streamer. */
  protectedTopics: string[];
  /** Meanings of the channel's own emotes, from the config. */
  emotes: Record<string, string>;
}

/** Meanings of common global Twitch emotes. Channel emotes come from the config. */
const GLOBAL_EMOTES: Record<string, string> = {
  Kappa: "sarcasm, joking",
  LUL: "laughing",
  BibleThump: "crying, sadness",
  Kreygasm: "excitement, delight",
  ResidentSleeper: "boredom",
  NotLikeThis: "frustration, disbelief",
  "4Head": "cheesy joke",
  DansGame: "disgust",
  SeemsGood: "approval",
  WutFace: "shock, horror",
  PJSalt: "salty, annoyed",
  SwiftRage: "anger",
  FailFish: "facepalm",
  HeyGuys: "greeting",
  VoHiYo: "cheerful greeting",
  "<3": "love",
};

/**
 * Builds the Jev call for one message: one yes/no question per rule, and a `state` with
 * only what the rules need. The author is never included.
 */
export function buildRequest(m: ChatMessage, rules: Rule[], ctx: RequestContext) {
  const questions: Record<string, BooleanQuestion> = {};
  const state: Record<string, unknown> = { message: m.text };

  if (m.replyTo) state.replying_to = m.replyTo.text;

  const emotes: Record<string, string> = {};
  for (const f of m.fragments) {
    if (f.type !== "emote") continue;
    const meaning = ctx.emotes[f.text] ?? GLOBAL_EMOTES[f.text];
    if (meaning) emotes[f.text] = meaning;
  }
  if (Object.keys(emotes).length > 0) state.emotes = emotes;

  for (const rule of rules) {
    if (!isPackRule(rule)) {
      questions[rule.id] = {
        type: "boolean",
        instructions: `About this live-stream chat \`message\`: ${rule.question}`,
        criteria: { true: rule.yes, false: rule.no },
      };
      continue;
    }
    questions[rule.id] = packQuestion(rule.pack);
    if (rule.pack === "antispoiler") {
      const guard: Record<string, unknown> = {};
      const work = !rule.work || rule.work === "auto" ? ctx.category : rule.work;
      const progress = ctx.progress ?? rule.progress;
      if (work) guard.work = work;
      if (progress) guard.progress = progress;
      if (ctx.protectedTopics.length > 0) guard.protected_topics = ctx.protectedTopics;
      state.spoiler_guard = guard;
    }
  }
  return { state, questions };
}
