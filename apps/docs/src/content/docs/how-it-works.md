---
title: Cómo decide
description: Cómo usa Vigia las probabilidades de Jev y tus umbrales.
---

## Jev da probabilidades

Jev es un modelo de TypeSafe AI que no escribe texto. Vigia le envía cada mensaje del chat junto con tus reglas, escritas como preguntas de sí o no. Jev responde con una probabilidad para cada pregunta, todo en una sola llamada.

## Tus umbrales deciden

Cada regla tiene dos umbrales, `act` y `unsure`:

| Probabilidad | Qué pasa |
|---|---|
| `act` o más (85 % por defecto) | Se ejecuta la acción de la regla: borrar, timeout, destacar o registrar |
| Entre `unsure` y `act` (50–85 %) | El mensaje va a **Dudosos** para que decida una persona, o queda como destacado sugerido |
| Menos de `unsure` | No pasa nada |

## Un ejemplo

La regla `backseat` pregunta si el mensaje le dice al streamer cómo jugar sin que lo pida. Actúa desde 90 % y marca dudoso desde 50 %:

```yaml
- id: backseat
  question: "Does the message tell the streamer how to play without being asked?"
  yes: "Gives unrequested instructions or advice about the game"
  no: "Reactions, jokes, or answers to something the streamer asked"
  action: delete
  act: 0.9
```

Llega el mensaje *"ve a la izquierda, el objeto está a la izquierda, IZQUIERDA"*. Jev responde 88 %. Como 88 % está entre 50 % y 90 %, Vigia no lo borra: lo deja en Dudosos y un mod decide.

## Modo observación

Vigia empieza en **modo observación**: registra lo que *haría*, sin borrar ni dar timeouts. Revisa el registro y, cuando las decisiones te parezcan correctas, activa la moderación desde el dashboard.
