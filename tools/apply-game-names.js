#!/usr/bin/env node
'use strict';
/* Stamps the game display name / slug from tools/game-names.json into the pages (idempotent).
   Usage (from the site folder):  node tools/apply-game-names.js
   If "slug" changed, the game folder is renamed first (nothing is redirected: do this before launch). */
const fs = require('fs');
const path = require('path');
const SITE = path.resolve(__dirname, '..');
const CFG = path.join(__dirname, 'game-names.json');
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const SITECFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'site-config.json'), 'utf8'));
const SITE_NAME = String(SITECFG.siteName || 'Daily Political Trivia');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const rd = f => fs.readFileSync(f, 'utf8');
const wr = (f, s) => fs.writeFileSync(f, s);

const renamed = [];
for (const [id, g] of Object.entries(cfg.games)) {
  if (/connections/i.test([g.name, g.slug, g.tagline, g.description].join(' '))) { console.error('The name, slug and texts must not use the word "connections".'); process.exit(1); }
  if (!/^[a-z0-9-]+$/.test(g.slug)) { console.error('slug must be lowercase letters, digits and hyphens.'); process.exit(1); }
  const oldDir = path.join(SITE, 'games', g.appliedSlug || g.slug), dir = path.join(SITE, 'games', g.slug);
  if (g.slug !== g.appliedSlug) {
    if (fs.existsSync(dir)) { console.error('games/' + g.slug + ' already exists.'); process.exit(1); }
    fs.renameSync(oldDir, dir);
    console.log('renamed folder games/' + g.appliedSlug + ' -> games/' + g.slug);
    renamed.push([g.appliedSlug, g.slug]);
  }
  // game page
  const pf = path.join(dir, 'index.html');
  let h = rd(pf);
  h = h.replace(/<title>[^<]*<\/title>/, '<title>' + esc(g.name) + ' · ' + esc(SITE_NAME) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(g.description) + '$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + esc(g.name) + ' · ' + esc(SITE_NAME) + '$2')
    .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + esc(g.description) + '$2')
    .replace(/(<h1 class="ptitle">)[^<]*(<\/h1>)/, '$1' + esc(g.name) + '$2')
    .replace(/(https?:\/\/[^"\/]+)\/games\/[a-z0-9-]+\//g, (m, host) => host + '/games/' + g.slug + '/');
  wr(pf, h);
  // hub list
  const jf = path.join(SITE, 'games', 'games.json');
  const list = JSON.parse(rd(jf));
  const e = list.find(x => x.art === id);
  if (e) { e.slug = g.slug; e.title = g.name; e.tagline = g.tagline; e.url = g.slug + '/'; wr(jf, JSON.stringify(list, null, 2) + '\n'); }
  // About paragraph + logo sheet
  const af = path.join(SITE, 'about.html');
  if (fs.existsSync(af)) {
    let a = rd(af);
    a = a.replace(new RegExp('<a href="games/[a-z0-9-]+/" data-gn="' + id + '">[^<]*</a>', 'g'), () => '<a href="games/' + g.slug + '/" data-gn="' + id + '">' + esc(g.name) + '</a>');
    wr(af, a);
  }
  const lf = path.join(SITE, 'assets', 'logos', 'index.html');
  if (fs.existsSync(lf)) {
    const words = g.name.split(' '), last = words.pop();
    wr(lf, rd(lf).replace(new RegExp('(<span class="wm" data-gn="' + id + '">)[^]*?(</span>)', 'g'), '$1' + esc(words.join(' ')) + (words.length ? ' ' : '') + '<b>' + esc(last) + '</b>$2'));
  }
  g.appliedSlug = g.slug;
}
// header / tab bar entries in assets/site.js (the "games-line"), kept in step with games/games.json
{
  const list = JSON.parse(rd(path.join(SITE, 'games', 'games.json'))).filter(x => x.status === 'live' && x.url);
  const keyOf = x => x.art === 'caucus-sort' ? 'caucus' : x.art === 'dc-journey' ? 'climb' : x.art;   // keys name the nav icons in site.js
  const labelOf = x => x.art === 'grid' ? 'Grid' : x.title;
  const shortOf = x => x.art === 'caucus-sort' ? 'Caucus' : x.art === 'dc-journey' ? 'Climb' : '';   // phone tab bar (5 tabs) uses these ('Grid' and 'Dark Horse' are short enough as they are)
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const line = '  const GAMES = [' + list.map(x => '[' + q(keyOf(x)) + ',' + q(labelOf(x)) + ',' + q('games/' + x.slug + '/') + (shortOf(x) ? ',' + q(shortOf(x)) : '') + ']').join(',') + ']; // games-line';
  const sf = path.join(SITE, 'assets', 'site.js'), s = rd(sf);
  const s2 = s.replace(/^ {2}const GAMES = .*\/\/ games-line$/m, () => line);
  if (s2 !== s) wr(sf, s2);
}
// Folder renamed: every literal 'games/<old>' path in the text files below follows (manifest shortcuts, 404, About, tests, tools, docs).
// Left alone on purpose: localStorage keys (sin.politrivia.v1, sin.dcj.v1.*), the 'art' keys in games.json / hub.js, logo file names, ad ids
// (GAME_ID in trivia.js / caucus-sort.js; dcj.js derives its id from the URL). See audit/rebrand-log.md for the full list.
if (renamed.length) {
  const ROOT = path.resolve(SITE, '..');
  const skipDir = /^(\.|node_modules|data|deploy-site|artifact-preview|artifact-single|archive-|shots|tmpx|photos|photo-work|people-db|audit|legal)/;
  const extOk = /\.(html|js|mjs|json|webmanifest|md|txt|ps1|xml|css)$/;
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!skipDir.test(e.name)) walk(f); } else if (extOk.test(e.name)) files.push(f); } })(ROOT);
  let n = 0;
  for (const f of files) {
    if (f.endsWith('game-names.json')) continue;
    let s = rd(f); const o = s;
    for (const [from, to] of renamed) {
      s = s.split('games/' + from).join('games/' + to);                                   // paths: games/<slug>/...
      s = s.split("'games', '" + from + "'").join("'games', '" + to + "'");               // path.join(..., 'games', '<slug>', ...)
      s = s.split("GAME_ID = '" + from + "'").join("GAME_ID = '" + to + "'");             // ad id in trivia.js / caucus-sort.js
      s = s.split("[0, '" + from + "']").join("[0, '" + to + "']");                       // dcj.js fallback slug
      s = s.split("pre:" + from).join("pre:" + to).split("post:" + from).join("post:" + to);     // ad-break log expectations in tools/dcj-shots.mjs
    }
    if (s !== o) { wr(f, s); n++; }
  }
  console.log('updated games/<slug> paths in ' + n + ' file(s). Now run: node tools/build-sitemap.js, node tools/apply-head-patch.js, then the checks and the artifact builders.');
}
wr(CFG, JSON.stringify(cfg, null, 2) + '\n');
console.log('game names applied.');
