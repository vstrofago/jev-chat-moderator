# Jev Chat Moderator

A small, open-source playground that shows [TypeSafe AI](https://typesafe.ai)'s **Jev**
moderating a simulated live-stream chat in real time.

Jev is a *System One* model: it doesn't write text. You send it some state and typed
questions, and it returns typed answers with probabilities, fast and cheap. This demo asks
two questions about every chat message in a single call:

- `offensive`: a yes/no question, answered as a probability from 0 to 1.
- `category`: one of `ok`, `insult`, `hate`, `spam` or `threat`, with a probability for
  each option.

**Jev never decides anything by itself.** The delete / review / allow decision is plain
code (`src/core/policy.ts`) applied to those probabilities. Drag the threshold sliders
and every message on screen is re-evaluated instantly, without calling Jev again.

<img width="1466" height="891" alt="image" src="https://github.com/user-attachments/assets/4c87b519-66ce-41ad-88c7-c4132cfbfcdb" />


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
git clone https://github.com/vstrofago/jev-chat-moderator
cd jev-chat-moderator
docker compose up --build
# open http://localhost:8080
```

nginx serves the site and forwards `/typesafe-api/v1/systemone` to `api.typesafe.ai`, and
nothing else. It never sees or stores a key of its own.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:4321
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
src/core/      pure TypeScript, no DOM: reusable outside this site
  jev-client.ts   evaluate() for Vercel AI Gateway and TypeSafe, typed errors
  questions.ts    the two moderation questions
  moderate.ts     moderate(text) -> ModerationResult
  policy.ts       decide(result, thresholds) -> allow | review | remove
  queue.ts        tiny concurrency-limited queue (max 4 calls in flight)
src/client/    the page's behaviour (vanilla TS)
src/data/      scripted messages + recorded replay
scripts/       record.ts
Dockerfile, nginx.conf, docker-compose.yml   local run with a same-origin TypeSafe proxy
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

## En español

Playground open source: **Jev** (TypeSafe AI) moderando un chat de stream simulado.
Jev no genera texto; devuelve probabilidades. La decisión de borrar, revisar o permitir la
toma el código con los umbrales que tú ajustas. La interfaz está en español e inglés.

- **Repetición grabada:** la versión publicada usa respuestas reales de Jev grabadas una
  vez. No necesita key y no gasta presupuesto de nadie.
- **En vivo:** en la versión publicada, pega tu propia key del Vercel AI Gateway. Se guarda
  solo en tu navegador.
- **Con key de TypeSafe:** su API no acepta llamadas desde otros sitios web, así que corre
  el playground en tu máquina con `docker compose up --build` y abre
  `http://localhost:8080`. Ahí funcionan ambas keys.
- **Desarrollo:** `pnpm install && pnpm dev`.
- **Regrabar:** `AI_GATEWAY_API_KEY=vck_... pnpm record`.

## License

MIT
