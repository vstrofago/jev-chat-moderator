---
title: Rules
description: How to write and tune Vigia's rules.
---

Rules live in the `vigia.yaml` file. The dashboard edits it for you and keeps your comments, and the file reloads as soon as you save it.

```yaml
version: 1
language: en                 # bot replies in chat: en | es
observe: true                # log what would happen, act on nothing (the default at first)
defaults: { act: 0.85, unsure: 0.5 }
exempt: [broadcaster, moderators, vips]   # never moderated, still highlighted

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

## Bundled packs

A pack is a ready-made rule.

| Pack | Kind | Catches |
|---|---|---|
| `toxicity` | moderation | Insults, harassment, hate, threats |
| `spam` | moderation | Scams, selling followers, self-promotion, flooding |
| `antispoiler` | moderation | Plot reveals and hints ([Anti-spoiler](../anti-spoiler/)) |
| `questions` | highlight | Questions for the streamer |
| `interesting` | highlight | Milestones, heartfelt messages, tips you asked for |

## Your own rules

A rule of your own is a question plus what "yes" and "no" mean (see `backseat` above).

- Write them in English where you can: Jev works best in English. Chat can be in any language.
- Every rule can set its own `act` and `unsure`. How they work: [How it decides](../how-it-works/).

## Tuning from the dashboard

The **Rules** tab shows how many recent messages each rule would act on as you move its thresholds, without calling Jev again. It also has a box for testing any message.
