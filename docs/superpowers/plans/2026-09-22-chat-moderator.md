# Jev Chat Moderator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static Astro playground where Jev moderates a simulated live-stream chat. It runs from a recorded replay by default, or live with the visitor's own key.

**Architecture:** A pure-TypeScript core (`src/core/`) wraps the Jev evaluate APIs, both the gateway and TypeSafe direct, and applies a threshold policy in code. The Astro page is static, and all interactivity is vanilla TS in one client module. `scripts/record.ts` produces `replay.json` offline with the author's key.

**Tech Stack:** Astro 7, TypeScript, Vitest 5, tsx, pnpm, GitHub Pages, and an optional Cloudflare Worker.

**Spec:** `docs/superpowers/specs/2026-09-22-chat-moderator-design.md`

## Global Constraints

- No API key in the built site. The author's key is only read by `scripts/record.ts` from `AI_GATEWAY_API_KEY`.
- Gateway: `POST https://ai-gateway.vercel.sh/v1/evaluate`, model `typesafe-ai/jev`, question type `boolean`.
- TypeSafe: `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`, question type `noul`. There is no CORS, so calls go through a proxy.
- Categories: exactly `ok | insult | hate | spam | threat`.
- Default thresholds: `remove = 0.80`, `review = 0.50`, with `review <= remove` enforced.
- Custom message limit: 500 characters. At most 4 requests in flight.
- UI text in ES and EN. The initial language comes from `navigator.language`, and the choice is saved in `localStorage` (inside try/catch).
- Clean Scandinavian visual style, with light and dark themes. Works at 360px wide.

## Review Focus

1. A failed call must never look "allowed". Such a message shows as *unmoderated*, and `decide()` is never called on it.
2. The review slider dragged above the remove slider: the policy stays consistent, because the UI clamps and `decide()` uses `min(review, remove)`.
3. A TypeSafe key with no proxy configured: a clear explanation, and no silent CORS failure.
4. `localStorage` throwing (private mode): the page still works, and the key and language just aren't remembered.
5. A gateway response missing an answer or containing an unknown category: `moderate()` throws `GatewayError`, which the UI marks as unmoderated.

---

### Task 1: Scaffold project

**Files:** `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`, `src/pages/index.astro` (stub)

- [ ] Create the files by hand (no interactive `create astro`). Pin `astro@^7.3.4`, `vitest@^5.0.1`, `typescript`, `tsx`.
- [ ] Set `astro.config.mjs` with `site` and `base` from env (`SITE`, `BASE_PATH`, default `/`), plus a Vite dev proxy `/typesafe-api` → `https://api.typesafe.ai` (with the path prefix rewritten).
- [ ] Run `pnpm install && pnpm build` and expect it to succeed. Commit.

### Task 2: Core types, questions, policy (TDD)

**Files:** `src/core/types.ts`, `src/core/questions.ts`, `src/core/policy.ts`, `tests/policy.test.ts`

**Produces:**
```ts
export const CATEGORIES = ["ok","insult","hate","spam","threat"] as const;
export type Category = typeof CATEGORIES[number];
export interface ModerationResult { offensive: number; category: Category;
  categoryProbabilities: Record<Category, number>; confidence?: number;
  latencyMs: number; inputTokens?: number; model?: string; raw: unknown }
export type Verdict = "allow" | "review" | "remove";
export interface Thresholds { remove: number; review: number }
export const DEFAULT_THRESHOLDS: Thresholds = { remove: 0.8, review: 0.5 };
export function decide(r: Pick<ModerationResult,"offensive"|"category"|"categoryProbabilities">, t: Thresholds): Verdict
```

- [ ] Write tests covering these cases:
  - `offensive` 0.8 gives remove, 0.79 gives review, 0.5 gives review, 0.49 gives allow.
  - spam with probability 0.9 and `offensive` 0.1 gives remove.
  - spam with probability 0.6 gives allow.
  - review 0.9 with remove 0.8 behaves like review = remove.
- [ ] Run them and see them fail. Implement. Run them and see them pass. Commit.

### Task 3: Jev client + moderate() (TDD)

**Files:** `src/core/jev-client.ts`, `src/core/moderate.ts`, `tests/moderate.test.ts`

**Produces:**
```ts
export type Provider = "gateway" | "typesafe";
export interface ClientOptions { apiKey: string; provider: Provider;
  typesafeBaseUrl?: string; fetch?: typeof fetch; signal?: AbortSignal }
export class JevError extends Error {}         // base
export class AuthError extends JevError {}     // 401/403
export class RateLimitError extends JevError { retryAfterMs: number }
export class GatewayError extends JevError {}  // 5xx, network, malformed
export function detectProvider(key: string): Provider   // vck_ -> gateway
export async function evaluate(state: unknown, questions: NeutralQuestions, o: ClientOptions)
  : Promise<{ answers: Record<string, NeutralAnswer>; inputTokens?: number; model?: string; raw: unknown }>
export async function moderate(text: string, o: ClientOptions): Promise<ModerationResult>
```
Neutral question types are `{type:"boolean"|"choice", instructions, criteria}`. The client maps `boolean` to `noul` for TypeSafe, and maps the answer's `noul` or `probability` to `probability`.

- [ ] Write tests with a fake fetch:
  - A gateway body gives the right result.
  - A TypeSafe body gives the right result.
  - A request to TypeSafe uses `noul` and `jev-latest`.
  - 403 throws `AuthError` carrying the gateway's message.
  - 429 with `retry-after: 3` throws `RateLimitError` with `retryAfterMs` 3000.
  - 500, a network throw, a missing answer and an unknown category all throw `GatewayError`.
  - `detectProvider` works as specified.
- [ ] Run them and see them fail. Implement. Run them and see them pass. Commit.

### Task 4: Dataset + record script + real replay

**Files:** `src/data/messages.json`, `scripts/record.ts`, `src/data/replay.json`

- [ ] Write about 200 messages `{id,user,lang,text,expected}` in the proportions from the spec.
- [ ] Write `scripts/record.ts`:
  - Reads `AI_GATEWAY_API_KEY` and runs `moderate()` with concurrency 4, retrying on `RateLimitError`.
  - Writes `replay.json` as `{recordedAt, model, results: {[id]: ModerationResult}}`.
  - Prints the agreement and a confusion table, using `decide()` with the default thresholds against the expected labels (expected `ok` means allow, anything else means remove or review).
- [ ] Run `pnpm record`. Tune the question wording in `questions.ts` if agreement is poor, then re-record. Commit.

### Task 5: i18n + page layout + styles

**Files:** `src/i18n/es.json`, `src/i18n/en.json`, `src/pages/index.astro`, `src/styles/global.css`

- [ ] Build static markup for the header (title, ES/EN toggle), the chat column, the control column (sliders, speed, play/pause, stats, key field with provider selector, custom message box, explainer) and the detail panel as a `<dialog>`.
- [ ] Mark every text node with `data-i18n="key"`. The ES strings are rendered at build time, and the client swaps them.
- [ ] Style tokens on `:root`, with dark mode through `prefers-color-scheme`. Commit after `pnpm build` passes.

### Task 6: Client app

**Files:** `src/client/app.ts` (imported by `index.astro`), `src/client/storage.ts`, `src/client/queue.ts`, `tests/queue.test.ts`

- [ ] `storage.ts`: `safeGet` and `safeSet` wrapping `localStorage` in try/catch.
- [ ] `queue.ts`: `createQueue(concurrency)`. Test that no more than N tasks run at once and that the order is preserved.
- [ ] `app.ts` handles:
  - the replay stream;
  - live mode, with the provider taken from the key;
  - a TypeSafe key with no proxy, which shows an explanation;
  - `AuthError`, which falls back to replay;
  - `RateLimitError`, which re-queues after the delay;
  - other errors, which mark the message unmoderated;
  - sliders re-applying `decide()`;
  - stats;
  - the detail dialog;
  - the i18n toggle.
- [ ] Check by hand in the browser. Commit.

### Task 7: Proxy worker, README, deploy workflow, final verification

**Files:** `proxy/worker.ts`, `proxy/wrangler.toml`, `README.md`, `.github/workflows/deploy.yml`

- [ ] The Worker forwards `POST /v1/systemone` to `api.typesafe.ai`, passes through `Authorization`, adds CORS headers, and restricts the allowed origin through the `ALLOWED_ORIGIN` variable.
- [ ] The workflow uses pnpm, `astro build` with `BASE_PATH=/${{ github.event.repository.name }}`, and `actions/deploy-pages`.
- [ ] README in English with a Spanish section.
- [ ] Final check: `pnpm test`, `pnpm build`, a browser check of the built site at desktop and mobile widths, in both themes and both languages. Commit.
