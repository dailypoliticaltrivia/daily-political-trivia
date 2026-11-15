#!/usr/bin/env node
/* Scoring tiers: answer weight 1-5 = 5/20/45/70/100 points (jackpot answers, shown as the "Dark Horse", score 300). Validates the Dark Horse question banks.
   Usage: node site/tools/validate-trivia.js [path-to-data-folder]
   Exit code 1 if any error is found. Warnings do not fail the run. */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'games', 'dark-horse', 'data'));
const errors = [], warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

// Must match norm() in trivia.js
function norm(s){
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr');
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
const { MIN_ANSWERS } = require('./build-dh-shards');   // the smallest question the game will ask (set once, in games/dark-horse/trivia.js)
const isStr = v => typeof v === 'string' && v.trim().length > 0;

function readJson(file){
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch (e) { return { __error: e.message }; }
}

const manifestFile = path.join(dir, 'manifest.json');
if (!fs.existsSync(manifestFile)){ console.error('No manifest.json in ' + dir); process.exit(1); }
const manifest = readJson(manifestFile);
if (manifest.__error || !Array.isArray(manifest.banks)){ console.error('manifest.json is invalid: ' + (manifest.__error || 'needs {"banks":[...]}')); process.exit(1); }

const onDisk = fs.readdirSync(dir).filter(f => /^bank-.+\.json$/.test(f));
onDisk.filter(f => !manifest.banks.includes(f)).forEach(f => warn('manifest.json', `${f} exists but is not listed, so the game will not load it`));

const ids = new Map();
const stats = {};          // bank -> {count, cats:{}, diff:{1,2,3}, answers}
const total = { count: 0, cats: {}, diff: { 1: 0, 2: 0, 3: 0 }, answers: 0, jackpots: 0 };

for (const f of manifest.banks){
  const file = path.join(dir, f);
  if (!fs.existsSync(file)){ warn('manifest.json', `${f} is listed but missing (the game skips it)`); continue; }
  const data = readJson(file);
  if (data.__error){ err(f, 'not valid JSON: ' + data.__error); continue; }
  if (!isStr(data.bank)) err(f, 'missing "bank" name');
  else if (`bank-${data.bank}.json` !== f) warn(f, `"bank" is "${data.bank}" but the file name suggests "${f.replace(/^bank-|\.json$/g, '')}"`);
  if (!Array.isArray(data.questions)){ err(f, '"questions" must be an array'); continue; }
  if (!data.questions.length) err(f, 'no questions (empty list)');
  const st = stats[f] = { count: 0, cats: {}, diff: { 1: 0, 2: 0, 3: 0 }, answers: 0, jackpots: 0 };

  data.questions.forEach((q, n) => {
    const where = `${f} #${n + 1}${q && q.id ? ' (' + q.id + ')' : ''}`;
    if (!q || typeof q !== 'object'){ err(where, 'question is not an object'); return; }
    if (!isStr(q.id)) err(where, 'missing id');
    else if (ids.has(q.id)) err(where, `duplicate id, also used in ${ids.get(q.id)}`);
    else ids.set(q.id, f);
    if (!isStr(q.category)) err(where, 'missing category');
    else if (!/^[a-z0-9-]+$/.test(q.category)) warn(where, `category "${q.category}" should be lowercase letters, digits and hyphens`);
    if (!isStr(q.prompt)) err(where, 'missing prompt');
    if (![1, 2, 3].includes(q.difficulty)) err(where, 'difficulty must be 1, 2 or 3');
    if (q.note !== undefined && !isStr(q.note)) err(where, 'note must be a non-empty string when present');
    if (!Array.isArray(q.answers)){ err(where, '"answers" must be an array'); return; }
    if (!q.answers.length){ err(where, 'empty answers list'); return; }
    if (q.answers.length < 8 && !isStr(q.note)) err(where, `only ${q.answers.length} accepted answers (need at least 8, or a note explaining a short list)`);

    const ws = new Set(q.answers.map(a => (a && Number.isInteger(a.weight)) ? a.weight : 1));
    if (q.answers.length > 1 && ws.size < 2) warn(where, "all answers share one weight; scoring tiers (weight 1-5) need a spread, so mark rare answers with higher weights");
    if (q.answers.length >= 8 && ![...ws].some(w => w >= 3)) warn(where, "no answer has weight 3 or more, so the top scoring tiers are unreachable");
    const owner = new Map();   // normalised key -> answer index
    q.answers.forEach((a, i) => {
      const aw = `${where} answer #${i + 1}`;
      if (!a || typeof a !== 'object'){ err(aw, 'answer is not an object'); return; }
      if (!isStr(a.name)){ err(aw, 'missing name'); return; }
      if (a.weight !== undefined && !(Number.isInteger(a.weight) && a.weight >= 1 && a.weight <= 5)) err(`${aw} "${a.name}"`, 'weight must be an integer 1-5');
      if (a.jackpot !== undefined && typeof a.jackpot !== 'boolean') err(`${aw} "${a.name}"`, '"jackpot" must be true or false');
      if (a.surname !== undefined && typeof a.surname !== 'boolean') err(`${aw} "${a.name}"`, '"surname" must be true or false');
      if (a.aliases !== undefined && !Array.isArray(a.aliases)){ err(`${aw} "${a.name}"`, 'aliases must be an array'); return; }
      const keys = [['name', a.name], ...(a.aliases || []).map(x => ['alias', x])];
      const own = new Set();
      for (const [kind, text] of keys){
        if (!isStr(text)){ err(`${aw} "${a.name}"`, `${kind} must be a non-empty string`); continue; }
        const k = norm(text);
        if (!k){ err(`${aw} "${a.name}"`, `${kind} "${text}" has no letters or digits`); continue; }
        if (own.has(k)){ err(`${aw} "${a.name}"`, `${kind} "${text}" duplicates another spelling of the same answer`); continue; }
        own.add(k);
        if (owner.has(k) && owner.get(k) !== i){
          const o = q.answers[owner.get(k)];
          err(`${aw} "${a.name}"`, `${kind} "${text}" collides with a different answer "${o.name}"`);
        } else owner.set(k, i);
      }
      st.answers++;
    });

    const jp = q.answers.filter(a => a && a.jackpot === true).length;
    if (jp > 1) err(where, `${jp} Dark Horse (jackpot) answers (at most one per question)`);
    // owner rule (2026-11-15): every playable question has exactly one Dark Horse, weight 5 with a note explaining why it counts
    if (q.answers.length >= MIN_ANSWERS && jp === 0) err(where, 'no Dark Horse (jackpot) answer: every playable question needs exactly one (a weight-5 answer with a sourced note; see audit/answers-dark-horse-log.md)');
    q.answers.filter(a => a && a.jackpot === true).forEach(a => {
      if (a.weight !== 5) err(`${where} "${a.name}"`, 'the Dark Horse (jackpot) answer must have weight 5');
      if (!a.note || !String(a.note).trim()) err(`${where} "${a.name}"`, 'the Dark Horse (jackpot) answer needs a note explaining why it counts');
    });
    if (jp) st.jackpots++;
    if (q.answers.length < MIN_ANSWERS) (st.small = st.small || []).push(q.id);
    st.count++;
    st.cats[q.category] = (st.cats[q.category] || 0) + 1;
    if (st.diff[q.difficulty] !== undefined) st.diff[q.difficulty]++;
  });
}

for (const st of Object.values(stats)){
  total.jackpots += st.jackpots; total.count += st.count; total.answers += st.answers;
  for (const [c, n] of Object.entries(st.cats)) total.cats[c] = (total.cats[c] || 0) + n;
  for (const d of [1, 2, 3]) total.diff[d] += st.diff[d];
}

const fmtCats = c => Object.keys(c).sort().map(k => `${k}=${c[k]}`).join(', ') || '-';
console.log('Dark Horse banks in ' + dir + '\n');
for (const [f, st] of Object.entries(stats)){
  console.log(`${f}: ${st.count} questions, ${st.answers} answers, ${st.jackpots} with a Dark Horse answer`);
  console.log(`  difficulty: easy ${st.diff[1]}, medium ${st.diff[2]}, hard ${st.diff[3]}`);
  console.log(`  categories: ${fmtCats(st.cats)}`);
}
console.log(`\nTOTAL: ${total.count} questions, ${total.answers} answers, ${Object.keys(total.cats).length} categories, ${total.jackpots} questions with a Dark Horse (jackpot) answer`);
console.log(`  difficulty: easy ${total.diff[1]}, medium ${total.diff[2]}, hard ${total.diff[3]}`);
console.log(`  categories: ${fmtCats(total.cats)}`);
for (const [f, st] of Object.entries(stats)) if (st.small && st.small.length) warn(f, `${st.small.length} of ${st.count} questions have fewer than ${MIN_ANSWERS} accepted answers, so Dark Horse never asks them (e.g. ${st.small.slice(0, 3).join(', ')})`);
const smallAll = Object.values(stats).reduce((n, st) => n + (st.small ? st.small.length : 0), 0);
console.log(`  usable (>= ${MIN_ANSWERS} answers): ${total.count - smallAll} of ${total.count} questions`);
if (total.count && (total.diff[1] < 2 || total.diff[2] < 3 || total.diff[3] < 2)) warn('pool', 'fewer than 2 easy / 3 medium / 2 hard questions; the daily mix will be relaxed');
if (Object.keys(total.cats).length < 7) warn('pool', 'fewer than 7 categories; some days will repeat a category');

// the game downloads data/index.json + data/q/*.json, built from these banks by tools/build-dh-shards.js
try {
  const dh = require('./build-dh-shards'), built = dh.build(dir), idx = path.join(dir, 'index.json');
  if (!fs.existsSync(idx)) warn('index.json', 'missing: run  node tools/build-dh-shards.js  (without it the game loads every bank whole, which is slow)');
  else if (fs.readFileSync(idx, 'utf8') !== built.indexText) warn('index.json', 'is out of date with the banks: run  node tools/build-dh-shards.js  (predeploy-check fails until you do)');
  else { const have = new Set(fs.existsSync(path.join(dir, 'q')) ? fs.readdirSync(path.join(dir, 'q')) : []); if ([...built.files.keys()].some(f => !have.has(f))) warn('q/', 'some question files are missing: run  node tools/build-dh-shards.js'); }
} catch (e) { /* index check is advisory */ }
if (warnings.length){ console.log(`\n${warnings.length} warning(s):`); warnings.forEach(w => console.log('  - ' + w)); }
if (errors.length){ console.log(`\n${errors.length} ERROR(S):`); errors.forEach(e => console.log('  - ' + e)); process.exit(1); }
console.log('\nNo errors.');
