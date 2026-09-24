# Vigia Playground

[See it live](https://vstrofago.github.io/vigia/playground/) · Back to [Vigia](../../README.md)

A small playground that shows Jev moderating a simulated live-stream chat in real time. It
asks two questions about every message in one call (`offensive`, a yes/no probability, and
`category`: `ok`, `insult`, `hate`, `spam` or `threat`). The delete / review / allow decision
is plain code applied to those probabilities, so dragging the sliders re-decides every
message on screen instantly without calling Jev again.

## How it works

- **Recorded replay (default).** The published site streams ~180 scripted chat messages
  (English and Spanish; normal, ambiguous and abusive). Each message is shown with the
  answer Jev actually gave when it was recorded, including its real latency. No key is
  needed, and nobody's budget is spent.
- **Live mode (bring your own key).** Paste your own Vercel AI Gateway key (`vck_…`). The
  key is stored only in your browser, and calls go straight from your browser to the
  gateway. In live mode you can also type your own messages.

| Key | Public site | Running locally (Docker or `pnpm dev`) |
|---|---|---|
| Vercel AI Gateway (`vck_…`) | ✅ | ✅ |
| TypeSafe (`api.typesafe.ai`) | ❌ the TypeSafe API sends no CORS headers, so browsers can't call it from another site | ✅ a local proxy forwards your calls; your key only ever leaves your machine to reach TypeSafe |

## Run it locally with Docker

No Node needed. Both kinds of key work here, including TypeSafe keys:

```bash
git clone https://github.com/vstrofago/vigia
cd vigia
docker compose -f apps/demo/docker-compose.yml up --build
# open http://localhost:8080/playground/ (the site root is the Vigia landing page)
```

nginx serves the site and forwards `/typesafe-api/v1/systemone` to `api.typesafe.ai`, and
nothing else. It never sees or stores a key of its own.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:4321/playground/
pnpm test       # core unit tests
pnpm build      # static site in dist/
```

Re-record the replay with your own gateway key. This costs a fraction of a cent: Jev is
$0.042 per million input tokens, and output is free.

```bash
AI_GATEWAY_API_KEY=vck_... pnpm record
```

The script rewrites `src/data/replay.json` and prints how often Jev plus the default
policy agree with the hand-written labels, along with a confusion table.

## Project layout

```
packages/core/  (shared with Vigia) pure TypeScript, no DOM
  jev-client.ts   evaluate() for Vercel AI Gateway and TypeSafe, typed errors
  questions.ts    the two moderation questions
  moderate.ts     moderate(text) -> ModerationResult
  policy.ts       decide(result, thresholds) -> allow | review | remove
  queue.ts        tiny concurrency-limited queue (max 4 calls in flight)
apps/demo/src/client/    the page's behaviour (vanilla TS)
apps/demo/src/data/      scripted messages + recorded replay
apps/demo/scripts/record.ts
apps/demo/Dockerfile, nginx.conf + the root docker-compose.yml   local run with a same-origin TypeSafe proxy
```

## Deploy

A push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. Enable
Pages in the repo settings, with source set to *GitHub Actions*. The public site supports
Vercel AI Gateway keys only; TypeSafe keys are for the local Docker run.

## Caveats

- Jev's strongest language is English. It handles Spanish, but with lower confidence, so
  expect more messages in the review zone.
- The scripted abuse is deliberately mild. This is a public demo, not a benchmark.

---

