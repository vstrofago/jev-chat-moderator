# Community spoiler packs

[Español](README.es.md)

A spoiler pack tells Vigia what must never be revealed in chat for one game or show. When
the stream category changes, Vigia loads the matching pack by itself. The streamer only picks
how far they are, from part names that spoil nothing, and never reads a topic.

Vigia ships the format and the loader, but no game packs. Every pack in this folder is
written by the community. [Add yours](#contribute-a-pack).

## How a pack works

```yaml
version: 1
name: Example Quest
category_id: "000000"     # Twitch category id (the reliable match)
category: Example Quest   # exact Twitch category name (the fallback)
topics:                   # always protected
  - who the narrator really is
checkpoints:              # in story order
  - name: Chapter 1
    topics: [the mentor's fate]
  - name: Chapter 2
    topics: [the castle burning, the second villain's identity]
```

- **Top-level `topics`** are protected wherever the streamer is.
- **`checkpoints`** are listed in story order, and each one lists what is revealed in that
  part. When the streamer picks "I'm at: Chapter 2", the Chapter 1 topics stop being
  protected, while Chapter 2 and everything after it stay protected.
- **With no checkpoint picked**, every topic is protected.
- **Topics go to Jev as context** for the anti-spoiler rule, together with the work and the
  streamer's progress. Jev then judges whether a message reveals or hints at one of them,
  in any wording or language.

The [template](_template.yaml) has every field with comments.

## Writing good topics

- **In English**, where Jev is strongest. Chat messages can be in any language.
- **Short and concrete:** "the mentor dies in the fire", not "chapter 2 events".
- **One fact per topic.** Jev matches meaning, so you don't need every phrasing.
- **Name the thing, not the reveal**, when you can: "the true identity of the masked
  knight" protects the reveal without stating it. Topics are never shown to the streamer,
  but mods and contributors read them.
- **Checkpoint names must be safe.** Use chapters, regions, acts or episode numbers, and
  never "After X dies".
- **Under 200 characters each**, and 500 topics per pack at most.

## Using a pack without waiting for a release

- **Desktop app:** from the tray, choose **Open spoiler packs folder** and drop the `.yaml`
  file there.
- **Server or CLI:** put it in `<data folder>/spoiler-packs/` (for example
  `vigia-data/spoiler-packs/`).

Vigia reads the folder again every time the category changes. Your own packs win over the
bundled ones for the same category. A broken file is skipped, and the log says why.

## Contribute a pack

1. Copy `_template.yaml` to `spoiler-packs/<game-name>.yaml`, using lowercase and hyphens.
2. Fill it in, and try it with your own Vigia (see above).
3. Open a pull request. In the description, say which checkpoints you tested with.
   Reviewers read the topics, so please mark the PR title with **[spoilers]**.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the rest.
