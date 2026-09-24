import { readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { buildRequest, PACK_NAMES, type ChatMessage, type PackName } from "@vigia/engine";

export type Lang = "en" | "es";

export interface Example {
  text: string;
  /** What a careful human moderator would answer to the pack's question. */
  expect: boolean;
  replying_to?: string;
  /** Anti-spoiler context. */
  work?: string;
  progress?: string;
  topics?: string[];
}

export interface Dataset {
  pack: PackName;
  lang: Lang;
  file: string;
  examples: Example[];
}

export const DATA_DIR = new URL("../data/", import.meta.url);

/** Every `data/<pack>.<lang>.yaml`, validated. Throws with every problem at once. */
export function loadDatasets(dir: URL = DATA_DIR): Dataset[] {
  const problems: string[] = [];
  const sets: Dataset[] = [];
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort()) {
    const m = /^([a-z]+)\.(en|es)\.yaml$/.exec(file);
    if (!m || !PACK_NAMES.includes(m[1] as PackName)) {
      problems.push(`${file}: name it <pack>.<en|es>.yaml`);
      continue;
    }
    const raw = parse(readFileSync(new URL(file, dir), "utf8"));
    const examples: Example[] = Array.isArray(raw?.messages) ? raw.messages : [];
    examples.forEach((e, i) => {
      if (typeof e?.text !== "string" || !e.text.trim()) problems.push(`${file} #${i + 1}: text is required`);
      if (typeof e?.expect !== "boolean") problems.push(`${file} #${i + 1}: expect must be true or false`);
    });
    if (examples.length === 0) problems.push(`${file}: no messages`);
    sets.push({ pack: m[1] as PackName, lang: m[2] as Lang, file, examples });
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return sets;
}

/** The exact request the engine would send for this message with only this pack enabled. */
export function requestFor(pack: PackName, e: Example) {
  const m: ChatMessage = {
    id: "eval",
    text: e.text,
    author: { id: "1", login: "viewer", displayName: "viewer", broadcaster: false, moderator: false, vip: false },
    fragments: [{ type: "text", text: e.text }],
    ...(e.replying_to ? { replyTo: { id: "0", text: e.replying_to, authorLogin: "other" } } : {}),
  };
  const rule = { id: pack, pack, action: pack === "questions" || pack === "interesting" ? ("highlight" as const) : ("delete" as const) };
  return buildRequest(m, [rule], { category: e.work, progress: e.progress, protectedTopics: e.topics ?? [], emotes: {} });
}
