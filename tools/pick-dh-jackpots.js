#!/usr/bin/env node
'use strict';
/* Picks one Dark Horse (jackpot) answer per question where the source gives a year, and VERIFIES it against the English Wikipedia introduction:
   the candidate must be a weight-5 answer that exists in at least 2 Wikipedia languages and whose recorded year appears in the article introduction.
   Output: audit/dh-curated-data/_jackpots.json  ({ key: { title, note, year, url } }).  Run build-dh-curated.js afterwards to write the banks.
   Usage: node site/tools/pick-dh-jackpots.js [seed=7] */
const fs = require('fs');
const path = require('path');
const { Q } = require('./dh-curated-config.js');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated-data');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seed = +process.argv[2] || 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
async function api(params) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch('https://en.wikipedia.org/w/api.php?format=json&' + new URLSearchParams(params), { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    await sleep(Math.min(60, (+r.headers.get('retry-after') || 10) * (i + 1)) * 1000);
  }
  throw new Error('api');
}
async function intros(titles) {
  const j = await api({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: String(titles.length), redirects: '1', titles: titles.join('|') });
  const map = {}; (j.query.redirects || []).forEach(r => map[r.from] = r.to); (j.query.normalized || []).forEach(r => map[r.from] = r.to);
  const pages = Object.values(j.query.pages);
  const out = {};
  for (const t of titles) { let x = map[t] || t; x = map[x] || x; const pg = pages.find(p => p.title === x); out[t] = pg && pg.extract ? pg.extract : ''; }
  return out;
}
(async () => {
  const titles = JSON.parse(fs.readFileSync(path.join(DATA, '_titles.json'), 'utf8'));
  const rep = JSON.parse(fs.readFileSync(path.join(DATA, '_report.json'), 'utf8')).report;
  const idOf = Object.fromEntries(rep.map(r => [r.key, r.id]));
  const bank = {};
  for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated-\d+\.json$/.test(f))) for (const q of JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8')).questions) bank[q.id] = q;
  const prev = fs.existsSync(path.join(DATA, '_jackpots.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, '_jackpots.json'), 'utf8')) : {};
  const result = {};
  for (const c of Q) {
    if (!c.jackpotYear || !idOf[c.key]) continue;
    const q = bank[idOf[c.key]]; const t = titles[q.id] || {};
    const cands = q.answers.filter(a => a.weight === 5 && t[a.name] && t[a.name][2] != null && t[a.name][3] >= 2 && !/^\d/.test(a.name));
    if (!cands.length) { console.log('no candidate', c.key); continue; }
    if (prev[c.key] && cands.some(a => t[a.name][0] === prev[c.key].title)) { result[c.key] = prev[c.key]; continue; }
    const pick = []; while (pick.length < Math.min(8, cands.length)) { const a = cands[Math.floor(rnd() * cands.length)]; if (!pick.includes(a)) pick.push(a); }
    const ex = await intros(pick.map(a => t[a.name][0]));
    let done = false;
    for (const a of pick) {
      const [full, , y] = t[a.name]; const text = ex[full] || '';
      if (text && new RegExp('\\b' + Math.abs(y) + '\\b').test(text) && y > 0) {
        result[c.key] = { title: full, name: a.name, year: y, note: c.jackpotYear.replace('{y}', y), url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(full.replace(/ /g, '_')), intro: text.slice(0, 260) };
        done = true; console.log('jackpot', c.key, '->', a.name, y); break;
      }
    }
    if (!done) console.log('NO VERIFIED JACKPOT', c.key);
    await sleep(800);
  }
  fs.writeFileSync(path.join(DATA, '_jackpots.json'), JSON.stringify(result, null, 1));
})();
