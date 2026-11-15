#!/usr/bin/env node
'use strict';
/* Reads the English Wikipedia lead (REST summary endpoint, one request at a time, rate-limit aware) of EVERY accepted answer of the named round-2 questions and caches
   it in audit/dh-curated2-data/_sample-leads.json (shared with the sampler). Used for the two questions whose Wikidata classes are loosest (intel, scandals): the
   config then keeps only answers whose lead sentence confirms what they are, so the whole list, not just a sample, is read.
   Usage: node site/tools/fetch-dh-curated-2-leads.js <question key> [...]   (needs the banks built once so that _titles.json exists) */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated2-data');
const UA = 'StayInformedNewsTriviaBot-curated2/1.0 (educational trivia research; sequential verification)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keys = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(path.join(DATA, '_report.json'), 'utf8')).report;
const titles = JSON.parse(fs.readFileSync(path.join(DATA, '_titles.json'), 'utf8'));
const cacheFile = path.join(DATA, '_sample-leads.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const todo = [];
for (const k of keys) { const r = report.find(x => x.key === k); if (!r) continue; for (const v of Object.values(titles[r.id] || {})) if (!(v[0] in cache)) todo.push(v[0]); }
console.log('leads to fetch:', todo.length);
(async () => {
  let done = 0;
  for (const t of todo) {
    const u = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')) + '?redirect=true';
    for (let k = 0; k < 30; k++) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': UA } });
        if (r.status === 404) { cache[t] = ''; break; }
        if (r.ok) { const j = await r.json(); cache[t] = (j.description ? '[' + j.description + '] ' : '') + (j.type === 'disambiguation' ? '(disambiguation) ' : '') + (j.extract || '').slice(0, 500); await sleep(400); break; }
        await sleep(Math.min(90, (+r.headers.get('retry-after') || 10) + 2) * 1000);
      } catch (e) { await sleep(4000); }
    }
    if (++done % 25 === 0) { fs.writeFileSync(cacheFile, JSON.stringify(cache)); console.log('  leads', done); }
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  console.log('done');
})();
