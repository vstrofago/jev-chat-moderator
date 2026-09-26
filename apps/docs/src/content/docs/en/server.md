---
title: Server for mods
description: Run Vigia on a server so your mods can log in with Twitch.
---

If you want your mods to use the dashboard from their own homes, run Vigia on a server (a VPS) with a domain pointing at it:

```bash
git clone https://github.com/vstrofago/vigia && cd vigia
export VIGIA_DOMAIN=vigia.example.com
docker compose -f apps/server/docker-compose.yml up -d
docker compose -f apps/server/docker-compose.yml logs vigia    # the setup code
```

Open `https://<your domain>` and set Vigia up in the browser, the same as in [Docker on your computer](../docker/).

- **HTTPS:** Caddy gets a certificate for your domain automatically.
- **The logs** show the setup code (which is also the admin code) and, once running, the overlay address.
- **Mods log in with Twitch.** Add `https://<your domain>/auth/callback` to your Twitch app's OAuth Redirect URLs.
- **The streamer** logs in with Twitch too, or with the admin code.
- **The image** is `ghcr.io/vstrofago/vigia`. `docker compose pull` downloads the published one; `--build` builds it from source.
