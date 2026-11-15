#!/usr/bin/env node
/* Caucus Sort fact-check sheets: one row per placed face (puzzle, date, group title, person, the other 3 titles).
   Usage: node site/tools/caucus-check-sheet.js <firstPuzzleNo> <lastPuzzleNo> <out.tsv>   (puzzle numbers are 1-based: c0110 = 110) */
'use strict';
const fs = require('fs'), path = require('path');
const [a, b, out] = process.argv.slice(2);
if (!out) { console.error('usage: caucus-check-sheet.js <first> <last> <out.tsv>'); process.exit(2); }
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'games', 'caucus-sort', 'data', 'puzzles.json'), 'utf8')).puzzles;
const E = Date.UTC(2026, 10, 11), rows = ['n\tpuzzle\tdate\tgroup\tperson\tother_groups_in_puzzle']; let n = 1;
for (let i = +a - 1; i <= Math.min(+b, P.length) - 1; i++) { const pz = P[i], d = new Date(E + i * 864e5).toISOString().slice(0, 10);
  pz.g.forEach(g => g.p.forEach(p => rows.push([n++, pz.id, d, g.t, p[0], pz.g.filter(o => o !== g).map(o => o.t).join(' | ')].join('\t')))); }
fs.writeFileSync(out, rows.join('\n') + '\n'); console.log(out + ': ' + (rows.length - 1) + ' rows');
