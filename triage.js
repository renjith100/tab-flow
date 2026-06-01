// ── triage.js — pure triage logic. No DOM, no Chrome APIs. ────────────────────
// Loaded as a browser global via <script> and required by Node tests.

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Header tone by open-tab count: calm (<15), warn (15–40), alert (>40).
function countTone(n) {
  if (n > 40) return 'alert';
  if (n >= 15) return 'warn';
  return 'calm';
}

// A tab is stale if it hasn't been accessed in STALE_MS or longer.
function isStale(tab, now) {
  if (!tab || typeof tab.lastAccessed !== 'number') return false;
  return (now - tab.lastAccessed) >= STALE_MS;
}

// Subset of tabs that are stale.
function staleTabs(tabs, now) {
  return tabs.filter(t => isStale(t, now));
}

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

// Short relative-age label from a lastAccessed timestamp (ms). '' when unknown.
function relativeAge(lastAccessed, now) {
  if (!lastAccessed) return '';
  const s = Math.max(0, Math.floor((now - lastAccessed) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' m';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h';
  const d = Math.floor(h / 24);
  if (d < 7) return d + ' d';
  if (d < 30) return Math.floor(d / 7) + ' w';
  return Math.floor(d / 30) + ' mo';
}

// Freshness 0..1 from a lastAccessed timestamp: 1 = just now, 0 = STALE_MS (7d)
// or older. Used to color the age pill (bright green → dull green).
function freshness(lastAccessed, now) {
  if (!lastAccessed) return 0;
  const age = now - lastAccessed;
  if (age <= 0) return 1;
  if (age >= STALE_MS) return 0;
  return 1 - age / STALE_MS;
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

// Build a card view-model from a tab item. OG fields (image/description) are
// left undefined here and populated later by the OG-enrichment layer.
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
    freshness:    freshness(t.lastAccessed, now),
    stale:        isStale(t, now),
    image:        undefined,
    description:  undefined,
  };
}

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    countTone, STALE_MS, isStale, staleTabs, normalizeUrl, duplicateGroups,
    buildGridRows, toCard, relativeAge, sortCards, freshness,
  };
}
