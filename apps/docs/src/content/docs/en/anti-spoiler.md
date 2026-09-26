---
title: Anti-spoiler
description: How Vigia keeps the streamer from seeing spoilers.
---

The goal: the streamer never has to write, read or see a spoiler. Vigia uses three layers.

1. **Jev looks for spoilers by their shape:** deaths, twists, hidden identities, "wait until you see what happens". It knows the game from your Twitch category. Set your progress with `!vigia progress "Chapter 3"` and only what comes later counts as a spoiler.
2. **Your mods keep a hidden topic list** in the dashboard. You only see how many there are, never which.
3. **Community spoiler packs** load by themselves when your category changes. You pick how far you are from part names that reveal nothing. To use or write one, see [spoiler-packs](https://github.com/vstrofago/vigia/blob/main/spoiler-packs/README.md).

## What happens to a flagged message

- In the dashboard it's blurred until you click it.
- It's never shown on the overlay.
- The bot never quotes it.
