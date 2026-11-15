#!/usr/bin/env node
'use strict';
/* Draws a seeded random sample of answers from the built curated banks and fetches the English Wikipedia introduction of each,
   so a reviewer can check the answer against the question. Output: audit/dh-curated-data/_sample.json (and a readable list on screen).
   Usage: node site/tools/sample-dh-curated.js [perQuestion=5] [seed=1] */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated-data');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const per = +process.argv[2] || 5, seed0 = +process.argv[3] || 1;
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;   // optional: only these question keys
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seed = seed0; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
async function api(params) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch('https://en.wikipedia.org/w/api.php?format=json&' + new URLSearchParams(params), { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    await sleep(Math.min(60, (+r.headers.get('retry-after') || 10) * (i + 1)) * 1000);
  }
  throw new Error('api');
}
(async () => {
  const titles = JSON.parse(fs.readFileSync(path.join(DATA, '_titles.json'), 'utf8'));
  const rep = JSON.parse(fs.readFileSync(path.join(DATA, '_report.json'), 'utf8')).report;
  const keyOf = Object.fromEntries(rep.map(r => [r.id, r.key]));
  const picks = [];
  for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated-\d+\.json$/.test(f))) {
    const b = JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8'));
    for (const q of b.questions) {
      if (ONLY && !ONLY.includes(keyOf[q.id])) continue;
      const t = titles[q.id] || {};
      const pool = q.answers.filter(a => !a.jackpot);
      const chosen = new Set();
      while (chosen.size < Math.min(per, pool.length)) chosen.add(Math.floor(rnd() * pool.length));
      const list = [...chosen].map(i => pool[i]);
      const jp = q.answers.find(a => a.jackpot); if (jp) list.push(jp);
      for (const a of list) picks.push({ id: q.id, key: keyOf[q.id], prompt: q.prompt, answer: a.name, weight: a.weight, jackpot: !!a.jackpot, jnote: a.note || '', title: t[a.name] ? t[a.name][0] : null, qid: t[a.name] ? t[a.name][1] : null, year: t[a.name] ? t[a.name][2] : null });
    }
  }
  const withT = picks.filter(p => p.title);
  for (let i = 0; i < withT.length; i += 20) {
    const batch = withT.slice(i, i + 20);
    const j = await api({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: '20', redirects: '1', titles: batch.map(p => p.title).join('|') });
    const map = {}; (j.query.redirects || []).forEach(r => map[r.from] = r.to); (j.query.normalized || []).forEach(r => map[r.from] = r.to);
    const pages = Object.values(j.query.pages);
    for (const p of batch) { let t = map[p.title] || p.title; t = map[t] || t; const pg = pages.find(x => x.title === t); p.extract = pg && pg.extract ? pg.extract.replace(/\s+/g, ' ').slice(0, 400) : ''; p.url = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')); }
    await sleep(1000);
  }
  fs.writeFileSync(path.join(DATA, '_sample.json'), JSON.stringify(picks, null, 1));
  console.log(picks.length + ' samples');
})();
