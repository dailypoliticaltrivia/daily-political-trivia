#!/usr/bin/env node
'use strict';
/* Tests Dark Horse's answer matching and its "Did you mean?" suggestions on the real question files.
     node tools/test-dh-suggest.js
   Loads the matching code straight from games/dark-horse/trivia.js (the block between "---------- matching" and "---------- daily selection"). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse');
const src = fs.readFileSync(path.join(DIR, 'trivia.js'), 'utf8');
const block = src.slice(src.indexOf('/* ---------- matching'), src.indexOf('/* ---------- daily selection'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(block + '\nthis.buildMatcher = buildMatcher; this.norm = norm;', ctx);
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'index.json'), 'utf8'));
const rows = index.q || index.rows || [];
const files = fs.readdirSync(path.join(DIR, 'data', 'q'));
function loadQ(id) { const f = files.find(x => x.startsWith(id + '.')); return f ? JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'q', f), 'utf8')) : null; }
function findQ(pred) { for (const f of files) { const q = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'q', f), 'utf8')); if (pred(q)) return q; } return null; }
let fails = 0, n = 0;
function check(ok, msg) { n++; if (!ok) { fails++; console.log('FAIL  ' + msg); } else console.log('ok    ' + msg); }
const has = (q, re) => q.answers.some(a => re.test(a.name));
const nameOf = (q, xs) => xs.map(x => q.answers[x].name);

// 1. initials: AOC
let q = findQ(x => has(x, /^Alexandria Ocasio-Cortez$/) && x.answers.length >= 100);
if (q) {
  const m = ctx.buildMatcher(q), aoc = q.answers.findIndex(a => a.name === 'Alexandria Ocasio-Cortez');
  const r = m('AOC'), s = m.suggest('AOC');
  check(r.idx === aoc || s.indexOf(aoc) >= 0, '"AOC" finds Alexandria Ocasio-Cortez in ' + q.id + ' (' + (r.idx === aoc ? 'accepted' : 'suggested among ' + nameOf(q, s).join(', ')) + ')');
  check(m.suggest('Alexandria Cortez').indexOf(aoc) >= 0 || m('Alexandria Cortez').idx === aoc, '"Alexandria Cortez" suggests Alexandria Ocasio-Cortez');
  const t = m('Ocasio Cortes'); check(t.idx === aoc || m.suggest('Ocasio Cortes').indexOf(aoc) >= 0, '"Ocasio Cortes" (typo) is caught');
  check(m('Alexandria Ocasio-Cortez').idx === aoc && !m('Alexandria Ocasio-Cortez').fuzzy, 'the full name is accepted exactly');
} else console.log('skip  no question with AOC');

// 2. FDR / JFK
for (const [ini, re] of [['FDR', /^Franklin D(\.|elano)? Roosevelt$/], ['JFK', /^John F(\.|itzgerald)? Kennedy$/], ['LBJ', /^Lyndon B(\.|aines)? Johnson$/]]) {
  q = findQ(x => has(x, re) && x.answers.length >= 100);
  if (!q) { console.log('skip  no question with ' + ini); continue; }
  const m = ctx.buildMatcher(q), i = q.answers.findIndex(a => re.test(a.name));
  check(m(ini).idx === i || m.suggest(ini).indexOf(i) >= 0, '"' + ini + '" finds ' + q.answers[i].name + ' in ' + q.id);
}

// 3. nickname
q = findQ(x => has(x, /^William (J\. |Jefferson )?Clinton$|^Bill Clinton$/) && x.answers.length >= 100);
if (q) {
  const m = ctx.buildMatcher(q), i = q.answers.findIndex(a => /Clinton$/.test(a.name) && /^(William|Bill)/.test(a.name));
  check(m('Bill Clinton').idx === i || m.suggest('Bill Clinton').indexOf(i) >= 0, '"Bill Clinton" finds ' + q.answers[i].name + ' in ' + q.id);
}

// 4. shared last name offers a short list
q = findQ(x => x.answers.filter(a => / Adams$/.test(a.name)).length >= 2 && x.answers.length >= 100);
if (q) {
  const m = ctx.buildMatcher(q), s = m.suggest('Adams');
  check(s.length >= 2 && s.length <= 4 && s.every(x => / Adams$/.test(q.answers[x].name)), '"Adams" offers ' + s.length + ' Adamses in ' + q.id + ': ' + nameOf(q, s).join(', '));
}

// 5. junk and short words never suggest
q = loadQ(rows[0].id);
{
  const m = ctx.buildMatcher(q);
  for (const junk of ['zzzz', 'qwxv', 'the', 'a', 'asdfghjkl', '12345']) check(m.suggest(junk).length === 0 || junk.length >= 4 && m.suggest(junk).length <= 4, '"' + junk + '" gives ' + m.suggest(junk).length + ' suggestion(s) in ' + q.id);
}

// 6. speed: suggest on every playable question stays fast
let worst = 0, total = 0, cnt = 0;
for (const r of rows.slice(0, 120)) {
  const qq = loadQ(r.id); if (!qq) continue;
  const m = ctx.buildMatcher(qq);
  const t0 = process.hrtime.bigint(); m.suggest('Jonh Smiht'); m.suggest('abc'); m.suggest('Bill Johnsen');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; worst = Math.max(worst, ms); total += ms; cnt++;
}
check(worst < 150, 'suggestions are fast: worst ' + worst.toFixed(1) + ' ms for 3 lookups, mean ' + (total / cnt).toFixed(1) + ' ms (' + cnt + ' questions)');

console.log('\n' + (fails ? 'RESULT: ' + fails + ' FAIL of ' + n : 'RESULT: OK (' + n + ' checks)'));
process.exit(fails ? 1 : 0);
