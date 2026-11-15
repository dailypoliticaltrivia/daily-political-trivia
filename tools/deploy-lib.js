'use strict';
/* Shared rules for "what is published" and "what is committed". Used by predeploy-check.js,
   make-deploy-folder.js and build-sitemap.js. No dependencies. */
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');

// Folders that are never committed (mirrors .gitignore).
const REPO_IGNORED_DIRS = new Set(['.git', '.taste-skill', '.design-backup', 'shots', 'audit', 'people-db', 'photo-work', 'scratch', 'tmpx', 'deploy-site', 'node_modules', '.claude', '.vscode', '.idea']);
// Folders that are in the repo but NOT published (tools, workflows, owner guides).
// 'security' holds owner notes and a CSP snippet page (build-csp.js generates the real tags); never published.
const PUBLISH_EXCLUDED_DIRS = new Set([...REPO_IGNORED_DIRS, '.github', 'tools', 'deploy', 'supabase', 'security']);
// Owner-only pages in the site root that are never published (ads-status.html is a private checklist for the owner).
const NEVER_PUBLISH_ROOT_PAGES = new Set(['ads-status.html']);
// File name rules for "never publish".
const NEVER_PUBLISH_FILE = [
  /\.(md|markdown|txt)$/i,          // guides and notes (robots.txt and ads.txt are re-allowed below)
  /\.(ps1|bat|cmd|sh|psm1)$/i,
  /\.(bak|orig|tmp|log|swp|tsv|sql|map)$/i,
  /^test[-_.].*\.js$/i, /[-_.]test\.js$/i,
  /^CNAME\.template$/i, /^\.gitignore$/i, /^\.env/i, /^thumbs\.db$/i, /^desktop\.ini$/i, /^\.ds_store$/i,
  /caucus-sort-rules-report/i,
  /^phone-test\.html$/i,
];
const ALWAYS_PUBLISH_FILE = new Set(['robots.txt', 'ads.txt', 'security.txt', 'sitemap.xml', '.nojekyll']);

const norm = p => p.split(path.sep).join('/');

function walk(dir, skipDir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDir(e.name, norm(path.relative(base, full)))) continue;
      walk(full, skipDir, base, out);
    } else if (e.isFile()) {
      out.push({ rel: norm(path.relative(base, full)), full, size: fs.statSync(full).size });
    }
  }
  return out;
}

function isNeverPublishFile(rel) {
  const name = rel.split('/').pop();
  if (rel.indexOf('/') < 0 && NEVER_PUBLISH_ROOT_PAGES.has(name.toLowerCase())) return true;
  if (ALWAYS_PUBLISH_FILE.has(name.toLowerCase()) && rel.indexOf('/') < 0) return false;
  if (rel === '.well-known/security.txt') return false;      // only reaches here when securityTxtFiles() produced it (placeholders filled in)
  return NEVER_PUBLISH_FILE.some(re => re.test(name));
}

/** Everything that would be committed to the repository (site/ minus gitignored folders/files). */
function repoFiles(root = SITE) {
  return walk(root, n => REPO_IGNORED_DIRS.has(n), root)
    .filter(f => !/\.(bak|orig|tmp|log|swp)$/i.test(f.rel) && !/^\.env/.test(f.rel.split('/').pop()) && f.rel !== 'phone-test.html');
}
/** security.txt (RFC 9116). The source is .well-known/security.txt. It is published only once every YOUR-... placeholder
    has been replaced (a template must never go live). It is published twice: at /.well-known/security.txt (the standard
    place) and at /security.txt (RFC 9116 allows the root as a fallback; GitHub's Pages upload action skips dot-folders,
    so the root copy is the one that actually arrives there). The .txt rule above would otherwise drop both. */
function securityTxtFiles(root = SITE) {
  const src = path.join(root, '.well-known', 'security.txt');
  let txt; try { txt = fs.readFileSync(src, 'utf8'); } catch (e) { return []; }
  if (/YOUR-[A-Z0-9]/.test(txt)) return [];
  const size = Buffer.byteLength(txt);
  return [{ rel: '.well-known/security.txt', full: src, size }, { rel: 'security.txt', full: src, size }];
}
/* ---- THE OPINIONS SWITCH ------------------------------------------------------------------------------------------
   One switch: opinions/config.js  ->  enabled.
     enabled: false                         Opinions OFF. Nothing about Opinions is published (see below).
     enabled: 'auto' and NO Supabase keys   OFF as well: a public site must never show a half-working section.
     enabled: 'auto' and Supabase keys set  ON (real accounts, posts, comments).
     enabled: true                          ON in demo mode (private preview only; predeploy-check warns).
   When OFF the deploy builder leaves out the opinions/ folder (account, write, admin, guidelines pages, db.js, op.js ...),
   strips every Opinions link, module and Sign-in link from the other pages (elements marked data-op), sets OPINIONS_BUILD
   to 'off' in assets/site.js, removes the Opinions shortcut from the web-app manifest and drops opinions/ addresses from
   sitemap.xml. The supabase/ folder (SQL and setup notes) is never published in either state. A request for /opinions/...
   then gets the normal 404.html page (GitHub Pages answers with status 404 and no redirect). */
function opinionsState(root = SITE) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(root, 'opinions', 'config.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); }
  catch (e) { return { on: false, mode: 'off', hasKeys: false, enabled: 'missing', reason: 'opinions/config.js not found' }; }
  const hasKeys = /\burl:\s*'https:\/\/[^']+'/.test(txt) && /\banonKey:\s*'[^']+'/.test(txt);
  const m = /\benabled:\s*(true|false|'auto'|"auto")/.exec(txt);
  const enabled = m ? (m[1] === 'true' ? true : m[1] === 'false' ? false : 'auto') : 'auto';
  if (enabled === false) return { on: false, mode: 'off', hasKeys, enabled, reason: 'enabled is false' };
  if (enabled === true) return { on: true, mode: hasKeys ? 'live' : 'demo', hasKeys, enabled, reason: 'enabled is true (forced on)' };
  return hasKeys ? { on: true, mode: 'live', hasKeys, enabled, reason: "enabled is 'auto' and Supabase keys are set" }
                 : { on: false, mode: 'off', hasKeys, enabled, reason: "enabled is 'auto' but no Supabase keys are set" };
}

/** Removes every <tag ... attr ...>...</tag> element (balanced) whose START tag carries the attribute (exact name, so
    "data-op" does not match "data-op-off"). */
function stripElementsWithAttr(html, attr) {
  const start = new RegExp('<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*?\\s' + attr.replace(/-/g, '\\-') + '(?=[\\s>/=])[^>]*>', 'g');
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
  let guard = 0;
  for (;;) {
    start.lastIndex = 0;
    const m = start.exec(html);
    if (!m) return html;
    if (++guard > 500) throw new Error('too many elements to remove (' + attr + ')');
    const tag = m[1], s = m.index, afterStart = s + m[0].length;
    let end = afterStart;
    if (VOID.test(tag) || /\/>$/.test(m[0])) end = afterStart;
    else if (/^(script|style)$/i.test(tag)) { const c = html.toLowerCase().indexOf('</' + tag.toLowerCase(), afterStart); end = c < 0 ? html.length : html.indexOf('>', c) + 1; }
    else {
      const tok = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); tok.lastIndex = afterStart;
      let depth = 1, t2;
      while ((t2 = tok.exec(html))) { if (t2[1]) { if (--depth === 0) { end = t2.index + t2[0].length; break; } } else if (!/\/>$/.test(t2[0])) depth++; }
      if (depth !== 0) throw new Error('unbalanced <' + tag + '> while removing an Opinions element (attribute ' + attr + ')');
    }
    html = html.slice(0, s) + html.slice(end);
  }
}
/** What the build does to ONE file's text. Returns the (possibly unchanged) text. */
function transformPublished(rel, text, state = opinionsState()) {
  if (/\.html?$/i.test(rel)) {
    if (state.on) return stripElementsWithAttr(text, 'data-op-off');                                   // Opinions on: drop the "off" alternatives
    return stripElementsWithAttr(text, 'data-op').replace(/(\s)data-op-off(?=[\s>])/g, '$1');         // Opinions off: drop the on-parts, keep the "off" alternatives
  }
  if (state.on) return text;
  if (rel === 'assets/site.js') {
    if (!/const OPINIONS_BUILD = 'auto';/.test(text)) throw new Error("assets/site.js: the line  const OPINIONS_BUILD = 'auto';  is missing");
    return text.replace("const OPINIONS_BUILD = 'auto';", "const OPINIONS_BUILD = 'off';");
  }
  if (rel === 'manifest.webmanifest') {
    const j = JSON.parse(text.replace(/^﻿/, ''));
    if (Array.isArray(j.shortcuts)) j.shortcuts = j.shortcuts.filter(s => !/(^|\/)opinions\//.test(s.url || ''));
    return JSON.stringify(j, null, 2) + '\n';
  }
  if (rel === 'sitemap.xml') return text.replace(/^[ \t]*<url><loc>[^<]*\/opinions\/[^<]*<\/loc>.*<\/url>\r?\n/gm, '');
  return text;
}
const TRANSFORMED = f => /\.(html?|webmanifest|xml)$/i.test(f) || f === 'assets/site.js';

/** Ads switch (assets/ads/ads-config.js enabled). ads.txt is published only when ads are on: an ad-free site must not publish a seller list. */
function adsEnabled(root = SITE) {
  try { return /^\s*enabled:\s*true/m.test(fs.readFileSync(path.join(root, 'assets', 'ads', 'ads-config.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')); } catch (e) { return false; }
}
/** Everything that gets published. */
function publishFiles(root = SITE) {
  const st = opinionsState(root), ads = adsEnabled(root);
  return walk(root, (n, rel) => PUBLISH_EXCLUDED_DIRS.has(n) || (n === '.well-known' && root === SITE) || (!st.on && rel === 'opinions'), root)
    .filter(f => !isNeverPublishFile(f.rel) && (ads || f.rel !== "ads.txt")).concat(securityTxtFiles(root));
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(SITE, 'tools', 'site-config.json'), 'utf8')); }
  catch (e) { return { baseUrl: 'https://example.com', siteName: 'Daily Political Trivia' }; }
}
module.exports = { adsEnabled, opinionsState, transformPublished, stripElementsWithAttr, TRANSFORMED, securityTxtFiles, SITE, walk, repoFiles, publishFiles, isNeverPublishFile, readConfig, norm, REPO_IGNORED_DIRS, PUBLISH_EXCLUDED_DIRS };
