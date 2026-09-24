import type { ChatMessage, Fragment } from "@vigia/engine";

export interface IrcLine {
  tags: Record<string, string>;
  prefix?: string;
  command: string;
  params: string[];
}

const UNESCAPE: Record<string, string> = { s: " ", ":": ";", "\\": "\\", r: "\r", n: "\n" };

/** Parses one IRCv3 line as Twitch sends it (tags, prefix, command, params). */
export function parseIrcLine(line: string): IrcLine {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    for (const pair of rest.slice(1, end).split(";")) {
      const eq = pair.indexOf("=");
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const raw = eq === -1 ? "" : pair.slice(eq + 1);
      tags[key] = raw.replace(/\\(.)/g, (_, c: string) => UNESCAPE[c] ?? c);
    }
    rest = rest.slice(end + 1);
  }

  let prefix: string | undefined;
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ");
    prefix = rest.slice(1, end === -1 ? undefined : end);
    rest = end === -1 ? "" : rest.slice(end + 1);
  }

  const trailingAt = rest.indexOf(" :");
  const head = trailingAt === -1 ? rest : rest.slice(0, trailingAt);
  const [command = "", ...params] = head.split(" ").filter(Boolean);
  if (trailingAt !== -1) params.push(rest.slice(trailingAt + 2));

  return prefix === undefined ? { tags, command, params } : { tags, prefix, command, params };
}

/** Converts a PRIVMSG into a ChatMessage; returns null for any other line. */
export function toChatMessage(line: IrcLine): ChatMessage | null {
  if (line.command !== "PRIVMSG") return null;
  const text = line.params[1] ?? "";
  const login = line.prefix?.split("!")[0] ?? "";
  const badges = new Set((line.tags.badges ?? "").split(",").map((b) => b.split("/")[0]));
  const t = line.tags;

  const message: ChatMessage = {
    id: t.id ?? "",
    text,
    author: {
      id: t["user-id"] ?? "",
      login,
      displayName: t["display-name"] || login,
      broadcaster: badges.has("broadcaster"),
      moderator: badges.has("moderator"),
      vip: badges.has("vip"),
    },
    fragments: fragmentsOf(text, t.emotes ?? ""),
  };
  if (t["reply-parent-msg-id"]) {
    message.replyTo = {
      id: t["reply-parent-msg-id"],
      text: t["reply-parent-msg-body"] ?? "",
      authorLogin: t["reply-parent-user-login"] ?? "",
    };
  }
  return message;
}

/** Splits text into text and emote fragments. Twitch gives emote ranges in code points. */
function fragmentsOf(text: string, emotesTag: string): Fragment[] {
  const ranges: { id: string; start: number; end: number }[] = [];
  for (const group of emotesTag.split("/").filter(Boolean)) {
    const [id, positions = ""] = group.split(":");
    for (const pos of positions.split(",")) {
      const [start, end] = pos.split("-").map(Number);
      if (Number.isInteger(start) && Number.isInteger(end)) ranges.push({ id, start, end });
    }
  }
  if (ranges.length === 0) return [{ type: "text", text }];
  ranges.sort((a, b) => a.start - b.start);

  const chars = Array.from(text);
  const fragments: Fragment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) fragments.push({ type: "text", text: chars.slice(cursor, r.start).join("") });
    fragments.push({ type: "emote", text: chars.slice(r.start, r.end + 1).join(""), id: r.id });
    cursor = r.end + 1;
  }
  if (cursor < chars.length) fragments.push({ type: "text", text: chars.slice(cursor).join("") });
  return fragments;
}
