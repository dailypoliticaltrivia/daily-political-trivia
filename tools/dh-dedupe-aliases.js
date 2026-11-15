#!/usr/bin/env node
/* Remove Dark Horse aliases that the game's own norm() (read from games/dark-horse/trivia.js) makes identical to the answer's name or to an earlier alias
   of the same answer. Run after any change to norm(). Usage: node site/tools/dh-dedupe-aliases.js [--write] */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse');
const src = fs.readFileSync(path.join(DIR, 'trivia.js'), 'utf8');
const a = src.indexOf('function norm('); let depth = 0, i = src.indexOf('{', a);
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
const pre = src.slice(src.indexOf('/* ---------- matching'), a);   // helper tables norm() may use, defined just above it
const norm = new Function(pre.replace(/^\/\*[\s\S]*?\*\//, '') + src.slice(a, i + 1) + '\nreturn norm;')();
const WRITE = process.argv.includes('--write');
let total = 0;
JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'manifest.json'), 'utf8')).banks.forEach(f => {
  const p = path.join(DIR, 'data', f), bank = JSON.parse(fs.readFileSync(p, 'utf8')); let n = 0;
  bank.questions.forEach(q => q.answers.forEach(ans => {
    if (!ans.aliases) return;
    const seen = new Set([norm(ans.name)]);
    const keep = ans.aliases.filter(x => { const k = norm(x); if (!k || seen.has(k)) { n++; console.log(`${q.id}\t${ans.name}\tdrop alias "${x}"`); return false; } seen.add(k); return true; });
    if (keep.length !== ans.aliases.length) { if (keep.length) ans.aliases = keep; else delete ans.aliases; }
  }));
  total += n;
  if (WRITE && n) fs.writeFileSync(p, JSON.stringify(bank));
});
console.log(`${total} duplicate alias(es) ${WRITE ? 'removed' : 'found (dry run)'}`);
