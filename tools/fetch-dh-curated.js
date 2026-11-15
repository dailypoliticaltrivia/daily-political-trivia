#!/usr/bin/env node
'use strict';
/* Downloads the source listings for the Dark Horse curated questions (see dh-curated-config.js).
   Output: audit/dh-curated-data/<key>.json  (list of {t: English Wikipedia title, s: Wikipedia language editions, st: Wikidata statements, y: year or null})
   Usage: node site/tools/fetch-dh-curated.js [--force] [key ...]
   Needs internet. Be patient: Wikidata asks clients to wait when busy. */
const fs = require('fs');
const path = require('path');
const { Q } = require('./dh-curated-config.js');
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const OUT = path.join(__dirname, '..', '..', 'audit', 'dh-curated-data');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opt = {}) {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(url, { method: opt.method, body: opt.body, headers: Object.assign({ 'User-Agent': UA }, opt.headers || {}) });
      if (r.ok) return r;
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(60, (+r.headers.get('retry-after') || 10) * (i + 1)) * 1000); continue; }
      throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === 7) throw e; await sleep(3000); }
  }
}
async function sparql(q) {
  const r = await get('https://query.wikidata.org/sparql', { method: 'POST', headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(q) });
  return (await r.json()).results.bindings;
}
function buildQuery(c) {
  const q = c.q, lo = q.lo, hi = q.hi;
  const hasDate = !!q.date;
  let filt = '';
  if (hasDate && (lo != null || hi != null)) filt = 'FILTER(BOUND(?y)' + (lo != null ? ' && ?y >= ' + lo : '') + (hi != null ? ' && ?y <= ' + hi : '') + ')';
  const sl = q.minSitelinks ? 'FILTER(?s >= ' + q.minSitelinks + ')' : '';
  return `SELECT ?x ?t ?s ?st (SAMPLE(?dd) AS ?ds) (MIN(?y) AS ?yy) WHERE { ${q.pattern}
  ?a schema:about ?x; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. ?x wikibase:sitelinks ?s; wikibase:statements ?st.
  OPTIONAL { ?x schema:description ?dd. FILTER(LANG(?dd) = 'en') }
  ${hasDate ? 'OPTIONAL { ?x ' + q.date + ' ?d0. } BIND(YEAR(?d0) AS ?y)' : ''} ${filt} ${sl} }
  GROUP BY ?x ?t ?s ?st ORDER BY DESC(?s) DESC(?st) LIMIT ${q.limit || 6000}`;
}
function csvRows(text) { // simple CSV parser (handles quotes)
  const rows = []; let row = [], f = '', inq = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inq) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inq = false; } else f += ch; }
    else if (ch === '"') inq = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function census(c) {
  const text = (await (await get(c.url)).text()).replace(/^﻿/, '');
  const rows = csvRows(text); const h = rows[0]; const ix = n => h.indexOf(n);
  const out = [];
  if (c.kind === 'census-county') {
    for (const r of rows.slice(1)) {
      if (r[ix('SUMLEV')] !== '050' || r[ix('STNAME')] === 'Puerto Rico') continue;
      if (r[ix('STNAME')] === 'Connecticut') continue; // Vintage 2023 lists 9 "planning regions" instead of counties (recheck fix); the 8 counties come from Vintage 2021 below (Vintages 2022 and 2023 already use planning regions)
      out.push({ n: r[ix('CTYNAME')], st: r[ix('STNAME')], pop: +r[ix('POPESTIMATE2023')] });
    }
    const t22 = (await (await get('https://www2.census.gov/programs-surveys/popest/datasets/2020-2021/counties/totals/co-est2021-alldata.csv')).text()).replace(/^﻿/, '');
    const r22 = csvRows(t22), h22 = r22[0], i22 = n => h22.indexOf(n);
    for (const r of r22.slice(1)) if (r[i22('SUMLEV')] === '050' && r[i22('STNAME')] === 'Connecticut') out.push({ n: r[i22('CTYNAME')], st: 'Connecticut', pop: +r[i22('POPESTIMATE2021')] });
  } else {
    const NE = ['Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'Rhode Island', 'Vermont'];
    for (const r of rows.slice(1)) {
      const lev = r[ix('SUMLEV')], nm = r[ix('NAME')], st = r[ix('STNAME')];
      // recheck fix: in New England the towns are county subdivisions (SUMLEV 061), not "places"; add them so Brookline, West Hartford etc. count
      const neTown = lev === '061' && NE.includes(st) && / town$/.test(nm);
      if ((lev !== '162' && !neTown) || st === 'Puerto Rico') continue;
      out.push({ n: nm, st, pop: +r[ix('POPESTIMATE2023')] });
    }
  }
  return out;
}
let PARTIES = null, CONT = null;
// parties are fetched once (all parties with an enwiki article and a country), then split by the continent of the country
const { EXCLUDE } = require("./dh-curated-recheck-filters.js");
async function partiesByContinent(cont, q, key) {
  if (!PARTIES) {
    const pf = path.join(OUT, '_parties-all.json');
    if (fs.existsSync(pf)) PARTIES = JSON.parse(fs.readFileSync(pf, 'utf8'));
    else {
      const rows = await sparql(`SELECT ?x ?t ?s ?st ?c (SAMPLE(?dd) AS ?ds) (MIN(?y) AS ?yy) WHERE { OPTIONAL { ?x schema:description ?dd. FILTER(LANG(?dd) = 'en') } ?x wdt:P31 wd:Q7278; wdt:P17 ?c. ?a schema:about ?x; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. ?x wikibase:sitelinks ?s; wikibase:statements ?st. OPTIONAL { ?x wdt:P571 ?d0. } BIND(YEAR(?d0) AS ?y) } GROUP BY ?x ?t ?s ?st ?c`);
      PARTIES = rows.map(b => ({ t: b.t.value, s: +b.s.value, st: +b.st.value, y: b.yy && b.yy.value !== '' ? +b.yy.value : null, q: b.x.value.split('/').pop(), c: b.c.value.split('/').pop(), ds: b.ds ? b.ds.value : '' }));
      fs.writeFileSync(pf, JSON.stringify(PARTIES));
    }
    const cf = path.join(OUT, '_country-continents.json');
    if (fs.existsSync(cf)) CONT = JSON.parse(fs.readFileSync(cf, 'utf8'));
    else {
      const rows = await sparql('SELECT ?c ?k WHERE { ?c wdt:P30 ?k. VALUES ?k { wd:Q46 wd:Q48 wd:Q15 wd:Q18 wd:Q49 wd:Q55643 wd:Q51 } }');
      CONT = {}; rows.forEach(b => { (CONT[b.c.value.split('/').pop()] = CONT[b.c.value.split('/').pop()] || []).push(b.k.value.split('/').pop()); });
      fs.writeFileSync(cf, JSON.stringify(CONT));
    }
  }
  const seen = new Set(), out = [];
  for (const p of PARTIES) { if ((CONT[p.c] || []).includes(cont) && !((EXCLUDE[key] || []).includes(p.c)) && !seen.has(p.q) && (q.lo == null && q.hi == null || (p.y != null && (q.lo == null || p.y >= q.lo) && (q.hi == null || p.y <= q.hi)))) { seen.add(p.q); out.push({ t: p.t, s: p.s, st: p.st, y: p.y, q: p.q, ds: p.ds }); } }
  return out.sort((a, b) => b.s - a.s || b.st - a.st);
}
(async () => {
  const args = process.argv.slice(2); const force = args.includes('--force');
  const keys = args.filter(a => !a.startsWith('--'));
  for (const c of Q) {
    if (keys.length && !keys.includes(c.key)) continue;
    const f = path.join(OUT, c.key + '.json');
    if (fs.existsSync(f) && !force) { console.log('have', c.key); continue; }
    try {
      let data;
      if (c.kind.startsWith('census')) data = await census(c);
      else if (c.q.merge) { const seen = new Set(); data = []; for (const k of c.q.merge) for (const r of JSON.parse(fs.readFileSync(path.join(OUT, k + '.json'), 'utf8'))) if (!seen.has(r.q)) { seen.add(r.q); data.push(r); } }
      else if (c.q.continent) data = await partiesByContinent(c.q.continent, c.q, c.key);
      else data = (await sparql(buildQuery(c))).map(b => ({ t: b.t.value, s: +b.s.value, st: +b.st.value, y: b.yy && b.yy.value !== '' ? +b.yy.value : null, q: b.x.value.split('/').pop(), ds: b.ds ? b.ds.value : '' }));
      fs.writeFileSync(f, JSON.stringify(data));
      console.log('saved', c.key, data.length);
    } catch (e) { console.log('FAILED', c.key, e.message); }
    await sleep(1500);
  }
})();
