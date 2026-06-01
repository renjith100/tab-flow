# TabFlow Grid v2 — Triage Enhancements Design

**Date:** 2026-06-01
**Status:** Approved design, pending spec review
**Author:** Renjith (with Claude)
**Builds on:** `2026-06-01-tabflow-overview-grid-design.md` (Grid v1, branch `feat/overview-grid`)

## Problem

Grid v1 made every tab visible and closable. To make it genuinely _useful_ for
keeping tab count down, users need help **deciding what to close**, **organizing
fast**, and **not re-accumulating**. Four enhancements address this — all within
TabFlow's existing permissions (`tabs`, `tabGroups`, `windows`, `sessions`; the
`action` badge needs none).

## Goals

1. **Toolbar count badge** — live open-tab count on the extension icon, tone-colored.
2. **Group-by control** — organize ungrouped tabs By Window or By Domain (Chrome groups always preserved as sections).
3. **Sort control** — Recently used / Oldest / Name, within each section.
4. **Smarter stale signals** — relative age on every card; stale (7+ days) flagged in place.
5. ~~**Promote selection → Chrome tab group**~~ — **removed (2026-06-02).** Off-mission
   (the grid is for triage/closing; Chrome already groups tabs natively) and the
   `prompt()` flow was clunky. Multi-select + bulk close are kept.

## Non-Goals

- OG previews (deferred, opt-in — see project memory).
- A settings/options page (controls live inline; preferences in `localStorage`).
- "Never visited" detection (Chrome's API can't distinguish it reliably).
- Stale "review lane" that moves tabs out of sections (chose flag-in-place instead).
- Cross-window _merge_ into a single group (we create a same-named group per window).

## Decisions (locked)

| Decision        | Choice                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| Domain grouping | Chrome groups stay as sections; only ungrouped tabs cluster by domain      |
| Promote action  | Create a Chrome tab group (named via prompt, Chrome default color)         |
| Never-visited   | Dropped; use relative age + flag-in-place                                  |
| Stale display   | Flagged in place (dimmed + red ⏳-age badge), not a separate lane          |
| Defaults        | group = By window, sort = Recently used, badge always on, age always shown |

## Architecture

Additive, following existing vanilla-JS patterns. No framework, no build step.

### `triage.js` — new pure helpers (unit-tested)

- `relativeAge(lastAccessed, now)` → short label: `"now"` (<60s), `"5m"`, `"3h"`,
  `"2d"`, `"3w"`, `"4mo"`. Returns `""` when `lastAccessed` is missing/0.
- `sortCards(cards, mode)` → returns a sorted copy. Modes:
    - `"recent"` — `lastAccessed` descending (newest first).
    - `"oldest"` — `lastAccessed` ascending.
    - `"name"` — `title` case-insensitive ascending.
- `buildGridSections(tabs, groups, now, opts)` — **extended signature**. `opts`
  defaults to `{ ungroupedBy: 'window', sort: 'recent' }` (old 3-arg calls keep
  v1 behavior). Chrome-grouped tabs always produce group sections first. Ungrouped
  tabs are split into per-window sections (`ungroupedBy:'window'`) **or** per-domain
  sections (`ungroupedBy:'domain'`, label = domain). Every section's `cards` are
  passed through `sortCards(..., opts.sort)`.
- `toCard(t, now)` — **extended** to carry `lastAccessed` and `ageLabel =
relativeAge(t.lastAccessed, now)` (in addition to existing fields incl. `stale`).

### `grid.js` — display only

- Meta line renders just the **domain**. The relative age is shown as a **pill**
  overlaid on the image (bottom-left, via `makeAgePill`), color-coded by freshness
  (bright green → near-black with age). When the card is stale the pill turns red
  and shows `> {ageLabel}`. The card keeps its `.is-stale` dim; there is no
  separate `.gc-stale` badge.
- Audible tabs show the same **random moving intensity bar** as Cover Flow
  (`makeAudioBar` reuses `.audio-intensity-wrapper`/`.audio-intensity-bar` at the
  card bottom, with randomized pulse/shift timing per tab).

### `newtab.js` — controls, persistence, promote

- Two control widgets in the overview header (right side, next to chips):
    - **Group:** segmented `Window | Domain`. Persisted as `tabflow:groupBy`.
    - **Sort:** `Recent | Oldest | Name`. Persisted as `tabflow:sort`.
    - Changing either re-renders the grid (`renderGridView`), which reads the two
      persisted values and passes them as `opts` to `buildGridSections`.
- `groupSelected()` wired to a new **"Group these"** button in the selection bar:
    - Prompt for a name (`window.prompt`, default `"New group"`); cancel = abort.
    - Group selected tab IDs **per window**: for each window that has selected
      tabs, `chrome.tabs.group({ tabIds })` then `chrome.tabGroups.update(groupId,
{ title })`. (A Chrome group can't span windows.)
    - Clear selection; live-sync re-renders.

### `background.js` — toolbar badge (independent)

- `importScripts('triage.js')` to reuse `countTone`.
- `updateBadge()`: `chrome.tabs.query({})`, count tabs whose `url` is not the
  TabFlow page, `chrome.action.setBadgeText({ text: String(n) })` (or `""` when 0),
  and `setBadgeBackgroundColor` by tone: calm `#3f3f46`, warn `#f59e0b`, alert `#ef4444`.
- Call on `onCreated`, `onRemoved`, `onAttached`, `onDetached`, `onUpdated`
  (when `url` changes), `runtime.onStartup`, and `runtime.onInstalled`.

## Data Flow

```text
background.js: tab events ──> updateBadge() ──> chrome.action.setBadgeText/Color

newtab.js renderGridView():
  read localStorage(tabflow:groupBy, tabflow:sort)
  query all tabs+groups ──> map ──> buildGridSections(tabs, groups, now,
                                       { ungroupedBy, sort })
  ──> grid.js renderGrid()  (cards show domain + freshness age pill)

selection bar "Group these" ──> groupSelected()
  ──> per-window chrome.tabs.group + tabGroups.update(title)
```

## Error / Edge Handling

- `relativeAge(0)` / missing → `""` (no age shown; never crashes).
- Domain grouping when a tab URL has no host (e.g. `chrome://`) → `getDomain`
  fallback (`"chrome"`), so it still lands in a section.
- "Group these" with a selection spanning windows → one group per window, same title.
- `chrome.tabs.group` failure (e.g. a pinned/restricted tab) → catch, leave those
  tabs ungrouped, continue; selection cleared regardless.
- Badge count when only TabFlow tabs exist → excludes them; may show `""`.
- Sort stability: `sortCards` returns a copy (no mutation of the source list).

## Testing

- **`relativeAge`**: boundaries — 0/missing → `""`; 59s → `"now"`; 60s → `"1m"`;
  60m → `"1h"`; 24h → `"1d"`; 7d → `"1w"`; ~30d → `"1mo"`.
- **`sortCards`**: `recent` (desc), `oldest` (asc), `name` (case-insensitive); input not mutated.
- **`buildGridSections`** with `ungroupedBy:'domain'`: Chrome groups still produce
  group sections; ungrouped tabs cluster into domain-labeled sections; section
  cards respect `sort`.
- **`buildGridSections`** default args still match v1 (regression guard).
- **Manual:** badge count + color across windows; group/sort controls re-render &
  persist across reloads; age labels correct; "Group these" creates a named Chrome
  group (incl. cross-window selection); Cover Flow unaffected.

## Decomposition note

Feature 1 (badge) is independent of the grid; features 2–5 share the grid surface.
All five are small and cohesive, so they ship as **one implementation plan** with
the badge as its own early, standalone task.
