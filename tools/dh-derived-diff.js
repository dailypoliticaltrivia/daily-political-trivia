#!/usr/bin/env node
/* Compare a trial run of the derived generators (--out <dir>) with the live banks, question by question (matched by prompt), and write an edits file
   with the ANSWERS THE TRIAL HAS AND THE LIVE BANK LACKS (additions only; removals are only reported).
   Usage: node site/tools/dh-derived-diff.js <trial dir> <bank prefix: bank-derived- | bank-derived2-> <edits out.json> "<reason>" */
'use strict';
const fs = require('fs'), path = require('path');
const [dir, prefix, outF, reason] = process.argv.slice(2);
const D = path.join(__dirname, '..', 'games', 'dark-horse', 'data');
const live = {}, trial = {};
fs.readdirSync(D).filter(f => f.startsWith(prefix) && /^\D*-?\d+\.json$/.test(f.slice(prefix.length - 1))).forEach(f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).questions.forEach(q => { live[q.prompt] = q; }));
fs.readdirSync(dir).filter(f => f.startsWith(prefix)).forEach(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).questions.forEach(q => { trial[q.prompt] = q; }));
const ed = []; let rem = 0;
for (const p in live) {
  const a = live[p], b = trial[p]; if (!b) continue;
  const A = new Set(a.answers.map(x => x.name)), B = new Set(b.answers.map(x => x.name));
  b.answers.filter(x => !A.has(x.name)).forEach(x => ed.push({ q: a.id, op: 'add', name: x.name, aliases: x.aliases || [], weight: x.weight, source: 'derived generator re-run', reason }));
  const r = [...A].filter(x => !B.has(x)); rem += r.length; if (r.length) console.log(`only in live ${a.id}: ${r.slice(0, 8).join('; ')}`);
}
fs.writeFileSync(outF, JSON.stringify(ed, null, 1));
console.log(`${ed.length} additions (${new Set(ed.map(e => e.q)).size} questions); ${rem} live answers not in the trial (reported only)`);
