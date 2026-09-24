import type { EngineEvent } from "@vigia/engine";

export const color = (code: number, s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const pct = (p: number) => p.toFixed(2);

/** One console line for a decision, or null when nothing happened. Possible spoilers are hidden. */
export function formatDecision(e: Extract<EngineEvent, { type: "decision" }>): string | null {
  const { outcome: o, message: m } = e;
  const tags: string[] = [];
  if (o.moderation) {
    const v = o.verdicts.find((x) => x.ruleId === o.moderation!.ruleId)!;
    const verb = e.applied ? "" : "WOULD ";
    const note = o.moderation.downgraded ? " (emotes only → log)" : "";
    tags.push(color(31, `${verb}${o.moderation.action.toUpperCase()} ${v.ruleId} ${pct(v.probability)}${note}`));
  }
  if (o.highlight) tags.push(color(32, `HIGHLIGHT ${o.highlight.ruleId} ${pct(o.highlight.probability)}`));
  if (o.suggestion) tags.push(color(36, `SUGGEST ${o.suggestion.ruleId} ${pct(o.suggestion.probability)}`));
  for (const u of o.uncertain) tags.push(color(35, `UNSURE ${u.ruleId} ${pct(u.probability)}`));
  if (tags.length === 0) return null;
  const text = o.spoiler ? color(2, "[possible spoiler hidden]") : m.text;
  return `${tags.join(" | ")}  ${color(2, m.author.displayName + ":")} ${text}`;
}
