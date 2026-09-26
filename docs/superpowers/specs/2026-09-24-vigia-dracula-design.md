# Vigia — Rediseño visual Dracula Classic

- **Fecha:** 2026-09-24
- **Estado:** Dirección aprobada para ejecución autónoma; el usuario pidió un cambio de diseño, sin cambios de producto.
**Alcance:** Landing, playground, dashboard, configuración, login y overlay OBS.

## Objetivo

Unificar las seis superficies de Vigia con Dracula Classic oscuro y elevar su acabado visual sin cambiar sus funciones, copy, capacidades ni afirmaciones. Mantener la identidad del producto y hacer que los estados de chat se entiendan de inmediato durante una transmisión.

## Hechos de producto que no cambian

Vigia continúa siendo gratuito, abierto, MIT y autoalojado; su versión es experimental. No se añadirán promesas ni cifras de precisión. Se conservan los flujos existentes, el contenido EN/ES, el modo de observación, la revisión humana de mensajes dudosos, la protección anti-spoiler, la configuración, el login y las variantes del overlay. El usuario pidió que todas las superficies sean oscuras; se elimina el selector claro/oscuro y no se sigue la preferencia clara del sistema.

## Decisión visual

Dracula Classic es la paleta vinculante. La estructura toma disciplina de un marcador de transmisión: columnas y cifras estables, decisiones etiquetadas, jerarquía inmediata y una franja de umbrales legible. No se imita literalmente una consola de código ni se usan tipografía pixelada, HUD decorativo, vidrio, gradientes luminosos o brillos como sustituto de diseño. El hero demuestra el trabajo de Vigia con la secuencia de chat que ya existe; el dashboard prioriza lectura y operación, no decoración.

### Alternativas consideradas

1. **Una identidad semántica Dracula con adaptaciones por superficie (elegida).** Un archivo CSS de tokens canónicos y usos adaptados en el sitio, la app y el overlay. Mantiene coherencia sin reescribir frameworks ni imponer componentes de marketing al dashboard.
2. **Repetir los valores en cada hoja de estilo.** Menos cambio inicial, pero aumenta el riesgo de que playground, landing y app vuelvan a divergir.
3. **Rehacer la interfaz con una librería o nuevo sistema de componentes.** Más coste y riesgo; no aporta valor al cambio de diseño solicitado.

Se elige la primera opción, sin nuevas dependencias ni migración de framework. Las superficies conservan su propia composición y sus affordances.

## Paleta y semántica

Valores copiados de la especificación oficial de Dracula:

| Rol | Valor |
|---|---|
| Fondo | `#282A36` |
| Fondo oscuro | `#21222C` |
| Fondo más oscuro | `#191A21` |
| Superficie | `#343746` |
| Superficie elevada | `#424450` |
| Selección | `#44475A` |
| Línea/comentario | `#6272A4` |
| Texto principal | `#F8F8F2` |
| Rojo | `#FF5555` |
| Naranja | `#FFB86C` |
| Amarillo | `#F1FA8C` |
| Verde | `#50FA7B` |
| Cian | `#8BE9FD` |
| Morado | `#BD93F9` |
| Rosa | `#FF79C6` |

Morado identifica selección/foco/acción primaria; rojo, moderación o error; naranja, duda/advertencia; verde, permitido/éxito; cian, información/enlaces; rosa, destacados. Cada estado lleva texto y, cuando corresponda, icono o regla lateral; el color nunca es su único significado. La escala cromática brillante se reserva para texto semántico sobre fondos oscuros. La variante funcional oficial (rojo `#DE5735`, naranja `#A39514`, verde `#089108`, cian `#0081D6`, morado `#815CD6`) no se usará como texto si no alcanza contraste suficiente.

Verificación de contraste realizada con la fórmula WCAG: `#F8F8F2` sobre `#282A36` = 13.36:1; naranja = 8.36:1; verde = 10.38:1; cian = 10.29:1; morado = 5.90:1; rojo = 4.53:1. El rojo debe permanecer sobre `#282A36` o un fondo más oscuro: sobre `#343746` queda en 3.75:1. `#6272A4` sirve para separadores no textuales sobre el fondo, no para texto pequeño. Conservar el mínimo 4.5:1 para texto y el foco visible.

La tipografía de lectura sigue siendo Atkinson Hyperlegible Next, ya usada por la app; cifras, tiempos y comandos pueden usar la pila monoespaciada del sistema. No se añade una fuente ni dependencia.

## Tratamiento por superficie

- **Landing:** solo modo Dracula oscuro. Conservar estructura, mensajes, CTAs y enlaces; ordenar hero, navegación, muestra de chat, secciones y descargas con una jerarquía más clara y menos tarjetas redondeadas/sombras. Las capturas del dashboard deben reflejar la nueva interfaz real.
- **Playground:** mismo tema y tipografía; conservar replay, controles, umbrales, datos y modo live. Chat y cambios de decisión siguen siendo el foco; quitar el control de tema claro.
- **Dashboard:** fondo y superficies Dracula; selección morada, estados de moderación/duda/permitido según la semántica indicada. Conservar navegación, densidad operativa, roles, controles y estado de observación.
- **Configuración y login:** mismo tema oscuro; conservar pasos, campos, mensajes y accesibilidad del flujo. La configuración debe seguir priorizando el paso activo.
- **Overlay OBS:** el documento sigue transparente; solo la tarjeta usa Dracula oscuro. Conservar `theme=default|minimal|neon`, idioma, posiciones y vista previa; llevar las tres variantes a la paleta Dracula y reservar el brillo para el modo neon, sin alterar el comportamiento.

## Adaptación y accesibilidad

En desktop se conserva la lectura en columnas donde el viewport lo permite; en móvil se apilan áreas sin reducir controles ni ocultar estados. Conservar labels, nombres y descripciones, foco de teclado, `prefers-reduced-motion` y controles existentes. Mantener el texto de estado además del color. Comprobar scroll y desbordamiento del feed y del overlay.

## Derivación del formulario visual

La lista de trabajo ordenó: (1) hoja de ruta de producción de transmisión, (2) marcador de esports, (3) marcador electrónico de siete segmentos, (4) tarjeta de anotación de árbitro, (5) panel de señales de realización, (6) rótulo de emisión y (7) tabla de puntuaciones de arcade. El seed asignó la opción 3 (`743300c9`): cifras y estados ocupan posiciones estables y cambian de significado sin mover el layout. El usuario fijó Dracula Classic; esa decisión prevalece sobre la asignación y cualquier alternativa.

Evaluación de retos del seed, en identificación del público y claridad del producto:

- Cel de animación multiplano: **declinada**; no explica el trabajo de moderación. Se conserva la disciplina de separar hero, demostración y explicación en planos de jerarquía, sin parallax.
- Mar bioluminiscente: **declinada**; la asociación nocturna ayuda, pero el resplandor resta legibilidad. Se conserva contraste explícito entre estados, sin partículas ni estelas decorativas.
- Marcador de siete segmentos: **compatible** con el formulario asignado; aporta lectura fija de cifras y estados. Se traduce a cifras tabulares, no a una fuente pixel.
- Hoja de exposición de cuarto oscuro: **competitiva** en claridad de umbrales y débil en identificación del público. Se conserva la escala etiquetada de permitido, dudoso y actuar; se descartan tramas.
- Cartel de doble función: **declinado**; la energía gráfica afecta la legibilidad. Se conserva contraste tipográfico entre título, metadatos y controles, sin collage ni textos inclinados.
- Muestra tipográfica bitmap: **declinada**; la textura pixelada perjudica la lectura del chat. Se conserva mono solo para cifras y datos cortos.

## Cambios fuera de alcance

No cambiar copy salvo la retirada del control de tema, funciones, API, reglas, datos, modelo, routing, identidad del producto, comportamiento del replay, seguridad ni modo de instalación. No ejecutar Docker; el usuario probará esa ruta.

## Criterios de aceptación

1. Las seis superficies renderizan Dracula Classic oscuro; no aparece modo claro por selector ni por preferencia del sistema.
2. Landing y playground mantienen íntegros sus idiomas y comportamiento; dashboard/setup/login conservan sus flujos; overlay sigue transparente, localizado, posicionable y con variantes.
3. La paleta usa valores oficiales; estados siguen entendibles sin color y los textos mantienen al menos 4.5:1 de contraste.
4. Las capturas publicadas del dashboard son de la interfaz oscura real y no de la versión anterior.
5. Pasan `pnpm build`, `pnpm test`, `pnpm typecheck` y las pruebas E2E aplicables; las capturas desktop y móvil se revisan y el detector Impeccable se ejecuta una vez.
6. Se crea una rama nueva desde `dev`, se publica el trabajo y se abre un PR hacia `dev`. Docker no se ejecuta; el cierre incluye el comando para que el usuario lo pruebe.

## Referencia

Especificación oficial Dracula: https://draculatheme.com/spec
