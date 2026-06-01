# TabFlow Overview Grid — Design

**Date:** 2026-06-01
**Status:** Implemented. **Update 2026-06-02:** the grid is now **current-window
only**, and **multi-select** (and promote-to-group) were **removed** — close
actions are per-card ×, section "Close all", and the stale/duplicate chips. OG
rich cards remain deferred (opt-in). References to those below are historical.
**Author:** Renjith (with Claude)

## Problem

TabFlow today is a beautiful Cover Flow _switcher_. It helps you move between
tabs, but it does nothing to help you **reduce** them. Users keep 50–80+ tabs
open, forget TabFlow exists, and the clutter never goes down. The Cover Flow
shows only ~5 cards at once, so there is no bird's-eye view to act on and no
nudge to clean up.

The job to be done is **tab triage**, not tab browsing: see everything at once,
recognize what each tab is, and close anything instantly — with a count that
keeps the clutter in your face.

## Goals

- A new **Grid (Overview)** view showing **every open tab as a rich card** on a
  full desktop canvas, default on launch.
- **Close any tab instantly** from the first screen (per-card ×, bulk select,
  smart bulk actions).
- A **prominent open-tab count** that escalates in tone as the number grows.
- **Rich cards**: OG preview image + favicon + title + OG description + domain.
- **Cover Flow preserved** as a one-click toggle; the user's view choice is
  remembered.
- Keep TabFlow keyboard-first.

## Non-Goals

- Save-as-stash / named tab collections (deferred; undo toast is the safety net).
- A persistent "recently closed" panel (deferred).
- Syncing or any server/cloud component. All data stays local.
- Cross-browser support beyond Chrome (Manifest V3).

## Decisions (locked)

| Decision              | Choice                                         |
| --------------------- | ---------------------------------------------- |
| Default view          | **Grid** (Cover Flow one click away)           |
| Card data depth       | **Full OG**: description + preview image       |
| Stale threshold       | **Untouched 7+ days** (via `tab.lastAccessed`) |
| Bulk-close safety net | **Undo toast only** (extend existing ⌘Z)       |

## Architecture

TabFlow already opens as a **full browser tab** (`background.js` opens
`newtab.html`; `newtab.css` self-constrains it to an 800×500 centered box). No
manifest restructuring is needed — we remove the fixed-size constraint for the
Grid view and let it use the full viewport.

The codebase is **vanilla JS/CSS/HTML** (no build step; `package.sh` zips the
folder). New code follows the same style — no framework introduced.

### View modes

`newtab.html` hosts both views. A `viewMode` of `'grid' | 'coverflow'` (persisted
in `chrome.storage.local`) decides which renders. A header toggle (⊞ Grid /
≋ Cover Flow) switches between them without reload. Grid is the default.

Cover Flow's existing interaction model and code path are left intact; the Grid
is additive.

### Components (clear, isolated units)

- **`og-cache.js`** (background-side) — owns the OG metadata cache. One job:
  receive OG payloads from the content script, store/evict in
  `chrome.storage.local` keyed by URL, answer lookups. Consumers depend only on
  `get(url) → {title, description, image, fetchedAt}` and `set(url, payload)`.
- **`og-scraper.js`** (content script) — runs at `document_idle` on visited
  pages, reads `og:title` / `og:description` / `og:image` (and `<title>` /
  meta description fallbacks), posts them to the background. One job: extract and
  report. No DOM mutation.
- **`grid.js`** (UI) — renders sections + rich cards from `allTabs` + OG cache,
  handles per-card close, multi-select, smart-chip actions, keyboard nav within
  the grid. Reads cache via a message to the background; never scrapes directly.
- **`triage.js`** (UI helper) — pure functions over the tab list: `staleTabs()`,
  `duplicateGroups()`, `countTone(n)`. No DOM, fully unit-testable.
- Existing `newtab.js` Cover Flow logic is refactored minimally so shared tab
  loading is reusable by both views; Cover Flow behavior is unchanged.

### Data flow

```text
Page visited ──> og-scraper.js (content script, document_idle)
                      │ chrome.runtime.sendMessage({og payload})
                      ▼
              og-cache.js (background) ──> chrome.storage.local
                      ▲
   grid.js ── message: getOg(urls) ──────┘   (instant, no tab wake-up)
      │
      └─ chrome.tabs.query ──> allTabs (id, title, favIconUrl, url, groupId,
                                        lastAccessed, audible, windowId)
      └─ merge(allTabs, ogCache) ──> rich cards
```

Because OG data is cached **passively as pages are visited**, the Grid never has
to wake the ~80 sleeping tabs. Sleeping tabs still show rich cards from prior
cache; never-cached URLs fall back to favicon + title (graceful degradation).

OG **preview images** are loaded by the grid `<img>` directly from the site's
own image URL. Nothing is sent to any TabFlow-controlled server.

## UI Spec

### Header (sticky)

- Open-tab count, tone-escalating: **calm** (< 15), **amber** (15–40),
  **red** (40+). E.g. "82 tabs open · 3 windows · 4 groups".
- Smart chips: **"N stale · Close all"**, **"N duplicates · Merge"** (keep the
  most-recently-active, close the rest).
- View toggle: ⊞ Grid / ≋ Cover Flow.

### Card anatomy — image-led, beautiful & simple

The **OG preview image is the hero**: a tall (~16:9) banner that fills the top of
the card **edge-to-edge**, with no padding above it. Below it, a calm text block:
a favicon + domain line, a bold **title** (1–2 line clamp), and a quiet
**OG description** (2-line clamp). Generous spacing, minimal borders.

- **Close ×** floats as a soft translucent circle on the top-right of the image
  (visible on hover; always reachable by keyboard).
- **No OG image** → favicon centered on a soft gradient fills the same banner
  area (cards stay the same shape; the grid never looks ragged).
- **Stale badge** (`now - lastAccessed > 7 days`) shown in the text block.
- **Active tab** gets the violet active treatment consistent with current design
  tokens (`--violet`, active glow).
- Rounded corners (~14–16px), subtle 1px border, soft shadow — matching the
  existing card aesthetic.

### Sections

Chrome **tab groups** first (using existing `GROUP_COLORS`), then **per-window
"Other tabs"**. Each section header shows a count and a "close section" action.

### Layout — responsive flow

A true flow grid: cards keep a **fixed ideal width (~260px, the approved
single-card size)** and **never squish**. The number of cards per row grows and
shrinks with the viewport width — e.g. `grid-template-columns:
repeat(auto-fill, minmax(260px, 1fr))`. Wide window → 5–6 across; narrow it and
cards reflow down to 4, 3, 2 while holding their shape. Sections stack
vertically; the flow runs within each section.

### Interactions

- Click card → switch to that tab. Click × → close (with undo).
- **Multi-select** (click to toggle / shift-range) → bulk close selected.
- Smart chips → bulk close stale / merge duplicates.
- **Undo**: extend the existing ⌘Z toast to cover single and bulk closes.

### Keyboard

Arrows move focused cell, Enter switches, close-key removes focused, `/` focuses
search (filters all tabs by title/domain across sections), Esc closes the
TabFlow tab. Cover Flow keys unchanged when in Cover Flow.

## Permissions & Privacy

Adds to `manifest.json`:

- `scripting` — register the OG content script.
- `storage` — persist OG cache + view preference.
- `host_permissions: ["<all_urls>"]` — read OG meta on visited pages.

This **ends** the "no host permissions" stance. Reposition the privacy story
(README + PRIVACY.md): **"TabFlow reads page title/description/preview locally to
build your tab overview. Nothing ever leaves your machine — no servers, no
analytics, no sync."** Note the favicon service caveat already present
(`google.com/s2/favicons`).

## Error / Edge Handling

- **No OG data cached** → favicon + title card (no description/image).
- **OG image fails to load** → favicon-on-gradient fallback.
- **Discarded/sleeping tabs** → rendered from cache; never force-woken.
- **`chrome://` / extension pages** → not scriptable; show title + generic icon.
- **Cache growth** → evict entries not seen in 30 days; cap total entries.
- **Single tab / empty window** → section still renders with its count.
- **Group with one tab** → existing single-tab centering behavior preserved in
  Cover Flow; in Grid it is just a one-card section.

## Testing

- **`triage.js` unit tests**: `staleTabs` boundary (exactly 7 days),
  `duplicateGroups` (same URL across windows; keep-most-recent logic),
  `countTone` thresholds (14/15/40/41).
- **`og-cache.js` tests**: set/get round-trip, eviction past 30 days, cap.
- **Manual/integration**: open many tabs incl. groups + sleeping tabs; verify
  rich cards from cache, instant per-card close, undo, bulk close, view toggle
  persistence, keyboard nav, count tone escalation.

## Open Follow-ups (out of scope for v1)

- Save-as-stash / named collections.
- Persistent recently-closed panel.
- Sort options (by domain, age, group).
