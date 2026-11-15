#!/usr/bin/env node
'use strict';
/* Writes site/sitemap.xml (every public page + every game) and updates the Sitemap: line in robots.txt.
   The real web address comes from ONE place: tools/site-config.json  ("baseUrl").
   Usage:  node tools/build-sitemap.js            (from the site folder)  */
const fs = require('fs');
const path = require('path');
const { SITE, publishFiles, readConfig } = require('./deploy-lib');

const cfg = readConfig();
const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
if (!/^https?:\/\/.+/.test(base)) { console.error('Set "baseUrl" in tools/site-config.json first.'); process.exit(1); }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pages = [];
for (const f of publishFiles()) {
  if (!/\.html$/i.test(f.rel)) continue;
  const html = fs.readFileSync(f.full, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) continue;                 // already marked private
  // Pages that must stay out of search even before the noindex patch is applied:
  if (/^(404\.html|ads-status\.html|opinions\/(admin|write|account)\.html)$/.test(f.rel)) continue;
  if (/^assets\/logos\//.test(f.rel)) continue;                                           // design sheet
  const url = f.rel === 'index.html' ? '/' : f.rel.replace(/(^|\/)index\.html$/, '$1');
  pages.push({ url });
}
const prio = u => (u === '/' ? '1.0' : /^games\/$/.test(u) ? '0.9' : /^games\//.test(u) ? '0.8' : '0.6');
const freq = u => (u === '/' ? 'daily' : /^games\//.test(u) ? 'daily' : 'weekly');
pages.sort((a, b) => a.url.localeCompare(b.url));
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map(p => `  <url><loc>${esc(base + (p.url === '/' ? '/' : '/' + p.url))}</loc><changefreq>${freq(p.url)}</changefreq><priority>${prio(p.url)}</priority></url>`).join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), xml);

const rp = path.join(SITE, 'robots.txt');
if (fs.existsSync(rp)) {
  let r = fs.readFileSync(rp, 'utf8');
  r = /^Sitemap:.*$/m.test(r) ? r.replace(/^Sitemap:.*$/m, 'Sitemap: ' + base + '/sitemap.xml') : r.trimEnd() + '\nSitemap: ' + base + '/sitemap.xml\n';
  fs.writeFileSync(rp, r);
}
console.log(`sitemap.xml written: ${pages.length} pages, base ${base}`);
if (/example\.com/.test(base)) console.log('NOTE: baseUrl is still the placeholder example.com. Set your real address in tools/site-config.json and run this again.');
