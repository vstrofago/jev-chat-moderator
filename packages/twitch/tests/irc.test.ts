import { describe, expect, it } from "vitest";
import { parseIrcLine, toChatMessage } from "../src/irc";

const privmsg = (tags: string, text: string, login = "ronni") =>
  parseIrcLine(`@${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #dallas :${text}`);

describe("parseIrcLine", () => {
  it("splits tags, prefix, command and params", () => {
    const line = parseIrcLine("@badge-info=;color=#0D4200;display-name=Ronni :ronni!ronni@ronni.tmi.twitch.tv PRIVMSG #dallas :Kappa Keepo Kappa");
    expect(line).toEqual({
      tags: { "badge-info": "", color: "#0D4200", "display-name": "Ronni" },
      prefix: "ronni!ronni@ronni.tmi.twitch.tv",
      command: "PRIVMSG",
      params: ["#dallas", "Kappa Keepo Kappa"],
    });
  });

  it("parses lines without tags or prefix", () => {
    expect(parseIrcLine("PING :tmi.twitch.tv")).toEqual({ tags: {}, command: "PING", params: ["tmi.twitch.tv"] });
    expect(parseIrcLine(":tmi.twitch.tv RECONNECT")).toEqual({ tags: {}, prefix: "tmi.twitch.tv", command: "RECONNECT", params: [] });
  });

  it("unescapes tag values", () => {
    const line = parseIrcLine("@reply-parent-msg-body=hello\\sthere\\:\\\\ok;x=a\\nb :t PRIVMSG #c :hi");
    expect(line.tags["reply-parent-msg-body"]).toBe("hello there;\\ok");
    expect(line.tags.x).toBe("a\nb");
  });
});

describe("toChatMessage", () => {
  it("maps ids, names and roles", () => {
    const m = toChatMessage(privmsg("id=abc;user-id=42;display-name=Ronni;badges=moderator/1,subscriber/12", "hola"));
    expect(m).toEqual({
      id: "abc",
      text: "hola",
      author: { id: "42", login: "ronni", displayName: "Ronni", broadcaster: false, moderator: true, vip: false },
      fragments: [{ type: "text", text: "hola" }],
    });
    const b = toChatMessage(privmsg("id=1;user-id=1;display-name=;badges=broadcaster/1,vip/1", "x"));
    expect(b?.author).toMatchObject({ displayName: "ronni", broadcaster: true, vip: true, moderator: false });
  });

  it("cuts emotes out by code point, even after emoji", () => {
    // "😂 Kappa hi Kappa": 😂 is one code point but two UTF-16 units.
    const m = toChatMessage(privmsg("id=1;user-id=1;emotes=25:2-6,11-15", "😂 Kappa hi Kappa"));
    expect(m?.fragments).toEqual([
      { type: "text", text: "😂 " },
      { type: "emote", text: "Kappa", id: "25" },
      { type: "text", text: " hi " },
      { type: "emote", text: "Kappa", id: "25" },
    ]);
  });

  it("orders emotes from several ids by position", () => {
    const m = toChatMessage(privmsg("id=1;user-id=1;emotes=1902:6-10/25:0-4", "Kappa Keepo"));
    expect(m?.fragments.map((f) => f.text)).toEqual(["Kappa", " ", "Keepo"]);
  });

  it("maps replies", () => {
    const m = toChatMessage(
      privmsg(
        "id=2;user-id=1;reply-parent-msg-id=p1;reply-parent-msg-body=how\\sdo\\syou\\sparry?;reply-parent-user-login=bob",
        "@bob just press L1",
      ),
    );
    expect(m?.replyTo).toEqual({ id: "p1", text: "how do you parry?", authorLogin: "bob" });
  });

  it("ignores everything that is not a chat message", () => {
    expect(toChatMessage(parseIrcLine("PING :tmi.twitch.tv"))).toBeNull();
    expect(toChatMessage(parseIrcLine("@room-id=1 :tmi.twitch.tv ROOMSTATE #dallas"))).toBeNull();
  });
});
