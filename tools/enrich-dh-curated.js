#!/usr/bin/env node
'use strict';
/* Downloads the first sentence(s) of the English Wikipedia article of every answer in the questions that have an intro filter
   (FILTERS in dh-curated-config.js). Cache: audit/dh-curated-data/_intros.json  ({ title: "first sentences" }).
   Usage: node site/tools/enrich-dh-curated.js   (resumable; run fetch-dh-curated.js first) */
const fs = require('fs');
const path = require('path');
const { FILTERS } = require('./dh-curated-config.js');
const DATA = path.join(__dirname, '..', '..', 'audit', 'dh-curated-data');
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cacheFile = path.join(DATA, '_intros.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
async function api(params) {
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch('https://en.wikipedia.org/w/api.php?format=json&' + new URLSearchParams(params), { headers: { 'User-Agent': UA } });
      if (r.ok) return r.json();
      await sleep(Math.min(60, (+r.headers.get('retry-after') || 10) * (i + 1)) * 1000);
    } catch (e) { await sleep(3000); }
  }
  throw new Error('api');
}
(async () => {
  const need = new Set();
  // recheck: fetch intros for EVERY kept Wikidata-based question (not only those with FILTERS), so type filters can use the Wikipedia lead sentence
  const { Q } = require('./dh-curated-config.js');
  let dropped = {}; try { dropped = JSON.parse(fs.readFileSync(path.join(DATA, '_drop.json'), 'utf8')); } catch (e) {}
  const only = process.argv.slice(2);
  const keys = Q.filter(c => !c.kind.startsWith('census') && c.kind !== 'seat' && !dropped[c.key] && (!only.length || only.includes(c.key))).map(c => c.key);
  for (const key of keys) {
    const f = path.join(DATA, key + '.json'); if (!fs.existsSync(f)) continue;
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) if (!(r.t in cache) && !/^(List|Lists|Timeline) of /.test(r.t)) need.add(r.t);
  }
  const list = [...need];
  console.log(list.length + ' titles to fetch');
  for (let i = 0; i < list.length; i += 20) {
    const batch = list.slice(i, i + 20);
    const j = await api({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '2', exlimit: '20', redirects: '1', titles: batch.join('|') });
    const map = {}; (j.query.redirects || []).forEach(r => map[r.from] = r.to); (j.query.normalized || []).forEach(r => map[r.from] = r.to);
    const pages = Object.values(j.query.pages || {});
    for (const t of batch) { let x = map[t] || t; x = map[x] || x; const pg = pages.find(p => p.title === x); cache[t] = pg && pg.extract ? pg.extract.replace(/\s+/g, ' ').slice(0, 500) : ''; }
    if ((i / 20) % 5 === 0) { fs.writeFileSync(cacheFile, JSON.stringify(cache)); console.log(i + '/' + list.length); }
    await sleep(2000);
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  console.log('done');
})();
