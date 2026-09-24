# Vigía: where we are (handoff)

Kept current at the end of every block of work so a new session (or a person) can resume.

**Last updated:** 2026-09-23, during M3.

## Branches (stacked, none merged or pushed)
- `vigia/m1-engine`: monorepo plus `@vigia/engine`. Done and self-reviewed.
- `vigia/m2-twitch`: `@vigia/twitch` (IRC read-only, `pnpm observe`, 7TV/BTTV/FFZ emotes,
  Helix, EventSub, device-code login, `pnpm live`). Done except the real-account check.
- `vigia/m3-server`: in progress. See `plans/2026-09-23-vigia-m3-server.md`.

`main` is untouched (it deploys the demo to GitHub Pages).

## Blocked on the author
- **Twitch app registration** needs 2FA, which the author can't enable yet. `pnpm live`
  has never run for real. This is a launch blocker for M6.
- The repo rename to `vigia`, and merging or pushing, wait on the author's go-ahead.

## Next steps
1. Finish M3 (see its plan's task list and `git log`).
2. M4: the dashboard and wizard UI (write its plan first).
3. M5: Electron. M6: pack evals, docs, release CI, rename.

## Useful commands
- `pnpm test`, `pnpm typecheck`
- `pnpm simulate`: the scripted chat through the engine.
- `pnpm observe <channel>`: real chat, read-only, observe mode (needs `AI_GATEWAY_API_KEY`).
- `TWITCH_CLIENT_ID=… pnpm live`: your own channel (needs a Public Twitch app).
