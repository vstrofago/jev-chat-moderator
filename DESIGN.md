---
name: Vigia
description: Stoico (Aura voice) for the landing page; Vercel's Geist as-is for the product.
colors:
  # Landing: Stoico, dark by default, light via [data-theme="light"].
  stoico-ink: "#0b0b0a"
  stoico-paper: "#fafaf8"
  stoico-surface: "#111110"
  stoico-fg: "#ededea"
  stoico-fg-muted: "#a1a19b"
  stoico-fg-subtle: "#85857f"
  stoico-border: "rgb(237 237 234 / 9%)"
  stoico-border-strong: "rgb(237 237 234 / 18%)"
  stoico-success: "#6fbf94"
  stoico-warning: "#e0b45a"
  stoico-danger: "#eb7b70"
  stoico-info: "#7fa3ea"
  # Product and playground: Geist, dark values shown.
  geist-background-100: "#0a0a0a"
  geist-background-200: "#000000"
  geist-gray-100: "#1a1a1a"
  geist-gray-900: "#a1a1a1"
  geist-gray-1000: "#ededed"
  geist-gray-alpha-400: "rgb(255 255 255 / 14%)"
  geist-blue-700: "#0070f3"
  geist-red-700: "#e5484d"
  geist-amber-700: "#ffb224"
  geist-green-700: "#46a758"
typography:
  display:
    fontFamily: "Geist Pixel, Geist Mono, monospace"
    fontSize: "clamp(56px, 7.5vw, 104px)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11px"
    letterSpacing: "0.08em"
rounded:
  badge: "4px"
  control: "6px"
  surface-landing: "8px"
  surface-product: "12px"
  pill: "999px"
spacing:
  group: "16px"
  between-groups: "48px"
  landing-section: "160px"
  product-page: "32px"
---

# Design System: Vigia

## Overview

Vigia speaks in two voices of the same family, following the Stoico design language:

| Surface | System | Says |
|---|---|---|
| Landing (`apps/demo/src/pages/index.astro`) | **Stoico, Aura voice** (A02 Atmospheric) | "Look at this." |
| Playground, dashboard, setup, login, OBS overlay | **Vercel Geist, as-is** (vercel.com/geist) | "Use this." |

Target feeling: calm, precise, with one memorable moment per screen. Both voices are dark by default and share the mark: a 15×8 pixel bat drawn in `currentColor`.

## Landing: Stoico (Aura)

- **Colour.** Ink and paper only; there is no accent colour. Emphasis comes from type, scale and space. Status colours (success, warning, danger, info) are desaturated, used only for moderation states, and always paired with a word.
- **Type.** Hero headline in Geist Pixel. Headings in Geist 500 with tracking that tightens as the size grows. Body in Geist. Labels in Geist Mono at 11px, uppercase, +0.08em.
- **Structure.** Each section has a sticky label on the left numbered as structure ("01 — Funciones") and its content on the right, on a 12-column grid. Feature groups use a 1px gap on a border-coloured ground instead of boxed cards.
- **Texture.** A Bayer-dithered field behind the hero, masked so it fades out, with a cursor parallax of at most 14px. No gradients as decoration.
- **Imagery.** Screenshots are square-cornered with a mono caption ("Fig. 01").
- **Motion.** One reveal per section (fade and a 16px rise, once). The nav gains glass and a hairline only after scrolling. All motion stops under `prefers-reduced-motion`.
- **Themes.** Dark by default; light only when the visitor picks it (stored under `jev-chat-moderator.theme`, shared with the playground).

## Product: Geist

- Use Geist's tokens directly (`--ds-background-100/200`, `--ds-gray-*`, `--ds-gray-alpha-*`, and the blue, red, amber and green scales). Do not redefine them.
- **Controls.** Buttons are 32px high with a 6px radius: secondary by default, primary in gray-1000, tertiary as `.quiet`. Inputs are 40px high. The focus ring is blue-700.
- **Surfaces.** A 12px radius with a gray-alpha-400 hairline and no resting shadow. Menus and toasts use Geist's menu and toast shadows.
- **Status.** Amber while Vigia only watches or is unsure; green while it moderates and for highlights; red for moderation actions. Badges use the scale's subtle fill with its dark text, and always carry a label.
- **Themes.** Dark by default; light follows the system (`prefers-color-scheme`). The playground stays dark unless the visitor picks light.
- **OBS overlay.** The document stays transparent, and only the card is drawn. Its default, minimal and neon variants are kept, set in Geist.

## Do's and Don'ts

### Do
- Use Stoico only for the landing and Geist only for product surfaces.
- Pair every status colour with text, and keep keyboard focus visible.
- Keep spoiler-marked text hidden by default, everywhere.
- Self-host the fonts (Fontsource: Geist Sans, Geist Mono and Geist Pixel).

### Don't
- Add an accent colour to the landing, or emoji, exclamation marks or hype copy anywhere.
- Use Geist Pixel inside the product.
- Rely on colour alone for moderation states.
