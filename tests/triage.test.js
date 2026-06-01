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
