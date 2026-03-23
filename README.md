<div align="center">

# TabFlow

A beautiful Cover Flow-style 3D tab switcher for Chrome
Navigate, search, group, and close tabs visually — keyboard-first, no screenshots, full-page carousel.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-blue?logo=google-chrome&style=for-the-badge)](https://chromewebstore.google.com/detail/tabflow/lekecebmffemmgemgpmplpekbahbghno)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3)

Watch the demo:

[![Demo video](https://img.youtube.com/vi/6c_-F-O46zg/0.jpg)](https://youtu.be/6c_-F-O46zg)

</div>

## Features

- 3D Cover Flow carousel — full-page, animated tab overview
- Keyboard-first navigation — arrow keys, search (/), Enter to switch, Esc to close
- Tab Groups — shown as stacked cards with floating favicons; ↓/↑ to drill in/out
- Drag to close — swipe card sideways + poof animation
- Undo close — ⌘Z restores recently closed tabs
- Live search — filter by title or domain, scoped to current group
- Centered active tab — opens with your current tab in focus
- Favicon cards — clean look using Google's favicon service

## Installation

Easiest way — install directly from the Chrome Web Store:

[→ Add to Chrome ←](https://chromewebstore.google.com/detail/tabflow/lekecebmffemmgemgpmplpekbahbghno)

For development / sideloading:

1. Clone the repo: `git clone https://github.com/renjith100/tab-flow.git`

2. Open Chrome → go to `chrome://extensions/`

3. Enable Developer mode (top right)

4. Click **Load unpacked** → select the cloned folder

5. (Optional) Generate icons if needed: open `icons/generate.html` in Chrome

Default shortcut: `⌘⇧.` (Mac) / `Ctrl+Shift+.` (Windows/Linux)
You can change it in `chrome://extensions/shortcuts`

## How It Works

See [how-it-works.md](how-it-works.md) for UI/keyboard details and architecture notes.

## Permissions Explained

`tabs`, `windows`, `sessions`, `tabGroups` — only what's needed to read/manage tabs, groups, and undo closes. No network, storage, or host permissions.

## Privacy

No data collected or sent anywhere. See [PRIVACY.md](PRIVACY.md).

## Contributing

Early stage — welcome issues, feature requests, PRs!

Ideas: dark mode, thumbnail previews (if permissions allow), sort options, better animations.

## License

MIT © Renjith Abraham

Star if you find it useful!
