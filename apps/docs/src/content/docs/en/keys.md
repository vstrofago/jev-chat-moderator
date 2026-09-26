---
title: Your keys
description: How to create your Twitch app and get a Jev key.
---

Vigia has no servers of its own, so it uses your credentials: always a Jev key, and a Twitch app if you want to moderate your channel.

## Jev key

A [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key (it starts with `vck_`) or a TypeSafe key both work.

Usage is billed to your account:

- $0.042 per million input tokens.
- Output is free.
- A busy night of chat usually costs cents.

The dashboard's **Stats** tab shows an hourly cost estimate.

## Twitch app

You only need it for **My channel**. Twitch requires two-factor authentication on your account before you can register apps.

1. Open the [Twitch developer console](https://dev.twitch.tv/console/apps/create) and choose **Register Your Application**.
2. Fill in the form:
   - **Name:** anything unique, for example `vigia-yourname`.
   - **OAuth Redirect URL:** `http://localhost`. If you use [server mode](../server/), also add `https://<your domain>/auth/callback`.
   - **Category:** Chat Bot.
   - **Client type:** Public.
3. Create it, open **Manage**, and copy the **Client ID**. There is no secret to keep.

## Signing in to Twitch

Vigia uses Twitch's device code: it shows you a code and you confirm it on twitch.tv. It only asks for the permissions it uses:

- Reading and sending chat.
- Deleting messages, timeouts and bans.
- Seeing who your mods are.

Vigia never issues permanent bans on its own: those are always a person's call.
