# Grid v2 — Triage Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Overview grid more useful for keeping tab count down: a live toolbar count badge, group-by (window/domain) + sort controls, relative-age + in-place stale flagging, and promote-selection-to-a-Chrome-group.

**Architecture:** Additive to the existing vanilla-JS extension. New pure helpers in `triage.js` (unit-tested); display tweaks in `grid.js`; controls/persistence/promote in `newtab.js`; an independent badge in `background.js` reusing `triage.js`'s `countTone` via `importScripts`. No new permissions, no new files, no build step.

**Tech Stack:** Vanilla JS/CSS/HTML, Chrome MV3, Node `node:test` (Node v22 present).

**Builds on:** Grid v1 (`feat/overview-grid`). Run tests with `node --test tests/*.test.js`.

---

## File Structure

**Modified files (no new files):**
- `triage.js` — add `relativeAge`, `sortCards`; extend `toCard` (age) and `buildGridSections` (opts).
- `tests/triage.test.js` — tests for the above.
- `grid.js` — meta line shows `domain · age`; drop the separate stale badge.
- `newtab.js` — group/sort controls + persistence; pass opts to `buildGridSections`; `groupSelected()`.
- `newtab.html` — control widgets in overview header; "Group these" in selection bar.
- `newtab.css` — styles for controls, age, group button.
- `background.js` — toolbar count badge.

---

## Task 1: Toolbar count badge (independent)

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Implement the badge in `background.js`**

Append to `background.js`:

```js
// ── Toolbar tab-count badge ───────────────────────────────────────────────────
// Reuse countTone() from triage.js (defines globals in the worker scope).
importScripts('triage.js');

const TONE_COLORS = { calm: '#3f3f46', warn: '#f59e0b', alert: '#ef4444' };

async function updateBadge() {
  const selfUrl = chrome.runtime.getURL(NEWTAB_URL);
  const tabs = await chrome.tabs.query({});
  const n = tabs.filter(t => t.url !== selfUrl).length;

  await chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: TONE_COLORS[countTone(n)] });
}

chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onAttached.addListener(updateBadge);
chrome.tabs.onDetached.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if ('url' in changeInfo) updateBadge();
});

// Initial paint when the service worker first loads.
updateBadge();
```

(`NEWTAB_URL` is already defined at the top of `background.js`.)

- [ ] **Step 2: Syntax check**

Run: `node --check background.js`
Expected: no output (exit 0).

- [ ] **Step 3: Manual verification**

Reload the extension. The toolbar icon shows a number badge equal to your open tab count (excluding TabFlow tabs). Open/close tabs → it updates. Color is grey under 15 tabs, amber 15–40, red above 40.

- [ ] **Step 4: Commit**

```bash
git add background.js
git commit -m "feat: live tab-count badge on the toolbar icon"
```

---

## Task 2: `relativeAge` + `sortCards` pure helpers

**Files:**
- Modify: `triage.js`
- Test: `tests/triage.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/triage.test.js`:

```js
test('relativeAge formats buckets', () => {
  const now = 1_000_000_000_000;
  const ago = ms => now - ms;
  assert.strictEqual(T.relativeAge(0, now), '');
  assert.strictEqual(T.relativeAge(undefined, now), '');
  assert.strictEqual(T.relativeAge(ago(59_000), now), 'now');
  assert.strictEqual(T.relativeAge(ago(60_000), now), '1m');
  assert.strictEqual(T.relativeAge(ago(60 * 60_000), now), '1h');
  assert.strictEqual(T.relativeAge(ago(24 * 60 * 60_000), now), '1d');
  assert.strictEqual(T.relativeAge(ago(7 * 24 * 60 * 60_000), now), '1w');
  assert.strictEqual(T.relativeAge(ago(30 * 24 * 60 * 60_000), now), '1mo');
});

test('sortCards orders and does not mutate', () => {
  const cards = [
    { id: 1, title: 'Banana', lastAccessed: 30 },
    { id: 2, title: 'apple',  lastAccessed: 10 },
    { id: 3, title: 'Cherry', lastAccessed: 20 },
  ];
  assert.deepStrictEqual(T.sortCards(cards, 'recent').map(c => c.id), [1, 3, 2]);
  assert.deepStrictEqual(T.sortCards(cards, 'oldest').map(c => c.id), [2, 3, 1]);
  assert.deepStrictEqual(T.sortCards(cards, 'name').map(c => c.id), [2, 1, 3]);
  // original untouched
  assert.deepStrictEqual(cards.map(c => c.id), [1, 2, 3]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `T.relativeAge is not a function`.

- [ ] **Step 3: Implement both helpers**

In `triage.js`, add above the export shim:

```js
// Short relative-age label from a lastAccessed timestamp (ms). '' when unknown.
function relativeAge(lastAccessed, now) {
  if (!lastAccessed) return '';
  const s = Math.max(0, Math.floor((now - lastAccessed) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd';
  if (d < 30) return Math.floor(d / 7) + 'w';
  return Math.floor(d / 30) + 'mo';
}

// Return a sorted copy of cards. modes: 'recent' (default), 'oldest', 'name'.
function sortCards(cards, mode) {
  const copy = [...cards];
  if (mode === 'oldest') {
    copy.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
  } else if (mode === 'name') {
    copy.sort((a, b) =>
      (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase()));
  } else {
    copy.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  }
  return copy;
}
```

Update the export shim to include them:

```js
  module.exports = {
    countTone, STALE_MS, isStale, staleTabs, normalizeUrl, duplicateGroups,
    buildGridSections, toCard, relativeAge, sortCards,
  };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add triage.js tests/triage.test.js
git commit -m "feat: add relativeAge and sortCards triage helpers"
```

---

## Task 3: Extend `toCard` (age) and `buildGridSections` (opts)

**Files:**
- Modify: `triage.js`
- Test: `tests/triage.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/triage.test.js`:

```js
test('toCard carries lastAccessed and ageLabel', () => {
  const now = 1_000_000_000_000;
  const card = T.toCard(
    { id: 1, windowId: 1, title: 'X', domain: 'x.com', url: 'https://x.com',
      favIconUrl: '', audible: false, groupId: -1,
      lastAccessed: now - 2 * 60 * 60_000 }, now);
  assert.strictEqual(card.lastAccessed, now - 2 * 60 * 60_000);
  assert.strictEqual(card.ageLabel, '2h');
});

test('buildGridSections ungroupedBy=domain keeps groups, clusters rest by domain', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: 5,  title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 10, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com/1', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 3, windowId: 11, groupId: -1, title: 'C', domain: 'b.com', url: 'https://b.com/2', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const groups = [{ id: 5, title: 'Work', color: 'blue', windowId: 10 }];
  const sections = T.buildGridSections(tabs, groups, now, { ungroupedBy: 'domain' });

  assert.strictEqual(sections[0].kind, 'group');         // chrome group preserved
  const domainSec = sections.find(s => s.kind === 'domain');
  assert.ok(domainSec);
  assert.strictEqual(domainSec.label, 'b.com');
  assert.strictEqual(domainSec.count, 2);                // both b.com tabs, across windows
});

test('buildGridSections sorts section cards by opts.sort', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'Z', domain: 'a.com', url: 'https://a.com/z', favIconUrl: '', audible: false, lastAccessed: 10 },
    { id: 2, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com/a', favIconUrl: '', audible: false, lastAccessed: 99 },
  ];
  const recent = T.buildGridSections(tabs, [], now, { sort: 'recent' });
  assert.deepStrictEqual(recent[0].cards.map(c => c.id), [2, 1]); // newest first
  const byName = T.buildGridSections(tabs, [], now, { sort: 'name' });
  assert.deepStrictEqual(byName[0].cards.map(c => c.id), [2, 1]); // 'A' before 'Z'
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `ageLabel` undefined and/or domain section missing.

- [ ] **Step 3: Extend `toCard`**

In `triage.js`, replace the `toCard` function with:

```js
function toCard(t, now) {
  return {
    id:           t.id,
    windowId:     t.windowId,
    title:        t.title,
    domain:       t.domain,
    url:          t.url,
    favIconUrl:   t.favIconUrl,
    audible:      t.audible,
    lastAccessed: t.lastAccessed,
    ageLabel:     relativeAge(t.lastAccessed, now),
    stale:        isStale(t, now),
    image:        undefined,
    description:  undefined,
  };
}
```

- [ ] **Step 4: Extend `buildGridSections` with `opts`**

In `triage.js`, replace the entire `buildGridSections` function with:

```js
// Turn the flat tab list + Chrome groups into ordered sections.
// opts: { ungroupedBy: 'window'|'domain', sort: 'recent'|'oldest'|'name' }.
// Chrome groups always become group sections first (in first-seen order).
// Ungrouped tabs go into per-window "Other tabs" sections, or per-domain
// sections when ungroupedBy==='domain'. Each section's cards are sorted.
function buildGridSections(tabs, groups, now, opts = {}) {
  const ungroupedBy = opts.ungroupedBy || 'window';
  const sort = opts.sort || 'recent';
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const groupSections = new Map();  // groupId -> section
  const otherSections = new Map();  // windowId or domain key -> section

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
    } else if (ungroupedBy === 'domain') {
      const key = `domain-${t.domain}`;
      if (!otherSections.has(key)) {
        otherSections.set(key, {
          id: key, kind: 'domain', label: t.domain, color: null, cards: [],
        });
      }
      otherSections.get(key).cards.push(card);
    } else {
      const key = `window-${t.windowId}`;
      if (!otherSections.has(key)) {
        otherSections.set(key, {
          id: key, kind: 'window', label: 'Other tabs', color: null, cards: [],
        });
      }
      otherSections.get(key).cards.push(card);
    }
  }

  const sections = [...groupSections.values(), ...otherSections.values()];
  return sections.map(s => ({
    ...s, cards: sortCards(s.cards, sort), count: s.cards.length,
  }));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (12 tests — includes the v1 regression test with default args).

- [ ] **Step 6: Commit**

```bash
git add triage.js tests/triage.test.js
git commit -m "feat: age labels on cards + group-by/sort options in buildGridSections"
```

---

## Task 4: Show relative age in the card meta line

**Files:**
- Modify: `grid.js`
- Modify: `newtab.css`

- [ ] **Step 1: Update `buildGridCard` meta + remove redundant stale badge**

In `grid.js`, find the meta block in `buildGridCard`:

```js
  const meta = document.createElement('div');
  meta.className = 'gc-meta';
  meta.textContent = card.domain;
  body.appendChild(meta);
```

Replace it with:

```js
  const meta = document.createElement('div');
  meta.className = 'gc-meta';
  const dom = document.createElement('span');
  dom.textContent = card.domain;
  meta.appendChild(dom);
  if (card.ageLabel) {
    const age = document.createElement('span');
    age.className = card.stale ? 'gc-age gc-age-stale' : 'gc-age';
    age.textContent = card.stale ? ` · ⏳ ${card.ageLabel}` : ` · ${card.ageLabel}`;
    meta.appendChild(age);
  }
  body.appendChild(meta);
```

Then remove the now-redundant stale badge block (the age handles the signal):

```js
  if (card.stale) {
    const badge = document.createElement('div');
    badge.className = 'gc-stale';
    badge.textContent = '⏳ stale';
    body.appendChild(badge);
  }
```

Delete that block entirely.

- [ ] **Step 2: Add age CSS**

Append to `newtab.css`:

```css
/* ── CARD RELATIVE AGE ── */
.gc-age { color: var(--text-dim); }
.gc-age-stale { color: #fca5a5; }
```

- [ ] **Step 3: Syntax check**

Run: `node --check grid.js`
Expected: no output.

- [ ] **Step 4: Manual verification**

Reload, open Grid. Each card's meta line reads `domain · 3w` (etc.). Tabs untouched 7+ days are dimmed (existing `.is-stale`) and show `· ⏳ 3w` in red. No separate "⏳ stale" text remains.

- [ ] **Step 5: Commit**

```bash
git add grid.js newtab.css
git commit -m "feat: show relative age on cards; fold stale into the age label"
```

---

## Task 5: Group-by + Sort controls

**Files:**
- Modify: `newtab.html`
- Modify: `newtab.css`
- Modify: `newtab.js`

- [ ] **Step 1: Add control widgets to the overview header**

In `newtab.html`, replace the overview-header block:

```html
  <div class="overview-header" id="overviewHeader">
    <div class="ov-count" id="ovCount">— tabs open</div>
    <div class="ov-chips" id="ovChips"></div>
  </div>
```

with:

```html
  <div class="overview-header" id="overviewHeader">
    <div class="ov-count" id="ovCount">— tabs open</div>
    <div class="ov-chips" id="ovChips"></div>
    <div class="ov-controls">
      <div class="ov-group" id="ovGroup">
        <button class="ovg-btn" data-group="window">Window</button>
        <button class="ovg-btn" data-group="domain">Domain</button>
      </div>
      <select class="ov-sort" id="ovSort" title="Sort tabs">
        <option value="recent">Recent</option>
        <option value="oldest">Oldest</option>
        <option value="name">Name</option>
      </select>
    </div>
  </div>
```

- [ ] **Step 2: Add control CSS**

Append to `newtab.css`:

```css
/* ── GROUP-BY / SORT CONTROLS ── */
.ov-count { margin-right: auto; }   /* push chips + controls to the right */
.ov-controls { display: flex; align-items: center; gap: 10px; }
.ov-group {
  display: flex; gap: 3px;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09);
  border-radius: 10px; padding: 3px;
}
.ovg-btn {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  color: var(--text-dim); background: transparent; border: none;
  padding: 4px 10px; border-radius: 8px; cursor: pointer; transition: .15s;
}
.ovg-btn.is-active { background: var(--violet-soft); color: var(--violet); }
.ovg-btn:hover:not(.is-active) { color: var(--text); }
.ov-sort {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  color: var(--text); background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.09); border-radius: 10px;
  padding: 5px 8px; cursor: pointer; outline: none;
}
.ov-sort option { background: #14121f; color: var(--text); }
```

- [ ] **Step 3: Add group/sort state + persistence in `newtab.js`**

In `newtab.js`, just after the `gridTabs` declaration (near `let gridTabs = [];`), add:

```js
// Grid organization prefs (persisted).
let gridGroupBy = localStorage.getItem('tabflow:groupBy') || 'window'; // 'window'|'domain'
let gridSort    = localStorage.getItem('tabflow:sort')    || 'recent'; // 'recent'|'oldest'|'name'

function applyControlState() {
  document.querySelectorAll('.ovg-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.group === gridGroupBy));
  const sortSel = document.getElementById('ovSort');
  if (sortSel) sortSel.value = gridSort;
}
```

- [ ] **Step 4: Pass opts in `renderGridView`**

In `newtab.js`, in `renderGridView`, replace:

```js
  const sections = buildGridSections(shown, groups, now);
```

with:

```js
  const sections = buildGridSections(shown, groups, now, {
    ungroupedBy: gridGroupBy, sort: gridSort,
  });
```

And at the end of `renderGridView`, just after `updateOverviewHeader(gridTabs, now);`, add:

```js
  applyControlState();
```

- [ ] **Step 5: Wire the controls (once), near the selection-bar wiring**

In `newtab.js`, just after the `selClear` listener, add:

```js
document.getElementById('ovGroup').addEventListener('click', e => {
  const btn = e.target.closest('.ovg-btn');
  if (!btn) return;
  gridGroupBy = btn.dataset.group;
  localStorage.setItem('tabflow:groupBy', gridGroupBy);
  renderCurrentView();
});
document.getElementById('ovSort').addEventListener('change', e => {
  gridSort = e.target.value;
  localStorage.setItem('tabflow:sort', gridSort);
  renderCurrentView();
});
```

- [ ] **Step 6: Syntax check**

Run: `node --check newtab.js`
Expected: no output.

- [ ] **Step 7: Manual verification**

Reload, open Grid. The header shows a `Window | Domain` toggle and a sort dropdown.
- Switch to **Domain** → ungrouped tabs cluster into `domain · N` sections; your Chrome tab groups still appear as their own sections.
- Change **Sort** → cards reorder within each section (Recent newest-first, Oldest, Name A–Z).
- Reload the tab → both controls keep your last choice.

- [ ] **Step 8: Commit**

```bash
git add newtab.html newtab.css newtab.js
git commit -m "feat: group-by (window/domain) and sort controls for the grid"
```

---

## Task 6: Promote selection → Chrome tab group

**Files:**
- Modify: `newtab.html`
- Modify: `newtab.css`
- Modify: `newtab.js`

- [ ] **Step 1: Add the "Group these" button to the selection bar**

In `newtab.html`, replace the selection bar:

```html
  <div class="select-bar" id="selectBar">
    <span id="selectCount">0 selected</span>
    <button class="sb-close" id="selClose">Close selected</button>
    <button class="sb-clear" id="selClear">Clear</button>
  </div>
```

with:

```html
  <div class="select-bar" id="selectBar">
    <span id="selectCount">0 selected</span>
    <button class="sb-group" id="selGroup">Group these</button>
    <button class="sb-close" id="selClose">Close selected</button>
    <button class="sb-clear" id="selClear">Clear</button>
  </div>
```

- [ ] **Step 2: Add button CSS**

Append to `newtab.css`:

```css
.sb-group {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  border-radius: 8px; padding: 5px 11px; cursor: pointer;
  background: var(--violet-soft); border: 1px solid rgba(139,92,246,.4); color: var(--violet);
}
.sb-group:hover { background: rgba(139,92,246,.3); }
```

- [ ] **Step 3: Implement `groupSelected` in `newtab.js`**

In `newtab.js`, just after the `updateSelectBar` function, add:

```js
// Turn the current selection into a Chrome tab group (one group per window,
// since a Chrome group can't span windows).
async function groupSelected() {
  const ids = [...gridSelection];
  if (!ids.length) return;
  const name = window.prompt('Name this group:', 'New group');
  if (name === null) return; // cancelled

  const byWindow = new Map();
  for (const id of ids) {
    const t = gridTabs.find(x => x.id === id);
    if (!t) continue;
    if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
    byWindow.get(t.windowId).push(id);
  }

  for (const [, winIds] of byWindow) {
    try {
      const groupId = await new Promise((res, rej) =>
        chrome.tabs.group({ tabIds: winIds }, gid => {
          const err = chrome.runtime.lastError;
          if (err) rej(err); else res(gid);
        }));
      await new Promise(res =>
        chrome.tabGroups.update(groupId, { title: name || 'New group' }, () => res()));
    } catch (_) {
      // Skip tabs that can't be grouped (e.g. restricted) and continue.
    }
  }

  gridSelection.clear();
  updateSelectBar();
  renderCurrentView();
}
```

- [ ] **Step 4: Wire the button (once), next to the other selection-bar listeners**

In `newtab.js`, just after the `selClear` listener, add:

```js
document.getElementById('selGroup').addEventListener('click', groupSelected);
```

- [ ] **Step 5: Syntax check**

Run: `node --check newtab.js`
Expected: no output.

- [ ] **Step 6: Manual verification**

Reload, open Grid. ⌘/Ctrl-click a few cards → the selection bar shows "Group these". Click it, type a name → the selected tabs become a Chrome tab group with that name (visible in the browser tab strip and as a group section in the grid on re-render). Try a selection spanning two windows → each window gets a same-named group. Cancelling the prompt does nothing.

- [ ] **Step 7: Commit**

```bash
git add newtab.html newtab.css newtab.js
git commit -m "feat: promote a selection into a named Chrome tab group"
```

---

## Self-Review Notes

- **Spec coverage:** Badge (T1), relativeAge/sortCards (T2), age on cards + group-by/sort logic (T3), age display (T4), group/sort controls + persistence (T5), promote-to-group (T6). All five spec features covered.
- **Type consistency:** `toCard` adds `lastAccessed` + `ageLabel`, consumed by `grid.js` meta (T4) and `buildGridSections` (T3). `buildGridSections(tabs, groups, now, opts)` — opts `{ungroupedBy, sort}` set in `renderGridView` (T5), defaults preserve v1. `gridGroupBy`/`gridSort` keys `tabflow:groupBy`/`tabflow:sort` consistent across T5. `groupSelected` uses existing `gridSelection`, `gridTabs`, `updateSelectBar`, `renderCurrentView` (T6).
- **No new permissions / no new files:** badge uses `action` (no permission); grouping uses existing `tabGroups`; all edits are to existing files already in `package.sh`.
- **Placeholder scan:** none — every step has concrete code and exact commands.
```
