import { MODERATION_QUESTIONS, type BooleanQuestion } from "@vigia/core";
import type { PackName } from "./config";

export const PACK_KIND: Record<PackName, "moderation" | "highlight"> = {
  toxicity: "moderation",
  spam: "moderation",
  antispoiler: "moderation",
  questions: "highlight",
  interesting: "highlight",
};

/** The context the `state` sent to Jev can offer; see request.ts. */
const CONTEXT_NOTE =
  "`replying_to` (when present) is the message it answers, and `emotes` (when present) explains the emotes it uses.";

const PACKS: Record<PackName, BooleanQuestion> = {
  toxicity: {
    ...MODERATION_QUESTIONS.offensive,
    instructions: `${MODERATION_QUESTIONS.offensive.instructions} ${CONTEXT_NOTE}`,
  },
  spam: {
    type: "boolean",
    instructions: `Is this live-stream chat \`message\` spam? ${CONTEXT_NOTE}`,
    criteria: {
      true: "Scams, selling followers or viewers, unsolicited self-promotion or links to other channels, or meaningless flooding and copy-paste walls.",
      false: "Normal chat, even if short, repetitive hype (\"GG GG GG\"), emotes, or links the streamer asked for.",
    },
  },
  antispoiler: {
    type: "boolean",
    instructions:
      "Does this live-stream chat `message` reveal or hint at plot the streamer has not seen yet? " +
      "`spoiler_guard.work` is what they are playing or watching (unknown if missing). " +
      "`spoiler_guard.progress` (optional) is how far they are: only events after that point count. " +
      "`spoiler_guard.protected_topics` (optional) lists things that must not be revealed. " +
      CONTEXT_NOTE,
    criteria: {
      true: "Reveals or teases story events: deaths, betrayals, twists, hidden identities, the ending, who a boss really is, or hints like \"enjoy them while it lasts\" or \"wait until you see what happens\". Also any protected topic.",
      false: "Reactions to what is on screen now, gameplay tips about mechanics, questions, jokes, or talk about parts the streamer has already passed.",
    },
  },
  questions: {
    type: "boolean",
    instructions: `Is this live-stream chat \`message\` a question for the streamer? ${CONTEXT_NOTE}`,
    criteria: {
      true: "A genuine question addressed to the streamer: about the game, their setup, their opinion or their life, that they could answer on stream.",
      false: "Statements, reactions, rhetorical questions, questions to other viewers, or questions only a moderator can answer.",
    },
  },
  interesting: {
    type: "boolean",
    instructions: `Would the streamer want to see this live-stream chat \`message\` highlighted on stream? ${CONTEXT_NOTE}`,
    criteria: {
      true: "Notable: a milestone (first time here, a long follow anniversary), a heartfelt thank-you, a genuinely useful tip the streamer asked for, or a funny message that stands out.",
      false: "Ordinary chat: greetings, short reactions, emotes, hype, repeated jokes, or anything negative.",
    },
  },
};

export function packQuestion(pack: PackName): BooleanQuestion {
  return PACKS[pack];
}
