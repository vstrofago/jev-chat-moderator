# Vigía — Design

**Date:** 2026-09-23
**Status:** Draft, pending review
**Supersedes:** the "future plugin" note in `2026-09-22-chat-moderator-design.md`

## Purpose

Vigía ("lookout") is a free, open-source, **self-hosted chat watchman for Twitch
streamers**, powered by TypeSafe AI's Jev. It grows out of the `jev-chat-moderator`
playground, and this repository is renamed to `vigia`.

It is an open-source portfolio project, not a product for sale. Success means streamers
actually install it and the community contributes rules, packs and translations.

What it does that AutoMod and the usual bots cannot:

1. **Custom rules in plain language.** Each rule is a question for Jev ("is this unsolicited
   backseating?"), not a word list.
2. **Anti-spoiler protection** that never makes the streamer spoil themselves.
3. **Triage and highlights.** Questions and interesting messages go to an OBS overlay.
4. **Automatic moderation** (delete, timeout), with a **log of uncertain messages** instead
   of guessing.
5. **An optional live dashboard**, for small streamers on their own PC and for teams of
   mods on a server.

**Success looks like:**

- A non-technical streamer downloads the Windows app, follows the setup wizard in about
  ten minutes, and sees chat questions highlighted in OBS with real chat.
- A team runs the same program on its own VPS with Docker, and its mods log in with Twitch.
- The README shows measured accuracy for every bundled pack.

## Hard constraints

- **The author hosts and operates nothing.** No shared Twitch app, no shared client ID,
  no hosted service, no proxy. The author publishes only source code, GitHub Releases, a
  GHCR image, and the existing static demo on GitHub Pages.
- **The streamer owns everything:** their own Twitch app (client ID), their own Jev key,
  and their own machine or VPS. No chat message and no key ever reaches the author.
- **Twitch only** at launch. Kick is a later adapter and is out of scope here.
- **One public release with every feature in this spec.** Internal milestones exist for
  building and testing, but nothing is published until all of them are done.
- **Bilingual:** everything technical (code, YAML keys, pack names) is in English;
  everything a user sees is in English and Spanish.

## Out of scope

Kick; automatic bans (bans are manual only); remote mod access to the *desktop* app (teams
use server mode); paid Apple signing and notarization; game-specific spoiler packs
written by us (we ship the format, and the community writes the packs).

## Architecture

```
vigia/
  packages/
    core/      existing src/core: evaluate(), moderate(), queue, decide()
    engine/    rules, message pipeline, chat commands, state, logs, HTTP + WebSocket server
    twitch/    OAuth (device code), EventSub WebSocket client, Helix client
    ui/        one web UI: setup wizard + dashboard + OBS overlay (static files)
  apps/
    desktop/   Electron: window showing ui, tray icon, start with OS, auto-update
    server/    headless CLI + Dockerfile + docker-compose (with Caddy for HTTPS)
    demo/      the current Astro playground, still published on GitHub Pages
```

- `engine` is a library. Both apps call `startVigia(config)`. All logic lives in the
  engine, and the apps are thin shells around it.
- The engine serves `ui` over HTTP and pushes live events over WebSocket. The Electron
  window, the mods' browsers and the OBS browser source are all clients of the same server.
- `ui` is not a website. It is bundled into the program and served by each streamer's own
  Vigía.
- **Why Electron and not Tauri:** the engine is Node, so Tauri would have to ship a Node
  sidecar anyway, and its size advantage would disappear. Electron keeps the whole project
  in TypeScript, and `electron-updater` updates straight from GitHub Releases.
- The monorepo uses pnpm workspaces (already the package manager).

### Storage

- **Rules and settings:** one YAML file (`vigia.yaml`), readable and shareable. The engine
  watches it and hot-reloads. Dashboard edits and chat commands write back to the same file.
- **History, uncertain log and audit trail:** SQLite through the built-in `node:sqlite`,
  so there are no native modules to package. *To verify first:* Electron's bundled Node
  version ships `node:sqlite`. If it doesn't, fall back to newline-delimited JSON files.
- **Secrets never go in the YAML:**
  - Desktop: Twitch tokens and the Jev key are encrypted with Electron `safeStorage`
    (OS keychain).
  - Server: environment variables.
  - Because of this, sharing a rules file never leaks a key.

## Rules

A rule is **a question for Jev plus what to do with the answer**. All active rules for a
message go to Jev in **one** call, since Jev answers several questions per request.

```yaml
version: 1
language: es                 # bot replies in chat; es | en (the UI follows each viewer's own choice)
defaults: { act: 0.85, unsure: 0.5 }
exempt: [broadcaster, moderators, vips]   # exempt from moderation only
highlights:
  mode: auto                 # auto | approve
  seconds: 12
  includeBroadcaster: false  # evaluate the streamer's own messages for highlights

emotes:                      # meaning of the channel's own emotes
  miCanalLlora: "sadness, crying"

rules:
  - id: toxicity
    pack: toxicity           # bundled pack
    action: timeout
    seconds: 60

  - id: spoilers
    pack: antispoiler
    action: delete
    # everything below is optional
    work: auto               # auto = current Twitch category
    progress: "just reached Liurnia"

  - id: backseat             # a rule written by the streamer
    question: "Does the message tell the streamer how to play without being asked?"
    yes: "Gives unrequested instructions or advice about the game"
    no: "Reactions, jokes, or answers to something the streamer asked"
    action: delete
    act: 0.9                 # per-rule threshold

  - id: questions
    pack: questions
    action: highlight
```

A bad file fails with a clear message (for example, "line 12: `action` must be delete,
timeout, highlight or log"), and the engine keeps running the last valid configuration.

### Actions and decision

Actions: `delete`, `timeout` (with `seconds`), `highlight`, `log`. A rule can never ban.

For each rule, given Jev's probability `p`:

- `p >= act` → the rule's action.
- `unsure <= p < act` → an entry in the **uncertain log**. For `highlight` rules this
  becomes a *suggested highlight* instead.
- `p < unsure` → nothing.

**Combining rules:**
- The strongest moderation action wins: timeout > delete > log.
- A moderated message is never highlighted.

**Special cases:**
- **Emote-only messages** (only emotes or emoji, detected from EventSub fragments):
  moderation actions are downgraded to `log`, because meaning read from emotes alone is
  too ambiguous to act on.
- **Exempt authors** (broadcaster, mods and VIPs by default) are skipped by moderation
  rules but still evaluated by highlight rules. The broadcaster is the exception: they are
  left out of automatic highlights unless `includeBroadcaster: true`.
- **Paused mode** (`!vigia pause`) stops moderation actions. Highlights continue.
- **Observe mode** is the state right after setup: every decision is logged as "would
  have deleted/timed out", but nothing is done. The streamer switches it off in the
  dashboard when they trust the rules.

### What Jev receives

`state` holds:
- the message text;
- the parent message, when the message is a reply;
- the meanings of any emotes it contains (from `emotes:` and a built-in table for global
  emotes);
- each rule's context (for example work and progress).

No username or other personal data is sent.

Bundled packs are written in English, where Jev is strongest, and work on messages in any
language. Custom rules may be written in any language; the docs recommend English.

### Bundled packs

| Pack | Kind | Purpose |
|---|---|---|
| `toxicity` | moderation | The playground's `offensive` question (every rule is one yes/no question; spam lives in its own pack) |
| `spam` | moderation | Scams, selling followers, self-promotion, flooding |
| `antispoiler` | moderation | See below |
| `questions` | highlight | Messages that ask the streamer something |
| `interesting` | highlight | Notable messages: milestones, useful tips the streamer asked for, heartfelt messages |

### Anti-spoiler

The rule is that **the streamer never has to write, read or see a spoiler.** There are three
layers.

1. **Detect the shape of a spoiler, not its content.** This is the default and needs no
   setup.
   - Jev is asked whether the message reveals or hints at plot: deaths, twists, hidden
     identities, the ending, "wait until you see what happens".
   - `work` defaults to the current Twitch category, read from Helix and kept up to date
     through the `channel.update` EventSub subscription.
   - `progress` is optional. With it, only what happens *after* that point counts. Without
     it, any plot reveal counts. That is stricter and catches some talk about parts the
     streamer has already seen, which is an accepted trade-off.
   - We do not know how much Jev knows about any given game or show. Its accuracy is
     measured by the pack eval before the README makes any claim.
2. **A hidden topic list filled in by mods.** Mods add concrete topics ("the fate of
   Ranni") in the dashboard only. The broadcaster role sees just the count ("3 protected
   topics, added by @mod"). There is deliberately no chat command to add topics, because
   typing one would publish the spoiler.
3. **Vigía never spoils either.**
   - Messages flagged by the anti-spoiler rule are blurred everywhere in the dashboard,
     including the live feed and the uncertain log, and are revealed only on click.
   - They are never highlighted and never quoted in bot replies.

**Community spoiler packs.** A spoiler pack is a YAML file keyed by Twitch category id.
- It holds protected topics, optionally grouped under **checkpoints with non-spoiler
  names** ("Chapter 3", "Region: Liurnia").
- Vigía loads the matching pack automatically when the stream category changes. The
  streamer can pick a checkpoint without ever reading the topics.
- Without a checkpoint, every topic in the pack is protected.
- The launch ships the format, the loader, the docs and a `CONTRIBUTING` guide. It does
  not ship game packs; the README invites the community to write them.

## Message flow

```
EventSub channel.chat.message
  → "!vigia ..." from broadcaster or mod?  → run the command, reply in chat
  → author exempt from moderation?          → evaluate highlight rules only
  → queue → Jev: all applicable rules in one call
  → decide each rule → combine (strongest action wins)
  → Helix (delete / timeout) · overlay (highlight) · SQLite (log, history)
  → WebSocket event to dashboards
```

- **Queue.** Concurrency is configurable, with a default of 8. When the queue is full (for
  example during a raid), the oldest pending messages are dropped **for highlight rules
  only**. Moderation keeps priority.
- **Jev down or no network.** Messages pass unmoderated, so chat is never blocked. The
  dashboard shows a warning, and retries honor `retry-after`.
- **Invalid Jev key.** Everything pauses and the dashboard asks for a new key.
- **Twitch disconnects.** EventSub reconnects with backoff, following Twitch's
  `session_reconnect` messages.

### Chat commands

Only the broadcaster and mods can use them; anyone else is silently ignored. Every command
has an English name and a Spanish alias. The bot replies in the configured language.

| Command | Alias | Effect |
|---|---|---|
| `!vigia pause` / `resume` | `pausa` / `sigue` | Stop or restart moderation actions (highlights continue) |
| `!vigia progress "…"` | `progreso` | Set anti-spoiler progress (progress is not a spoiler) |
| `!vigia rule <id> on/off` | `regla` | Enable or disable a rule |
| `!vigia highlight [text]` | `destaca` | As a reply: highlight that message. With text: show it as an announcement |
| `!vigia clear` | `limpia` | Remove the current highlight from the overlay |
| `!vigia status` | `estado` | Reply with the active rules and paused/observe state (never the spoiler topics) |

**Acting account.** By default this is the broadcaster's own account, which is already a
mod of its own channel. An optional separate bot account (which must be a mod) keeps replies
from appearing under the streamer's name.

## Overlay

- **URL:** `/overlay?key=<token>`. The key is a read-only token generated by Vigía, which
  the wizard shows ready to paste into an OBS browser source. The token is required because
  in server mode the URL is public.
- **Card:** author, message with emotes rendered from Twitch's CDN, and a type label
  (question, highlight or announcement), on a transparent background.
- **Queue:** one highlight at a time, shown for `highlights.seconds`, or advanced manually by
  a mod.
- **Highlight modes:**
  - `auto`: Jev's highlights go straight to the overlay.
  - `approve`: they arrive in the dashboard as suggestions for a mod to approve.
- **Ways to highlight:**
  - an automatic rule;
  - `!vigia highlight` as a reply to any message, including the streamer's own or a mod's;
  - an announcement with free text;
  - dashboard buttons.
- **Styling:** two or three bundled themes, plus custom CSS.

## Dashboard

| Tab | Contents |
|---|---|
| Live | Chat with each message's decision and per-rule probabilities; manual delete, timeout, **ban** and highlight |
| Uncertain | The uncertain log, with apply and dismiss |
| Highlights | Queue, suggestions, show now, clear, create announcement |
| Rules | Create and edit rules, toggle them, threshold sliders, anti-spoiler topics (mods only) |
| Settings | Twitch connection, Jev key, exemptions, language, bot account, observe mode |
| Stats | Messages per minute, actions taken, estimated Jev cost per hour |

- Moving a threshold slider **re-evaluates recent messages instantly without calling Jev
  again**, using the stored probabilities, as the playground does.
- Every rule has a **test box**: type a sample message and see the probability. This is
  how streamers tune custom rules.

## Access and security

- **Desktop:**
  - Binds to `127.0.0.1` only, so nothing outside the streamer's PC can connect.
  - The dashboard has no login, because it is the streamer's own machine.
- **Server:**
  - Mods sign in with Twitch. Vigía checks that the user is the broadcaster or on the
    channel's moderator list.
  - The moderator list is fetched with `GET /moderation/moderators` and kept current
    through EventSub `channel.moderator.add` / `channel.moderator.remove`. A removed mod
    loses access immediately.
  - The session is an HttpOnly, Secure, SameSite=Lax cookie.
  - `docker-compose` includes Caddy, which gets an HTTPS certificate automatically for the
    streamer's domain.
- **Roles:**
  - The broadcaster can do everything.
  - Mods can do everything except change keys, the Twitch connection and access settings.
  - Anti-spoiler topics are hidden from the broadcaster role.
- **Audit:** every manual action is stored with the user who did it.
- **Claiming a fresh server:** the first-run wizard asks for a one-time **setup code**
  printed in the server logs, so nobody who finds the URL first can claim the instance.

## Setup and Twitch auth

First-run wizard (in the app window, or in the browser in server mode):

1. **Language.**
2. **Register a Twitch app.** A step-by-step guide with screenshots and a button that
   opens dev.twitch.tv. The streamer creates a *Public* client and pastes its client ID.
3. **Log in** with the OAuth **Device Code Flow** ("go to twitch.tv/activate and enter
   ABCD-1234"). It needs no secret and no redirect. An optional bot account is connected
   the same way.
4. **Jev key**, either Vercel AI Gateway (`vck_…`) or TypeSafe, checked with a test call.
   Node has no CORS limits, so both providers work directly without the nginx proxy.
5. **Choose packs.** Anti-spoiler needs nothing else; progress is optional.
6. **Copy the overlay URL** for OBS.

The wizard ends in **observe mode**.

**Scopes:** `user:read:chat`, `user:write:chat`, `user:bot`, `channel:bot`,
`moderator:manage:chat_messages`, `moderator:manage:banned_users`, `moderation:read`.
Nothing else.

**Tokens** refresh automatically. If a refresh fails, the dashboard asks the streamer to
log in again.

**To verify first:** in server mode, mod login relies on Twitch's implicit grant against
the VPS URL (a Public client has no secret), and only the user's identity is needed. The
token is checked with `/oauth2/validate` and then discarded. Twitch's OAuth rules change,
so the first implementation step is a spike confirming that Public clients support both
the device code flow for the broadcaster and the implicit flow for mod login.

## Internationalization

- The UI, the wizard, the overlay labels and the bot replies are in English and Spanish.
  The language follows the OS locale and can be changed.
- The playground's `i18n/*.json` approach is reused, so a new language is one JSON file.
- The docs are `README.md` in English and a complete `README.es.md`, not a summary.
- The README says plainly that Jev is less confident in Spanish. The uncertain log is the
  tool for calibrating.

## Testing

- **Unit tests (Vitest):**
  - decision and combination of rules, and the emote-only downgrade;
  - exemptions and highlight eligibility;
  - command parsing and permissions;
  - queue priority and dropping under load;
  - YAML validation messages;
  - anti-spoiler redaction (spoiler text never reaches the overlay, bot replies or the
    broadcaster's view of the topics).
- **Twitch without a real channel:**
  - recorded EventSub payloads, and a fake Helix injected through `fetch` (the same pattern
    as `jev-client`);
  - end-to-end runs against the Twitch CLI mock EventSub WebSocket server.
- **Pack evals:** `pnpm record` becomes a per-pack eval with labeled messages for toxicity,
  spam, antispoiler, questions and interesting, in English and Spanish. Its accuracy
  reports are published in the README.
- **UI:** Playwright smoke tests for the wizard, the dashboard and the overlay.

## Release

GitHub Actions runs on version tags:

- **Windows:** NSIS installer. It is signed through SignPath Foundation (free for OSS) if
  the application is approved, and unsigned with SmartScreen instructions until then.
- **Linux:** AppImage.
- **macOS:** unsigned dmg labeled *experimental*, with "right-click → Open" instructions.
  Mac users can also use Docker or the CLI.
- **Server:** a Docker image on GHCR.
- **Updates:** `electron-updater` updates from GitHub Releases.
- **Demo:** the demo stays on GitHub Pages and gets a "Download Vigía" link.
- **Repository:** `gh repo rename vigia` happens at the start of implementation, after
  confirming with the author. GitHub redirects the old URLs.

## Risks

- **Twitch OAuth details for Public clients** are the main unknown. They are covered by the
  first spike.
- **How well Jev knows specific games** limits layer 1 of the anti-spoiler. It is measured
  and not claimed, and layers 2 and 3 plus community packs cover the gap.
- **Spanish accuracy** is lower. The uncertain log, observe mode and per-rule thresholds
  mitigate it.
- **Cost on large channels.** Every message is one Jev call. It is cheap at $0.042 per
  million input tokens, but the dashboard shows an hourly estimate so no one is surprised.
- **Unsigned binaries** scare some users. SignPath covers Windows, and the docs cover the
  rest.
