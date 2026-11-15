#!/usr/bin/env node
'use strict';
/* Applies the site name from tools/site-config.json ("siteName" and "siteShortName") to the ONE brand constant in assets/site.js,
   the web app manifest, and the page titles / social tags of the non-legal pages (idempotent).
   Usage (from the site folder):  node tools/apply-brand.js
   Legal pages (terms, privacy, dmca, credits, accessibility, corrections) are NOT touched: their wording belongs to the legal pass. */
const fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '..');
const cfgFile = path.join(__dirname, 'site-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const name = String(cfg.siteName || '').trim(), short = String(cfg.siteShortName || name).trim();
if (!name) { console.error('site-config.json needs "siteName".'); process.exit(1); }
const prev = String(cfg.appliedSiteName || '').trim();
const rd = f => fs.readFileSync(f, 'utf8'), wr = (f, s) => fs.writeFileSync(f, s);
const js = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let n = 0;
// 1. site.js
{
  const f = path.join(SITE, 'assets/site.js'); const t = rd(f);
  const line = "const BRAND = '" + js(name) + "'; // site-brand";
  const t2 = t.replace(/const BRAND = '[^\n]*'; \/\/ site-brand/, () => line);
  if (!t2.includes(line)) { console.error('brand line not found in assets/site.js'); process.exit(1); }
  if (t2 !== t) { wr(f, t2); n++; }
}
// 2. manifest
{
  const f = path.join(SITE, 'manifest.webmanifest'); const m = JSON.parse(rd(f));
  if (m.name !== name || m.short_name !== short) { m.name = name; m.short_name = short; wr(f, JSON.stringify(m, null, 2) + '\n'); n++; }
}
// 3. titles and social tags (the old name is replaced only where it ends a title / is a site_name / app title)
const LEGAL = /^(terms|privacy|dmca|credits|accessibility|corrections)\.html$/;
const skipDir = /^(\.|node_modules|deploy|security|supabase|tools|opinions)/;
function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!skipDir.test(e.name)) walk(f, out); }
    else if (e.name.endsWith('.html') && !LEGAL.test(e.name) && e.name !== 'ads-status.html') out.push(f);
  }
  return out;
}
const olds = [prev, 'Stay Informed News'].filter((v, i, a) => v && v !== name && a.indexOf(v) === i);
for (const f of walk(SITE, [])) {
  const o = rd(f); let t = o;
  for (const old of olds) {
    const oe = reEsc(esc(old));
    t = t.replace(new RegExp('(<title>[^<]*· )' + oe + '(</title>)', 'g'), (m, a, b) => a + esc(name) + b)
      .replace(new RegExp('(<title>)' + oe + '(</title>)', 'g'), (m, a, b) => a + esc(name) + b)
      .replace(new RegExp('(<meta property="og:site_name" content=")' + oe + '(")', 'g'), (m, a, b) => a + esc(name) + b)
      .replace(new RegExp('(<meta property="og:title" content="[^"]*· )' + oe + '(")', 'g'), (m, a, b) => a + esc(name) + b);
  }
  t = t.replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/g, (m, a, b) => a + esc(short) + b);
  if (t !== o) { wr(f, t); n++; }
}
if (cfg.appliedSiteName !== name) { cfg.appliedSiteName = name; wr(cfgFile, JSON.stringify(cfg, null, 2) + '\n'); }
console.log('Brand "' + name + '" applied (' + n + ' file(s) changed). Page text that names the site elsewhere (legal pages, About) is edited by hand.');
