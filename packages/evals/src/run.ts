/**
 * Measures Jev on the labeled messages of every bundled pack, in English and Spanish, and
 * publishes the numbers in both READMEs.
 *
 *   AI_GATEWAY_API_KEY=vck_... pnpm eval            (or JEV_API_KEY for a TypeSafe key)
 *   pnpm eval --render                              (rebuild the tables from results.json)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createQueue, detectProvider } from "@vigia/core";
import { jevEvaluator } from "@vigia/engine";
import { loadDatasets, requestFor } from "./dataset";
import { markdownTable, replaceBetweenMarkers, score, type Scored } from "./score";

const ROOT = new URL("../../../", import.meta.url);
const RESULTS = new URL("docs/evals/results.json", ROOT);

let rows: Scored[];
let meta: { measuredAt: string; provider: string };

if (process.argv.includes("--render")) {
  const saved = JSON.parse(readFileSync(RESULTS, "utf8"));
  rows = saved.rows;
  meta = { measuredAt: saved.measuredAt, provider: saved.provider };
} else {
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.JEV_API_KEY;
  if (!apiKey) {
    console.error("Set AI_GATEWAY_API_KEY (or JEV_API_KEY) to run the evals.");
    process.exit(1);
  }
  const provider = detectProvider(apiKey);
  const evaluate = jevEvaluator({ apiKey, provider }, { retries: 4 });
  const queue = createQueue(4);
  const sets = loadDatasets();
  const total = sets.reduce((n, s) => n + s.examples.length, 0);
  rows = [];
  let failed = 0;
  await Promise.all(
    sets.flatMap((s) =>
      s.examples.map((e) =>
        queue.push(async () => {
          const { state, questions } = requestFor(s.pack, e);
          try {
            const p = (await evaluate(state, questions))[s.pack];
            rows.push({ pack: s.pack, lang: s.lang, text: e.text, expect: e.expect, p });
          } catch (err) {
            failed++;
            console.error(`\n${s.file}: "${e.text}": ${(err as Error).message}`);
          }
          process.stdout.write(`\r${rows.length + failed}/${total}`);
        }),
      ),
    ),
  );
  console.log();
  if (failed > 0) {
    console.error(`${failed} messages failed; nothing was written.`);
    process.exit(1);
  }
  meta = { measuredAt: new Date().toISOString(), provider };
  mkdirSync(new URL(".", RESULTS), { recursive: true });
  rows.sort((a, b) => a.pack.localeCompare(b.pack) || a.lang.localeCompare(b.lang) || a.text.localeCompare(b.text));
  writeFileSync(RESULTS, JSON.stringify({ ...meta, rows }, null, 1) + "\n");
}

const metrics = score(rows);
for (const m of metrics) {
  console.log(`${m.pack}.${m.lang}: accuracy ${(m.accuracy * 100).toFixed(0)}%, ${m.falsePositives.length} false positives`);
  for (const t of m.falsePositives) console.log(`  ✗ ${t}`);
}

const date = meta.measuredAt.slice(0, 10);
for (const [file, lang] of [["README.md", "en"], ["README.es.md", "es"]] as const) {
  const url = new URL(file, ROOT);
  const note =
    lang === "es"
      ? `Medido el ${date} con \`pnpm eval\`, a los umbrales por defecto (actuar ≥ 85 %, dudoso ≥ 50 %).`
      : `Measured on ${date} with \`pnpm eval\`, at the default thresholds (act ≥ 85%, uncertain ≥ 50%).`;
  const next = replaceBetweenMarkers(readFileSync(url, "utf8"), `${markdownTable(metrics, lang)}\n\n${note}`);
  if (next === null) console.error(`${file} has no eval markers; skipped.`);
  else writeFileSync(url, next);
}
console.log("Updated README.md and README.es.md.");
