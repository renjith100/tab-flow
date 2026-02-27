# Privacy Policy — TabFlow

**Last updated: 2026-02-27**

TabFlow is a Chrome extension that displays your open browser tabs in a visual
carousel. This policy explains what data the extension accesses and what it does
with it.

## Data accessed

TabFlow reads the following information from your browser using the Chrome
Extensions API:

- **Tab titles, URLs, and favicons** — to display each tab as a card in the carousel.
- **Tab group names and colours** — to display grouped tabs as a group card.
- **Window and session information** — to scope the carousel to the current window
  and to support the "Undo close" feature (via Chrome's built-in session history).

## Data usage

All data is used **exclusively within your browser** to render the carousel UI.

- No user-identifiable browsing data is transmitted to any server, with one
  exception: favicon fetches described below.
- No data is stored persistently (everything is in-memory and discarded when the
  TabFlow tab is closed).
- No analytics, tracking, or advertising.
- **Favicon requests:** when a tab does not supply its own icon, TabFlow fetches
  one from `https://www.google.com/s2/favicons?domain=<domain>&sz=128`. This
  request includes the site's domain name (e.g. `github.com`) as a URL
  parameter — no full URLs, page titles, or personal information are included.
  Your browser caches these responses, so the same domain is not re-requested on
  every open.

## Third-party services

| Service | Purpose | Data sent |
|---------|---------|-----------|
| Google Favicon Service | Fetch site icons | Tab domain name (e.g. `github.com`) |

## Contact

Questions or concerns? Open an issue at
https://github.com/renjith100/tab-flow/issues
