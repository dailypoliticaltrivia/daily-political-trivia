#!/usr/bin/env node
'use strict';
/* Recheck helper: downloads the Wikidata "instance of" (P31) labels of every answer candidate, so type filters (build-dh-curated.js / dh-curated-recheck-filters.js)
   can drop items that Wikidata itself types as an alliance, movement, massacre, edict, etc. Wikidata's query service is used, NOT the Wikipedia API (which is rate-limited).
   Output: audit/dh-curated-data/_types.json  ({ Qid: [type labels] })   Usage: node site/tools/fetch-dh-types.js  (resumable) */
const fs = require('fs');
const path = require('path');
const { Q } = require('./dh-curated-config.js');
const DATA = path.join(__dirname, '..', '..', 'audit', 'dh-curated-data');
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = fs.existsSync(path.join(DATA, '_types.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, '_types.json'), 'utf8')) : {};
let dropped = {}; try { dropped = JSON.parse(fs.readFileSync(path.join(DATA, '_drop.json'), 'utf8')); } catch (e) { }
(async () => {
  const need = new Set();
  for (const c of Q) {
    if (c.kind.startsWith('census') || c.kind === 'seat' || dropped[c.key]) continue;
    const f = path.join(DATA, c.key + '.json'); if (!fs.existsSync(f)) continue;
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) if (r.q && !(r.q in out)) need.add(r.q);
  }
  const list = [...need];
  console.log(list.length + ' items');
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    const q = 'SELECT ?x (GROUP_CONCAT(DISTINCT ?l; separator="|") AS ?types) WHERE { VALUES ?x { ' + chunk.map(x => 'wd:' + x).join(' ') + ' } OPTIONAL { ?x wdt:P31 ?t. ?t rdfs:label ?l. FILTER(LANG(?l) = "en") } } GROUP BY ?x';
    for (let k = 0; k < 6; k++) {
      try {
        const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(q) });
        if (!r.ok) { await sleep(8000); continue; }
        const j = await r.json();
        for (const b of j.results.bindings) out[b.x.value.split('/').pop()] = b.types && b.types.value ? b.types.value.split('|') : [];
        for (const x of chunk) if (!(x in out)) out[x] = [];
        break;
      } catch (e) { await sleep(5000); }
    }
    if ((i / 300) % 10 === 0) { fs.writeFileSync(path.join(DATA, '_types.json'), JSON.stringify(out)); console.log(i + '/' + list.length); }
    await sleep(600);
  }
  fs.writeFileSync(path.join(DATA, '_types.json'), JSON.stringify(out));
  console.log('done', Object.keys(out).length);
})();
