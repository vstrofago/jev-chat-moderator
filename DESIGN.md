---
name: Vigia
description: A legible Dracula Classic interface for live Twitch chat moderation.
colors:
  primary: "#bd93f9"
  orange: "#ffb86c"
  background: "#282a36"
  background-dark: "#21222c"
  background-darker: "#191a21"
  surface: "#343746"
  surface-raised: "#424450"
  selection: "#44475a"
  current-line: "#6272a4"
  foreground: "#f8f8f2"
  muted: "rgb(248 248 242 / 78%)"
  subtle: "rgb(248 248 242 / 68%)"
  line: "rgb(98 114 164 / 40%)"
  red: "#ff5555"
  danger-text: "#ffaaaa"
  yellow: "#f1fa8c"
  green: "#50fa7b"
  bright-green: "#69ff94"
  cyan: "#8be9fd"
  pink: "#ff79c6"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(44px, 7vw, 76px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontWeight: 400
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  playground-sm: "8px"
  playground-lg: "12px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  button-landing-cta:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "46px"
  field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    height: "36px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "16px"
  nav-active:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  status-chip-review:
    backgroundColor: "transparent"
    textColor: "{colors.orange}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  message-review:
    backgroundColor: "rgb(255 184 108 / 14%)"
    textColor: "{colors.foreground}"
    rounded: "0 6px 6px 0"
    padding: "6px 12px"
  overlay-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "18px 22px 20px"
---

# Design System: Vigia

## Overview

**Creative North Star: "The Legible Broadcast Scoreboard"**

Vigia uses Dracula Classic as a precise, readable working palette rather than a decorative neon effect. Its visual grammar borrows the stable slots and numeric clarity of a broadcast scoreboard so moderation states, reasons, and controls remain easy to scan while a stream is live.

Each surface keeps its own task and affordances: the landing page demonstrates the existing chat decision flow, the playground pairs controls with a bounded chat replay, and the dashboard, setup/login, and OBS overlay remain operational. Atkinson Hyperlegible Next carries UI text; system monospace is reserved for short code and numerals. The existing bat emoji remains the product mark.

**Key Characteristics:**
- Dark-only Dracula Classic palette with stable, semantic color assignments.
- Flat tonal surfaces, thin blue-gray separators, and restrained depth.
- Explicit text labels accompany colored moderation states.
- Surface-specific responsive layouts preserve controls and reading order.

## Colors

The palette combines blue-gray dark foundations with high-luminance semantic accents. The frontmatter is normative; use its named tokens rather than introducing near-match values.

### Primary
- **Dracula Purple:** Marks keyboard focus, selected navigation, and primary actions in the operational UI.

### Secondary
- **Dracula Orange:** Carries the landing-page primary CTA and uncertain/review states.

### Tertiary
- **Dracula Red and readable danger tint:** Mark remove/error outcomes; use the lighter danger text treatment for text on dark surfaces.
- **Dracula Green and bright green:** Mark allowed/success outcomes.
- **Dracula Cyan:** Marks informational accents and the default OBS card edge.
- **Dracula Pink:** Appears in the existing chat identity palette and the OBS neon variant.
- **Dracula Yellow:** Remains in the canonical palette; current surfaces do not assign it a distinct semantic state.

### Neutral
- **Background, dark backgrounds, and surfaces:** Separate the page canvas, floating layer, and deeper code/overlay areas through tonal shifts rather than gradients.
- **Foreground, muted, and subtle text:** Establish primary and secondary reading hierarchy.
- **Selection, current-line, and translucent line:** Provide selected fills and separators. Current-line is a non-text separator color, not a small-copy color.

**The Labeled-State Rule.** Color reinforces a state but never carries it alone; retain the explicit state label and any existing icon or rule marker.

## Typography

- **Display Font:** Atkinson Hyperlegible Next (system sans-serif fallback)
- **Body Font:** Atkinson Hyperlegible Next (system sans-serif fallback)
- **Label/Mono Font:** System monospace stack for code, timestamps, and tabular numerals.

**Character:** The UI type is open and sturdy at stream-reading sizes. Monospace is a narrow instrument for compact data, not a second voice for chat or paragraphs.

### Hierarchy
- **Display** (700, responsive 44–76px, 1.02 line-height): Landing hero headline.
- **Headings** (600–700, surface-specific sizes, compact line-height): Page titles and section hierarchy across landing, playground, and dashboard.
- **Body** (400, 15–17px depending on surface): Chat, product explanation, and form instructions.
- **Labels** (600–700, typically 12–14px): Controls, metadata, and state labels; keep case changes limited to existing compact kicker/badge treatments.
- **Code and numerals** (system monospace where appropriate): Commands, timestamps, thresholds, and tabular values.

**The Reading-First Rule.** Keep messages and explanatory copy in Atkinson Hyperlegible Next; reserve monospace for short technical or numeric values.

## Layout

Use stable positions and clear reading order, with denser operational workspaces kept distinct from explanatory marketing sections. The landing page uses a capped content width and a 44/56 desktop hero split; at narrower widths its columns stack. The playground places controls beside a bounded, scrollable chat and stacks them on smaller screens. The dashboard uses a desktop top bar and side rail, a two-column live feed when space permits, and a fixed bottom navigation on mobile. Setup/login prioritize their active step or centered form. OBS anchors its card to the selected screen position while leaving the document canvas transparent. Preserve controls, labels, and reading order when layouts collapse.

The spacing rhythm repeats compact 8/16/24px steps, with broader section gaps varying by surface. Keep controls close to their labels and related readings; reserve larger gaps for transitions between major sections.

## Elevation & Depth

The default is flat: background/surface tone and fine blue-gray borders establish grouping. Shadows are reserved for genuinely floating or showcased layers, such as an open dashboard menu, the landing chat demonstration, and the OBS card. Do not use glow or blur as a substitute for separation.

**The Structural-Depth Rule.** Prefer tonal surface changes and borders at rest; use shadows only where a layer actually floats or is being presented.

## Shapes

Use restrained rounded corners for controls and bounded cards, with surface-specific radius steps rather than one universal radius: the operator UI uses compact corners, the landing uses larger showcase cards, and the playground keeps controls tighter than its chat container. Status chips are pill-shaped. Prefer thin borders and straight alignment cues for message rows; review/remove markers keep a square leading edge. Avoid decorative clipping or rounded shapes that obscure data alignment.

## Components

### Buttons
- **Primary operator action:** Purple fill with dark foreground text, compact 34px minimum height, and a 6px corner. Quiet, danger, and go variants remain visually subordinate or use their established semantic text color.
- **Landing CTA:** Orange fill with dark text, 46px height, and a 10px corner; ghost actions remain outlined and secondary.
- **Focus:** Keep the visible purple keyboard outline and offset; do not replace it with color change alone.

### Inputs / Fields
- **Style:** Dark canvas fill, thin blue-gray border, compact 6px corner, and a 36px minimum height in the operator UI.
- **Focus:** Visible purple outline. Preserve the existing larger touch targets on coarse pointers.

### Cards / Containers
- **Operator panels:** Floating Dracula surface, fine border, 10px corner, and 16px internal padding; keep them structurally flat.
- **Landing and playground cards:** Use tonal separation and their larger surface-specific corners; the chat demonstration and bounded playground feed are the focal containers.

### Navigation
- **Desktop:** Stable top bar plus a left rail. The selected item uses a selection fill and a purple inset marker.
- **Mobile:** The dashboard rail becomes a horizontally scrollable fixed bottom bar; selected state moves to a purple bottom marker. Keep labels visible.

### Status Chips and Message Rows
- **Style:** Review/remove/allow use their established orange/red/green roles with readable text labels. The dashboard uses compact outlined tags; the playground may tint a review row and mark its leading edge.
- **Rule:** Keep the reason or outcome readable without requiring color recognition.

### OBS Overlay Card
- **Document:** Remains transparent; only the message card receives a Dracula surface.
- **Variants:** Preserve default, minimal, and neon appearances, their accent treatments, positioning, and localization. Keep the card legible and the neon accent restrained to its existing variant.

## Do's and Don'ts

### Do:
- **Do** keep the Dracula Classic color roles stable across landing, playground, dashboard, setup/login, and overlay.
- **Do** accompany status colors with explicit text and preserve visible keyboard focus.
- **Do** use Atkinson Hyperlegible Next for UI and system monospace for short code and numerals.
- **Do** keep the OBS document transparent and style only its floating card.
- **Do** retain the existing bat emoji as Vigia's mark.

### Don't:
- **Don't** introduce light mode, system-preference light surfaces, neon glow, glass, gradients, or pixel fonts.
- **Don't** rely on color alone for moderation states or use current-line as small reading text.
- **Don't** reveal spoiler-marked message text by default.
- **Don't** replace the bat mark or redesign it as part of a visual-system extension.
