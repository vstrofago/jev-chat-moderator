---
title: Precisión
description: Cómo se mide la precisión de los packs de Vigia.
---

Cada pack incluido se mide con mensajes de chat etiquetados en inglés y en español (`packages/evals`). No se publica ninguna cifra sin medirla.

<!-- evals:start -->
Todavía sin medir. Los números aparecen aquí después de la primera ejecución de `pnpm eval` con una key de Jev.
<!-- evals:end -->

## Qué significa cada columna

- **Aciertos:** la parte de los mensajes que Jev etiqueta bien al actuar con el umbral por defecto.
- **Precisión:** de los mensajes sobre los que actuó, cuántos lo merecían.
- **Cobertura:** de los mensajes que lo merecían, sobre cuántos actuó.
- **Dudosos:** la parte que queda en el registro para que decida una persona.

Jev tiene menos confianza en español, así que verás más mensajes en Dudosos. Úsalos, junto con el modo observación, para ajustar tus umbrales.
