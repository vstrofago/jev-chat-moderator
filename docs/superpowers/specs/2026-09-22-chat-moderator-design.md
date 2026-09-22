# Jev Chat Moderator — Design

**Date:** 2026-09-22
**Status:** Draft, pending review

## Purpose

An open-source, interactive playground that shows how TypeSafe AI's **Jev** model
(a "System One" model: typed answers with probabilities, no text generation) can moderate
a live-stream chat in real time. It is the first of three Jev playgrounds (followed by an
inventory classifier and a PARA file-organizer CLI).

It is a demo, not a product. If it works well, the moderation core will later be extracted
into a Twitch plugin, so the core must stay independent of the UI.

**Success looks like:**

- A visitor with no API key opens the page and immediately sees Jev moderating a
  simulated chat (recorded replay).
- A visitor with their own AI Gateway key can run it live and type their own messages.
- Moving the threshold sliders makes it obvious that Jev returns probabilities and that
  *our code* makes the decision.
- The `src/core/` folder can be copied into another TypeScript project without changes.

## Constraints

- Static site: **Astro**, deployed to **GitHub Pages** for free. No server.
- Jev is reached through **Vercel AI Gateway**:
  `POST https://ai-gateway.vercel.sh/v1/evaluate`, model `typesafe-ai/jev`,
  header `Authorization: Bearer <key>`. CORS allows browser calls from other origins
  (verified 2026-09-22).
- No API key is ever shipped with the site. Live mode uses the visitor's own key,
  stored only in their browser (`localStorage`).
- Jev's best language is English; Spanish works with lower accuracy. The demo shows this
  honestly rather than hiding it.
- Pricing: $0.042 per million input tokens, output free. A full replay recording costs
  well under one cent.

## Out of scope

Real Twitch connection, user accounts, persistent history, any backend. These belong to
the future plugin.

## Architecture

```
jev-chat-moderator/
  src/
    core/                 # pure TypeScript, no Astro, no DOM
      jev-client.ts       # evaluate(): fetch wrapper for /v1/evaluate + typed errors
      questions.ts        # the Jev questions used for moderation
      moderate.ts         # moderate(text, opts) -> ModerationResult
      policy.ts           # decide(result, thresholds) -> "allow" | "review" | "remove"
      types.ts
    data/
      messages.json       # ~200 scripted messages with expected labels
      replay.json         # recorded real Jev answers for messages.json
    i18n/
      es.json, en.json    # UI strings
    components/           # Astro components + small client-side TS
    pages/index.astro
  scripts/
    record.ts             # runs messages.json through Jev -> replay.json, prints agreement
  tests/                  # Vitest, core only
  .github/workflows/deploy.yml
```

Client-side interactivity is plain TypeScript in Astro `<script>` tags. No UI framework;
the page is small enough not to need one.

### Core API

```ts
type Category = "ok" | "insult" | "hate" | "spam" | "threat";

interface ModerationResult {
  offensive: number;                        // 0..1, probability from the boolean question
  category: Category;                       // chosen option from the choice question
  categoryProbabilities: Record<Category, number>;
  latencyMs: number;
  inputTokens?: number;
  raw: unknown;                             // untouched gateway response, shown in the UI
}

moderate(text: string, opts: { apiKey: string; fetch?: typeof fetch; signal?: AbortSignal })
  : Promise<ModerationResult>

decide(result: ModerationResult, t: { remove: number; review: number })
  : "allow" | "review" | "remove"
```

`fetch` is injectable so tests (and the future plugin) can supply their own.

### Questions sent to Jev (one request per message)

- `offensive` — `boolean`: "Is this live-stream chat message insulting, harassing,
  hateful or threatening toward someone?" with `true`/`false` criteria that explicitly
  say gamer slang and swearing with no target are **not** offensive.
- `category` — `choice` with options `ok`, `insult`, `hate`, `spam`, `threat`, each with a
  one-line rubric.

The message is sent as `state: { message: text }`. Final wording is tuned during
implementation using the recording script's agreement report.

### Policy (lives in our code, not in Jev)

- `offensive >= remove` → **remove**
- `review <= offensive < remove` → **review** (the grey zone)
- otherwise → **allow**
- Exception: if `category` is `spam` with probability `>= remove`, the message is removed
  even when `offensive` is low (spam is not "offensive" but should still go).

Defaults: `remove = 0.80`, `review = 0.50`. The UI keeps `review <= remove`.

### Modes

- **Replay (default, no key):** messages stream from `messages.json`, and each one takes
  its answer from `replay.json`. The latency shown is the recorded latency.
- **Live (visitor's own key):** each message calls Jev from the browser. The "write your
  own message" box is enabled only in this mode. The author's key is **only** used
  offline by `pnpm record`; the published site never spends the author's budget.

### Providers (revision 2026-09-22)

Visitors can bring either kind of key:

| Provider | Endpoint | Wire format |
|---|---|---|
| Vercel AI Gateway | `https://ai-gateway.vercel.sh/v1/evaluate`, model `typesafe-ai/jev` | `boolean` → `probability`; usage `inputTokens` |
| TypeSafe direct | `https://api.typesafe.ai/v1/systemone`, model `jev-latest` | `noul` → `noul`; usage `input_tokens` |

`jev-client.ts` takes a provider and a question set written once in a neutral form. It
converts the questions to each wire format and normalizes the answers back.

The TypeSafe API sends **no CORS headers** (verified 2026-09-22), so browsers cannot call
it directly. To handle this:
- `pnpm dev` proxies `/typesafe-api/*` to `api.typesafe.ai` through Vite.
- The repo ships `proxy/worker.ts`, a ~30-line Cloudflare Worker that forwards requests
  with the visitor's own key and adds CORS headers. Its URL is set at build time with
  `PUBLIC_TYPESAFE_PROXY_URL`.
- If a TypeSafe key is entered and no proxy is configured, the UI explains why and
  suggests using a gateway key.

The key is auto-detected. Gateway keys start with `vck_`; anything else is treated as a
TypeSafe key, and the visitor can override the choice with a selector.

## UI

Single page. Two columns on desktop, stacked on mobile (works at 360px wide).

**Chat column (Twitch-like):** messages stream in at the selected speed. Each message moves
through these states:

- *pending*: greyed out, with a small spinner, while Jev answers.
- *allowed*: shown normally.
- *review*: amber marker.
- *removed*: struck through, then collapsed to
  `<message removed by Jev · insult 94%>`.
- *unmoderated*: shown with a warning icon when the call failed. It is never treated as
  allowed.

Each message also shows its latency in ms. Clicking a message opens a detail panel with a
bar per category probability, the `offensive` probability, whether it matched the expected
label, and the raw JSON response.

**Control column:**
- Remove and review threshold sliders. Moving them re-applies `decide()` to every message
  already on screen, with no new Jev calls.
- Speed selector, and play/pause.
- Stats: processed, removed, in review, average latency, estimated cost, and agreement with
  the expected labels.
- API key field (password input, "stored only in your browser", clear button).
- "Write your own message" box (live mode only, 500-character limit like Twitch).
- A short explainer: what Jev is and why the decision is in code.

**Visual style:** clean Scandinavian design:
- off-white background and warm greys, with one muted accent color;
- verdict colors used only for message states;
- generous whitespace, thin borders, no heavy shadows;
- Inter (or a similar sans-serif);
- light and dark themes that follow the system setting.

**Bilingual UI (ES/EN):** all UI text comes from `i18n/es.json` and `i18n/en.json`. The
initial language follows `navigator.language` (Spanish if it starts with `es`, English
otherwise), and an ES/EN toggle in the header switches it at runtime. The choice is saved
in `localStorage`. Chat messages are not translated; the dataset is mixed on purpose.

## Dataset (`messages.json`)

About 200 hand-written messages, half English and half Spanish:

- ~60% normal: greetings, questions to the streamer, emotes, "gg".
- ~15% deliberately ambiguous: gamer slang ("ez", "noob", "te mato en la siguiente"),
  sarcasm, swearing with no target.
- ~25% moderation targets: insults, spam, threats, hate. Kept mild enough for a public
  repo.

Entry shape: `{ id, user, lang: "es" | "en", text, expected: Category }`.
Usernames are invented.

## Error handling (live mode)

| Situation | Behaviour |
|---|---|
| 401/403 (bad key, or no card on the Vercel account) | Show a clear message in the panel with the gateway's error text, switch back to replay, no retry loop |
| 429 | Honour `retry-after` (default 2 s). Messages wait in a visible queue and are never dropped |
| Network error / 5xx | Mark the message *unmoderated*, keep streaming, and show an error count |
| Malformed response | Treated like 5xx; the raw payload is kept for the detail panel |

`jev-client.ts` turns these cases into typed errors (`AuthError`, `RateLimitError`,
`GatewayError`) so the UI and the future plugin handle them the same way.

In live mode, at most 4 requests are in flight at once. If Jev falls behind, messages wait
in the queue.

## Testing

- **Vitest, core only:**
  - `policy.ts`: thresholds, grey zone, the spam exception, boundary values.
  - `moderate.ts` and `jev-client.ts`: mapping a response to `ModerationResult`, and each
    error type, using a fake `fetch`.
- **`pnpm record`:** calls the real API with `AI_GATEWAY_API_KEY` from the environment,
  writes `replay.json`, and prints overall agreement plus a per-category confusion table.
  It is not part of `pnpm test` because it costs money.
- **UI:** checked by hand in the browser (desktop and mobile width, both themes, both
  languages, both modes).

## Delivery

- Own git repo, MIT license.
- README (in English, with a Spanish section) covering: what Jev is, a screenshot, how to
  run it locally, how to get an AI Gateway key, and how to re-record the replay.
- `.github/workflows/deploy.yml`: build and deploy to GitHub Pages on every push to `main`.
  Astro `base` is set to the repo name.
- Creating the GitHub repo and pushing are done only when the user asks.

## Gateway access

Resolved on 2026-09-22: the author's gateway key now returns 200. `pnpm record` uses it.
