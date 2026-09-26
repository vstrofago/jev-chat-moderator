---
title: Qué es Vigia
description: Vigia es un moderador de chat gratuito para streamers de Twitch que corre en tu equipo.
---

Vigia lee el chat de tu stream de Twitch y hace tres cosas:

- **Modera:** borra spam y da timeouts por insultos.
- **Oculta spoilers** del juego que estás jugando, también en tu propio dashboard.
- **Destaca preguntas y buenos mensajes** en un overlay de OBS.

Es gratis, open source (licencia MIT) y corre en tu computadora o en tu servidor.

## Cómo funciona, en corto

Cada mensaje del chat se envía a **Jev**, un modelo de [TypeSafe AI](https://typesafe.ai) que responde preguntas de sí o no con una probabilidad. Tus reglas son esas preguntas: "¿es spam?", "¿es un spoiler?", "¿es una pregunta para el streamer?".

Vigia compara cada probabilidad con tus umbrales. Si es alta, actúa. Si es intermedia, el mensaje queda en **Dudosos** para que decida un mod. Si es baja, no hace nada. Más detalle en [Cómo decide](how-it-works/).

## Qué necesitas

- La app de escritorio de Vigia (Windows, macOS o Linux), o Docker.
- Una **key de Jev**. Pagas tú el uso, que suele ser de centavos por noche.
- Para moderar tu canal, **tu propia app de Twitch**, que es gratis. Para solo probar, no hace falta.

Detalles en [Tus keys](keys/).

:::caution[Versión experimental (v0.1.0)]
- Empieza en **modo observación** y no uses Vigia como tu única moderación todavía.
- Los instaladores **no están firmados**, así que Windows y macOS muestran un aviso.
:::

## Siguiente paso

[Instalar la app](install/) · [Probar el playground](https://vstrofago.github.io/vigia/playground/)
