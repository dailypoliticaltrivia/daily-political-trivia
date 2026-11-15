/* Capitol Climb: pure game logic (no DOM). Loaded by the page as window.DCJCore and by tools/test-history-journey.js through require().
   Everything the daily run depends on lives here: the seeded RNG, the route and question picker, ranks and the share text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DCJCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROUTE_LEN = 20, LIVES = 3;
  var PERIODS = [
    null,
    { n: 1, years: '1491-1607', name: 'Contact and colonies' },
    { n: 2, years: '1607-1754', name: 'Colonial America' },
    { n: 3, years: '1754-1800', name: 'Revolution and the new nation' },
    { n: 4, years: '1800-1848', name: 'Expansion and reform' },
    { n: 5, years: '1844-1877', name: 'Civil War and Reconstruction' },
    { n: 6, years: '1865-1898', name: 'Gilded Age' },
    { n: 7, years: '1890-1945', name: 'Progressives to World War II' },
    { n: 8, years: '1945-1980', name: 'Cold War and civil rights' },
    { n: 9, years: '1980-present', name: 'Modern America' }
  ];
  var SYM = { ok: '🟩', miss: '🟥', none: '⬜' };   // correct, missed, not reached

  /* ---------- seeded random ---------- */
  function rngFrom(str) {
    str = String(str);
    var h = 1779033703 ^ str.length, i;
    for (i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    var a = (h ^ (h >>> 16)) >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function pad2(n) { return ('0' + n).slice(-2); }
  function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function prettyDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  /* ---------- question validity (the page tolerates bad banks: invalid items are skipped) ---------- */
  function validQuestion(q, stopSet) {
    if (!q || typeof q.id !== 'string' || typeof q.q !== 'string' || !q.q.trim()) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    for (var i = 0; i < 4; i++) if (typeof q.options[i] !== 'string' || !q.options[i].trim()) return false;
    if (!(q.answer === 0 || q.answer === 1 || q.answer === 2 || q.answer === 3)) return false;
    if (!(q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3)) return false;
    if (!(q.period >= 1 && q.period <= 9)) return false;
    if (!Array.isArray(q.stops) || !q.stops.length) return false;
    if (stopSet && !q.stops.some(function (s) { return stopSet[s]; })) return false;
    return true;
  }
  /* merge banks (arrays of question arrays): drops invalid items and repeated ids, sorts by id so the daily pick never depends on file order */
  function mergeBanks(banks, stopSet) {
    var seen = {}, out = [];
    banks.forEach(function (b) {
      if (b && Array.isArray(b.questions)) b.questions.forEach(function (q) {
        if (validQuestion(q, stopSet) && !seen[q.id]) { seen[q.id] = 1; out.push(q); }
      });
    });
    out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return out;
  }

  /* ---------- the daily route ---------- */
  function rampCounts(n) {              // 20 -> 7 easy, 7 medium, 6 hard; smaller routes keep the same shape
    if (n >= ROUTE_LEN) return [0, 7, 7, 6];
    var a = Math.round(n * 7 / 20), b = Math.round(n * 7 / 20), c = n - a - b;
    return [0, a, b, c];
  }
  function diffOrder(t) { return [t, t - 1, t + 1, t - 2, t + 2].filter(function (x) { return x >= 1 && x <= 3; }); }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  function pickOne(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  /* A tidy walk through one tier's stops: nearest-neighbour from `from` (or a random start), sometimes taking the second nearest. */
  function walkOrder(items, meta, from, rnd) {
    var left = items.slice(), out = [], cur = from;
    if (!cur) { var f = left.splice(Math.floor(rnd() * left.length), 1)[0]; out.push(f); cur = meta[f.sid]; }
    while (left.length) {
      left.sort(function (p, q) { return dist2(meta[p.sid], cur) - dist2(meta[q.sid], cur); });
      var k = (left.length > 1 && rnd() < 0.2) ? 1 : 0, nx = left.splice(k, 1)[0];
      out.push(nx); cur = meta[nx.sid];
    }
    return out;
  }

  /* pool: validated questions; stops: the stops.json array. Returns {date, stops:[ids], ids:[ids], diffs:[1|2|3]} (fewer than 20 only if the pool is that small). */
  function pickJourney(pool, stops, date) {
    var rnd = rngFrom('dcj|' + date), meta = {}, byStop = {}, usable = {}, i;
    stops.forEach(function (s) { meta[s.id] = s; });
    pool.forEach(function (q) {
      var any = false;
      q.stops.forEach(function (sid) { if (meta[sid]) { (byStop[sid] = byStop[sid] || []).push(q); any = true; } });
      if (any) usable[q.id] = 1;
    });
    var avail = Object.keys(byStop).sort();
    var total = Object.keys(usable).length, N = Math.min(ROUTE_LEN, total);
    if (!N) return { date: date, stops: [], ids: [], diffs: [] };
    var need = rampCounts(N), usedQ = {}, usedStop = {}, perPeriod = {}, picks = {};
    for (i = 1; i <= 9; i++) perPeriod[i] = 0;

    /* the day's walk sweeps the city: each difficulty tier is anchored to one of three areas (west, middle, east), in a random order */
    var ANCHORS = [{ x: 85, y: 150 }, { x: 222, y: 108 }, { x: 332, y: 128 }], sweep = [0, 1, 2], rank = {};
    for (i = 2; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), tmpA = sweep[i]; sweep[i] = sweep[j]; sweep[j] = tmpA; }
    [1, 2, 3].forEach(function (t) {
      var an = ANCHORS[sweep[t - 1]], rk = {};
      avail.slice().sort(function (p, q) { return dist2(meta[p], an) - dist2(meta[q], an) || (p < q ? -1 : 1); }).forEach(function (sid, n) { rk[sid] = n; });
      rank[t] = rk;
    });

    function choose(tier) {
      /* [how many of the nearest stops to this tier's area may be used, may a stop be used twice]: widen the circle before giving up on variety */
      var pairs = null, d, r, attempts = [[10, false], [14, false], [18, false], [99, false], [99, true]];
      outer:
      for (var di = 0; di < diffOrder(tier).length; di++) {
        d = diffOrder(tier)[di];
        for (r = 0; r < attempts.length; r++) {
          var reach = attempts[r][0], reuse = attempts[r][1]; pairs = [];
          for (var si = 0; si < avail.length; si++) {
            var sid = avail[si]; if ((!reuse && usedStop[sid]) || rank[tier][sid] >= reach) continue;
            var list = byStop[sid];
            for (var qi = 0; qi < list.length; qi++) { var q = list[qi]; if (!usedQ[q.id] && q.difficulty === d) pairs.push({ sid: sid, q: q }); }
          }
          if (pairs.length) break outer;
        }
      }
      if (!pairs || !pairs.length) {                 // thin pool: any unused question at all
        pairs = [];
        avail.forEach(function (sid) { byStop[sid].forEach(function (q) { if (!usedQ[q.id]) pairs.push({ sid: sid, q: q }); }); });
        if (!pairs.length) return null;
      }
      var byP = {}, periods = [];
      pairs.forEach(function (p) { (byP[p.q.period] = byP[p.q.period] || []).push(p); });
      periods = Object.keys(byP).map(Number);
      var minC = Math.min.apply(null, periods.map(function (p) { return perPeriod[p]; }));
      var best = periods.filter(function (p) { return perPeriod[p] === minC; }).sort(function (a, b) { return a - b; });
      var per = pickOne(best, rnd), inPer = byP[per];
      var sids = []; inPer.forEach(function (p) { if (sids.indexOf(p.sid) < 0) sids.push(p.sid); });
      sids.sort();
      var sid2 = pickOne(sids, rnd), cand = inPer.filter(function (p) { return p.sid === sid2; });
      var pick = pickOne(cand, rnd);
      usedQ[pick.q.id] = 1; usedStop[pick.sid] = 1; perPeriod[pick.q.period]++;
      return { sid: pick.sid, q: pick.q, tier: tier };
    }

    [3, 2, 1].forEach(function (t) {
      picks[t] = [];
      for (var k = 0; k < need[t]; k++) { var p = choose(t); if (p) picks[t].push(p); }
    });
    /* if a tier came up short (tiny pool), top it up from the others so the route has N stops */
    var count = picks[1].length + picks[2].length + picks[3].length;
    for (var t2 = 3; count < N && t2 >= 1; t2--) { var more = choose(t2); if (more) { picks[t2].push(more); count++; } }

    var ordered = [], from = null;
    [1, 2, 3].forEach(function (t) {
      if (!picks[t].length) return;
      var seq = walkOrder(picks[t], meta, from, rnd);
      seq.forEach(function (p) { ordered.push(p); });
      from = meta[seq[seq.length - 1].sid];
    });
    /* never the same stop twice in a row (only happens when stops had to be reused): swap with another entry of the same tier */
    function clash(arr, i) { return (i > 0 && arr[i].sid === arr[i - 1].sid) || (i < arr.length - 1 && arr[i].sid === arr[i + 1].sid); }
    for (var x = 1; x < ordered.length; x++) {
      if (ordered[x].sid !== ordered[x - 1].sid) continue;
      for (var y = 0; y < ordered.length; y++) {
        if (y === x || ordered[y].tier !== ordered[x].tier) continue;
        var tmp = ordered[x]; ordered[x] = ordered[y]; ordered[y] = tmp;
        if (!clash(ordered, x) && !clash(ordered, y)) break;
        tmp = ordered[x]; ordered[x] = ordered[y]; ordered[y] = tmp;
      }
    }
    return {
      date: date,
      stops: ordered.map(function (p) { return p.sid; }),
      ids: ordered.map(function (p) { return p.q.id; }),
      diffs: ordered.map(function (p) { return p.q.difficulty; })
    };
  }

  /* ---------- endless ---------- */
  /* scope: {stop: id|null, period: 1-9|null}; seen: {id:1}. Returns {q, stop, left, total} or {q:null, total} when the scope is used up. */
  function scopePool(pool, scope) {
    scope = scope || {};
    return pool.filter(function (q) { return (!scope.stop || q.stops.indexOf(scope.stop) >= 0) && (!scope.period || q.period === scope.period); });
  }
  function pickEndless(pool, scope, seen, rnd, lastId) {
    rnd = rnd || Math.random; seen = seen || {};
    var all = scopePool(pool, scope), fresh = all.filter(function (q) { return !seen[q.id]; });
    if (!fresh.length) return { q: null, total: all.length, left: 0 };
    var cand = fresh.length > 1 ? fresh.filter(function (q) { return q.id !== lastId; }) : fresh;
    var q = pickOne(cand, rnd);
    var stop = scope && scope.stop ? scope.stop : pickOne(q.stops, rnd);
    return { q: q, stop: stop, left: fresh.length - 1, total: all.length };
  }

  /* ---------- result, rank, share ---------- */
  /* res: array of 1 (correct) / 0 (wrong) / null (not reached). */
  function summarize(res, lives) {
    var correct = 0, wrong = 0, reached = 0;
    res.forEach(function (r, i) { if (r === 1) { correct++; reached = i + 1; } else if (r === 0) { wrong++; reached = i + 1; } });
    return { correct: correct, wrong: wrong, reached: reached, lives: lives, total: res.length, complete: reached === res.length && lives > 0 };
  }
  function rankFor(sum) {
    if (sum.complete) return sum.lives >= 3 ? 'Archivist of the Republic' : sum.lives === 2 ? 'Senior Curator' : 'Park Ranger';
    var r = sum.reached;
    return r >= 15 ? 'Tour Guide' : r >= 10 ? 'Docent' : r >= 5 ? 'Day Tripper' : 'Tourist';
  }
  function squares(res) { return res.map(function (r) { return r === 1 ? SYM.ok : r === 0 ? SYM.miss : SYM.none; }); }
  function shareText(opts) {
    var sum = summarize(opts.res, opts.lives), sq = squares(opts.res), half = Math.ceil(sq.length / 2);
    var last = opts.lastStopName ? ' · ' + opts.lastStopName : '';
    return [
      '🏛️ ' + opts.title + ' · ' + prettyDate(opts.date),
      sq.slice(0, half).join(''),
      sq.slice(half).join(''),
      (sum.complete ? 'Finished all ' + sum.total + ' stops' : 'Reached stop ' + sum.reached + ' of ' + sum.total) + last,
      sum.correct + ' correct · ' + new Array(sum.lives + 1).join('❤️') + new Array(LIVES - sum.lives + 1).join('🖤') + ' · ' + rankFor(sum),
      opts.url || ''
    ].filter(function (l, i, a) { return l !== '' || i < a.length - 1; }).join('\n').replace(/\n+$/, '');
  }

  return {
    ROUTE_LEN: ROUTE_LEN, LIVES: LIVES, PERIODS: PERIODS, SYM: SYM,
    rngFrom: rngFrom, dateStr: dateStr, prettyDate: prettyDate,
    validQuestion: validQuestion, mergeBanks: mergeBanks,
    pickJourney: pickJourney, scopePool: scopePool, pickEndless: pickEndless,
    summarize: summarize, rankFor: rankFor, squares: squares, shareText: shareText
  };
});
