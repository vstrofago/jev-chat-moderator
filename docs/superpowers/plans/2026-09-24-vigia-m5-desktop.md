# Vigía M5: Desktop App (Electron)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small streamer downloads Vigía, double-clicks it, sets it up in a window, and
leaves it in the tray while streaming. There is no terminal, and nobody hosts anything.

**Architecture:** `apps/desktop` is a thin Electron shell around `startVigia()`.
- **The first window is a setup page** (`packages/ui/setup.html`) that talks to the main
  process over a small preload bridge. It covers what needs secrets, which only the desktop
  can keep: the source, the Twitch app, the device login and the Jev key.
- **Once set up**, the host starts on `127.0.0.1:7777` in local mode, and the window shows
  the M4 dashboard, whose own wizard covers rules, anti-spoiler, overlay and observe.
- **Secrets are encrypted** with `safeStorage` in the user-data folder: the Jev key, the
  Twitch tokens and the client ID.
- **Closing the window hides it** in the tray. The tray menu has Open, Copy overlay address,
  Pause/Resume, Start with the computer, and Quit.
- `electron-updater` checks GitHub Releases in packaged builds.

**Spec:** `docs/superpowers/specs/2026-09-23-vigia-design.md`

## Rulings made while planning

- **Setup offers two sources.** One is "Connect my channel" (the Twitch app plus device
  login). The other is "Just watch a channel" (read-only, observe forever), for trying
  Vigía without a Twitch app. That second one is exactly the author's situation today (no
  2FA). It costs one extra choice on the first screen.
- **The port is fixed at 7777**, falling back to 7778–7787 if busy. The chosen port is
  remembered, because the OBS overlay address must not change between runs.
- **Twitch tokens use an encrypted `tokenStore`** (a new option on `openTwitchSession`)
  instead of the plaintext file the CLI uses.
- **Bundling:** esbuild bundles the main process (ESM) and the preload (CJS, as a sandboxed
  preload requires). The UI dist and the example rules ship as `extraResources`.
- **Verification here:** unit tests for the pure parts (secret store, setup steps, port
  choice, session store), plus a smoke run (`VIGIA_SMOKE=1`) that boots Electron with an
  offscreen window, loads the page, captures a screenshot and quits. Windows and macOS
  packaging runs in CI (M6). A Linux AppImage is built locally if disk and network allow.

## Tasks

1. `openTwitchSession({ tokenStore })` stores tokens through the injected store.
2. `apps/desktop/src/secrets.ts`: an encrypted JSON store (with injected crypto), tested.
3. `setup-state.ts` (`nextStep(stored)`) and `ports.ts` (`pickPort`), tested.
4. Setup page (Preact, en/es) and the preload bridge: source choice, Twitch app guide
   (with a link to dev.twitch.tv), device code, and Jev key with a test call.
5. `main.ts`: single instance, setup-to-dashboard flow, tray, start-with-OS, updater,
   window security (context isolation, sandbox, navigation locked to the local host,
   external links in the browser).
6. Build scripts (esbuild), the `electron-builder` config, and the smoke run.
