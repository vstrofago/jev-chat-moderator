/** One piece of a chat message, as Twitch EventSub splits it. */
export type Fragment = { type: "text"; text: string } | { type: "emote"; text: string; id: string };

export interface ChatAuthor {
  id: string;
  login: string;
  displayName: string;
  broadcaster: boolean;
  moderator: boolean;
  vip: boolean;
}

/** A chat message, independent of the platform it came from. */
export interface ChatMessage {
  id: string;
  text: string;
  author: ChatAuthor;
  fragments: Fragment[];
  /** Set when the message is a reply to another one. */
  replyTo?: { id: string; text: string; authorLogin: string };
}

// Emoji, joiners, variation selectors, skin tones and flag letters. Digits and # are
// deliberately left out even though Unicode lists them as emoji components.
const EMOJI_OR_SPACE = /^[\s\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]*$/u;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

/** True when the message says nothing but emotes or emoji. */
export function isEmoteOnly(m: ChatMessage): boolean {
  let hasSymbol = false;
  for (const f of m.fragments) {
    if (f.type === "emote") hasSymbol = true;
    else if (!EMOJI_OR_SPACE.test(f.text)) return false;
    else if (EMOJI.test(f.text)) hasSymbol = true;
  }
  return hasSymbol;
}
