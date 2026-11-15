#!/usr/bin/env node
'use strict';
/* Independent re-check sampler for the curated Dark Horse banks.
   node site/tools/recheck-dh-curated.js <seed> <perQuestion> <outfile> [key,key...]
   Picks a stratified sample per question (weights 1-5, extra picks from the obscure tail and from "odd" names), fetches the English Wikipedia introduction
   (secondary source) and writes TSV: id, name, weight, wikipedia title, qid, year, intro (first 330 chars). Judging is done by a human/model reading the output. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated-data');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const [seedArg, perArg, outFile, keysArg] = process.argv.slice(2);
let seed = +seedArg || 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const per = +perArg || 10;
const only = keysArg ? keysArg.split(',') : null;
const ids = JSON.parse(fs.readFileSync(path.join(DATA, '_ids.json'), 'utf8'));
const keyOf = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
const titles = JSON.parse(fs.readFileSync(path.join(DATA, '_titles.json'), 'utf8'));
const UA = 'StayInformedNewsTriviaBot/1.0 (educational trivia research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function intros(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 20) {
    const chunk = list.slice(i, i + 20);
    const p = new URLSearchParams({ format: 'json', action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '330', exlimit: '20', redirects: '1', titles: chunk.join('|') });
    let j; for (let k = 0; k < 12; k++) { const r = await fetch('https://en.wikipedia.org/w/api.php?' + p, { headers: { 'User-Agent': UA } }); if (r.ok) { j = await r.json(); break; } await sleep(Math.min(70, +r.headers.get('retry-after') || 20) * 1000); }
    if (!j) continue;
    const map = {}; (j.query.normalized || []).forEach(r => map[r.from] = r.to); (j.query.redirects || []).forEach(r => map[r.from] = r.to);
    const pages = Object.values(j.query.pages);
    for (const t of chunk) { let x = map[t] || t; x = map[x] || x; const pg = pages.find(q => q.title === x); out[t] = pg && pg.extract ? pg.extract.replace(/\s+/g, ' ') : '(NO EXTRACT)'; }
    await sleep(300);
  }
  return out;
}
(async () => {
  const CEN = {};
  for (const k of ['us-places-10k', 'us-places-small', 'us-counties']) { const lo = k === 'us-places-10k' ? 10000 : k === 'us-places-small' ? 1000 : 0, hi = k === 'us-places-small' ? 4999 : 1e12; CEN[k] = {}; for (const r of JSON.parse(fs.readFileSync(path.join(DATA, k + '.json'), 'utf8'))) { if (r.pop < lo || r.pop > hi) continue; const base = k === 'us-counties' ? r.n : r.n.replace(/s*((balance|part))s*$/i, '').replace(/s+(city and borough|consolidated government|metropolitan government|unified government|urban county|metro government|city|town|village|borough|municipality|plantation|corporation|county)s*$/i, ''); (CEN[k][base.toLowerCase()] = CEN[k][base.toLowerCase()] || []).push({ base, st: r.st, pop: r.pop }); } }
  const rows = [];
  for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated-\d+\.json$/.test(f))) for (const q of JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8')).questions) {
    const key = keyOf[q.id]; if (only && !only.includes(key)) continue;
    const t = titles[q.id] || {};
    const pick = new Set(); const byW = {}; q.answers.forEach((a, i) => (byW[a.weight] = byW[a.weight] || []).push(i));
    const take = (arr, n) => { arr = arr.filter(i => !pick.has(i)); for (let k = 0; k < n && arr.length; k++) { const j = Math.floor(rnd() * arr.length); pick.add(arr[j]); arr.splice(j, 1); } };
    const odd = q.answers.map((a, i) => i).filter(i => { const a = q.answers[i]; return a.weight >= 3 && (/\d|\band\b|\bof the\b|[,;:]/i.test(a.name) || a.name.split(' ').length >= 5 || (a.aliases || []).length >= 2 || a.name.split(' ').length === 1); });
    const plan = per >= 10 ? [[1, 1], [2, 1], [3, 2], [4, 2], [5, per - 6]] : [[1, 1], [2, 1], [3, 1], [4, 1], [5, per - 4]];
    take(odd, Math.max(2, Math.round(per / 5)));
    for (const [w, n] of plan) take(byW[w] || [], Math.max(0, n - [...pick].filter(i => q.answers[i].weight === w).length));
    while (pick.size < Math.min(per, q.answers.length)) take(byW[5] || byW[4] || [], 1);
    for (const i of pick) { const a = q.answers[i]; const m = t[a.name]; let full = m ? m[0] : a.name, y = m && m[2] != null ? m[2] : ''; if (CEN[key]) { const e = (CEN[key][a.name.toLowerCase()] || [])[0]; if (e) { full = e.base + ', ' + e.st; y = e.pop; } } rows.push({ id: q.id, key, name: a.name, w: a.weight, full, qid: m ? m[1] : '', y }); }
  }
  const ex = await intros([...new Set(rows.map(r => r.full))]);
  fs.writeFileSync(outFile, rows.map(r => [r.id, r.key, r.name, r.w, r.full, r.qid, r.y, ex[r.full] || ''].join('\t')).join('\n') + '\n');
  console.log(rows.length + ' rows -> ' + outFile);
})();
