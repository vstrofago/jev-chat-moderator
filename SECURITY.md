# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
GitHub: **Security → Report a vulnerability** on this repository. You'll get a reply as soon
as possible.

## How keys and data are handled

**Vigia** (desktop, server and CLI):

- **Nothing reaches the author.** Keys are sent only to Jev (Vercel AI Gateway or
  TypeSafe) and to Twitch, and the project runs no server of its own.
- **The desktop app** encrypts your Jev key, your Twitch client ID and your Twitch login with
  the operating system's keychain (Electron `safeStorage`). Where no keychain exists, the
  setup window says so before saving anything.
- **The CLI and the server** read keys from environment variables, and keep the Twitch login
  in `<data>/twitch-login.json`, readable only by your user.
- **The dashboard** listens on `127.0.0.1` by default.
  - Exposed on a network, it requires a login: Twitch for the broadcaster and mods, or the
    admin code.
  - It checks Host and Origin on every request, and requires a CSRF header on writes.
  - Every mod action goes to an audit log.
- **The overlay** is guarded by a random key that is part of its address. Treat that address
  like a password.
- **What Jev receives:** message text, the replied-to text, emote meanings and rule context,
  but never usernames.

**The playground** (`apps/demo`):

- **The published site ships no API key.** The recorded replay needs none.
- **In live mode**, a visitor's own key is stored only in their browser (`localStorage`),
  and is sent only to the provider they chose: Vercel AI Gateway, or TypeSafe through the
  local Docker/Vite proxy.
- `pnpm record` and `pnpm eval` read keys from the environment. Never commit a `.env` file.
