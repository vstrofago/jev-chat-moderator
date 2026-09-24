import type { ChatPlatform, Engine } from "@vigia/engine";
import { chatEventToMessage, connectEventSub, type EventSubHandlers } from "./eventsub";
import type { Helix } from "./helix";
import { loadThirdPartyEmotes, withThirdPartyEmotes } from "./third-party-emotes";

export interface TwitchIds {
  broadcasterId: string;
  /** The account that moderates and replies: the broadcaster, or a bot that is a mod. */
  actorId: string;
}

/** The engine's ChatPlatform on top of Helix. */
export function createTwitchPlatform(helix: Helix, ids: TwitchIds): ChatPlatform {
  return {
    deleteMessage: (messageId) => helix.deleteMessage(ids.broadcasterId, ids.actorId, messageId),
    timeout: (userId, seconds, reason) => helix.ban(ids.broadcasterId, ids.actorId, userId, { duration: seconds, reason }),
    sendChat: (text, replyToId) => helix.sendChat(ids.broadcasterId, ids.actorId, text, replyToId),
    ban: (userId, reason) => helix.ban(ids.broadcasterId, ids.actorId, userId, { reason }),
  };
}

export interface ConnectOptions extends TwitchIds {
  engine: Engine;
  helix: Helix;
  /** Load 7TV/BTTV/FFZ emotes for the channel (default true). */
  thirdPartyEmotes?: boolean;
  /** The current moderator ids, whenever they change (for dashboard login). */
  onModerators?(ids: ReadonlySet<string>): void;
  onStatus?: EventSubHandlers["status"];
  onWarning?(text: string): void;
  WebSocket?: typeof WebSocket;
  eventSubUrl?: string;
}

/** Feeds a channel's chat into the engine and keeps category and moderators up to date. */
export function connectTwitch(o: ConnectOptions) {
  const { engine, helix, broadcasterId, actorId } = o;
  const warn = (text: string) => o.onWarning?.(text);
  const moderators = new Set<string>();
  let emotes: ReadonlyMap<string, string> = new Map();
  let emotesLoaded = false;

  async function welcome(sessionId: string) {
    const channel = { broadcaster_user_id: broadcasterId };
    await helix.subscribe("channel.chat.message", "1", { ...channel, user_id: actorId }, sessionId);
    await helix.subscribe("channel.update", "2", channel, sessionId);
    await helix.subscribe("channel.moderator.add", "1", channel, sessionId);
    await helix.subscribe("channel.moderator.remove", "1", channel, sessionId);

    await Promise.all([
      helix.category(broadcasterId).then(
        (c) => engine.setCategory(c?.name, c?.id || undefined),
        (e) => warn(`Could not read the stream category: ${e.message}`),
      ),
      helix.moderatorIds(broadcasterId).then(
        (ids) => {
          moderators.clear();
          ids.forEach((id) => moderators.add(id));
          o.onModerators?.(moderators);
        },
        (e) => warn(`Could not read the moderator list: ${e.message}`),
      ),
      (async () => {
        if (o.thirdPartyEmotes === false || emotesLoaded) return;
        const loaded = await loadThirdPartyEmotes(broadcasterId);
        emotes = loaded.names;
        emotesLoaded = true;
        loaded.warnings.forEach(warn);
      })(),
    ]);
  }

  function notification(type: string, event: any) {
    switch (type) {
      case "channel.chat.message": {
        // A separate bot account must not evaluate its own replies.
        if (event.chatter_user_id === actorId && actorId !== broadcasterId) return;
        void engine.handleMessage(withThirdPartyEmotes(chatEventToMessage(event), emotes));
        return;
      }
      case "channel.update":
        return engine.setCategory(event.category_name || undefined, event.category_id || undefined);
      case "channel.moderator.add":
      case "channel.moderator.remove":
        if (type.endsWith("add")) moderators.add(event.user_id);
        else moderators.delete(event.user_id);
        return o.onModerators?.(moderators);
    }
  }

  return connectEventSub(
    {
      welcome,
      notification,
      revocation: (type, status) => warn(`Twitch revoked ${type} (${status}). Log in again to restore it.`),
      status: (s, detail) => o.onStatus?.(s, detail),
    },
    { WebSocket: o.WebSocket, url: o.eventSubUrl },
  );
}
