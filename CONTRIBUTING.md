# Contributing to Vigia

Thanks for helping! Vigia is a free, open-source project, and the best contributions are the
ones that make it work for more streamers: rules, spoiler packs, translations and fixes.

*¿Hablas español? Puedes abrir issues y pull requests en español.*

## Ground rules

- **The author hosts nothing.** Never add a shared Twitch app, a shared key, a telemetry
  endpoint or any server the project would have to run. Everything runs on the streamer's
  own machine or VPS.
- **The streamer must never be spoiled.** Anything that could show a protected topic or a
  flagged message to the broadcaster (the dashboard, the overlay, bot replies, logs they
  read) needs a test proving it doesn't.
- **Everything a user sees is in English and Spanish.** Code, YAML keys and pack names stay
  in English.
- Be kind. Assume good faith, and remember that many contributors are streamers, not
  programmers.

## Spoiler packs

This is the easiest way to help, and it needs no code. See
[spoiler-packs/README.md](spoiler-packs/README.md) for the format and how to test a pack.

- **One file per game or show**, named `spoiler-packs/<name>.yaml` in lowercase with
  hyphens.
- **Put [spoilers] in the PR title.** Reviewers read the topics.
- **Checkpoint names must spoil nothing.** A reviewer checks this before anything else.
- **The tests validate every pack** (`pnpm test`), including that no two packs claim the
  same category.

## Translations

- **UI text** lives in `packages/ui/src/i18n/<lang>.json`, with every key from `en.json`
  (a test checks this). A new language is one new file plus its entry in
  `packages/ui/src/dashboard/i18n.ts`.
- **Bot replies in chat** live in `packages/engine/src/replies.ts`.
- **The READMEs** are `README.md` and `README.es.md`. Keep them saying the same thing: the
  Spanish one is a full translation, not a summary.

## Rules and packs

A bundled pack (`packages/engine/src/packs.ts`) is one yes/no question for Jev, with
criteria for "yes" and "no".

- **A new pack** needs labeled examples in `packages/evals/data/<pack>.en.yaml` and
  `.es.yaml` (at least 10 yes and 10 no each, including hard negatives).
- **Changing a pack's wording** needs a `pnpm eval` run before and after, with both tables
  in the PR. The README only shows measured numbers.
- **Custom rules** you find useful fit better as an example in the docs than as a new pack.

## Code

```bash
pnpm install
pnpm test && pnpm typecheck        # both must pass
pnpm --filter @vigia/ui build      # needed by the server, the CLI and the desktop app
pnpm vigia --source observe:<channel>    # try it on real chat, read-only
pnpm --filter @vigia/desktop smoke       # the desktop app, offscreen, with screenshots
pnpm e2e                         # browser tests: web setup, dashboard, overlay (Playwright)
pnpm --filter @vigia/server-app showcase # a dashboard with a scripted chat, no keys needed
```

- **TypeScript, ESM, strict**, formatted the way the surrounding code is. Keep modules small
  and pure where possible, and inject I/O (`fetch`, clocks, crypto) so it can be tested.
- **Tests use Vitest.** Twitch and Jev are faked through injected `fetch` and WebSocket
  classes; no test touches the network.
- **Commits** are small, with a conventional prefix (`feat:`, `fix:`, `docs:`…).
- **Security issues** go through the private report described in
  [SECURITY.md](SECURITY.md), never a public issue.

## Branches and releases (maintainers)

Work lands on `dev`, and `main` only moves through pull requests from `dev` with green CI.
Merging to `main` redeploys the website (GitHub Pages).

1. Bump `version` in `apps/desktop/package.json` (on `dev`), and merge `dev` into `main`.
2. Tag `main` with `v<version>` and push the tag. The `release` workflow then:
   - checks the tag against the version and runs the tests;
   - builds the Windows, macOS and Linux apps into a draft GitHub Release, and pushes the
     server image to `ghcr.io/vstrofago/vigia`;
   - publishes the release, as a **pre-release**, once every build succeeded.
3. While Vigia is experimental (0.x), every release is a pre-release, and the desktop apps
   update from pre-releases too.

## Repository protections (maintainers)

GitHub settings cannot be set from the code, so they live here as a checklist. The rules are
exported as JSON in `.github/rulesets/`: import each one in **Settings → Rules → Rulesets →
New ruleset → Import a ruleset**.

- **`main.json`:**
  - Pull requests only, merged with a merge commit (so `dev` and `main` stay in step).
  - Checks `check`, `e2e` and `docker` must pass on the latest commit.
  - No force-push, no deletion.
- **`dev.json`:** no force-push, no deletion.
- **`release-tags.json`:** `v*` tags can't be moved or deleted.

In **Settings → Code security**, turn on:
- Private vulnerability reporting (`SECURITY.md` points to it);
- Dependabot alerts and security updates;
- Secret scanning with push protection.

In **Settings → Actions → General**:
- **Workflow permissions:** read-only, since each workflow asks for what it needs.
- **Allow GitHub Actions to create and approve pull requests:** off.
- **Fork pull request workflows:** require approval for first-time contributors.
