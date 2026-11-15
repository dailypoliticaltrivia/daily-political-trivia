#!/usr/bin/env node
/* Answer-completeness probe: runs the real Dark Horse matcher (norm/dist/buildMatcher copied out of games/dark-horse/trivia.js at run time)
   over a list of "question id <TAB> spelling | spelling | ..." lines (what a player might type) and prints the ones that are NOT accepted.
   Usage: node site/tools/test-dh-spellings.js <probes.tsv>   (lines starting with # are comments) */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse');
const src = fs.readFileSync(path.join(DIR, 'trivia.js'), 'utf8');
const a = src.indexOf('function norm('), b = src.indexOf('/* ---------- daily selection');
const { buildMatcher } = new Function(src.slice(a, b) + '\nreturn { norm, buildMatcher };')();
const man = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'manifest.json'), 'utf8')).banks;
const Q = {}; man.forEach(f => JSON.parse(fs.readFileSync(path.join(DIR, 'data', f), 'utf8')).questions.forEach(q => { Q[q.id] = q; }));
if (!process.argv[2] || process.argv[2].startsWith('-')) { console.log('usage: node site/tools/test-dh-spellings.js <probes.txt> [-v]   (probe files: audit/answers-probes/)'); process.exit(0); }
const M = {};
let bad = 0, n = 0;
fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).forEach(l => {
  if (!l.trim() || l.startsWith('#')) return;
  const [id, list] = l.split('\t'); const q = Q[id]; if (!q) { console.log('no question', id); return; }
  const m = M[id] || (M[id] = buildMatcher(q));
  (list || '').split('|').map(s => s.trim()).filter(Boolean).forEach(typed => {
    const r = m(typed); n++;
    if (r.idx == null) { bad++; console.log(`MISS ${id}\t${typed}\t${r.ambiguous ? '(ambiguous)' : ''}`); }
    else if (process.argv.includes('-v')) console.log(`ok   ${id}\t${typed}\t-> ${q.answers[r.idx].name}${r.fuzzy ? ' (typo)' : ''}`);
  });
});
console.log(`${n - bad} of ${n} accepted`);
