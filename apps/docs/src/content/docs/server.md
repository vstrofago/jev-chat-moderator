---
title: Servidor para mods
description: Correr Vigia en un servidor para que tus mods entren con Twitch.
---

Si quieres que tus mods usen el dashboard desde sus casas, corre Vigia en un servidor (un VPS) con un dominio que apunte a él:

```bash
git clone https://github.com/vstrofago/vigia && cd vigia
export VIGIA_DOMAIN=vigia.ejemplo.com
docker compose -f apps/server/docker-compose.yml up -d
docker compose -f apps/server/docker-compose.yml logs vigia    # el código de configuración
```

Abre `https://<tu dominio>` y configura Vigia en el navegador, igual que en [Docker en tu equipo](../docker/).

- **HTTPS:** Caddy obtiene el certificado de tu dominio automáticamente.
- **Los logs** muestran el código de configuración (que también es el código de admin) y, una vez funcionando, la dirección del overlay.
- **Los mods entran con Twitch.** Agrega `https://<tu dominio>/auth/callback` a las OAuth Redirect URLs de tu app de Twitch.
- **El streamer** también entra con Twitch, o con el código de admin.
- **La imagen** es `ghcr.io/vstrofago/vigia`. `docker compose pull` descarga la publicada; `--build` la construye desde el código.
