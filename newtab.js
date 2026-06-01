// ── State ─────────────────────────────────────────────────────────────────────
let allTabs         = [];      // flat list of all tab objects (with groupId)
let mainItems       = [];      // main carousel items: ungrouped tabs + group cards
let filtered        = [];      // current carousel subset (main or group)
let active          = 0;       // index into filtered[]
let cardEls         = [];      // persistent DOM refs — never destroyed on navigate
let viewMode        = 'main';  // 'main' | 'group'
let activeGroup     = null;    // group item currently being browsed
let currentWindowId = null;    // id of the window TabFlow is running in
let isAnimatingRemoval = false; // block new deletions while one is in progress
let tabsClosing     = new Set(); // ids of tabs currently animating for removal

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

function releaseGuards(tabId) {
  tabsClosing.delete(tabId);
  isAnimatingRemoval = false;
}

// ── Tab group color map ────────────────────────────────────────────────────────
const GROUP_COLORS = {
  grey: '#9ca3af', gray: '#9ca3af',
  blue: '#60a5fa', red:  '#f87171',
  yellow: '#fbbf24', green: '#34d399',
  pink: '#f472b6',  purple: '#c084fc', cyan: '#22d3ee',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cardsEl    = document.getElementById('cards');
const searchEl   = document.getElementById('search');
const curEl      = document.getElementById('cur');
const totEl      = document.getElementById('tot');
const emptyEl    = document.getElementById('empty');
const detailEl   = document.getElementById('detail');
const toastEl         = document.getElementById('toast');
const toastLabel      = document.getElementById('toastLabel');
const toastUndo       = document.getElementById('toastUndo');
const hintExitGroupEl = document.getElementById('hintExitGroup');

// ── Cover Flow position configs per distance from center ──────────────────────
const POSITIONS = [
  { tx:   0, tz:   0, ry:  0, sc: 1.00, op: 1.00, zi: 100 }, // center
  { tx: 220, tz: -55, ry: 52, sc: 0.84, op: 0.88, zi:  90 }, // ±1
  { tx: 384, tz:-125, ry: 64, sc: 0.69, op: 0.62, zi:  80 }, // ±2
  { tx: 502, tz:-188, ry: 71, sc: 0.56, op: 0.38, zi:  70 }, // ±3
  { tx: 588, tz:-238, ry: 75, sc: 0.46, op: 0.16, zi:  60 }, // ±4+
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDomain(url) {
  try {
    return new URL(url || '').hostname.replace(/^www\./, '') || 'chrome';
  } catch {
    return 'chrome';
  }
}

// Prefer the tab's own favicon URL; fall back to Google's favicon service
function favUrl(tab) {
  if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) {
    return tab.favIconUrl;
  }
  const domain = getDomain(tab.url);
  if (domain && domain !== 'chrome') {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }
  return null;
}

function getPos(offset) {
  const idx  = Math.min(Math.abs(offset), POSITIONS.length - 1);
  const sign = Math.sign(offset);
  const p    = POSITIONS[idx];
  return {
    tx: sign * p.tx,
    tz: p.tz,
    // Left cards: positive rotateY → right face tilts toward viewer
    // Right cards: negative rotateY → left face tilts toward viewer
    ry: sign * -p.ry,
    sc: p.sc,
    op: p.op,
    zi: p.zi,
  };
}

// ── updateReflect: applies physical mirror reflection ─────────────────────────
// For real-world physics, the reflection should stay on the "floor".
// In WebKit, -webkit-box-reflect offset is scaled by the element's transform.
// If card height is H, gap to mirror is G, and card moves dy:
// Total Screen Offset = (H + G - 2*dy).
// Required CSS Offset = (Total Screen Offset / scale) - H.
function updateReflect(card, sc, dy = 0, far = false) {
  if (far) {
    card.style.webkitBoxReflect = 'none';
    return;
  }
  // H=224, G=24 => H+G=248. sc is the current animated scale.
  const s = Math.max(0.01, sc); // prevent division by zero
  const offset = ((248 - 2 * dy) / s - 224).toFixed(1);
  card.style.webkitBoxReflect = `below ${offset}px linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 68%)`;
}

// ── buildCards: create DOM once (on init or after filtering) ──────────────────
function buildCards() {
  cardsEl.innerHTML = '';
  cardEls = [];

  if (filtered.length === 0) {
    emptyEl.classList.add('show');
    curEl.textContent = '0';
    totEl.textContent = '0';
    detailEl.innerHTML = '';
    return;
  }

  emptyEl.classList.remove('show');

  filtered.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'card';

    if (t.type === 'group') {
      // ── Group card ──────────────────────────────────────────────────────────
      card.classList.add('card-group');
      const color = GROUP_COLORS[t.color] || '#9ca3af';
      card.style.setProperty('--group-color', color);

      // Favicon cluster (up to 4 tabs)
      const cluster = document.createElement('div');
      cluster.className = 'group-favicon-cluster';
      t.tabs.slice(0, 4).forEach(tab => {
        const fav = document.createElement('div');
        fav.className = 'group-fav';
        const url = favUrl(tab);
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = tab.title;
          img.onerror = function () { this.replaceWith(makeGroupFallback(tab.domain)); };
          fav.appendChild(img);
        } else {
          fav.appendChild(makeGroupFallback(tab.domain));
        }
        cluster.appendChild(fav);
      });

      const nameEl = document.createElement('div');
      nameEl.className = 'group-name';
      nameEl.textContent = t.title || 'Tab Group';

      const countEl = document.createElement('div');
      countEl.className = 'group-count';
      countEl.textContent = `${t.tabs.length} tab${t.tabs.length !== 1 ? 's' : ''}`;

      card.appendChild(cluster);
      card.appendChild(nameEl);
      card.appendChild(countEl);

      // Click: navigate to group card, or enter it if already active
      card.addEventListener('click', () => {
        if (drag.moved) return;
        if (i === active) enterGroup(t);
        else { active = i; updatePositions(); }
      });

    } else {
      // ── Tab card (existing layout) ───────────────────────────────────────────
      const ring = document.createElement('div');
      ring.className = 'fav-ring';

      const url = favUrl(t);
      if (url) {
        const img = document.createElement('img');
        img.className = 'fav-img';
        img.src = url;
        img.alt = t.title;
        img.onerror = function () {
          this.remove();
          ring.appendChild(makeFallback(t.domain));
        };
        ring.appendChild(img);
      } else {
        ring.appendChild(makeFallback(t.domain));
      }

      if (t.audible) {
        card.classList.add('is-audible');
        card.appendChild(makeAudioBar()); // shared with the grid — defined in grid.js
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'card-title';
      titleEl.textContent = t.title;

      const domainEl = document.createElement('div');
      domainEl.className = 'card-domain';
      domainEl.textContent = t.domain;

      card.appendChild(ring);
      card.appendChild(titleEl);
      card.appendChild(domainEl);

      // Relative-age pill (shared with the grid)
      const now = Date.now();
      const pill = makeAgePill({
        ageLabel:  relativeAge(t.lastAccessed, now),
        freshness: freshness(t.lastAccessed, now),
        stale:     isStale(t, now),
      });
      if (pill) card.appendChild(pill);

      // Hover close button
      const close = document.createElement('button');
      close.className = 'gc-close';
      close.textContent = '×';
      close.title = 'Close tab';
      close.addEventListener('mousedown', ev => ev.stopPropagation());
      close.addEventListener('touchstart', ev => ev.stopPropagation(), { passive: true });
      close.addEventListener('click', ev => {
        ev.stopPropagation();
        if (isAnimatingRemoval || tabsClosing.has(t.id)) return;
        // Reuse the carousel's poof-close animation (handles removal + undo toast).
        drag.base = getPos(i - active);
        poofClose(i, card, 0, 0);
      });
      card.appendChild(close);

      // Drag-to-close only on tab cards
      card.addEventListener('mousedown',  e => initDrag(e, i));
      card.addEventListener('touchstart', e => initDrag(e, i), { passive: false });
      card.addEventListener('click', () => {
        if (drag.moved) return;
        if (i === active) openTab();
        else { active = i; updatePositions(); }
      });
    }

    cardsEl.appendChild(card);
    cardEls.push(card);
  });

  // Set initial positions instantly (suppress transition on first paint)
  updatePositions({ instant: true });
}

function makeFallback(domain) {
  const fb = document.createElement('div');
  fb.className = 'fav-fallback';
  fb.style.background = '#2a2a3a';
  fb.textContent = (domain || 'T')[0].toUpperCase();
  return fb;
}

function makeGroupFallback(domain) {
  const fb = document.createElement('div');
  fb.className = 'group-fav-fallback';
  fb.style.background = '#2a2a3a';
  fb.textContent = (domain || 'T')[0].toUpperCase();
  return fb;
}

// ── updatePositions: mutate styles only — CSS transition does the animation ───
function updatePositions({ instant = false } = {}) {
  if (!cardEls.length) return;

  curEl.textContent = active + 1;
  totEl.textContent = filtered.length;

  const item = filtered[active];
  detailEl.textContent = '';
  if (item.type === 'group') {
    const color = GROUP_COLORS[item.color] || '#9ca3af';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'hl';
    titleSpan.style.color = color;
    titleSpan.textContent = item.title;
    const count = item.tabs.length;
    detailEl.appendChild(titleSpan);
    detailEl.appendChild(document.createTextNode(` · ${count} tab${count !== 1 ? 's' : ''}`));
  } else {
    if (viewMode === 'group') {
      const breadcrumbSpan = document.createElement('span');
      breadcrumbSpan.className = 'group-breadcrumb';
      breadcrumbSpan.style.color = GROUP_COLORS[activeGroup.color] || '#9ca3af';
      breadcrumbSpan.textContent = activeGroup.title;
      detailEl.appendChild(breadcrumbSpan);
      detailEl.appendChild(document.createTextNode(' › '));
    }
    const titleSpan = document.createElement('span');
    titleSpan.className = 'hl';
    titleSpan.textContent = item.title;
    detailEl.appendChild(titleSpan);
    detailEl.appendChild(document.createTextNode(` · ${item.domain}`));
  }

  cardEls.forEach((card, i) => {
    const item = filtered[i];
    if (item?.id && tabsClosing.has(item.id)) return;

    const offset = i - active;
    const { tx, tz, ry, sc, op, zi } = getPos(offset);
    const far = Math.abs(offset) > 4;

    if (instant) card.style.transition = 'none';

    card.style.transform     = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${sc})`;
    card.style.opacity       = far ? '0' : op;
    card.style.zIndex        = zi;
    card.style.pointerEvents = far ? 'none' : 'auto';
    card.classList.toggle('is-active', i === active);

    // Cover Flow reflection — offset corrected per scale so every card sits on the same shelf
    updateReflect(card, sc, 0, far);

    if (instant) {
      card.offsetHeight;       // force reflow so "no-transition" frame commits
      card.style.transition = '';
    }
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
function go(dir) {
  if (!filtered.length) return;
  active = Math.max(0, Math.min(filtered.length - 1, active + dir));
  updatePositions();
}

function openTab() {
  const tab = filtered[active];
  if (!tab || tab.type !== 'tab') return;

  const activeCard = cardEls[active];
  if (activeCard) activeCard.classList.add('flash');

  // Brief flash, then switch — feels intentional rather than instant
  setTimeout(() => {
    Promise.resolve(chrome.tabs.update(tab.id, { active: true })).catch(() => {});
    Promise.resolve(chrome.windows.update(tab.windowId, { focused: true })).catch(() => {});
  }, 160);
}

// ── Centralized model cleanup when a tab is closed ────────────────────────────
// Keeps filtered, allTabs, mainItems and group .tabs arrays in sync.
function removeTabFromModels(tab, filteredIdx) {
  filtered.splice(filteredIdx, 1);

  const ai = allTabs.findIndex(t => t.id === tab.id);
  if (ai !== -1) allTabs.splice(ai, 1);

  if (tab.groupId !== -1) {
    // Grouped tab: update the group card's tabs array
    const groupCard = mainItems.find(item => item.type === 'group' && item.id === tab.groupId);
    if (groupCard) {
      const ti = groupCard.tabs.findIndex(t => t.id === tab.id);
      if (ti !== -1) groupCard.tabs.splice(ti, 1);
      // If the group is now empty, drop its card from mainItems too
      if (groupCard.tabs.length === 0) {
        const mi = mainItems.indexOf(groupCard);
        if (mi !== -1) mainItems.splice(mi, 1);
      }
    }
  } else {
    // Ungrouped tab: remove directly from mainItems
    const mi = mainItems.findIndex(item => item.type === 'tab' && item.id === tab.id);
    if (mi !== -1) mainItems.splice(mi, 1);
  }
}

// ── Shared close-path helper ───────────────────────────────────────────────────
// Called by both closeActiveTab and poofClose after removing the last tab from a
// group. Clears the animation guards and exits the group view. Returns true when
// it handled the exit so the caller can early-return immediately.
function exitGroupIfEmpty(tabId) {
  if (viewMode !== 'group' || activeGroup.tabs.length !== 0) return false;
  releaseGuards(tabId);
  exitGroup();
  return true;
}

// ── Close active tab (Escape key in newtab mode) ──────────────────────────────

function closeActiveTab() {
  if (!filtered.length || isAnimatingRemoval) return;
  const idx  = active;
  const item = filtered[idx];
  if (!item || item.type !== 'tab') return;
  const card = cardEls[idx];
  if (!card) return;

  isAnimatingRemoval = true;
  tabsClosing.add(item.id);

  // Flash red glow (same as drag-close), then arc out — freeze transition before removing
  // the class so the border snaps back without any flash triggering the old jump bug
  card.classList.add('will-close');

  setTimeout(() => {
    card.style.transition = 'none';
    card.style.zIndex = '200';

    const startTime = performance.now();
    const duration  = 750;

    // Correcting reflection during animation requires a JS loop to keep it "physical"
    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      // Matches @keyframes card-pull-out in newtab.css
      // 0%: 0, 0, 0deg, 1.00; 30%: 8, -105, 1deg, 0.90; 52%: 36, -192, 3deg, 0.75; etc.
      let tx, dy, rz, s, op;
      if (t < 0.3) {
        const r = t / 0.3;
        tx = 8 * r; dy = -105 * r; rz = 1 * r; s = 1 - 0.1 * r; op = 1 - 0.05 * r;
      } else if (t < 0.52) {
        const r = (t - 0.3) / 0.22;
        tx = 8 + (36-8)*r; dy = -105 + (-192 - -105)*r; rz = 1 + (3-1)*r; s = 0.9 - 0.15*r; op = 0.95 - 0.15*r;
      } else if (t < 0.7) {
        const r = (t - 0.52) / 0.18;
        tx = 36 + (110-36)*r; dy = -192 + (-258 - -192)*r; rz = 3 + (5.5-3)*r; s = 0.75 - 0.17*r; op = 0.8 - 0.25*r;
      } else if (t < 0.85) {
        const r = (t - 0.7) / 0.15;
        tx = 110 + (220-110)*r; dy = -258 + (-310 - -258)*r; rz = 5.5 + (7.5-5.5)*r; s = 0.58 - 0.18*r; op = 0.55 - 0.3*r;
      } else {
        const r = (t - 0.85) / 0.15;
        tx = 220 + (315-220)*r; dy = -310 + (-332 - -310)*r; rz = 7.5 + (9-7.5)*r; s = 0.4 - 0.13*r; op = 0.25 - 0.25*r;
      }

      card.style.transform = `translateX(${tx}px) translateY(${dy}px) rotateZ(${rz}deg) scale(${s})`;
      card.style.opacity = op;
      updateReflect(card, s, dy);

      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, 120);

  setTimeout(() => {
    const currentIdx = filtered.findIndex(t => t.id === item.id);
    if (currentIdx === -1) {
      releaseGuards(item.id);
      return; // already removed by a concurrent close
    }

    const cardEl = cardEls[currentIdx];

    removeTabFromModels(item, currentIdx);
    Promise.resolve(chrome.tabs.remove(item.id)).catch(() => {});
    showUndoToast(item.title);

    if (exitGroupIfEmpty(item.id)) return;

    active = Math.min(active, Math.max(0, filtered.length - 1));

    if (cardEl) {
      cardEl.remove();
      cardEls.splice(currentIdx, 1);
    }

    releaseGuards(item.id);

    if (filtered.length === 0) {
      buildCards();
    } else {
      updatePositions();
    }
  }, 120 + 760); // glow delay + animation duration
}

// ── Tab group navigation ───────────────────────────────────────────────────────
function enterGroup(group) {
  viewMode    = 'group';
  activeGroup = group;
  filtered    = [...group.tabs];
  active      = 0;
  if (hintExitGroupEl) hintExitGroupEl.style.display = '';
  buildCards();
}

function exitGroup() {
  const groupIdx = mainItems.findIndex(item => item.type === 'group' && item.id === activeGroup.id);
  viewMode    = 'main';
  activeGroup = null;
  filtered    = [...mainItems];
  active      = groupIdx >= 0 ? groupIdx : 0;
  if (hintExitGroupEl) hintExitGroupEl.style.display = 'none';
  buildCards();
}

// ── Undo (reopen last closed tab via Chrome sessions API) ─────────────────────
let toastTimer = null;

function showUndoToast(title) {
  toastLabel.textContent = 'Closed ';
  const strong = document.createElement('strong');
  strong.textContent = title;
  toastLabel.appendChild(strong);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideUndoToast, 4000);
}

function hideUndoToast() {
  toastEl.classList.remove('show');
}

async function undoClose() {
  hideUndoToast();

  // Grid mode: a close may have removed many tabs. Restore the most-recently
  // closed session that many times (no sessionId = restore most recent).
  if (currentView === 'grid') {
    const times = Math.max(1, lastGridClosedCount);
    lastGridClosedCount = 0;
    for (let i = 0; i < times; i++) {
      await new Promise(res => chrome.sessions.restore(undefined, () => res()));
    }
    renderCurrentView();
    return;
  }

  const sessions = await new Promise(r =>
    chrome.sessions.getRecentlyClosed({ maxResults: 1 }, r)
  );
  const entry = sessions[0];
  if (!entry) return;
  const sessionId = entry.tab ? entry.tab.sessionId : entry.window?.sessionId;
  if (sessionId) {
    await chrome.sessions.restore(sessionId);
    await init();
  }
}

toastUndo.addEventListener('click', undoClose);

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const inSearch = document.activeElement === searchEl;

  // ── Grid-mode keyboard ──
  if (currentView === 'grid') {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undoClose(); return; }

    // While typing in search, don't hijack keys (Escape blurs back to the grid).
    if (inSearch) {
      if (e.key === 'Escape') searchEl.blur();
      return;
    }

    if (e.key === '/') { e.preventDefault(); searchEl.focus(); return; }

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

  if (inSearch) {
    if (e.key === 'Enter')           { searchEl.blur(); openTab(); return; }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); searchEl.blur(); go(-1); return; }
    else if (e.key === 'ArrowRight') { e.preventDefault(); searchEl.blur(); go(1); return; }
    // Fall through for Escape (close tab) and ArrowUp/Down (navigation/exit group)
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undoClose(); return; }

  if (e.key === 'ArrowDown' && viewMode === 'main' && filtered[active]?.type === 'group') {
    e.preventDefault(); enterGroup(filtered[active]); return;
  }
  if (e.key === 'ArrowUp' && viewMode === 'group') {
    e.preventDefault(); exitGroup(); return;
  }

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); go(-1); break;
    case 'ArrowRight': e.preventDefault(); go(1);  break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (filtered[active]?.type === 'group') enterGroup(filtered[active]);
      else openTab();
      break;
    case 'Escape':
      e.preventDefault();
      closeActiveTab();
      break;
    case '/': e.preventDefault(); searchEl.focus(); break;
  }
});

// ── Search / filter ───────────────────────────────────────────────────────────
// Returns a filtered copy of source using a pre-lowercased, trimmed query.
function applyFilterToSource(source, query) {
  return query
    ? source.filter(t =>
        t.type === 'group'
          ? t.title.toLowerCase().includes(query)
          : t.title.toLowerCase().includes(query) || t.domain.toLowerCase().includes(query))
    : [...source];
}

function applyFilter(q) {
  const query  = q.toLowerCase().trim();
  const source = viewMode === 'group' ? activeGroup.tabs : mainItems;
  filtered = applyFilterToSource(source, query);
  active = 0;
  buildCards();
}

let searchTimer = null;
searchEl.addEventListener('input', e => {
  const value = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (currentView === 'grid') renderGridView();
    else applyFilter(value);
  }, 150);
});

// ── Trackpad / mouse-wheel ────────────────────────────────────────────────────
let wheelLock = false;
document.addEventListener('wheel', e => {
  if (wheelLock || document.activeElement === searchEl) return;
  wheelLock = true;
  setTimeout(() => { wheelLock = false; }, 290);
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  go(delta > 0 ? 1 : -1);
}, { passive: true });

// ── Drag-to-close ─────────────────────────────────────────────────────────────
const DRAG_CLOSE = 85;
const drag = { on: false, idx: -1, x0: 0, y0: 0, base: null, moved: false };

function initDrag(e, idx) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const p    = e.touches ? e.touches[0] : e;
  drag.on    = true;
  drag.idx   = idx;
  drag.x0    = p.clientX;
  drag.y0    = p.clientY;
  drag.base  = getPos(idx - active);
  drag.moved = false;

  const item = filtered[idx];
  if (item?.id && tabsClosing.has(item.id)) {
    drag.on = false;
    return;
  }

  const card = cardEls[idx];
  card.style.transition = 'border-color 0.15s ease, box-shadow 0.15s ease';
  card.style.zIndex = '200';
}

function moveDrag(e) {
  if (!drag.on) return;
  const p  = e.touches ? e.touches[0] : e;
  const dx = p.clientX - drag.x0;
  const dy = p.clientY - drag.y0;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 4) drag.moved = true;
  if (!drag.moved) return;
  if (e.cancelable) e.preventDefault();

  const { tx, tz, ry, sc, op } = drag.base;
  const card = cardEls[drag.idx];

  card.style.transform = [
    `translateX(${tx + dx}px)`,
    `translateY(${dy}px)`,
    `translateZ(${tz}px)`,
    `rotateY(${ry + dx * 0.02}deg)`,
    `rotateZ(${dx * 0.012}deg)`,
    `scale(${sc})`,
  ].join(' ');

  card.style.opacity = op * (1 - Math.min(1, dist / DRAG_CLOSE) * 0.35);
  card.classList.toggle('will-close', dist >= DRAG_CLOSE);

  // Update physical reflection during drag
  updateReflect(card, sc, dy);
}

function endDrag(e) {
  if (!drag.on) return;
  drag.on = false;
  const p  = e.changedTouches ? e.changedTouches[0] : e;
  const dx = p.clientX - drag.x0;
  const dy = p.clientY - drag.y0;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const card = cardEls[drag.idx];
  card.classList.remove('will-close');

  if (drag.moved && dist >= DRAG_CLOSE) {
    poofClose(drag.idx, card, dx, dy);
  } else {
    card.style.zIndex     = '';
    card.style.transition = '';
    updatePositions();
  }
}

function poofClose(idx, card, dx, dy) {
  const tab = filtered[idx];
  if (!tab || tabsClosing.has(tab.id)) return;
  tabsClosing.add(tab.id);
  isAnimatingRemoval = true;

  const { tx, tz, ry, sc } = drag.base;

  card.style.transition = 'none';

  const startTime = performance.now();
  const duration  = 220;

  const animate = (now) => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const ease = t * (2 - t); // ease-out

    const curTx = (tx + dx) + (dx * 0.5) * ease;
    const curDy = (dy) + (dy * 0.5) * ease;
    const curS  = sc * (1 - ease * 0.95);
    const op    = 1 - t;

    card.style.transform = [
      `translateX(${curTx}px)`,
      `translateY(${curDy}px)`,
      `translateZ(${tz}px)`,
      `rotateY(${ry}deg)`,
      `rotateZ(${dx * 0.03 * ease}deg)`,
      `scale(${curS})`,
    ].join(' ');

    card.style.opacity = op;
    updateReflect(card, curS, curDy);

    if (t < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  setTimeout(() => {
    const currentIdx = filtered.findIndex(t => t.id === tab.id);
    if (currentIdx === -1) {
      releaseGuards(tab.id);
      return; // already removed by a concurrent close
    }

    const cardEl = cardEls[currentIdx];

    removeTabFromModels(tab, currentIdx);

    // Actually close the Chrome tab
    Promise.resolve(chrome.tabs.remove(tab.id)).catch(() => {});
    showUndoToast(tab.title);

    if (exitGroupIfEmpty(tab.id)) return;

    if (currentIdx < active)       active = active - 1;
    else if (currentIdx === active) active = Math.min(active, Math.max(0, filtered.length - 1));
    // idx > active: right-side deletion, centre card unaffected

    if (cardEl) {
      cardEl.remove();
      cardEls.splice(currentIdx, 1);
    }

    releaseGuards(tab.id);

    if (filtered.length === 0) {
      buildCards();
    } else {
      updatePositions();
    }
  }, 230);
}

document.addEventListener('mousemove', moveDrag);
document.addEventListener('mouseup',   endDrag);
document.addEventListener('touchmove', moveDrag, { passive: false });
document.addEventListener('touchend',  endDrag);

// ── Init: load real Chrome tabs + tab groups ──────────────────────────────────
// Selection state for multi-select (Task 6 wires bulk actions to it).
let gridSelection = new Set();

// Loaded tab list backing the grid (current window only).
let gridTabs = [];

// True while a grid close animation is running — defers the live-sync rebuild.
let gridAnimating = false;

// Grid organization prefs (persisted).
let gridGroupBy = localStorage.getItem('tabflow:groupBy') || 'window'; // 'window'|'domain'
let gridSort    = localStorage.getItem('tabflow:sort')    || 'recent'; // 'recent'|'oldest'|'name'

function applyControlState() {
  document.querySelectorAll('.ovg-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.group === gridGroupBy));
  const sortSel = document.getElementById('ovSort');
  if (sortSel) sortSel.value = gridSort;
}

async function renderGridView() {
  // Scoped to the current window, like Cover Flow — keeps the view simple.
  const [chromeTabs, groups] = await Promise.all([
    new Promise(r => chrome.tabs.query({ currentWindow: true }, r)),
    new Promise(r => chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, r)),
  ]);

  const selfUrl = chrome.runtime.getURL('newtab.html');
  gridTabs = chromeTabs
    .filter(t => t.url !== selfUrl)
    .map(chromeTabToTabItem);

  const now = Date.now();

  // Filter the cards shown; count + chips still reflect all the current window's tabs.
  const q = searchEl.value.toLowerCase().trim();
  const shown = q
    ? gridTabs.filter(t =>
        t.title.toLowerCase().includes(q) || t.domain.toLowerCase().includes(q))
    : gridTabs;
  const rows = buildGridRows(shown, groups, now, {
    ungroupedBy: gridGroupBy, sort: gridSort, currentWindowId,
  });

  const ctx = {
    onOpen:         id => focusTab(id),
    onClose:        id => closeGridTab(id),
    onCloseMany:    ids => closeGridTabs(ids),
    onToggleSelect: id => toggleGridSelect(id),
    isSelected:     id => gridSelection.has(id),
  };

  renderGrid(document.getElementById('gridScroll'), rows, ctx);
  updateOverviewHeader(gridTabs, now);
  applyControlState();
}

// Number of columns currently rendered in a flow (for up/down navigation).
function gridColumnCount() {
  const flow = document.querySelector('.grid-flow');
  if (!flow) return 1;
  const styles = getComputedStyle(flow);
  return styles.gridTemplateColumns.split(' ').length;
}

// Activate a tab (and focus its window) from the grid.
function focusTab(tabId) {
  const tab = gridTabs.find(t => t.id === tabId);
  // Tab may already be gone (stale card) — swallow the resulting rejection.
  Promise.resolve(chrome.tabs.update(tabId, { active: true })).catch(() => renderCurrentView());
  if (tab) Promise.resolve(chrome.windows.update(tab.windowId, { focused: true })).catch(() => {});
}

// Remember how many tabs the last grid close removed, so undo can restore them.
let lastGridClosedCount = 0;

function closeGridTab(tabId) {
  const scroll = document.getElementById('gridScroll');
  const closingEl = scroll && scroll.querySelector(`.grid-card[data-tab-id="${tabId}"]`);
  const remove = () => {
    lastGridClosedCount = 1;
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime.lastError; // ignore "no tab" if already gone
      gridSelection.delete(tabId);
      showUndoToast('1 tab');
    });
  };
  if (closingEl) animateGridClose(closingEl, remove);
  else remove();
}

// Poof the closing card out, then FLIP the remaining cards into their new spots.
function animateGridClose(closingEl, done) {
  const scroll = document.getElementById('gridScroll');
  const cards = [...scroll.querySelectorAll('.grid-card')];
  const first = new Map();
  cards.forEach(c => first.set(c, c.getBoundingClientRect()));

  gridAnimating = true;
  closingEl.style.pointerEvents = 'none';
  closingEl.classList.add('gc-closing');

  // After the poof, collapse the closed card's space and animate the rest in.
  setTimeout(() => {
    closingEl.style.display = 'none';
    const others = cards.filter(c => c !== closingEl);

    // INVERT: jump each moved card back to its old position (no transition).
    const moved = [];
    others.forEach(c => {
      const last = c.getBoundingClientRect();
      const f = first.get(c);
      const dx = f.left - last.left;
      const dy = f.top - last.top;
      if (dx || dy) {
        c.style.transition = 'none';
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        moved.push(c);
      }
    });

    // Force a reflow so the inverted positions are committed to the render tree.
    void scroll.offsetWidth;

    // PLAY: clear the offset with a transition → cards glide to their new spots.
    // Stagger by DOM order (cascades outward from the gap), capped so big grids
    // stay snappy.
    const STEP = 22, MAX_DELAY = 160, DUR = 300;
    moved.forEach((c, i) => {
      const delay = Math.min(i * STEP, MAX_DELAY);
      c.style.transition = `transform ${DUR}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;
      c.style.transform = '';
    });

    const maxDelay = moved.length ? Math.min((moved.length - 1) * STEP, MAX_DELAY) : 0;
    if (done) done();                 // actually close the tab now
    setTimeout(() => { gridAnimating = false; }, DUR + maxDelay + 40);
  }, 180);
}

function closeGridTabs(ids) {
  if (!ids.length) return;
  lastGridClosedCount = ids.length;
  chrome.tabs.remove(ids, () => {
    void chrome.runtime.lastError; // ignore "no tab" if any already gone
    ids.forEach(id => gridSelection.delete(id));
    showUndoToast(`${ids.length} tabs`);
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

// Dispatch rendering to the active view. Grid loads the current window; Cover Flow
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

document.getElementById('selClose').addEventListener('click', () => {
  closeGridTabs([...gridSelection]);
});
document.getElementById('selGroup').addEventListener('click', groupSelected);
document.getElementById('selClear').addEventListener('click', () => {
  gridSelection.clear();
  updateSelectBar();
  renderCurrentView();
});

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

async function init() {
  const [allChromeTabs, activeTabs, allGroups] = await Promise.all([
    new Promise(r => chrome.tabs.query({ currentWindow: true }, r)),
    new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r)),
    new Promise(r => chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, r)),
  ]);

  // Capture the window this TabFlow instance belongs to
  currentWindowId = activeTabs[0]?.windowId
    ?? (await new Promise(r => chrome.windows.getCurrent({}, w => r(w.id))));

  // Build allTabs and mainItems via the model layer
  ({ allTabs, mainItems } = buildAllModels(allChromeTabs, allGroups));

  // Reset to main view
  viewMode    = 'main';
  activeGroup = null;
  if (hintExitGroupEl) hintExitGroupEl.style.display = 'none';
  filtered = [...mainItems];

  // Calculate the middle for a symmetric starting view if possible
  const midPoint = Math.floor(mainItems.length / 2);

  // Centre on whichever tab (or its group card) is currently active in Chrome
  const currentTab = activeTabs[0];
  if (currentTab) {
    const idx = mainItems.findIndex(item =>
      item.type === 'tab'
        ? item.id === currentTab.id
        : item.tabs.some(t => t.id === currentTab.id)
    );
    // If we found the active tab, use it. Otherwise, default to the middle for symmetry.
    active = idx >= 0 ? idx : midPoint;
  } else {
    active = midPoint;
  }

  document.documentElement.setAttribute('data-view', currentView);
  document.querySelectorAll('.vt-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.mode === currentView));
  renderCurrentView();
}

// ── Live sync: re-fetch and rebuild when tabs change externally ────────────────
async function reloadTabs() {
  // In grid mode, just re-render the grid (it re-queries the current window itself).
  if (currentView === 'grid') {
    // Don't rebuild mid-animation — it would destroy the cards being animated.
    if (gridAnimating) {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reloadTabs, 150);
      return;
    }
    renderGridView();
    return;
  }

  // Don't rebuild while a close animation is running — buildCards() would destroy
  // the DOM element the rAF loop is writing to, making the animation invisible.
  // Defer until the animation completes (isAnimatingRemoval resets after ~880ms).
  if (isAnimatingRemoval) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadTabs, 300);
    return;
  }

  const seq          = reloadSeq;
  const focusedId    = filtered[active]?.id;
  const currentQuery = searchEl.value.toLowerCase().trim();

  const [freshChromeTabs, freshGroups] = await Promise.all([
    new Promise(r => chrome.tabs.query({ currentWindow: true }, r)),
    new Promise(r => chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, r)),
  ]);

  // A newer reload was scheduled while we were awaiting — discard this result
  if (seq !== reloadSeq) return;

  // A close animation may have started while the Chrome API calls were in flight.
  // Re-check here so we never call buildCards() mid-animation.
  if (isAnimatingRemoval) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadTabs, 300);
    return;
  }

  ({ allTabs, mainItems } = buildAllModels(freshChromeTabs, freshGroups));

  // If inside a group, refresh the group reference or fall back to main view
  if (viewMode === 'group') {
    const refreshedGroup = mainItems.find(item => item.type === 'group' && item.id === activeGroup.id);
    if (refreshedGroup) {
      activeGroup = refreshedGroup;
    } else {
      viewMode    = 'main';
      activeGroup = null;
      if (hintExitGroupEl) hintExitGroupEl.style.display = 'none';
    }
  }

  // Re-apply the active search filter without resetting the carousel position
  const source = viewMode === 'group' ? activeGroup.tabs : mainItems;
  filtered = applyFilterToSource(source, currentQuery);

  // Restore the previously focused item; clamp to end if it no longer exists
  const newIdx = filtered.findIndex(item => item.id === focusedId);
  active = newIdx >= 0 ? newIdx : Math.min(active, Math.max(0, filtered.length - 1));

  buildCards();
}

// ── Tab/group event listeners — debounced, scoped to this window ───────────────
let reloadTimer = null;
let reloadSeq   = 0;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadSeq++;
  reloadTimer = setTimeout(reloadTabs, 400);
}

// Tab events — only react to changes in this window
chrome.tabs.onCreated.addListener(tab => {
  if (tab.windowId === currentWindowId) scheduleReload();
});
chrome.tabs.onRemoved.addListener((_, removeInfo) => {
  if (removeInfo.windowId === currentWindowId) scheduleReload();
});
chrome.tabs.onUpdated.addListener((_, changeInfo, tab) => {
  if (tab.windowId === currentWindowId &&
      ('title' in changeInfo || 'favIconUrl' in changeInfo ||
       'groupId' in changeInfo || 'url' in changeInfo || 'audible' in changeInfo)) {
    scheduleReload();
  }
});
chrome.tabs.onMoved.addListener((_, moveInfo) => {
  if (moveInfo.windowId === currentWindowId) scheduleReload();
});
chrome.tabs.onAttached.addListener((_, attachInfo) => {
  if (attachInfo.newWindowId === currentWindowId) scheduleReload();
});
chrome.tabs.onDetached.addListener((_, detachInfo) => {
  if (detachInfo.oldWindowId === currentWindowId) scheduleReload();
});

// Group events — TabGroup objects include windowId, so we can scope these too
chrome.tabGroups.onCreated.addListener(group => {
  if (group.windowId === currentWindowId) scheduleReload();
});
chrome.tabGroups.onUpdated.addListener(group => {
  if (group.windowId === currentWindowId) scheduleReload();
});
chrome.tabGroups.onRemoved.addListener(group => {
  if (group.windowId === currentWindowId) scheduleReload();
});

init();
