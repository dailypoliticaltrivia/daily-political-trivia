#!/usr/bin/env node
'use strict';
/* Draws the stratified verification sample for the round-2 curated banks and reads the English Wikipedia lead of every sampled title (REST summary endpoint,
   one request at a time because the shared IP is rate-limited). Output: audit/dh-curated2-data/_sample.json  [{id, key, name, full, weight, year, lead}]
   Usage: node site/tools/sample-dh-curated-2.js [perTier=1] [tail=2] [--no-fetch]
   Stratification per question: perTier answers from each weight tier 1-5, plus `tail` extra answers from tier 5 (the obscure tail), plus up to 2 answers whose
   names contain digits, "and", punctuation or one word (the usual failure cases). Seeded, so a re-run draws the same sample. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated2-data');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const UA = 'StayInformedNewsTriviaBot-curated2/1.0 (educational trivia research; sequential verification)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const perTier = +args[0] || 1, tail = args[1] != null ? +args[1] : 2;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const report = JSON.parse(fs.readFileSync(path.join(DATA, '_report.json'), 'utf8')).report;
const titles = JSON.parse(fs.readFileSync(path.join(DATA, '_titles.json'), 'utf8'));
const cacheFile = path.join(DATA, '_sample-leads.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null, OUTF = process.env.OUT || '_sample.json'; // ONLY=regex on the question key, OUT=file: extra sample for the riskiest questions
const sample = [];
for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated2-\d+\.json$/.test(f))) {
  for (const q of JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8')).questions) {
    const r = report.find(x => x.id === q.id); const key = r ? r.key : q.id;
    if (/^(places-|counties-)/.test(key) || (ONLY && !ONLY.test(key))) continue; // Census-based: checked against the Census Gazetteer instead (check-dh-curated-2-gazetteer.js)
    const R = rng([...q.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const pick = (arr, n, used) => { const pool = arr.filter(a => !used.has(a.name)); const out = []; while (out.length < n && pool.length) { out.push(pool.splice(Math.floor(R() * pool.length), 1)[0]); } out.forEach(a => used.add(a.name)); return out; };
    const used = new Set(); const chosen = [];
    for (let w = 1; w <= 5; w++) chosen.push(...pick(q.answers.filter(a => a.weight === w && !a.jackpot), perTier, used).map(a => [a, 'tier' + w]));
    chosen.push(...pick(q.answers.filter(a => a.weight === 5 && !a.jackpot), tail, used).map(a => [a, 'tail']));
    chosen.push(...pick(q.answers.filter(a => /[0-9]|\band\b|[,&:;]|^\S+$/i.test(a.name) && !a.jackpot), 2, used).map(a => [a, 'odd']));
    const jp = q.answers.find(a => a.jackpot); if (jp) chosen.push([jp, 'jackpot']);
    for (const [a, why] of chosen) { const t = (titles[q.id] || {})[a.name]; sample.push({ id: q.id, key, name: a.name, full: t ? t[0] : a.name, weight: a.weight, year: t ? t[2] : null, why }); }
  }
}
console.log('sample rows:', sample.length);
(async () => {
  if (!process.argv.includes('--no-fetch')) {
    let done = 0;
    for (const s of sample) {
      if (s.full in cache) continue;
      const u = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(s.full.replace(/ /g, '_')) + '?redirect=true';
      for (let k = 0; k < 30; k++) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': UA } });
          if (r.status === 404) { cache[s.full] = ''; break; }
          if (r.ok) { const j = await r.json(); cache[s.full] = (j.description ? '[' + j.description + '] ' : '') + (j.extract || '').slice(0, 500); await sleep(600); break; }
          await sleep(Math.min(90, (+r.headers.get('retry-after') || 10) + 2) * 1000);
        } catch (e) { await sleep(4000); }
      }
      if (++done % 20 === 0) { fs.writeFileSync(cacheFile, JSON.stringify(cache)); console.log('  leads', done); }
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  for (const s of sample) s.lead = cache[s.full] != null ? cache[s.full] : null;
  fs.writeFileSync(path.join(DATA, OUTF), JSON.stringify(sample, null, 1));
  console.log('written _sample.json; leads missing:', sample.filter(s => s.lead == null).length);
})();
