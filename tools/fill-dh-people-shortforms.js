#!/usr/bin/env node
/* Add the well-known short forms in site/tools/dh-people-shortforms.json (AOC, LBJ, Tip O'Neill, maiden/married names...) as aliases to every Dark Horse
   question in the manifest whose answers include that person. An alias is added only when no OTHER answer of the question already owns that spelling.
   Output: an edits file for dh-answer-edits.js on stdout. Usage: node site/tools/fill-dh-people-shortforms.js > audit/answers-dh-edits-r3-shortforms.json */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse', 'data');
const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'dark-horse', 'trivia.js'), 'utf8');
const s0 = src.indexOf('/* ---------- matching'), s1 = src.indexOf('/* Optimal string');
const norm = new Function(src.slice(s0, s1) + '\nreturn norm;')();
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'dh-people-shortforms.json'), 'utf8')).entries;
const out = [];
JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).banks.forEach(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).questions.forEach(q => {
  const owner = new Map(); q.answers.forEach((a, i) => [a.name].concat(a.aliases || []).forEach(x => { const k = norm(x); if (!owner.has(k)) owner.set(k, i); }));
  T.forEach(e => {
    let i = -1; for (const m of e.match) { const k = norm(m); if (owner.has(k)) { i = owner.get(k); break; } }
    if (i < 0) return;
    e.forms.forEach(x => { const k = norm(x); if (!k || owner.has(k)) return; owner.set(k, i); out.push({ q: q.id, op: 'alias', name: q.answers[i].name, alias: x, source: 'well-known short form / nickname (site/tools/dh-people-shortforms.json)', reason: 'common name players type' }); });
  });
}));
process.stdout.write(JSON.stringify(out, null, 1) + '\n'); console.error(out.length + ' alias edits');
