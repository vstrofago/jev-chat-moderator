---
title: Línea de comandos
description: Correr Vigia desde el código con Node y pnpm.
---

Necesitas Node 22 o superior y pnpm.

```bash
pnpm install && pnpm --filter @vigia/ui build
pnpm vigia          # configúralo en el navegador, en http://127.0.0.1:7777
```

También puedes saltarte la configuración en el navegador y pasar todo por variables de entorno:

```bash
# cualquier canal público, solo lectura
AI_GATEWAY_API_KEY=vck_... pnpm vigia --source observe:<canal>

# tu canal
AI_GATEWAY_API_KEY=vck_... TWITCH_CLIENT_ID=... pnpm vigia --source twitch
```

## Opciones

| Opción | Por defecto | Qué hace |
|---|---|---|
| (sin `--source`) | | Configura Vigia en el navegador; la configuración queda en `--data` |
| `--setup` | | Vuelve a abrir la configuración (conserva la key de Jev) |
| `--source twitch` · `observe:<canal>` | | Tu canal, o cualquier canal público en solo lectura |
| `--config <archivo>` | `vigia.yaml` | Archivo de reglas; si no existe, se crea con comentarios |
| `--data <carpeta>` | `vigia-data` | Historial, sesión de Twitch y tus packs de spoilers |
| `--host <dirección>` | `127.0.0.1` | `0.0.0.0` expone el dashboard, y entonces pide iniciar sesión |
| `--port <n>` | `7777` | Puerto del dashboard |
| `--rate <n>` | `1` | Solo observación: mensajes evaluados por segundo |
| `--category <nombre>` | | Solo observación: el juego, para el anti-spoiler |
