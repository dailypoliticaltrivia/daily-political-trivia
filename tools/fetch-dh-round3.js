#!/usr/bin/env node
'use strict';
/* Round 3 of the Dark Horse banks: downloads the listings into audit/round3-dh-data/<key>.json.
   Every listing is fetched through query.wikidata.org (SPARQL; English Wikipedia category and list-link lookups go through the
   query service's MediaWiki API bridge, wikibase:mwapi, because the Wikipedia API itself rate-limits this machine).
   Row shape: { t: English Wikipedia title, q: Wikidata id, s: sitelinks (language editions), d: English description, y: year or null }
   Usage: node site/tools/fetch-dh-round3.js [key ...]      (no key = every source; existing files are kept unless named) */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'audit', 'round3-dh-data');
fs.mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'dh-trivia-builder/1.0 (static quiz site)', Accept: 'application/sparql-results+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sparql(q) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: UA });
    if (r.ok) return (await r.json()).results.bindings;
    console.log('  retry', r.status); await sleep(5000 * (i + 1));
  }
  throw new Error('SPARQL failed');
}
const v = (b, k) => b[k] ? b[k].value : '';
const qid = u => u.replace(/^.*\//, '');

/* rows for a Wikidata pattern on ?x (needs an English article) */
async function wd(pattern, yearExpr) {
  const q = `SELECT ?x ?t ?s ?d ?y WHERE { ${pattern}
    ?a schema:about ?x; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t .
    OPTIONAL { ?x wikibase:sitelinks ?s } OPTIONAL { ?x schema:description ?d FILTER(lang(?d)="en") }
    ${yearExpr ? 'OPTIONAL { ' + yearExpr + ' }' : ''} }`;
  return collapse(await sparql(q));
}
function collapse(bs) {
  const m = new Map();
  for (const b of bs) {
    const k = qid(v(b, 'x')) || v(b, 't');
    const y = v(b, 'y') ? parseInt(v(b, 'y').slice(0, 4), 10) : null;
    const e = m.get(k);
    if (!e) m.set(k, { t: v(b, 't'), q: qid(v(b, 'x')), s: +v(b, 's') || 0, d: v(b, 'd'), y });
    else if (y != null && (e.y == null || y < e.y)) e.y = y;
  }
  return [...m.values()];
}
/* pages of one English Wikipedia category (namespace 0), or the pages linked from a list article */
async function mw(kind, title) {
  const gen = kind === 'cat'
    ? `mwapi:generator "categorymembers"; mwapi:gcmtitle "${title}"; mwapi:gcmlimit "max"; mwapi:gcmnamespace "0".`
    : `mwapi:generator "links"; mwapi:titles "${title}"; mwapi:gpllimit "max"; mwapi:gplnamespace "0".`;
  const titles = (await sparql(`SELECT ?t WHERE { SERVICE wikibase:mwapi { bd:serviceParam wikibase:api "Generator"; wikibase:endpoint "en.wikipedia.org"; ${gen} ?t wikibase:apiOutput mwapi:title. } }`)).map(b => v(b, 't'));
  return enrich(titles);
}
/* Wikidata id, sitelinks and description for English Wikipedia titles (batches of 150); titles without an item keep q = '' */
async function enrich(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 150) {
    const part = titles.slice(i, i + 150);
    const vals = part.map(t => JSON.stringify(t) + "@en").join(" ");
    const bs = await sparql(`SELECT ?x ?t ?s ?d WHERE { VALUES ?t { ${vals} } ?a schema:name ?t; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?x . OPTIONAL { ?x wikibase:sitelinks ?s } OPTIONAL { ?x schema:description ?d FILTER(lang(?d)="en") } }`);
    const got = collapse(bs); const seen = new Set(got.map(r => r.t));
    out.push(...got, ...part.filter(t => !seen.has(t)).map(t => ({ t, q: '', s: 0, d: '', y: null })));
    await sleep(800);
  }
  return out;
}
async function cats(list) { const m = new Map(); for (const c of list) { for (const r of await mw('cat', c)) if (!m.has(r.t)) m.set(r.t, Object.assign(r, { c })); await sleep(1500); } return [...m.values()]; }

const P166 = (award) => `?x wdt:P166 wd:${award} .`;
const AWARD_YEAR = (award) => `?x p:P166 ?st . ?st ps:P166 wd:${award}; pq:P585 ?y .`;
const STATES13 = ['Connecticut', 'Delaware', 'Georgia (U.S. state)', 'Maryland', 'Massachusetts', 'New Hampshire', 'New Jersey', 'New York (state)', 'North Carolina', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'Virginia'];
const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia (U.S. state)', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York (state)', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington (state)', 'West Virginia', 'Wisconsin', 'Wyoming', 'Washington, D.C.'];

const SOURCES = {
  pmof: () => wd(P166('Q17144'), AWARD_YEAR('Q17144')),
  moh: () => wd(P166('Q203535'), AWARD_YEAR('Q203535')),
  nobel: () => wd(P166('Q35637'), AWARD_YEAR('Q35637')),
  cgm: () => wd(P166('Q721743'), AWARD_YEAR('Q721743')),
  nwr: () => wd('?x wdt:P31 wd:Q1410668 .', '?x wdt:P571 ?y .'),
  nhl: () => wd('?x p:P1435 ?h . ?h ps:P1435 wd:Q624232 . FILTER NOT EXISTS { ?h pq:P582 ?end }', '?x p:P1435 ?st . ?st ps:P1435 wd:Q624232; pq:P580 ?y .'),
  arlington: () => wd('?x wdt:P119 wd:Q216344 .'),
  'congressional-cemetery': () => wd('?x wdt:P119 wd:Q2892262 .'),
  dcn: () => wd('?x wdt:P31 wd:Q12063697 .'),
  tribes: () => wd('?x wdt:P31 wd:Q7840353 .'),
  forests: () => mw('links', 'List of national forests of the United States'),
  wilderness: () => mw('links', 'List of wilderness areas of the United States'),
  reservations: () => mw('links', 'List of Indian reservations in the United States'),
  'wd-union-rank': () => wd('?x wdt:P241 wd:Q1752901 . ?x wdt:P410 ?r . VALUES ?r {wd:Q4967196 wd:Q3280545 wd:Q152956 wd:Q157148 wd:Q83460 wd:Q723498 wd:Q5520187 wd:Q12146551}'),
  'wd-confed-rank': () => wd('?x wdt:P241 wd:Q1125021 . ?x wdt:P410 ?r . VALUES ?r {wd:Q4967196 wd:Q3280545 wd:Q152956 wd:Q157148 wd:Q83460 wd:Q723498 wd:Q5520187 wd:Q12146551}'),
  'union-generals': () => cats(['Category:Union army generals', 'Category:Union Army brigadier generals', 'Category:Union Army major generals']),
  'confed-generals': () => cats(['Category:Confederate States Army generals', 'Category:Confederate States Army brigadier generals', 'Category:Confederate States Army full generals', 'Category:Confederate States Army lieutenant generals', 'Category:Confederate States Army major generals']),
  'continental-congress': () => cats(STATES13.map(s => 'Category:Continental Congressmen from ' + s)),
  abolitionists: () => cats(['Category:American abolitionists', 'Category:African-American abolitionists', 'Category:American women abolitionists'].concat(US_STATES.map(s => 'Category:Abolitionists from ' + s))),
  suffragists: () => cats(['Category:American suffragists', 'Category:African-American suffragists', 'Category:Native American suffragists', 'Category:Hispanic and Latino American suffragists', 'Category:American suffragists of Chinese descent'].concat(US_STATES.map(s => 'Category:Suffragists from ' + s))),
};

(async () => {
  const want = process.argv.slice(2);
  for (const [key, fn] of Object.entries(SOURCES)) {
    const file = path.join(OUT, key + '.json');
    if (want.length ? !want.includes(key) : fs.existsSync(file)) continue;
    process.stdout.write(key + ' ... ');
    try { const rows = await fn(); fs.writeFileSync(file, JSON.stringify(rows)); console.log(rows.length); }
    catch (e) { console.log('FAILED', e.message); }
    await sleep(2000);
  }
})();
