#!/usr/bin/env node
'use strict';
/* Proposes Dark Horse (jackpot) answers for the round-2 curated banks. A Dark Horse answer must be real, obscure (weight 5) and carry a one-line reveal note whose
   fact is checkable. Census-based questions (places, counties) take the least populous entry with a distinct name (note: population from the Census file). For the
   others the script lists the 5 best-known tier-5 answers that have a year, reads their Wikipedia lead (REST summary, one request at a time, cached in
   _sample-leads.json) and writes audit/dh-curated2-data/_jp-cands.txt for a human to choose from; the choice goes into _jackpots2.json {questionKey: {title, note}}.
   Usage: node site/tools/pick-dh-curated-2-jackpots.js [--no-fetch] */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated2-data');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const UA = 'StayInformedNewsTriviaBot-curated2/1.0 (educational trivia research; sequential verification)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = JSON.parse(fs.readFileSync(path.join(DATA, '_report.json'), 'utf8')).report;
const titles = JSON.parse(fs.readFileSync(path.join(DATA, '_titles.json'), 'utf8'));
const cacheFile = path.join(DATA, '_sample-leads.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const OLD = path.join(ROOT, 'audit', 'dh-curated-data');
const jpFile = path.join(DATA, '_jackpots2.json');
const jp = fs.existsSync(jpFile) ? JSON.parse(fs.readFileSync(jpFile, 'utf8')) : {};
const cands = [];
const places = JSON.parse(fs.readFileSync(path.join(OLD, 'us-places-10k.json'), 'utf8')), counties = JSON.parse(fs.readFileSync(path.join(OLD, 'us-counties.json'), 'utf8'));
for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated2-\d+\.json$/.test(f))) {
  for (const q of JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8')).questions) {
    const key = (report.find(x => x.id === q.id) || {}).key;
    const m = key && key.match(/^(places|counties)-(.+)$/);
    if (m) { // Census-based: smallest place with a distinct name
      const st = m[2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const names = new Map(q.answers.map(a => [a.name, a]));
      const pool = (m[1] === 'places' ? places : counties).filter(r => r.st === st).sort((a, b) => a.pop - b.pop);
      for (const r of pool) {
        const base = m[1] === 'places' ? r.n.replace(/\s+(city and borough|city|town|village|borough|municipality|plantation|corporation)\s*$/i, '').trim() : r.n;
        const a = names.get(base);
        if (a && a.weight === 5 && base.length >= 5 && !/ County$/.test(base) === (m[1] === 'places')) { jp[key] = { title: base, note: (m[1] === 'places' ? 'About ' : 'About ') + r.pop.toLocaleString('en-US') + ' residents in the Census Bureau 2023 estimate.' }; break; }
      }
      continue;
    }
    const tt = titles[q.id] || {};
    const list = q.answers.filter(a => a.weight === 5 && !a.jackpot && tt[a.name] && tt[a.name][2]).map(a => ({ a, t: tt[a.name] })).slice(0, 5);
    cands.push({ key, id: q.id, list: list.map(x => ({ name: x.a.name, full: x.t[0], year: x.t[2] })) });
  }
}
(async () => {
  if (!process.argv.includes('--no-fetch')) {
    let nreq = 0;
    for (const c of cands) for (const x of c.list) {
      if (x.full in cache) continue;
      if (++nreq % 10 === 0) { fs.writeFileSync(cacheFile, JSON.stringify(cache)); console.log('  leads', nreq); }
      const u = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(x.full.replace(/ /g, '_')) + '?redirect=true';
      for (let k = 0; k < 30; k++) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': UA } });
          if (r.status === 404) { cache[x.full] = ''; break; }
          if (r.ok) { const j = await r.json(); cache[x.full] = (j.description ? '[' + j.description + '] ' : '') + (j.extract || '').slice(0, 500); await sleep(600); break; }
          await sleep(Math.min(90, (+r.headers.get('retry-after') || 10) + 2) * 1000);
        } catch (e) { await sleep(4000); }
      }
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  const out = [];
  for (const c of cands) { out.push('\n== ' + c.key + ' (' + c.id + ')'); for (const x of c.list) out.push(`- ${x.name} | year ${x.year} | ${(cache[x.full] || '(no lead cached)').slice(0, 260)}`); }
  fs.writeFileSync(path.join(DATA, '_jp-cands.txt'), out.join('\n'));
  fs.writeFileSync(jpFile, JSON.stringify(jp, null, 1));
  console.log('census jackpots:', Object.keys(jp).length, 'candidate questions:', cands.length);
})();
