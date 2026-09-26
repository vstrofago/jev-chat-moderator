---
title: Command line
description: Run Vigia from source with Node and pnpm.
---

You need Node 22 or later and pnpm.

```bash
pnpm install && pnpm --filter @vigia/ui build
pnpm vigia          # set it up in the browser, at http://127.0.0.1:7777
```

You can also skip the browser setup and pass everything as environment variables:

```bash
# any public channel, read-only
AI_GATEWAY_API_KEY=vck_... pnpm vigia --source observe:<channel>

# your channel
AI_GATEWAY_API_KEY=vck_... TWITCH_CLIENT_ID=... pnpm vigia --source twitch
```

## Options

| Option | Default | What it does |
|---|---|---|
| (no `--source`) | | Set Vigia up in the browser; the settings are kept in `--data` |
| `--setup` | | Run the setup again (keeps the Jev key) |
| `--source twitch` · `observe:<channel>` | | Your channel, or any public channel read-only |
| `--config <file>` | `vigia.yaml` | Rules file, created with comments if missing |
| `--data <dir>` | `vigia-data` | History, Twitch login and your spoiler packs |
| `--host <address>` | `127.0.0.1` | `0.0.0.0` exposes the dashboard, which then asks for a login |
| `--port <n>` | `7777` | Dashboard port |
| `--rate <n>` | `1` | Observe only: messages evaluated per second |
| `--category <name>` | | Observe only: the game, for the anti-spoiler |
