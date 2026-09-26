---
title: Install the app
description: Download and install the Vigia desktop app on Windows, macOS or Linux.
---

Download the latest version from [Releases](https://github.com/vstrofago/vigia/releases). Versions are marked *pre-release* while Vigia is experimental.

## Windows

Run `Vigia-…-win-x64.exe`. The app isn't signed, so SmartScreen may show a warning: choose **More info → Run anyway**.

## macOS

There are two versions: `mac-arm64` for Macs with Apple Silicon and `mac-x64` for Intel Macs.

1. Open the `.dmg` and drag Vigia to Applications.
2. The first time, right-click Vigia and choose **Open**.
3. On recent macOS, if it doesn't open, go to **System Settings → Privacy & Security → Open Anyway**.

## Linux

Make the AppImage executable and run it:

```bash
chmod +x Vigia-…-linux-x86_64.AppImage
./Vigia-…-linux-x86_64.AppImage
```

## Setup

When you open the app, a window guides you. It takes about ten minutes. First it asks where to watch:

- **My channel:** Vigia moderates your channel. You need your own Twitch app, a Twitch login and a Jev key.
- **Just watch a channel:** Vigia reads any public channel without moderating. It's for trying Vigia out and only needs a Jev key.

How to get each key: [Your keys](../keys/).

Then the dashboard opens. Its wizard takes you through your rules, the anti-spoiler, the OBS overlay and observe mode.

## While you stream

Closing the window keeps Vigia running in the system tray. From its menu you can copy the overlay address, pause moderation, or start Vigia with your computer. Updates install by themselves.
