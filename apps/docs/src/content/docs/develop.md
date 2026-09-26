---
title: Desarrollo
description: Cómo correr Vigia desde el código y contribuir.
---

```bash
pnpm install
pnpm test                 # tests unitarios
pnpm typecheck
pnpm simulate             # un chat de prueba a través del motor
pnpm --filter @vigia/ui build && pnpm vigia --source observe:<canal>
pnpm --filter @vigia/desktop start      # la app de escritorio desde el código
pnpm eval                 # mide los packs (necesita una key de Jev)
```

## Estructura del repositorio

```
packages/core      el cliente de Jev, preguntas, política y cola
packages/engine    reglas, packs, el flujo de mensajes, comandos del chat, packs de spoilers
packages/twitch    login por dispositivo, EventSub, Helix, IRC de solo lectura, emotes de 7TV/BTTV/FFZ
packages/server    startVigia(): archivo de reglas, SQLite, overlay, API del dashboard y acceso
packages/ui        dashboard, overlay, login y configuración del escritorio (Preact, en/es)
packages/evals     mensajes etiquetados por pack, y pnpm eval
apps/desktop       la app de Electron
apps/server        el CLI y la imagen de Docker
apps/demo          la página web y el playground
apps/docs          esta documentación
spoiler-packs      packs de spoilers de la comunidad
```

## El playground

El [playground](https://vstrofago.github.io/vigia/playground/) reproduce unos 180 mensajes de chat con las respuestas reales de Jev, y te deja mover los umbrales para ver cómo cambian las decisiones. También puedes probarlo en vivo con tu propia key del Vercel AI Gateway. Para correrlo en tu equipo: `pnpm dev`, o `docker compose -f apps/demo/docker-compose.yml up --build` si quieres usar una key de TypeSafe.

## Contribuir

Reglas, packs de spoilers, traducciones y código son bienvenidos. Lee [CONTRIBUTING.md](https://github.com/vstrofago/vigia/blob/main/CONTRIBUTING.md) antes de empezar.
