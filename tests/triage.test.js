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

test('relativeAge formats buckets', () => {
  const now = 1_000_000_000_000;
  const ago = ms => now - ms;
  assert.strictEqual(T.relativeAge(0, now), '');
  assert.strictEqual(T.relativeAge(undefined, now), '');
  assert.strictEqual(T.relativeAge(ago(59_000), now), 'now');
  assert.strictEqual(T.relativeAge(ago(60_000), now), '1 m');
  assert.strictEqual(T.relativeAge(ago(60 * 60_000), now), '1 h');
  assert.strictEqual(T.relativeAge(ago(24 * 60 * 60_000), now), '1 d');
  assert.strictEqual(T.relativeAge(ago(7 * 24 * 60 * 60_000), now), '1 w');
  assert.strictEqual(T.relativeAge(ago(30 * 24 * 60 * 60_000), now), '1 mo');
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
  assert.deepStrictEqual(cards.map(c => c.id), [1, 2, 3]);
});

test('toCard carries lastAccessed and ageLabel', () => {
  const now = 1_000_000_000_000;
  const card = T.toCard(
    { id: 1, windowId: 1, title: 'X', domain: 'x.com', url: 'https://x.com',
      favIconUrl: '', audible: false, groupId: -1,
      lastAccessed: now - 2 * 60 * 60_000 }, now);
  assert.strictEqual(card.lastAccessed, now - 2 * 60 * 60_000);
  assert.strictEqual(card.ageLabel, '2 h');
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

  assert.strictEqual(sections[0].kind, 'group');
  const domainSec = sections.find(s => s.kind === 'domain');
  assert.ok(domainSec);
  assert.strictEqual(domainSec.label, 'b.com');
  assert.strictEqual(domainSec.count, 2);
});

test('buildGridSections sorts section cards by opts.sort', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'Z', domain: 'a.com', url: 'https://a.com/z', favIconUrl: '', audible: false, lastAccessed: 10 },
    { id: 2, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com/a', favIconUrl: '', audible: false, lastAccessed: 99 },
  ];
  const recent = T.buildGridSections(tabs, [], now, { sort: 'recent' });
  assert.deepStrictEqual(recent[0].cards.map(c => c.id), [2, 1]);
  const byName = T.buildGridSections(tabs, [], now, { sort: 'name' });
  assert.deepStrictEqual(byName[0].cards.map(c => c.id), [2, 1]);
});

test('freshness: 1 when new, 0 at/after 7d, linear between', () => {
  const now = 100 * T.STALE_MS;
  assert.strictEqual(T.freshness(0, now), 0);
  assert.strictEqual(T.freshness(now, now), 1);
  assert.strictEqual(T.freshness(now - T.STALE_MS, now), 0);
  assert.strictEqual(T.freshness(now - T.STALE_MS - 5, now), 0);
  assert.strictEqual(T.freshness(now - T.STALE_MS / 2, now), 0.5);
});

test('toCard handles null lastAccessed (unknown) as not-stale, no age', () => {
  const now = 100 * T.STALE_MS;
  const card = T.toCard(
    { id: 9, windowId: 1, title: 'U', domain: 'u.com', url: 'https://u.com',
      favIconUrl: '', audible: false, groupId: -1, lastAccessed: null }, now);
  assert.strictEqual(card.stale, false);
  assert.strictEqual(card.ageLabel, '');
  assert.strictEqual(card.freshness, 0);
});

test('buildGridSections pins current window first, labels This/Other window', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 11, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const secs = T.buildGridSections(tabs, [], now, { currentWindowId: 11 });
  assert.strictEqual(secs[0].windowId, 11);          // current pinned to top
  assert.strictEqual(secs[0].label, 'This window');
  assert.strictEqual(secs[1].label, 'Other window');
});

test('buildGridSections numbers multiple other windows', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 11, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 3, windowId: 12, groupId: -1, title: 'C', domain: 'c.com', url: 'https://c.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const secs = T.buildGridSections(tabs, [], now, { currentWindowId: 12 });
  assert.strictEqual(secs[0].label, 'This window');                 // win 12 pinned
  assert.deepStrictEqual([secs[1].label, secs[2].label], ['Other window 1', 'Other window 2']);
});

test('buildGridSections pins current window above other-window groups', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: 5,  title: 'G', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
    { id: 2, windowId: 11, groupId: -1, title: 'B', domain: 'b.com', url: 'https://b.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const groups = [{ id: 5, title: 'Work', color: 'blue', windowId: 10 }];
  const secs = T.buildGridSections(tabs, groups, now, { currentWindowId: 11 });
  assert.strictEqual(secs[0].windowId, 11);   // current window's section first
  assert.strictEqual(secs[1].kind, 'group');  // other window's group after
});

test('buildGridSections keeps "Other tabs" for a single window', () => {
  const now = 100 * T.STALE_MS;
  const tabs = [
    { id: 1, windowId: 10, groupId: -1, title: 'A', domain: 'a.com', url: 'https://a.com', favIconUrl: '', audible: false, lastAccessed: now },
  ];
  const secs = T.buildGridSections(tabs, [], now, { currentWindowId: 10 });
  assert.strictEqual(secs[0].label, 'Other tabs');
});
