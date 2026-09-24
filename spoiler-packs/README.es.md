# Packs de spoilers de la comunidad

[English](README.md)

Un pack de spoilers le dice a Vigia qué no se debe revelar nunca en el chat de un juego o una
serie. Cuando cambia la categoría del stream, Vigia carga el pack que corresponde por su
cuenta. El streamer solo elige hasta dónde va, con nombres de partes que no revelan nada, y
nunca lee un tema.

Vigia trae el formato y el cargador, pero ningún pack de juegos. Todos los packs de esta
carpeta los escribe la comunidad. [Agrega el tuyo](#aporta-un-pack).

## Cómo funciona un pack

```yaml
version: 1
name: Example Quest
category_id: "000000"     # id de la categoría de Twitch (la coincidencia confiable)
category: Example Quest   # nombre exacto de la categoría en Twitch (la alternativa)
topics:                   # siempre protegidos
  - who the narrator really is
checkpoints:              # en orden de la historia
  - name: Chapter 1
    topics: [the mentor's fate]
  - name: Chapter 2
    topics: [the castle burning, the second villain's identity]
```

- **Los `topics` de arriba** se protegen sin importar dónde vaya el streamer.
- **Los `checkpoints`** van en el orden de la historia, y cada uno lista lo que se revela en
  esa parte. Cuando el streamer elige "Voy en: Chapter 2", los temas de Chapter 1 dejan de
  protegerse, y los de Chapter 2 en adelante siguen protegidos.
- **Sin checkpoint elegido**, todos los temas se protegen.
- **Los temas le llegan a Jev como contexto** de la regla anti-spoiler, junto con la obra y
  el progreso del streamer. Jev juzga si un mensaje revela o insinúa alguno, con cualquier
  redacción y en cualquier idioma.

La [plantilla](_template.yaml) tiene todos los campos comentados.

## Cómo escribir buenos temas

- **En inglés**, que es donde Jev es más fuerte. Los mensajes del chat pueden estar en
  cualquier idioma.
- **Cortos y concretos:** "the mentor dies in the fire", no "lo que pasa en el capítulo 2".
- **Un hecho por tema.** Jev entiende el significado, así que no hace falta cada forma de
  decirlo.
- **Nombra la cosa, no la revelación**, cuando se pueda: "the true identity of the masked
  knight" protege la revelación sin decirla. El streamer nunca ve los temas, pero los mods y
  quienes revisan el pack sí.
- **Los nombres de los checkpoints deben ser seguros.** Usa capítulos, regiones, actos o
  números de episodio, y nunca "Después de que muere X".
- **Menos de 200 caracteres cada uno**, y 500 temas por pack como máximo.

## Usar un pack sin esperar una versión nueva

- **App de escritorio:** en la bandeja, elige **Abrir carpeta de packs de spoilers** y deja
  ahí el archivo `.yaml`.
- **Servidor o CLI:** ponlo en `<carpeta de datos>/spoiler-packs/` (por ejemplo
  `vigia-data/spoiler-packs/`).

Vigia vuelve a leer la carpeta cada vez que cambia la categoría. Tus packs ganan sobre los
incluidos para la misma categoría. Si un archivo está mal, se salta, y el log dice por qué.

## Aporta un pack

1. Copia `_template.yaml` a `spoiler-packs/<nombre-del-juego>.yaml`, en minúsculas y con
   guiones.
2. Llénalo y pruébalo con tu propio Vigia (ver arriba).
3. Abre un pull request. En la descripción, di con qué checkpoints lo probaste. Quienes
   revisan leen los temas, así que marca el título del PR con **[spoilers]**.

Mira [CONTRIBUTING.md](../CONTRIBUTING.md) para lo demás.
