import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  activeSpoilerTopics,
  findSpoilerPack,
  parseSpoilerPack,
  spoilerPackKey,
  summarizeSpoilerPack,
  type Engine,
  type SpoilerPack,
  type SpoilerPackSummary,
} from "@vigia/engine";
import type { Store } from "./store";

/**
 * Every pack in `dirs`, in order: earlier folders win when two packs match the same
 * category. Files starting with `_` (the template) are skipped; broken ones are logged.
 */
export async function loadSpoilerPacks(dirs: string[], log: (line: string) => void): Promise<SpoilerPack[]> {
  const packs: SpoilerPack[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n) && !n.startsWith("_")).sort();
    } catch {
      continue;
    }
    for (const n of names) {
      const r = parseSpoilerPack(await readFile(join(dir, n), "utf8").catch(() => ""));
      if (r.ok) packs.push(r.pack);
      else log(`Skipping spoiler pack ${join(dir, n)}: ${r.errors.join("; ")}`);
    }
  }
  return packs;
}

export interface SpoilerStatus {
  pack: SpoilerPackSummary | null;
  checkpoint: string | null;
}

/**
 * Keeps the engine's protected topics equal to the mods' hidden list plus the community
 * pack for the current category, from the chosen checkpoint on.
 */
export function createSpoilerGuard(o: {
  engine: Engine;
  store: Store;
  dirs: string[];
  log: (line: string) => void;
  onChange(status: SpoilerStatus): void;
}) {
  let pack: SpoilerPack | undefined;
  let categoryKey: string | null = null;
  let loading = Promise.resolve();

  const checkpointSetting = () => (pack ? `spoilerCheckpoint:${spoilerPackKey(pack)}` : "");
  const checkpoint = () => (pack ? (o.store.setting<string>(checkpointSetting()) ?? null) : null);
  const modTopics = () => o.store.setting<string[]>("protectedTopics") ?? [];

  let applied = "[]";
  function apply() {
    const topics = [...modTopics(), ...(pack ? activeSpoilerTopics(pack, checkpoint()) : [])];
    const key = JSON.stringify(topics);
    if (key === applied) return;
    applied = key;
    o.engine.setProtectedTopics(topics);
  }

  const status = (): SpoilerStatus => ({ pack: pack ? summarizeSpoilerPack(pack) : null, checkpoint: checkpoint() });

  /** Reads the folders again and picks the pack for the current category. */
  function reload() {
    loading = loading.then(async () => {
      const s = o.engine.state();
      const packs = await loadSpoilerPacks(o.dirs, o.log);
      pack = findSpoilerPack(packs, { id: s.categoryId, name: s.category });
      if (pack) o.log(`Community spoiler pack: ${pack.name}`);
      apply();
      o.onChange(status());
    });
    return loading;
  }

  return {
    reload,
    /** Call on every engine state change; reloads only when the category changed. */
    stateChanged() {
      const s = o.engine.state();
      const key = `${s.categoryId ?? ""}|${s.category ?? ""}`;
      if (key === categoryKey) return;
      categoryKey = key;
      void reload();
    },
    setModTopics(topics: string[]) {
      o.store.setSetting("protectedTopics", topics);
      apply();
    },
    /** Returns false when there is no pack or no such checkpoint. */
    setCheckpoint(name: string | null) {
      if (!pack || (name !== null && !pack.checkpoints.some((c) => c.name === name))) return false;
      o.store.setSetting(checkpointSetting(), name);
      apply();
      o.onChange(status());
      return true;
    },
    status,
    /** Resolves once pending reloads are done (tests, shutdown). */
    settled: () => loading,
  };
}

export type SpoilerGuard = ReturnType<typeof createSpoilerGuard>;
