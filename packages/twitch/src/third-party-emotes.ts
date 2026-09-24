import type { ChatMessage, Fragment } from "@vigia/engine";

/**
 * Channel and global emotes from 7TV, BTTV and FrankerFaceZ. Twitch sends these as plain
 * words, so without this list Jev would read "xqcF" or "KEKW" as gibberish or spam. These are
 * public APIs with no login, called from the streamer's own machine.
 */
export async function loadThirdPartyEmotes(twitchUserId: string, o: { fetch?: typeof fetch } = {}) {
  const doFetch = o.fetch ?? globalThis.fetch;
  /** Emote name → image URL. */
  const names = new Map<string, string>();
  const warnings: string[] = [];

  /** 404 means the channel has no account there, which is normal. */
  async function get(url: string): Promise<any | null> {
    const res = await doFetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const providers: [string, () => Promise<void>][] = [
    [
      "7TV",
      async () => {
        const global = await get("https://7tv.io/v3/emote-sets/global");
        const channel = await get(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
        for (const e of [...(global?.emotes ?? []), ...(channel?.emote_set?.emotes ?? [])]) {
          names.set(e.name, `https://cdn.7tv.app/emote/${e.id}/2x.webp`);
        }
      },
    ],
    [
      "BTTV",
      async () => {
        const global = await get("https://api.betterttv.net/3/cached/emotes/global");
        const channel = await get(`https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`);
        for (const e of [...(global ?? []), ...(channel?.channelEmotes ?? []), ...(channel?.sharedEmotes ?? [])]) {
          names.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
        }
      },
    ],
    [
      "FFZ",
      async () => {
        const global = await get("https://api.frankerfacez.com/v1/set/global");
        const channel = await get(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
        const defaults: number[] = global?.default_sets ?? [];
        const sets = [
          ...defaults.map((id) => global?.sets?.[String(id)]),
          ...Object.values(channel?.sets ?? {}),
        ] as { emoticons?: { name: string; urls: Record<string, string> }[] }[];
        for (const set of sets) {
          for (const e of set?.emoticons ?? []) names.set(e.name, e.urls["2"] ?? e.urls["1"]);
        }
      },
    ],
  ];

  await Promise.all(
    providers.map(async ([name, load]) => {
      try {
        await load();
      } catch (e) {
        warnings.push(`${name} emotes unavailable: ${(e as Error).message}`);
      }
    }),
  );
  return { names, warnings };
}

/** Splits text fragments so that known third-party emote words become emote fragments. */
export function withThirdPartyEmotes(m: ChatMessage, names: ReadonlyMap<string, string>): ChatMessage {
  if (names.size === 0) return m;
  const fragments: Fragment[] = [];
  let pending = "";
  const flush = () => {
    if (pending) fragments.push({ type: "text", text: pending });
    pending = "";
  };
  for (const f of m.fragments) {
    if (f.type === "emote") {
      flush();
      fragments.push(f);
      continue;
    }
    for (const part of f.text.split(/(\s+)/)) {
      if (part && names.has(part)) {
        flush();
        fragments.push({ type: "emote", text: part, id: `3p:${part}`, imageUrl: names.get(part) });
      } else pending += part;
    }
  }
  flush();
  return { ...m, fragments };
}
