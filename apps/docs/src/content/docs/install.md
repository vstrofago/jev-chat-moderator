---
title: Instalar la app
description: Descarga e instala la app de escritorio de Vigia en Windows, macOS o Linux.
---

Descarga la última versión desde [Releases](https://github.com/vstrofago/vigia/releases). Las versiones están marcadas como *pre-release* mientras Vigia sea experimental.

## Windows

Ejecuta `Vigia-…-win-x64.exe`. Como la app no está firmada, SmartScreen puede mostrar un aviso: elige **Más información → Ejecutar de todas formas**.

## macOS

Hay dos versiones: `mac-arm64` para Mac con Apple Silicon y `mac-x64` para Mac con Intel.

1. Abre el `.dmg` y arrastra Vigia a Aplicaciones.
2. La primera vez, haz clic derecho sobre Vigia y elige **Abrir**.
3. En macOS reciente, si no abre, ve a **Configuración del Sistema → Privacidad y seguridad → Abrir de todos modos**.

## Linux

Haz ejecutable el AppImage y ábrelo:

```bash
chmod +x Vigia-…-linux-x86_64.AppImage
./Vigia-…-linux-x86_64.AppImage
```

## La configuración

Al abrir la app, una ventana te guía. Toma unos diez minutos. Primero pregunta dónde vigilar:

- **Mi canal:** Vigia modera tu canal. Necesitas tu propia app de Twitch, iniciar sesión en Twitch y una key de Jev.
- **Solo mirar un canal:** Vigia lee cualquier canal público, sin moderar. Sirve para probarlo y solo necesita una key de Jev.

Cómo conseguir cada key: [Tus keys](../keys/).

Después se abre el dashboard. Su asistente te lleva por tus reglas, el anti-spoiler, el overlay de OBS y el modo observación.

## Mientras transmites

Al cerrar la ventana, Vigia sigue funcionando en la bandeja del sistema. Desde su menú puedes copiar la dirección del overlay, pausar la moderación o hacer que Vigia arranque con tu equipo. Las actualizaciones se instalan solas.
