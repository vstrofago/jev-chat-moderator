import { DatabaseSync } from "node:sqlite";
import type { EngineEvent, Outcome } from "@vigia/engine";

export interface StoredDecision {
  id: number;
  ts: number;
  messageId: string;
  authorLogin: string;
  authorName: string;
  text: string;
  outcome: Outcome;
  applied: boolean;
  /** The anti-spoiler rule flagged it: the UI must blur the text. */
  spoiler: boolean;
}

export interface StoreOptions {
  now?: () => number;
  /** Keep at most this many decisions (default 50,000). */
  maxRows?: number;
  /** Keep decisions for this long (default 7 days). */
  maxAgeMs?: number;
}

type DecisionEvent = Extract<EngineEvent, { type: "decision" }>;

/**
 * Local history on the streamer's machine: decisions (for the live feed and the uncertain
 * log) and settings that must not live in vigia.yaml (protected spoiler topics, tokens).
 * Uses Node's built-in SQLite, so there is no native module to package.
 */
export function openStore(path: string, o: StoreOptions = {}) {
  const now = o.now ?? Date.now;
  const maxRows = o.maxRows ?? 50_000;
  const maxAgeMs = o.maxAgeMs ?? 7 * 24 * 3600_000;
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      author_login TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      outcome_json TEXT NOT NULL,
      applied INTEGER NOT NULL,
      spoiler INTEGER NOT NULL,
      uncertain INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS decisions_ts ON decisions (ts);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const insert = db.prepare(`
    INSERT INTO decisions (ts, message_id, author_login, author_name, text, outcome_json, applied, spoiler, uncertain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const recent = db.prepare("SELECT * FROM decisions ORDER BY ts DESC, id DESC LIMIT ?");
  const recentUncertain = db.prepare("SELECT * FROM decisions WHERE uncertain = 1 ORDER BY ts DESC, id DESC LIMIT ?");
  const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
  const putSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const pruneOld = db.prepare("DELETE FROM decisions WHERE ts < ?");
  const pruneExtra = db.prepare(
    "DELETE FROM decisions WHERE id NOT IN (SELECT id FROM decisions ORDER BY ts DESC, id DESC LIMIT ?)",
  );

  const toDecision = (r: any): StoredDecision => ({
    id: Number(r.id),
    ts: Number(r.ts),
    messageId: r.message_id,
    authorLogin: r.author_login,
    authorName: r.author_name,
    text: r.text,
    outcome: JSON.parse(r.outcome_json),
    applied: r.applied === 1,
    spoiler: r.spoiler === 1,
  });

  return {
    recordDecision(e: DecisionEvent) {
      const { message: m, outcome } = e;
      insert.run(
        now(),
        m.id,
        m.author.login,
        m.author.displayName,
        m.text,
        JSON.stringify(outcome),
        e.applied ? 1 : 0,
        outcome.spoiler ? 1 : 0,
        outcome.uncertain.length > 0 ? 1 : 0,
      );
    },
    recentDecisions: (limit: number) => recent.all(limit).map(toDecision),
    uncertain: (limit: number) => recentUncertain.all(limit).map(toDecision),

    setting<T = unknown>(key: string): T | undefined {
      const row = getSetting.get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    setSetting(key: string, value: unknown) {
      putSetting.run(key, JSON.stringify(value));
    },

    /** Drops decisions older than the age limit or beyond the row limit; returns how many. */
    prune(): number {
      const old = Number(pruneOld.run(now() - maxAgeMs).changes);
      const extra = Number(pruneExtra.run(maxRows).changes);
      return old + extra;
    },

    close: () => db.close(),
  };
}

export type Store = ReturnType<typeof openStore>;
