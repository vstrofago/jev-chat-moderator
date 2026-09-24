# Vigia

[English](README.md) · [Sitio web](https://vstrofago.github.io/vigia/) · [Prueba el playground](https://vstrofago.github.io/vigia/playground/)

**Un vigilante de chat gratuito y autoalojado para streamers de Twitch**, con Jev de
[TypeSafe AI](https://typesafe.ai).

- **Reglas en lenguaje normal.** Cada regla es una pregunta de sí o no para Jev ("¿esto es
  backseat que nadie pidió?"), no una lista de palabras prohibidas.
- **Protección anti-spoilers que nunca te hace spoiler.** Vigia detecta la *forma* de un
  spoiler, oculta lo que marca incluso en el dashboard del propio streamer, y carga packs de
  spoilers de la comunidad para el juego que estás jugando.
- **Preguntas y buenos mensajes en pantalla.** Los saca del chat y los muestra en un overlay
  de OBS.
- **Moderación automática** (borrar, timeout), con un registro de los mensajes de los que
  no estaba seguro en lugar de adivinar.
- **Un dashboard en vivo**, en tu propia PC o en un servidor donde tus mods entran con
  Twitch.

> **Estado:** versión previa. Todo lo de abajo funciona desde el código fuente; los primeros
> instaladores se publican con la v1.0.

## Cómo funciona

Jev es un modelo *System One*: no escribe texto. Vigia le manda cada mensaje del chat y tus
reglas como preguntas tipadas de sí o no, y Jev responde con una probabilidad para cada una,
en una sola llamada rápida y barata. **Jev nunca decide solo.** Deciden tus umbrales:

- **Desde `act` hacia arriba** (85 % por defecto), se ejecuta la acción de la regla: borrar,
  timeout, destacar o registrar.
- **Entre `unsure` y `act`** (50–85 %), el mensaje va al registro de *dudosos* para que lo
  vea una persona, o queda como destacado sugerido.
- **Por debajo de `unsure`**, no pasa nada.

**Todo es tuyo.** Tu propia app de Twitch, tu propia key de Jev y tu propia máquina. El autor
no opera ningún servidor, app compartida ni proxy. Los mensajes del chat solo van a Jev, sin
nombres de usuario, y tus keys nunca salen de tu equipo salvo para llegar a Jev y a Twitch.

## Instalación

### App de escritorio (Windows, macOS, Linux)

Descárgala de [Releases](https://github.com/vstrofago/vigia/releases). Una
ventana te guía en la configuración en unos diez minutos.

- **Windows:** ejecuta `Vigia-…-win-x64.exe`. Mientras la app no esté firmada, SmartScreen
  puede avisarte: elige **Más información → Ejecutar de todas formas**.
- **macOS (experimental, sin firma):** abre el `.dmg` y arrastra Vigia a Aplicaciones. La
  primera vez, haz clic derecho sobre Vigia y elige **Abrir**. En macOS reciente, ve a
  **Configuración del Sistema → Privacidad y seguridad → Abrir de todos modos**.
- **Linux:** haz ejecutable el AppImage (`chmod +x Vigia-…-linux-x86_64.AppImage`) y ábrelo.

La configuración pregunta dónde vigilar:

- **Mi canal** necesita una app de Twitch propia y gratuita (abajo), iniciar sesión en
  Twitch y una key de Jev.
- **Solo mirar un canal** lee cualquier canal público, en modo solo lectura, para probar
  Vigia con solo una key de Jev.

Después se abre el dashboard, y su propio asistente te lleva por tus reglas, el
anti-spoiler, el overlay de OBS y el modo observación. Al cerrar la ventana, Vigia sigue
funcionando en la bandeja del sistema, cuyo menú puede copiar la dirección del overlay,
pausar la moderación o iniciar Vigia con tu equipo. Las actualizaciones llegan solas.

### Docker en tu equipo

No necesitas Node ni configurar nada antes. Desde una copia del repositorio:

```bash
docker compose up --build
docker compose logs vigia        # el código de configuración
```

Abre `http://127.0.0.1:7777`. La página te pide el código de configuración de los logs y
luego te lleva por los mismos pasos que la app de escritorio: dónde vigilar, tu app de
Twitch, el login de Twitch y tu key de Jev. Al terminar se abre el dashboard. La
configuración queda en el volumen de Docker, así que la próxima vez arranca directo en el
dashboard.

- **El código de configuración** también es el **código de admin** para entrar al dashboard
  después.
- **Solo tu equipo** puede abrir el dashboard y el overlay.
- **Para configurarlo de nuevo:** `docker compose down` y luego
  `docker compose run --rm --service-ports vigia --setup`.

### Servidor (Docker, para equipos de mods)

En un VPS con un dominio que apunte a él:

```bash
git clone https://github.com/vstrofago/vigia && cd vigia
export VIGIA_DOMAIN=vigia.ejemplo.com
docker compose -f apps/server/docker-compose.yml up -d
docker compose -f apps/server/docker-compose.yml logs vigia    # el código de configuración
```

Abre `https://<tu dominio>` y configura Vigia en el navegador, como arriba.

- **HTTPS:** Caddy consigue solo el certificado de tu dominio.
- **Los logs** muestran el código de configuración (el **código de admin**) y, ya
  funcionando, la dirección del overlay.
- **Los mods entran con Twitch.** Agrega `https://<tu dominio>/auth/callback` a las OAuth
  Redirect URLs de tu app de Twitch.
- **El streamer** también entra con Twitch, o con el código de admin.
- **La imagen** es `ghcr.io/vstrofago/vigia`. `docker compose pull` la usa, y `--build`
  la construye desde el código.

### Línea de comandos

Con Node 22+ y pnpm:

```bash
pnpm install && pnpm --filter @vigia/ui build
pnpm vigia                       # configúralo en el navegador, en http://127.0.0.1:7777
```

O sáltate la configuración en el navegador y pasa todo en el entorno:

```bash
AI_GATEWAY_API_KEY=vck_... pnpm vigia --source observe:<canal>    # cualquier canal, solo lectura
AI_GATEWAY_API_KEY=vck_... TWITCH_CLIENT_ID=... pnpm vigia --source twitch
```

| Opción | Por defecto | |
|---|---|---|
| (sin `--source`) | | Configura Vigia en el navegador; la configuración queda en `--data` |
| `--setup` | | Vuelve a abrir la configuración en el navegador (conserva la key de Jev) |
| `--source twitch` · `observe:<canal>` | | Tu canal, o cualquier canal público en solo lectura |
| `--config <archivo>` | `vigia.yaml` | Archivo de reglas; si no existe, se crea con comentarios |
| `--data <carpeta>` | `vigia-data` | Historial, sesión de Twitch y tus propios packs de spoilers |
| `--host <dirección>` | `127.0.0.1` | `0.0.0.0` expone el dashboard (y entonces pide iniciar sesión) |
| `--port <n>` | `7777` | |
| `--rate <n>` | `1` | Solo observación: mensajes evaluados por segundo |
| `--category <nombre>` | | Solo observación: el juego, para el anti-spoiler |

## Las dos keys que pones tú

**Una app de Twitch (solo para "Mi canal").** Twitch exige la verificación en dos pasos en
tu cuenta antes de registrar apps.

1. Abre la [consola de desarrolladores de Twitch](https://dev.twitch.tv/console/apps/create)
   y elige **Register Your Application**.
2. Llénala así:
   - **Name:** cualquier nombre único, como `vigia-tunombre`.
   - **OAuth Redirect URL:** `http://localhost`. Para el modo servidor, agrega también
     `https://<tu dominio>/auth/callback`.
   - **Category:** Chat Bot.
   - **Client type:** **Public**.
3. Créala, abre **Manage** y copia el **Client ID**. No hay ningún secreto que guardar.

Vigia inicia sesión con el código de dispositivo de Twitch: confirmas un código en
twitch.tv, y solo pide lo que usa (leer y escribir en el chat, borrar mensajes, timeouts y
baneos, y ver a tus mods).

**Una key de Jev.** Usa una key del [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
(`vck_…`) o una de TypeSafe. El uso se te cobra a ti. Jev cuesta 0,042 dólares por millón
de tokens de entrada, y la salida es gratis, así que una noche de chat movido suele costar
centavos. La pestaña Estadísticas del dashboard muestra una estimación por hora.

## Reglas

Las reglas viven en `vigia.yaml`. El dashboard lo edita por ti y conserva tus comentarios, y
el archivo se recarga en cuanto lo guardas.

```yaml
version: 1
language: es                 # idioma de las respuestas del bot: en | es
observe: true                # registra lo que haría, sin actuar (así empieza)
defaults: { act: 0.85, unsure: 0.5 }
exempt: [broadcaster, moderators, vips]   # nunca se moderan, pero sí se destacan

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

| Pack | Tipo | Detecta |
|---|---|---|
| `toxicity` | moderación | Insultos, acoso, odio, amenazas |
| `spam` | moderación | Estafas, venta de seguidores, autopromoción, flood |
| `antispoiler` | moderación | Revelaciones e insinuaciones de la trama (ver abajo) |
| `questions` | destacado | Preguntas genuinas para el streamer |
| `interesting` | destacado | Logros, mensajes sentidos, tips que pediste |

- **Las reglas propias** son una pregunta más lo que significan "sí" y "no". Escríbelas en
  inglés cuando puedas, porque Jev es más fuerte ahí. El chat puede estar en cualquier
  idioma.
- **Cada regla** puede tener su propio `act` y `unsure`.
- **La pestaña Reglas** muestra sobre cuántos mensajes recientes actuaría una regla mientras
  mueves sus controles, sin volver a llamar a Jev, y tiene una caja para probar cualquier
  mensaje.
- **Empieza en modo observación.** Vigia registra lo que *haría*. Desactívalo cuando el
  registro se vea bien.

## Anti-spoiler

La regla es simple: **el streamer nunca tiene que escribir, leer ni ver un spoiler.**

1. **Jev busca la forma de un spoiler:** muertes, giros, identidades ocultas, "espera a ver
   lo que pasa". Sabe qué juego es por tu categoría de Twitch. Indica tu progreso con
   `!vigia progreso "Capítulo 3"` y solo cuenta lo que viene después.
2. **Los mods llevan una lista oculta de temas** en el dashboard. Tú solo ves cuántos hay.
3. **Los packs de spoilers de la comunidad** se cargan solos cuando cambia tu categoría.
   Eliges hasta dónde vas con nombres de partes que no revelan nada. Mira
   [spoiler-packs](spoiler-packs/README.es.md) para usar uno o escribir uno.

Los mensajes marcados como spoiler se ven borrosos en todo el dashboard hasta que haces clic.
Nunca se destacan y el bot nunca los cita.

## Comandos del chat

Para el streamer y los mods. Cada comando tiene su versión en inglés.

| Comando | En inglés | |
|---|---|---|
| `!vigia pausa` · `sigue` | `pause` · `resume` | Detiene y reanuda la moderación; los destacados siguen |
| `!vigia estado` | `status` | Reglas, pausa y modo observación |
| `!vigia progreso "Capítulo 3"` | `progress` | Progreso para el anti-spoiler |
| `!vigia regla <id> sí` · `no` | `rule <id> on` · `off` | Activa o desactiva una regla |
| `!vigia destaca [texto]` | `highlight` | Pone en pantalla un texto (o el mensaje al que respondes) |
| `!vigia limpia` | `clear` | Limpia el overlay |

## Overlay de OBS

Copia la dirección del overlay desde el dashboard (Ajustes) o desde la bandeja. En
OBS, agrega una **Fuente de navegador** con esa dirección. Agrega `&preview=1` mientras la
acomodas para ver una tarjeta de ejemplo fija, y `&pos=bl|br|bc|tl|tr` para elegir la
esquina.

## Precisión

Cada pack incluido se mide con mensajes de chat etiquetados en inglés y en español
(`packages/evals`), y no se afirma ninguna precisión sin medirla:

<!-- evals:start -->
Todavía sin medir. Los números aparecen aquí después de la primera ejecución de `pnpm eval`
con una key de Jev.
<!-- evals:end -->

- **Aciertos:** la parte de los mensajes que Jev etiqueta bien al actuar con el umbral por
  defecto.
- **Precisión:** de los mensajes sobre los que actuó, cuántos lo merecían.
- **Cobertura:** de los mensajes que lo merecían, sobre cuántos actuó.
- **Dudosos:** la parte que queda en el registro para que decida una persona.

Jev tiene menos confianza en español: espera más mensajes en el registro de dudosos, y
úsalo, junto con el modo observación, para ajustar tus umbrales.

## Privacidad

- **Lo que ve Jev:** el texto del mensaje, el mensaje al que responde, qué significan sus
  emotes y el contexto de tus reglas (juego, progreso, temas protegidos). Nunca ve un nombre
  de usuario.
- **Dónde se guarda:** el historial queda 7 días en un archivo SQLite en tu equipo.
- **La app de escritorio** guarda tus keys y tu sesión de Twitch cifradas con el llavero del
  sistema.
- **El dashboard** solo escucha en `127.0.0.1` salvo que lo expongas. Expuesto, exige iniciar
  sesión con Twitch o con el código de admin, y protege cada escritura contra CSRF.

## Desarrollo

```bash
pnpm install
pnpm test                 # tests unitarios
pnpm typecheck
pnpm simulate             # un chat guionado a través del motor
pnpm --filter @vigia/ui build && pnpm vigia --source observe:<canal>
pnpm --filter @vigia/desktop start      # la app de escritorio desde el código
pnpm eval                 # mide los packs (necesita una key de Jev)
```

```
packages/core      el cliente de Jev, preguntas, política y cola
packages/engine    reglas, packs, el flujo de mensajes, comandos del chat, packs de spoilers
packages/twitch    login por dispositivo, EventSub, Helix, IRC de solo lectura, emotes de 7TV/BTTV/FFZ
packages/server    startVigia(): archivo de reglas, SQLite, overlay, API del dashboard y acceso
packages/ui        dashboard, overlay, login y páginas de configuración del escritorio (Preact, en/es)
packages/evals     mensajes etiquetados por pack, y pnpm eval
apps/desktop       la app de Electron
apps/server        el CLI y la imagen de Docker
apps/demo          el playground en GitHub Pages
spoiler-packs      packs de spoilers de la comunidad
```

¿Quieres ayudar? Reglas, packs de spoilers, traducciones y código son bienvenidos: mira
[CONTRIBUTING.md](CONTRIBUTING.md).

## El playground

[El playground](https://vstrofago.github.io/vigia/playground/) es donde empezó Vigia.
Reproduce unos 180 mensajes de chat guionados con las respuestas que Jev dio de verdad, y te
deja mover los umbrales para ver cómo cambian las decisiones al instante. También puedes
pegar tu propia key del Vercel AI Gateway para probarlo en vivo. Córrelo en tu equipo con
`pnpm dev`, o con `docker compose -f apps/demo/docker-compose.yml up --build` para usar una key de TypeSafe.

## Licencia

MIT
