import { isPackRule, thresholdsFor, type Action, type Rule, type Thresholds } from "./config";

export type Band = "act" | "unsure" | "none";

export function band(p: number, t: Thresholds): Band {
  if (p >= t.act) return "act";
  if (p >= Math.min(t.unsure, t.act)) return "unsure";
  return "none";
}

export interface RuleVerdict {
  ruleId: string;
  action: Action;
  probability: number;
  band: Band;
}

export interface Moderation {
  ruleId: string;
  action: "delete" | "timeout" | "log";
  seconds?: number;
  /** True when a delete or timeout was reduced to log (emote-only message). */
  downgraded: boolean;
}

export interface Outcome {
  verdicts: RuleVerdict[];
  moderation: Moderation | null;
  /** Best acting highlight rule, unless the message is moderated or a possible spoiler. */
  highlight: RuleVerdict | null;
  /** Best unsure highlight rule, under the same conditions. */
  suggestion: RuleVerdict | null;
  /** Moderation rules in the unsure band: the uncertain log. */
  uncertain: RuleVerdict[];
  /** The anti-spoiler rule acted or was unsure. */
  spoiler: boolean;
}

const STRENGTH = { timeout: 3, delete: 2, log: 1 } as const;

/** Turns Jev's probabilities into one decision for the message. */
export function combine(
  probabilities: Record<string, number>,
  rules: Rule[],
  defaults: Thresholds,
  opts: { emoteOnly: boolean },
): Outcome {
  const verdicts: RuleVerdict[] = [];
  let strongest: { rule: Rule; verdict: RuleVerdict } | null = null;
  let spoiler = false;

  for (const rule of rules) {
    const p = probabilities[rule.id];
    if (p === undefined) continue;
    const v: RuleVerdict = { ruleId: rule.id, action: rule.action, probability: p, band: band(p, thresholdsFor(rule, defaults)) };
    verdicts.push(v);

    if (isPackRule(rule) && rule.pack === "antispoiler" && v.band !== "none") spoiler = true;
    if (rule.action === "highlight" || v.band !== "act") continue;
    if (!strongest || beats(rule, v, strongest.rule, strongest.verdict)) strongest = { rule, verdict: v };
  }

  let moderation: Moderation | null = null;
  if (strongest) {
    const { rule } = strongest;
    const action = rule.action as Moderation["action"];
    if (opts.emoteOnly && action !== "log") moderation = { ruleId: rule.id, action: "log", downgraded: true };
    else if (action === "timeout") moderation = { ruleId: rule.id, action, seconds: rule.seconds, downgraded: false };
    else moderation = { ruleId: rule.id, action, downgraded: false };
  }

  const highlightable = !moderation && !spoiler;
  const best = (b: Band) =>
    highlightable
      ? (verdicts
          .filter((v) => v.action === "highlight" && v.band === b)
          .sort((a, c) => c.probability - a.probability)[0] ?? null)
      : null;
  const highlight = best("act");

  return {
    verdicts,
    moderation,
    highlight,
    suggestion: highlight ? null : best("unsure"),
    uncertain: verdicts.filter((v) => v.action !== "highlight" && v.band === "unsure"),
    spoiler,
  };
}

function beats(rule: Rule, v: RuleVerdict, other: Rule, ov: RuleVerdict): boolean {
  const s = STRENGTH[rule.action as keyof typeof STRENGTH];
  const os = STRENGTH[other.action as keyof typeof STRENGTH];
  if (s !== os) return s > os;
  if (rule.action === "timeout" && (rule.seconds ?? 0) !== (other.seconds ?? 0)) return (rule.seconds ?? 0) > (other.seconds ?? 0);
  return v.probability > ov.probability;
}
