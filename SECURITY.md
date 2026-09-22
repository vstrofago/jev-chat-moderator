# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
GitHub: **Security → Report a vulnerability** on this repository. You'll get a reply as soon
as possible.

## How keys are handled

- The published site ships **no API key**. The recorded replay needs none.
- In live mode, a visitor's own key is stored only in their browser (`localStorage`) and is
  sent only to the provider they chose (Vercel AI Gateway, or TypeSafe through the local
  Docker/Vite proxy). Nothing is sent to any server run by this project.
- `pnpm record` reads `AI_GATEWAY_API_KEY` from the environment; never commit a `.env` file.
