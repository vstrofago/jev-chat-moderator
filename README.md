# Vigía

[Español](README.es.md) · [Try the playground](https://vstrofago.github.io/vigia)

**A free, self-hosted chat watchman for Twitch streamers**, powered by
[TypeSafe AI](https://typesafe.ai)'s Jev.

- **Rules in plain language.** Each rule is a yes/no question for Jev ("is this unsolicited
  backseating?"), not a list of banned words.
- **Anti-spoiler protection that never spoils you.** Vigía spots the *shape* of a spoiler,
  hides what it flags even from the streamer's own dashboard, and loads community spoiler
  packs for the game you're playing.
- **Questions and great messages on stream.** It picks them out of chat and shows them in
  an OBS overlay.
- **Automatic moderation** (delete, timeout), with a log of the messages it wasn't sure
  about instead of guessing.
- **A live dashboard**, on your own PC or on a server your mods log in to with Twitch.

> **Status:** pre-release. Everything below works from source; the first installers are
> published with v1.0.

## How it works

Jev is a *System One* model: it doesn't write text. Vigía sends it each chat message and your
rules as typed yes/no questions, and Jev answers with a probability for each one, in one
fast, cheap call. **Jev never decides by itself.** Your thresholds do:

- **At or above `act`** (85% by default), the rule's action runs: delete, timeout, highlight
  or log.
- **Between `unsure` and `act`** (50–85%), the message goes to the *uncertain* log for a
  person to look at, or becomes a suggested highlight.
- **Below `unsure`**, nothing happens.

**You own everything.** Your own Twitch app, your own Jev key and your own machine. The
author runs no server, no shared app and no proxy. Chat messages go only to Jev, without
usernames, and your keys never leave your computer except to reach Jev and Twitch.

## Install

### Desktop app (Windows, macOS, Linux)

Download it from [Releases](https://github.com/vstrofago/vigia/releases). A
window walks you through setup in about ten minutes.

- **Windows:** run `Vigia-…-win-x64.exe`. Until the app is signed, SmartScreen may warn
  you: choose **More info → Run anyway**.
- **macOS (experimental, unsigned):** open the `.dmg` and drag Vigía to Applications. The
  first time, right-click Vigía and choose **Open**. On recent macOS, go to **System
  Settings → Privacy & Security → Open Anyway**.
- **Linux:** make the AppImage executable (`chmod +x Vigia-…-linux-x86_64.AppImage`) and
  run it.

Setup asks where to watch:

- **My channel** needs a free Twitch app of your own (below), a Twitch login and a Jev key.
- **Just watch a channel** reads any public channel, read-only, so you can try Vigía with
  only a Jev key.

After setup, the dashboard opens, and its own wizard covers your rules, the anti-spoiler,
the OBS overlay and observe mode. Closing the window keeps Vigía running in the tray, whose
menu can copy the overlay address, pause moderation or start Vigía with your computer.
Updates arrive by themselves.

### Server (Docker, for teams of mods)

On a VPS with a domain pointing at it:

```bash
git clone https://github.com/vstrofago/vigia && cd vigia
export VIGIA_DOMAIN=vigia.example.com
export AI_GATEWAY_API_KEY=vck_...          # or TYPESAFE_API_KEY
export TWITCH_CLIENT_ID=...                # your own Public app (below)
docker compose -f apps/server/docker-compose.yml up -d
docker compose -f apps/server/docker-compose.yml logs -f vigia
```

- **HTTPS:** Caddy gets a certificate for your domain by itself.
- **The logs** show the Twitch login code, the overlay address and the **admin code**.
- **Mods log in with Twitch.** Add `https://<your domain>/auth/callback` to your Twitch
  app's OAuth Redirect URLs.
- **The streamer** logs in with Twitch too, or with the admin code.
- **The image** is `ghcr.io/vstrofago/vigia`. `docker compose pull` uses it, and
  `--build` builds from source.

### Command line

With Node 22+ and pnpm:

```bash
pnpm install && pnpm --filter @vigia/ui build
AI_GATEWAY_API_KEY=vck_... pnpm vigia --source observe:<channel>    # any channel, read-only
AI_GATEWAY_API_KEY=vck_... TWITCH_CLIENT_ID=... pnpm vigia --source twitch
```

| Option | Default | |
|---|---|---|
| `--source twitch` · `observe:<channel>` | | Your channel, or any public channel read-only |
| `--config <file>` | `vigia.yaml` | Rules file, created with comments if missing |
| `--data <dir>` | `vigia-data` | History, login and your own spoiler packs |
| `--host <address>` | `127.0.0.1` | `0.0.0.0` exposes the dashboard (then it asks for a login) |
| `--port <n>` | `7777` | |
| `--rate <n>` | `1` | Observe only: messages evaluated per second |
| `--category <name>` | | Observe only: the game, for the anti-spoiler |

## The two keys you bring

**A Twitch app (only for "My channel").** Twitch requires two-factor authentication on
your account before you can register apps.

1. Open the [Twitch developer console](https://dev.twitch.tv/console/apps/create) and
   choose **Register Your Application**.
2. Fill it in:
   - **Name:** anything unique, such as `vigia-yourname`.
   - **OAuth Redirect URL:** `http://localhost`. For server mode, add
     `https://<your domain>/auth/callback` too.
   - **Category:** Chat Bot.
   - **Client type:** **Public**.
3. Create it, open **Manage**, and copy the **Client ID**. There is no secret to keep.

Vigía logs in with Twitch's device code: you confirm a code on twitch.tv, and it asks only
for what it uses (reading and sending chat, deleting messages, timeouts and bans, and seeing
your mods).

**A Jev key.** Use a [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key (`vck_…`)
or a TypeSafe key. Usage is billed to you. Jev costs $0.042 per million input tokens, and
output is free, so a busy evening of chat usually costs cents. The dashboard's Stats tab
shows an hourly estimate.

## Rules

Rules live in `vigia.yaml`. The dashboard edits it for you and keeps your comments, and the
file reloads as soon as you save it.

```yaml
version: 1
language: en                 # bot replies in chat: en | es
observe: true                # log what would happen, act on nothing (the default at first)
defaults: { act: 0.85, unsure: 0.5 }
exempt: [broadcaster, moderators, vips]   # never moderated, still highlighted

rules:
  - { id: toxicity, pack: toxicity, action: timeout, seconds: 60 }
  - { id: spam, pack: spam, action: delete }
  - { id: spoilers, pack: antispoiler, action: delete, work: auto }
  - id: backseat
    question: "Does the message tell the streamer how to play without being asked?"
    yes: "Gives unrequested instructions or advice about the game"
    no: "Reactions, jokes, or answers to something the streamer asked"
    action: delete
    act: 0.9
  - { id: questions, pack: questions, action: highlight }
  - { id: interesting, pack: interesting, action: highlight }
```

| Pack | Kind | Catches |
|---|---|---|
| `toxicity` | moderation | Insults, harassment, hate, threats |
| `spam` | moderation | Scams, selling followers, self-promotion, flooding |
| `antispoiler` | moderation | Plot reveals and hints (see below) |
| `questions` | highlight | Genuine questions for the streamer |
| `interesting` | highlight | Milestones, heartfelt messages, tips you asked for |

- **Custom rules** are a question plus what "yes" and "no" mean. Write them in English
  where you can, because Jev is strongest there. Chat can be in any language.
- **Every rule** can set its own `act` and `unsure`.
- **The Rules tab** shows how many recent messages a rule would act on as you drag its
  sliders, without calling Jev again, and has a test box for trying any message.
- **Start in observe mode.** Vigía logs what it *would* do. Turn it off once the log looks
  right.

## Anti-spoiler

The rule is simple: **the streamer never has to write, read or see a spoiler.**

1. **Jev looks for the shape of a spoiler:** deaths, twists, hidden identities, "wait until
   you see what happens". It knows the game from your Twitch category. Set your progress with
   `!vigia progress "Chapter 3"` and only what comes later counts.
2. **Mods keep a hidden topic list** in the dashboard. You only ever see how many there
   are.
3. **Community spoiler packs** load by themselves when your category changes. You pick how
   far you are from part names that spoil nothing. See [spoiler-packs](spoiler-packs/README.md)
   to use one or write one.

Messages flagged as spoilers are blurred everywhere in the dashboard until clicked. They
are never highlighted and never quoted by the bot.

## Chat commands

For the broadcaster and mods. Every command has a Spanish alias.

| Command | Alias | |
|---|---|---|
| `!vigia pause` · `resume` | `pausa` · `sigue` | Stop and restart moderation; highlights continue |
| `!vigia status` | `estado` | Rules, pause and observe state |
| `!vigia progress "Chapter 3"` | `progreso` | Anti-spoiler progress |
| `!vigia rule <id> on` · `off` | `regla` | Turn a rule on or off |
| `!vigia highlight [text]` | `destaca` | Put a message (or the one you reply to) on stream |
| `!vigia clear` | `limpia` | Clear the overlay |

## OBS overlay

Copy the overlay address from the dashboard (Settings) or the tray. In OBS, add a
**Browser source** with that address. Add `&preview=1` while placing it to get a sample card
that stays on screen, and `&pos=bl|br|bc|tl|tr` to choose the corner.

## Accuracy

Every bundled pack is measured on labeled chat messages in English and Spanish
(`packages/evals`), and no accuracy is claimed without a measurement:

<!-- evals:start -->
Not measured yet. The numbers appear here after the first `pnpm eval` run with a Jev key.
<!-- evals:end -->

- **Accuracy:** the share of messages Jev labels right when acting at the default threshold.
- **Precision:** of the messages acted on, how many deserved it.
- **Recall:** of the messages that deserved it, how many were acted on.
- **Uncertain:** the share that lands in the log for a person to decide.

Jev is less confident in Spanish: expect more messages in the uncertain log, and use it,
together with observe mode, to tune your thresholds.

## Privacy

- **What Jev sees:** the message text, the message it replies to, what its emotes mean, and
  your rules' context (game, progress, protected topics). It never sees a username.
- **Where things are stored:** history stays in a SQLite file on your machine for 7 days.
- **The desktop app** keeps your keys and Twitch login encrypted with your system's
  keychain.
- **The dashboard** listens only on `127.0.0.1` unless you expose it. Exposed, it requires a
  Twitch or admin-code login and checks every write against CSRF.

## Develop

```bash
pnpm install
pnpm test                 # unit tests
pnpm typecheck
pnpm simulate             # a scripted chat through the engine
pnpm --filter @vigia/ui build && pnpm vigia --source observe:<channel>
pnpm --filter @vigia/desktop start      # the desktop app from source
pnpm eval                 # measure the packs (needs a Jev key)
```

```
packages/core      the Jev client, questions, policy and queue
packages/engine    rules, packs, the message pipeline, chat commands, spoiler packs
packages/twitch    device login, EventSub, Helix, read-only IRC, 7TV/BTTV/FFZ emotes
packages/server    startVigia(): config file, SQLite, overlay, dashboard API and auth
packages/ui        dashboard, overlay, login and desktop setup pages (Preact, en/es)
packages/evals     labeled messages per pack, and pnpm eval
apps/desktop       the Electron app
apps/server        the CLI and the Docker image
apps/demo          the playground on GitHub Pages
spoiler-packs      community spoiler packs
```

Want to help? Rules, spoiler packs, translations and code are all welcome: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## The playground

[The playground](https://vstrofago.github.io/vigia) is where Vigía started. It
replays about 180 scripted chat messages with the answers Jev really gave, and lets you drag
the thresholds to see decisions change instantly. You can also paste your own Vercel AI
Gateway key to try it live. Run it locally with `pnpm dev`, or with `docker compose up
--build` to use a TypeSafe key.

## License

MIT
