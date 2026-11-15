#!/usr/bin/env node
/* Dark Horse data builder: turns the question banks into what the phone actually downloads.
     node tools/build-dh-shards.js [data-folder] [--check] [--quiet]        (run from site/; default folder games/dark-horse/data)
   Reads data/manifest.json -> bank files (same rules as the game: invalid questions are skipped, the first copy of a duplicate id wins) and writes
     data/index.json              one small row per question: id, c (category), d (difficulty), p (prompt), n (answer count), b (1 = broad, n >= BROAD_MIN), f (shard file)
     data/q/<id>.<hash>.json      the full question (answers, aliases, weights, note) = exactly the object in the bank; <hash> is a content hash,
                                  so a changed question gets a new file name and GitHub Pages' 10-minute cache can never serve stale answers
   The game loads the index, picks the day's 7 questions and fetches only those 7 shards. Banks stay in place as the source of truth and as the
   fallback (the game falls back to loading whole banks when index.json is absent).
   --check  writes nothing; exit 1 if index.json / q/ are missing or out of date with the banks (used by predeploy-check and the validator).
   Questions with fewer than MIN_ANSWERS accepted answers (set in trivia.js, default 100) are left out: no index row, no file; the banks keep them.
   Re-run this after ANY edit to a bank or to manifest.json. BROAD_MIN must equal BROAD_MIN in trivia.js (the test checks). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BROAD_MIN = 500;
const FORMAT = 1;
// MIN_ANSWERS lives in ONE place: games/dark-horse/trivia.js (read from there, so the game and this build can never disagree). --min N overrides for experiments.
const MIN_ANSWERS = Number(/var MIN_ANSWERS = (\d+)/.exec(fs.readFileSync(path.join(__dirname, '..', 'games', 'dark-horse', 'trivia.js'), 'utf8'))[1]);

const sha = (s, n) => crypto.createHash('sha256').update(s).digest('hex').slice(0, n);
const isStr = v => typeof v === 'string' && v.trim().length > 0;
function validQ(q) {   // must match validQ() in trivia.js
  return q && typeof q.id === 'string' && typeof q.category === 'string' && typeof q.prompt === 'string' &&
    (q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3) && Array.isArray(q.answers) && q.answers.length > 0 &&
    q.answers.every(a => a && typeof a.name === 'string' && a.name.trim());
}
const fileSafe = id => id.replace(/[^A-Za-z0-9_-]/g, '_');

/** Pure: compute everything that should be on disk. Returns { index, files: Map(name -> text), indexText, problems }. */
function build(dir, opts) {
  const minAnswers = opts && opts.min !== undefined ? opts.min : MIN_ANSWERS;
  const problems = [], skipped = [], tooSmall = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
  if (!Array.isArray(manifest.banks)) throw new Error('manifest.json needs {"banks":[...]}');
  const srcHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'manifest.json'))).digest();
  const h = crypto.createHash('sha256'); h.update(srcHash);
  const seen = new Set(), qs = [];
  for (const f of manifest.banks) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) { problems.push(`${f} is listed in manifest.json but missing (skipped, like the game does)`); continue; }
    const raw = fs.readFileSync(file); h.update(raw);
    let data; try { data = JSON.parse(raw.toString('utf8').replace(/^﻿/, '')); } catch (e) { problems.push(`${f}: not valid JSON (${e.message})`); continue; }
    if (!data || !Array.isArray(data.questions)) { problems.push(`${f}: no "questions" array`); continue; }
    for (const q of data.questions) {
      if (!validQ(q)) { skipped.push(`${f}: ${q && q.id}`); continue; }
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      if (q.answers.length < minAnswers) { tooSmall.push(q.id); continue; }   // kept in the bank, left out of the game (no index row, no file)
      qs.push(q);
    }
  }
  qs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const files = new Map(), rows = [], used = new Set();
  for (const q of qs) {
    const text = JSON.stringify(q);
    let name = fileSafe(q.id) + '.' + sha(text, 8) + '.json';
    if (used.has(name)) { problems.push(`${q.id}: file name collides with another id after cleaning (${name})`); continue; }
    used.add(name); files.set(name, text);
    const row = { id: q.id, c: q.category, d: q.difficulty, p: q.prompt, n: q.answers.length };
    if (q.answers.length >= BROAD_MIN) row.b = 1;
    row.f = name;
    rows.push(row);
  }
  const index = { v: FORMAT, src: h.digest('hex').slice(0, 16), broadMin: BROAD_MIN, minAnswers, excluded: tooSmall.length, count: rows.length, q: rows };
  const indexText = JSON.stringify(index);
  return { index, indexText, files, problems, skipped, tooSmall };
}

function run(dir, opts) {
  const out = build(dir, opts), qdir = path.join(dir, 'q'), indexFile = path.join(dir, 'index.json');
  const say = opts.quiet ? () => {} : console.log;
  const stale = [];
  const onDisk = fs.existsSync(qdir) ? fs.readdirSync(qdir).filter(f => /\.json$/.test(f)) : [];
  if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8') !== out.indexText) stale.push('index.json differs from the banks');
  const missing = [...out.files.keys()].filter(f => !fs.existsSync(path.join(qdir, f)));
  const extra = onDisk.filter(f => !out.files.has(f));
  if (missing.length) stale.push(missing.length + ' shard file(s) missing');
  if (extra.length) stale.push(extra.length + ' leftover shard file(s) from older banks');
  if (opts.check) {
    if (stale.length) { console.log('Dark Horse shards are OUT OF DATE: ' + stale.join('; ') + '. Run: node tools/build-dh-shards.js'); return 1; }
    say(`Dark Horse shards are up to date (${out.index.count} questions, index ${out.indexText.length} bytes).`);
    return 0;
  }
  fs.mkdirSync(qdir, { recursive: true });
  let wrote = 0;
  for (const [name, text] of out.files) {
    const p = path.join(qdir, name);
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === text) continue;
    fs.writeFileSync(p, text); wrote++;
  }
  for (const f of extra) fs.unlinkSync(path.join(qdir, f));
  fs.writeFileSync(indexFile, out.indexText);
  let bytes = 0, broad = 0; for (const t of out.files.values()) bytes += Buffer.byteLength(t);
  for (const r of out.index.q) if (r.b) broad++;
  say(`Dark Horse: ${out.index.count} questions (${broad} broad, >= ${BROAD_MIN} answers; ${out.tooSmall.length} left out for having fewer than ${out.index.minAnswers} answers) -> index.json ${(Buffer.byteLength(out.indexText) / 1024).toFixed(1)} KB + ${out.files.size} shards in q/ (${(bytes / 1048576).toFixed(2)} MB total; ${wrote} written, ${extra.length} removed)`);
  out.problems.forEach(p => console.log('  warning: ' + p));
  if (out.skipped.length) console.log(`  warning: ${out.skipped.length} invalid question(s) skipped (run tools/validate-trivia.js): ${out.skipped.slice(0, 5).join(', ')}${out.skipped.length > 5 ? ', ...' : ''}`);
  return out.problems.some(p => /collides/.test(p)) ? 1 : 0;
}

module.exports = { build, run, validQ, BROAD_MIN, MIN_ANSWERS };
if (require.main === module) {
  const args = process.argv.slice(2), opts = { check: args.includes('--check'), quiet: args.includes('--quiet') };
  const mi = args.indexOf('--min'); if (mi >= 0) opts.min = Number(args[mi + 1]);
  const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--min') || path.join(__dirname, '..', 'games', 'dark-horse', 'data'));
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('No manifest.json in ' + dir); process.exit(1); }
  process.exit(run(dir, opts));
}
