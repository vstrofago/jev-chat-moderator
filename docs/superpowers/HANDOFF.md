# Vigía: where we are (handoff)

Kept current at the end of every block of work so a new session (or a person) can resume.

**Last updated:** 2026-09-24, M6 done except the author-only steps; next is the v1.0 release.

## Branches (stacked, pushed, none merged)
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

- `vigia/m4-ui`: done. Dashboard (Preact, en/es) with the Live, Uncertain, Highlights,
  Rules, Settings and Stats tabs, plus the first-run wizard and login. The API has roles
  (broadcaster/moderator), CSRF/Host/Origin checks and an audit log. Mod login uses the
  Twitch implicit flow (never run for real, same blocker as below), or the admin code.
  - Visual QA was done with Playwright screenshots against a live `observe:xqc` run.
  - Wizard scope ruling: the Twitch app, device login and Jev key steps belong to M5
    (secrets live in Electron `safeStorage`).

- `vigia/m5-desktop`: done (pushed). `apps/desktop`: Electron shell around `startVigia()`.
  Setup page on a `vigia://` scheme (source, Twitch app, device login, Jev key tested with a
  real call), secrets in `safeStorage`, host on 127.0.0.1:7777 (remembered port), tray
  (open, copy overlay address, pause, start with the computer, set up again, quit),
  navigation locked to the local host, `electron-updater` in packaged builds.
  - Verified: `pnpm --filter @vigia/desktop smoke` (setup and dashboard screenshots) under
    Xvfb, both from source and from the packaged Linux build; the AppImage builds
    (`pnpm --filter @vigia/desktop dist -- --linux AppImage --publish never`).
  - Unverified: Windows/macOS packaging and signing (M6 CI), the tray on real desktops,
    and the Twitch device login (same 2FA blocker).
  - Smoke under Xvfb needs `--no-sandbox` in containers running as root.

- M6 (also on `vigia/m5-desktop`, plan `plans/2026-09-24-vigia-m6-launch.md`): done.
  - Community spoiler packs: the format, loader, API and dashboard checkpoint picker, the
    `spoiler-packs/` folder (template and docs, no game packs), and the desktop tray entry.
  - `packages/evals`: 240 labeled messages and `pnpm eval`. The READMEs say "not measured
    yet" until it runs with a key.
  - `README.md`, a full `README.es.md`, `CONTRIBUTING.md` and `SECURITY.md`. The
    playground docs moved to `apps/demo/README.md`, and the demo has a "Download Vigía" link.
  - `ci.yml` runs tests, the typecheck, the builds and the desktop smoke run.
    `release.yml` runs on `v*` tags: a draft release with win/mac/linux, plus
    `ghcr.io/<owner>/vigia`.
  - The Docker image installs only the server and the UI.
  - Unverified: both workflows have never run (no GitHub Actions here), and neither has
    `docker build`.

## Blocked on the author
- **Twitch app registration** needs 2FA, which the author can't enable yet. `pnpm live`
  has never run for real. This is a launch blocker for M6.
- Merging to `main` waits on the author's go-ahead (the repo is renamed to `vigia`).

## Next steps (author)
1. `AI_GATEWAY_API_KEY=vck_... pnpm eval`, then commit `docs/evals/results.json` and the
   updated README tables.
2. Merge, and do the real-account check (2FA). The repo is already renamed to `vigia`
   and the URLs are updated (Pages moves to vstrofago.github.io/vigia on the next deploy).
3. Bump `apps/desktop/package.json` to 1.0.0, push the `v1.0.0` tag, then check and publish
   the draft.

## Earlier plan
1. M6: pack evals, the community spoiler-pack loader, README en/es, CONTRIBUTING, release
   CI, the repo rename, and the real-account check.

## Useful commands
- `pnpm test`, `pnpm typecheck`
- `pnpm simulate`: the scripted chat through the engine.
- `pnpm observe <channel>`: real chat, read-only, observe mode (needs `AI_GATEWAY_API_KEY`).
- `TWITCH_CLIENT_ID=… pnpm live`: your own channel (needs a Public Twitch app).
- `pnpm --filter @vigia/ui build && pnpm vigia --source observe:<channel>`: the full host
  on real chat, read-only. It prints the dashboard and overlay URLs (add `&preview=1` to
  place the overlay in OBS).
