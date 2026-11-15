#!/usr/bin/env node
'use strict';
/* Sanity check of the rarity proxy: for a random sample of answers in several questions, fetch the English Wikipedia page views
   (Nov 2025 - Oct 2026, user traffic) and report the Spearman rank correlation with the proxy (Wikipedia language editions, then Wikidata statements).
   Output: audit/dh-curated-data/_proxy-check.json. Usage: node site/tools/check-dh-proxy.js [perQuestion=12] */
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', '..', 'audit', 'dh-curated-data');
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const per = +process.argv[2] || 12;
async function views(t) {
  const u = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + encodeURIComponent(t.replace(/ /g, '_')) + '/monthly/20251101/20261031';
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return (await r.json()).items.reduce((a, b) => a + b.views, 0); if (r.status === 404) return 0; await sleep(5000 * (i + 1)); } catch (e) { await sleep(3000); }
  }
  return null;
}
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function spearman(x, y) { const rx = ranks(x), ry = ranks(y), n = x.length; const mx = rx.reduce((a, b) => a + b) / n, my = ry.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
(async () => {
  const keys = ['sc-cases', 'battles-1500-1799', 'treaties-1946', 'unions', 'us-agencies', 'world-heritage'];
  const result = {};
  for (const k of keys) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, k + '.json'), 'utf8'));
    const pick = []; while (pick.length < per) { const r = raw[Math.floor(rnd() * raw.length)]; if (!pick.includes(r)) pick.push(r); }
    const sc = [], pv = [];
    for (const r of pick) { const v = await views(r.t); if (v == null) continue; sc.push(r.s * 1000 + Math.min(r.st, 999)); pv.push(v); await sleep(700); }
    result[k] = { n: sc.length, spearman: +spearman(sc, pv).toFixed(2) };
    console.log(k, result[k]);
  }
  fs.writeFileSync(path.join(DATA, '_proxy-check.json'), JSON.stringify(result, null, 1));
})();
