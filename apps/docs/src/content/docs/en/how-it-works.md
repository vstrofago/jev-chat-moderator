---
title: How it decides
description: How Vigia uses Jev's probabilities and your thresholds.
---

## Jev gives probabilities

Jev is a TypeSafe AI model that doesn't write text. Vigia sends it each chat message along with your rules, written as yes-or-no questions. Jev answers with a probability for each question, all in one call.

## Your thresholds decide

Each rule has two thresholds, `act` and `unsure`:

| Probability | What happens |
|---|---|
| `act` or higher (85% by default) | The rule's action runs: delete, timeout, highlight or log |
| Between `unsure` and `act` (50–85%) | The message goes to **Uncertain** for a person to decide, or becomes a suggested highlight |
| Below `unsure` | Nothing happens |

## An example

The `backseat` rule asks whether a message tells the streamer how to play without being asked. It acts from 90% and marks unsure from 50%:

```yaml
- id: backseat
  question: "Does the message tell the streamer how to play without being asked?"
  yes: "Gives unrequested instructions or advice about the game"
  no: "Reactions, jokes, or answers to something the streamer asked"
  action: delete
  act: 0.9
```

The message *"go left, the item is on the left, LEFT"* arrives. Jev answers 88%. Since 88% is between 50% and 90%, Vigia doesn't delete it: it goes to Uncertain and a mod decides.

## Observe mode

Vigia starts in **observe mode**: it logs what it *would* do, without deleting or timing anyone out. Check the log and, once the decisions look right, turn moderation on from the dashboard.
