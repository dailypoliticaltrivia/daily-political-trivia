#!/usr/bin/env node
'use strict';
/* Validates the Capitol Climb question banks (games/capitol-climb/data/bank-*.json).
   Usage (from the site folder):
     node tools/validate-history.js                              every bank in data/ (the whole set: also checks per-stop totals)
     node tools/validate-history.js data/bank-p4-5-xyz.json      just that file (still checks id clashes and near-duplicates against the other banks)
     node tools/validate-history.js --write-manifest             also rewrite data/manifest.json: every bank that passes (bank-sample.json only while no real bank passes)
     options: --strict (warnings fail too)  --quiet (only problems and the summary)
   Exit code 1 if any ERROR (or any warning with --strict). Plain Node, no packages.

   Bank file:  {"bank":"p4-5","questions":[{"id":"p4-0001","period":4,"themes":["politics-power"],"stops":["capitol-rotunda","supreme-court"],
               "difficulty":1,"q":"question text","options":["A","B","C","D"],"answer":2,"explain":"one or two sentences"}]}
   Rules are listed in games/capitol-climb/data/SCHEMA.txt and printed by --rules. */
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');
const DATA = path.join(SITE, 'games', 'capitol-climb', 'data');
const THEMES = ['identity', 'work-exchange-technology', 'peopling', 'politics-power', 'america-world', 'environment-geography', 'culture-ideas'];
const STOPS = ['white-house', 'capitol-rotunda', 'senate-floor', 'house-floor', 'supreme-court', 'library-of-congress', 'national-archives', 'lincoln-memorial', 'washington-monument', 'jefferson-memorial', 'mlk-memorial', 'fdr-memorial', 'wwii-memorial', 'vietnam-memorial', 'korean-war-memorial', 'smithsonian-american-history', 'smithsonian-african-american-history', 'smithsonian-american-indian', 'air-and-space', 'fords-theatre', 'arlington-cemetery', 'pentagon', 'treasury', 'frederick-douglass-house', 'national-cathedral', 'union-station'];
const LIM = { q: 300, option: 120, explainMin: 20, explainMax: 300, skewIndex: 0.35, longest: 0.40, stopMin: 150, dupJaccard: 0.75, dupJaccardWarnOnly: true };
const KEYS = ['id', 'period', 'themes', 'stops', 'difficulty', 'q', 'options', 'answer', 'explain'];

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
if (flag('--rules')) {
  console.log([
    'id: unique across ALL banks, letters/digits/dot/dash/underscore only',
    'period 1-9 (integer); difficulty 1-3 (integer)',
    'themes: 1-3 of ' + THEMES.join(', '),
    'stops: 1-3 of ' + STOPS.join(', '),
    'q: non-empty, <= ' + LIM.q + ' characters; options: exactly 4 distinct, non-empty, <= ' + LIM.option + ' characters each; answer: integer 0-3',
    'no option text inside the question stem; no "all of the above", "none of the above", "both A and B"; no "A." or "(b)" prefixes on options',
    'explain: ' + LIM.explainMin + '-' + LIM.explainMax + ' characters',
    'per bank: answer index share <= ' + LIM.skewIndex * 100 + '% each (warn); correct option strictly the longest <= ' + LIM.longest * 100 + '% (warn)',
    'near-duplicate stems are flagged (warn); a stop with fewer than ' + LIM.stopMin + ' questions in the whole set is flagged (warn)'
  ].join('\n'));
  process.exit(0);
}
const STRICT = flag('--strict'), QUIET = flag('--quiet'), WRITE = flag('--write-manifest');
const fileArgs = args.filter(a => !a.startsWith('--'));

/* ---------- helpers ---------- */
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP_WORDS = new Set('a an the of in on at to for and or is was were are by with as from that this which who whom what when where during after before into than it its be been has had have did does do not no their his her they he she we you your one two'.split(' '));
const toks = s => norm(s).split(' ').filter(w => w && !STOP_WORDS.has(w));
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const listBanks = () => fs.existsSync(DATA) ? fs.readdirSync(DATA).filter(f => /^bank-.+\.json$/.test(f)).sort() : [];

const problems = [];       // {level, file, id, msg}
const err = (file, id, msg) => problems.push({ level: 'ERROR', file, id, msg });
const warn = (file, id, msg) => problems.push({ level: 'WARN', file, id, msg });

function loadFile(f) {
  const full = path.isAbsolute(f) ? f : (fs.existsSync(path.resolve(process.cwd(), f)) ? path.resolve(process.cwd(), f) : path.join(DATA, path.basename(f)));
  const name = path.basename(full);
  let txt;
  try { txt = fs.readFileSync(full, 'utf8').replace(/^﻿/, ''); } catch (e) { err(name, '', 'cannot read file: ' + e.message); return null; }
  let j;
  try { j = JSON.parse(txt); } catch (e) { err(name, '', 'invalid JSON: ' + e.message); return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { err(name, '', 'top level must be an object {"bank":"...","questions":[...]}'); return null; }
  if (typeof j.bank !== 'string' || !j.bank.trim()) err(name, '', 'missing "bank" name');
  if (!Array.isArray(j.questions)) { err(name, '', '"questions" must be an array'); return null; }
  return { name, full, bank: j.bank, questions: j.questions };
}

/* ---------- per-question checks ---------- */
function checkQuestion(file, q, idx) {
  const id = q && typeof q.id === 'string' ? q.id : '#' + (idx + 1);
  const E = m => err(file, id, m), W = m => warn(file, id, m);
  if (!q || typeof q !== 'object' || Array.isArray(q)) { E('question is not an object'); return false; }
  const before = problems.length;
  if (typeof q.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(q.id)) E('id must be a string of letters, digits, dot, dash or underscore');
  if (!isInt(q.period, 1, 9)) E('period must be an integer 1-9');
  if (!isInt(q.difficulty, 1, 3)) E('difficulty must be an integer 1-3');
  if (!Array.isArray(q.themes) || q.themes.length < 1 || q.themes.length > 3) E('themes must be an array of 1-3 theme ids');
  else q.themes.forEach(t => { if (THEMES.indexOf(t) < 0) E('unknown theme "' + t + '"'); });
  if (Array.isArray(q.themes) && new Set(q.themes).size !== q.themes.length) E('duplicate theme');
  if (!Array.isArray(q.stops) || q.stops.length < 1 || q.stops.length > 3) E('stops must be an array of 1-3 stop ids');
  else q.stops.forEach(s => { if (STOPS.indexOf(s) < 0) E('unknown stop "' + s + '" (not in the fixed list)'); });
  if (Array.isArray(q.stops) && new Set(q.stops).size !== q.stops.length) E('duplicate stop');
  if (typeof q.q !== 'string' || !q.q.trim()) E('q (question text) missing');
  else {
    if (q.q.length > LIM.q) E('q is ' + q.q.length + ' characters (max ' + LIM.q + ')');
    if (q.q !== q.q.trim() || /\s{2,}/.test(q.q)) W('q has leading/trailing or doubled spaces');
    if (/\bundefined\b|\bnull\b|\bNaN\b|\[object|\{\{|\bTODO\b|\bTBD\b/.test(q.q)) E('q contains a template leftover');
  }
  if (!Array.isArray(q.options) || q.options.length !== 4) E('options must be an array of exactly 4');
  else {
    const seen = new Set();
    q.options.forEach((o, i) => {
      if (typeof o !== 'string' || !o.trim()) { E('option ' + (i + 1) + ' is empty or not a string'); return; }
      if (o.length > LIM.option) E('option ' + (i + 1) + ' is ' + o.length + ' characters (max ' + LIM.option + ')');
      if (o !== o.trim() || /\s{2,}/.test(o)) W('option ' + (i + 1) + ' has stray spaces');
      const n = norm(o);
      if (seen.has(n)) E('duplicate option text "' + o + '"'); seen.add(n);
      if (/^\s*[\(\[]?[a-dA-D1-4][\)\]\.:]\s/.test(o)) E('option ' + (i + 1) + ' starts with a letter or number label ("' + o.slice(0, 4) + '"): the game adds its own');
      if (/\b(all|none) of (the )?(above|these|them)\b|\bboth [a-d] and [a-d]\b|\ball answers\b|\bnone correct\b/i.test(o)) E('option ' + (i + 1) + ' is an "all/none of the above" style option');
      if (typeof q.q === 'string' && n.length >= 3) {
        const stem = ' ' + norm(q.q) + ' ';
        if (stem.indexOf(' ' + n + ' ') >= 0) E('option ' + (i + 1) + ' ("' + o + '") appears inside the question stem');
      }
    });
  }
  if (!isInt(q.answer, 0, 3)) E('answer must be an integer 0-3 (the 0-based index of the correct option)');
  if (typeof q.explain !== 'string' || !q.explain.trim()) E('explain missing');
  else if (q.explain.length < LIM.explainMin || q.explain.length > LIM.explainMax) E('explain is ' + q.explain.length + ' characters (must be ' + LIM.explainMin + '-' + LIM.explainMax + ')');
  Object.keys(q).forEach(k => { if (KEYS.indexOf(k) < 0) W('unknown field "' + k + '"'); });
  return problems.length === before || !problems.slice(before).some(p => p.level === 'ERROR');
}

/* ---------- near-duplicates ---------- */
function findDuplicates(all, focusFiles) {
  const items = all.map(x => ({ x, set: new Set(toks(x.q.q)), n: norm(x.q.q) }));
  const byTok = new Map();
  items.forEach((it, i) => it.set.forEach(t => { if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(i); }));
  const out = [];
  const seenPair = new Set();
  items.forEach((a, i) => {
    if (a.set.size < 3) return;
    const cand = new Map();
    a.set.forEach(t => { const l = byTok.get(t); if (l.length > 400) return; l.forEach(j => { if (j > i) cand.set(j, (cand.get(j) || 0) + 1); }); });
    cand.forEach((c, j) => {
      const b = items[j];
      if (focusFiles && !focusFiles.has(a.x.file) && !focusFiles.has(b.x.file)) return;
      const inter = c, union = a.set.size + b.set.size - inter, jac = inter / union;
      const sameAns = norm(a.x.q.options && a.x.q.options[a.x.q.answer]) === norm(b.x.q.options && b.x.q.options[b.x.q.answer]);
      if (a.n === b.n || jac >= LIM.dupJaccard || (jac >= 0.55 && sameAns)) {
        const key = i + '|' + j; if (seenPair.has(key)) return; seenPair.add(key);
        out.push({ a: a.x, b: b.x, jac, sameAns });
      }
    });
  });
  return out;
}

/* ---------- run ---------- */
const files = fileArgs.length ? fileArgs : listBanks();
if (!files.length) { console.error('No bank files found in ' + DATA); process.exit(1); }
const loaded = files.map(loadFile).filter(Boolean);
const focus = new Set(loaded.map(b => b.name));
const wholeSet = !fileArgs.length;
const idOwner = new Map();      // id -> file
const all = [];                 // valid-ish questions for stats {file, q}
const perBank = {};
const passed = {};

function ingest(b, isFocus) {
  const st = perBank[b.name] = { n: 0, idx: [0, 0, 0, 0], longest: 0, longestOrTied: 0, errors: 0, checked: 0 };
  b.questions.forEach((q, i) => {
    const id = q && typeof q.id === 'string' ? q.id : null;
    const startErrors = problems.filter(p => p.level === 'ERROR').length;
    const ok = isFocus ? checkQuestion(b.name, q, i) : true;
    if (id) {
      if (idOwner.has(id)) err(b.name, id, 'duplicate id (also in ' + idOwner.get(id) + ')');
      else idOwner.set(id, b.name);
    }
    if (!ok || !q || typeof q !== 'object') return;
    st.n++;
    all.push({ file: b.name, q });
    if (isInt(q.answer, 0, 3)) st.idx[q.answer]++;
    if (Array.isArray(q.options) && q.options.length === 4 && isInt(q.answer, 0, 3)) {
      const lens = q.options.map(o => String(o).length), c = lens[q.answer], mx = Math.max.apply(null, lens);
      if (c === mx) { st.longestOrTied++; if (lens.filter(l => l === mx).length === 1) st.longest++; }
    }
  });
}
loaded.forEach(b => ingest(b, true));
if (!wholeSet) {          // other banks: id clashes and near-duplicates only
  listBanks().filter(f => !focus.has(f)).map(f => { const keep = problems.length; const r = loadFile(f); problems.length = keep; return r; }).filter(Boolean)
    .forEach(b => { b.questions.forEach(q => { if (q && typeof q.id === 'string') { if (idOwner.has(q.id) && idOwner.get(q.id) !== b.name) err(idOwner.get(q.id), q.id, 'duplicate id (also in ' + b.name + ')'); else if (!idOwner.has(q.id)) idOwner.set(q.id, b.name); } });
      b.questions.filter(q => q && typeof q.q === 'string' && Array.isArray(q.options)).forEach(q => all.push({ file: b.name, q })); });
}

/* distribution checks per bank */
loaded.forEach(b => {
  const st = perBank[b.name];
  if (st.n >= 12) {
    st.idx.forEach((c, i) => { if (c / st.n > LIM.skewIndex) warn(b.name, '', 'answer index ' + i + ' is ' + Math.round(c / st.n * 100) + '% of the bank (limit ' + LIM.skewIndex * 100 + '%): spread the correct answer across positions 0-3'); });
    if (st.longest / st.n > LIM.longest) warn(b.name, '', 'the correct option is the strictly longest in ' + Math.round(st.longest / st.n * 100) + '% of questions (limit ' + LIM.longest * 100 + '%): lengthen some wrong options');
  }
});

/* near duplicates */
const dups = findDuplicates(all.filter(x => typeof x.q.q === 'string' && x.q.q.trim()), wholeSet ? null : focus);
dups.forEach(d => warn(d.a.file, d.a.q.id, 'looks like a duplicate of ' + d.b.q.id + (d.b.file !== d.a.file ? ' (' + d.b.file + ')' : '') + ' (' + Math.round(d.jac * 100) + '% word overlap' + (d.sameAns ? ', same correct answer' : '') + ')'));

/* counts */
const cnt = (fn, set) => { const m = {}; set.forEach(x => fn(x).forEach(k => { m[k] = (m[k] || 0) + 1; })); return m; };
const focusAll = all.filter(x => focus.has(x.file) && x.q && Array.isArray(x.q.stops));
const ofSet = wholeSet ? all.filter(x => x.q && Array.isArray(x.q.stops)) : all.filter(x => x.q && Array.isArray(x.q.stops));
const byPeriod = cnt(x => [x.q.period], focusAll), byDiff = cnt(x => [x.q.difficulty], focusAll), byTheme = cnt(x => x.q.themes || [], focusAll), byStopFocus = cnt(x => x.q.stops, focusAll), byStopAll = cnt(x => x.q.stops, ofSet);
if (wholeSet) STOPS.forEach(s => { if ((byStopAll[s] || 0) < LIM.stopMin) warn('(all banks)', '', 'stop "' + s + '" has only ' + (byStopAll[s] || 0) + ' questions (target ' + LIM.stopMin + ' or more)'); });

/* status per bank (errors only) */
loaded.forEach(b => { passed[b.name] = !problems.some(p => p.level === 'ERROR' && p.file === b.name); });

/* ---------- report ---------- */
const pad = (s, n) => String(s).padEnd(n), pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
if (!QUIET) {
  console.log('\nBanks (' + loaded.length + ')');
  loaded.forEach(b => {
    const st = perBank[b.name];
    console.log('  ' + pad(b.name, 34) + pad(st.n + ' questions', 16) + 'answer index 0/1/2/3 = ' + st.idx.join('/') + ' (' + st.idx.map(c => pct(c, st.n)).join(' ') + ')   correct strictly longest ' + pct(st.longest, st.n) + ' (longest or tied ' + pct(st.longestOrTied, st.n) + ')   ' + (passed[b.name] ? 'ok' : 'ERRORS'));
  });
  const tot = focusAll.length;
  console.log('\nTotal questions checked: ' + tot);
  console.log('By period     ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(p => 'P' + p + ':' + (byPeriod[p] || 0)).join('  '));
  console.log('By difficulty ' + [1, 2, 3].map(d => 'D' + d + ':' + (byDiff[d] || 0)).join('  '));
  console.log('By theme      ' + THEMES.map(t => t + ':' + (byTheme[t] || 0)).join('  '));
  console.log('By stop (' + (wholeSet ? 'whole set' : 'these files; the 150 target applies to the whole set') + ')');
  STOPS.forEach(s => { const c = (wholeSet ? byStopAll : byStopFocus)[s] || 0; console.log('  ' + pad(s, 40) + pad(c, 6) + (wholeSet && c < LIM.stopMin ? '(below ' + LIM.stopMin + ')' : '')); });
}

const errs = problems.filter(p => p.level === 'ERROR'), warns = problems.filter(p => p.level === 'WARN');
const show = (list, lvl) => { if (!list.length) return; console.log('\n' + lvl + 'S (' + list.length + ')'); list.slice(0, 200).forEach(p => console.log('  ' + lvl + ' ' + p.file + (p.id ? ' [' + p.id + ']' : '') + ': ' + p.msg)); if (list.length > 200) console.log('  ... ' + (list.length - 200) + ' more'); };
show(errs, 'ERROR'); show(warns, 'WARN');

if (WRITE) {
  const good = listBanks().filter(f => { if (focus.has(f)) return passed[f]; const keep = problems.length; const r = loadFile(f); if (!r) { problems.length = keep; return false; } const ok = r.questions.every((q, i) => { const k = problems.length; const o = checkQuestion(f, q, i); return o; }); return ok; });
  const real = good.filter(f => f !== 'bank-sample.json');
  const list = real.length ? real : good.filter(f => f === 'bank-sample.json');
  fs.writeFileSync(path.join(DATA, 'manifest.json'), JSON.stringify({ banks: list }, null, 2) + '\n');
  console.log('\nmanifest.json written: ' + JSON.stringify(list));
}
const bad = errs.length || (STRICT && warns.length);
console.log('\n' + (bad ? 'FAIL' : 'PASS') + ': ' + errs.length + ' error(s), ' + warns.length + ' warning(s)');
process.exit(bad ? 1 : 0);
