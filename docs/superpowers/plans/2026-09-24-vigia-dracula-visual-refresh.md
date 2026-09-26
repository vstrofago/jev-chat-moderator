# Vigia Dracula Classic — Plan de implementación

> **Para trabajadores agénticos:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Las tareas usan casillas de verificación.

**Goal:** Aplicar Dracula Classic oscuro a landing, playground, dashboard, configuración, login y overlay OBS, sin cambiar producto, copy ni flujos.

**Architecture:** Un archivo CSS con los tokens oficiales de Dracula será la fuente cromática común; landing/playground y app/overlay mantienen sus hojas y composición actuales, adaptadas a esos roles. Se elimina el modo claro y sus controles porque el usuario eligió tema oscuro en todas las superficies. Se conserva la transparencia del overlay y se actualizan las capturas públicas a partir del showcase real.

**Tech Stack:** CSS, Astro, TypeScript, Preact, Vite, Playwright y pnpm existentes; sin nuevas dependencias.

**Spec:** `docs/superpowers/specs/2026-09-24-vigia-dracula-design.md`

## Restricciones globales

- La paleta de Dracula Classic y los roles siguen `https://draculatheme.com/spec`.
- Conservar funciones, mensajes, copy EN/ES, marca Vigia, seguridad y modo experimental; retirar únicamente el selector claro/oscuro pedido por el usuario.
- Los estados llevan etiquetas legibles; nunca dependen solo del color.
- Texto normal: mínimo 4.5:1 de contraste; mantener foco visible, teclado, responsive y `prefers-reduced-motion`.
- No añadir paquetes, cambiar frameworks, claims, cifras de precisión, APIs ni comportamiento del producto.
- El fondo del documento OBS permanece transparente y sus parámetros y tres variantes siguen disponibles.
- No ejecutar Docker ni alterar el contenido de instalación para hacerlo.
- Trabajar en `feat/dracula-visual-refresh`, con base `dev`; terminar con un PR a `dev`, sin fusionarlo.

---

### Tarea 1: Fijar tokens Dracula y convertir app, dashboard, setup y login

**Archivos:**
- Crear: `packages/ui/src/styles/dracula.css`
- Modificar: `packages/ui/src/styles/app.css`
- Modificar: `packages/ui/src/styles/dashboard.css`
- Modificar: `e2e/dashboard.spec.ts`
- Modificar: `e2e/setup.spec.ts`

**Interfaces:**
- Produce variables CSS canónicas para fondo, superficies, texto, líneas, foco y estados de Dracula Classic.
- `app.css` y `dashboard.css` conservan sus nombres de clases y flujos actuales; solo adaptan roles visuales.

- [ ] **Paso 1: Añadir una prueba de tema que falle con el tema actual.** En `e2e/dashboard.spec.ts`, añadir un test que abra `${url}/#live` y compruebe `body` con fondo `rgb(40, 42, 54)` y `html` con `color-scheme: dark`. En `e2e/setup.spec.ts`, comprobar el mismo `color-scheme` al completar la navegación hasta el wizard. En ambos casos los datos visibles deben seguir presentes.
- [ ] **Paso 2: Ejecutar las pruebas para verificar el fallo esperado.** Ejecutar `pnpm e2e`; confirmar que falla por los colores actuales, no por el servidor, Playwright o autenticación.
- [ ] **Paso 3: Crear tokens canónicos e importarlos desde `app.css`.** Definir los valores oficiales de la spec; usar Atkinson Hyperlegible Next ya instalada; eliminar la adaptación `prefers-color-scheme: light` y fijar `color-scheme: dark`.
- [ ] **Paso 4: Adaptar dashboard y estados.** Conservar navegación, controles y layout; asignar morado a selección/foco, rojo a moderación/error, naranja a duda, verde a permitido y cian a información. Quitar el glow pulsante de la baliza y comunicar cada estado con su etiqueta además del color.
- [ ] **Paso 5: Ejecutar pruebas y build.** Ejecutar `pnpm e2e` y `pnpm --filter @vigia/ui build`; ambos deben pasar antes de seguir.

### Tarea 2: Convertir landing y playground a oscuro permanente

**Archivos:**
- Modificar: `apps/demo/src/styles/landing.css`
- Modificar: `apps/demo/src/styles/global.css`
- Modificar: `apps/demo/src/pages/index.astro`
- Modificar: `apps/demo/src/pages/playground.astro`
- Modificar: `apps/demo/src/client/landing.ts`
- Modificar: `apps/demo/src/client/app.ts`
- Modificar: `apps/demo/src/i18n/landing.es.json`
- Modificar: `apps/demo/src/i18n/landing.en.json`
- Modificar: `apps/demo/src/i18n/es.json`
- Modificar: `apps/demo/src/i18n/en.json`

**Interfaces:**
- Landing y playground importan el mismo archivo de tokens de Tarea 1 sin introducir un paquete.
- La selección EN/ES y la persistencia de idioma permanecen iguales; la persistencia del tema y el listener del selector desaparecen.

- [ ] **Paso 1: Eliminar controles de tema de ambas páginas.** Quitar solo los botones de alternancia y el script inline que recupera `jev-chat-moderator.theme`; conservar idioma, accesibilidad, CTAs y `base` de Astro.
- [ ] **Paso 2: Eliminar lógica huérfana de tema.** Retirar listeners, constantes y claves `theme.toggle` de los cuatro diccionarios, sin tocar `LANG_STORAGE`, replay, controles ni modo live.
- [ ] **Paso 3: Importar tokens y rediseñar CSS sin reescribir markup de producto.** Fijar fondo/superficies Dracula; mejorar jerarquía, ritmo y densidad; mantener el texto, los mensajes de demostración y los enlaces existentes. Quitar fondos claros, halo/gradiente y sombras decorativas. En móvil apilar copy antes de la demostración y mantener ambos CTAs.
- [ ] **Paso 4: Construir y verificar la web pública.** Ejecutar `pnpm --filter @vigia/demo build`. Arrancar `pnpm --filter @vigia/demo preview -- --host 127.0.0.1 --port 4322` y usar Playwright desde un script temporal en `~/.hermes/cache/scratch` para comprobar en `/` y `/playground/` el fondo `rgb(40, 42, 54)`, `color-scheme: dark`, cambio EN/ES y controles/replay del playground; detener el preview al terminar.

### Tarea 3: Aplicar Dracula al overlay OBS sin perder transparencia ni variantes

**Archivos:**
- Modificar: `packages/ui/src/overlay.css`
- Modificar: `e2e/dashboard.spec.ts`

**Interfaces:**
- Se conservan `theme=default|minimal|neon`, `lang`, `pos` y `preview`; no cambia `overlay.ts`.

- [ ] **Paso 1: Añadir prueba de overlay oscuro.** En el test de overlay, verificar que `body` computa transparente y que la tarjeta `default` computa fondo `rgb(33, 34, 44)` con texto legible.
- [ ] **Paso 2: Adaptar estilos.** Importar tokens compartidos; hacer Dracula Classic el tema `default`; expresar `minimal` con menos chrome y `neon` con acento Dracula contenido. Mantener `body` transparente y conservar posiciones y animaciones existentes con `prefers-reduced-motion`.
- [ ] **Paso 3: Verificar pruebas E2E.** Ejecutar `pnpm e2e`; comprobar tanto tarjeta como respuesta 401 para key incorrecta.

### Tarea 4: Regenerar las capturas de landing desde el showcase real

**Archivos:**
- Reemplazar, en sus dimensiones actuales: `apps/demo/public/shots/dashboard-en-live.png`, `dashboard-en-uncertain.png`, `dashboard-es-live.png` y `dashboard-es-uncertain.png`.

**Interfaces:**
- Se usa `apps/server/scripts/showcase.ts`, con respuestas de Jev enlatadas y mensajes existentes; no requiere key, Twitch, red ni Docker.

- [ ] **Paso 1: Compilar la UI.** Ejecutar `pnpm --filter @vigia/ui build`.
- [ ] **Paso 2: Capturar las cuatro variantes.** Iniciar el showcase en inglés y en español con puertos locales distintos; con Chromium/Playwright capturar `/#live` y `/#uncertain` a 1280×800 en cada idioma y guardar cada archivo en la ruta correspondiente.
- [ ] **Paso 3: Validar cada PNG.** Abrir las cuatro capturas; confirmar que son vistas reales del dashboard oscuro, que el contenido coincide con su nombre y que no hay cuadros blancos, spoilers revelados ni pantalla incompleta.

### Tarea 5: Verificación visual, detector, documentación y entrega

**Archivos:**
- Modificar los CSS, páginas, cliente y capturas indicados arriba.
- Crear/actualizar `DESIGN.md` desde el sistema construido.
- Conservar `PRODUCT.md`, `docs/superpowers/specs/2026-09-24-vigia-dracula-design.md` y `apps/demo/.impeccable/surfaces/apps-demo-src-pages-index-astro.md` como brief/documentación de la dirección.
- Crear capturas de verificación en `.impeccable/review/` si el revisor las necesita; no añadir datos ficticios ni screenshots que no correspondan al build.

- [ ] **Paso 1: Ejecutar verificaciones de software.** Ejecutar `pnpm build`, `pnpm test`, `pnpm typecheck` y `pnpm e2e`. Docker queda expresamente fuera.
- [ ] **Paso 2: Revisar desktop y móvil en conjunto.** Capturar landing y playground a 1440 y 390 px; revisar dashboard/setup/login/overlay en sus flujos reales. Corregir en un solo lote los defectos materiales y confirmar con una única ronda final.
- [ ] **Paso 3: Ejecutar Impeccable una vez.** Ejecutar `impeccable detect --json` sobre todos los CSS y páginas cambiados; arreglar hallazgos mecánicos sin alterar copy/funciones.
- [ ] **Paso 4: Cerrar handoffs.** Hacer revisión de acabado contra la spec y screenshots; documentar `DESIGN.md` desde el resultado final, después de todas las correcciones.
- [ ] **Paso 5: Commit, push y PR.** Confirmar diff, crear commit convencional, `git push -u origin feat/dracula-visual-refresh`, crear PR con `gh pr create --base dev`, y leer de vuelta el PR y `gh pr checks`. No fusionar.
- [ ] **Paso 6: Dejar prueba local sin ejecutarla.** Informar el comando `git switch feat/dracula-visual-refresh && docker compose up --build` para que el usuario pruebe la app localmente.
