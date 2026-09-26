---
title: Accuracy
description: How the accuracy of Vigia's packs is measured.
---

Every bundled pack is measured on labeled chat messages in English and Spanish (`packages/evals`). No number is published without a measurement.

<!-- evals:start -->
Not measured yet. The numbers appear here after the first `pnpm eval` run with a Jev key.
<!-- evals:end -->

## What each column means

- **Accuracy:** the share of messages Jev labels right when acting at the default threshold.
- **Precision:** of the messages acted on, how many deserved it.
- **Recall:** of the messages that deserved it, how many were acted on.
- **Uncertain:** the share that lands in the log for a person to decide.

Jev is less confident in Spanish, so expect more messages in Uncertain. Use them, together with observe mode, to tune your thresholds.
