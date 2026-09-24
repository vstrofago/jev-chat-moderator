# Vigia M3: Server + OBS Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable Vigia host (`startVigia()`). It loads `vigia.yaml`, watches it and
writes changes back, stores history in SQLite, runs the highlight queue, and serves the OBS
overlay over HTTP + WebSocket. It ships a headless `vigia` CLI and a Docker + Caddy
setup. The overlay must be demoable with **real chat and no Twitch account**, using the
read-only source.

**Architecture:**
- `packages/server` is a library used by both apps: the headless CLI (here) and Electron
  (M5).
- The engine stays pure. HTTP, files and SQLite live in `packages/server`.
- `packages/ui` holds the web UI, built with Vite: only the overlay in M3, with the wizard
  and dashboard in M4.
- `apps/server` is the CLI entry point plus the Dockerfile and compose files.

**Tech Stack:** `node:sqlite` (built in, no native module), `ws` (WebSocket server),
`node:http`, Vite (UI build), `yaml` (Document API, to keep comments on write-back).

**Spec:** `docs/superpowers/specs/2026-09-23-vigia-design.md`

## Author decisions carried in

- The author can't register a Twitch app yet (no 2FA), so every M3 feature must run on the
  read-only source (`--source observe:<channel>`).
- A real-account check is a launch blocker (see M6).

## Global Constraints

- The M1 and M2 constraints still hold.
- Protected spoiler topics are never written to `vigia.yaml`, because the streamer reads
  that file. They live in SQLite.
- Secrets (the Jev key, Twitch tokens, the overlay token) are never in the YAML.
- Server mode binds `127.0.0.1` by default. Exposing it needs an explicit
  `--host 0.0.0.0` (Docker sets it).
- The overlay endpoint requires the overlay token. A wrong or missing token gets 401 and
  no data.

## Rulings made while planning

- **HTTP server and storage live in `packages/server`, not `packages/engine`.** This keeps
  the engine pure and testable. The spec put them in "engine", and the cost of this choice
  is one package name.
- **What gets persisted, and where:**
  - `observe` and each rule's `enabled` go in the YAML, which gains two optional keys.
  - Anti-spoiler `progress` is written into the antispoiler rule's `progress`.
  - `paused` is session-only, because a pause is meant to be temporary.
  - Protected topics and the overlay token go in SQLite settings.
- **Third-party emotes** carry an image URL so the overlay can draw them. `Fragment`'s
  emote variant gains an optional `imageUrl`.

## Review Focus

1. **A hand edit that breaks the YAML** while Vigia runs keeps the old rules and reports
   the error, and a later fix is picked up (Task 2 test).
2. **Write-back keeps the user's comments** and formatting in `vigia.yaml` (Task 2 test).
3. **The overlay without the right token** gets 401 on both HTTP and WS (Task 5 test).
4. **Highlights arriving faster than they are shown** queue up to a cap (20) and drop the
   oldest. A clear empties the current card (Task 4 test).
5. **SQLite grows without bound** unless pruned. It keeps the last 7 days or 50,000
   decisions, whichever is smaller (Task 3 test).

---

### Task 1: Engine additions

- Config gains `observe?: boolean` (default `true`) and a per-rule `enabled?: boolean`
  (default `true`).
- The engine seeds `observe`, `disabledRules` and `progress` from the config on create and
  on `setConfig`/`updateConfig`.
- `Fragment` emote gains `imageUrl?: string`. `loadThirdPartyEmotes` returns
  `Map<name, imageUrl>`, and `withThirdPartyEmotes` sets `imageUrl` from it.
- Tests: the config defaults, seeding from config, and the emote URLs.

### Task 2: Config file manager (`packages/server/src/config-file.ts`)

`openConfigFile(path, { onChange, onError })` returns
`{ config, text, update(mutator), close }`.
- It creates the file from `examples/vigia.yaml` when missing.
- It watches the file with a debounce (200 ms), and ignores the echo of its own writes.
- `update` applies the change with the `yaml` Document API, so comments stay, and writes
  atomically (a temp file, then a rename).
- `persistState(engineState)` maps `observe`, `disabledRules` and `progress` into the file.
- Tests (temp dir):
  - creating a missing file;
  - picking up an external edit;
  - a broken edit reports errors and keeps the old config;
  - write-back keeps comments;
  - its own writes don't fire `onChange`.

### Task 3: Store (`packages/server/src/store.ts`)

`openStore(path)` returns an object with:
- `recordDecision(event)`;
- `recentDecisions(limit)`;
- `uncertain(limit)`;
- `setting(key)`, `setSetting(key, value)`;
- `prune(now)`.

The `decisions` table has `id`, `ts`, `message_id`, `author`, `text`, `outcome_json`,
`applied` and `spoiler`. A `settings(key, value)` table holds `protectedTopics` and
`overlayToken`. Tests use `:memory:` and cover:
- round trips;
- the uncertain filter;
- pruning by age and count;
- that settings persist across reopen (with a temp file).

### Task 4: Highlight queue (`packages/server/src/highlights.ts`)

`createHighlightQueue({ seconds, max: 20, onShow, onClear })` provides `push(item)`,
`clear()` and `current()`. It shows one item at a time for `seconds`, then the next. Tests
with fake timers:
- items are shown in order;
- the cap drops the oldest queued item;
- `clear` hides the current item and shows the next one only after the timer.

### Task 5: HTTP + WebSocket host (`packages/server/src/host.ts`) and overlay UI

`startVigia({ configPath, dataDir, source, evaluate, host, port })`:
- wires the config file, engine, store, highlight queue and source together;
- serves `packages/ui/dist` (`/overlay`);
- serves WS `/ws/overlay?key=` (pushes `show` and `clear`);
- serves `GET /health`.

A source is `(engine) => { close() }`. The two sources are `observeSource(channel)`
(read-only IRC plus third-party emotes, with the engine forced into observe mode) and
`twitchSource(...)` (M2's `connectTwitch`).

The overlay (`packages/ui/overlay.html` + `src/overlay.ts`, built with Vite):
- a transparent background;
- a card with author, text and emote images (Twitch CDN, or the third-party `imageUrl`);
- a type label (question, highlight or announcement) in en/es;
- themes `?theme=default|minimal|neon`;
- reconnects with backoff.

Tests use real HTTP on port 0:
- the overlay page is served;
- 401 without a key (HTTP and WS);
- a highlight from the engine reaches the WS client;
- `/health` works.

### Task 6: `vigia` CLI + Docker

`apps/server/src/cli.ts` (`pnpm vigia` / `node` in Docker):
- flags `--config`, `--data`, `--host`, `--port`, and `--source observe:<channel>|twitch`;
- the Jev key comes from the environment;
- it prints the overlay URL with its key.

`apps/server/Dockerfile` and `apps/server/docker-compose.yml` (with Caddy, where the domain
comes from `VIGIA_DOMAIN`).

- A smoke test runs `startVigia` with a fake source and checks the printed URL.
- The Docker build is checked when the socket is accessible; otherwise it is recorded as
  unverified.
