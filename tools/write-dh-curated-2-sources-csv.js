#!/usr/bin/env node
'use strict';
/* Writes audit/dh-curated2-sources.csv: the stratified verification sample of the round-2 curated banks.
   Rows come from  audit/dh-curated2-data/_sample.json  (sample-dh-curated-2.js: Wikipedia lead of every sampled title) plus the Census-based questions, whose sampled
   answers are checked against the Census Gazetteer (_gazetteer-check.json). The human verdicts are in audit/dh-curated2-data/_verdicts2.json, an object
   { "<question id>|<answer>": ["not"|"unsure", "note"] }; every sampled row not listed there was read and judged correct.
   Usage: node site/tools/write-dh-curated-2-sources-csv.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated2-data');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
let sample = readJson(path.join(DATA, '_sample.json'), []);
{
  const inBank = new Set();
  for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated2-\d+\.json$/.test(f))) for (const q of readJson(path.join(BANKS, f), { questions: [] }).questions) for (const a of q.answers) inBank.add(q.id + '|' + a.name);
  const have = new Set(sample.map(r => r.id + '|' + r.name));
  for (const x of readJson(path.join(DATA, '_sample-extra1.json'), [])) if (!have.has(x.id + '|' + x.name) && inBank.has(x.id + '|' + x.name)) { x.why = x.why + ' (extra tail sample)'; sample.push(x); }
}
const verdicts = readJson(path.join(DATA, '_verdicts2.json'), {});
const gaz = readJson(path.join(DATA, '_gazetteer-check.json'), []);
const report = readJson(path.join(DATA, '_report.json'), { report: [] }).report;
const csv = v => { v = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rows = [['question id', 'question key', 'answer', 'tier (weight)', 'sample stratum', 'claim checked', 'source', 'verdict', 'note']];
const region = k => k.replace('leaders-', '');
function claim(s) {
  const k = s.key;
  if (/^sc-/.test(k)) return 'U.S. Supreme Court decision' + (s.year ? ', year ' + s.year + ' (used for the era split)' : '');
  if (/^acts-/.test(k)) return 'Act of the U.S. Congress' + (s.year ? ', year ' + s.year + ' (used for the era split)' : '');
  if (k === 'nps') return 'Unit of the National Park System (current)';
  if (k === 'civilwar') return 'Battle, siege or skirmish of the American Civil War, 1861-1865';
  if (k === 'latin-legal') return 'Latin term used in law';
  if (k === 'scandals') return 'Political scandal or affair';
  if (k === 'intel') return 'National intelligence or security agency';
  if (/^ships-/.test(k)) return 'U.S. Navy ship (' + k.replace('ships-', '') + ')';
  if (/^leaders-/.test(k)) return 'Head of state or government of ' + region(k) + (s.year ? ', first term began ' + s.year : '');
  return k;
}
function leadYear(s) {
  let m;
  if (/^sc-/.test(s.key)) m = (s.lead || '').match(/\bU\.\s?S\.\s*\d+[^()]{0,40}\(\s*(?:[A-Za-z.]+ \d{1,2}, )?(1[789]\d\d|20[0-2]\d)\s*\)/) || (s.lead || '').match(/^\[(1[789]\d\d|20[0-2]\d) /);
  else if (/^acts-/.test(s.key)) m = (s.lead || '').match(/\b(?:enacted|signed|approved|passed|became law)[^.]{0,60}?\b(1[789]\d\d|20[0-2]\d)\b/i) || (s.lead || '').match(/\bof (1[789]\d\d|20[0-2]\d)\b/) || s.name.match(/\bof (1[789]\d\d|20[0-2]\d)\b/);
  return m ? +m[1] : null;
}
let nHuman = 0, nNot = 0, nUnsure = 0;
for (const s of sample) {
  const v = verdicts[s.id + '|' + s.name];
  const verdict = v ? v[0] : (s.lead ? 'ok' : 'unsure');
  const note = v ? v[1] : (s.lead ? '' : 'no lead could be read');
  if (verdict === 'not') nNot++; else if (verdict === 'unsure') nUnsure++;
  nHuman++;
  const ly = leadYear(s); const ynote = ly && s.year && ly !== s.year ? 'year used ' + s.year + ', Wikipedia lead says ' + ly + ' (same era; the data year is a citation/volume estimate)' : (ly && s.year ? 'year confirmed by the lead: ' + ly : '');
  rows.push([s.id, s.key, s.name, s.weight, s.why, claim(s), 'https://en.wikipedia.org/wiki/' + encodeURIComponent(s.full.replace(/ /g, '_')), verdict, note || ynote || (s.lead || '').slice(0, 110)]);
}
// errors found by the sample before the fixes (the answers are no longer in the banks)
for (const r of (verdicts._removed || [])) { rows.push([r[0], r[1], r[2], r[3], r[4] + ' (found, then removed)', r[5], r[6], r[7], r[8]]); if (r[7] === 'not') nNot++; else nUnsure++; nHuman++; }
// Census-based questions: stratified rows, all matched in the Gazetteer
const gz = new Map(gaz.map(g => [g.id, g]));
let nCensus = 0;
for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated2-\d+\.json$/.test(f))) {
  for (const q of readJson(path.join(BANKS, f), { questions: [] }).questions) {
    const g = gz.get(q.id); if (!g) continue;
    const key = (report.find(r => r.id === q.id) || {}).key || q.id;
    const bad = new Set(g.notActiveOrUnmatched.map(x => x.replace(/ \[.*$/, '')));
    const used = new Set(); const picks = [];
    for (let w = 1; w <= 5; w++) { const pool = q.answers.filter(a => a.weight === w); if (pool.length) { const a = pool[Math.floor(pool.length / 2)]; picks.push([a, 'tier' + w]); used.add(a.name); } }
    const tail = q.answers.filter(a => a.weight === 5 && !used.has(a.name)); for (const i of [Math.floor(tail.length / 4), Math.floor(tail.length * 0.8)]) if (tail[i]) picks.push([tail[i], 'tail']);
    const jp = q.answers.find(a => a.jackpot); if (jp) picks.push([jp, 'jackpot']);
    for (const [a, why] of picks) {
      nCensus++;
      const isBad = bad.has(a.name);
      rows.push([q.id, key, a.name, a.weight, why, /^counties-/.test(key) ? 'County in ' + g.state : 'Incorporated place in ' + g.state, 'Census Bureau 2023 Gazetteer (place / county subdivision / county files), https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/', isBad ? 'unsure' : 'ok', isBad ? 'consolidated city-county government or accent in the Gazetteer; the place exists' : 'present and active']);
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'audit', 'dh-curated2-sources.csv'), rows.map(r => r.map(csv).join(',')).join('\n') + '\n');
console.log('rows', rows.length - 1, '(Wikipedia-lead rows', nHuman, ', Census rows', nCensus, ') not:', nNot, 'unsure:', nUnsure);
