# Vigia M1: Monorepo + Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the playground repo into a pnpm monorepo and build `@vigia/engine`, a
headless, fully tested rules engine that consumes chat messages and produces moderation,
highlight and log decisions through a platform interface. A `simulate` script runs it over
the scripted chat.

**Architecture:** `packages/core` is the existing Jev client, moved as-is.
`packages/engine` holds the config parser, packs, decision logic, chat commands, a priority
queue and `createEngine()`, which talks to Twitch (M2) only through a `ChatPlatform`
interface and to Jev through an injectable `Evaluator`. `apps/demo` is the existing Astro
playground, unchanged in behavior.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, `yaml` (eemeli) for config parsing,
and tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-09-23-vigia-design.md`

## Milestone map (whole spec)

Each milestone gets its own plan when it starts. There is no public release until M6.

| # | Milestone | Deliverable |
|---|---|---|
| **M1** | Monorepo + engine (this plan) | Engine library, tested, with the `simulate` script |
| M2 | Twitch | OAuth spike (device code + implicit), EventSub WS client, Helix client, `ChatPlatform` adapter, category tracking, e2e against the Twitch CLI mock |
| M3 | Server | HTTP + WS server, YAML watch and write-back, SQLite store, overlay, env secrets, `vigia` headless CLI, Docker + Caddy |
| M4 | UI | Wizard, dashboard tabs, i18n en/es, mod login, roles, audit, spoiler blur, hidden topics |
| M5 | Desktop | Electron shell, safeStorage, tray, autostart, electron-updater |
| M6 | Launch | Pack evals, community spoiler-pack loader, README en/es, CONTRIBUTING, release CI, repo rename |

## Global Constraints

- The author hosts and operates nothing. No shared client ID and no network calls except
  to Twitch and Jev.
- Everything technical is in English: code, YAML keys, pack names. User-visible strings are
  in English and Spanish.
- Rules can never ban. Actions are `delete | timeout | highlight | log` only.
- No username or personal data goes into Jev `state`.
- Emote-only messages: moderation actions are downgraded to `log`.
- A moderated message is never highlighted. Spoiler-flagged text never reaches highlights
  or bot replies.
- Node >= 22. pnpm 12.4.2. Keep `src/core` behavior byte-for-byte (moved, not rewritten).
- The demo must still build (`pnpm build`) and deploy from `apps/demo/dist`.

## Review Focus

1. **Replies to a message start with `@user `.** Twitch prefixes reply text with a mention,
   so `@bob !vigia highlight` must parse as a command (Task 5 test).
2. **A viewer types `!vigia pause`.** Nothing changes, and the message is moderated like
   any other chat (Task 7 test).
3. **Jev fails mid-stream.** Network errors, 429s or malformed answers let the message pass,
   emit a `warning`, and the engine keeps processing later messages. An auth error halts
   evaluation until a new evaluator is set (Task 7 tests).
4. **A spoiler never leaks.** An anti-spoiler hit (act or unsure) suppresses highlights,
   and `status` never prints protected topics (Tasks 4 and 5 tests).
5. **An invalid config update** keeps the previous config running and returns errors with
   line numbers (Task 2 test for errors, Task 7 test for keep-old).

---

### Task 1: Monorepo restructure

**Files:**
- Move: `src/core/*` → `packages/core/src/*`; `tests/{moderate,policy,queue}.test.ts` → `packages/core/tests/`
- Move: `src/{client,data,i18n,pages,styles,env.d.ts}`, `public/`, `astro.config.mjs`, `tsconfig.json`, `scripts/record.ts`, `nginx.conf`, `Dockerfile`, `tests/stats.test.ts` → `apps/demo/...`
- Create: `packages/core/package.json`, `packages/core/src/index.ts`, `apps/demo/package.json`, `tsconfig.json` (root, for packages)
- Modify: `package.json`, `pnpm-workspace.yaml`, `vitest.config.ts`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/deploy.yml`, demo imports `../core/*` → `@vigia/core`

**Interfaces:**
- Produces: `@vigia/core`, which exports everything from `jev-client`, `questions`,
  `moderate`, `policy`, `queue` and `types`.

- [ ] **Step 1: Move files with git**

```bash
mkdir -p packages/core/tests apps/demo/tests apps/demo/scripts
git mv src/core packages/core/src
git mv tests/moderate.test.ts tests/policy.test.ts tests/queue.test.ts packages/core/tests/
git mv tests/stats.test.ts apps/demo/tests/
git mv src apps/demo/src
git mv public astro.config.mjs tsconfig.json nginx.conf Dockerfile apps/demo/
git mv scripts/record.ts apps/demo/scripts/
```

- [ ] **Step 2: Package manifests**

`packages/core/package.json`:
```json
{
  "name": "@vigia/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/core/src/index.ts`:
```ts
export * from "./jev-client";
export * from "./questions";
export * from "./moderate";
export * from "./policy";
export * from "./queue";
export * from "./types";
```

`apps/demo/package.json`: name `@vigia/demo`, scripts `dev`/`build`/`preview` (astro)
and `record` (`tsx scripts/record.ts`), dependencies `astro: 7.3.3` and
`@vigia/core: workspace:*`.

Root `package.json`: name `vigia`, scripts `test` (`vitest run`), `typecheck`
(`tsc -p tsconfig.json`), `dev`/`build`/`record` delegating with
`pnpm --filter @vigia/demo <script>`, `simulate` delegating to `@vigia/engine`, and
devDependencies `vitest`, `typescript`, `tsx`, `@types/node` (versions unchanged).

`pnpm-workspace.yaml`: `packages: ['packages/*', 'apps/*']` (keep `allowBuilds`).

`vitest.config.ts`: `include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"]`.

Root `tsconfig.json` (packages only; the demo keeps Astro's):
```json
{
  "compilerOptions": {
    "target": "es2024", "module": "preserve", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "resolveJsonModule": true,
    "types": ["node"], "lib": ["es2024", "dom"]
  },
  "include": ["packages/*/src/**/*", "packages/*/tests/**/*", "packages/*/scripts/**/*"]
}
```

- [ ] **Step 3: Fix imports**

Replace `from "../core/<x>"` with `from "@vigia/core"` in `apps/demo/src/client/*.ts`,
and `"../src/core/<x>"` with `"@vigia/core"` in `apps/demo/scripts/record.ts` and
`apps/demo/tests/stats.test.ts`. The core tests keep relative `../src/<x>` imports.

- [ ] **Step 4: Docker and Pages paths**

- `docker-compose.yml` stays at the root with `build: { context: ., dockerfile: apps/demo/Dockerfile }`.
- The Dockerfile copies the whole workspace, runs `pnpm install --frozen-lockfile` and
  `pnpm --filter @vigia/demo build`, and copies `/app/apps/demo/dist`.
- `nginx.conf` is copied from `apps/demo/nginx.conf`.
- `.dockerignore` adds `**/node_modules`, `**/dist` and `**/.astro`.
- `deploy.yml` uploads `apps/demo/dist`.

- [ ] **Step 5: Verify**

Run: `pnpm install && pnpm test && pnpm typecheck && pnpm build`
Expected: 30 tests pass, typecheck is clean, and `apps/demo/dist/index.html` exists.

- [ ] **Step 6: Commit** `refactor: split repo into pnpm workspace (core, demo)`

---

### Task 2: Config parsing and validation

**Files:**
- Create: `packages/engine/package.json` (`@vigia/engine`, deps `@vigia/core: workspace:*`, `yaml: ^2.9.1`), `packages/engine/src/config.ts`
- Test: `packages/engine/tests/config.test.ts`

**Interfaces:**
- Produces:
```ts
type Action = "delete" | "timeout" | "highlight" | "log";
type PackName = "toxicity" | "spam" | "antispoiler" | "questions" | "interesting";
type ExemptRole = "broadcaster" | "moderators" | "vips";
interface Thresholds { act: number; unsure: number }
interface RuleCommon { id: string; action: Action; seconds?: number; act?: number; unsure?: number }
interface PackRule extends RuleCommon { pack: PackName; work?: string; progress?: string }
interface CustomRule extends RuleCommon { question: string; yes: string; no: string }
type Rule = PackRule | CustomRule;
interface VigiaConfig {
  version: 1; language: "en" | "es"; defaults: Thresholds; exempt: ExemptRole[];
  highlights: { mode: "auto" | "approve"; seconds: number; includeBroadcaster: boolean };
  emotes: Record<string, string>; rules: Rule[];
}
interface ConfigError { path: string; line?: number; message: string }
type ConfigResult = { ok: true; config: VigiaConfig } | { ok: false; errors: ConfigError[] };
function parseConfig(text: string): ConfigResult;
function isPackRule(r: Rule): r is PackRule;
function thresholdsFor(rule: Rule, defaults: Thresholds): Thresholds;
const DEFAULT_CONFIG: VigiaConfig;
```

Defaults when keys are missing: `language: en`, `defaults {act 0.85, unsure 0.5}`,
`exempt [broadcaster, moderators, vips]`,
`highlights {mode auto, seconds 12, includeBroadcaster false}`, `emotes {}`, `rules []`.
Validation rules:
- `version` must be 1.
- `id` matches `/^[a-z0-9_-]+$/` and is unique.
- Each rule has exactly one of `pack` or `question`, and a `question` needs `yes`/`no`.
- `timeout` requires `seconds` as an integer from 1 to 1209600.
- Thresholds are within [0, 1], with `unsure <= act`.
- At most one `antispoiler` rule.
- Unknown `pack`, `action` or `exempt` values are errors.

Every error carries a dotted path (`rules.2.action`) and, when the node exists, a 1-based
line from `yaml`'s `LineCounter`.

- [ ] **Step 1: Write failing tests.** Cover:
  - a minimal file fills defaults;
  - the spec example parses;
  - a bad action reports `rules.0.action` with the right line;
  - duplicate ids;
  - `timeout` without seconds;
  - `unsure > act`;
  - two antispoiler rules;
  - both `pack` and `question` set;
  - YAML syntax errors return `ok:false`, not a throw.
- [ ] **Step 2: Run** `pnpm vitest run packages/engine/tests/config.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `config.ts`** with the handwritten validator described above.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): parse and validate vigia.yaml`

---

### Task 3: Packs and the Jev request

**Files:**
- Create: `packages/engine/src/message.ts`, `packages/engine/src/packs.ts`, `packages/engine/src/request.ts`
- Test: `packages/engine/tests/request.test.ts`

**Interfaces:**
- Consumes: `Rule`, `isPackRule` (Task 2); `BooleanQuestion` from `@vigia/core`.
- Produces:
```ts
// message.ts
type Fragment = { type: "text"; text: string } | { type: "emote"; text: string; id: string };
interface ChatAuthor { id: string; login: string; displayName: string; broadcaster: boolean; moderator: boolean; vip: boolean }
interface ChatMessage { id: string; text: string; author: ChatAuthor; fragments: Fragment[]; replyTo?: { id: string; text: string; authorLogin: string } }
function isEmoteOnly(m: ChatMessage): boolean;
// packs.ts
const PACK_KIND: Record<PackName, "moderation" | "highlight">;
interface PackContext { work?: string; progress?: string; protectedTopics: string[] }
function packQuestion(pack: PackName, ctx: PackContext): BooleanQuestion;
// request.ts
interface RequestContext { category?: string; progress?: string; protectedTopics: string[]; emotes: Record<string, string> }
function buildRequest(m: ChatMessage, rules: Rule[], ctx: RequestContext): { state: Record<string, unknown>; questions: Record<string, BooleanQuestion> };
```

`toxicity` reuses the playground's `offensive` question text. The spec's category split is
covered by the separate `spam` pack, so every rule is exactly one boolean question and one
probability. `state` contains:
- `message`;
- `replying_to` (the parent text only);
- `emotes` (the meanings of emotes present, taken from config plus a built-in table of
  global Twitch emotes);
- `spoiler_guard` (`work`, `progress`, `protected_topics`), only when an antispoiler rule
  is in the set. `work: auto` or a missing work resolves to `ctx.category`, and
  `ctx.progress` (the runtime override) wins over `rule.progress`.

`state` never contains the author.

`isEmoteOnly` is true when there is at least one emote fragment or emoji, and every text
fragment is only whitespace, emoji, ZWJ, variation selectors or skin tones. Digits do not
count as emoji.

- [ ] **Step 1: Write failing tests.** Cover:
  - one question per rule, keyed by rule id;
  - custom rule criteria map to `true`/`false`;
  - the author is absent from `state`;
  - `replying_to` is present only for replies;
  - emote meanings only for emotes present;
  - antispoiler `work: auto` uses the category;
  - runtime progress overrides the rule;
  - `spoiler_guard` is absent without an antispoiler rule;
  - `isEmoteOnly` cases: emote only is true, emoji only is true, "1111" is false, emote
    plus a word is false, the empty string is false.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `message.ts`, `packs.ts` and `request.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): packs and Jev request builder`

---

### Task 4: Decision and combination

**Files:**
- Create: `packages/engine/src/decide.ts`
- Test: `packages/engine/tests/decide.test.ts`

**Interfaces:**
- Consumes: `Rule`, `Thresholds`, `thresholdsFor`, `isPackRule`.
- Produces:
```ts
type Band = "act" | "unsure" | "none";
function band(p: number, t: Thresholds): Band;            // unsure is clamped to <= act
interface RuleVerdict { ruleId: string; action: Action; probability: number; band: Band }
interface Outcome {
  verdicts: RuleVerdict[];
  moderation: { ruleId: string; action: "delete" | "timeout" | "log"; seconds?: number; downgraded: boolean } | null;
  highlight: RuleVerdict | null;          // best acting highlight rule, if allowed
  suggestion: RuleVerdict | null;         // best unsure highlight rule, if allowed
  uncertain: RuleVerdict[];               // unsure moderation rules
  spoiler: boolean;                       // antispoiler rule is act or unsure
}
function combine(probabilities: Record<string, number>, rules: Rule[], defaults: Thresholds, opts: { emoteOnly: boolean }): Outcome;
```

The strongest acting moderation rule wins (timeout 3 > delete 2 > log 1). A tie goes to the
higher probability, and a timeout tie to the longer `seconds`. With `emoteOnly`,
delete/timeout become `log` with `downgraded: true`. Highlight and suggestion are `null`
when `moderation !== null` or `spoiler`. Rules missing from `probabilities` are skipped.

- [ ] **Step 1: Write failing tests.** Cover:
  - band edges at 0.85/0.5, and unsure > act clamped;
  - timeout beats delete;
  - emote-only downgrade;
  - moderation suppresses highlight;
  - a spoiler in the unsure band suppresses highlight;
  - unsure moderation goes to `uncertain`;
  - unsure highlight goes to `suggestion`;
  - per-rule `act` overrides the default.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): per-rule decision and combination`

---

### Task 5: Chat commands and replies

**Files:**
- Create: `packages/engine/src/commands.ts`, `packages/engine/src/replies.ts`
- Test: `packages/engine/tests/commands.test.ts`

**Interfaces:**
- Produces:
```ts
type Command =
  | { kind: "pause" } | { kind: "resume" } | { kind: "status" } | { kind: "clear" }
  | { kind: "progress"; text: string }
  | { kind: "rule"; id: string; enabled: boolean }
  | { kind: "highlight"; text?: string }
  | { kind: "invalid" };
function parseCommand(text: string): Command | null;   // null = not a !vigia command
type ReplyKey = "paused" | "resumed" | "progress" | "ruleOn" | "ruleOff" | "unknownRule" | "highlightUsage" | "cleared" | "status" | "help";
function reply(lang: "en" | "es", key: ReplyKey, vars?: Record<string, string>): string;
```

- A leading `@name ` mention, which Twitch adds to replies, is stripped.
- `!vigia` is matched case-insensitively.
- Aliases: `pausa`, `sigue`, `progreso`, `regla`, `destaca`, `limpia`, `estado`, and `on/off`
  plus `si/no` for rules.
- Quoted text may use `"…"`, `“…”` or no quotes.
- `status` takes `{rules, paused, observe}` vars only, so there is no topic channel.

- [ ] **Step 1: Write failing tests.** Cover:
  - every command and alias;
  - `@bob !vigia destaca`;
  - `!vigia progreso “llegó a Liurnia”`;
  - `!vigiatest` is `null`;
  - `hola` is `null`;
  - `!vigia` alone and `!vigia foo` are `invalid`;
  - `!vigia rule x maybe` is `invalid`;
  - `reply("es","paused")` differs from `en`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): !vigia chat commands with es/en replies`

---

### Task 6: Priority queue with load shedding

**Files:**
- Create: `packages/engine/src/priority-queue.ts`
- Test: `packages/engine/tests/priority-queue.test.ts`

**Interfaces:**
- Produces:
```ts
class DroppedError extends Error {}
function createPriorityQueue(o: { concurrency: number; maxPending: number }): {
  push<T>(task: () => Promise<T>, priority: "high" | "low"): Promise<T>;
  pending(): number;
};
```
High tasks start before low ones and are never dropped. When pending exceeds `maxPending`,
the **oldest low** task is rejected with `DroppedError`, and if there are no low tasks,
nothing is dropped.

- [ ] **Step 1: Write failing tests.** Cover:
  - the concurrency cap;
  - high jumps ahead of low;
  - the oldest low is dropped when over the limit;
  - high is never dropped.
- [ ] **Step 2–4:** Run (fail), implement, run (pass).
- [ ] **Step 5: Commit** `feat(engine): priority queue that sheds highlight work first`

---

### Task 7: The engine

**Files:**
- Create: `packages/engine/src/engine.ts`, `packages/engine/src/evaluator.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/tests/engine.test.ts`

**Interfaces:**
- Consumes: everything above; `evaluate`, `AuthError` and `ClientOptions` from `@vigia/core`.
- Produces:
```ts
type Evaluator = (state: unknown, questions: Record<string, BooleanQuestion>) => Promise<Record<string, number>>;
function jevEvaluator(o: ClientOptions): Evaluator;
interface ChatPlatform {
  deleteMessage(messageId: string): Promise<void>;
  timeout(userId: string, seconds: number, reason: string): Promise<void>;
  sendChat(text: string, replyToId?: string): Promise<void>;
}
interface HighlightItem { id: string; kind: "question" | "highlight" | "announcement"; text: string; authorName?: string; fragments?: Fragment[]; ruleId?: string; source: "rule" | "command" }
interface RuntimeState { paused: boolean; observe: boolean; halted: boolean; progress?: string; category?: string; disabledRules: string[]; protectedTopicCount: number }
type EngineEvent =
  | { type: "decision"; message: ChatMessage; outcome: Outcome; applied: boolean }
  | { type: "highlight"; item: HighlightItem }
  | { type: "clear-highlight" }
  | { type: "state"; state: RuntimeState }
  | { type: "warning"; code: "jev-unavailable" | "jev-auth" | "platform-error" | "dropped"; detail: string };
interface EngineOptions { config: VigiaConfig; platform: ChatPlatform; evaluate: Evaluator; observe?: boolean; concurrency?: number; maxPending?: number }
function createEngine(o: EngineOptions): {
  handleMessage(m: ChatMessage): Promise<void>;
  updateConfig(text: string): ConfigResult;   // keeps the old config when invalid
  setConfig(c: VigiaConfig): void;
  setCategory(name: string | undefined): void;
  setProtectedTopics(topics: string[]): void;
  setObserve(on: boolean): void;
  setEvaluator(e: Evaluator): void;           // clears `halted`
  state(): RuntimeState;
  on(listener: (e: EngineEvent) => void): () => void;
};
```

`handleMessage`:
1. **Commands.** If `parseCommand` is not null and the author is the broadcaster or a
   moderator, run the command, reply with `sendChat(text, m.id)`, and return. A non-null
   command from a viewer continues as a normal message.
2. **Stop early** when `halted` is set.
3. **Pick the rules:**
   - start from enabled rules (not in `disabledRules`);
   - if the author is exempt, keep only highlight rules;
   - if the author is the broadcaster and not `includeBroadcaster`, drop highlight rules;
   - if `paused`, drop moderation rules.
   - Stop if nothing is left.
4. **Queue** the request with priority `high` when any moderation rule is included.
5. **Evaluate, then `combine`.**
6. **Apply:**
   - delete/timeout go to the platform only when `!observe`, with `applied` reflecting that;
   - a highlight emits a `highlight` event only in `auto` mode, and `approve` leaves it as
     the outcome's suggestion.
   - Emit `decision` for every evaluated message.
7. **Errors:**
   - `AuthError` sets `halted`, and emits `warning jev-auth` and `state`;
   - `DroppedError` emits `warning dropped`;
   - any other evaluator error emits `warning jev-unavailable`;
   - platform errors emit `warning platform-error`.
   - None of them throw from `handleMessage`.

Commands:
- **`progress`** sets the runtime progress.
- **`rule`** toggles `disabledRules` after checking the id exists, and replies
  `unknownRule` otherwise.
- **`highlight`:**
  - as a reply, it highlights the parent message with kind `highlight`;
  - with text, it creates an `announcement`;
  - otherwise it replies `highlightUsage`.
- **`clear`** emits `clear-highlight`.
- **`status`** lists enabled rule ids and flags.
- **`invalid`** replies `help`.

Every state change emits `state`.

- [ ] **Step 1: Write failing tests** with a fake platform that records calls and a fake
  evaluator returning fixed probabilities. Cover:
  - observe mode does not call the platform, and `applied` is false;
  - live mode deletes;
  - a mod's `!vigia pause` stops moderation, and the command text is not evaluated;
  - a viewer's `!vigia pause` is evaluated normally;
  - an exempt mod is evaluated only for highlight rules;
  - broadcaster highlights are skipped by default;
  - a reply highlight emits a `highlight` event with the parent text;
  - `AuthError` halts, and later messages are not evaluated until `setEvaluator`;
  - a network error emits a warning, and the next message still works;
  - `updateConfig` with invalid YAML returns errors and keeps the old rules;
  - `status` never contains a protected topic string;
  - an antispoiler-flagged message never produces a `highlight` event.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `evaluator.ts` (maps `evaluate()` boolean answers to probabilities), `engine.ts` and `index.ts` (public exports).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(engine): createEngine pipeline with commands, observe mode and error handling`

---

### Task 8: Example config and the simulate script

**Files:**
- Create: `packages/engine/examples/vigia.yaml` (the spec's example, English keys), `packages/engine/scripts/simulate.ts`
- Modify: `packages/engine/package.json` (script `simulate: tsx scripts/simulate.ts`)
- Test: `packages/engine/tests/example.test.ts`

The script loads `examples/vigia.yaml`, reads `apps/demo/src/data/messages.json`, and feeds
every message through `createEngine` with a console-logging fake platform in live
(non-observe) mode. It prints one line per decision: `[DELETE toxicity 0.93] text`,
`[HIGHLIGHT questions 0.91] text`, `[UNSURE spoilers 0.62] text`, and so on.

- With `AI_GATEWAY_API_KEY` set, it uses `jevEvaluator`.
- Without it, it uses an offline evaluator backed by `replay.json`: `toxicity` =
  `offensive`, `spam` = `categoryProbabilities.spam`, and every other rule 0. It prints a
  notice that only those two rules are simulated offline.

- [ ] **Step 1: Test** that the example file parses with no errors and has the five packs
  plus one custom rule.
- [ ] **Step 2: Implement** the example file and the script.
- [ ] **Step 3: Run** `pnpm simulate | tail -20`. Expected: decision lines and a summary count.
- [ ] **Step 4: Commit** `feat(engine): example config and offline simulate script`
