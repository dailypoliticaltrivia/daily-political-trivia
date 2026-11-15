# <head> additions for deployment (for the design / integration pass)

Nobody has applied these yet. Every page edit is left to the agent that owns the pages. All paths below are
**relative** so they work at a domain root and under `https://name.github.io/repo-name/`.
`PREFIX` is `` (empty) for pages in the site root, `../` for pages one folder down (games/, opinions/),
`../../` for the four game pages (games/congressional-grid/, games/dark-horse/ (Dark Horse), games/caucus-sort/, games/capitol-climb/ (Capitol Climb)).

## 1. Add to EVERY page (inside `<head>`, after the stylesheet link)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">   <!-- REPLACES the existing viewport meta -->
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121316" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="PREFIXmanifest.webmanifest">
<link rel="apple-touch-icon" href="PREFIXassets/icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="PREFIXassets/icons/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Daily Political">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
```

Notes
- `viewport-fit=cover` lets the page use the whole phone screen (notch / rounded corners). With it, the header and
  footer need `padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right);` and the footer
  `padding-bottom: env(safe-area-inset-bottom)` in `site.css`, otherwise text can sit under the notch when the phone
  is turned sideways. Skip `viewport-fit=cover` if that CSS is not added.
- `index.html` already has the two `theme-color` tags; do not duplicate them.
- `site.js` already injects `assets/favicon.svg` when a page has no `<link rel="icon">`; the PNG icon link above is for
  browsers that ignore SVG icons. Keep both.
- Icon files already exist: `assets/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`,
  `icon-any.svg`, `og-image.png` (1200 x 630).

## 2. Canonical and social tags (public pages only)

Needs the real address. Replace `https://YOUR-DOMAIN` with the value of `baseUrl` in `tools/site-config.json`
(no trailing slash). The canonical URL is ABSOLUTE by design (search engines require it). Under a
`github.io/repo-name/` address include the `/repo-name` part in `baseUrl`.

```html
<link rel="canonical" href="https://YOUR-DOMAIN/PAGE-PATH">
<meta property="og:site_name" content="Daily Political Trivia">
<meta property="og:type" content="website">
<meta property="og:title" content="PAGE TITLE">
<meta property="og:description" content="PAGE DESCRIPTION (same as meta description)">
<meta property="og:url" content="https://YOUR-DOMAIN/PAGE-PATH">
<meta property="og:image" content="https://YOUR-DOMAIN/assets/icons/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

| Page file | PAGE-PATH | PREFIX |
|---|---|---|
| index.html | `/` | `` |
| about.html | `/about.html` | `` |
| privacy.html | `/privacy.html` | `` |
| games/index.html | `/games/` | `../` |
| games/congressional-grid/index.html | `/games/congressional-grid/` | `../../` |
| games/dark-horse/index.html | `/games/dark-horse/` | `../../` |
| games/caucus-sort/index.html | `/games/caucus-sort/` | `../../` |
| games/capitol-climb/index.html | `/games/capitol-climb/` | `../../` |
| opinions/index.html | `/opinions/` | `../` |
| opinions/post.html | `/opinions/post.html` (canonical per post is impossible: the page is one template; leave canonical as the plain page, or omit og:url) | `../` |
| opinions/author.html, opinions/guidelines.html | `/opinions/author.html`, `/opinions/guidelines.html` | `../` |

Because the canonical needs the real domain, the simplest route is to apply section 2 once, at go-live, with a find-and-replace
on `https://YOUR-DOMAIN`. `node tools/predeploy-check.js` warns while `tools/site-config.json` still says example.com.

## 3. Keep out of search (private / useless pages)

Add inside `<head>` of these files (some already have it):

```html
<meta name="robots" content="noindex">
```

| File | Has it today? |
|---|---|
| opinions/account.html | no: ADD |
| opinions/admin.html | yes |
| opinions/write.html | yes |
| ads-status.html | yes |
| 404.html | yes |

`robots.txt` deliberately does not list these (it is public and would advertise them); `noindex` is the right tool.
Also consider deleting `ads-status.html` before launch, or leave it out of the public site: it is an owner status page.

## 4. Things to confirm in the page code (found while checking)

- `ads.txt` must be reachable at `https://YOUR-DOMAIN/ads.txt`: it is, as long as the site is served from a domain root
  (a custom domain). On `name.github.io/repo-name/` ad networks will not find it. This is a reason to buy the domain before ads.
- `assets/site.js` builds all links from its own script address. Keep that: no leading-slash (`/games/`) paths anywhere.
  `tools/predeploy-check.js` fails if it finds one.
- Service worker: NOT added. A home-screen icon and standalone mode work with the manifest alone. A service worker
  (offline mode) would cache old pages and is not needed.
