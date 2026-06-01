# Overview Grid + Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page, responsive "Overview" grid that shows every open tab (across all windows) as a card you can close instantly, with a tone-escalating open-tab count and stale/duplicate triage — while preserving Cover Flow as a remembered toggle.

**Architecture:** TabFlow already renders as a full browser tab. We add a second view mode (`grid`) alongside the existing Cover Flow (`coverflow`). A pure logic module (`triage.js`) turns the tab list into ordered sections + cards and computes stale/duplicate/count info; a thin DOM module (`grid.js`) renders it. `newtab.js` gains a view-mode dispatcher that persists the choice in `localStorage`. **No new Chrome permissions** — uses existing `tabs`/`tabGroups`, `localStorage`, and `chrome.sessions` (already permitted) for undo.

**Tech Stack:** Vanilla JS/CSS/HTML (no build step), Chrome Extension MV3, Node's built-in `node:test` runner for unit tests (Node v22 present).

**Scope note:** OG preview images + descriptions and the privacy/permission changes are deliberately **out of scope** here and handled in a follow-up plan (`2026-06-01-og-enrichment.md`). In this plan, cards show favicon-on-gradient banners + title + domain. The card markup leaves explicit hooks (`.grid-card-image`, an optional `.grid-card-desc`) for the OG layer to fill later.

---

## File Structure

**New files:**
- `triage.js` — pure logic: `countTone`, `isStale`, `staleTabs`, `normalizeUrl`, `duplicateGroups`, `buildGridSections`. Browser global + CommonJS export shim. No DOM, no Chrome APIs.
- `grid.js` — DOM rendering: `renderGrid`, `buildSectionEl`, `buildGridCard`. Depends on global `favUrl`/`getDomain`/`makeFallback` from `newtab.js`. No business logic.
- `tests/triage.test.js` — `node:test` unit tests for `triage.js`.

**Modified files:**
- `models.js` — add `lastAccessed` passthrough to `chromeTabToTabItem`.
- `newtab.html` — include `triage.js` + `grid.js`; add view-toggle + overview-header + grid container markup.
- `newtab.css` — grid view styles: header tone, chips, section, responsive flow, card, selection, stale badge; mode show/hide.
- `newtab.js` — view-mode state + `localStorage` persistence; all-windows load for grid; render dispatcher; toggle handler; count header + chips; multi-select + bulk close + bulk undo; grid keyboard nav.

---

## Task 1: Triage pure logic + tests

**Files:**
- Create: `triage.js`
- Test: `tests/triage.test.js`

- [ ] **Step 1: Write the failing test for `countTone`**

Create `tests/triage.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const T = require('../triage.js');

test('countTone thresholds', () => {
  assert.strictEqual(T.countTone(0), 'calm');
  assert.strictEqual(T.countTone(14), 'calm');
  assert.strictEqual(T.countTone(15), 'warn');
  assert.strictEqual(T.countTone(40), 'warn');
  assert.strictEqual(T.countTone(41), 'alert');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `Cannot find module '../triage.js'`.

- [ ] **Step 3: Create `triage.js` with `countTone`**

Create `triage.js`:

```js
// ── triage.js — pure triage logic. No DOM, no Chrome APIs. ────────────────────
// Loaded as a browser global via <script> and required by Node tests.

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Header tone by open-tab count: calm (<15), warn (15–40), alert (>40).
function countTone(n) {
  if (n > 40) return 'alert';
  if (n >= 15) return 'warn';
  return 'calm';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countTone, STALE_MS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Write failing tests for `isStale` and `staleTabs`**

Append to `tests/triage.test.js`:

```js
test('isStale is true only at/after 7 days', () => {
  const now = 7 * 24 * 60 * 60 * 1000 + 1000; // a bit past 7 days from epoch
  assert.strictEqual(T.isStale({ lastAccessed: now }, now), false);
  assert.strictEqual(T.isStale({ lastAccessed: now - T.STALE_MS + 1 }, now), false);
  assert.strictEqual(T.isStale({ lastAccessed: now - T.STALE_MS }, now), true);
  assert.strictEqual(T.isStale({ lastAccessed: now - T.STALE_MS - 1 }, now), true);
});

test('isStale is false when lastAccessed missing', () => {
  assert.strictEqual(T.isStale({}, Date.now()), false);
  assert.strictEqual(T.isStale(null, Date.now()), false);
});

test('staleTabs filters stale only', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, lastAccessed: now },
    { id: 2, lastAccessed: now - T.STALE_MS - 1 },
    { id: 3, lastAccessed: now - T.STALE_MS - 99999 },
  ];
  assert.deepStrictEqual(T.staleTabs(tabs, now).map(t => t.id), [2, 3]);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `T.isStale is not a function`.

- [ ] **Step 7: Implement `isStale` and `staleTabs`**

In `triage.js`, add above the export shim:

```js
// A tab is stale if it hasn't been accessed in STALE_MS or longer.
function isStale(tab, now) {
  if (!tab || typeof tab.lastAccessed !== 'number') return false;
  return (now - tab.lastAccessed) >= STALE_MS;
}

// Subset of tabs that are stale.
function staleTabs(tabs, now) {
  return tabs.filter(t => isStale(t, now));
}
```

Update the export shim line to:

```js
  module.exports = { countTone, STALE_MS, isStale, staleTabs };
```

- [ ] **Step 8: Run to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (4 tests).

- [ ] **Step 9: Write failing tests for `normalizeUrl` and `duplicateGroups`**

Append to `tests/triage.test.js`:

```js
test('normalizeUrl strips hash and trailing slash', () => {
  assert.strictEqual(T.normalizeUrl('https://a.com/x/'), 'https://a.com/x');
  assert.strictEqual(T.normalizeUrl('https://a.com/x#frag'), 'https://a.com/x');
  assert.strictEqual(T.normalizeUrl('https://a.com/x?q=1'), 'https://a.com/x?q=1');
  assert.strictEqual(T.normalizeUrl(''), '');
});

test('duplicateGroups returns only 2+ groups, keeper first', () => {
  const tabs = [
    { id: 1, url: 'https://a.com/p', lastAccessed: 10 },
    { id: 2, url: 'https://a.com/p#x', lastAccessed: 50 }, // dup of 1, newer
    { id: 3, url: 'https://b.com/', lastAccessed: 5 },     // unique
  ];
  const groups = T.duplicateGroups(tabs);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].tabs.length, 2);
  assert.strictEqual(groups[0].tabs[0].id, 2); // most-recent is keeper (first)
  assert.strictEqual(groups[0].tabs[1].id, 1);
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `T.normalizeUrl is not a function`.

- [ ] **Step 11: Implement `normalizeUrl` and `duplicateGroups`**

In `triage.js`, add above the export shim:

```js
// Strip hash and trailing slash so trivially-different URLs compare equal.
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.origin + u.pathname + u.search).replace(/\/$/, '');
  } catch {
    return url;
  }
}

// Group tabs by normalized URL. Returns only groups of 2+, each as
// { url, tabs } with tabs sorted most-recently-accessed first (the keeper).
function duplicateGroups(tabs) {
  const byUrl = new Map();
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(t);
  }
  const groups = [];
  for (const [url, group] of byUrl) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)
    );
    groups.push({ url, tabs: sorted });
  }
  return groups;
}
```

Update the export shim line to:

```js
  module.exports = { countTone, STALE_MS, isStale, staleTabs, normalizeUrl, duplicateGroups };
```

- [ ] **Step 12: Run to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (6 tests).

- [ ] **Step 13: Write failing test for `buildGridSections`**

Append to `tests/triage.test.js`:

```js
test('buildGridSections: group sections first, then per-window Other tabs', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: 5,  title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 10, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now - T.STALE_MS - 1 },
    { id: 3, windowId: 11, groupId: -1, title: 'C', domain: 'c.com', url: 'https://c.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const groups = [{ id: 5, title: 'Work', color: 'blue', windowId: 10 }];
  const sections = T.buildGridSections(tabs, groups, now);

  assert.strictEqual(sections.length, 3);
  assert.strictEqual(sections[0].kind, 'group');
  assert.strictEqual(sections[0].label, 'Work');
  assert.strictEqual(sections[0].color, 'blue');
  assert.strictEqual(sections[0].count, 1);
  assert.strictEqual(sections[1].kind, 'window');
  assert.strictEqual(sections[2].kind, 'window');
  // stale flag flows onto the card
  const cardB = sections[1].cards[0];
  assert.strictEqual(cardB.id, 2);
  assert.strictEqual(cardB.stale, true);
});
```

- [ ] **Step 14: Run to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `T.buildGridSections is not a function`.

- [ ] **Step 15: Implement `buildGridSections`**

In `triage.js`, add above the export shim:

```js
// Build a card view-model from a tab item. OG fields (image/description) are
// left undefined here and populated later by the OG-enrichment layer.
function toCard(t, now) {
  return {
    id:         t.id,
    windowId:   t.windowId,
    title:      t.title,
    domain:     t.domain,
    url:        t.url,
    favIconUrl: t.favIconUrl,
    audible:    t.audible,
    stale:      isStale(t, now),
    image:      undefined,
    description:undefined,
  };
}

// Turn the flat tab list + Chrome groups into ordered sections:
// every Chrome tab group first (in first-seen order), then one
// "Other tabs" section per window for ungrouped tabs (in first-seen order).
function buildGridSections(tabs, groups, now) {
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const groupSections = new Map();  // groupId  -> section
  const windowSections = new Map(); // windowId -> section

  for (const t of tabs) {
    const card = toCard(t, now);
    const grouped = t.groupId != null && t.groupId !== -1 && groupMap.has(t.groupId);

    if (grouped) {
      if (!groupSections.has(t.groupId)) {
        const g = groupMap.get(t.groupId);
        groupSections.set(t.groupId, {
          id: `group-${g.id}`, kind: 'group',
          label: g.title || 'Tab Group', color: g.color, cards: [],
        });
      }
      groupSections.get(t.groupId).cards.push(card);
    } else {
      if (!windowSections.has(t.windowId)) {
        windowSections.set(t.windowId, {
          id: `window-${t.windowId}`, kind: 'window',
          label: 'Other tabs', color: null, cards: [],
        });
      }
      windowSections.get(t.windowId).cards.push(card);
    }
  }

  const sections = [...groupSections.values(), ...windowSections.values()];
  return sections.map(s => ({ ...s, count: s.cards.length }));
}
```

Update the export shim line to:

```js
  module.exports = {
    countTone, STALE_MS, isStale, staleTabs, normalizeUrl, duplicateGroups,
    buildGridSections, toCard,
  };
```

- [ ] **Step 16: Run to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (7 tests).

- [ ] **Step 17: Commit**

```bash
git add triage.js tests/triage.test.js
git commit -m "feat: add pure triage logic (count tone, stale, duplicates, sections)"
```

---

## Task 2: Add `lastAccessed` to the tab model

**Files:**
- Modify: `models.js:8-20`

- [ ] **Step 1: Add the field to `chromeTabToTabItem`**

In `models.js`, change the returned object in `chromeTabToTabItem` to include `lastAccessed`:

```js
function chromeTabToTabItem(chromeTab) {
  return {
    type:         'tab',
    id:           chromeTab.id,
    windowId:     chromeTab.windowId,
    title:        chromeTab.title || 'New Tab',
    domain:       getDomain(chromeTab.url),
    url:          chromeTab.url || '',
    favIconUrl:   chromeTab.favIconUrl || '',
    groupId:      chromeTab.groupId,
    audible:      chromeTab.audible || false,
    lastAccessed: chromeTab.lastAccessed || 0,
  };
}
```

- [ ] **Step 2: Verify nothing breaks the model load**

Run: `node -e "global.chrome={runtime:{getURL:()=>'newtab.html'}}; require('./models.js'); console.log('ok')"`
Expected: prints `ok` (file parses; `lastAccessed` is a plain passthrough).

- [ ] **Step 3: Commit**

```bash
git add models.js
git commit -m "feat: carry lastAccessed through the tab model"
```

---

## Task 3: View-mode scaffolding (toggle + persistence + dispatcher)

**Files:**
- Modify: `newtab.html:16-58`
- Modify: `newtab.css` (append)
- Modify: `newtab.js` (top of state block ~line 9; init ~743-781)

- [ ] **Step 1: Add markup for the toggle, overview header, and grid container**

In `newtab.html`, replace the `.header` block (lines 18-20) with:

```html
  <div class="header">
    <div class="logo">Tab<span class="v">Flow</span></div>
    <div class="view-toggle" id="viewToggle">
      <button class="vt-btn" id="vtGrid" data-mode="grid" title="Overview grid">⊞ Grid</button>
      <button class="vt-btn" id="vtFlow" data-mode="coverflow" title="Cover Flow">≋ Cover Flow</button>
    </div>
  </div>

  <div class="overview-header" id="overviewHeader">
    <div class="ov-count" id="ovCount">— tabs open</div>
    <div class="ov-chips" id="ovChips"></div>
  </div>
```

Then immediately after the closing `</div>` of `.stage-wrap` (line 48), add the grid container:

```html
  <div class="grid-scroll" id="gridScroll"></div>
```

- [ ] **Step 2: Include the new scripts**

In `newtab.html`, replace the script tags (lines 57-58) with:

```html
  <script src="models.js"></script>
  <script src="triage.js"></script>
  <script src="grid.js"></script>
  <script src="newtab.js"></script>
```

(`grid.js` is created in Task 4; an empty include is harmless until then. Create a placeholder now so the page loads.)

Create `grid.js` with a placeholder comment:

```js
// grid.js — DOM rendering for the Overview grid. Implemented in Task 4.
```

- [ ] **Step 3: Add base CSS for mode switching, toggle, and the two containers**

Append to `newtab.css`:

```css
/* ── VIEW MODE SWITCHING ── */
/* In grid mode the body scrolls and content is top-aligned; in coverflow it stays centered. */
html[data-view="grid"], html[data-view="grid"] body {
  height: auto;
  min-height: 100vh;
  width: 100vw;
  overflow-y: auto;
  display: block;
}

/* Coverflow-only elements hidden in grid mode */
html[data-view="grid"] .stage-wrap,
html[data-view="grid"] .detail,
html[data-view="grid"] .footer,
html[data-view="grid"] .search-wrap { display: none; }

/* Grid-only elements hidden in coverflow mode */
html[data-view="coverflow"] .overview-header,
html[data-view="coverflow"] .grid-scroll { display: none; }

/* ── VIEW TOGGLE ── */
.header { display: flex; align-items: center; gap: 18px; }
.view-toggle {
  display: flex; gap: 4px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 12px; padding: 3px;
}
.vt-btn {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  color: var(--text-dim); background: transparent; border: none;
  padding: 5px 11px; border-radius: 9px; cursor: pointer;
  transition: background .15s, color .15s;
}
.vt-btn.is-active { background: var(--violet-soft); color: var(--violet); }
.vt-btn:hover:not(.is-active) { color: var(--text); }

/* ── OVERVIEW HEADER (grid mode) ── */
.overview-header {
  width: 100%; max-width: 1400px; margin: 0 auto;
  padding: 8px 28px 14px; display: flex; align-items: center;
  justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.ov-count {
  font-family: 'Fraunces', serif; font-style: italic; font-size: 22px;
  color: var(--text);
}
.ov-count.tone-warn  { color: #fbbf24; }
.ov-count.tone-alert { color: #f87171; }
.ov-chips { display: flex; gap: 8px; flex-wrap: wrap; }

/* ── GRID SCROLL CONTAINER ── */
.grid-scroll {
  width: 100%; max-width: 1400px; margin: 0 auto;
  padding: 0 28px 60px;
}
```

- [ ] **Step 4: Add view-mode state + persistence helpers in `newtab.js`**

In `newtab.js`, just after the state block (after line 11, before `releaseGuards`), add:

```js
// ── View mode (grid | coverflow), persisted in localStorage ───────────────────
const VIEW_KEY = 'tabflow:view';
let currentView = (localStorage.getItem(VIEW_KEY) === 'coverflow') ? 'coverflow' : 'grid';

function setView(view) {
  currentView = (view === 'coverflow') ? 'coverflow' : 'grid';
  localStorage.setItem(VIEW_KEY, currentView);
  document.documentElement.setAttribute('data-view', currentView);
  document.querySelectorAll('.vt-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.mode === currentView));
  renderCurrentView();
}
```

- [ ] **Step 5: Add the render dispatcher and wire the toggle (in `newtab.js`)**

In `newtab.js`, add near `init` (above the `init` definition at line 743):

```js
// Dispatch rendering to the active view. Grid loads all windows; Cover Flow
// keeps its current-window behavior in buildCards()/updatePositions().
function renderCurrentView() {
  if (currentView === 'grid') {
    renderGridView();
  } else {
    buildCards();
  }
}

// Wire the toggle buttons once.
document.getElementById('viewToggle').addEventListener('click', e => {
  const btn = e.target.closest('.vt-btn');
  if (btn) setView(btn.dataset.mode);
});
```

- [ ] **Step 6: Set the initial view attribute at the end of `init()`**

In `newtab.js`, replace the final `buildCards();` of `init()` (line 780) with:

```js
  document.documentElement.setAttribute('data-view', currentView);
  document.querySelectorAll('.vt-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.mode === currentView));
  renderCurrentView();
```

- [ ] **Step 7: Add a temporary `renderGridView` stub so the page runs**

In `newtab.js`, add above `renderCurrentView`:

```js
// Replaced with the real implementation in Task 4.
function renderGridView() {
  document.getElementById('gridScroll').textContent = 'Grid coming up…';
}
```

- [ ] **Step 8: Manual verification**

Load the unpacked extension at `chrome://extensions` (Reload), open TabFlow.
Expected: Grid mode is active by default (toggle shows "⊞ Grid" highlighted), the stage/footer/search are hidden, and "Grid coming up…" shows. Click "≋ Cover Flow" → the original carousel appears and works. Reload the TabFlow tab → it reopens in Cover Flow (preference persisted). Switch back to Grid.

- [ ] **Step 9: Commit**

```bash
git add newtab.html newtab.css newtab.js grid.js
git commit -m "feat: add view-mode toggle, persistence, and render dispatcher"
```

---

## Task 4: Grid rendering (sections + cards)

**Files:**
- Modify: `grid.js` (replace placeholder)
- Modify: `newtab.js` (`renderGridView`, all-windows load)
- Modify: `newtab.css` (append card/section styles)

- [ ] **Step 1: Implement `grid.js`**

Replace the contents of `grid.js` with:

```js
// ── grid.js — DOM rendering for the Overview grid ─────────────────────────────
// Pure rendering. Business logic lives in triage.js; data is passed in.
// Relies on globals from newtab.js: favUrl(), getDomain(), makeFallback().

// Group color → hex, mirrors GROUP_COLORS in newtab.js for the section dot.
const GRID_GROUP_COLORS = {
  grey: '#9ca3af', gray: '#9ca3af', blue: '#60a5fa', red: '#f87171',
  yellow: '#fbbf24', green: '#34d399', pink: '#f472b6',
  purple: '#c084fc', cyan: '#22d3ee',
};

// Build the image banner: OG image if present (Task handled in OG plan),
// else favicon centered on a soft gradient.
function buildCardBanner(card) {
  const banner = document.createElement('div');
  banner.className = 'grid-card-image';

  if (card.image) {
    const img = document.createElement('img');
    img.className = 'gci-og';
    img.src = card.image;
    img.loading = 'lazy';
    img.onerror = () => { banner.classList.add('is-fallback'); img.remove(); fillFavicon(banner, card); };
    banner.appendChild(img);
  } else {
    banner.classList.add('is-fallback');
    fillFavicon(banner, card);
  }
  return banner;
}

function fillFavicon(banner, card) {
  const url = favUrl({ favIconUrl: card.favIconUrl, url: card.url });
  if (url) {
    const fav = document.createElement('img');
    fav.className = 'gci-fav';
    fav.src = url;
    fav.onerror = () => { fav.replaceWith(makeFallback(card.domain)); };
    banner.appendChild(fav);
  } else {
    banner.appendChild(makeFallback(card.domain));
  }
}

// One tab card.
function buildGridCard(card, ctx) {
  const el = document.createElement('article');
  el.className = 'grid-card';
  el.dataset.tabId = card.id;
  if (card.stale) el.classList.add('is-stale');
  if (ctx.isSelected(card.id)) el.classList.add('is-selected');

  el.appendChild(buildCardBanner(card));

  const close = document.createElement('button');
  close.className = 'gc-close';
  close.textContent = '×';
  close.title = 'Close tab';
  close.addEventListener('click', ev => { ev.stopPropagation(); ctx.onClose(card.id); });
  el.appendChild(close);

  const body = document.createElement('div');
  body.className = 'gc-body';

  const meta = document.createElement('div');
  meta.className = 'gc-meta';
  meta.textContent = card.domain;
  body.appendChild(meta);

  const title = document.createElement('div');
  title.className = 'gc-title';
  title.textContent = card.title;
  body.appendChild(title);

  if (card.description) {
    const desc = document.createElement('div');
    desc.className = 'gc-desc';
    desc.textContent = card.description;
    body.appendChild(desc);
  }

  if (card.stale) {
    const badge = document.createElement('div');
    badge.className = 'gc-stale';
    badge.textContent = '⏳ stale';
    body.appendChild(badge);
  }

  el.appendChild(body);

  el.addEventListener('click', ev => {
    if (ev.metaKey || ev.ctrlKey) { ctx.onToggleSelect(card.id); return; }
    ctx.onOpen(card.id);
  });

  return el;
}

// One section: header (dot + label + count + close-section) and a flow of cards.
function buildSectionEl(section, ctx) {
  const el = document.createElement('section');
  el.className = 'grid-section';

  const header = document.createElement('div');
  header.className = 'gs-header';

  if (section.kind === 'group' && section.color) {
    const dot = document.createElement('span');
    dot.className = 'gs-dot';
    dot.style.background = GRID_GROUP_COLORS[section.color] || '#9ca3af';
    header.appendChild(dot);
  }

  const label = document.createElement('span');
  label.className = 'gs-label';
  label.textContent = section.label;
  header.appendChild(label);

  const count = document.createElement('span');
  count.className = 'gs-count';
  count.textContent = section.count;
  header.appendChild(count);

  const closeAll = document.createElement('button');
  closeAll.className = 'gs-closeall';
  closeAll.textContent = 'Close all';
  closeAll.addEventListener('click', () =>
    ctx.onCloseMany(section.cards.map(c => c.id)));
  header.appendChild(closeAll);

  el.appendChild(header);

  const flow = document.createElement('div');
  flow.className = 'grid-flow';
  for (const card of section.cards) flow.appendChild(buildGridCard(card, ctx));
  el.appendChild(flow);

  return el;
}

// Render all sections into the container.
function renderGrid(container, sections, ctx) {
  container.innerHTML = '';
  for (const section of sections) container.appendChild(buildSectionEl(section, ctx));
}
```

- [ ] **Step 2: Implement `renderGridView` with all-windows load in `newtab.js`**

In `newtab.js`, replace the temporary `renderGridView` stub (from Task 3, Step 7) with:

```js
// Selection state for multi-select (Task 6 wires bulk actions to it).
let gridSelection = new Set();

// Loaded tab list backing the grid (all windows).
let gridTabs = [];

async function renderGridView() {
  const [chromeTabs, groups] = await Promise.all([
    new Promise(r => chrome.tabs.query({}, r)),
    new Promise(r => chrome.tabGroups.query({}, r)),
  ]);

  const selfUrl = chrome.runtime.getURL('newtab.html');
  gridTabs = chromeTabs
    .filter(t => t.url !== selfUrl)
    .map(chromeTabToTabItem);

  const now = Date.now();
  const sections = buildGridSections(gridTabs, groups, now);

  const ctx = {
    onOpen:        id => focusTab(id),
    onClose:       id => closeGridTab(id),
    onCloseMany:   ids => closeGridTabs(ids),
    onToggleSelect:id => toggleGridSelect(id),
    isSelected:    id => gridSelection.has(id),
  };

  renderGrid(document.getElementById('gridScroll'), sections, ctx);
  updateOverviewHeader(gridTabs, now); // implemented in Task 5
}

// Activate a tab (and focus its window) from the grid.
function focusTab(tabId) {
  const tab = gridTabs.find(t => t.id === tabId);
  chrome.tabs.update(tabId, { active: true });
  if (tab) chrome.windows.update(tab.windowId, { focused: true });
}

// Single close from the grid (Task 6 adds undo).
function closeGridTab(tabId) {
  chrome.tabs.remove(tabId);
}

// Placeholders wired fully in Task 5/6.
function closeGridTabs(ids) { chrome.tabs.remove(ids); }
function toggleGridSelect(id) {
  if (gridSelection.has(id)) gridSelection.delete(id); else gridSelection.add(id);
  renderCurrentView();
}
function updateOverviewHeader() { /* implemented in Task 5 */ }
```

- [ ] **Step 3: Add card + section CSS**

Append to `newtab.css`:

```css
/* ── GRID SECTION ── */
.grid-section { margin-top: 22px; }
.gs-header {
  display: flex; align-items: center; gap: 9px; margin-bottom: 12px;
  font-size: 11px; text-transform: uppercase; letter-spacing: .1em;
  color: var(--text-dim);
}
.gs-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.gs-label { font-weight: 600; color: rgba(255,255,255,.6); }
.gs-count {
  background: rgba(255,255,255,.06); border-radius: 9px;
  padding: 1px 8px; font-size: 10px; color: var(--text-dim);
}
.gs-closeall {
  margin-left: auto; font-family: 'Syne', sans-serif; font-size: 10px;
  text-transform: none; letter-spacing: 0; color: var(--text-dim);
  background: transparent; border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px; padding: 3px 9px; cursor: pointer; transition: .15s;
}
.gs-closeall:hover { color: #fca5a5; border-color: rgba(239,68,68,.4); }

/* ── GRID CARD ── */
.grid-card {
  position: relative; border-radius: 14px; overflow: hidden;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  cursor: pointer; transition: border-color .18s, box-shadow .18s, transform .18s;
}
.grid-card:hover {
  border-color: rgba(139,92,246,.4);
  box-shadow: 0 0 22px rgba(139,92,246,.16), 0 10px 28px rgba(0,0,0,.4);
  transform: translateY(-2px);
}
.grid-card.is-selected {
  border-color: var(--violet);
  box-shadow: 0 0 0 2px var(--violet-soft), 0 0 22px rgba(139,92,246,.25);
}
.grid-card.is-stale { opacity: .82; }

.grid-card-image {
  height: 132px; width: 100%; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.grid-card-image.is-fallback { background: rgba(139,92,246,.07); }
.gci-og { width: 100%; height: 100%; object-fit: cover; display: block; }
.gci-fav { width: 56px; height: 56px; object-fit: contain; border-radius: 12px; }

.gc-close {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px;
  border-radius: 50%; border: none; cursor: pointer;
  background: rgba(0,0,0,.45); backdrop-filter: blur(4px);
  color: #fff; font-size: 15px; line-height: 1;
  opacity: 0; transition: opacity .15s, background .15s;
}
.grid-card:hover .gc-close { opacity: 1; }
.gc-close:hover { background: rgba(239,68,68,.7); }

.gc-body { padding: 11px 13px 13px; }
.gc-meta {
  font-size: 10px; color: var(--text-dim); margin-bottom: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gc-title {
  font-size: 13px; font-weight: 600; color: #fff; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.gc-desc {
  font-size: 11px; color: rgba(255,255,255,.45); line-height: 1.5; margin-top: 5px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.gc-stale { font-size: 10px; color: #fca5a5; margin-top: 7px; }
```

- [ ] **Step 4: Manual verification**

Reload the extension, open TabFlow in Grid mode.
Expected: every open tab (across all windows) appears as a card with a favicon-on-gradient banner, domain, and title; cards are grouped into sections (Chrome groups first with a colored dot, then "Other tabs"). Hover shows the close ×; clicking × closes that tab; clicking a card switches to it (and focuses its window). ⌘/Ctrl-click toggles a selected outline. Cover Flow still works via the toggle.

- [ ] **Step 5: Commit**

```bash
git add grid.js newtab.js newtab.css
git commit -m "feat: render Overview grid of all tabs as sections + cards"
```

---

## Task 5: Responsive flow layout + count header with tone + triage chips

**Files:**
- Modify: `newtab.css` (append flow rules)
- Modify: `newtab.js` (`updateOverviewHeader`)

- [ ] **Step 1: Add the responsive flow CSS**

Append to `newtab.css`:

```css
/* ── RESPONSIVE FLOW ── cards hold ~260px and never squish; columns reflow. */
.grid-flow {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
```

- [ ] **Step 2: Manual verification of reflow**

Reload, open Grid mode, drag the window narrower and wider.
Expected: cards keep ~260px width and the number per row increases on a wide window and decreases (down to 1) as it narrows — no squishing.

- [ ] **Step 3: Implement `updateOverviewHeader` with tone + chips**

In `newtab.js`, replace the `updateOverviewHeader` placeholder (from Task 4, Step 2) with:

```js
// Render the count line (tone-escalating) and triage chips.
function updateOverviewHeader(tabs, now) {
  const countEl = document.getElementById('ovCount');
  const chipsEl = document.getElementById('ovChips');
  const n = tabs.length;

  countEl.textContent = `${n} ${n === 1 ? 'tab' : 'tabs'} open`;
  countEl.classList.remove('tone-warn', 'tone-alert');
  const tone = countTone(n);
  if (tone === 'warn')  countEl.classList.add('tone-warn');
  if (tone === 'alert') countEl.classList.add('tone-alert');

  chipsEl.innerHTML = '';

  const stale = staleTabs(tabs, now);
  if (stale.length) {
    chipsEl.appendChild(makeChip(
      `${stale.length} stale · Close all`, 'chip-danger',
      () => closeGridTabs(stale.map(t => t.id))));
  }

  const dups = duplicateGroups(tabs);
  if (dups.length) {
    // Merge = close every duplicate except the keeper (first) in each group.
    const toClose = dups.flatMap(g => g.tabs.slice(1).map(t => t.id));
    chipsEl.appendChild(makeChip(
      `${dups.length} duplicates · Merge`, 'chip-warn',
      () => closeGridTabs(toClose)));
  }
}

function makeChip(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = `ov-chip ${cls}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
```

- [ ] **Step 4: Add chip CSS**

Append to `newtab.css`:

```css
/* ── TRIAGE CHIPS ── */
.ov-chip {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  border-radius: 14px; padding: 6px 12px; cursor: pointer;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.7); transition: .15s;
}
.ov-chip.chip-danger { background: rgba(239,68,68,.14); border-color: rgba(239,68,68,.4); color: #fca5a5; }
.ov-chip.chip-warn   { background: rgba(245,158,11,.14); border-color: rgba(245,158,11,.4); color: #fbbf24; }
.ov-chip:hover { filter: brightness(1.15); }
```

- [ ] **Step 5: Manual verification**

Reload, open Grid mode.
Expected: header shows "N tabs open" — neutral under 15, amber 15–40, red above 40. If any tab is untouched 7+ days, a red "N stale · Close all" chip appears and closes them on click. If the same URL is open more than once, a "N duplicates · Merge" chip appears and closes the extra copies, keeping the most recently used.

- [ ] **Step 6: Commit**

```bash
git add newtab.css newtab.js
git commit -m "feat: responsive flow grid + tone-escalating count + triage chips"
```

---

## Task 6: Multi-select, bulk close, and bulk undo

**Files:**
- Modify: `newtab.js` (`closeGridTab`, `closeGridTabs`, undo)
- Modify: `newtab.html` (selection action bar)
- Modify: `newtab.css` (selection bar)

- [ ] **Step 1: Add a selection action bar to the markup**

In `newtab.html`, immediately after the `overview-header` block (added in Task 3), add:

```html
  <div class="select-bar" id="selectBar">
    <span id="selectCount">0 selected</span>
    <button class="sb-close" id="selClose">Close selected</button>
    <button class="sb-clear" id="selClear">Clear</button>
  </div>
```

- [ ] **Step 2: Implement bulk close with undo in `newtab.js`**

In `newtab.js`, replace the `closeGridTab`, `closeGridTabs`, and `toggleGridSelect` placeholders (from Task 4, Step 2) with:

```js
// Remember how many tabs the last grid close removed, so undo can restore them.
let lastGridClosedCount = 0;

function closeGridTab(tabId) {
  lastGridClosedCount = 1;
  chrome.tabs.remove(tabId, () => {
    gridSelection.delete(tabId);
    showUndoToast('Closed 1 tab');
  });
}

function closeGridTabs(ids) {
  if (!ids.length) return;
  lastGridClosedCount = ids.length;
  chrome.tabs.remove(ids, () => {
    ids.forEach(id => gridSelection.delete(id));
    showUndoToast(`Closed ${ids.length} tabs`);
  });
}

function toggleGridSelect(id) {
  if (gridSelection.has(id)) gridSelection.delete(id); else gridSelection.add(id);
  updateSelectBar();
  // Re-render to reflect selected outlines.
  renderCurrentView();
}

function updateSelectBar() {
  const bar = document.getElementById('selectBar');
  const n = gridSelection.size;
  bar.classList.toggle('show', n > 0);
  document.getElementById('selectCount').textContent = `${n} selected`;
}
```

- [ ] **Step 3: Wire the selection bar buttons (once, near the toggle wiring in `newtab.js`)**

In `newtab.js`, just after the `viewToggle` listener added in Task 3 Step 5, add:

```js
document.getElementById('selClose').addEventListener('click', () => {
  closeGridTabs([...gridSelection]);
});
document.getElementById('selClear').addEventListener('click', () => {
  gridSelection.clear();
  updateSelectBar();
  renderCurrentView();
});
```

- [ ] **Step 4: Extend `undoClose` to restore multiple tabs**

In `newtab.js`, replace the body of `undoClose` (lines 497-508) with a version that restores `lastGridClosedCount` sessions when in grid mode:

```js
async function undoClose() {
  const times = (currentView === 'grid') ? Math.max(1, lastGridClosedCount) : 1;
  lastGridClosedCount = 0;
  for (let i = 0; i < times; i++) {
    // restore() with no sessionId restores the most recently closed session.
    await new Promise(res => chrome.sessions.restore(undefined, () => res()));
  }
  hideUndoToast();
  if (currentView === 'grid') renderCurrentView();
}
```

(If the original `undoClose` references a captured `sessionId`, drop that logic for the grid path; the no-arg `restore` is correct for bulk. Verify Cover Flow undo still works after this change in Step 6.)

- [ ] **Step 5: Add selection-bar CSS**

Append to `newtab.css`:

```css
/* ── SELECTION BAR ── */
.select-bar {
  display: none; align-items: center; gap: 12px;
  width: 100%; max-width: 1400px; margin: 0 auto; padding: 0 28px 6px;
  font-size: 12px; color: rgba(255,255,255,.7);
}
.select-bar.show { display: flex; }
.sb-close, .sb-clear {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  border-radius: 8px; padding: 5px 11px; cursor: pointer;
}
.sb-close { background: rgba(239,68,68,.16); border: 1px solid rgba(239,68,68,.4); color: #fca5a5; }
.sb-clear { background: transparent; border: 1px solid rgba(255,255,255,.12); color: var(--text-dim); }
html[data-view="coverflow"] .select-bar { display: none !important; }
```

- [ ] **Step 6: Manual verification**

Reload, open Grid mode.
Expected: ⌘/Ctrl-click selects multiple cards (outlined); the selection bar shows "N selected" with "Close selected" and "Clear". "Close selected" closes them and shows "Closed N tabs" with Undo; ⌘Z (or the toast Undo) restores them. The section "Close all", "N stale · Close all", and "N duplicates · Merge" all show the undo toast and are undoable. Switch to Cover Flow and confirm its single-tab close + ⌘Z undo still works.

- [ ] **Step 7: Commit**

```bash
git add newtab.html newtab.js newtab.css
git commit -m "feat: multi-select, bulk close, and bulk-aware undo in grid"
```

---

## Task 7: Keyboard navigation in the grid

**Files:**
- Modify: `newtab.js` (keydown handler ~514-548)

- [ ] **Step 1: Add a grid keyboard branch**

In `newtab.js`, at the very top of the `keydown` listener body (right after `const inSearch = ...` on line 515), add an early grid handler:

```js
  // ── Grid-mode keyboard ──
  if (currentView === 'grid') {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undoClose(); return; }
    const cards = [...document.querySelectorAll('.grid-card')];
    if (!cards.length) return;
    let idx = cards.findIndex(c => c.classList.contains('kb-focus'));
    const cols = gridColumnCount();

    switch (e.key) {
      case 'ArrowRight': idx = Math.min(cards.length - 1, (idx < 0 ? 0 : idx + 1)); break;
      case 'ArrowLeft':  idx = Math.max(0, (idx < 0 ? 0 : idx - 1)); break;
      case 'ArrowDown':  idx = Math.min(cards.length - 1, (idx < 0 ? 0 : idx + cols)); break;
      case 'ArrowUp':    idx = Math.max(0, (idx < 0 ? 0 : idx - cols)); break;
      case 'Enter': if (idx >= 0) cards[idx].click(); return;
      case 'Backspace':
      case 'Delete':
        if (idx >= 0) {
          e.preventDefault();
          const id = Number(cards[idx].dataset.tabId);
          closeGridTab(id);
        }
        return;
      default: return; // let other keys (typing) pass through
    }
    e.preventDefault();
    cards.forEach(c => c.classList.remove('kb-focus'));
    cards[idx].classList.add('kb-focus');
    cards[idx].scrollIntoView({ block: 'nearest' });
    return;
  }
```

- [ ] **Step 2: Add the column-count helper near `renderGridView` in `newtab.js`**

```js
// Number of columns currently rendered in a flow (for up/down navigation).
function gridColumnCount() {
  const flow = document.querySelector('.grid-flow');
  if (!flow) return 1;
  const styles = getComputedStyle(flow);
  return styles.gridTemplateColumns.split(' ').length;
}
```

- [ ] **Step 3: Add focus-ring CSS**

Append to `newtab.css`:

```css
.grid-card.kb-focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 2px var(--violet-mid), 0 0 24px rgba(139,92,246,.3);
}
```

- [ ] **Step 4: Manual verification**

Reload, open Grid mode. Press arrow keys.
Expected: a violet focus ring moves between cards (left/right within a row, up/down by a full row). Enter switches to the focused tab; Backspace/Delete closes it (undoable). Typing `/`-style characters does not get trapped. Cover Flow keyboard behavior is unchanged when in Cover Flow.

- [ ] **Step 5: Commit**

```bash
git add newtab.js newtab.css
git commit -m "feat: keyboard navigation for the Overview grid"
```

---

## Self-Review Notes

- **Spec coverage:** Grid view (T3–T5), every-tab cards across windows (T4), instant per-card close (T4), responsive flow (T5), tone-escalating count (T5), stale 7-day detection + chip (T1/T5), duplicate merge (T1/T5), multi-select + bulk close (T6), undo safety net incl. bulk (T6), keyboard-first (T7), Cover Flow preserved + remembered toggle (T3). **Out of scope by design (Plan 2):** OG image/description, manifest permission + content-script + background cache, README/PRIVACY rewrite — card markup leaves `.grid-card-image`/`.gc-desc` hooks ready.
- **Type consistency:** card shape `{id, windowId, title, domain, url, favIconUrl, audible, stale, image, description}` produced by `toCard` (T1) and consumed by `buildGridCard` (T4). `buildGridSections` returns `{id, kind, label, color, cards, count}` consumed by `buildSectionEl` (T4). `ctx` handlers (`onOpen/onClose/onCloseMany/onToggleSelect/isSelected`) defined in `renderGridView` (T4) and used in `grid.js` (T4) — names match.
- **No new permissions:** all-windows query uses existing `tabs`/`tabGroups`; view preference uses `localStorage`; undo uses already-granted `chrome.sessions`.
```
