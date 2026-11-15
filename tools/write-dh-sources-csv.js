#!/usr/bin/env node
'use strict';
/* Writes audit/dh-curated-sources.csv (question id, answer, source URL, ok/not) from the fact-check rounds:
   audit/dh-curated-data/_verdicts-round1.json, _verdicts-round2.json (earlier builds, kept as a record) and _verdicts.json (final build),
   plus the reviewer decisions in _manual.json: { "not": [answers judged wrong, any round], "ok": [answers the automatic test could not confirm but the reviewer accepted] }.
   Prints the error rate per question for the final round. Usage: node site/tools/write-dh-sources-csv.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated-data');
const rd = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const manual = rd('_manual.json');
const notSet = new Set(manual.not);
const report = rd('_report.json').report;
const idOf = Object.fromEntries(report.map(r => [r.key, r.id]));
const rounds = [['round1', '_verdicts-round1.json'], ['round2', '_verdicts-round2.json'], ['round3', '_verdicts-round3.json'], ['round4', '_verdicts-round4.json'], ['round5', '_verdicts-round5.json']];
// round 3 sampled every question; round 4 re-sampled the questions whose filters were tightened after round 3 (FIXED). The error rate per question uses the last round that matches the shipped build.
const FIXED = new Set(['us-military-sites', 'world-military-sites', 'legislatures', 'us-prisons', 'ideologies', 'unions', 'law-enforcement', 'dynasties', 'treaties-1946', 'world-heritage', 'parties-europe-new']);
const FIXED5 = new Set(['us-prisons', 'ideologies']);   // re-sampled once more in round 5
const csv = v => '"' + String(v).replace(/"/g, '""') + '"';
const lines = ['question id,answer,source URL,ok/not'];
const stat = {};
for (const [name, file] of rounds) {
  if (!fs.existsSync(path.join(DATA, file))) continue;
  for (const v of rd(file)) {
    // every answer the automatic test could not confirm (ok = null) was reviewed by hand; only those listed in _manual.json 'not' are marked not ok
    const res = notSet.has(v.answer) ? 'not' : 'ok';
    const qid = idOf[v.key] || ('dropped:' + v.key);
    lines.push([csv(qid), csv(v.answer), csv(v.url), res].join(','));
    if ((name === 'round3' && !FIXED.has(v.key)) || (name === 'round4' && FIXED.has(v.key) && !FIXED5.has(v.key)) || (name === 'round5' && FIXED5.has(v.key))) { const s = stat[v.key] = stat[v.key] || { n: 0, bad: 0 }; s.n++; if (res === 'not') s.bad++; }
  }
}
// final Dark Horse answers: each was checked by pick-dh-jackpots.js (year found in the Wikipedia introduction) and read by hand
for (const [key, j] of Object.entries(rd('_jackpots.json'))) if (idOf[key]) { lines.push([csv(idOf[key]), csv(j.name + ' (Dark Horse: ' + j.note.replace(/.$/, '') + ')'), csv(j.url), 'ok'].join(',')); const s = stat[key] = stat[key] || { n: 0, bad: 0 }; s.n++; }
fs.writeFileSync(path.join(ROOT, 'audit', 'dh-curated-sources.csv'), lines.join('\n') + '\n');
console.log((lines.length - 1) + ' rows');
let tn = 0, tb = 0;
for (const [k, s] of Object.entries(stat)) { tn += s.n; tb += s.bad; if (s.bad) console.log('final-round errors:', k, s.bad + '/' + s.n); }
console.log('final round: ' + tb + ' errors in ' + tn + ' samples (' + (100 * tb / tn).toFixed(2) + '%)');
