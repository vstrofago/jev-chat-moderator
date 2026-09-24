# Vigia M6: Launch Readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the spec asks for before the one public release, except what only the
author can do (the repo rename, the real Twitch account check, publishing the release).

**Spec:** `docs/superpowers/specs/2026-09-23-vigia-design.md`

## Rulings made while planning

- **Community spoiler packs** are YAML files. A pack matches a stream by `category_id`,
  or, failing that, by `category` name. Matching by name is what makes packs work in the
  read-only observe source (`--category "Elden Ring"`), which has no category id.
  - `topics` at the top level are always protected.
  - `checkpoints` are listed in story order. Each one lists the topics revealed in that
    part. Choosing the checkpoint "I am at Chapter 3" stops protecting the topics of
    earlier checkpoints, and keeps protecting Chapter 3 and later.
  - With no checkpoint chosen, every topic is protected.
- **Where packs come from:** the bundled `spoiler-packs/` folder (empty at launch except for
  the template, per the spec) and the user's own `<dataDir>/spoiler-packs/`. When both have a
  pack for the same category, the user's pack wins. The folders are read again on every
  category change, so a new file needs no restart.
- **Nobody reads pack topics in Vigia.** The API and the dashboard show the pack name, the
  checkpoint names and a topic count. Mods keep their own hidden topic list as before, and
  the engine receives the mod topics plus the active pack topics.
- The chosen checkpoint is remembered per category (the store setting
  `spoilerCheckpoint:<key>`). Broadcasters and mods can change it, and each change is
  audited.
- **Pack evals** live in `packages/evals`. Labeled messages sit in
  `data/<pack>.<lang>.yaml`, and `pnpm eval` sends them through the same `buildRequest` the
  engine uses. The report goes to `docs/evals/results.json`, and a table goes into both
  READMEs between markers. This machine has no Jev key, so the READMEs say the numbers are
  pending until the author runs it. No accuracy is claimed before it is measured.
- **Releases** are built by `release.yml` on `v*` tags:
  - Windows NSIS, macOS dmg (unsigned, experimental) and a Linux AppImage go to a **draft**
    GitHub Release, which the author publishes by hand.
  - The server image goes to GHCR.
  - `ci.yml` runs tests, the typecheck and the desktop smoke run on every push and PR.
- **UI Playwright tests** were first left for later, then added in `e2e/` (web setup, dashboard,
  overlay). The desktop smoke run already loads the setup
  page and the dashboard in real Chromium.

## Tasks

1. Category id end to end: `helix.category` returns `{ id, name }`, `engine.setCategory(name, id)`,
   and `RuntimeState.categoryId`.
2. `@vigia/engine` `spoiler-packs.ts`: parse and validate a pack, find the pack for a
   category, and compute the active topics for a checkpoint (tested).
3. Server: load packs on category changes, merge them with the mod topics, and add
   `GET /api/spoiler-pack` and `PUT /api/spoiler-pack/checkpoint` (tested).
4. Dashboard: a community-pack block in the anti-spoiler settings, with a checkpoint picker
   (en/es).
5. `packages/evals`: datasets for 5 packs × en/es, the runner, the scoring (tested) and the
   report writer.
6. `README.md`, `README.es.md`, `CONTRIBUTING.md`, and `spoiler-packs/README.md` plus the
   template.
7. `ci.yml` and `release.yml`, the desktop and Docker packaging in CI, and a
   "Download Vigia" link in the demo.
