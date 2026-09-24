import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage, EngineEvent, Outcome } from "@vigia/engine";
import { describe, expect, it } from "vitest";
import { openStore } from "../src/store";

const DAY = 24 * 3600_000;

function decision(id: string, extra: Partial<Outcome> = {}, applied = false): Extract<EngineEvent, { type: "decision" }> {
  const message: ChatMessage = {
    id,
    text: `text ${id}`,
    author: { id: "u1", login: "viewer", displayName: "Viewer", broadcaster: false, moderator: false, vip: false },
    fragments: [{ type: "text", text: `text ${id}` }],
  };
  const outcome: Outcome = { verdicts: [], moderation: null, highlight: null, suggestion: null, uncertain: [], spoiler: false, ...extra };
  return { type: "decision", message, outcome, applied };
}

describe("openStore", () => {
  it("records decisions and reads them back newest first", () => {
    let now = 1000;
    const store = openStore(":memory:", { now: () => now });
    store.recordDecision(decision("a"));
    now = 2000;
    store.recordDecision(decision("b", { moderation: { ruleId: "spam", action: "delete", downgraded: false } }, true));
    const rows = store.recentDecisions(10);
    expect(rows.map((r) => r.messageId)).toEqual(["b", "a"]);
    expect(rows[0]).toMatchObject({
      ts: 2000,
      authorId: "u1",
      authorName: "Viewer",
      authorLogin: "viewer",
      text: "text b",
      applied: true,
      spoiler: false,
      resolved: null,
    });
    expect(rows[0].outcome.moderation?.ruleId).toBe("spam");
    store.close();
  });

  it("lists the uncertain log", () => {
    const store = openStore(":memory:");
    store.recordDecision(decision("a"));
    store.recordDecision(decision("b", { uncertain: [{ ruleId: "tox", action: "timeout", probability: 0.6, band: "unsure" }] }));
    expect(store.uncertain(10).map((r) => r.messageId)).toEqual(["b"]);
    store.close();
  });

  it("resolves uncertain entries so they leave the log", () => {
    const store = openStore(":memory:");
    const unsure = { uncertain: [{ ruleId: "tox", action: "timeout" as const, probability: 0.6, band: "unsure" as const }] };
    store.recordDecision(decision("a", unsure));
    store.recordDecision(decision("b", unsure));
    const [b, a] = store.uncertain(10);
    expect(store.decision(a.id)?.messageId).toBe("a");
    store.resolve(a.id, "applied");
    store.resolve(b.id, "dismissed");
    expect(store.uncertain(10)).toEqual([]);
    expect(store.decision(a.id)?.resolved).toBe("applied");
    expect(store.decision(999)).toBeUndefined();
    store.close();
  });

  it("keeps an audit trail of manual actions", () => {
    let now = 5;
    const store = openStore(":memory:", { now: () => now });
    store.recordAudit({ login: "mod1", role: "moderator", action: "timeout", target: "viewer", detail: "600 s" });
    now = 6;
    store.recordAudit({ login: "streamer", role: "broadcaster", action: "rule-off", target: "spam" });
    expect(store.audit(10)).toEqual([
      { ts: 6, login: "streamer", role: "broadcaster", action: "rule-off", target: "spam", detail: "" },
      { ts: 5, login: "mod1", role: "moderator", action: "timeout", target: "viewer", detail: "600 s" },
    ]);
    store.close();
  });

  it("prunes by age and by count", () => {
    let now = 0;
    const store = openStore(":memory:", { now: () => now, maxRows: 3 });
    for (const id of ["old1", "old2"]) store.recordDecision(decision(id));
    now = 8 * DAY;
    for (const id of ["n1", "n2", "n3", "n4"]) store.recordDecision(decision(id));
    expect(store.prune()).toBe(3);
    expect(store.recentDecisions(10).map((r) => r.messageId)).toEqual(["n4", "n3", "n2"]);
    store.close();
  });

  it("keeps settings across reopening", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vigia-store-"));
    const path = join(dir, "vigia.db");
    const a = openStore(path);
    a.setSetting("protectedTopics", ["the ending"]);
    a.setSetting("overlayToken", "abc");
    a.close();
    const b = openStore(path);
    expect(b.setting("protectedTopics")).toEqual(["the ending"]);
    expect(b.setting("overlayToken")).toBe("abc");
    expect(b.setting("missing")).toBeUndefined();
    b.close();
    await rm(dir, { recursive: true, force: true });
  });
});
