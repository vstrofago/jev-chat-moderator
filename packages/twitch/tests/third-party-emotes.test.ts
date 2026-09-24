import { isEmoteOnly, type ChatMessage } from "@vigia/engine";
import { describe, expect, it } from "vitest";
import { loadThirdPartyEmotes, withThirdPartyEmotes } from "../src/third-party-emotes";

const RESPONSES: Record<string, unknown> = {
  "https://7tv.io/v3/emote-sets/global": { emotes: [{ id: "7ez", name: "EZ" }] },
  "https://7tv.io/v3/users/twitch/42": { emote_set: { emotes: [{ id: "7a", name: "xqcF" }, { id: "7b", name: "KEKW" }] } },
  "https://api.betterttv.net/3/cached/emotes/global": [{ id: "bcat", code: "catJAM" }],
  "https://api.betterttv.net/3/cached/users/twitch/42": { channelEmotes: [{ id: "b1", code: "bttvOne" }], sharedEmotes: [{ id: "b2", code: "bttvShared" }] },
  "https://api.frankerfacez.com/v1/set/global": { default_sets: [3], sets: { "3": { emoticons: [{ id: 1, name: "ZreknarF", urls: { "1": "https://cdn.frankerfacez.com/emote/1/1", "2": "https://cdn.frankerfacez.com/emote/1/2" } }] }, "9": { emoticons: [{ id: 9, name: "notDefault", urls: { "1": "x" } }] } } },
  "https://api.frankerfacez.com/v1/room/id/42": { sets: { "100": { emoticons: [{ id: 100, name: "ffzChannel", urls: { "1": "https://cdn.frankerfacez.com/emote/100/1" } }] } } },
};

function fakeFetch(failing: string[] = []) {
  return (async (url: string) => {
    if (failing.some((f) => url.includes(f))) return new Response("nope", { status: 500 });
    const body = RESPONSES[url];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("loadThirdPartyEmotes", () => {
  it("collects global and channel emotes from 7TV, BTTV and FFZ", async () => {
    const { names, warnings } = await loadThirdPartyEmotes("42", { fetch: fakeFetch() });
    expect([...names.keys()].sort()).toEqual(["EZ", "KEKW", "ZreknarF", "bttvOne", "bttvShared", "catJAM", "ffzChannel", "xqcF"]);
    expect(warnings).toEqual([]);
    expect(names.get("xqcF")).toBe("https://cdn.7tv.app/emote/7a/2x.webp");
    expect(names.get("catJAM")).toBe("https://cdn.betterttv.net/emote/bcat/2x");
    expect(names.get("ZreknarF")).toBe("https://cdn.frankerfacez.com/emote/1/2");
    expect(names.get("ffzChannel")).toBe("https://cdn.frankerfacez.com/emote/100/1");
  });

  it("keeps what worked when a provider fails", async () => {
    const { names, warnings } = await loadThirdPartyEmotes("42", { fetch: fakeFetch(["betterttv"]) });
    expect(names.has("xqcF")).toBe(true);
    expect(names.has("catJAM")).toBe(false);
    expect(warnings).toEqual([expect.stringContaining("BTTV")]);
  });

  it("treats a channel without an account on a provider as having no emotes there", async () => {
    const { names, warnings } = await loadThirdPartyEmotes("999", { fetch: fakeFetch() });
    expect([...names.keys()].sort()).toEqual(["EZ", "ZreknarF", "catJAM"]);
    expect(warnings).toEqual([]);
  });
});

describe("withThirdPartyEmotes", () => {
  const msg = (text: string): ChatMessage => ({
    id: "1",
    text,
    author: { id: "u", login: "u", displayName: "u", broadcaster: false, moderator: false, vip: false },
    fragments: [{ type: "text", text }],
  });
  const names = new Map([["xqcF", "https://x/xqcF"], ["KEKW", "https://x/KEKW"]]);

  it("turns known emote words into emote fragments", () => {
    expect(withThirdPartyEmotes(msg("ur in the right lane xqcF"), names).fragments).toEqual([
      { type: "text", text: "ur in the right lane " },
      { type: "emote", text: "xqcF", id: "3p:xqcF", imageUrl: "https://x/xqcF" },
    ]);
  });

  it("makes messages of only third-party emotes emote-only", () => {
    expect(isEmoteOnly(withThirdPartyEmotes(msg("KEKW KEKW xqcF"), names))).toBe(true);
    expect(isEmoteOnly(withThirdPartyEmotes(msg("KEKW he dies"), names))).toBe(false);
  });

  it("matches whole words only, case-sensitively, and leaves Twitch emotes alone", () => {
    const m = msg("kekw KEKWW");
    expect(withThirdPartyEmotes(m, names).fragments).toEqual([{ type: "text", text: "kekw KEKWW" }]);
    const twitch: ChatMessage = { ...msg("Kappa KEKW"), fragments: [{ type: "emote", text: "Kappa", id: "25" }, { type: "text", text: " KEKW" }] };
    expect(withThirdPartyEmotes(twitch, names).fragments).toEqual([
      { type: "emote", text: "Kappa", id: "25" },
      { type: "text", text: " " },
      { type: "emote", text: "KEKW", id: "3p:KEKW", imageUrl: "https://x/KEKW" },
    ]);
  });
});
