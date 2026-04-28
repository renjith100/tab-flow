# Typography Pass — Design

## Problem

The new-tab UI reads as anemic on a wide screen. Two specific complaints:

1. **Search bar is too small** — at 256×38 with 13px text it reads as a secondary control rather than the entry point. Users glance past it.
2. **Labels are hard to read** — most text (counter, hints, card title, domain, detail strip) is 10–12px at 38–75% opacity. The hierarchy is weak and individual labels are anemic.

## Goal

Apply a confident type system: search bar becomes the visual entry point without dominating, and a consistent label ladder makes hierarchy readable in one glance.

## Non-goals

- Do not change the carousel physics (`POSITIONS` array, transforms, `updateReflect`).
- Do not change the layout order, the DOM structure, or any JavaScript.
- Do not change theme colors or the accent — only alpha/contrast bumps.
- Do not touch the framed-stage commits (ambient glow, edge vignette, viewport-wide horizon). Those stay as-is.
- Do not change the favicon ring, audio bar geometry, or group-favicon cluster.

## Files touched

- `newtab.css` — all sizing, weight, and contrast changes.
- `newtab.html` — one line: the `<svg>` width/height attributes on the search icon (15×15 → 18×18). DOM structure is unchanged.

## Design

### Search bar (`.search`, `.search-icon`)

| Property | Current | New |
|---|---|---|
| Width | 256px | 400px |
| Height | 38px | 42px |
| Font size / weight | 13px / 400 | 15px / 500 |
| Padding | `0 18px 0 40px` | `0 22px 0 46px` |
| Icon size | 15×15 | 18×18 |
| Icon color | `var(--text-dim)` (38%) | `rgba(255,255,255,0.55)` |
| Icon left offset | 14px | 16px |
| Border / focus glow | unchanged | unchanged |
| Placeholder color | `var(--text-dim)` | unchanged |

The icon size change is the only HTML touch in the entire pass: update the `<svg width/height>` attributes on `newtab.html:23-24`. Every other change is in `newtab.css`.

### Type scale for labels

All values below are `font-size` in px, then `font-weight` after `/`, then alpha-on-white (where `--text-dim` was 0.38 and `--text` was 0.92).

| Element | Selector | Current | New |
|---|---|---|---|
| Counter | `.counter` | 11 / 600, 0.38 | 13 / 600, 0.55 |
| Counter highlight | `.counter .n` | violet | violet (unchanged) |
| Hint label | `.hint` | 11 / 400, 0.38 | 12 / 500, 0.55 |
| Hint key pill | `.key` | 10 / 600, 0.50 | 11 / 700, 0.65 |
| Card title (inactive) | `.card-title` | 12 / 500, 0.75 | 14 / 600, 0.82 |
| Card title (active) | `.is-active .card-title` | 12 / 500, 1.00 | 14 / 600, 1.00 |
| Card domain | `.card-domain` | 10 / 400, 0.38 | 11 / 400, 0.50 |
| Detail strip | `.detail` | 12 / 400, 0.38 | 13 / 400, 0.55 |
| Detail highlight | `.detail .hl` | 0.55 | 0.70 |
| Group name | `.group-name` | 13 / 600 | 14 / 600 |
| Group count | `.group-count` | 10 / 400, 0.38 | 11 / 400, 0.50 |
| Empty state | `.empty` | 13 / 400, 0.38 | 14 / 400, 0.55 |

### What stays untouched

- Logo (`.logo`) — already prominent at 26px Fraunces italic 300.
- Card geometry — `--card-w: 176px`, `--card-h: 224px`, `border-radius: 18px`, padding, gap.
- Favicon ring — 88×88, 22px radius, fav-img/fav-fallback at 54×54.
- Audio intensity bar geometry and animation.
- Group favicon cluster — sub-favicons at 36×36, scattered 2×2 layout.
- Theme tokens (`--bg`, `--violet`, `--violet-mid`, `--violet-soft`, `--text`, `--text-dim`).
- Framed-stage commits (`body::before` glow, `body::after` vignette, viewport-wide `.shelf`). They stay.

## Risks

- **Card title truncation** — bumping card title from 12 to 14px on a fixed 176px-wide card means fewer characters fit before ellipsis. Existing `text-overflow: ellipsis` handles this cleanly, but the active card may show e.g. 22 chars instead of 26. Acceptable trade for readability.
- **Hint pill height shift** — bumping the pill text from 10 to 11px and weight 600 to 700 grows the pill very slightly. The footer row gap (16px) absorbs it without re-flow.
- **Detail strip overflow** — `.detail` has `max-width: 560px` and ellipsis. The 12→13 bump shortens fit by ~8% of characters; ellipsis still handles overflow cleanly.
- **Search bar at 400px on a small popup window** — irrelevant in this codebase: this is a new-tab override, not a popup, so the viewport is always full window. 400px fits comfortably even at the narrowest realistic browser width.

## Verification

After implementing, reload the unpacked extension at `chrome://extensions` and open a new tab. Confirm at a typical laptop width (~1280px):

- Search bar reads as the page's entry point — eye lands on it before the carousel.
- Counter, hints, card title, domain, and detail strip are all noticeably more legible.
- Active card title is sharp; inactive titles are clearly secondary but not dim-to-illegible.
- Hint key pills are still pill-shaped (no awkward stretching from the size bump).
- Card titles ellipsize cleanly when they exceed card width (test with a long-titled tab).
- No layout reflow that pushes content off-screen.

If any size feels off in practice, tune by ±1px. The values above are the starting point, not a contract.
