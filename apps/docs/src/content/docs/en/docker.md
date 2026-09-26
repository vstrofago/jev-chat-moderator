---
title: Docker on your computer
description: Run Vigia with Docker on your own computer.
---

With Docker you don't need to install Node or configure anything first. From a clone of the repository:

```bash
git clone https://github.com/vstrofago/vigia && cd vigia
docker compose up --build
docker compose logs vigia        # shows the setup code
```

Open `http://127.0.0.1:7777`. The page asks for the setup code from the logs, then follows the same steps as the desktop app: where to watch, your Twitch app, the login, and your Jev key.

The settings are kept in the Docker volume, so the next start goes straight to the dashboard.

- **The setup code** is also the **admin code** for logging in to the dashboard later.
- **Only your computer** can open the dashboard and the overlay.
- **To set it up again:**

  ```bash
  docker compose down
  docker compose run --rm --service-ports vigia --setup
  ```
