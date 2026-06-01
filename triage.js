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

// Turn the flat tab list + Chrome groups into ordered sections:
// every Chrome tab group first (in first-seen order), then one
// "Other tabs" section per window for ungrouped tabs (in first-seen order).
// opts: { ungroupedBy: 'window'|'domain', sort: 'recent'|'oldest'|'name',
//         currentWindowId? }.
// Chrome groups always become group sections first (in first-seen order).
// Ungrouped tabs go into per-window sections, or per-domain sections when
// ungroupedBy==='domain'. A lone window section is labeled "Other tabs"; with
// multiple windows they're labeled "Window 1/2/…" (the current one marked).
// Each section's cards are sorted.
function buildGridSections(tabs, groups, now, opts = {}) {
  const ungroupedBy = opts.ungroupedBy || 'window';
  const sort = opts.sort || 'recent';
  const currentWindowId = opts.currentWindowId;
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
          id: key, kind: 'window', label: 'Other tabs', color: null,
          windowId: t.windowId, cards: [],
        });
      }
      otherSections.get(key).cards.push(card);
    }
  }

  // Disambiguate multiple windows: "Other tabs" → "Window 1/2/…" (mark current).
  const winSecs = [...otherSections.values()].filter(s => s.kind === 'window');
  if (winSecs.length > 1) {
    winSecs.forEach((s, i) => {
      s.label = `Window ${i + 1}`;
      if (currentWindowId != null && s.windowId === currentWindowId) {
        s.label += ' (current)';
      }
    });
  }

  const sections = [...groupSections.values(), ...otherSections.values()];
  return sections.map(s => ({
    ...s, cards: sortCards(s.cards, sort), count: s.cards.length,
  }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    countTone, STALE_MS, isStale, staleTabs, normalizeUrl, duplicateGroups,
    buildGridSections, toCard, relativeAge, sortCards, freshness,
  };
}
