# Vigía M2: Twitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the engine to Twitch. The first part is a read-only calibration tool,
`pnpm observe <channel>`, which runs Vigía in observe mode on any public channel's live
chat. The later tasks are the real integration: OAuth, EventSub, Helix and the
`ChatPlatform` adapter.

**Architecture:** A new `packages/twitch` depends on `@vigia/engine` for the `ChatMessage`
and `ChatPlatform` types. The engine never depends on Twitch.
- The read-only tool reads public chat through Twitch's anonymous IRC-over-WebSocket
  (`justinfan` login, no account). It is a **development tool only**: it never writes to
  chat, never stores messages, and is not part of the product.
- The product path uses EventSub + Helix with the streamer's own app.

**Tech Stack:** TypeScript, Node's global `WebSocket` (Node >= 22), Vitest and tsx.

**Spec:** `docs/superpowers/specs/2026-09-23-vigia-design.md`

## Decisions from the author (2026-09-23)

- The author is not a streamer and will not create a second Twitch account.
- Moderation flows (delete, timeout, EventSub) are tested with the **Twitch CLI mock**
  servers.
- The author's own account is used only to try `!vigia` commands (as broadcaster).
- The read-only tool comes first, to calibrate packs against real chat.

## Global Constraints

- Everything from the M1 plan's Global Constraints still holds.
- The read-only tool never sends chat messages, never calls Helix, and never writes chat
  to disk.
- It rate-limits Jev calls, 1 message per second by default, so watching a huge channel
  cannot run up a bill.

## Review Focus

1. **Emote positions** are Unicode code points, not UTF-16 units. A message with emoji
   before an emote must still cut the emote out correctly (Task 1 test).
2. **Escaped tag values** (`\s`, `\:`, `\\`) in reply-parent bodies and display names are
   unescaped (Task 1 test).
3. **Server PING and RECONNECT** get a PONG or a reconnect. A dropped socket reconnects with
   backoff and does not crash (Task 2 tests).
4. **A channel that doesn't exist** (or a typo) is reported clearly and does not hang
   silently (Task 2: a warning when no ROOMSTATE arrives within 10 s).
5. **Rate limit:** messages over the limit are counted as skipped, never queued without
   bound (Task 3 test).

---

### Task 1: IRC message parser

**Files:** Create `packages/twitch/package.json` and `packages/twitch/src/irc.ts`. Test in `packages/twitch/tests/irc.test.ts`.

**Produces:**
```ts
interface IrcLine { tags: Record<string, string>; prefix?: string; command: string; params: string[] }
function parseIrcLine(line: string): IrcLine;
function toChatMessage(line: IrcLine): ChatMessage | null;   // null unless PRIVMSG
```

Mapping from IRC tags:
- `id` → `id`;
- `user-id` → `author.id`;
- `display-name` → `displayName` (falling back to the login from the prefix);
- `badges` → `broadcaster`, `moderator`, `vip`;
- `emotes` (`id:start-end,start-end/id2:…`, code point indices) → `fragments`;
- `reply-parent-msg-id`, `reply-parent-msg-body` and `reply-parent-user-login` → `replyTo`.

- [ ] Test: parse tags, prefix, command and trailing param.
- [ ] Test: tag unescaping.
- [ ] Test: badges map to roles.
- [ ] Test: emote fragments, including emoji before an emote.
- [ ] Test: replies.
- [ ] Test: non-PRIVMSG lines return null.
- [ ] Run (fail), implement, run (pass), then commit `feat(twitch): parse Twitch IRC chat lines`.

### Task 2: Read-only chat reader

**Files:** Create `packages/twitch/src/irc-reader.ts`. Test in `packages/twitch/tests/irc-reader.test.ts`.

**Produces:**
```ts
interface ReaderEvents { message(m: ChatMessage): void; status(s: "connecting" | "joined" | "reconnecting" | "closed", detail?: string): void; warning(text: string): void }
function readChannel(channel: string, on: ReaderEvents, o?: { WebSocket?: typeof WebSocket; backoffMs?: number; joinTimeoutMs?: number }): { close(): void };
```

- Connects to `wss://irc-ws.chat.twitch.tv:443` and sends `CAP REQ :twitch.tv/tags twitch.tv/commands`,
  `PASS SCHMOOPIIE`, `NICK justinfan<random>` and `JOIN #<channel lowercased>`.
- Replies to PING with PONG, and reconnects on RECONNECT or close with backoff
  (1 s, 2 s, 4 s … up to 30 s).
- ROOMSTATE means `joined`. A warning fires if no ROOMSTATE arrives within `joinTimeoutMs`
  (default 10 s).
- A frame may carry several `\r\n`-separated lines.
- It never sends PRIVMSG.

- [ ] Tests use a fake WebSocket class. Cover:
  - the handshake order;
  - PING → PONG;
  - several lines in one frame;
  - PRIVMSG → `message`;
  - close → reconnect after the backoff;
  - `close()` stops reconnecting;
  - the join timeout warning;
  - nothing starting with `PRIVMSG` is ever sent.
- [ ] Run (fail), implement, run (pass), then commit `feat(twitch): anonymous read-only chat reader`.

### Task 3: `pnpm observe <channel>`

**Files:**
- Create `packages/twitch/src/rate-gate.ts` and `packages/twitch/scripts/observe.ts`.
- Modify `packages/engine/src/evaluator.ts`: add `onUsage(inputTokens)` so the tool (and
  later the Stats tab) can estimate cost.
- Modify the root `package.json` (script `observe`).
- Test in `packages/twitch/tests/rate-gate.test.ts` and `packages/engine/tests/engine.test.ts` (usage).

**Produces:**
```ts
function createRateGate(perSecond: number, now?: () => number): { allow(): boolean; skipped(): number };
// evaluator.ts
interface JevEvaluatorOptions extends Partial<RetryOptions> { onUsage?(inputTokens: number): void }
function jevEvaluator(o: ClientOptions, opts?: JevEvaluatorOptions): Evaluator;
```

Usage: `pnpm observe <channel> [--rules path.yaml] [--rate 1] [--category "Elden Ring"]`.
- Requires `AI_GATEWAY_API_KEY` (or `TYPESAFE_API_KEY`).
- The engine always runs in **observe mode** with a no-op platform whose methods throw if
  called, as a guard.
- Output: one line per decision with rule, band and probability, plus every 30 s a summary
  of messages seen, evaluated, skipped by the rate limit, actions it *would* take, and the
  estimated cost per hour ($0.042 per million input tokens).
- Nothing is written to disk.

- [ ] Test the rate gate:
  - it allows N per second;
  - it counts skips;
  - it recovers in the next second.
- [ ] Test that `jevEvaluator` reports `inputTokens` through `onUsage`.
- [ ] Implement, run the tests and typecheck, then commit `feat(twitch): pnpm observe <channel> read-only calibration tool`.

### Task 4: Third-party emotes (7TV, BTTV, FFZ)

Found while observing real chat: in big channels most emotes are 7TV/BTTV/FFZ words that
Twitch sends as plain text, so Jev reads them as gibberish ("databaseEZ" came out as
possible spam).
- `loadThirdPartyEmotes(twitchUserId)` loads global and channel emote names from the three
  public APIs (no login, called from the streamer's machine). A 404 means no account there,
  and a failing provider only produces a warning.
- `withThirdPartyEmotes(message, names)` turns whole matching words into emote fragments.
- The engine's `buildRequest` labels any emote without a known meaning as "an emote" and
  ships meanings for common third-party emotes (KEKW, Sadge, monkaS, …).
- The IRC reader reports the channel id (`room`) from ROOMSTATE, and `observe` loads the
  emotes after joining.

### Later tasks (detailed when reached)

4b. OAuth spike (device code flow + implicit flow for Public clients). Needs the author's
   client ID.
5. EventSub WebSocket client (`channel.chat.message`, `channel.update`,
   `channel.moderator.add/remove`), tested against `twitch event websocket start-server`.
6. Helix client (delete, timeout, ban, send chat, moderators, channel info), tested with an
   injected fetch and `twitch mock-api`.
7. `ChatPlatform` adapter plus category tracking wired into the engine.
