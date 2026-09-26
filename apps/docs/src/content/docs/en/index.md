---
title: What Vigia is
description: Vigia is a free chat moderator for Twitch streamers that runs on your own computer.
---

Vigia reads your Twitch stream's chat and does three things:

- **Moderates:** deletes spam and times out insults.
- **Hides spoilers** for the game you're playing, including in your own dashboard.
- **Highlights questions and good messages** in an OBS overlay.

It's free, open source (MIT license), and runs on your computer or your own server.

## How it works, briefly

Each chat message is sent to **Jev**, a model by [TypeSafe AI](https://typesafe.ai) that answers yes-or-no questions with a probability. Your rules are those questions: "is it spam?", "is it a spoiler?", "is it a question for the streamer?".

Vigia compares each probability with your thresholds. If it's high, Vigia acts. If it's in between, the message goes to **Uncertain** for a mod to decide. If it's low, nothing happens. More in [How it decides](how-it-works/).

## What you need

- The Vigia desktop app (Windows, macOS or Linux), or Docker.
- A **Jev key**. You pay for the usage, which is usually cents per night.
- To moderate your channel, **your own Twitch app**, which is free. To just try Vigia, you don't need one.

Details in [Your keys](keys/).

:::caution[Experimental version (v0.1.0)]
- Start in **observe mode**, and don't make Vigia your only moderation yet.
- The installers are **unsigned**, so Windows and macOS show a warning.
:::

## Next step

[Install the app](install/) · [Try the playground](https://vstrofago.github.io/vigia/playground/)
