---
title: Reglas
description: Cómo escribir y ajustar las reglas de Vigia.
---

Las reglas viven en el archivo `vigia.yaml`. El dashboard lo edita por ti y conserva tus comentarios, y el archivo se recarga en cuanto lo guardas.

```yaml
version: 1
language: es                 # idioma de las respuestas del bot: en | es
observe: true                # registra lo que haría, sin actuar (así empieza)
defaults: { act: 0.85, unsure: 0.5 }
exempt: [broadcaster, moderators, vips]   # nunca se moderan, pero sí se destacan

rules:
  - { id: toxicity, pack: toxicity, action: timeout, seconds: 60 }
  - { id: spam, pack: spam, action: delete }
  - { id: spoilers, pack: antispoiler, action: delete, work: auto }
  - id: backseat
    question: "Does the message tell the streamer how to play without being asked?"
    yes: "Gives unrequested instructions or advice about the game"
    no: "Reactions, jokes, or answers to something the streamer asked"
    action: delete
    act: 0.9
  - { id: questions, pack: questions, action: highlight }
  - { id: interesting, pack: interesting, action: highlight }
```

## Packs incluidos

Un pack es una regla ya escrita.

| Pack | Tipo | Detecta |
|---|---|---|
| `toxicity` | moderación | Insultos, acoso, odio, amenazas |
| `spam` | moderación | Estafas, venta de seguidores, autopromoción, flood |
| `antispoiler` | moderación | Revelaciones e insinuaciones de la trama ([Anti-spoiler](../anti-spoiler/)) |
| `questions` | destacado | Preguntas para el streamer |
| `interesting` | destacado | Logros, mensajes sentidos, consejos que pediste |

## Reglas propias

Una regla propia es una pregunta más lo que significan "sí" y "no" (ver `backseat` arriba).

- Escríbelas en inglés cuando puedas: Jev funciona mejor en inglés. El chat puede estar en cualquier idioma.
- Cada regla puede tener su propio `act` y `unsure`. Cómo funcionan: [Cómo decide](../how-it-works/).

## Ajustar desde el dashboard

La pestaña **Reglas** muestra sobre cuántos mensajes recientes actuaría cada regla mientras mueves sus umbrales, sin volver a llamar a Jev. También tiene una caja para probar cualquier mensaje.
