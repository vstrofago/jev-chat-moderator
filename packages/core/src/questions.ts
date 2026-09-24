import type { Category } from "./types";

/** Provider-neutral question shapes; jev-client.ts maps them to each wire format. */
export interface BooleanQuestion {
  type: "boolean";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion<K extends string = string> {
  type: "choice";
  instructions: string;
  criteria: Record<K, string>;
}

export type Question = BooleanQuestion | ChoiceQuestion;

export const MODERATION_QUESTIONS = {
  offensive: {
    type: "boolean",
    instructions:
      "Is this live-stream chat `message` insulting, harassing, hateful or threatening toward a person or group?",
    criteria: {
      true: "It attacks, demeans, harasses or threatens someone: the streamer, another viewer or a group of people.",
      false:
        "Normal chat, friendly banter, gamer slang (gg, ez, noob as a joke, 'I'll kill you next round'), or swearing that targets no one.",
    },
  },
  category: {
    type: "choice",
    instructions: "What kind of live-stream chat `message` is this?",
    criteria: {
      ok: "Normal chat: greetings, questions, reactions, emotes, banter or gamer slang with no real target.",
      insult: "Insults, mocks or demeans a specific person.",
      hate: "Attacks people for a group identity such as ethnicity, nationality, religion, gender or sexual orientation.",
      spam: "Spam: self-promotion, links to buy followers or viewers, scams, or repeated flooding.",
      threat: "A serious threat of real-world violence or harm, or doxxing.",
    } satisfies Record<Category, string>,
  },
} as const satisfies Record<string, Question>;
