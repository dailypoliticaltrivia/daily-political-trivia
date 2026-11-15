#!/usr/bin/env node
/* Congressional Grid: download the (visible) Wikipedia categories of every member of Congress's article, for tag recall that Wikidata lacks
   (military branch and war service above all). Titles come from data/legislators-*.json (id.wikipedia). Throttled (one request at a time,
   1.1 s apart, backs off on "too many requests"), resumable: results are cached in data/wikicats-cache.json after every batch.
   Usage: node site/tools/fetch-grid-wikicats.js   (then: node site/tools/derive-grid-wikicats.js) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'wikicats-cache.json');
const readJ = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const legs = readJ(path.join(ROOT, 'data', 'legislators-historical.json')).concat(readJ(path.join(ROOT, 'data', 'legislators-current.json')));
const cache = fs.existsSync(OUT) ? readJ(OUT) : {};
const titles = [...new Set(legs.map(l => l.id.wikipedia).filter(Boolean))].filter(t => !cache[t]);
const UA = 'DailyPoliticalTrivia-data-check/1.0 (static trivia site; build script)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 12; i++) {
    let r, txt; try { r = await fetch(url, { headers: { 'User-Agent': UA } }); txt = await r.text(); } catch (e) { await sleep(15000 * (i + 1)); continue; }   // network error: wait and retry
    if (r.status === 200 && txt.startsWith('{')) return JSON.parse(txt);
    await sleep(15000 * (i + 1));
  }
  throw new Error('giving up on ' + url);
}
(async () => {
  console.log(titles.length + ' titles to fetch (' + Object.keys(cache).length + ' cached)');
  for (let b = 0; b < titles.length; b += 50) {
    const batch = titles.slice(b, b + 50);
    const got = {}; batch.forEach(t => { got[t] = []; });
    const alias = {}; // normalized / redirected title -> requested title
    let cont = '';
    do {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=categories&clshow=!hidden&cllimit=max&redirects=1&titles=' +
        encodeURIComponent(batch.join('|')) + cont;
      const j = await get(url);
      (j.query.normalized || []).forEach(n => { alias[n.to] = alias[n.from] || n.from; });
      (j.query.redirects || []).forEach(n => { alias[n.to] = alias[n.from] || n.from; });
      Object.values(j.query.pages || {}).forEach(p => {
        const t = alias[p.title] || p.title; if (!got[t]) return;
        (p.categories || []).forEach(c => got[t].push(c.title.replace(/^Category:/, '')));
      });
      cont = j.continue ? '&clcontinue=' + encodeURIComponent(j.continue.clcontinue) + '&continue=' + encodeURIComponent(j.continue.continue) : '';
      await sleep(2000);
    } while (cont);
    Object.assign(cache, got);
    fs.writeFileSync(OUT, JSON.stringify(cache));
    if ((b / 50) % 20 === 0) console.log(`${b + batch.length} / ${titles.length}`);
  }
  console.log('done: ' + Object.keys(cache).length + ' titles cached in data/wikicats-cache.json');
})().catch(e => { console.error(e.message); process.exit(1); });
