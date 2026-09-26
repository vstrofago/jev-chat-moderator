# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Streamers de Twitch, incluidas personas sin perfil técnico que gestionan el chat en su propio equipo, y equipos pequeños de moderación que operan su propio servidor.

## Product Purpose

Vigia es un vigilante de chat gratuito, abierto y autoalojado para Twitch. Ayuda a moderar el chat, proteger al streamer de spoilers y destacar mensajes útiles en un overlay de OBS. El éxito consiste en que los streamers puedan instalarlo, entender sus decisiones y usarlo sin depender de un servicio operado por el autor.

## Positioning

Cada streamer aporta su propia app de Twitch, su key de Jev y su equipo o servidor. Vigia envía preguntas tipadas de sí/no a Jev; las reglas y los umbrales explícitos determinan las acciones, y los mensajes dudosos quedan para revisión humana. El autor no opera un servicio, una app de Twitch ni un proxy compartidos.

## Operating Context

Vigia se usa durante transmisiones en vivo de Twitch, a menudo mientras el streamer juega y no puede inspeccionar el chat de cerca. El dashboard gestiona mensajes en vivo, decisiones dudosas, reglas, destacados, configuración y estadísticas. El asistente de configuración cubre instalaciones de escritorio y servidor/navegador; el overlay muestra mensajes seleccionados en OBS. Los moderadores pueden acceder a la instalación en servidor con autenticación de Twitch.

## Capabilities and Constraints

- La versión actual es experimental, v0.1.0; conserva ese estado y sus advertencias.
- Twitch es la plataforma compatible. La moderación automática puede borrar o aplicar timeouts; las expulsiones permanentes siguen siendo manuales.
- El modo de observación es el modo seguro inicial. Los mensajes dudosos requieren criterio humano.
- La protección anti-spoiler no debe exponer por defecto al streamer el texto marcado.
- El producto es gratuito, tiene licencia MIT, es autoalojado y no cuenta con un servicio compartido operado por el autor.
- No publiques ni sugieras cifras de precisión de moderación hasta que existan mediciones.
- En este rediseño, conserva las funciones, el contenido y la cobertura en inglés/español existentes.

## Brand Commitments

El nombre del producto es Vigia. El murciélago actual es su marca gráfica. La interfaz está disponible en inglés y español; el código y los identificadores técnicos permanecen en inglés.

## Evidence on Hand

El repositorio contiene la landing, el playground interactivo, capturas del dashboard y flujos de producto documentados. No hay resultados de precisión publicados, testimonios de clientes ni casos de éxito; no los inventes.

## Product Principles

- El streamer conserva el control de sus credenciales, datos e infraestructura.
- Vigia hace que las decisiones de moderación sean inspeccionables; la incertidumbre no se oculta tras un veredicto inexplicable de IA.
- Protege al streamer de spoilers, también dentro de la propia interfaz de Vigia.
- Permite leer y operar el chat en vivo con rapidez.
- Comunica con honestidad los límites experimentales.

## Accessibility & Inclusion

Conserva la interfaz en inglés/español, el foco visible de teclado, el contraste legible, el comportamiento adaptable y el soporte de movimiento reducido existentes. No se ha establecido un nivel de conformidad específico para el producto.
