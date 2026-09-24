# Vigía: where we are (handoff)

Kept current at the end of every block of work so a new session (or a person) can resume.

**Last updated:** 2026-09-23, M3 done, starting M4.

## Branches (stacked, none merged or pushed)
- `vigia/m1-engine`: monorepo plus `@vigia/engine`. Done and self-reviewed.
- `vigia/m2-twitch`: `@vigia/twitch` (IRC read-only, `pnpm observe`, 7TV/BTTV/FFZ emotes,
  Helix, EventSub, device-code login, `pnpm live`). Done except the real-account check.
- `vigia/m3-server`: done. `@vigia/server` (`startVigia`: `vigia.yaml` live reload plus
  comment-keeping write-back, SQLite history, highlight queue, overlay HTTP/WS guarded by a
  key), `@vigia/ui` (the OBS overlay), `apps/server` (the `pnpm vigia` CLI, Dockerfile,
  compose with Caddy).
  - Verified live: `pnpm vigia --source observe:xqc` served the overlay, and 41 real
    decisions were stored.
  - Unverified: `docker build`, because this machine has no permission on the Docker
    socket (run `docker compose -f apps/server/docker-compose.yml build` to check).

`main` is untouched (it deploys the demo to GitHub Pages).

## Blocked on the author
- **Twitch app registration** needs 2FA, which the author can't enable yet. `pnpm live`
  has never run for real. This is a launch blocker for M6.
- The repo rename to `vigia`, and merging or pushing, wait on the author's go-ahead.

## Next steps
1. M4: the dashboard and wizard UI (write its plan first).
3. M5: Electron. M6: pack evals, docs, release CI, rename.

## Useful commands
- `pnpm test`, `pnpm typecheck`
- `pnpm simulate`: the scripted chat through the engine.
- `pnpm observe <channel>`: real chat, read-only, observe mode (needs `AI_GATEWAY_API_KEY`).
- `TWITCH_CLIENT_ID=… pnpm live`: your own channel (needs a Public Twitch app).
- `pnpm --filter @vigia/ui build && pnpm vigia --source observe:<channel>`: the full host
  on real chat, read-only. It prints the overlay URL (add `&preview=1` to place it in OBS).
