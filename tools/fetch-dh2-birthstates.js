#!/usr/bin/env node
/* Fetches the U.S. state of birth of every member of Congress from Wikidata: place of birth (P19) of everyone with a Congress Bio ID (P1157), then each place is followed up the
   "located in the administrative entity" chain (P131) to a U.S. state (instance of Q35657). A place that does not resolve to a state (born abroad, at sea) is simply not listed.
   Result: people-db/cache/dh2-birthstate.json  { places: {bioguide: placeQid}, resolved: {placeQid: [stateQid]}, states: {stateQid: name} }.
   Resumable (resolved places are kept). Usage: node site/tools/fetch-dh2-birthstates.js
   Used by build-dh-derived-2.js ("born in <state>" questions). Polite: one request at a time, descriptive User-Agent. */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const OUT = path.resolve(__dirname, '..', '..', 'people-db', 'cache', 'dh2-birthstate.json');
const S = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { places: {}, resolved: {}, states: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function sparql(q, csv) {
  return new Promise((res, rej) => {
    const u = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(q);
    https.get(u, { headers: { 'User-Agent': 'StayInformedNews-DarkHorse-audit/1.0 (one-off data build)', 'Accept': csv ? 'text/csv' : 'application/sparql-results+json' }, timeout: 120000 }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => r.statusCode === 200 ? res(b) : rej(new Error('HTTP ' + r.statusCode + ' ' + b.slice(0, 80))));
    }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
const qid = u => u.split('/').pop();
(async () => {
  if (!Object.keys(S.places).length) {
    const csv = await sparql('SELECT ?bio ?pl WHERE { ?p wdt:P1157 ?bio . ?p wdt:P19 ?pl . }', true);
    csv.split('\n').slice(1).forEach(l => { const [b, p] = l.trim().split(','); if (b && p) S.places[b] = qid(p); });
    fs.writeFileSync(OUT, JSON.stringify(S));
  }
  const todo = [...new Set(Object.values(S.places))].filter(p => !(p in S.resolved));
  console.log('places to resolve', todo.length);
  for (let i = 0; i < todo.length; i += 60) {
    const batch = todo.slice(i, i + 60);
    const q = `SELECT ?pl ?st ?stLabel WHERE { VALUES ?pl { ${batch.map(x => 'wd:' + x).join(' ')} } ?pl wdt:P131* ?st . ?st wdt:P31 wd:Q35657 . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
    try {
      const j = JSON.parse(await sparql(q, false));
      batch.forEach(x => { S.resolved[x] = []; });
      j.results.bindings.forEach(b => { const p = qid(b.pl.value), s = qid(b.st.value); S.states[s] = b.stLabel.value; if (!S.resolved[p].includes(s)) S.resolved[p].push(s); });
      console.log('batch', i, 'ok');
    } catch (e) { console.log('batch', i, 'fail', e.message); await sleep(8000); i -= 60; continue; }
    fs.writeFileSync(OUT, JSON.stringify(S)); await sleep(1500);
  }
  fs.writeFileSync(OUT, JSON.stringify(S));
  console.log('done; people with place', Object.keys(S.places).length, 'states seen', Object.keys(S.states).length);
})();
