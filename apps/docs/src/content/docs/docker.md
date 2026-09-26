---
title: Docker en tu equipo
description: Correr Vigia con Docker en tu propia computadora.
---

Con Docker no necesitas instalar Node ni configurar nada antes. Desde una copia del repositorio:

```bash
git clone https://github.com/vstrofago/vigia && cd vigia
docker compose up --build
docker compose logs vigia        # muestra el código de configuración
```

Abre `http://127.0.0.1:7777`. La página te pide el código de configuración que aparece en los logs, y luego sigue los mismos pasos que la app de escritorio: dónde vigilar, tu app de Twitch, el inicio de sesión y tu key de Jev.

La configuración queda en el volumen de Docker, así que la próxima vez arranca directo en el dashboard.

- **El código de configuración** es también el **código de admin** para entrar al dashboard después.
- **Solo tu equipo** puede abrir el dashboard y el overlay.
- **Para configurarlo de nuevo:**

  ```bash
  docker compose down
  docker compose run --rm --service-ports vigia --setup
  ```
