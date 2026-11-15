#!/usr/bin/env node
/* For each MISS line of a test-dh-spellings result, list the answers of that question that contain all the typed words (to tell a missing alias from a missing answer).
   Usage: node site/tools/dh-probe-nearest.js <result.txt> */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse');
const src = fs.readFileSync(path.join(DIR, 'trivia.js'), 'utf8');
const norm = new Function(src.slice(src.indexOf('function norm('), src.indexOf('/* Optimal string')) + '\nreturn norm;')();
const Q = {}; JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'manifest.json'), 'utf8')).banks.forEach(f => JSON.parse(fs.readFileSync(path.join(DIR, 'data', f), 'utf8')).questions.forEach(q => { Q[q.id] = q; }));
const STOP = new Set(['of', 'the', 'and', 'act', 'v', 'us', 'united', 'states', 'treaty', 'battle', 'war', 'party', 'of']);
fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(l => l.startsWith('MISS ')).forEach(l => {
  const [id, typed] = l.slice(5).split('\t'); const q = Q[id];
  const tw = norm(typed).split(' ').filter(w => !STOP.has(w));
  const hits = !tw.length ? [] : q.answers.filter(a => [a.name].concat(a.aliases || []).some(x => { const k = ' ' + norm(x) + ' '; return tw.every(w => k.includes(' ' + w + ' ') || (w.length > 4 && k.includes(' ' + w))); }));
  console.log(`${id}\t${typed}\t=> ${hits.length ? hits.slice(0, 6).map(a => a.name).join(' ; ') + (hits.length > 6 ? ` (+${hits.length - 6})` : '') : 'NOTHING'}`);
});
