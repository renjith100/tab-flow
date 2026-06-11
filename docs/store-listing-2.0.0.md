# Chrome Web Store listing — TabFlow 2.0.0

Paste these into the Developer Dashboard. Nothing here ships in the extension; it's copy for the store page.

---

## Short description (max 132 chars)

> Bring your tab count down — see every tab at a glance, spot stale ones and duplicates, and close the clutter in one click.

**Note:** the Web Store summary is read from `manifest.json`'s
`description` field, not editable in the dashboard — already updated there,
ships with the 2.0.0 zip.

---

## Detailed description

**TabFlow has one goal: fewer open tabs.**

Tabs pile up because you can't see them. TabFlow shows every tab in your window as a card — with how long it's been since you last touched it — so closing stops being a chore: one click closes a tab, one click clears a whole section, one chip sweeps away everything stale or duplicated. The toolbar badge counts your tabs and turns amber, then red, as they pile up. Watching it drop back down is the whole point.

And when you're switching instead of cleaning, the same page doubles as a fast visual tab switcher — including the classic 3D Cover Flow carousel.

**Close with confidence**
• A relative-age pill on every card — bright green when fresh, fading toward red when a tab's been untouched 7+ days — so you can see what's safe to close
• One-click triage chips: "Close all stale" and "Merge duplicates"
• Close any tab with one click — or clear a whole group/section at once
• Undo (⌘Z / Ctrl+Z) brings back closed tabs — including bulk closes — so cleaning up is risk-free
• A live tab-count badge on the toolbar icon: amber, then red, as tabs pile up — a gentle nudge to clean house

**See everything at a glance**
• Every tab as a card in the Overview grid, organized into sections — your Chrome tab groups, with loose tabs first
• Group loose tabs by window or by domain; sort by most-recent, oldest, or name
• Tabs playing audio show an animated sound bar, so you can find (or mute) them
• Type "/" to filter the grid as you type

**Switch fast**
• Click any card to jump to that tab
• Or flip to the full-page 3D Cover Flow carousel — tab groups as stacked cards, drag a card aside to close it with a poof

**Everywhere**
• Keyboard-first: arrows to move, "/" to search, Enter to switch, Esc/Delete to close
• Private by design: no accounts, no analytics, nothing leaves your machine

Default shortcut: ⌘⇧. (Mac) / Ctrl+Shift+. (Windows/Linux) — change it at chrome://extensions/shortcuts

---

## What's new in 2.0.0

• NEW: Overview grid — see and triage every tab at once (now the default view)
• NEW: Group by tab group or domain + sort by recent/oldest/name
• NEW: Stale & duplicate detection with one-click bulk close, and relative-age pills
• NEW: Live tab-count badge on the toolbar icon
• NEW: Audio indicator now appears in the grid too
• NEW: Fully redesigned interface — modern typography, refined dark theme, and light favicon chips so dark icons (like GitHub's) stay visible
• FIXED: Clicking the toolbar icon now opens TabFlow in the window you clicked, even when another window already has TabFlow open
• Cover Flow is preserved — toggle between the two views anytime; your choice is remembered
• No new permissions, still zero data collection

---

## Screenshots (ready to upload — `docs/store-assets-2.0.0/`, 1280×800 PNG)

1. `01-grid-overview.png` — Overview grid, amber "16 tabs open" count, "2 duplicates · Merge" chip, sections of cards (lead with this; it becomes the thumbnail)
2. `02-grid-by-domain.png` — tab-group sections (Dev/Docs) with age pills and counts
3. `03-grid-card-hover.png` — card hover state: lift, close button, freshness pill
4. `04-grid-search.png` — search filtering the grid live
5. `05-coverflow.png` — Cover Flow carousel with a group card (so existing users recognize it)

Captured with the staged-tabs Playwright script; regenerate by asking Claude or
re-staging per `screenshots-guide.md`. A toolbar-badge shot still needs a manual
capture (browser chrome isn't scriptable) — optional.

## Listing fields that DON'T change
- Permissions: unchanged (tabs, windows, sessions, tabGroups) — no new permission warning, existing users are not re-prompted
- Privacy practices: no data collected
