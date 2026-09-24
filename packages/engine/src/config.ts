import { isNode, LineCounter, parseDocument, type Document } from "yaml";

export const ACTIONS = ["delete", "timeout", "highlight", "log"] as const;
export type Action = (typeof ACTIONS)[number];

export const PACK_NAMES = ["toxicity", "spam", "antispoiler", "questions", "interesting"] as const;
export type PackName = (typeof PACK_NAMES)[number];

export const EXEMPT_ROLES = ["broadcaster", "moderators", "vips"] as const;
export type ExemptRole = (typeof EXEMPT_ROLES)[number];

export interface Thresholds {
  act: number;
  unsure: number;
}

interface RuleCommon {
  id: string;
  action: Action;
  /** False turns the rule off (also set by `!vigia rule <id> off`). */
  enabled?: boolean;
  /** Timeout length; required when `action` is `timeout`. */
  seconds?: number;
  act?: number;
  unsure?: number;
}

export interface PackRule extends RuleCommon {
  pack: PackName;
  /** Anti-spoiler: the work being played; `auto` (or unset) means the Twitch category. */
  work?: string;
  progress?: string;
}

export interface CustomRule extends RuleCommon {
  question: string;
  yes: string;
  no: string;
}

export type Rule = PackRule | CustomRule;

export interface VigiaConfig {
  version: 1;
  /** Language of the bot's chat replies. */
  language: "en" | "es";
  /** Log what would happen without acting in chat. On until the streamer trusts the rules. */
  observe: boolean;
  defaults: Thresholds;
  /** Roles skipped by moderation rules (highlights still apply). */
  exempt: ExemptRole[];
  highlights: { mode: "auto" | "approve"; seconds: number; includeBroadcaster: boolean };
  /** Meaning of the channel's own emotes, sent to Jev when they appear. */
  emotes: Record<string, string>;
  rules: Rule[];
}

export interface ConfigError {
  /** Dotted path such as `rules.2.action`; empty for syntax errors. */
  path: string;
  line?: number;
  message: string;
}

export type ConfigResult = { ok: true; config: VigiaConfig } | { ok: false; errors: ConfigError[] };

export const DEFAULT_CONFIG: VigiaConfig = {
  version: 1,
  language: "en",
  observe: true,
  defaults: { act: 0.85, unsure: 0.5 },
  exempt: ["broadcaster", "moderators", "vips"],
  highlights: { mode: "auto", seconds: 12, includeBroadcaster: false },
  emotes: {},
  rules: [],
};

const MAX_TIMEOUT_SECONDS = 1_209_600; // Twitch's limit: two weeks
const RULE_ID = /^[a-z0-9_-]+$/;

export function isPackRule(r: Rule): r is PackRule {
  return "pack" in r;
}

export function thresholdsFor(rule: Rule, defaults: Thresholds): Thresholds {
  return { act: rule.act ?? defaults.act, unsure: rule.unsure ?? defaults.unsure };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isProbability = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const oneOf = (list: readonly string[]) => `must be one of ${list.join(", ")}`;

export function parseConfig(text: string): ConfigResult {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((e) => ({ path: "", line: lines.linePos(e.pos[0]).line, message: e.message })),
    };
  }

  const errors: ConfigError[] = [];
  const fail = (path: (string | number)[], message: string) =>
    errors.push({ path: path.join("."), line: lineOf(doc, lines, path), message });

  const raw = doc.toJS() ?? {};
  if (!isObj(raw)) return { ok: false, errors: [{ path: "", line: 1, message: "must be a mapping" }] };

  if (raw.version !== 1) fail(["version"], "must be 1");

  const language = raw.language ?? DEFAULT_CONFIG.language;
  if (language !== "en" && language !== "es") fail(["language"], oneOf(["en", "es"]));

  const observe = raw.observe ?? DEFAULT_CONFIG.observe;
  if (typeof observe !== "boolean") fail(["observe"], "must be true or false");

  const defaults = { ...DEFAULT_CONFIG.defaults, ...(isObj(raw.defaults) ? raw.defaults : {}) } as Thresholds;
  if (!isProbability(defaults.act)) fail(["defaults", "act"], "must be a number from 0 to 1");
  if (!isProbability(defaults.unsure)) fail(["defaults", "unsure"], "must be a number from 0 to 1");
  else if (isProbability(defaults.act) && defaults.unsure > defaults.act) fail(["defaults", "unsure"], "must not exceed act");

  const exempt = raw.exempt ?? DEFAULT_CONFIG.exempt;
  if (!Array.isArray(exempt)) fail(["exempt"], "must be a list");
  else exempt.forEach((r, i) => (EXEMPT_ROLES as readonly unknown[]).includes(r) || fail(["exempt", i], oneOf(EXEMPT_ROLES)));

  const highlights = { ...DEFAULT_CONFIG.highlights, ...(isObj(raw.highlights) ? raw.highlights : {}) };
  if (highlights.mode !== "auto" && highlights.mode !== "approve") fail(["highlights", "mode"], oneOf(["auto", "approve"]));
  if (!(typeof highlights.seconds === "number" && highlights.seconds > 0)) fail(["highlights", "seconds"], "must be a positive number");
  if (typeof highlights.includeBroadcaster !== "boolean") fail(["highlights", "includeBroadcaster"], "must be true or false");

  const emotes = raw.emotes ?? {};
  if (!isObj(emotes) || !Object.values(emotes).every((v) => typeof v === "string")) {
    fail(["emotes"], "must map emote names to text");
  }

  const rules = raw.rules ?? [];
  if (!Array.isArray(rules)) fail(["rules"], "must be a list");
  else validateRules(rules, fail);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      version: 1,
      language: language as VigiaConfig["language"],
      observe: observe as boolean,
      defaults,
      exempt: exempt as ExemptRole[],
      highlights: highlights as VigiaConfig["highlights"],
      emotes: emotes as Record<string, string>,
      rules: rules as Rule[],
    },
  };
}

function validateRules(rules: unknown[], fail: (path: (string | number)[], message: string) => void) {
  const seen = new Set<string>();
  let antispoilers = 0;
  rules.forEach((rule, i) => {
    const at = (...rest: string[]) => ["rules", i, ...rest];
    if (!isObj(rule)) return fail(at(), "must be a mapping");

    if (typeof rule.id !== "string" || !RULE_ID.test(rule.id)) fail(at("id"), "must use only a-z, 0-9, - and _");
    else if (seen.has(rule.id)) fail(at("id"), `duplicate id "${rule.id}"`);
    else seen.add(rule.id);

    if ("pack" in rule && "question" in rule) fail(at(), "must have either pack or question, not both");
    else if ("pack" in rule) {
      if (!(PACK_NAMES as readonly unknown[]).includes(rule.pack)) fail(at("pack"), oneOf(PACK_NAMES));
      else if (rule.pack === "antispoiler" && ++antispoilers > 1) fail(at("pack"), "only one antispoiler rule is allowed");
      for (const key of ["work", "progress"]) {
        if (key in rule && typeof rule[key] !== "string") fail(at(key), "must be text");
      }
    } else if ("question" in rule) {
      for (const key of ["question", "yes", "no"]) {
        if (typeof rule[key] !== "string" || rule[key] === "") fail(at(key), "must be text");
      }
    } else fail(at(), "must have a pack or a question");

    if (!(ACTIONS as readonly unknown[]).includes(rule.action)) fail(at("action"), oneOf(ACTIONS));
    if (rule.action === "timeout" || "seconds" in rule) {
      const s = rule.seconds;
      if (!(Number.isInteger(s) && (s as number) >= 1 && (s as number) <= MAX_TIMEOUT_SECONDS)) {
        fail(at("seconds"), `must be a whole number from 1 to ${MAX_TIMEOUT_SECONDS}`);
      }
    }
    if ("enabled" in rule && typeof rule.enabled !== "boolean") fail(at("enabled"), "must be true or false");
    for (const key of ["act", "unsure"]) {
      if (key in rule && !isProbability(rule[key])) fail(at(key), "must be a number from 0 to 1");
    }
  });
}

/** Line of the node at `path`, or of its closest existing parent. */
function lineOf(doc: Document, lines: LineCounter, path: (string | number)[]): number | undefined {
  for (let n = path.length; n >= 0; n--) {
    const node = n === 0 ? doc.contents : doc.getIn(path.slice(0, n), true);
    if (isNode(node) && node.range) return lines.linePos(node.range[0]).line;
  }
  return undefined;
}
