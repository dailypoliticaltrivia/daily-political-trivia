#!/usr/bin/env node
/* Apply a reviewed list of Dark Horse answer edits to the banks, logging every change.
   Usage: node site/tools/dh-answer-edits.js <edits.json> [--write]
   edits.json: [{ "q": "people-0394", "op": "remove", "name": "Lewis Cass", "reason": "...", "source": "https://..." },
                { "q": "...", "op": "alias", "name": "Existing Answer", "alias": "New Spelling", "source": "..." },
                { "q": "...", "op": "add", "name": "New Answer", "aliases": ["..."], "weight": 5, "source": "..." }]
   Never touches a jackpot answer (a remove or a weight change on a jackpot is refused). Without --write it only reports.
   Rows go to audit/answers-dark-horse-sources.csv; a short line per edit goes to stdout for the log. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const file = process.argv[2], WRITE = process.argv.includes('--write');
if (!file) { console.error('usage: dh-answer-edits.js <edits.json> [--write]'); process.exit(2); }
function norm(s) {
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr');
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
const edits = JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).banks;
const banks = {}, where = {};
manifest.forEach(b => { banks[b] = JSON.parse(fs.readFileSync(path.join(DIR, b), 'utf8')); banks[b].questions.forEach(q => { where[q.id] = [b, q]; }); });
const touched = new Set(), rows = [], out = [];
let bad = 0;
const csv = s => /[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
for (const e of edits) {
  const w = where[e.q]; if (!w) { console.log('NO QUESTION', e.q); bad++; continue; }
  const [b, q] = w;
  const keys = new Map(); q.answers.forEach((a, i) => { keys.set(norm(a.name), i); (a.aliases || []).forEach(x => { if (!keys.has(norm(x))) keys.set(norm(x), i); }); });
  const find = n => { const i = q.answers.findIndex(a => a.name === n); return i >= 0 ? i : (keys.has(norm(n)) ? keys.get(norm(n)) : -1); };
  if (e.op === 'remove') {
    const i = q.answers.findIndex(a => a.name === e.name);
    if (i < 0) { out.push(`skip  ${e.q} remove "${e.name}": not found`); continue; }
    if (q.answers[i].jackpot) { out.push(`REFUSED ${e.q} remove "${e.name}": it is the jackpot`); bad++; continue; }
    q.answers.splice(i, 1);
    out.push(`remove ${e.q} "${e.name}" (${e.reason || ''})`);
  } else if (e.op === 'alias') {
    const i = find(e.name);
    if (i < 0) { out.push(`skip  ${e.q} alias "${e.name}": answer not found`); continue; }
    const k = norm(e.alias);
    if (keys.has(k)) { out.push(`skip  ${e.q} alias "${e.alias}": already accepted (${q.answers[keys.get(k)].name})`); continue; }
    (q.answers[i].aliases = q.answers[i].aliases || []).push(e.alias);
    out.push(`alias  ${e.q} "${q.answers[i].name}" += "${e.alias}"`);
  } else if (e.op === 'add') {
    const k = norm(e.name);
    if (keys.has(k) || (e.aliases || []).some(x => keys.has(norm(x)))) { out.push(`skip  ${e.q} add "${e.name}": already accepted`); continue; }
    if (!(e.weight >= 1 && e.weight <= 5)) { out.push(`REFUSED ${e.q} add "${e.name}": weight`); bad++; continue; }
    const seen = new Set([k]); const als = (e.aliases || []).filter(x => { const kx = norm(x); if (!kx || seen.has(kx)) return false; seen.add(kx); return true; });
    const a = { name: e.name }; if (als.length) a.aliases = als; a.weight = e.weight;
    // place-style questions turn off the bare-last-word shortcut on every answer (surname:false); a new answer follows the question
    if (e.surname === false || (e.surname !== true && q.answers.length && q.answers.every(x => x.surname === false))) a.surname = false;
    q.answers.push(a);
    out.push(`add    ${e.q} "${e.name}" w${e.weight}`);
  } else if (e.op === 'weight') {   // { op: "weight", name, weight }: re-rank an existing non-jackpot answer
    const i = q.answers.findIndex(a => a.name === e.name);
    if (i < 0) { out.push(`skip  ${e.q} weight "${e.name}": not found`); continue; }
    if (q.answers[i].jackpot) { out.push(`REFUSED ${e.q} weight "${e.name}": it is the jackpot`); bad++; continue; }
    if (!(e.weight >= 1 && e.weight <= 5)) { out.push(`REFUSED ${e.q} weight "${e.name}": weight`); bad++; continue; }
    out.push(`weight ${e.q} "${e.name}" w${q.answers[i].weight} -> w${e.weight}`); q.answers[i].weight = e.weight;
  } else { out.push('unknown op ' + e.op); bad++; continue; }
  touched.add(b);
  rows.push([e.q, e.op, csv(e.op === 'alias' ? e.name + ' => ' + e.alias : e.name), csv(e.source || ''), csv(e.reason || e.evidence || '')].join(','));
}
console.log(out.join('\n'));
if (WRITE) {
  touched.forEach(b => fs.writeFileSync(path.join(DIR, b), JSON.stringify(banks[b])));
  const f = path.join(ROOT, 'audit', 'answers-dark-horse-sources.csv');
  if (!fs.existsSync(f)) fs.writeFileSync(f, 'question,change,answer,source,evidence\n');
  if (rows.length) fs.appendFileSync(f, rows.join('\n') + '\n');
  console.log(`wrote ${touched.size} bank(s), ${rows.length} change(s)`);
} else console.log(`(dry run: ${rows.length} change(s) would be written)`);
process.exit(bad ? 1 : 0);
