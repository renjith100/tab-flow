# Grid Window Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the grid into window blocks — each window shows its Ungrouped tabs first, then its tab groups ("Name (tab group)") — with the current window pinned to the top.

**Architecture:** Rename the pure `buildGridSections` → `buildGridRows`, returning an ordered list of rows (`window-header` rows interleaved with section rows). `grid.js` renders each row by kind. Domain mode stays flat. No new permissions/files.

**Tech Stack:** Vanilla JS/CSS/HTML, Chrome MV3, Node `node:test`. Run tests: `node --test tests/*.test.js`.

**Builds on:** `fix/multi-window-labels` (PR #31) — has `currentWindowId` plumbing.

---

## Task 1: `buildGridRows` (rename + reshape) in triage.js

**Files:**
- Modify: `triage.js` (replace `buildGridSections`)
- Test: `tests/triage.test.js`

- [ ] **Step 1: Replace the `buildGridSections` tests with `buildGridRows` tests**

In `tests/triage.test.js`, delete the existing tests whose names start with
`buildGridSections` (there are several) and add these in their place:

```js
test('buildGridRows window mode: header, ungrouped first, then groups', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: 5,  title: 'G', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 10, groupId: -1, title: 'U', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const groups = [{ id: 5, title: 'Work', color: 'blue', windowId: 10 }];
  const rows = T.buildGridRows(tabs, groups, now, { currentWindowId: 10 });

  assert.strictEqual(rows[0].kind, 'window-header');
  assert.strictEqual(rows[0].label, 'This window');
  assert.strictEqual(rows[0].tabCount, 2);
  assert.strictEqual(rows[1].kind, 'ungrouped');
  assert.strictEqual(rows[1].label, 'Ungrouped');
  assert.strictEqual(rows[2].kind, 'group');
  assert.strictEqual(rows[2].label, 'Work (tab group)');
  assert.strictEqual(rows[2].color, 'blue');
});

test('buildGridRows pins current window first; This/Other window labels', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 11, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const rows = T.buildGridRows(tabs, [], now, { currentWindowId: 11 });
  const headers = rows.filter(r => r.kind === 'window-header');
  assert.deepStrictEqual(headers.map(h => h.label), ['This window', 'Other window']);
  assert.strictEqual(headers[0].windowId, 11); // current pinned first
});

test('buildGridRows numbers multiple other windows', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 11, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 3, windowId: 12, groupId: -1, title: 'C', domain: 'c.com', url: 'https://c.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const rows = T.buildGridRows(tabs, [], now, { currentWindowId: 12 });
  const headers = rows.filter(r => r.kind === 'window-header');
  assert.deepStrictEqual(headers.map(h => h.label), ['This window', 'Other window 1', 'Other window 2']);
});

test('buildGridRows omits Ungrouped row when a window has only grouped tabs', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: 5, title: 'G', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const groups = [{ id: 5, title: 'Work', color: 'blue', windowId: 10 }];
  const rows = T.buildGridRows(tabs, groups, now, { currentWindowId: 10 });
  assert.deepStrictEqual(rows.map(r => r.kind), ['window-header', 'group']);
});

test('buildGridRows single window still shows the header', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const rows = T.buildGridRows(tabs, [], now, { currentWindowId: 10 });
  assert.strictEqual(rows[0].kind, 'window-header');
  assert.strictEqual(rows[0].label, 'This window');
  assert.strictEqual(rows[1].kind, 'ungrouped');
});

test('buildGridRows domain mode: flat, no window headers, groups labeled', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: 5,  title: 'G', domain: 'a.com', url: 'https://a.com',   favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 10, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com/1', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 3, windowId: 11, groupId: -1, title: 'C', domain: 'b.com', url: 'https://b.com/2', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const groups = [{ id: 5, title: 'Work', color: 'blue', windowId: 10 }];
  const rows = T.buildGridRows(tabs, groups, now, { ungroupedBy: 'domain' });
  assert.strictEqual(rows.some(r => r.kind === 'window-header'), false);
  assert.strictEqual(rows[0].kind, 'group');
  assert.strictEqual(rows[0].label, 'Work (tab group)');
  const dom = rows.find(r => r.kind === 'domain');
  assert.strictEqual(dom.label, 'b.com');
  assert.strictEqual(dom.count, 2);
});

test('buildGridRows sorts a section by opts.sort', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'Z', domain: 'a.com', url: 'https://a.com/z', favIconUrl: '', audible: false, lastAccessed: 10 },
    { id: 2, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com/a', favIconUrl: '', audible: false, lastAccessed: 99 },
  ];
  const recent = T.buildGridRows(tabs, [], now, { currentWindowId: 10, sort: 'recent' });
  const ung = recent.find(r => r.kind === 'ungrouped');
  assert.deepStrictEqual(ung.cards.map(c => c.id), [2, 1]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/triage.test.js`
Expected: FAIL — `T.buildGridRows is not a function`.

- [ ] **Step 3: Replace `buildGridSections` with `buildGridRows` in triage.js**

In `triage.js`, replace the entire `buildGridSections` function (its doc comment
through its closing brace) with:

```js
// Build the ordered grid rows. opts: { ungroupedBy:'window'|'domain', sort, currentWindowId }.
// Window mode → window-header rows, each followed by an "Ungrouped" section (if any)
// then the window's tab groups; current window pinned first. Domain mode → flat
// group + per-domain sections (no window headers). A row is one of:
//   { kind:'window-header', windowId, label, isCurrent, tabCount }
//   { kind:'ungrouped'|'group'|'domain', id, label, color, windowId?, cards, count }
function buildGridRows(tabs, groups, now, opts = {}) {
  const ungroupedBy = opts.ungroupedBy || 'window';
  const sort = opts.sort || 'recent';
  const currentWindowId = opts.currentWindowId;
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const isGrouped = t => t.groupId != null && t.groupId !== -1 && groupMap.has(t.groupId);
  const groupLabel = g => `${g.title || 'Tab Group'} (tab group)`;
  const finish = s => ({ ...s, cards: sortCards(s.cards, sort), count: s.cards.length });

  // ── Domain mode: flat, no window headers ──
  if (ungroupedBy === 'domain') {
    const groupSecs = new Map();
    const domainSecs = new Map();
    for (const t of tabs) {
      const card = toCard(t, now);
      if (isGrouped(t)) {
        if (!groupSecs.has(t.groupId)) {
          const g = groupMap.get(t.groupId);
          groupSecs.set(t.groupId, {
            kind: 'group', id: `group-${g.id}`, label: groupLabel(g),
            color: g.color, windowId: g.windowId, cards: [],
          });
        }
        groupSecs.get(t.groupId).cards.push(card);
      } else {
        if (!domainSecs.has(t.domain)) {
          domainSecs.set(t.domain, {
            kind: 'domain', id: `domain-${t.domain}`, label: t.domain, color: null, cards: [],
          });
        }
        domainSecs.get(t.domain).cards.push(card);
      }
    }
    return [...groupSecs.values(), ...domainSecs.values()].map(finish);
  }

  // ── Window mode: window blocks ──
  const windows = new Map(); // windowId -> { windowId, ungrouped:[], groups:Map, tabCount }
  for (const t of tabs) {
    if (!windows.has(t.windowId)) {
      windows.set(t.windowId, { windowId: t.windowId, ungrouped: [], groups: new Map(), tabCount: 0 });
    }
    const w = windows.get(t.windowId);
    w.tabCount += 1;
    const card = toCard(t, now);
    if (isGrouped(t)) {
      if (!w.groups.has(t.groupId)) {
        const g = groupMap.get(t.groupId);
        w.groups.set(t.groupId, {
          kind: 'group', id: `group-${g.id}`, label: groupLabel(g),
          color: g.color, windowId: t.windowId, cards: [],
        });
      }
      w.groups.get(t.groupId).cards.push(card);
    } else {
      w.ungrouped.push(card);
    }
  }

  // Order windows: current first, then first-seen.
  let winList = [...windows.values()];
  if (currentWindowId != null) {
    winList = [
      ...winList.filter(w => w.windowId === currentWindowId),
      ...winList.filter(w => w.windowId !== currentWindowId),
    ];
  }
  const otherTotal = currentWindowId != null
    ? winList.filter(w => w.windowId !== currentWindowId).length
    : winList.length;

  const rows = [];
  let plainIdx = 0, otherIdx = 0;
  for (const w of winList) {
    let label;
    if (currentWindowId == null) {
      label = `Window ${++plainIdx}`;
    } else if (w.windowId === currentWindowId) {
      label = 'This window';
    } else {
      otherIdx += 1;
      label = otherTotal > 1 ? `Other window ${otherIdx}` : 'Other window';
    }
    rows.push({
      kind: 'window-header', windowId: w.windowId, label,
      isCurrent: w.windowId === currentWindowId, tabCount: w.tabCount,
    });
    if (w.ungrouped.length) {
      rows.push(finish({
        kind: 'ungrouped', id: `ungrouped-${w.windowId}`, label: 'Ungrouped',
        color: null, windowId: w.windowId, cards: w.ungrouped,
      }));
    }
    for (const g of w.groups.values()) rows.push(finish(g));
  }
  return rows;
}
```

- [ ] **Step 4: Update the export shim** — rename `buildGridSections` → `buildGridRows`:

```js
  module.exports = {
    countTone, STALE_MS, isStale, staleTabs, normalizeUrl, duplicateGroups,
    buildGridRows, toCard, relativeAge, sortCards, freshness,
  };
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/triage.test.js`
Expected: PASS (all `buildGridRows` tests green; unrelated tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add triage.js tests/triage.test.js
git commit -m "feat: buildGridRows — window blocks (ungrouped first, then groups)"
```

---

## Task 2: Render window headers + rows in grid.js

**Files:**
- Modify: `grid.js` (`renderGrid`, add `buildWindowHeader`, broaden dot condition)

- [ ] **Step 1: Add `buildWindowHeader` and update `renderGrid`**

In `grid.js`, replace `renderGrid` with:

```js
// A window divider row.
function buildWindowHeader(row) {
  const el = document.createElement('div');
  el.className = 'gs-window-header';
  if (row.isCurrent) el.classList.add('is-current');
  const label = document.createElement('span');
  label.className = 'gsw-label';
  label.textContent = row.label;
  el.appendChild(label);
  const count = document.createElement('span');
  count.className = 'gsw-count';
  count.textContent = `${row.tabCount} ${row.tabCount === 1 ? 'tab' : 'tabs'}`;
  el.appendChild(count);
  return el;
}

// Render all rows: window-header rows as dividers, everything else as sections.
function renderGrid(container, rows, ctx) {
  container.innerHTML = '';
  for (const row of rows) {
    if (row.kind === 'window-header') container.appendChild(buildWindowHeader(row));
    else container.appendChild(buildSectionEl(row, ctx));
  }
}
```

- [ ] **Step 2: Broaden the section dot condition**

In `grid.js` `buildSectionEl`, change:

```js
  if (section.kind === 'group' && section.color) {
```

to:

```js
  if (section.color) {
```

(Only group rows carry a color, so this is equivalent but kind-agnostic.)

- [ ] **Step 3: Syntax check**

Run: `node --check grid.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add grid.js
git commit -m "feat: render window-header rows + section rows in the grid"
```

---

## Task 3: Wire renderGridView to buildGridRows

**Files:**
- Modify: `newtab.js` (`renderGridView`)

- [ ] **Step 1: Call `buildGridRows` and pass rows to `renderGrid`**

In `newtab.js` `renderGridView`, replace:

```js
  const sections = buildGridSections(shown, groups, now, {
    ungroupedBy: gridGroupBy, sort: gridSort, currentWindowId,
  });
```

with:

```js
  const rows = buildGridRows(shown, groups, now, {
    ungroupedBy: gridGroupBy, sort: gridSort, currentWindowId,
  });
```

And change the render call from `renderGrid(document.getElementById('gridScroll'), sections, ctx);`
to:

```js
  renderGrid(document.getElementById('gridScroll'), rows, ctx);
```

- [ ] **Step 2: Syntax check**

Run: `node --check newtab.js`
Expected: no output.

- [ ] **Step 3: Manual verification**

Reload the extension, open Grid (Window mode). Expected: each window shows a
header ("This window" / "Other window…") with its tab count; under it the
**Ungrouped** section first, then each **"Name (tab group)"** with its color dot.
Current window is on top. Close/select/keyboard still work. Switch Group → Domain:
flat "site.com" + "(tab group)" sections, no window headers.

- [ ] **Step 4: Commit**

```bash
git add newtab.js
git commit -m "feat: grid renders window-block rows via buildGridRows"
```

---

## Task 4: Window-header CSS

**Files:**
- Modify: `newtab.css` (append)

- [ ] **Step 1: Add styles**

Append to `newtab.css`:

```css
/* ── GRID WINDOW HEADER (top-tier divider) ── */
.gs-window-header {
  display: flex; align-items: baseline; gap: 10px;
  margin: 30px 0 6px; padding-bottom: 8px;
  border-bottom: 1px solid rgba(139, 92, 246, .22);
}
.gs-window-header:first-child { margin-top: 6px; }
.gsw-label {
  font-family: 'Fraunces', serif; font-style: italic; font-size: 18px;
  color: var(--text);
}
.gs-window-header.is-current .gsw-label { color: var(--violet); }
.gsw-count {
  font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
  color: var(--text-dim);
}
/* sections sit visually inside their window block */
.grid-section { padding-left: 10px; }
```

- [ ] **Step 2: Manual verification**

Reload, open Grid. The window header reads as a clear top tier (italic label,
current window in violet, tab count, underline); sections are slightly indented
beneath it. Two/three windows render as stacked blocks.

- [ ] **Step 3: Commit**

```bash
git add newtab.css
git commit -m "style: window-header divider + section indent for grid blocks"
```

---

## Self-Review Notes

- **Spec coverage:** window blocks + ungrouped-first + "(tab group)" labels + pin
  current (T1); header/section render by kind (T2); wired in renderGridView (T3);
  two-tier styling (T4); domain mode stays flat (T1 + test). Edge cases (no-ungrouped
  window, single window, missing currentWindowId) covered by T1 logic/tests.
- **Type consistency:** `buildGridRows` rows — `window-header {windowId,label,isCurrent,tabCount}`
  and section `{kind,id,label,color,windowId?,cards,count}` — produced in T1, consumed
  by `renderGrid`/`buildWindowHeader`/`buildSectionEl` in T2. `renderGridView` (T3)
  renames `sections`→`rows`; `ctx` unchanged. Export renamed in T1 and called in T3.
- **No new files/permissions.** `package.sh` unaffected (triage.js/grid.js already listed).
