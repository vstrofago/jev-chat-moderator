---
title: Develop
description: How to run Vigia from source and contribute.
---

```bash
pnpm install
pnpm test                 # unit tests
pnpm typecheck
pnpm simulate             # a test chat through the engine
pnpm --filter @vigia/ui build && pnpm vigia --source observe:<channel>
pnpm --filter @vigia/desktop start      # the desktop app from source
pnpm eval                 # measure the packs (needs a Jev key)
```

## Repository layout

```
packages/core      the Jev client, questions, policy and queue
packages/engine    rules, packs, the message pipeline, chat commands, spoiler packs
packages/twitch    device login, EventSub, Helix, read-only IRC, 7TV/BTTV/FFZ emotes
packages/server    startVigia(): config file, SQLite, overlay, dashboard API and auth
packages/ui        dashboard, overlay, login and desktop setup pages (Preact, en/es)
packages/evals     labeled messages per pack, and pnpm eval
apps/desktop       the Electron app
apps/server        the CLI and the Docker image
apps/demo          the website and the playground
apps/docs          these docs
spoiler-packs      community spoiler packs
```

## The playground

The [playground](https://vstrofago.github.io/vigia/playground/) replays about 180 chat messages with Jev's real answers, and lets you move the thresholds to see decisions change. You can also try it live with your own Vercel AI Gateway key. To run it locally: `pnpm dev`, or `docker compose -f apps/demo/docker-compose.yml up --build` to use a TypeSafe key.

## Contributing

Rules, spoiler packs, translations and code are all welcome. Read [CONTRIBUTING.md](https://github.com/vstrofago/vigia/blob/main/CONTRIBUTING.md) first.
