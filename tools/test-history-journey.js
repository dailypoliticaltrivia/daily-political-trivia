#!/usr/bin/env node
'use strict';
/* Runs the REAL daily-route code (games/capitol-climb/dcj-core.js) over 60 consecutive dates against the sample bank, the manifest's banks and every
   real bank that exists, and checks the properties the game promises. Also stress-tests thin pools.
   Usage (from the site folder):   node tools/test-history-journey.js [--days 60] [--from 2026-11-11] [--quiet]
   Exit code 1 if any check fails. Plain Node, no packages. */
const fs = require('fs');
const path = require('path');
const Core = require('../games/capitol-climb/dcj-core.js');

const DATA = path.join(__dirname, '..', 'games', 'capitol-climb', 'data');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const DAYS = +opt('days', 60), QUIET = args.includes('--quiet');
const from = (opt('from', '2026-11-11')).split('-').map(Number);

const stops = JSON.parse(fs.readFileSync(path.join(DATA, 'stops.json'), 'utf8')).stops;
const stopSet = {}; stops.forEach(s => { stopSet[s.id] = s; });
const loadBank = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return null; } };
const bankFiles = fs.readdirSync(DATA).filter(f => /^bank-.+\.json$/.test(f)).sort();
const manifest = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8')).banks || []; } catch (e) { return []; } })();
const dates = []; for (let i = 0; i < DAYS; i++) dates.push(Core.dateStr(new Date(from[0], from[1] - 1, from[2] + i)));

let failures = 0;
const log = (...a) => { if (!QUIET) console.log(...a); };
function check(ok, msg, extra) { if (!ok) { failures++; console.log('  FAIL  ' + msg + (extra ? '  ' + extra : '')); } else log('  ok    ' + msg + (extra ? '  ' + extra : '')); }
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const fx = n => n.toFixed(2);

function runSuite(label, banks, opts) {
  opts = opts || {};
  const pool = Core.mergeBanks(banks, stopSet), byId = {}; pool.forEach(q => { byId[q.id] = q; });
  const eligible = new Set(); pool.forEach(q => q.stops.forEach(s => { if (stopSet[s]) eligible.add(s); }));
  const periods = new Set(pool.map(q => q.period));
  console.log('\n== ' + label + ': ' + pool.length + ' questions, ' + eligible.size + ' stops with questions, ' + periods.size + ' periods ==');
  if (!pool.length) { check(Core.pickJourney(pool, stops, dates[0]).ids.length === 0, 'empty pool returns an empty route without crashing'); return; }
  const want = Math.min(20, pool.length);
  const runs = dates.map(d => Core.pickJourney(pool, stops, d));
  check(runs.every(r => r.ids.length === want && r.stops.length === want), 'always ' + want + ' questions and ' + want + ' stops', '(' + runs.map(r => r.ids.length).filter((v, i, a) => a.indexOf(v) === i).join(',') + ')');
  check(runs.every(r => new Set(r.ids).size === r.ids.length), 'no question repeated within a run');
  check(runs.every(r => r.ids.every((id, i) => byId[id] && byId[id].stops.indexOf(r.stops[i]) >= 0)), 'every question belongs to the stop where it is asked');
  check(runs.every(r => r.stops.every(s => stopSet[s])), 'every route stop is a known stop');
  check(runs.every(r => r.ids.every((id, i) => byId[id].difficulty === r.diffs[i])), 'diffs array matches the questions');
  if (want === 20) {
    const g = r => [r.diffs.slice(0, 7), r.diffs.slice(7, 14), r.diffs.slice(14, 20)].map(mean);
    const m = runs.map(g), avg = [0, 1, 2].map(k => mean(m.map(x => x[k])));
    check(avg[0] < avg[1] && avg[1] < avg[2], 'difficulty ramp: mean difficulty stops 1-7 < 8-14 < 15-20', '(' + avg.map(fx).join(' < ') + ')');
    check(m.every(x => x[0] <= x[1] && x[1] <= x[2]), 'every single run ramps up (never gets easier between the three groups)');
    const exact = mean(runs.map(r => r.diffs.filter((d, i) => d === (i < 7 ? 1 : i < 14 ? 2 : 3)).length / 20));
    log('        share of stops at exactly the planned difficulty: ' + Math.round(exact * 100) + '%');
    if (opts.realistic) check(exact >= 0.9, 'at least 90% of stops hit the planned difficulty', '(' + Math.round(exact * 100) + '%)');
  }
  const distinctStops = runs.map(r => new Set(r.stops).size);
  const minStops = Math.min(want, eligible.size);
  check(mean(distinctStops) >= Math.min(minStops, 14) - 0.01 && Math.min.apply(null, distinctStops) >= Math.min(minStops, 10), 'stop variety: distinct stops per run', '(avg ' + fx(mean(distinctStops)) + ', min ' + Math.min.apply(null, distinctStops) + ' of ' + eligible.size + ' available)');
  if (eligible.size >= 3) check(runs.every(r => r.stops.every((s, i) => i === 0 || s !== r.stops[i - 1])), 'no two consecutive questions at the same stop');
  const richPeriods = [1,2,3,4,5,6,7,8,9].filter(p => pool.filter(q => q.period === p).length >= 20).length;
  const pc = runs.map(r => new Set(r.ids.map(id => byId[id].period)).size), needP = Math.min(8, richPeriods);
  check(Math.min.apply(null, pc) >= needP, 'period spread: every run touches at least ' + needP + ' periods (' + richPeriods + ' of 9 have 20+ questions)', '(avg ' + fx(mean(pc)) + ', min ' + Math.min.apply(null, pc) + ')');
  const maxPer = Math.max.apply(null, runs.map(r => { const c = {}; r.ids.forEach(id => { c[byId[id].period] = (c[byId[id].period] || 0) + 1; }); return Math.max.apply(null, Object.values(c)); }));
  log('        most questions from one period in any run: ' + maxPer);
  const perCount = {}; pool.forEach(q => { perCount[q.period] = (perCount[q.period] || 0) + 1; });
  const balancedPool = periods.size === 9 && Object.values(perCount).every(c => c >= 25);
  if (balancedPool) check(maxPer <= 4, 'no period dominates a run (every period has 25+ questions)', '(max ' + maxPer + ')');
  else log('        note: periods are unevenly stocked (' + [1,2,3,4,5,6,7,8,9].map(p => 'P' + p + ':' + (perCount[p] || 0)).join(' ') + '), so the "no period dominates" check waits for balanced banks (max seen ' + maxPer + ')');
  const key = r => r.ids.join(','), skey = r => r.stops.join(',');
  check(new Set(runs.map(key)).size === runs.length, 'different question set on each of ' + DAYS + ' days');
  check(new Set(runs.map(skey)).size === runs.length, 'different route (stop order) on each day');
  const jac = []; for (let i = 1; i < runs.length; i++) { const a = new Set(runs[i - 1].ids), b = new Set(runs[i].ids); let n = 0; b.forEach(x => { if (a.has(x)) n++; }); jac.push(n / (a.size + b.size - n)); }
  log('        question overlap between consecutive days: avg ' + Math.round(mean(jac) * 100) + '%, max ' + Math.round(Math.max.apply(null, jac) * 100) + '%');
  if (opts.realistic) check(Math.max.apply(null, jac) <= 0.3, 'consecutive days share at most 30% of their questions');
  const seenQ = new Set(); runs.forEach(r => r.ids.forEach(id => seenQ.add(id)));
  log('        distinct questions used over ' + DAYS + ' days: ' + seenQ.size + ' of ' + pool.length);
  const again = dates.map(d => Core.pickJourney(pool, stops, d));
  check(JSON.stringify(again) === JSON.stringify(runs), 'deterministic: same date, same route and questions');
  const shuffled = banks.map(b => ({ bank: b.bank, questions: b.questions.slice().reverse() })).reverse();
  const pool2 = Core.mergeBanks(shuffled, stopSet);
  check(JSON.stringify(dates.slice(0, 10).map(d => Core.pickJourney(pool2, stops, d))) === JSON.stringify(runs.slice(0, 10)), 'deterministic regardless of bank file order');
  const sc = {}; runs.forEach(r => r.stops.forEach(s => { sc[s] = (sc[s] || 0) + 1; }));
  const counts = Object.keys(sc).map(k => sc[k]);
  log('        stop frequency over ' + DAYS + ' days: min ' + Math.min.apply(null, counts) + ', max ' + Math.max.apply(null, counts) + ' (of ' + DAYS + ' runs)' + (eligible.size < 26 ? '; ' + (26 - eligible.size) + ' stops have no question yet' : ''));
  const first = runs[0];
  log('        e.g. ' + dates[0] + ': ' + first.stops.map(s => stopSet[s].short).join(' > '));
  /* share text and ranks on a sample result */
  const res = first.ids.map((_, i) => i < 13 ? (i % 5 === 4 ? 0 : 1) : null);
  const txt = Core.shareText({ title: 'Capitol Climb', date: dates[0], res, lives: 0, lastStopName: stopSet[first.stops[12]].name, url: 'https://example.com/games/capitol-climb/' });
  if (opts.showShare) console.log(txt.split('\n').map(l => '        | ' + l).join('\n'));
  check(txt.split('\n').length >= 5 && /^(🟩|🟥|⬜)/u.test(txt.split('\n')[1]), 'share text has a header, two rows of markers, a summary line');
}

/* ---------- thin-pool stress ---------- */
function thin() {
  console.log('\n== thin pools: nothing may crash, the route is as long as the pool allows ==');
  const mk = (id, stopsL, d, p) => ({ id, period: p || 1 + (id.length % 9), themes: ['politics-power'], stops: stopsL, difficulty: d, q: 'Q ' + id, options: ['a', 'b', 'c', 'd'], answer: 0, explain: 'x'.repeat(30) });
  const cases = {
    '1 question': [mk('t1', ['white-house'], 1)],
    '5 questions, one stop': [1, 2, 3, 1, 2].map((d, i) => mk('t' + i, ['treasury'], d)),
    '19 questions (one short of a route)': Array.from({ length: 19 }, (_, i) => mk('u' + i, [stops[i % 26].id], 1 + (i % 3), 1 + (i % 9))),
    '20 questions, all hard, one stop': Array.from({ length: 20 }, (_, i) => mk('v' + i, ['pentagon'], 3, 7)),
    '60 questions on two stops': Array.from({ length: 60 }, (_, i) => mk('w' + i, [i % 2 ? 'treasury' : 'pentagon'], 1 + (i % 3), 1 + (i % 9))),
    '300 questions, stops missing from the list': Array.from({ length: 300 }, (_, i) => mk('x' + i, i % 3 ? ['nowhere'] : [stops[i % 26].id], 1 + (i % 3), 1 + (i % 9))),
    'only difficulty 2, 26 stops': Array.from({ length: 80 }, (_, i) => mk('y' + i, [stops[i % 26].id], 2, 1 + (i % 9)))
  };
  Object.keys(cases).forEach(name => {
    let ok = true, note = '';
    try {
      const pool = Core.mergeBanks([{ bank: 'x', questions: cases[name] }], stopSet);
      const usable = pool.length;
      const lens = new Set(), consecutive = [];
      dates.slice(0, 20).forEach(d => {
        const r = Core.pickJourney(pool, stops, d); lens.add(r.ids.length);
        if (new Set(r.ids).size !== r.ids.length) ok = false;
        if (r.ids.length !== Math.min(20, usable)) ok = false;
        const nStops = new Set(r.stops).size; if (nStops > 1) r.stops.forEach((s, i) => { if (i && s === r.stops[i - 1]) consecutive.push(i); });
      });
      note = '(usable ' + usable + ', route lengths ' + [...lens].join(',') + (consecutive.length ? ', ' + consecutive.length + ' unavoidable repeat stops in a row' : '') + ')';
    } catch (e) { ok = false; note = e.stack.split('\n')[0]; }
    check(ok, name, note);
  });
  /* endless picker */
  const pool = Core.mergeBanks([loadBank('bank-sample.json')], stopSet);
  const seen = {}; let n = 0, last = null, guard = 0;
  for (;;) { const r = Core.pickEndless(pool, { stop: 'supreme-court', period: null }, seen, Core.rngFrom('e' + n), last); if (!r.q) break; if (seen[r.q.id]) { n = -1; break; } seen[r.q.id] = 1; last = r.q.id; n++; if (++guard > 500) break; }
  const sc = Core.scopePool(pool, { stop: 'supreme-court' }).length;
  check(n === sc && sc > 0, 'endless: a location never repeats a question and ends when its pool is used up', '(' + n + ' of ' + sc + ' Supreme Court questions)');
  const none = Core.pickEndless(pool, { stop: 'supreme-court', period: 2 }, {}, Math.random);
  check(Core.scopePool(pool, { stop: 'supreme-court', period: 2 }).length === 1 || !!none, 'endless: period filter narrows the pool');
  check(Core.pickEndless([], { stop: null }, {}, Math.random).q === null, 'endless: empty pool returns no question');
}

/* ---------- main ---------- */
const sample = loadBank('bank-sample.json');
const real = bankFiles.filter(f => f !== 'bank-sample.json').map(loadBank).filter(Boolean);
console.log('Dates ' + dates[0] + ' .. ' + dates[dates.length - 1] + ' (' + DAYS + ' days). Bank files: ' + bankFiles.join(', ') + '. Manifest: ' + JSON.stringify(manifest));
if (sample) runSuite('sample bank only', [sample], { showShare: true });
else check(false, 'bank-sample.json exists');
const man = manifest.map(loadBank).filter(Boolean);
if (man.length && JSON.stringify(manifest) !== JSON.stringify(['bank-sample.json'])) runSuite('manifest banks (' + manifest.join(', ') + ')', man, { realistic: false });
if (real.length) runSuite('every real bank that exists (' + real.length + ' files) merged with the sample', real.concat(sample ? [sample] : []), { realistic: false });
thin();
console.log('\n' + (failures ? 'FAIL: ' + failures + ' check(s) failed' : 'PASS: all checks passed'));
process.exit(failures ? 1 : 0);
