import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { isPackRule, parseConfig, type ConfigError, type RuntimeState, type VigiaConfig } from "@vigia/engine";
import { isMap, parseDocument } from "yaml";

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
  /** The file was edited outside Vigía and is valid. */
  onChange(config: VigiaConfig, text: string): void;
  /** The file was edited outside Vigía and is broken; the previous config stays active. */
  onError(errors: ConfigError[]): void;
  debounceMs?: number;
}

export type PersistedState = Pick<RuntimeState, "observe" | "disabledRules" | "progress">;

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
      const doc = parseDocument(text);
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
      if (!changed) return;

      const next = doc.toString();
      const r = parseConfig(next);
      if (!r.ok) throw new ConfigFileError(path, r.errors);
      text = next;
      config = r.config;
      await write(next);
    },

    close() {
      clearTimeout(timer);
      watcher.close();
    },
  };
}

export type ConfigFile = Awaited<ReturnType<typeof openConfigFile>>;
