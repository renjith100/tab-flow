# Filter & Group-Transition Animations — Design

## Problem

The carousel rebuilds cards from scratch (`cardsEl.innerHTML = ''` in `buildCards`) on every search filter change and on every group enter/exit. The result feels abrupt — cards that should be "leaving" simply vanish, surviving cards jump to their new positions, and entering cards appear without any preamble.

## Goal

Make the two transitions feel natural:

1. **Filter:** non-matching cards fade and shrink in place; surviving cards smoothly slide to their new Cover Flow positions; newly matching cards fade and scale in (e.g. when the user backspaces).
2. **Group enter/exit:** the carousel cross-fades from the old set to the new set so the wholesale content swap doesn't snap.

## Non-goals

- No changes to carousel physics: `POSITIONS`, transforms, perspective, or `updateReflect`.
- No changes to drag-to-close, the close-tab arc animation, undo toast, or keyboard handling.
- No changes to filtering logic itself (`applyFilterToSource`).
- No new dependencies. Plain DOM, plain CSS transitions.

## Files touched

- `newtab.js` — refactor to extract per-card creation, add diff-based filter path, add cross-fade for group transitions.
- `newtab.css` — one small class for leavers (`.card.is-leaving`).
- No HTML changes.

## Design

### Architecture

Two animation paths because the two cases are fundamentally different:

| Case | Path | Why |
|---|---|---|
| Filter (search input) | Diff-based — keep surviving DOM, animate leavers out, fade enterers in. | Most cards survive; in-place transitions feel natural. |
| Group enter/exit | Cross-fade — fade `.cards` container, swap content, fade back. | Wholesale content swap; a diff would produce a chaotic pile of overlapping fades. |

Both paths reuse the existing `.card` CSS transition (`transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s …`) — no new keyframes, no `!important`.

### Refactor: extract `createCardElement(item)`

The body of the `forEach` inside `buildCards()` (newtab.js:116–248) becomes a standalone helper:

```
createCardElement(item) → HTMLElement
```

It takes a single item (tab or group), builds the DOM (favicon ring or favicon cluster, title, domain or count, audio bar if applicable, click + drag handlers), tags the result with `card.dataset.key = String(item.id)`, and returns the element. The function does **not** assign anything to `cardEls` and does **not** append to the DOM — both responsibilities move to the caller.

`buildCards()` then becomes the thin wholesale-rebuild path:

```
buildCards():
  cardsEl.innerHTML = ''
  cardEls = []
  if (filtered.length === 0) { show empty state; return }
  hide empty state
  for each item in filtered:
    card = createCardElement(item)
    cardEls.push(card)
    cardsEl.appendChild(card)
  updatePositions()
```

### Filter path: `applyFilterDiff(newFiltered)`

Replaces the `buildCards()` call inside `applyFilter`. Accepts the already-computed new filtered array.

**State tracked alongside `cardEls`:**
```
leavingByKey: Map<key, { card, timer }>
```
Cards in flight to be removed. Used to cancel re-removal when a backspace re-matches.

**Algorithm:**

1. Build `oldByKey` from current `cardEls` and `filtered`.
2. Walk `newFiltered`:
   - If `leavingByKey` has the key: cancel the timer, remove `is-leaving` class, push card into `newCardEls`, delete from `leavingByKey`.
   - Else if `oldByKey` has the key: pop from map, push into `newCardEls`.
   - Else: `card = createCardElement(item)`, set inline `opacity: 0; transform: scale(0.6)`, append to `cardsEl`, push into `newCardEls`.
3. Whatever remains in `oldByKey` is leaving:
   - Add `is-leaving` class.
   - Set inline `opacity: 0` and append ` scale(0.5)` to the existing `transform`.
   - Schedule `card.remove()` after 280ms; store `{card, timer}` in `leavingByKey`. The timer's cleanup also deletes the entry from `leavingByKey` after removal.
4. Assign `cardEls = newCardEls`, `filtered = newFiltered`, `active = 0`.
5. Force reflow: `cardsEl.offsetHeight`. Required so enterers' initial `opacity:0 / scale:0.6` is committed before `updatePositions` overwrites those properties.
6. Call `updatePositions()`. The existing `.card` CSS transition animates survivors to their new positions and enterers from their seed values to their target transform + opacity.

### Group path: `crossFade(swapFn)`

A small helper used by `enterGroup` and `exitGroup`:

```
crossFade(swapFn):
  cardsEl.style.transition = 'opacity 0.18s ease'
  cardsEl.style.opacity = '0'
  setTimeout(() => {
    swapFn()              // mutates filtered/active and calls buildCards()
    cardsEl.style.opacity = '1'
  }, 180)
```

`enterGroup` and `exitGroup` wrap their existing bodies:

```
enterGroup(group):
  crossFade(() => {
    viewMode = 'group'
    activeGroup = group
    filtered = [...group.tabs]
    active = 0
    if (hintExitGroupEl) hintExitGroupEl.style.display = ''
    buildCards()
  })
```

The container fades out (~180ms), the swap happens, the new content fades in (~180ms). Total perceived duration ~360ms, comparable to the filter animation, so the two transitions feel like the same family.

### CSS additions

```css
.card.is-leaving {
  pointer-events: none;
  z-index: 0;
}
```

That's the only new rule. The fade-and-shrink visual is driven by inline `opacity: 0` + appended `scale(0.5)`, and the existing `.card` transition animates them. `pointer-events: none` keeps a leaving card from intercepting clicks; `z-index: 0` keeps it from covering the surviving cards behind it during the fade.

No `!important`, no new keyframes, no transition overrides.

## Edge cases

- **Re-match while leaving:** handled via `leavingByKey` cancel-and-restore (see filter algorithm step 2). Prevents a leaver fading out next to a duplicate enterer fading in.
- **Active card filtered out:** already handled — `applyFilter` sets `active = 0`. The diff path preserves that. The previously-active card becomes a leaver and animates out; the new index-0 card becomes active.
- **Empty filtered result:** all current cards become leavers; no enterers. After the diff, `cardEls` is empty, `filtered` is empty, and the existing `buildCards` empty-state branch is **not** what runs (the diff path doesn't go through `buildCards`). Need to explicitly show the empty state inside `applyFilterDiff` when `newFiltered.length === 0`. Conversely, when going from empty back to non-empty, the diff path needs to hide the empty state.
- **Rapid typing (debounced 150ms):** debouncing means a single diff per typing burst, not per keystroke. Within a single diff, in-flight leavers are properly handled.
- **Filter while dragging:** drag is short-lived (mouseup ends it). The drag handler does not check filter state; if a user drags a card and somehow the search input changes during the drag, the dragged card might end up as a leaver. Acceptable — this is not a realistic scenario and the existing code does not handle it either. Not introducing a regression.

## Verification

After implementing, reload the unpacked extension and confirm by hand:

1. **Filter — leavers + survivors:** open with many tabs, type a partial query that filters out most. Non-matching cards fade and shrink in place; surviving cards smoothly slide to their new Cover Flow positions in one continuous motion. No abrupt snap.
2. **Filter — enterers:** clear the search bar (or backspace). Previously-hidden cards fade and scale up into their positions; surviving cards slide back to their original positions.
3. **Re-match cancel:** type two characters fast, then immediately delete one. No visible duplicate cards momentarily co-existing — the same card stays in place.
4. **Group enter:** click into a tab group. The carousel fades out then back in with the group's tabs. No snap.
5. **Group exit:** press `↑` to exit. Same cross-fade in reverse.
6. **Empty state:** type a no-match string. Cards animate out; "No tabs match" appears. Backspace until matches return; cards animate back in.
7. **Carousel physics intact:** `← →` navigation, `Enter` open-flash, drag-to-close, `Escape`-close — none should change behavior.

## Risks

- **Performance with many tabs:** the diff is O(n); leaver/enterer counts are bounded by the user's typing. Should comfortably handle a few hundred tabs.
- **Animation timing mismatch:** chosen 280ms leaver removal vs 400ms `.card` transition. Visual exit feels complete around 280ms (opacity reaches 0); the timer just needs to clean up the DOM after that. If exit feels truncated, raise to 350ms.
- **`leavingByKey` leaks:** if a leaver's timer never fires (e.g. tab is closed mid-animation), the entry should still be cleaned up. The timer callback always deletes the entry — no leak.
- **Cross-fade hides the active state momentarily:** during a 180ms blackout the user sees nothing. Acceptable given group transitions are intentional, deliberate user actions (not high-frequency).
