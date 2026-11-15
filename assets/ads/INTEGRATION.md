# Ad system: page integration (phase 2, for the developer)

Everything is already built in `site/assets/ads/`. This file lists the exact snippets to wire it into the existing pages.
The ad code does nothing (no files loaded, nothing drawn) until `ads-config.js` has `enabled: true` and real ids, so wiring it in is safe.
Owner guide: `site/ADS-SETUP.md`. Look at the wiring with `?adsdebug=1` (console report, draws nothing) or `site/ads-status.html`.

## 1. Shared header and loader: `site/assets/site.js`

Put this right after `document.body.appendChild(footer);` so the header already exists. It loads the settings and the tiny loader
**synchronously**, which lets the loader reserve the banner/rail space before first paint (no layout shift). With ads off it costs two small files.

```js
// Ads (see assets/ads/INTEGRATION.md). Does nothing visible unless ads-config.js is enabled and configured.
(function(){
  var cfg = url('assets/ads/ads-config.js'), ld = url('assets/ads/ads-loader.js');
  if (document.readyState === 'loading') document.write('<script src="'+cfg+'"><\/script><script src="'+ld+'"><\/script>');
  else [cfg, ld].forEach(function(src){ var s = document.createElement('script'); s.src = src; s.async = false; document.head.appendChild(s); });
})();
```

The loader inserts the top banner container right after `body > header` (the masthead) on every page except: games pages, `<body data-ads="off">`, `<body data-ads-banner="off">`,
Opinions write/new/edit/account/admin/login/signup/reset/settings pages and `404.html`/`error.html`/`offline.html`.

## 2. Footer links: `site/assets/site.js` footer list

Add inside the footer `<ul>` (the `hidden` ones are revealed by the ad system only when ads are active):

```js
'<li><a href="'+url('privacy.html')+'">Privacy</a></li>'+
'<li data-sin-ads-only hidden><a href="#" data-sin-privacy-choices>Privacy choices</a></li>'+
'<li data-sin-ads-only hidden><a href="'+url('privacy.html#ads')+'">Ads info</a></li>'
```

With `consent.provider: 'builtin'` a "Do not sell or share my personal information" link can be added the same way using `data-sin-limit-data` (hidden until ads are active).
With the default `cmp` provider the "Privacy choices" link re-opens the CMP's own dialog.

## 3. Right rail on Home (wide screens only)

Add one attribute to `<main>` in `site/index.html` (the main element must have a direct `.wrap` child, as it does today):

```html
<main id="main" class="page" data-ads-rail>
```

At 1200px and wider the loader adds a sticky right column (300x250 plus, optionally, 300x600; or a 16:9 outstream video if `rail.unit: 'outstream'`) inside that `.wrap`.
Below 1200px it disappears (or sits under the content when `rail.narrow: 'inline'`). It never covers content. No other change is needed.

## 4. In-content slots (optional, not used today)

The games hub and the games have no long lists, so no in-content slots are placed. If a future page renders a long list, `ads.insertInContent(listEl, itemSelector, 6)` (inside `SIN_ADS_ready(function(ads){ ... })`) puts a slot after every 6th item, capped by `inContent.max` (default 2); call it after every render. `SIN_ADS_ready` never runs its callback when ads are off.

## 5. Games: pre-roll and post-roll

Game pages (`site/games/<name>/…`) get **no** banner or rail, only video breaks. Game ids: `congressional-grid`, `dark-horse`, `caucus-sort`, `capitol-climb`.
Include the loader on game pages that do not already load `site.js` (before `</body>`):

```html
<script src="../../assets/ads/ads-config.js"></script>
<script src="../../assets/ads/ads-loader.js"></script>
```

Helper (never throws, never delays when ads are off, unavailable, blocked or capped):

```js
function adBreak(kind, gameId){
  try { return window.SIN_ADS && SIN_ADS.ready ? SIN_ADS[kind](gameId) : Promise.resolve(); } catch(e){ return Promise.resolve(); }
}
```

- **Pre-roll** on a player action before the first move: attach it to the Start / "Play today's puzzle" button (add a landing state if the game starts straight into a puzzle; a pre-roll needs a user action and must never appear after play has begun):
  ```js
  startButton.addEventListener('click', async function(){
    await adBreak('showPreroll', 'caucus-sort');   // resolves at once when nothing will be shown, and after at most ~8 s otherwise
    beginGame();
    if (window.SIN_ADS) SIN_ADS.setGameplay(true); // blocks ad breaks while playing
  });
  ```
- **Post-roll** when the results dialog opens (do not await it):
  ```js
  function openResults(){ if (window.SIN_ADS) SIN_ADS.setGameplay(false); resultsDialog.showModal(); adBreak('showPostroll', 'caucus-sort'); }
  ```
  The post-roll waits `frequency.postrollDelayMs` (2.5 s) so the player sees their score first, then opens as a modal above the results dialog (it uses its own `<dialog>`, which stacks above any earlier one).
- Locations: Congressional Grid `site/games/congressional-grid/index.html` (workshop copy at the project root `index.html`, same wiring), Dark Horse `site/games/dark-horse/index.html` + `trivia.js`, Caucus Sort `site/games/caucus-sort/index.html` + `caucus-sort.js`.
- Rules enforced in `ads.js`: pre-roll once per game per day, post-roll once per game per session, at most 2 video ads per hour, never during gameplay, never if consent is unresolved, the IMA SDK or ad tag fails, an ad blocker is present, or the ad does not start within 8 s. Skip and Esc work after 5 s. Dialog: `role="dialog"`, `aria-modal`, focus returned afterwards, Pause and Mute buttons, muted start, honours reduced motion.

## 6. Pages that must carry no ads

- Opinions write/account/admin pages: handled by path rules; for safety also add `<body data-ads="off">` to `opinions/write.html`, `opinions/account.html`, `opinions/admin.html`.
- Error and empty-content states: add `data-ads="off"` to `404.html` if it exists; for any page that can be empty, call `document.body.setAttribute('data-ads','off')` before ads load.
- `privacy.html` and `ads-status.html` already opt out of the banner.

## 7. Files to leave in place

`site/ads.txt` (replace the template lines per `ADS-SETUP.md`), `site/privacy.html` (draft: owner and lawyer must finish it), `site/ads-status.html` (read-only checklist; delete if you do not want it public, it is `noindex`).

## 8. Smoke tests after wiring

1. With the shipped config (`enabled: false`): every page identical to before, Network tab shows only `ads-config.js` and `ads-loader.js`.
2. `?adsdebug=1` on Home and a game page: console lists the expected slots (Home: top banner and rail; game pages: none).
3. In a copy of the config set `enabled: true, testMode: true`: Google demo ads appear in the banner, rail (wide screens) and in-content slots; pre-roll/post-roll play Google's sample ad. Then set it back.
4. Resize to 390, 1024, 1440: no horizontal scroll, banner 320x50/300x50 on phones, rail only at 1200+.
5. `?adsim=blocked` on localhost: everything collapses, games start without delay.
