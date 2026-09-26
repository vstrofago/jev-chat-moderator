import type { PackName } from "@vigia/engine";
import type { Lang } from "./dataset";

export interface Scored {
  pack: PackName;
  lang: Lang;
  text: string;
  expect: boolean;
  /** Jev's probability for "yes". */
  p: number;
}

export interface Metrics {
  pack: PackName;
  lang: Lang;
  n: number;
  /** Share labeled right when acting at `act`. */
  accuracy: number;
  /** Of the messages acted on, how many deserved it. Null when nothing was acted on. */
  precision: number | null;
  /** Of the messages that deserved it, how many were acted on. */
  recall: number;
  /** Share landing between `unsure` and `act`: logged for a human instead of acted on. */
  uncertain: number;
  /** Acted on although the label says no: the costly mistakes. */
  falsePositives: string[];
}

/** Scores each pack and language at the given thresholds (the config defaults: 0.85 / 0.5). */
export function score(rows: Scored[], t = { act: 0.85, unsure: 0.5 }): Metrics[] {
  const groups = new Map<string, Scored[]>();
  for (const r of rows) {
    const k = `${r.pack}.${r.lang}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].map((g) => {
    const acted = g.filter((r) => r.p >= t.act);
    const positives = g.filter((r) => r.expect);
    const tp = acted.filter((r) => r.expect).length;
    const correct = g.filter((r) => r.p >= t.act === r.expect).length;
    return {
      pack: g[0].pack,
      lang: g[0].lang,
      n: g.length,
      accuracy: correct / g.length,
      precision: acted.length ? tp / acted.length : null,
      recall: positives.length ? tp / positives.length : 1,
      uncertain: g.filter((r) => r.p >= t.unsure && r.p < t.act).length / g.length,
      falsePositives: acted.filter((r) => !r.expect).map((r) => r.text),
    };
  });
}

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

/** The table in packages/evals/RESULTS.md. */
export function markdownTable(metrics: Metrics[], lang: Lang): string {
  const head =
    lang === "es"
      ? "| Pack | Idioma | Mensajes | Aciertos | Precisión | Cobertura | Dudosos |\n|---|---|---|---|---|---|---|"
      : "| Pack | Language | Messages | Accuracy | Precision | Recall | Uncertain |\n|---|---|---|---|---|---|---|";
  const rows = [...metrics]
    .sort((a, b) => a.pack.localeCompare(b.pack) || a.lang.localeCompare(b.lang))
    .map((m) => `| \`${m.pack}\` | ${m.lang} | ${m.n} | ${pct(m.accuracy)} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.uncertain)} |`);
  return [head, ...rows].join("\n");
}

const START = "<!-- evals:start -->";
const END = "<!-- evals:end -->";

/** Replaces the text between the eval markers; returns null when the markers are missing. */
export function replaceBetweenMarkers(doc: string, body: string): string | null {
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a < 0 || b < a) return null;
  return `${doc.slice(0, a + START.length)}\n${body}\n${doc.slice(b)}`;
}
