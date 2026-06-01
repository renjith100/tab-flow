# Grid Window Blocks — Design

**Date:** 2026-06-02
**Status:** Approved design, pending spec review
**Author:** Renjith (with Claude)
**Builds on:** multi-window labeling/pinning (`fix/multi-window-labels`, PR #31)

## Problem

In the grid, Chrome tab groups render as flat **top-level sections**, peers of the
"This window" / "Other window" ungrouped sections. So a group that lives in the
current window appears detached from it, with a different look (just a colored
dot) than the window sections — inconsistent and confusing.

## Goal

Make the **window** the top-level container. Inside each window, list its
**ungrouped tabs first**, then its **tab groups** — so groups always sit under
the window they belong to.

## Decisions (locked)

| Decision                    | Choice                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Ungrouped section label     | "Ungrouped"                                                                         |
| Window header when 1 window | Always shown (consistent)                                                           |
| Window names                | Current = "This window"; others = "Other window" (one) / "Other window 1/2…" (many) |
| Tab-group label             | "Name (tab group)" + color dot                                                      |
| Group-by **Domain** mode    | Stays **flat** (no window headers; cross-window by design)                          |

## Layout (Window mode — default)

```text
═══ This window ═════════════════════════
  Ungrouped · 12            [Close all]
  Work (tab group) · 5      [Close all]   ● blue
  Research (tab group) · 3  [Close all]   ● green
═══ Other window 1 ══════════════════════
  Ungrouped · 8             [Close all]
  Reading (tab group) · 4   [Close all]   ● red
═══ Other window 2 ══════════════════════
  Ungrouped · 6             [Close all]
```

- Window header: full-width divider with the window label + that window's total
  tab count.
- Per window: **Ungrouped** first (only if the window has ungrouped tabs), then
  each Chrome tab group in first-seen order.
- **Current window block is pinned first**; other windows follow in first-seen order.
- Single window → still one "This window" block.

## Architecture

`triage.js` — rename `buildGridSections` → **`buildGridRows`** (the return shape
changes from a flat section list to an ordered list of **rows**). A row is one of:

- **window-header**: `{ kind:'window-header', windowId, label, isCurrent, tabCount }`
- **section**: `{ kind:'ungrouped'|'group'|'domain', id, label, color, windowId, cards, count }`

`buildGridRows(tabs, groups, now, opts)` — `opts = { ungroupedBy, sort, currentWindowId }`.

**Window mode (`ungroupedBy:'window'`, default):**

1. Bucket tabs by window. For each window record its ungrouped tabs and its
   groups (first-seen order), and a total tab count.
2. Order windows: current first, then others in first-seen order.
3. Emit per window: a `window-header` row, then (if any ungrouped) an `ungrouped`
   section row labeled "Ungrouped", then a `group` section row per tab group
   labeled `"{groupName} (tab group)"` carrying the group `color`.
4. Window labels: current → "This window"; others → "Other window" when there is
   exactly one other, else "Other window 1/2/…".

**Domain mode (`ungroupedBy:'domain'`):** unchanged behavior, no window headers —
emit `group` section rows (now also labeled "(tab group)") followed by per-domain
`domain` section rows. (Domains span windows, so window nesting doesn't apply.)

Every section row's `cards` are sorted via `sortCards(cards, opts.sort)`.

`grid.js`:

- **`renderGrid(container, rows, ctx)`** iterates rows. A `window-header` row →
  `buildWindowHeader(row)` (a `.gs-window-header` divider with label + count).
  A section row → existing `buildSectionEl` (unchanged; it already renders the
  color dot for `kind:'group'` and the label as-is, so "(tab group)" shows
  through). `buildSectionEl`'s dot condition broadens to "has color".
- `buildSectionEl` "Close all" still closes that section's cards.

`newtab.js`: `renderGridView` calls `buildGridRows(...)` and passes the rows to
`renderGrid`. No other change (cards, selection, keyboard nav, count/chips header
are untouched).

## CSS

- `.gs-window-header` — full-width, top margin, a hairline/gradient divider,
  Fraunces-italic label in `--text`, a muted tab-count; visually heavier than the
  section sub-headers so the two tiers read clearly.
- Existing `.grid-section`/`.gs-header` reused for sub-sections; add a small left
  indent so sections sit visually "inside" their window block.

## Error / Edge Handling

- Window with only grouped tabs → header + group rows, **no** Ungrouped row.
- Window with only ungrouped tabs → header + Ungrouped row, no group rows.
- Single window → one "This window" block (header still shown).
- `currentWindowId` missing → no window is pinned/"This window"; windows fall back
  to first-seen order labeled "Window 1/2…" (defensive; normally always provided).
- A group whose `windowId` isn't among the tabs' windows → its tabs still bucket
  by their own `windowId`, so it lands under the right window regardless.

## Testing (`tests/triage.test.js`, `buildGridRows`)

- **Window mode, single window**: rows = [window-header "This window", ungrouped,
  group("X (tab group)")]; ungrouped precedes group.
- **Two windows**: current pinned first; labels "This window" / "Other window";
  each block ungrouped-before-groups.
- **Three windows**: labels "This window" / "Other window 1" / "Other window 2".
- **Window with no ungrouped tabs**: header followed directly by group rows.
- **Group label** carries "(tab group)" and the group color.
- **Domain mode**: no `window-header` rows; group rows + domain rows; group rows
  labeled "(tab group)".
- **Sort** applies within each section row.

## Out of scope

- "Close all tabs in this window" action on the window header (not requested).
- Collapsing/expanding window blocks.
- Changing the count/chips header or card design.
