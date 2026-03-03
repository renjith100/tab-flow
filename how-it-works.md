# How It Works — Full Technical Reference

This section is a maintainer's guide to the complete working of the extension: every file, every function, every timing constraint, and the key concurrency decisions.

---

## 1. Extension Entry Point

When the user clicks the TabFlow toolbar icon, Chrome fires `chrome.action.onClicked`. The **service worker** (`background.js`) handles this event.

```text
User clicks icon
      │
      ▼
background.js: chrome.action.onClicked
      │
      ├─ Is there already a TabFlow newtab.html open in this window?
      │      YES → chrome.tabs.update(existingTab, { active: true })   [focus it]
      │      NO  → chrome.tabs.create({ url: 'newtab.html' })           [open new]
```

**Why a new tab, not a popup?** A popup is tiny (max ~800×600px) and closes the moment it loses focus. A full tab gives the carousel all the screen space it needs and stays open so the user can take their time choosing.

**Per-window isolation:** Each Chrome window gets its own TabFlow tab. The check `chrome.tabs.query({ url, currentWindow: true })` scopes the search to the active window only.

---

## 2. Page Load & Script Order

`newtab.html` loads two scripts in strict order — order matters because `newtab.js` calls functions defined in `models.js`:

```html
<script src="models.js"></script>
<!-- data layer first -->
<script src="newtab.js"></script>
<!-- UI layer second  -->
```

Both are plain `<script src>` tags (not `type="module"`). This means all their declarations are globals on `window`, and `newtab.js` can call `buildAllModels()` and `getDomain()` which are defined in `models.js`.

**MV3 CSP rule:** Manifest V3 forbids inline `<script>` blocks in extension pages. All JavaScript must be in external `.js` files.

At the very bottom of `newtab.js`, `init()` is called directly — no `DOMContentLoaded` listener is needed because the script tag appears after all HTML elements.

---

## 3. Data Model Layer (`models.js`)

`models.js` is a pure data transformation layer. It has no DOM access and makes no Chrome API calls (the Chrome API is only used at module load time to read `chrome.runtime.getURL('newtab.html')` for self-filtering).

### Data shapes

**Tab item** (internal representation of a single Chrome tab):

```js
{
  type:       'tab',
  id:         Number,      // Chrome tab ID
  windowId:   Number,
  title:      String,
  domain:     String,      // extracted hostname, e.g. "github.com"
  url:        String,
  favIconUrl: String,
  groupId:    Number,      // -1 if not in a group
  audible:    Boolean,
}
```

**Group card** (internal representation of a Chrome tab group — appears as one carousel card):

```js
{
  type:  'group',
  id:    Number,           // Chrome tabGroup ID
  title: String,
  color: String,           // e.g. "blue", "red"
  tabs:  TabItem[],        // the tabs belonging to this group
}
```

### Build pipeline

```text
chrome.tabs.query()  →  chromeTabs[]
chrome.tabGroups.query()  →  chromeGroups[]
         │
         ▼
buildAllModels(chromeTabs, chromeGroups)
         │
         ├─ 1. chromeTabToTabItem()    map each Chrome tab → TabItem
         │       Filters out the TabFlow tab itself (SELF_URL)
         │
         ├─ 2. buildGroupCardMap()     map each Chrome group → GroupCard (empty tabs[])
         │
         ├─ 3. assignTabsToGroupCards() fill each GroupCard.tabs[] with its TabItems
         │
         └─ 4. buildOrderedMainItems() walk chromeTabs in Chrome's tab order:
                  - ungrouped tab  → push TabItem directly
                  - first tab of a group → push GroupCard (subsequent tabs of same group are skipped)
                  Returns mainItems[]
         │
         ▼
{ allTabs: TabItem[], mainItems: (TabItem | GroupCard)[] }
```

`allTabs` is the flat list of every individual tab (used for model cleanup when a tab is closed). `mainItems` is what the carousel shows at the top level.

---

## 4. Global State (`newtab.js`)

```js
let allTabs = []; // flat list of all tab objects
let mainItems = []; // top-level carousel items (tabs + group cards)
let filtered = []; // current carousel slice (= mainItems or a group's tabs)
let active = 0; // index into filtered[] — the card in the centre
let cardEls = []; // live DOM references, one per filtered[] entry
let viewMode = 'main'; // 'main' | 'group'
let activeGroup = null; // the group card currently being browsed (group mode only)
let currentWindowId = null; // Chrome window ID for the window this TabFlow runs in
let isAnimatingRemoval = false; // blocks a second close while one is in flight
let tabsClosing = new Set(); // tab IDs currently mid-animation (prevents re-close)
```

The relationship between these arrays at runtime:

```text
allTabs[]      — every individual tab in the window
    ▼ subset
mainItems[]    — top-level items: ungrouped tabs + one group card per group
    ▼ copy (or group.tabs copy)
filtered[]     — what's shown right now (may be subset if searching)
    ▼ parallel
cardEls[]      — DOM <div class="card"> elements, index-matched to filtered[]
```

`filtered[i]` and `cardEls[i]` are always the same index. They are rebuilt together by `buildCards()`.

---

## 5. Initialization Flow

```text
init()
  │
  ├─ Promise.all([
  │     chrome.tabs.query({ currentWindow: true })       → chromeTabs
  │     chrome.tabs.query({ active: true, ... })         → activeTabs
  │     chrome.tabGroups.query({ windowId: CURRENT })    → allGroups
  │  ])
  │
  ├─ currentWindowId ← activeTabs[0].windowId
  │
  ├─ buildAllModels(chromeTabs, allGroups) → { allTabs, mainItems }
  │
  ├─ filtered = [...mainItems]
  │
  ├─ Find the active Chrome tab in mainItems[]
  │    If found: active = that index
  │    If not found (e.g. it's a group tab): active = Math.floor(mainItems.length / 2)
  │
  └─ buildCards()
```

**Why centre on the active tab?** The user just came from that tab; it's the most likely one they want to switch away from. Centering on it also gives the most context (two cards visible on each side).

---

## 6. Cover Flow Rendering

### 6a. Position configuration — `POSITIONS[]`

The carousel is driven by a lookup table. Each entry describes how a card looks at a given distance from centre:

```js
const POSITIONS = [
    { tx: 0, tz: 0, ry: 0, sc: 1.0, op: 1.0, zi: 100 }, // centre (distance 0)
    { tx: 220, tz: -55, ry: 52, sc: 0.84, op: 0.88, zi: 90 }, // ±1
    { tx: 384, tz: -125, ry: 64, sc: 0.69, op: 0.62, zi: 80 }, // ±2
    { tx: 502, tz: -188, ry: 71, sc: 0.56, op: 0.38, zi: 70 }, // ±3
    { tx: 588, tz: -238, ry: 75, sc: 0.46, op: 0.16, zi: 60 }, // ±4+ (all further cards use this)
];
```

| Property | Meaning                                                                               |
| -------- | ------------------------------------------------------------------------------------- |
| `tx`     | Horizontal translate in px (applied with sign: negative for left, positive for right) |
| `tz`     | Z translate in px (always negative — pushes card away from viewer)                    |
| `ry`     | rotateY in degrees (applied with opposite sign: left cards tilt right-face-out)       |
| `sc`     | CSS scale                                                                             |
| `op`     | Opacity                                                                               |
| `zi`     | z-index (centre card always on top)                                                   |

`getPos(offset)` converts a signed offset from centre into a full transform spec, flipping the sign of `tx` and `ry` for left-side cards.

Cards beyond distance 4 get `opacity: 0` and `pointer-events: none` — they are hidden but not removed from the DOM.

### 6b. `buildCards()` — create DOM once

Called on init and after any structural change (search, group enter/exit, reload). Wipes `cardsEl.innerHTML` and `cardEls = []`, then builds one `<div class="card">` per `filtered[]` entry. Event listeners are attached here.

After building, it calls `updatePositions({ instant: true })` which applies all transforms with `transition: none` so cards appear at their correct positions without animating in from (0, 0).

**The instant trick:**

```js
if (instant) card.style.transition = 'none';
card.style.transform = '...'; // set target position
if (instant) {
    card.offsetHeight; // force browser to flush/reflow
    card.style.transition = ''; // restore transition for future moves
}
```

The `card.offsetHeight` read forces a synchronous reflow, committing the "no-transition" frame before the transition is re-enabled. Without this, the browser might batch the style writes and animate from nothing.

### 6c. `updatePositions()` — animate to new positions

Called on every navigation, filter change, or after a close. Iterates `cardEls[]`, computes `offset = i - active` for each, looks up the transform, and writes it to `card.style`. CSS's `transition` property on `.card` (400ms ease-out-expo) does the interpolation automatically.

```text
updatePositions()
  │
  ├─ Update #cur / #tot counter display
  ├─ Update #detail strip (title · domain, or group breadcrumb)
  │
  └─ forEach cardEls[i]:
       skip if tabsClosing.has(filtered[i].id)     ← don't interfere with mid-animation cards
       offset = i - active
       { tx, tz, ry, sc, op, zi } = getPos(offset)
       card.style.transform = translateX(tx) translateZ(tz) rotateY(ry) scale(sc)
       card.style.opacity   = op
       card.style.zIndex    = zi
       card.classList.toggle('is-active', i === active)
       updateReflect(card, sc, 0, far)
```

### 6d. The reflection — `updateReflect()`

Cards have a `-webkit-box-reflect: below` mirror effect. The problem: the reflection is applied in the card's _local_ coordinate space, but we want it to appear anchored to a shared "shelf" in world space regardless of each card's scale and Z position.

The formula corrects for CSS scale:

```js
// Card height H=224px, gap to shelf G=24px
const offset = ((248 - 2 * dy) / sc - 224).toFixed(1);
card.style.webkitBoxReflect = `below ${offset}px linear-gradient(...)`;
```

During close animations (where `dy` changes every frame), `updateReflect` is called inside the `requestAnimationFrame` loop so the reflection stays physically correct as the card moves.

---

## 7. Navigation

### `go(dir)`

```js
function go(dir) {
    active = Math.max(0, Math.min(filtered.length - 1, active + dir));
    updatePositions();
}
```

Clamps `active` to valid bounds and re-renders. `dir` is `+1` (right arrow) or `-1` (left arrow).

### `openTab()`

```js
function openTab() {
    const tab = filtered[active];
    cardEls[active].classList.add('flash'); // violet glow pulse (CSS animation)
    setTimeout(() => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
    }, 160); // 160ms flash before switching
}
```

The `flash` class triggers `@keyframes openFlash` — a brief violet glow pulse so the user has visual confirmation before the tab switches.

### Trackpad / wheel navigation

```js
let wheelLock = false;
document.addEventListener('wheel', (e) => {
    if (wheelLock) return;
    wheelLock = true;
    setTimeout(() => {
        wheelLock = false;
    }, 290); // 290ms debounce
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    go(delta > 0 ? 1 : -1);
});
```

A single trackpad swipe fires many `wheel` events. The 290ms `wheelLock` debounce converts the burst of events into a single `go()` call. Horizontal scrolling (`deltaX`) is preferred over vertical (`deltaY`) so a two-finger horizontal swipe navigates correctly even on magic trackpads that generate both axes.

---

## 8. Tab Group Navigation

### State when in group mode

```text
viewMode = 'group'
activeGroup = <the GroupCard item>
filtered = [...activeGroup.tabs]    ← a copy of the group's tab array
```

### `enterGroup(group)`

```text
enterGroup(group)
  │
  ├─ viewMode    = 'group'
  ├─ activeGroup = group
  ├─ filtered    = [...group.tabs]
  ├─ active      = 0
  ├─ show hintExitGroup hint
  └─ buildCards()                   ← full DOM rebuild for the group's tabs
```

### `exitGroup()`

```text
exitGroup()
  │
  ├─ Find the group card's index in mainItems[]
  ├─ viewMode    = 'main'
  ├─ activeGroup = null
  ├─ filtered    = [...mainItems]
  ├─ active      = groupIdx (return carousel to the group card)
  ├─ hide hintExitGroup hint
  └─ buildCards()
```

---

## 9. Search & Filter

Pressing `/` focuses the search `<input>`. Typing is debounced 150ms before calling `applyFilter()`.

```text
searchEl 'input' event
  │
  ├─ clearTimeout(searchTimer)
  └─ searchTimer = setTimeout(() => applyFilter(value), 150)
```text
applyFilter(q)
  │
  ├─ source = viewMode === 'group' ? activeGroup.tabs : mainItems
  ├─ filtered = applyFilterToSource(source, q)
  ├─ active = 0
  └─ buildCards()
```text
applyFilterToSource(source, query)
  │
  └─ Returns source items where:
       tab:   title or domain includes query
       group: group title includes query
```

Search is **scoped to the current context**: when inside a group it only searches that group's tabs. Pressing `Esc` inside the search box clears the filter and blurs the input (it does **not** close a tab).

---

## 10. Tab Close Flows

There are two ways to close a tab: pressing Escape (keyboard) and drag-to-close (mouse/touch). Both share the same cleanup function (`removeTabFromModels`) and the same concurrency guard (`isAnimatingRemoval`).

### Concurrency guards

| Guard                | Purpose                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isAnimatingRemoval` | Boolean — blocks a second Escape close while one is animating. Set `true` at close start, `false` in the cleanup timeout.                                            |
| `tabsClosing`        | Set of tab IDs — prevents `updatePositions()` from writing transforms to cards that are mid-close-animation. Also prevents drag starting on an already-closing card. |

### 10a. Escape key close — `closeActiveTab()`

Full timing breakdown:

```text
t = 0ms     closeActiveTab() called
              isAnimatingRemoval = true
              tabsClosing.add(item.id)
              card.classList.add('will-close')    ← red glow border
              │
              ├── setTimeout(..., 120ms)
              │
t = 120ms   Animation starts (transition: none on card so rAF owns it fully)
              requestAnimationFrame(animate) starts
              │
              │   rAF loop runs every ~16ms for 750ms
              │   Piecewise easing:
              │     0%  → 30%: hover-up   (slow rise, slight right drift)
              │     30% → 52%: arc start  (gaining height and rotation)
              │     52% → 70%: arc peak   (rapid height gain)
              │     70% → 85%: fade out   (continues arc, opacity drops)
              │     85% → 100%: final exit (card nearly invisible)
              │
              ├── setTimeout(..., 120 + 760 = 880ms)
              │
t = 880ms   Cleanup:
              removeTabFromModels(item, currentIdx)    ← update allTabs, mainItems, filtered
              chrome.tabs.remove(item.id)              ← actually close the Chrome tab
              showUndoToast(item.title)
              cardEl.remove()                          ← remove from DOM
              cardEls.splice(currentIdx, 1)            ← remove from array
              tabsClosing.delete(item.id)
              isAnimatingRemoval = false
              updatePositions()                        ← remaining cards slide to fill gap
```

The piecewise animation keyframes replicated in JS:

```text
 Time  │  translateX  │  translateY  │  rotateZ  │  scale  │  opacity
──────────────────────────────────────────────────────────────────────
  0%   │    0 px      │    0 px      │   0°      │  1.00   │  1.00
 30%   │    8 px      │  -105 px     │   1°      │  0.90   │  0.95
 52%   │   36 px      │  -192 px     │   3°      │  0.75   │  0.80
 70%   │  110 px      │  -258 px     │   5.5°    │  0.58   │  0.55
 85%   │  220 px      │  -310 px     │   7.5°    │  0.40   │  0.25
100%   │  315 px      │  -332 px     │   9°      │  0.27   │  0.00
```

**Why rAF instead of CSS `@keyframes`?** The reflection (`-webkit-box-reflect`) must be updated every frame to track the card's Y position. CSS animations can't drive JS side-effects, so the whole animation runs in a `requestAnimationFrame` loop.

### 10b. Drag-to-close — `initDrag / moveDrag / endDrag / poofClose`

```text
mousedown / touchstart on a card
  │
  initDrag(e, idx)
    ├─ Records: drag.x0, drag.y0, drag.base (card's current position config)
    ├─ drag.idx = idx, drag.on = true, drag.moved = false
    └─ card.style.transition = 'none'   ← removes CSS transition so drag feels direct

mousemove / touchmove
  │
  moveDrag(e)
    ├─ dx = clientX - x0,  dy = clientY - y0
    ├─ dist = √(dx²+dy²)
    ├─ If dist > 4px: drag.moved = true   (suppresses accidental click on mouseup)
    ├─ card.style.transform = base position + (dx, dy) offset + slight rotateZ
    ├─ card.style.opacity = base opacity × (1 - dist/DRAG_CLOSE × 0.35)
    └─ card.classList.toggle('will-close', dist >= 85)   ← red glow at threshold

mouseup / touchend
  │
  endDrag(e)
    ├─ dist < 85px OR not moved → restore card position (updatePositions)
    └─ dist >= 85px AND moved   → poofClose(idx, card, dx, dy)

```text
poofClose(idx, card, dx, dy)
  │
  ├─ tabsClosing.add(tab.id), isAnimatingRemoval = true
  ├─ requestAnimationFrame(animate) — 220ms ease-out fling in release direction
  │      curTx = (base.tx + dx) + dx×0.5×ease   (continues in throw direction)
  │      curDy = dy + dy×0.5×ease
  │      scale → 0 (card shrinks to nothing)
  │      opacity → 0
  │
  └─ setTimeout(cleanup, 230ms)
       removeTabFromModels(), chrome.tabs.remove(), showUndoToast()
       cardEl.remove(), cardEls.splice(), tabsClosing.delete()
       isAnimatingRemoval = false
       updatePositions()
```

`DRAG_CLOSE = 85` — the pixel threshold at which release triggers a close (rather than snapping back).

---

## 11. Model Cleanup — `removeTabFromModels()`

Called by both close paths. Keeps `filtered`, `allTabs`, `mainItems`, and each group's `.tabs[]` in sync:

```text
removeTabFromModels(tab, filteredIdx)
  │
  ├─ filtered.splice(filteredIdx, 1)
  │
  ├─ allTabs.splice(allTabs.findIndex(t => t.id === tab.id), 1)
  │
  └─ if tab.groupId !== -1:
       groupCard = mainItems.find(group with tab.groupId)
       groupCard.tabs.splice(...)
       if groupCard.tabs.length === 0:
         mainItems.splice(mainItems.indexOf(groupCard), 1)   ← remove empty group card
     else:
       mainItems.splice(mainItems.findIndex(tab), 1)
```

---

## 12. Live Sync — `reloadTabs()` and `scheduleReload()`

Chrome fires tab lifecycle events (`onCreated`, `onRemoved`, `onUpdated`, etc.) whenever anything changes — even if TabFlow itself caused the change. TabFlow subscribes to these to stay in sync when tabs change externally (e.g. the user closes a tab in another window, or a tab title changes).

### Debounce mechanism

```js
let reloadTimer = null;
let reloadSeq = 0;

function scheduleReload() {
    clearTimeout(reloadTimer); // cancel any pending reload
    reloadSeq++; // invalidate any in-flight reload
    reloadTimer = setTimeout(reloadTabs, 400); // debounce: wait for burst to settle
}
```

`reloadSeq` is a monotonically-increasing counter. Each `reloadTabs()` call captures `seq = reloadSeq` at the start. After the async Chrome API await, if `seq !== reloadSeq` it means a newer reload was scheduled while this one was waiting — so this one discards its results and exits. This prevents a slow response from overwriting a newer state.

### `reloadTabs()` flow

```text
reloadTabs()
  │
  ├─ GUARD: if isAnimatingRemoval → defer (clearTimeout + setTimeout(reloadTabs, 300))
  │          RETURN                 (don't rebuild DOM mid-animation)
  │
  ├─ seq = reloadSeq
  ├─ focusedId = filtered[active]?.id    (remember which item was selected)
  │
  ├─ await Promise.all([chrome.tabs.query(...), chrome.tabGroups.query(...)])
  │
  ├─ if seq !== reloadSeq → RETURN  (stale — a newer reload supersedes us)
  │
  ├─ buildAllModels(freshTabs, freshGroups) → { allTabs, mainItems }
  │
  ├─ if viewMode === 'group':
  │     try to find the same group in new mainItems
  │     if not found: fall back to main view
  │
  ├─ filtered = applyFilterToSource(source, currentQuery)   (re-apply search)
  │
  ├─ Restore active index: find focusedId in new filtered[], else clamp to end
  │
  └─ buildCards()
```

### The animation race condition (fixed)

Without the `isAnimatingRemoval` guard at the top of `reloadTabs()`, this sequence caused invisible animations:

```text
t=0      Escape #1 → closeActiveTab()  (isAnimatingRemoval=true, card element captured)
t=880    Cleanup: chrome.tabs.remove(tab1) → fires onRemoved → scheduleReload() [timer: t+400]
t=900    Escape #2 → closeActiveTab()  (new card captured in closure)
t=1280   reloadTabs() fires → buildCards() → cardsEl.innerHTML = ''
         ▲ DESTROYS THE DOM ELEMENT Escape #2's rAF loop is writing to!
         The animation continues updating a detached, invisible element.
t=1780   Escape #2 cleanup runs normally, but the animation was never visible.
```

The fix defers `reloadTabs()` if `isAnimatingRemoval` is true:

```js
if (isAnimatingRemoval) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadTabs, 300); // retry in 300ms
    return;
}
```

After the animation completes at t=880ms, `isAnimatingRemoval` becomes `false`. The next deferred call to `reloadTabs()` (at ~t=1180ms) succeeds and rebuilds the DOM cleanly.

```text
t=0      Escape #1 → isAnimatingRemoval=true
t=880    Cleanup: isAnimatingRemoval=false; chrome.tabs.remove(tab1); scheduleReload() [t+400]
t=900    Escape #2 → isAnimatingRemoval=true; animation starts on live card ✓
t=1280   reloadTabs() fires → sees isAnimatingRemoval=true → defer to t=1580
t=1580   reloadTabs() fires → sees isAnimatingRemoval=true → defer to t=1880
t=1780   Escape #2 cleanup: isAnimatingRemoval=false; card removed; updatePositions()
t=1880   reloadTabs() fires → isAnimatingRemoval=false → rebuilds from Chrome APIs ✓
```

---

## 13. Undo Toast

```text
showUndoToast(title)
  │
  ├─ Updates #toastLabel text
  ├─ toastEl.classList.add('show')   ← CSS transition slides toast up from below
  └─ clearTimeout(toastTimer)
     toastTimer = setTimeout(hideUndoToast, 4000)

hideUndoToast()
  └─ toastEl.classList.remove('show')   ← slides back down

undoClose()   (⌘Z or Undo button click)
  │
  ├─ hideUndoToast()
  ├─ chrome.sessions.getRecentlyClosed({ maxResults: 1 })
  ├─ sessionId = entry.tab?.sessionId || entry.window?.sessionId
  ├─ chrome.sessions.restore(sessionId)
  └─ init()    ← full reload so the restored tab appears in the carousel
```

---

## 14. Favicon Resolution — `favUrl(tab)`

```text
favUrl(tab)
  │
  ├─ tab.favIconUrl starts with 'http'?
  │      YES → use it directly  (Chrome provides this for most pages)
  │      NO  →
  │           domain = getDomain(tab.url)
  │           domain is valid (not 'chrome')?
  │                YES → https://www.google.com/s2/favicons?domain=X&sz=128
  │                NO  → return null  (fallback letter avatar will be used)
```

If an `<img>` fails to load (`onerror`), it is replaced with a fallback `<div>` showing the first letter of the domain on a dark background.

---

## 15. CSS Architecture

**Layout:** The `.cards` element is `position: absolute; left: 50%; width: 0`. Cards are absolutely positioned children with `left: calc(var(--card-w) / -2)` to centre themselves on this zero-width anchor. All horizontal spread is done purely via `translateX` in JS — the DOM layout is always centred.

**3D stage:** `.stage-wrap` has `perspective: 1100px`. `.cards` has `transform-style: preserve-3d`. This establishes a shared 3D context so all cards participate in the same perspective projection.

**Card transition:** `transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ...`. The `cubic-bezier(0.22, 1, 0.36, 1)` is an ease-out-expo approximation — fast initial movement that decelerates to a natural stop, matching the feel of real Cover Flow.

**`will-change: transform, opacity`** on `.card` hints to the compositor to promote cards to their own GPU layers, enabling hardware-accelerated animation.

**Reflection math:** During close animations the card's Y position changes every frame. The reflection offset must be recalculated on each frame using:

```text
offset = ((cardH + gap - 2×dy) / scale) - cardH
       = ((248 - 2×dy) / sc) - 224
```

This keeps the reflected image anchored to the "shelf" line regardless of how far the card has floated upward.

---

## 16. Complete Function Reference

| Function                                                  | File            | Purpose                                                                      |
| --------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `chrome.action.onClicked` listener                        | `background.js` | Opens or focuses the TabFlow newtab                                          |
| `chromeTabToTabItem(chromeTab)`                           | `models.js`     | Chrome tab → internal TabItem shape                                          |
| `buildGroupCardMap(chromeGroups)`                         | `models.js`     | Chrome groups → `{ id: GroupCard }` map                                      |
| `assignTabsToGroupCards(tabItems, groupCards)`            | `models.js`     | Populates each GroupCard's `.tabs[]`                                         |
| `buildOrderedMainItems(chromeTabs, tabItems, groupCards)` | `models.js`     | Ordered top-level carousel items                                             |
| `buildAllModels(chromeTabs, chromeGroups)`                | `models.js`     | Entry point — returns `{ allTabs, mainItems }`                               |
| `getDomain(url)`                                          | `newtab.js`     | Extracts clean hostname from a URL                                           |
| `favUrl(tab)`                                             | `newtab.js`     | Resolves the best favicon URL for a tab                                      |
| `getPos(offset)`                                          | `newtab.js`     | Looks up POSITIONS[] for a signed distance from centre                       |
| `updateReflect(card, sc, dy, far)`                        | `newtab.js`     | Sets `-webkit-box-reflect` with physics-correct offset                       |
| `buildCards()`                                            | `newtab.js`     | Wipes and rebuilds all card DOM elements                                     |
| `makeFallback(domain)`                                    | `newtab.js`     | Creates a letter-avatar fallback div for tabs                                |
| `makeGroupFallback(domain)`                               | `newtab.js`     | Creates a letter-avatar fallback for group cluster tiles                     |
| `updatePositions({ instant })`                            | `newtab.js`     | Applies 3D transforms to all cards; updates counter and detail strip         |
| `go(dir)`                                                 | `newtab.js`     | Moves `active` by ±1 and re-renders                                          |
| `openTab()`                                               | `newtab.js`     | Flashes active card, then switches Chrome to that tab                        |
| `removeTabFromModels(tab, filteredIdx)`                   | `newtab.js`     | Removes tab from all model arrays (filtered, allTabs, mainItems, group.tabs) |
| `closeActiveTab()`                                        | `newtab.js`     | Escape-key close: red glow → arc-out animation → cleanup                     |
| `enterGroup(group)`                                       | `newtab.js`     | Switches to group view for a GroupCard                                       |
| `exitGroup()`                                             | `newtab.js`     | Returns to main view from group view                                         |
| `showUndoToast(title)`                                    | `newtab.js`     | Shows the undo toast for 4s                                                  |
| `hideUndoToast()`                                         | `newtab.js`     | Hides the undo toast                                                         |
| `undoClose()`                                             | `newtab.js`     | Restores the last closed tab via `chrome.sessions`                           |
| `applyFilterToSource(source, query)`                      | `newtab.js`     | Pure filter — returns matching subset of a source array                      |
| `applyFilter(q)`                                          | `newtab.js`     | Applies search to current view and rebuilds                                  |
| `initDrag(e, idx)`                                        | `newtab.js`     | Starts a drag-to-close gesture                                               |
| `moveDrag(e)`                                             | `newtab.js`     | Updates card position during drag; shows red glow at threshold               |
| `endDrag(e)`                                              | `newtab.js`     | Commits or cancels drag on mouse/touch release                               |
| `poofClose(idx, card, dx, dy)`                            | `newtab.js`     | Flings card in throw direction, then removes tab                             |
| `init()`                                                  | `newtab.js`     | Fetches all tabs/groups from Chrome, centres carousel, builds UI             |
| `reloadTabs()`                                            | `newtab.js`     | Re-fetches from Chrome and rebuilds (deferred if animation in progress)      |
| `scheduleReload()`                                        | `newtab.js`     | Debounced entry point for live sync; increments `reloadSeq`                  |

---

## 17. Event Listener Summary

| Event                        | Source       | Handler          | Purpose                         |
| ---------------------------- | ------------ | ---------------- | ------------------------------- |
| `keydown`                    | `document`   | inline switch    | Arrow keys, Enter, Esc, `/`, ⌘Z |
| `wheel`                      | `document`   | inline           | Trackpad swipe → navigate       |
| `mousedown`                  | card         | `initDrag`       | Start drag-to-close             |
| `touchstart`                 | card         | `initDrag`       | Start drag-to-close (touch)     |
| `mousemove`                  | `document`   | `moveDrag`       | Update card during drag         |
| `mouseup`                    | `document`   | `endDrag`        | Commit or cancel drag           |
| `touchmove`                  | `document`   | `moveDrag`       | Update card during touch drag   |
| `touchend`                   | `document`   | `endDrag`        | Commit or cancel touch drag     |
| `click`                      | card         | inline           | Navigate to card or open tab    |
| `input`                      | `#search`    | debounced        | Apply search filter             |
| `click`                      | `#toastUndo` | `undoClose`      | Restore closed tab              |
| `chrome.tabs.onCreated`      | Chrome       | `scheduleReload` | New tab appeared                |
| `chrome.tabs.onRemoved`      | Chrome       | `scheduleReload` | Tab was closed externally       |
| `chrome.tabs.onUpdated`      | Chrome       | `scheduleReload` | Tab title/favicon/URL changed   |
| `chrome.tabs.onMoved`        | Chrome       | `scheduleReload` | Tab reordered                   |
| `chrome.tabs.onAttached`     | Chrome       | `scheduleReload` | Tab moved into this window      |
| `chrome.tabs.onDetached`     | Chrome       | `scheduleReload` | Tab moved out of this window    |
| `chrome.tabGroups.onCreated` | Chrome       | `scheduleReload` | New tab group                   |
| `chrome.tabGroups.onUpdated` | Chrome       | `scheduleReload` | Group renamed/recolored         |
| `chrome.tabGroups.onRemoved` | Chrome       | `scheduleReload` | Group disbanded                 |

All Chrome tab/group events are **scoped to `currentWindowId`** — TabFlow only reacts to changes in the same window it belongs to.

---
