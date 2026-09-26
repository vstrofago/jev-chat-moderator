---
title: Privacy
description: What data Jev sees and where it's stored.
---

- **What Jev sees:** the message text, the message it replies to, what its emotes mean, and your rules' context (game, progress, protected topics). It never sees a username.
- **Where it's stored:** history stays in a SQLite file on your computer for 7 days.
- **The desktop app** keeps your keys and Twitch login encrypted with your system's keychain.
- **The dashboard** listens only on `127.0.0.1` unless you expose it. If you do, it requires a Twitch or admin-code login and checks every change against CSRF.
- **The author runs no servers**, shared apps or proxies. Your messages go from your computer to Jev and Twitch, and nowhere else.
