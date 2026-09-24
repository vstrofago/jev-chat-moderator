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

/**
 * Meanings of common emotes: Twitch globals and the most used 7TV/BTTV/FFZ ones. Channel
 * emotes come from the config; any other emote is labelled "an emote" so Jev doesn't read
 * it as a word.
 */
const KNOWN_EMOTES: Record<string, string> = {
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
  KEKW: "laughing hard",
  OMEGALUL: "laughing hard",
  LULW: "laughing hard",
  ICANT: "laughing, can't take it",
  Pog: "excitement, amazement",
  PogU: "excitement, amazement",
  POGGERS: "excitement",
  monkaS: "nervous, scared",
  monkaW: "very scared",
  Sadge: "sadness",
  PepeHands: "sadness, crying",
  FeelsBadMan: "sadness",
  FeelsGoodMan: "happiness",
  FeelsStrongMan: "emotional but staying strong",
  catJAM: "vibing to music",
  Clap: "applause",
  EZ: "easy, gloating",
  "5Head": "smart, clever",
  Copium: "coping, denial",
  Aware: "ominous realization",
  Kappa2: "sarcasm",
  WeirdChamp: "disapproval, cringe",
  PauseChamp: "anticipation",
  HUH: "confusion",
  Stare: "staring, judging",
  peepoHappy: "happiness",
  widepeepoHappy: "happiness",
  GIGACHAD: "confident, admiration",
  Deadge: "dead, a death happened",
  RIPBOZO: "mocking someone's failure",
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
    emotes[f.text] = ctx.emotes[f.text] ?? KNOWN_EMOTES[f.text] ?? "an emote";
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
