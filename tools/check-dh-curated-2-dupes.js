#!/usr/bin/env node
'use strict';
/* Duplicate check of the round-2 curated questions against every other question in site/games/dark-horse/data (all banks listed in manifest.json, except the round-2 banks).
   For each round-2 question it reports the other question with the largest answer-set overlap and the most similar prompt:
     share of MINE that the other question also accepts, share of THEIRS that mine also accepts (answers compared by their normalised spellings, names and aliases).
   A round-2 question is flagged when both shares are above 0.8 (the same set), or when mine is more than 80 percent inside a much larger question (a slice of it).
   Usage: node site/tools/check-dh-curated-2-dupes.js   -> audit/dh-curated2-data/_dupes.json */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const norm = s => { s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr'); if (t.length > 1 && t[0] === 'the') t.shift(); return t.join(' '); };
const manifest = JSON.parse(fs.readFileSync(path.join(BANKS, 'manifest.json'), 'utf8')).banks;
const mine = [], others = [];
for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated2-\d+\.json$/.test(f))) for (const q of JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8')).questions) mine.push(q);
for (const f of manifest) { if (/^bank-curated2-/.test(f)) continue; const p = path.join(BANKS, f); if (!fs.existsSync(p)) continue; for (const q of JSON.parse(fs.readFileSync(p, 'utf8')).questions) others.push({ id: q.id, prompt: q.prompt, n: q.answers.length, keys: new Set(q.answers.flatMap(a => [a.name, ...(a.aliases || [])]).map(norm).filter(Boolean)), names: new Set(q.answers.map(a => norm(a.name))) }); }
const words = s => new Set(norm(s).split(' ').filter(w => w.length > 3));
const out = [];
for (const q of mine) {
  const mk = q.answers.map(a => [a.name, ...(a.aliases || [])].map(norm));
  const total = q.answers.length; const pw = words(q.prompt);
  let best = null, bestP = null;
  for (const o of others) {
    let hit = 0; for (const ks of mk) if (ks.some(k => o.keys.has(k))) hit++;
    const mineShare = hit / total, theirShare = o.n ? hit / o.n : 0;
    if (!best || mineShare > best.mineShare) best = { id: o.id, prompt: o.prompt, answers: o.n, mineShare: +mineShare.toFixed(3), theirShare: +Math.min(1, theirShare).toFixed(3) };
    const ow = words(o.prompt); let inter = 0; for (const w of pw) if (ow.has(w)) inter++;
    const sim = inter / Math.max(1, Math.min(pw.size, ow.size));
    if (!bestP || sim > bestP.sim) bestP = { id: o.id, prompt: o.prompt, sim: +sim.toFixed(2) };
  }
  const flag = best.mineShare > 0.8 ? (best.theirShare > 0.8 ? 'SAME SET' : (best.answers > 2 * total ? 'SLICE OF A LARGER QUESTION' : 'OVERLAP')) : '';
  out.push({ id: q.id, prompt: q.prompt, answers: total, mostOverlapping: best, mostSimilarPrompt: bestP, flag });
  console.log(q.id, String(total).padStart(5), flag.padEnd(28), 'best overlap', best.id, 'mine-in-theirs', best.mineShare, 'theirs-in-mine', best.theirShare, '| prompt-sim', bestP.sim, bestP.id);
}
fs.writeFileSync(path.join(ROOT, 'audit', 'dh-curated2-data', '_dupes.json'), JSON.stringify(out, null, 1));
