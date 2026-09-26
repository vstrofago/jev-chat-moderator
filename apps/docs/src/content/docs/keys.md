---
title: Tus keys
description: Cómo crear tu app de Twitch y conseguir una key de Jev.
---

Vigia no tiene servidores propios, así que usa tus credenciales: una key de Jev siempre, y una app de Twitch si quieres moderar tu canal.

## Key de Jev

Sirve una key del [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (empieza con `vck_`) o una de TypeSafe.

El uso se cobra a tu cuenta:

- 0,042 dólares por millón de tokens de entrada.
- La salida es gratis.
- Una noche de chat movido suele costar centavos.

La pestaña **Estadísticas** del dashboard muestra una estimación del costo por hora.

## App de Twitch

Solo la necesitas para **Mi canal**. Twitch pide que tu cuenta tenga la verificación en dos pasos activada antes de registrar apps.

1. Abre la [consola de desarrolladores de Twitch](https://dev.twitch.tv/console/apps/create) y elige **Register Your Application**.
2. Llena el formulario:
   - **Name:** cualquier nombre único, por ejemplo `vigia-tunombre`.
   - **OAuth Redirect URL:** `http://localhost`. Si usas el [modo servidor](../server/), agrega también `https://<tu dominio>/auth/callback`.
   - **Category:** Chat Bot.
   - **Client type:** Public.
3. Créala, abre **Manage** y copia el **Client ID**. No hay ningún secreto que guardar.

## Inicio de sesión en Twitch

Vigia usa el código de dispositivo de Twitch: te muestra un código y lo confirmas en twitch.tv. Solo pide los permisos que usa:

- Leer y escribir en el chat.
- Borrar mensajes, timeouts y baneos.
- Ver quiénes son tus mods.

Vigia no hace baneos permanentes por su cuenta: esos siempre los decide una persona.
