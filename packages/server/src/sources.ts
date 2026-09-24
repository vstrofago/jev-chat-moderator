import type { ChatPlatform } from "@vigia/engine";
import {
  connectTwitch,
  createHelix,
  createRateGate,
  createTwitchPlatform,
  loadThirdPartyEmotes,
  readChannel,
  withThirdPartyEmotes,
  type TwitchSession,
} from "@vigia/twitch";
import type { ChatSource } from "./host";

const refuse = async () => {
  throw new Error("read-only source: chat actions are disabled");
};
const READ_ONLY: ChatPlatform = { deleteMessage: refuse, timeout: refuse, sendChat: refuse };

/**
 * Any public channel, read anonymously, always in observe mode. For trying Vigía (and the
 * overlay) without a Twitch app. Rate-limits Jev calls per second.
 */
export function observeSource(channel: string, o: { rate?: number; category?: string; WebSocket?: typeof WebSocket } = {}): ChatSource {
  return {
    platform: READ_ONLY,
    forceObserve: true,
    connect(engine, on) {
      const gate = createRateGate(o.rate ?? 1);
      let emotes: ReadonlyMap<string, string> = new Map();
      if (o.category) engine.setCategory(o.category);
      return readChannel(
        channel,
        {
          message: (m) => {
            if (gate.allow()) void engine.handleMessage(withThirdPartyEmotes(m, emotes));
          },
          room: async (id) => {
            const loaded = await loadThirdPartyEmotes(id);
            emotes = loaded.names;
            loaded.warnings.forEach(on.warning);
          },
          status: (s, detail) => on.status(`${s}${detail ? ` ${detail}` : ""}`),
          warning: on.warning,
        },
        { WebSocket: o.WebSocket },
      );
    },
  };
}

/** The streamer's own channel through their own Twitch app. */
export function twitchSource(session: TwitchSession, clientId: string): ChatSource {
  const helix = createHelix({ clientId, token: session.token, refresh: session.refresh });
  const ids = { broadcasterId: session.userId, actorId: session.userId };
  return {
    platform: createTwitchPlatform(helix, ids),
    connect(engine, on) {
      return connectTwitch({
        engine,
        helix,
        ...ids,
        onStatus: (s, detail) => on.status(`${s}${detail ? ` ${detail}` : ""}`),
        onWarning: on.warning,
      });
    },
  };
}
