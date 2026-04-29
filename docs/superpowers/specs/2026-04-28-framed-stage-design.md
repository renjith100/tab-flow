# Framed Stage — Design

## Problem

`newtab.html` is a new-tab override and renders at full viewport (`100vw × 100vh`), but the carousel inside it is sized for an 800×500 popup. The Cover Flow `POSITIONS` array (`newtab.js:39-45`) hardcodes pixel offsets that target a ~800px-wide stage. On any modern display the carousel floats centered in a sea of black — empty, unanchored, and visually small.

## Goal

Make the surrounding empty space feel intentional — a darkened theater framing a single spotlit carousel — without changing the carousel itself.

## Non-goals

- Do not change `POSITIONS` or any carousel physics.
- Do not change card dimensions or the reflection math (`newtab.js:90-99`).
- Do not change header, footer, search, or any layout positioning.
- Do not introduce JavaScript changes.

## Design

Three layered, CSS-only changes in `newtab.css`.

### 1. Strengthen and scale the ambient glow

The existing `body::before` radial glow (`newtab.css:36-47`) is fixed at `700px × 420px` and `rgba(88, 28, 135, 0.13)` — sized for the old popup. Make it viewport-relative so it scales with screen size while staying soft.

- Width: `min(1400px, 90vw)`
- Height: `min(700px, 70vh)`
- Center alpha: `rgba(88, 28, 135, 0.18)` (up from 0.13)
- Falloff: same `transparent 70%` end stop

### 2. Edge vignette

Add a `body::after` pseudo-element that darkens the corners of the viewport. This pulls the eye toward the center where the carousel sits.

- Fixed-position, full viewport.
- Radial gradient: transparent at center, fading to `#020207` (slightly darker than `--bg: #07070d`) at the corners.
- Subtle: corners reach ~15% additional darkening, no more.
- `pointer-events: none`, `z-index: 0` (below the `z-index: 10` content layer).

### 3. Viewport-wide horizon line

The current `.shelf` (`newtab.css:270-288`) is positioned inside `.stage-wrap`, so its 1px violet gradient line is bounded to the carousel's container width. Replace it with a viewport-wide line.

- Move `.shelf` out of `.stage-wrap` in the HTML and reposition it as a fixed element spanning `left: 0; right: 0`. Vertical position: match the on-screen y where the bounded shelf currently sits (the bottom edge of `.stage-wrap`, which in the current centered layout is approximately the vertical midline of the viewport plus ~136px). Use `top: 50%` plus a fixed offset, or measure once and hardcode — whichever is cleaner once implementing.
- Keep the existing fade-out gradient stops (transparent → violet → transparent) so the line dies into the void naturally on wide screens.
- Keep the existing soft glow.

This gives a subliminal sense of "the stage extends beyond what we can see."

## Files touched

- `newtab.css` only.

## Risks

- **Vignette intensity** — could feel heavy if too strong. Start subtle (~15% darkening at corners) and tune by eye. Easy to back off.
- **Horizon clash** — if the original `.shelf` is left in place alongside a new viewport-wide one, you get a doubled line. Mitigation: replace, don't stack.
- **Layering bugs** — `body::after` needs to sit below content (`z-index: 0`) and above the existing `body::before` glow. Confirm by inspecting computed z-index.

## Verification

After implementing, open the extension's new tab page in Chrome at multiple window widths (≥1280px, ≥1920px, fullscreen on a 4K display if available) and confirm:

- Carousel still renders identically — no card position or reflection regressions.
- Ambient glow scales but stays soft (no harsh edges).
- Vignette is perceptible but not heavy — corners feel "framed," not "darkened."
- Horizon line spans the full viewport width and fades naturally on each side.
- No visible layering artifacts (e.g. vignette hiding card edges).
