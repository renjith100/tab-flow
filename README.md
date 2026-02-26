# TabFlow

A Chrome extension that brings Cover Flow to your browser tabs — navigate all your open tabs in a beautiful 3D carousel, keyboard-first.

![TabFlow Cover Flow carousel](icons/icon128.png)

---

## Features

- **Cover Flow carousel** — tabs arranged in a 3D perspective view, just like the original iTunes/iPhone Cover Flow
- **Tab groups** — Chrome tab groups appear as a single card with floating favicons; drill into a group with `↓` and return with `↑`
- **Keyboard-first** — navigate entirely without the mouse using arrow keys, Enter, Escape, and `/` for search
- **Drag to close** — drag any card out of the row to close that tab with a satisfying poof animation
- **Undo close** — accidentally closed a tab? Press `⌘Z` (or click the toast) to restore it instantly
- **Search / filter** — press `/` and type to filter tabs by title or domain; search is scoped to the current group when inside one
- **Full-page view** — opens as a new tab for maximum space, not a tiny popup
- **Favicon-first cards** — uses each site's favicon as the card hero with automatic fallback to the Google favicon service
- **Always centred** — opens with your currently active tab in the centre of the carousel

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Navigate carousel |
| `↓` | Enter a tab group |
| `↑` | Exit a tab group back to main view |
| `↵` Enter | Open the selected tab (or enter a group) |
| `Esc` | Close the active tab (newtab mode) |
| `/` | Focus search |
| `⌘Z` / `Ctrl+Z` | Undo last closed tab |

---

## Installation

TabFlow is not yet published to the Chrome Web Store. Install it as an unpacked extension:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `tab-flow` folder

The TabFlow icon will appear in your toolbar. Click it to open the carousel.

> **First launch:** Chrome will ask you to approve the permissions `tabs`, `windows`, `sessions`, and `tabGroups`. These are the minimum required to read, switch, close, and restore tabs.

---

## Generating Icons

The icons need to be generated once before the extension works:

1. Open `icons/generate.html` in any browser (drag the file into a tab)
2. Click **Download All Icons**
3. Move the three downloaded PNGs (`icon16.png`, `icon48.png`, `icon128.png`) into the `icons/` folder

---

## Project Structure

```
tab-flow/
├── manifest.json       Chrome Extension Manifest V3
├── background.js       Service worker — handles toolbar icon click
├── newtab.html         Full-page UI (primary interface)
├── popup.html          Popup UI (fallback, same logic)
├── popup.css           All styles for both HTML shells
├── popup.js            All UI logic — Cover Flow, tab groups, search, drag
└── icons/
    ├── generate.html   Open in browser to generate PNG icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `tabs` | Read tab titles, URLs, favicons; switch and close tabs |
| `windows` | Focus the correct window when switching to a tab |
| `sessions` | Restore the most recently closed tab (undo) |
| `tabGroups` | Read Chrome tab group names and colors |

---

## Development

No build step — it's plain HTML, CSS, and JavaScript. Edit any file and click **Reload** on the extension card in `chrome://extensions`.

The same `popup.js` file runs in both `newtab.html` and `popup.html` contexts. The constant `IS_NEWTAB` (detected from `window.location.pathname`) switches behaviour where the two modes differ (e.g. Escape closes the active tab in newtab mode vs. closing the popup window).

---

## License

MIT — see [LICENSE](LICENSE).
