#!/usr/bin/env node
/* Tests for the Dark Horse index + shards.   node tools/test-dh-shards.js [data-folder]    (exit 1 on any FAIL)
   1. the shards are current (build-dh-shards --check) and every shard equals its bank question; index rows match the banks
   2. each shard's answers validate (same rules as validate-trivia.js: names, weights, normalised spellings do not collide)
   3. the daily set drawn from the index equals the OLD logic (frozen copy below, whole banks) on 60 sample dates when the broad preference is
      off or when no broad question exists; with the default preference the 2/3/2 mix and distinct categories still hold
   4. the real trivia.js run against a stub browser: boots from the index, a full daily start fetches only the 7 shards (bytes counted); with
      index.json absent it falls back to whole banks; with the network down it shows the friendly error + Try again */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { build, validQ, BROAD_MIN, MIN_ANSWERS } = require('./build-dh-shards');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'games', 'dark-horse', 'data'));
const gameDir = path.resolve(__dirname, '..', 'games', 'dark-horse');   // trivia.js always comes from the real game folder; only the data folder can be pointed elsewhere
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log((c ? '  ok    ' : '  FAIL  ') + m); };
const kb = n => (n / 1024).toFixed(1) + ' KB';

// ---- frozen copy of the pre-index selection logic (trivia.js before the index change) ----
const COUNT = 7, SLOTS = [3, 3, 2, 2, 2, 1, 1];
function oldRng(str) {
  let h = 1779033703 ^ str.length, i;
  for (i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); let a = (h ^ (h >>> 16)) >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function oldPick(pool, rnd) {
  const usedCat = {}, usedId = {}, out = [];
  const n = Math.min(COUNT, pool.length);
  function free(d, noCat) { return pool.filter(x => (d === 0 || x.difficulty === d) && !usedId[x.id] && (!noCat || !usedCat[x.category])); }
  for (let s = 0; s < n; s++) {
    const d = SLOTS[s]; let c = [];
    const tries = [d, d - 1, d + 1, d - 2, d + 2].filter(x => x >= 1 && x <= 3);
    for (let t = 0; t < tries.length && !c.length; t++) c = free(tries[t], true);
    if (!c.length) c = free(0, false);
    const pick = c[Math.floor(rnd() * c.length)];
    usedCat[pick.category] = 1; usedId[pick.id] = 1; out.push(pick);
  }
  return out.map((x, i) => [x, i]).sort((a, b) => a[0].difficulty - b[0].difficulty || a[1] - b[1]).map(x => x[0]);
}

// ---- load the real trivia.js into a vm with a stub browser ----
const TRIVIA_SRC = fs.readFileSync(path.join(gameDir, 'trivia.js'), 'utf8');
function stubBrowser(files /* rel path -> Buffer | null */, opts = {}) {
  const fetched = [];
  const elements = {};
  function el(id) {
    return elements[id] || (elements[id] = {
      id, value: '', textContent: '', className: '', style: {}, listeners: {}, attrs: {},
      classList: { toggle() {}, add() {}, remove() {} }, firstElementChild: { style: {} },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, focus() {}, select() {},
      querySelector() { return el('q'); }, querySelectorAll() { return []; }, click() { (this.listeners.click || []).forEach(f => f.call(this, { preventDefault() {} })); }
    });
  }
  const game = el('game'); let html = '';
  Object.defineProperty(game, 'innerHTML', { get: () => html, set: v => { html = v; for (const k of Object.keys(elements)) if (!['game', 'live-timer', 'live-status'].includes(k)) delete elements[k]; } });
  el('live-timer'); el('live-status');
  const store = {};
  const win = {
    document: { getElementById: el, querySelector: () => el('q'), querySelectorAll: () => [] },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { search: '', origin: 'http://x', pathname: '/' }, history: { replaceState() {} },
    addEventListener() {}, scrollTo() {}, navigator: {},
    setTimeout: (f) => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch(url) {
      const u = String(url).replace(/^\.?\//, '');
      fetched.push(u);
      if (opts.offline) return Promise.reject(new TypeError('Failed to fetch'));
      const b = files(u);
      return Promise.resolve(b ? { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(b.toString('utf8'))) } : { ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    },
    Math, Date, JSON, Promise, Object, Array, String, Number, Map, Set, encodeURIComponent, parseInt, isNaN, RegExp
  };
  win.window = win; win.window.SIN = undefined;
  const ctx = vm.createContext(win);
  Object.assign(ctx, { document: win.document, location: win.location, history: win.history, localStorage: win.localStorage, navigator: win.navigator, fetch: win.fetch, setTimeout: win.setTimeout });
  return { ctx, win, fetched, game: () => html, el, store };
}
const flush = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 30; i++) await flush(); }

(async () => {
  // ---------------------------------------------------------------- 1. shards = banks
  console.log('1. shards and index match the banks (' + dir + ')');
  const out = build(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const bankQs = [], allQs = [];   // bankQs: the questions the game may use (>= MIN_ANSWERS answers)
  const seen = new Set();
  for (const f of manifest.banks) { const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); for (const q of b.questions) if (validQ(q) && !seen.has(q.id)) { seen.add(q.id); allQs.push(q); if (q.answers.length >= MIN_ANSWERS) bankQs.push(q); } }
  bankQs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  ok(fs.existsSync(path.join(dir, 'index.json')), 'data/index.json exists');
  ok(/var MIN_ANSWERS = (\d+)/.exec(TRIVIA_SRC)[1] === String(MIN_ANSWERS), `MIN_ANSWERS (${MIN_ANSWERS}) is set once, in trivia.js, and the builder reads it from there`);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  ok(fs.readFileSync(path.join(dir, 'index.json'), 'utf8') === out.indexText, 'index.json is current (matches a fresh build of the banks)');
  ok(idx.q.length === bankQs.length, `index has one row per bank question with >= ${MIN_ANSWERS} answers (${idx.q.length} of ${bankQs.length}; ${allQs.length - bankQs.length} of ${allQs.length} left out)`);
  ok(idx.minAnswers === MIN_ANSWERS && idx.excluded === allQs.length - bankQs.length && idx.q.every(r => r.n >= MIN_ANSWERS), 'index records minAnswers and the excluded count, and no row is below the minimum');
  let diff = 0, rowBad = 0, missing = 0, shardBytes = 0;
  const shardSize = {};
  idx.q.forEach((r, i) => {
    const q = bankQs[i];
    const p = path.join(dir, 'q', r.f);
    if (!fs.existsSync(p)) { missing++; return; }
    const txt = fs.readFileSync(p, 'utf8'); shardBytes += Buffer.byteLength(txt); shardSize[r.id] = Buffer.byteLength(txt);
    if (JSON.stringify(JSON.parse(txt)) !== JSON.stringify(q)) diff++;
    if (r.id !== q.id || r.c !== q.category || r.d !== q.difficulty || r.p !== q.prompt || r.n !== q.answers.length || (!!r.b) !== (q.answers.length >= BROAD_MIN)) rowBad++;
  });
  ok(!missing, `every row's shard file exists (${missing} missing)`);
  ok(!diff, `each shard's content equals its bank question (${diff} differ)`);
  ok(!rowBad, `each index row matches its question: id, category, difficulty, prompt, answer count, broad flag (${rowBad} wrong)`);
  const onDisk = fs.readdirSync(path.join(dir, 'q')).length;
  ok(onDisk === idx.q.length, `no leftover shard files (${onDisk} files, ${idx.q.length} rows)`);
  ok(idx.broadMin === BROAD_MIN && /var BROAD_WEIGHT = \d+, BROAD_MIN = (\d+)/.exec(TRIVIA_SRC)[1] === String(BROAD_MIN), `BROAD_MIN is ${BROAD_MIN} in the builder, the index and trivia.js`);
  console.log(`  info  ${idx.q.length} questions, ${idx.q.filter(r => r.b).length} broad; index ${kb(Buffer.byteLength(out.indexText))} (${kb(zlib.gzipSync(out.indexText).length)} gzip); shards ${(shardBytes / 1048576).toFixed(2)} MB total`);

  // ---------------------------------------------------------------- 2. answers validate
  console.log('2. each shard validates');
  const norm = (() => { const m = {}; vm.runInNewContext(TRIVIA_SRC, Object.assign(stubBrowser(() => null).ctx, { __DH_EXPOSE: a => { m.a = a; } })); return m.a.norm; })();
  let shardErrs = 0; const sample = [];
  for (const r of idx.q) {
    const q = JSON.parse(fs.readFileSync(path.join(dir, 'q', r.f), 'utf8')), owner = new Map(); let e = '';
    if (!validQ(q)) e = 'invalid structure';
    else q.answers.forEach((a, i) => {
      if (a.weight !== undefined && !(Number.isInteger(a.weight) && a.weight >= 1 && a.weight <= 5)) e = e || 'bad weight';
      const own = new Set();
      for (const t of [a.name, ...(a.aliases || [])]) {
        const k = norm(t);
        if (!k) { e = e || 'empty key for ' + t; continue; }
        if (own.has(k)) { e = e || 'duplicate spelling ' + t; continue; }
        own.add(k);
        if (owner.has(k) && owner.get(k) !== i) e = e || `"${t}" collides with answer #${owner.get(k)}`; else owner.set(k, i);
      }
    });
    if (e) { shardErrs++; if (sample.length < 5) sample.push(r.id + ': ' + e); }
  }
  ok(!shardErrs, `all ${idx.q.length} shards: valid structure, weights 1-5, no colliding spellings (${shardErrs} bad)${sample.length ? ' ' + sample.join('; ') : ''}`);

  // ---------------------------------------------------------------- 3. same daily set as the old logic
  console.log('3. random draw (practice rounds; the daily set uses section 5)');
  let api; vm.runInNewContext(TRIVIA_SRC, Object.assign(stubBrowser(() => null).ctx, { __DH_EXPOSE: a => { api = a; } }));
  const rows = idx.q.map(r => ({ id: r.id, category: r.c, difficulty: r.d, broad: !!r.b }));
  const oldPool = bankQs.map(q => ({ id: q.id, category: q.category, difficulty: q.difficulty }));
  const dates = []; for (let i = 0; i < 60; i++) { const d = new Date(Date.UTC(2026, 0, 1 + i * 6)); dates.push(d.toISOString().slice(0, 10)); }
  const seed = d => api.rngFrom('politrivia|' + d), oseed = d => oldRng('politrivia|' + d);
  const defW = api.getBroadWeight();
  api.setBroadWeight(1);
  let same = 0; dates.forEach(d => { if (api.pickSet(rows, seed(d)).map(x => x.id).join() === oldPick(oldPool, oseed(d)).map(x => x.id).join()) same++; });
  ok(same === dates.length, `broad preference off (weight 1): identical to the old logic on ${same}/${dates.length} dates`);
  api.setBroadWeight(defW);
  const noBroad = rows.map(r => Object.assign({}, r, { broad: false }));
  same = 0; dates.forEach(d => { if (api.pickSet(noBroad, seed(d)).map(x => x.id).join() === oldPick(oldPool, oseed(d)).map(x => x.id).join()) same++; });
  ok(same === dates.length, `default weight ${defW}, pool with no broad questions: identical to the old logic on ${same}/${dates.length} dates`);
  let changed = 0, mixBad = 0, withBroad = 0;
  const diffMix = s => [1, 2, 3].map(k => s.filter(x => x.difficulty === k).length).join('/');
  dates.forEach(d => {
    const s = api.pickSet(rows, seed(d)), o = oldPick(oldPool, oseed(d));
    if (s.map(x => x.id).join() !== o.map(x => x.id).join()) changed++;
    if (s.some(x => x.broad)) withBroad++;
    if (s.length !== 7 || diffMix(s) !== '2/3/2' || new Set(s.map(x => x.category)).size !== s.length) mixBad++;
  });
  ok(!mixBad, `default weight ${defW}: every one of ${dates.length} days keeps 7 questions, the 2/3/2 mix and distinct categories (${mixBad} broken)`);
  console.log(`  info  with the preference on, ${changed}/${dates.length} sample days differ from the old logic and ${withBroad} contain a broad question (${rows.filter(r => r.broad).length} of ${rows.length} questions are broad)`);
  // a pool with few broad questions and a pool with many
  for (const share of [0.01, 0.5, 1]) {
    const mk = rows.map((r, i) => Object.assign({}, r, { broad: (i * 7919 % 100) / 100 < share }));
    let w = 0, bb = 0, tot = 0; dates.forEach(d => { const s = api.pickSet(mk, seed(d)); tot += s.length; w += s.filter(x => x.broad).length; if (s.length !== 7 || diffMix(s) !== '2/3/2' || new Set(s.map(x => x.category)).size !== 7) bb++; });
    ok(!bb, `${(share * 100)}% of the pool broad: all days keep the mix and categories; ${(100 * w / tot).toFixed(0)}% of drawn questions are broad`);
  }
  // determinism
  ok(api.pickSet(rows, seed('2026-11-12')).map(x => x.id).join() === api.pickSet(rows, seed('2026-11-12')).map(x => x.id).join(), 'same date, same set (deterministic)');

  // ---------------------------------------------------------------- 4. real trivia.js in a stub browser
  console.log('4. trivia.js end to end (stub browser)');
  const read = rel => { const p = path.join(dir, rel.replace(/^data\//, '')); return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p) : null; };
  const run = async (files, opts) => { const b = stubBrowser(files, opts); vm.runInContext(TRIVIA_SRC, b.ctx); await settle(); return b; };
  const bytesOf = (b) => b.fetched.reduce((n, u) => { const f = read(u); return n + (f ? f.length : 0); }, 0);
  const gz = (b) => b.fetched.reduce((n, u) => { const f = read(u); return n + (f ? zlib.gzipSync(f).length : 0); }, 0);
  {
    const b = await run(read);
    ok(/Play today/.test(b.game()), 'boots from the index and shows the intro');
    ok(b.fetched.length === 1 && b.fetched[0] === 'data/index.json', 'boot fetched only data/index.json');
    const bootRaw = bytesOf(b), bootGz = gz(b);
    b.el('tg-go').click(); await settle();
    const shardFetches = b.fetched.filter(u => u.startsWith('data/q/'));
    ok(shardFetches.length === 7, `starting the daily game fetched exactly 7 shards (${shardFetches.length})`);
    ok(!b.fetched.some(u => /bank-|manifest/.test(u)), 'no whole bank or manifest fetched');
    ok(/id="tg-in"/.test(b.game()), 'the first question is on screen');
    console.log(`  info  a day's download: index ${kb(bootRaw)} (${kb(bootGz)} gzip) + 7 shards ${kb(bytesOf(b) - bootRaw)} (${kb(gz(b) - bootGz)} gzip) = ${kb(bytesOf(b))} raw / ${kb(gz(b))} gzip, ${b.fetched.length} requests`);
    // each of the 60 sample days
    let maxDay = 0, sum = 0;
    dates.forEach(d => { const bytes = api.pickSet(rows, seed(d)).reduce((n, x) => n + shardSize[x.id], 0); maxDay = Math.max(maxDay, bytes); sum += bytes; });
    console.log(`  info  shard bytes per day over the 60 sample dates: average ${kb(sum / 60)}, largest ${kb(maxDay)} (raw; add the index)`);
  }
  {
    const b = await run(rel => rel === 'data/index.json' ? null : read(rel));
    ok(/Play today/.test(b.game()), 'index.json absent: falls back to whole-bank loading and shows the intro');
    ok(manifest.banks.every(f => b.fetched.includes('data/' + f)), 'fallback fetched manifest.json and every bank');
    b.el('tg-go').click(); await settle();
    ok(/id="tg-in"/.test(b.game()), 'fallback: a daily game starts');
  }
  {
    const b = await run(read, { offline: true });
    ok(/could not be loaded/.test(b.game()) && /Try again/.test(b.game()), 'network down: friendly error with a Try again button (no whole-bank flood)');
    ok(!b.fetched.some(u => /bank-/.test(u)), 'network down: did not try to pull every bank');
  }
  {
    // one shard fails once (flaky), then Try again succeeds
    let fail = true;
    const b = await run(rel => { if (/^data\/q\//.test(rel) && fail) return null; return read(rel); });
    b.el('tg-go').click(); await settle();
    ok(/could not be loaded/.test(b.game()) && /tg-retry/.test(b.game()), 'a shard that fails to load: friendly error with a Try again button');
    fail = false; b.el('tg-retry').click(); await settle();
    ok(/id="tg-in"/.test(b.game()), 'Try again loads the shards and starts the game');
  }
  // ---------------------------------------------------------------- 5. the daily cycle: 730 days
  console.log('5. daily selection by cycles: 730 consecutive days from 2026-11-12, pool of ' + rows.length);
  for (const W of [defW, 1]) {
    api.setBroadWeight(W);
    let short = 0, catBad = 0, dupBad = 0, calls = 0; const last = {}, gaps = [], used = new Set(), mix = {};
    const t0 = Date.now();
    for (let i = 0; i < 730; i++) {
      const d = new Date(Date.UTC(2026, 10, 12 + i)).toISOString().slice(0, 10);
      const s = api.dailySet(rows, d); calls++;
      if (s.length !== Math.min(7, rows.length)) short++;
      if (new Set(s.map(x => x.id)).size !== s.length) dupBad++;
      if (new Set(s.map(x => x.category)).size !== s.length) catBad++;
      const m = diffMix(s); mix[m] = (mix[m] || 0) + 1;
      s.forEach(x => { used.add(x.id); if (x.id in last) gaps.push(i - last[x.id]); last[x.id] = i; });
    }
    gaps.sort((p, q) => p - q);
    const same = api.dailySet(rows, '2026-11-12').map(x => x.id).join() === api.dailySet(rows.slice(), '2026-11-12').map(x => x.id).join();
    const cats = new Set(rows.map(r => r.category)).size;
    ok(!short && !dupBad, `broad weight ${W}: all 730 days have ${Math.min(7, rows.length)} different questions (${short} short, ${dupBad} with a repeated question)`);
    ok(cats < 7 || !catBad, `broad weight ${W}: distinct categories every day (${catBad} days with a repeated category)`);
    ok(rows.length < 100 || gaps[0] >= Math.floor(rows.length / 28), `broad weight ${W}: a question never repeats sooner than ${gaps[0]} days (>= ${Math.floor(rows.length / 28)} required for a pool this size)`);
    ok(same, 'a date gives the same set every time (stateless)');
    console.log(`  info  W=${W}: distinct questions used ${used.size} of ${rows.length}; gap between repeats min ${gaps[0]}, median ${gaps[gaps.length >> 1]}, mean ${(gaps.reduce((p, q) => p + q, 0) / (gaps.length || 1)).toFixed(1)}, max ${gaps[gaps.length - 1]}; day mixes easy/medium/hard ${JSON.stringify(mix)} (2/3/2 only where the tiers are big enough: the pool has ${[1, 2, 3].map(k => rows.filter(r => r.difficulty === k).length).join('/')})`);
  }
  api.setBroadWeight(defW);
  ok(api.dailySet(rows, '1999-03-04').length === Math.min(7, rows.length) && api.dailySet(rows, '2090-12-31').length === Math.min(7, rows.length), 'any past or future date works');
  console.log(bad ? `\nRESULT: ${bad} FAIL` : '\nRESULT: OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
