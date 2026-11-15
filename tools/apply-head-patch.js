#!/usr/bin/env node
'use strict';
/* Applies deploy/HEAD-PATCH.md to the pages (idempotent: only adds what a page is missing).
     node tools/apply-head-patch.js              (all known pages)
     node tools/apply-head-patch.js terms.html   (just some pages, path relative to site/)
   The canonical/og URLs use baseUrl from tools/site-config.json. Re-run it after changing baseUrl:
   it rewrites its own canonical/og:url/og:image lines (marked data-sin-head) so the address is updated. */
const fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(SITE, 'tools', 'site-config.json'), 'utf8'));
const BASE = String(cfg.baseUrl || 'https://example.com').replace(/\/+$/, '');

// file -> { pre: relative prefix to the site root, path: canonical path (null = no canonical), noindex, skipIcons }
const P = {
  'index.html': { pre: '', path: '/' },
  'about.html': { pre: '', path: '/about.html' },
  'privacy.html': { pre: '', path: '/privacy.html' },
  'terms.html': { pre: '', path: '/terms.html' },
  'dmca.html': { pre: '', path: '/dmca.html' },
  'credits.html': { pre: '', path: '/credits.html' },
  'accessibility.html': { pre: '', path: '/accessibility.html' },
  'corrections.html': { pre: '', path: '/corrections.html' },
  'games/index.html': { pre: '../', path: '/games/' },
  'map/index.html': { pre: '../', path: '/map/', imgPath: '/map/og-map.png', imgAlt: 'The Congress Map: every congressional district since 1789' },
  'games/congressional-grid/index.html': { pre: '../../', path: '/games/congressional-grid/', img: 'og-congressional-grid.png', imgAlt: 'Congressional Grid: fill nine squares with members of Congress' },
  'opinions/index.html': { pre: '../', path: '/opinions/' },
  'opinions/post.html': { pre: '../', path: '/opinions/post.html', noOgUrl: true, noCanonical: true },
  'opinions/guidelines.html': { pre: '../', path: '/opinions/guidelines.html' },
  'opinions/author.html': { pre: '../', path: null, noindex: true },
  'opinions/account.html': { pre: '../', path: null, noindex: true },
  'opinions/write.html': { pre: '../', path: null, noindex: true },
  'opinions/admin.html': { pre: '../', path: null, noindex: true },
  '404.html': { pre: '', path: null, noindex: true, only404: true },
};
// Dark Horse, Caucus Sort, Capitol Climb: their slugs come from tools/game-names.json (one place, so a folder rename is one step)
for (const g of Object.values(require('./game-names.json').games)) P['games/' + g.slug + '/index.html'] = { pre: '../../', path: '/games/' + g.slug + '/', img: 'og-' + g.slug + '.png', imgAlt: (g.name || g.title || g.slug) + ': a daily political game' };
const ROOT_GAME = path.resolve(SITE, '..', 'index.html');   // the Grid workshop copy: same tags as the published copy
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function patch(html, o) {
  const has = re => re.test(html);
  const title = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  const desc = ((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  let add = [];
  // viewport-fit=cover
  html = html.replace(/<meta name="viewport" content="([^"]*)">/, (m, c) => /viewport-fit/.test(c) ? m : '<meta name="viewport" content="' + c + ', viewport-fit=cover">');
  // drop our earlier generated URL lines so a baseUrl change is picked up
  html = html.replace(/[ \t]*<(link|meta)[^>]*data-sin-head[^>]*>\r?\n?/g, '');
  const pre = o.pre;
  if (!has(/name="referrer"/)) add.push('<meta name="referrer" content="strict-origin-when-cross-origin">');
  if (!o.only404) {
    if (!has(/name="theme-color"/)) add.push('<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">', '<meta name="theme-color" content="#121316" media="(prefers-color-scheme: dark)">');
    if (!has(/rel="manifest"/)) add.push('<link rel="manifest" href="' + pre + 'manifest.webmanifest">');
    if (!has(/rel="apple-touch-icon"/)) add.push('<link rel="apple-touch-icon" href="' + pre + 'assets/icons/apple-touch-icon.png">');
    if (!has(/sizes="192x192"/)) add.push('<link rel="icon" type="image/png" sizes="192x192" href="' + pre + 'assets/icons/icon-192.png">');
    if (!has(/name="apple-mobile-web-app-capable"/)) add.push('<meta name="apple-mobile-web-app-capable" content="yes">');
    if (!has(/name="mobile-web-app-capable"/)) add.push('<meta name="mobile-web-app-capable" content="yes">');
    if (!has(/name="apple-mobile-web-app-title"/)) add.push('<meta name="apple-mobile-web-app-title" content="' + attr(cfg.siteShortName || 'Daily Political') + '">');
    if (!has(/name="apple-mobile-web-app-status-bar-style"/)) add.push('<meta name="apple-mobile-web-app-status-bar-style" content="default">');
  }
  if (o.noindex && !has(/name="robots"/)) add.push('<meta name="robots" content="noindex">');
  if (!o.noindex) {
    const url = BASE + (o.path || '/');
    if (o.path && !o.noCanonical && !has(/rel="canonical"/)) add.push('<link rel="canonical" href="' + url + '" data-sin-head>');
    const og = (p, v, extra) => { if (!has(new RegExp('property="' + p.replace(':', '\\:') + '"'))) add.push('<meta property="' + p + '" content="' + attr(v) + '"' + (extra || '') + '>'); };
    og('og:site_name', cfg.siteName || 'Daily Political Trivia'); og('og:type', 'website'); og('og:title', title); if (desc) og('og:description', desc);
    if (!o.noOgUrl && o.path) og('og:url', url, ' data-sin-head');
    og('og:image', o.imgPath ? BASE + o.imgPath : BASE + '/assets/icons/' + (o.img && fs.existsSync(path.join(SITE, 'assets', 'icons', o.img)) ? o.img : 'og-image.png'), ' data-sin-head'); og('og:image:width', '1200'); og('og:image:height', '630'); og('og:image:alt', o.imgAlt || ((cfg.siteName || 'Daily Political Trivia') + ': four daily political games, a new puzzle every day'), ' data-sin-head');
    if (!has(/name="twitter:card"/)) add.push('<meta name="twitter:card" content="summary_large_image">');
  }
  if (!add.length) return html;
  const block = '<!-- head-patch -->\n' + add.map(l => l).join('\n') + '\n';
  if (html.includes('<!-- head-patch -->')) html = html.replace('<!-- head-patch -->\n', block);
  else html = html.replace('</head>', block + '</head>');
  return html;
}
function run(file, full, o) {
  const t = fs.readFileSync(full, 'utf8'); const nl = /\r\n/.test(t) ? '\r\n' : '\n';
  let out = patch(t.replace(/\r\n/g, '\n'), o);
  out = out.replace(/\n/g, nl);
  if (out !== t) { fs.writeFileSync(full, out); console.log('patched  ' + file); } else console.log('ok       ' + file);
}
const only = process.argv.slice(2);
// Pages owned by the legal work: only touched when named explicitly.
const LEGAL = new Set(['privacy.html', 'terms.html', 'dmca.html', 'credits.html', 'accessibility.html', 'corrections.html', 'opinions/guidelines.html']);
for (const [f, o] of Object.entries(P)) {
  if (only.length ? !only.includes(f) : LEGAL.has(f)) continue;
  const full = path.join(SITE, f);
  if (!fs.existsSync(full)) { console.log('missing  ' + f); continue; }
  run(f, full, o);
}
if (!only.length && fs.existsSync(ROOT_GAME)) run('../index.html (Grid workshop copy)', ROOT_GAME, P['games/congressional-grid/index.html']);
