import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import {
  isPackRule,
  parseConfig,
  type ConfigError,
  type ConfigResult,
  type Rule,
  type RuntimeState,
  type VigiaConfig,
} from "@vigia/engine";
import { isMap, isSeq, parseDocument, type Document } from "yaml";

export class ConfigFileError extends Error {
  override name = "ConfigFileError";
  constructor(
    public path: string,
    public errors: ConfigError[],
  ) {
    super(`${path} is not valid:\n${errors.map((e) => `  line ${e.line ?? "?"}: ${e.path || "(file)"} ${e.message}`).join("\n")}`);
  }
}

export interface ConfigFileOptions {
  /** Written when the file does not exist yet. */
  exampleText: string;
  /** The file was edited outside Vigia and is valid. */
  onChange(config: VigiaConfig, text: string): void;
  /** The file was edited outside Vigia and is broken; the previous config stays active. */
  onError(errors: ConfigError[]): void;
  debounceMs?: number;
}

export type PersistedState = Pick<RuntimeState, "observe" | "disabledRules" | "progress">;

/** A rule patch; `null` removes the key. */
export type RulePatch = { [K in "enabled" | "act" | "unsure" | "action" | "seconds" | "progress" | "work" | "question" | "yes" | "no"]?: unknown };

export interface SettingsPatch {
  language?: VigiaConfig["language"];
  observe?: boolean;
  highlights?: Partial<VigiaConfig["highlights"]>;
  exempt?: VigiaConfig["exempt"];
}

/**
 * `vigia.yaml`: the streamer's rules. Hand edits are picked up live; changes made from chat
 * or the dashboard are written back through the YAML document, so comments survive.
 */
export async function openConfigFile(path: string, o: ConfigFileOptions) {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, o.exampleText);
    text = o.exampleText;
  }
  const first = parseConfig(text);
  if (!first.ok) throw new ConfigFileError(path, first.errors);
  let config = first.config;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const name = basename(path);
  // Watch the folder, not the file: editors often save by replacing the file.
  const watcher: FSWatcher = watch(dirname(path), (_event, file) => {
    if (file !== name) return;
    clearTimeout(timer);
    timer = setTimeout(reload, o.debounceMs ?? 150);
  });

  async function reload() {
    let next: string;
    try {
      next = await readFile(path, "utf8");
    } catch {
      return; // mid-save; the next event will catch it
    }
    if (next === text) return; // our own write, or no real change
    text = next;
    const r = parseConfig(next);
    if (!r.ok) return o.onError(r.errors);
    config = r.config;
    o.onChange(config, next);
  }

  const missing = (id: string): ConfigResult => ({ ok: false, errors: [{ path: "rules", message: `There is no rule "${id}"` }] });

  /**
   * Applies `mutate` to the YAML document (so comments survive), validates the result and
   * writes it. Invalid results leave the file untouched. `mutate` returns false for "no change".
   */
  async function edit(mutate: (doc: Document) => boolean): Promise<ConfigResult> {
    const doc = parseDocument(text);
    if (!mutate(doc)) return { ok: true, config };
    const next = doc.toString();
    const r = parseConfig(next);
    if (!r.ok) return r;
    if (next === text) return r;
    text = next;
    config = r.config;
    await write(next);
    return r;
  }

  async function write(next: string) {
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, next);
    await rename(tmp, path);
  }

  return {
    config: () => config,
    text: () => text,

    /** Writes observe mode, rule switches and anti-spoiler progress into the file. */
    async persistState(state: PersistedState): Promise<void> {
      const r = await edit((doc) => {
        let changed = false;
        const set = (path: (string | number)[], value: unknown) => {
          if (doc.getIn(path) === value) return;
          doc.setIn(path, value);
          changed = true;
        };
        const remove = (path: (string | number)[]) => {
          if (!doc.hasIn(path)) return;
          doc.deleteIn(path);
          changed = true;
        };
        // Observe is on by default, so a file that never mentions it stays untouched.
        if (doc.has("observe") || !state.observe) set(["observe"], state.observe);
        config.rules.forEach((rule, i) => {
          if (!isMap(doc.getIn(["rules", i], true))) return;
          if (state.disabledRules.includes(rule.id)) set(["rules", i, "enabled"], false);
          else remove(["rules", i, "enabled"]);
          if (isPackRule(rule) && rule.pack === "antispoiler") {
            if (state.progress) set(["rules", i, "progress"], state.progress);
            else remove(["rules", i, "progress"]);
          }
        });
        return changed;
      });
      if (!r.ok) throw new ConfigFileError(path, r.errors);
    },

    /** Patches one rule; `null` removes a key. */
    setRule(id: string, patch: RulePatch): Promise<ConfigResult> {
      const i = config.rules.findIndex((r) => r.id === id);
      if (i === -1) return Promise.resolve(missing(id));
      return edit((doc) => {
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          if (value === null || (key === "enabled" && value === true)) doc.deleteIn(["rules", i, key]);
          else doc.setIn(["rules", i, key], value);
        }
        return true;
      });
    },

    addRule(rule: Rule): Promise<ConfigResult> {
      return edit((doc) => {
        const rules = doc.get("rules", true);
        if (isSeq(rules)) rules.add(doc.createNode(rule));
        else doc.set("rules", doc.createNode([rule]));
        return true;
      });
    },

    removeRule(id: string): Promise<ConfigResult> {
      const i = config.rules.findIndex((r) => r.id === id);
      if (i === -1) return Promise.resolve(missing(id));
      return edit((doc) => {
        doc.deleteIn(["rules", i]);
        return true;
      });
    },

    setSettings(patch: SettingsPatch): Promise<ConfigResult> {
      return edit((doc) => {
        if (patch.language !== undefined) doc.set("language", patch.language);
        if (patch.observe !== undefined) doc.set("observe", patch.observe);
        if (patch.exempt !== undefined) doc.set("exempt", doc.createNode(patch.exempt, { flow: true }));
        for (const [key, value] of Object.entries(patch.highlights ?? {})) {
          if (value !== undefined) doc.setIn(["highlights", key], value);
        }
        return true;
      });
    },

    /** The raw editor: replaces the whole file, but only with valid rules. */
    async replaceText(next: string): Promise<ConfigResult> {
      const r = parseConfig(next);
      if (!r.ok) return r;
      text = next;
      config = r.config;
      await write(next);
      return r;
    },

    close() {
      clearTimeout(timer);
      watcher.close();
    },
  };
}

export type ConfigFile = Awaited<ReturnType<typeof openConfigFile>>;
