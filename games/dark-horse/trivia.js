/* Dark Horse (the daily rarity quiz, from Daily Political Trivia).
   Data: banks data/manifest.json -> data/bank-*.json (see site/tools/validate-trivia.js) are turned by site/tools/build-dh-shards.js into
   data/index.json (one small row per question) + data/q/<id>.<hash>.json (one file of answers per question). The game loads the index,
   picks the day's questions from it and fetches ONLY those shards. If index.json is missing it falls back to loading every bank. */
(function(){
'use strict';
var SECONDS = 30, COUNT = 7, SLOTS = [3,3,2,2,2,1,1], PTS = 10;
var KEY = 'sin.politrivia.v1';
var esc = (window.SIN && SIN.esc) || function(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var $game = document.getElementById('game'), $lt = document.getElementById('live-timer'), $ls = document.getElementById('live-status');

/* ---------- ads: video breaks (see assets/ads/INTEGRATION.md). Never throws, never delays when ads are off. ---------- */
var GAME_ID = 'dark-horse';
function adBreak(kind){
  try { return window.SIN_ADS && SIN_ADS.ready ? Promise.resolve(SIN_ADS[kind](GAME_ID)) : Promise.resolve(); } catch(e){ return Promise.resolve(); }
}
function gameplay(on){ try { if (window.SIN_ADS && SIN_ADS.setGameplay) SIN_ADS.setGameplay(on); } catch(e){} }

/* ---------- effects: optional shared module assets/fx.js (a missing file changes nothing) ---------- */
function fx(type, o){ try { if (window.SINFX) SINFX.play(type, o); } catch(e){} }
function fxc(name){ try { return window.SINFX ? SINFX[name].apply(SINFX, Array.prototype.slice.call(arguments, 1)) : undefined; } catch(e){} }

/* ---------- storage (always guarded) ---------- */
function load(){
  var s; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){ return null; }
  /* saved numbers are written into the page: force them to be plain numbers (a hand-edited save cannot inject markup) */
  if (s && typeof s === 'object'){ s.qi = Math.max(0, s.qi | 0); s.tries = Math.max(0, s.tries | 0); s.timeLeft = Math.max(0, +s.timeLeft || 0); }
  return s;
}
function save(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); } catch(e){} }
function clearSaved(){ try { localStorage.removeItem(KEY); } catch(e){} }

/* ---------- matching ---------- */
function norm(s){
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  var t = s.split(' ').filter(function(w){ return w && w !== 'jr' && w !== 'sr'; });
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
/* Optimal string alignment distance, capped: the result is exact when <= max, otherwise just "more than max" (callers only compare with max).
   Banded (a cell further than max from the diagonal cannot be on a path of cost <= max), three reused rows, and it stops as soon as two
   consecutive rows are all over max, so a wrong answer is rejected after a few characters instead of filling a whole matrix per spelling. */
var DR0 = [], DR1 = [], DR2 = [];
function dist(a, b, max){
  var m = a.length, n = b.length, INF = max + 1;
  if (Math.abs(m - n) > max) return INF;
  var p2 = DR0, p1 = DR1, cur = DR2, i, j, lo, hi, v, w, c, rowMin, prevMin = 0, t;
  for (j = 0; j <= n; j++) p1[j] = j < INF ? j : INF;
  for (i = 1; i <= m; i++){
    lo = i - max > 1 ? i - max : 1; hi = i + max < n ? i + max : n;
    cur[lo - 1] = lo === 1 ? (i < INF ? i : INF) : INF;
    rowMin = lo === 1 ? cur[0] : INF;
    for (j = lo; j <= hi; j++){
      c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      v = p1[j] + 1; w = cur[j - 1] + 1; if (w < v) v = w;
      w = p1[j - 1] + c; if (w < v) v = w;
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)){ w = p2[j - 2] + 1; if (w < v) v = w; }
      if (v > INF) v = INF;
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (hi + 1 <= n) cur[hi + 1] = INF;
    if (rowMin > max && prevMin > max) return INF;
    prevMin = rowMin;
    t = p2; p2 = p1; p1 = cur; cur = t;
  }
  return p1[n] > INF ? INF : p1[n];
}
/* One matcher per question, built once when its shard loads: Maps of normalised spellings (exact + surname shortcuts) so an exact answer is
   a single lookup however many answers there are; only a miss falls back to typo matching, and that only visits keys within +-2 characters of the typed length. */
function addKey(map, k, idx){ if (!k) return; var a = map.get(k); if (!a) map.set(k, [idx]); else if (a.indexOf(idx) < 0) a.push(idx); }
/* Common first-name nicknames, used only for "Did you mean?" suggestions (never auto-accepted). */
var NICK = {bill:['william'], billy:['william'], will:['william'], willie:['william'], bob:['robert'], bobby:['robert'], rob:['robert'], dick:['richard'], rick:['richard'], rich:['richard'],
  ted:['edward','theodore'], teddy:['theodore','edward'], ed:['edward','edwin'], eddie:['edward'], ned:['edward'], jim:['james'], jimmy:['james'], jamie:['james'], joe:['joseph'], joey:['joseph'],
  mike:['michael'], mick:['michael'], chuck:['charles'], charlie:['charles'], tom:['thomas'], tommy:['thomas'], ben:['benjamin'], abe:['abraham'], al:['albert','alfred','alan','allen'],
  dan:['daniel'], danny:['daniel'], dave:['david'], fred:['frederick'], freddie:['frederick'], hank:['henry'], harry:['henry','harold'], jack:['john'], johnny:['john'], jerry:['gerald','jerome'],
  larry:['lawrence'], liz:['elizabeth'], beth:['elizabeth'], betty:['elizabeth'], betsy:['elizabeth'], pat:['patrick','patricia'], patty:['patricia'], ron:['ronald'], ronnie:['ronald'],
  sam:['samuel','samantha'], steve:['steven','stephen'], tony:['anthony'], walt:['walter'], kate:['katherine','catherine','kathleen'], kathy:['katherine','kathleen'], cathy:['catherine'],
  chris:['christopher','christine'], nick:['nicholas'], matt:['matthew'], andy:['andrew'], drew:['andrew'], greg:['gregory'], jeff:['jeffrey'], ken:['kenneth'], kenny:['kenneth'],
  tim:['timothy'], jon:['jonathan'], nate:['nathaniel','nathan'], pete:['peter'], phil:['philip'], ray:['raymond'], russ:['russell'], stan:['stanley'], sue:['susan'], susie:['susan'],
  meg:['margaret'], peggy:['margaret'], maggie:['margaret'], jenny:['jennifer'], jen:['jennifer'], debbie:['deborah'], deb:['deborah'], barb:['barbara'], cindy:['cynthia'], vicky:['victoria'],
  gene:['eugene'], herb:['herbert'], lou:['louis'], mo:['morris'], newt:['newton'], tip:['thomas'], gus:['augustus'], zach:['zachary'], josh:['joshua'], alex:['alexander','alexandria','alexandra']};
function buildMatcher(q){
  var exact = new Map(), auto = new Map(), inits = new Map(), tail = new Map(), toks = [];
  function addInits(k, i){ var t = k.split(' '); if (t.length >= 2 && t.length <= 5) addKey(inits, t.map(function(w){ return w[0]; }).join(''), i); }
  q.answers.forEach(function(a, i){
    var nk = norm(a.name);
    addKey(exact, nk, i); addInits(nk, i); toks[i] = nk.split(' ');
    if (toks[i].length >= 3) addKey(tail, toks[i].slice(-2).join(' '), i);   /* two-word surnames (Ocasio Cortez), suggestions only */
    (a.aliases || []).forEach(function(x){ var k = norm(x); addKey(exact, k, i); addInits(k, i); });
    if (a.surname !== false){
      var t = norm(a.name).split(' ');
      if (t.length >= 2 && t[t.length-1].length >= 3) addKey(auto, t[t.length-1], i);
      if (t.length >= 3) addKey(auto, t[0] + ' ' + t[t.length-1], i);
    }
    /* "Battle of Palo Alto" also answers to "Palo Alto", "Operation Desert Storm" to "Desert Storm" (a shared short form becomes a "Did you mean?" list) */
    [nk].concat((a.aliases || []).map(norm)).forEach(function(k){
      var sm = /^(?:battles? of|siege of|operation|treaty of|the battle of|first battle of|second battle of) (.{4,})$/.exec(k);
      if (sm && !exact.has(sm[1])) addKey(auto, sm[1], i);
      /* "United States Forest Service" also answers to "US Forest Service" / "U.S. Forest Service" */
      var us = /^united states (.{3,})$/.exec(k);
      if (us){ ['us ', 'u s '].forEach(function(p){ if (!exact.has(p + us[1])) addKey(auto, p + us[1], i); }); }
      /* "USS Kidd (DDG-993)" also answers to "USS Kidd" (two ships of one name become a "Did you mean?" list) */
      var hull = /^(uss .{2,}?) [a-z]{2,4} \d{1,4}(?: [a-z])?$/.exec(k);
      if (hull && !exact.has(hull[1])) addKey(auto, hull[1], i);
    });
  });
  var byLen = {};
  function bucket(m){ m.forEach(function(v, c){ if (c.length < 5) return; (byLen[c.length] || (byLen[c.length] = [])).push(c); }); }
  bucket(exact); bucket(auto);
  function match(input){
    var k = norm(input);
    if (!k) return {none:true, empty:true};
    var hit = exact.get(k) || auto.get(k);
    if (!hit){   /* a typed title is ignored: "Justice Ginsburg", "Chief Justice Marshall", "Senator Byrd", "Gov. Wallace" */
      var tk = k.replace(/^(?:chief justice|associate justice|justice|president|vice president|senator|sen|representative|rep|congressman|congresswoman|governor|gov|speaker|secretary|general|gen|admiral|judge|mayor|dr|mr|mrs|ms) /, '');
      if (tk !== k && tk) { var th = exact.get(tk) || auto.get(tk); if (th){ hit = th; k = tk; } else k = tk; }
    }
    if (hit) return hit.length === 1 ? {idx:hit[0]} : {ambiguous:true};
    var lim = k.length <= 4 ? 0 : k.length <= 8 ? 1 : 2;
    if (!lim) return {none:true};
    var best = lim + 1, set = [];
    for (var L = k.length - lim; L <= k.length + lim; L++){
      var cs = byLen[L]; if (!cs) continue;
      for (var n = 0; n < cs.length; n++){
        var c = cs[n], d = dist(k, c, lim);
        if (d > lim) continue;
        var idxs = exact.get(c) || auto.get(c);
        if (d < best){ best = d; set = []; }
        if (d === best) idxs.forEach(function(x){ if (set.indexOf(x) < 0) set.push(x); });
      }
    }
    return set.length === 1 ? {idx:set[0], fuzzy:true} : {none:true};
  }
  /* Up to 4 answers the player probably meant, most likely first. Reasons, in order: a shared last name, a nickname
     ("Bill Clinton"), initials ("AOC", "FDR"), all typed words inside one name ("Alexandria Cortez"), then a looser typo search. */
  function common(x, y){ return (q.answers[x].weight || 3) - (q.answers[y].weight || 3) || x - y; }
  match.suggest = function(input){
    var k = norm(input), out = [];
    k = k.replace(/^(?:chief justice|associate justice|justice|president|vice president|senator|sen|representative|rep|congressman|congresswoman|governor|gov|speaker|secretary|general|gen|admiral|judge|mayor|dr|mr|mrs|ms) (?=\S)/, '');
    function add(list){ (list || []).slice().sort(common).forEach(function(x){ if (out.length < 4 && out.indexOf(x) < 0) out.push(x); }); }
    if (!k) return out;
    var hit = exact.get(k) || auto.get(k); if (hit && hit.length > 1) add(hit);
    add(tail.get(k));
    var t = k.split(' ');
    if (NICK[t[0]] && t.length >= 2) NICK[t[0]].forEach(function(full){ var k2 = [full].concat(t.slice(1)).join(' '); add(exact.get(k2) || auto.get(k2)); });
    if (t.length === 1 && k.length >= 2 && k.length <= 5){ var ii = inits.get(k); if (ii && (k.length >= 3 || ii.length <= 2)) add(ii); }   /* two letters only when they point at one or two people */
    if (t.length >= 2 && out.length < 4){
      var sub = [];
      for (var i = 0; i < toks.length && sub.length < 12; i++) if (t.every(function(w){ return toks[i].indexOf(w) >= 0; })) sub.push(i);
      if (sub.length <= 4) add(sub);
    }
    if (out.length < 4 && k.length >= 4){
      var lim = k.length <= 5 ? 1 : k.length <= 8 ? 2 : 3, best = lim + 1, set = [];
      exact.forEach(scan); auto.forEach(scan); tail.forEach(scan);
      function scan(idxs, c){ if (Math.abs(c.length - k.length) > lim) return; var d = dist(k, c, lim); if (d > lim) return; if (d < best){ best = d; set = []; } if (d === best) idxs.forEach(function(x){ if (set.indexOf(x) < 0) set.push(x); }); }
      if (set.length <= 4) add(set);
    }
    return out;
  };
  return match;
}

/* ---------- daily selection ---------- */
function rngFrom(str){
  var h = 1779033703 ^ str.length, i;
  for (i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); var a = (h ^ (h >>> 16)) >>> 0;
  return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* Broad questions (>= 500 accepted answers; the index carries the flag) are BROAD_WEIGHT times as likely as narrower ones to be drawn for a slot.
   The slot rules (2/3/2 difficulty mix, distinct categories, fallbacks) are unchanged, and when a slot has no broad candidate the draw is exactly
   the old c[floor(rnd()*n)], so with no broad questions in the pool the daily set is identical to the pre-index game. 1 = no preference. */
var BROAD_WEIGHT = 8, BROAD_MIN = 500;
/* MIN_ANSWERS: the ONE place that sets the smallest question Dark Horse will ask. A question with fewer accepted answers is never drawn, in the daily
   set or in practice. tools/build-dh-shards.js reads this number from this file (so the index leaves those questions out and writes no files for them),
   and the whole-bank fallback below applies it too. Change it here, then run: node tools/build-dh-shards.js */
var MIN_ANSWERS = 100;
function choose(c, rnd){
  var r = rnd(), i, tot = 0, any = false;
  if (BROAD_WEIGHT !== 1) for (i = 0; i < c.length; i++) if (c[i].broad){ any = true; break; }
  if (!any) return c[Math.floor(r * c.length)];
  for (i = 0; i < c.length; i++) tot += c[i].broad ? BROAD_WEIGHT : 1;
  var t = r * tot;
  for (i = 0; i < c.length; i++){ t -= c[i].broad ? BROAD_WEIGHT : 1; if (t < 0) return c[i]; }
  return c[c.length - 1];
}
function pickSet(pool, rnd){
  var usedCat = {}, usedId = {}, out = [];
  var n = Math.min(COUNT, pool.length);
  function free(d, noCat){ return pool.filter(function(x){ return (d === 0 || x.difficulty === d) && !usedId[x.id] && (!noCat || !usedCat[x.category]); }); }
  for (var s = 0; s < n; s++){
    var d = SLOTS[s], c = [], tries = [d, d-1, d+1, d-2, d+2].filter(function(x){ return x >= 1 && x <= 3; });
    for (var t = 0; t < tries.length && !c.length; t++) c = free(tries[t], true);
    if (!c.length) c = free(0, false);
    var pick = choose(c, rnd);
    usedCat[pick.category] = 1; usedId[pick.id] = 1; out.push(pick);
  }
  return out.map(function(x, i){ return [x, i]; }).sort(function(a, b){ return a[0].difficulty - b[0].difficulty || a[1] - b[1]; }).map(function(x){ return x[0]; });
}
/* ---------- the daily set: no repeats within a cycle ----------
   Stateless and the same for everyone: the set for a date is a pure function of (date, pool), so it can be computed for any past or future date.
   * The days are cut into CYCLES of L days. In a cycle every question is used AT MOST ONCE, so a question comes back only after about L days
     (L = floor(pool / 7), reduced when one category is so big that a day could not hold more than one of it: no category may have more than L
     questions in a cycle). Questions that do not fit take their turn in later cycles (each tier rotates through its questions).
   * Tiers: a cycle takes 2L hard, 3L medium and 2L easy questions (so each day is 2/3/2) as far as the pool has them. When a tier is too small the
     shortfall is BORROWED from the other tiers (medium first, then easy, then hard) instead of repeating its questions: with 5 hard questions in the
     pool, the "hard" part of a day is made of medium questions. The question's own difficulty is what the player sees, and a day's questions are shown
     easiest first. With big enough tiers every day is exactly 2/3/2.
   * Broad preference: a question with >= BROAD_MIN answers is always eligible; a narrower one is eligible for a cycle with chance 1/BROAD_WEIGHT
     (decided by a hash of cycle and question, so it is stable), and is used anyway only when the cycle cannot otherwise be filled. 1 = no preference.
   * Days: the cycle's questions are dealt to the L days like cards, category by category, which guarantees no day has two questions of one category;
     then swaps (that keep every day's categories distinct) move each day toward the target tier mix. The day order inside a cycle is a hash shuffle,
     new every cycle.
   * Boundary: the first G days of a cycle (G = L/3) never contain a question from the last G days of the previous cycle (a swap with a day in the
     middle of the cycle), so a question never repeats sooner than about G days across the cycle boundary.
   * Changing the pool (adding or removing questions, MIN_ANSWERS, BROAD_WEIGHT) changes L and the shuffles, so EVERY date's set changes (today's too)
     the next time the pool changes; rebuilding with an unchanged pool changes nothing.
   Practice rounds still draw at random (pickSet). Fewer than 7 questions, or fewer than 7 categories: the old random draw. */
function hashOf(s){ return rngFrom(s)(); }
function byHash(arr, prefix){
  return arr.map(function(x){ return [hashOf(prefix + x.id), x]; }).sort(function(a, b){ return a[0] - b[0] || (a[1].id < b[1].id ? -1 : 1); }).map(function(p){ return p[1]; });
}
function modn(a, n){ return ((a % n) + n) % n; }
function dayIndex(s){ var p = s.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
var DAY_MIX = {1:2, 2:3, 3:2};   /* easy, medium, hard questions per day: the 2/3/2 of SLOTS */
var shapeMemo = null;
function cycleShape(pool){
  if (shapeMemo && shapeMemo.pool === pool && shapeMemo.w === BROAD_WEIGHT && shapeMemo.n === pool.length) return shapeMemo;
  var cnt = {}, tiers = {1:[], 2:[], 3:[]}, ring = byHash(pool, 'ring|');
  ring.forEach(function(x){ cnt[x.category] = (cnt[x.category] || 0) + 1; tiers[x.difficulty].push(x); });
  function total(L){ return Object.keys(cnt).reduce(function(s, k){ return s + Math.min(cnt[k], L); }, 0); }
  var L = Math.max(1, Math.floor(pool.length / COUNT));
  while (L > 1 && Math.floor(total(L) / COUNT) < L) L--;
  var S = L * COUNT, q = {}, D, t;
  for (t = 1; t <= 3; t++) q[t] = Math.min(DAY_MIX[t] * L, tiers[t].length);
  D = S - q[1] - q[2] - q[3];
  [2, 1, 3].forEach(function(t){ var add = Math.min(D, tiers[t].length - q[t]); q[t] += add; D -= add; });   /* borrow: medium, then easy, then hard */
  return shapeMemo = {pool:pool, w:BROAD_WEIGHT, n:pool.length, ring:ring, tiers:tiers, q:q, L:L, S:S, T:total(L), G:Math.floor(L / 3), nog:{}, fin:{}};
}
/* the cycle's S questions. Per tier: walk its ring from a rotating start taking broad questions (and narrow ones that are "in" this cycle) first, then
   the rest. A category over its cap of L is then trimmed (by hash) and each trimmed question is replaced by the next one of the same tier from another
   category, so the tier mix is kept and every question of a crowded category still gets its turn. */
function cycleItems(sh, c){
  var L = sh.L, taken = {}, out = [], catN = {}, short = {1:0, 2:0, 3:0};
  function inCycle(x, pass){ return pass === 1 || x.broad || BROAD_WEIGHT <= 1 || hashOf('in|' + c + '|' + x.id) < 1 / BROAD_WEIGHT; }
  function walk(t, need, start, capped){
    var r = sh.tiers[t], n = r.length, got = 0;
    for (var pass = 0; pass < 2 && got < need; pass++) for (var i = 0; i < n && got < need; i++){
      var x = r[(start + i) % n];
      if (taken[x.id] || !inCycle(x, pass) || (capped && (catN[x.category] || 0) >= L)) continue;
      taken[x.id] = 1; catN[x.category] = (catN[x.category] || 0) + 1; out.push(x); got++;
    }
    return got;
  }
  [3, 2, 1].forEach(function(t){ var n = sh.tiers[t].length; walk(t, sh.q[t], n ? modn(c * sh.q[t], n) : 0, false); });
  var byCat = {};
  out.forEach(function(x){ (byCat[x.category] || (byCat[x.category] = [])).push(x); });
  Object.keys(byCat).forEach(function(k){
    if (byCat[k].length <= L) return;
    byHash(byCat[k], 'cap|' + c + '|').slice(L).forEach(function(x){ delete taken[x.id]; catN[k]--; short[x.difficulty]++; });
  });
  out = out.filter(function(x){ return taken[x.id]; });
  [3, 2, 1].forEach(function(t){ var n = sh.tiers[t].length; if (short[t]) walk(t, short[t], n ? modn(c * sh.q[t], n) : 0, true); });
  for (var i = 0, n = sh.ring.length, start = modn(c * 7, n); i < n && out.length < sh.S; i++){   /* a tier ran out: any question under the caps */
    var x = sh.ring[(start + i) % n];
    if (taken[x.id] || (catN[x.category] || 0) >= L) continue;
    taken[x.id] = 1; catN[x.category] = (catN[x.category] || 0) + 1; out.push(x);
  }
  return out;
}
function dayOk(P, j){ var seen = {}, it = P.days[j]; for (var i = 0; i < it.length; i++){ if (seen[it[i].category]) return false; seen[it[i].category] = 1; } return true; }
function swapItems(P, j, a, j2, b){ var t = P.days[j][a]; P.days[j][a] = P.days[j2][b]; P.days[j2][b] = t; }
/* One cycle's plan: deal the questions to the L days category by category (a category has at most L questions, so no day gets two of one),
   shuffle the day labels, then swap to even out the tier mix. */
function cyclePlain(sh, c){
  if (sh.nog[c]) return sh.nog[c];
  var L = sh.L, byCat = {}, names = [], seq = [], j, days = [];
  byHash(cycleItems(sh, c), 'ord|' + c + '|').forEach(function(x){ if (!byCat[x.category]){ byCat[x.category] = []; names.push(x.category); } byCat[x.category].push(x); });
  names.sort(function(a, b){ return hashOf('cat|' + c + '|' + a) - hashOf('cat|' + c + '|' + b); }).forEach(function(k){ seq = seq.concat(byCat[k]); });
  var label = byHash(seq.slice(0, L).map(function(_, n){ return {id:String(n)}; }), 'day|' + c + '|').map(function(o){ return +o.id; });
  for (j = 0; j < L; j++) days.push([]);
  seq.forEach(function(x, n){ days[label[n % L]].push(x); });
  var P = {days:days, L:L};
  /* tier counts per day; a swap is tried only when the counts say it gets both days closer to the target mix */
  var tg = [0, sh.q[1] / L, sh.q[2] / L, sh.q[3] / L];
  function gain(n, x, y){ return Math.abs(n[x] - tg[x]) + Math.abs(n[y] - tg[y]) - Math.abs(n[x] - 1 - tg[x]) - Math.abs(n[y] + 1 - tg[y]); }   /* cost drop when a day swaps an x-tier question for a y-tier one */
  var cnt = days.map(function(d){ var n = [0, 0, 0, 0]; d.forEach(function(x){ n[x.difficulty]++; }); return n; });
  function pairGood(j, j2){   /* which (tier given up by j, tier taken by j) swaps still improve both days */
    var g = [];
    for (var x = 1; x <= 3; x++) for (var y = 1; y <= 3; y++) if (x !== y && gain(cnt[j], x, y) + gain(cnt[j2], y, x) > 0.001) g[x * 4 + y] = 1;
    return g;
  }
  for (var pass = 0; pass < 4; pass++){
    var moved = false;
    for (j = 0; j < L; j++) for (var t = 1; t < L; t++){
      var j2 = (j + t) % L, good = pairGood(j, j2);
      if (!good.length) continue;
      for (var a = 0; a < days[j].length; a++) for (var b = 0; b < days[j2].length; b++){
        var da = days[j][a].difficulty, db = days[j2][b].difficulty;
        if (da === db || !good[da * 4 + db]) continue;
        swapItems(P, j, a, j2, b);
        if (dayOk(P, j) && dayOk(P, j2)){ cnt[j][da]--; cnt[j][db]++; cnt[j2][db]--; cnt[j2][da]++; moved = true; good = pairGood(j, j2); } else swapItems(P, j, a, j2, b);
      }
    }
    if (!moved) break;
  }
  return sh.nog[c] = P;
}
function cycleFinal(sh, c){
  if (sh.fin[c]) return sh.fin[c];
  var base = cyclePlain(sh, c), L = sh.L, G = sh.G, P = {days:base.days.map(function(d){ return d.slice(); }), L:L};
  if (G >= 1 && L - 2 * G >= 1){
    var prev = cyclePlain(sh, c - 1), F = {}, j, i;
    for (j = L - G; j < L; j++) prev.days[j].forEach(function(x){ F[x.id] = 1; });
    for (j = 0; j < G; j++) for (i = 0; i < P.days[j].length; i++){
      if (!F[P.days[j][i].id]) continue;
      var done = false;
      for (var same = 1; same >= 0 && !done; same--) for (var t = 0; t < L - 2 * G && !done; t++){   /* a partner of the same tier first, then any */
        var j2 = G + modn(j + t, L - 2 * G);
        for (var p = 0; p < P.days[j2].length && !done; p++){
          var y = P.days[j2][p];
          if (F[y.id] || (same && y.difficulty !== P.days[j][i].difficulty)) continue;
          swapItems(P, j, i, j2, p);
          if (dayOk(P, j) && dayOk(P, j2)) done = true; else swapItems(P, j, i, j2, p);
        }
      }
    }
  }
  return sh.fin[c] = P;
}
/* the set for a local date string 'YYYY-MM-DD': 7 pool entries, easiest first */
function dailySet(pool, dateStr){
  if (pool.length < COUNT) return pickSet(pool, rngFrom('politrivia|' + dateStr));
  var sh = cycleShape(pool);
  if (sh.T < COUNT) return pickSet(pool, rngFrom('politrivia|' + dateStr));   /* fewer than 7 categories to deal from: the old random draw (it may repeat a category) */
  var d = dayIndex(dateStr), c = Math.floor(d / sh.L), j = d - c * sh.L;
  return cycleFinal(sh, c).days[j].map(function(x, i){ return [x, i]; }).sort(function(a, b){ return a[0].difficulty - b[0].difficulty || a[1] - b[1]; }).map(function(x){ return x[0]; });
}
function todayStr(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function prettyDate(s){ var p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]).toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'}); }

/* ---------- data loading ---------- */
/* Network access lives ONLY in this block (tools/build-artifact-single.js swaps it for embedded data: the phone artifact has no network). */
/*DH-NET-BEGIN*/
function getJson(url, fresh){
  return fetch(url, fresh ? {cache:'reload'} : undefined).then(function(r){
    if (!r.ok){ var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  });
}
function canLoad(row){ return true; }   /* artifact: only questions whose answers are embedded can be practised */
/*DH-NET-END*/

function validQ(q){
  return q && typeof q.id === 'string' && typeof q.category === 'string' && typeof q.prompt === 'string' &&
    (q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3) && Array.isArray(q.answers) && q.answers.length > 0 &&
    q.answers.every(function(a){ return a && typeof a.name === 'string' && a.name.trim(); });
}
function validRow(r){
  return r && typeof r.id === 'string' && typeof r.c === 'string' && (r.d === 1 || r.d === 2 || r.d === 3) && typeof r.f === 'string' && r.f;
}
/* a pool entry ("row") is all selection needs: id, category, difficulty, broad. The answers arrive later, per question (shard). */
function rowOf(r){ return {id:r.id, category:r.c, difficulty:r.d, prompt:r.p || '', n:r.n || 0, broad:!!r.b, f:r.f}; }
function setPool(rows){
  rows.sort(function(a, b){ return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  pool = rows; rowById = {}; rows.forEach(function(x){ rowById[x.id] = x; });
}
function loadIndexFile(fresh){
  return getJson('data/index.json', fresh).then(function(ix){
    if (!ix || !Array.isArray(ix.q)) throw new Error('bad index');
    var seen = {}, rows = [];
    ix.q.forEach(function(r){ if (validRow(r) && r.n >= MIN_ANSWERS && !seen[r.id]){ seen[r.id] = 1; rows.push(rowOf(r)); } });
    if (!rows.length) throw new Error('empty index');
    setPool(rows);
  });
}
/* the old way: every bank in full (kept as the fallback when data/index.json does not exist) */
function loadBanks(){
  return getJson('data/manifest.json').then(function(m){
    return Promise.all((m.banks || []).map(function(f){
      return getJson('data/' + encodeURIComponent(f)).catch(function(){ return null; });
    }));
  }).then(function(banks){
    var seen = {}, rows = [];
    banks.forEach(function(b){ if (b && Array.isArray(b.questions)) b.questions.forEach(function(x){
      if (validQ(x) && x.answers.length >= MIN_ANSWERS && !seen[x.id]){ seen[x.id] = 1; rows.push({id:x.id, category:x.category, difficulty:x.difficulty, prompt:x.prompt, n:x.answers.length, broad:x.answers.length >= BROAD_MIN, f:''}); byId[x.id] = x; }
    }); });
    setPool(rows);
  });
}
function keep(q){ byId[q.id] = q; matchers[q.id] = buildMatcher(q); }
/* one question's answers; a stale cached index (its shard file renamed by a newer deploy) is refreshed once */
var refreshed = false;
function fetchShard(row){
  return getJson('data/q/' + encodeURIComponent(row.f)).catch(function(e){
    if (!e || e.status !== 404 || refreshed) throw e;
    refreshed = true;
    return loadIndexFile(true).then(function(){
      var nr = rowById[row.id];
      if (!nr || nr.f === row.f) throw e;
      return getJson('data/q/' + encodeURIComponent(nr.f));
    });
  });
}
var inflight = {};
function loadShard(id){
  if (byId[id]) return Promise.resolve(byId[id]);
  if (inflight[id]) return inflight[id];
  var row = rowById[id];
  if (!row) return Promise.reject(new Error('unknown question'));
  var p = fetchShard(row).then(function(q){
    if (!validQ(q) || q.id !== id) throw new Error('bad shard');
    keep(q); delete inflight[id]; return q;
  }, function(e){ delete inflight[id]; throw e; });
  return inflight[id] = p;
}
/* run then() once every question in ids has its answers; a failed fetch (offline, flaky) shows a friendly message with a Retry button */
function needLoad(ids, then){
  var miss = ids.filter(function(id){ return !byId[id]; });
  if (!miss.length) return then();
  $game.setAttribute('aria-busy', 'true');
  $game.innerHTML = '<p class="lede">Loading questions...</p>';
  Promise.all(miss.map(loadShard)).then(function(){ needLoad(ids, then); }, function(){
    $game.setAttribute('aria-busy', 'false');
    $game.innerHTML = '<div class="empty">The questions could not be loaded. Check your connection and try again.</div><div class="row"><button class="btn red" id="tg-retry" type="button">Try again</button><button class="btn ghost" id="tg-back" type="button">Back</button></div>';
    document.getElementById('tg-retry').addEventListener('click', function(){ needLoad(ids, then); });
    document.getElementById('tg-back').addEventListener('click', function(){ S = null; persist = true; renderIntro(); });
    document.getElementById('tg-retry').focus({preventScroll:true});
  });
}

/* ---------- game ---------- */
var TIER_PTS = [0, 5, 20, 45, 70, 100];
var TIER_NAME = ['No points', 'Household', 'Familiar', 'Insider', 'Scholar', 'Long Shot'];
var TIER_SQ = ['⬜', '🟦', '🟩', '🟨', '🟧', '🟥'];   // none, then cooler to hotter as the answer gets rarer
var JACKPOT_PTS = 300, JACKPOT_SQ = '🐴';   // Dark Horse bonus answer: three times the top tier
var TOP_RANK = 'Kingmaker';
var RANKS = [[0.9, 'Chief of Staff'], [0.7, 'Strategist'], [0.5, 'Pundit'], [0.3, 'Staffer'], [0.12, 'Intern'], [0, 'Tourist']];
var pool = [], rowById = {}, byId = {}, matchers = {};
var S = null, persist = true, timer = null, endAt = 0, lastShown = -1, fbTimer = null;

function matcherFor(qq){ return matchers[qq.id] || (matchers[qq.id] = buildMatcher(qq)); }
function Q(i){ return byId[S.ids[i]]; }
function tierOf(a){ var w = Math.round(a.weight || 1); return Math.min(5, Math.max(1, w)); }
/* given[i] is null (unanswered) or {t: typed text, x: matched answer index or -1} */
function tierAt(i){ var g = S.given[i]; return g && g.x >= 0 ? tierOf(Q(i).answers[g.x]) : 0; }
function jackAt(i){ var g = S.given[i]; return !!(g && g.x >= 0 && Q(i).answers[g.x].jackpot === true); }
function anyJack(){ for (var i = 0; i < S.ids.length; i++) if (jackAt(i)) return true; return false; }
function qScore(i){ return jackAt(i) ? JACKPOT_PTS : TIER_PTS[tierAt(i)]; }
function sqAt(i){ return jackAt(i) ? JACKPOT_SQ : TIER_SQ[tierAt(i)]; }
function jackAnswer(i){ var a = Q(i).answers.filter(function(x){ return x.jackpot === true; }); return a[0] || null; }
function total(){ var t = 0; for (var i = 0; i < S.ids.length; i++) t += qScore(i); return t; }
function maxScore(){ return S.ids.length * 100; }
function commit(){ if (persist) save(S); }
function say(el, msg){ el.textContent = ''; setTimeout(function(){ el.textContent = msg; }, 30); }

/* the admin's pick for this date (data/schedule.json via assets/schedule.js): exactly COUNT different known question ids, easiest first.
   Anything else (no entry, an unknown id, a repeat) falls back to the automatic daily set. */
function scheduledSet(date){
  try {
    var e = window.SIN_SCHEDULE ? SIN_SCHEDULE.get('darkhorse', date) : null, seen = {};
    if (!Array.isArray(e) || e.length !== COUNT) return null;
    var rows = e.map(function(id){ id = String(id); if (seen[id] || !rowById || !rowById[id]) return null; seen[id] = 1; return rowById[id]; });
    if (rows.some(function(x){ return !x; })) return null;
    return rows.map(function(x, i){ return [x, i]; }).sort(function(a, b){ return a[0].difficulty - b[0].difficulty || a[1] - b[1]; }).map(function(x){ return x[0]; });
  } catch(err){ return null; }
}
function newGame(mode){
  var date = todayStr();
  /* the daily set is drawn from the whole index; a practice round only from questions that can be loaded here (always all, except in the phone artifact) */
  var set = mode === 'daily' ? (scheduledSet(date) || dailySet(pool, date)) : pickSet(pool.filter(canLoad), Math.random);
  var ids = set.map(function(x){ return x.id; });
  needLoad(ids, function(){
    S = {v:2, mode:mode, date:date, ids:ids, qi:0, phase:'q', timeLeft:SECONDS, tries:0, given:set.map(function(){ return null; })};
    persist = mode === 'daily';
    commit();
    startQuestion(true);
  });
}
function stopTimer(){ if (timer){ clearInterval(timer); timer = null; } }

function startQuestion(fresh){
  S.phase = 'q'; if (fresh) S.timeLeft = SECONDS;
  renderQuestion();
  endAt = Date.now() + S.timeLeft * 1000; lastShown = -1;
  stopTimer(); timer = setInterval(tick, 250); tick();
  say($lt, 'Question ' + (S.qi + 1) + ' of ' + S.ids.length + '. ' + Q(S.qi).prompt + '. ' + Math.ceil(S.timeLeft) + ' seconds.');
}
function tick(){
  var left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  S.timeLeft = Math.max(0, (endAt - Date.now()) / 1000);
  if (left === lastShown) return;
  lastShown = left;
  var t = document.getElementById('tg-time'), b = document.getElementById('tg-bar');
  if (t){ t.textContent = left; t.classList.toggle('low', left <= 10); }
  if (b){ b.classList.toggle('low', left <= 10); b.firstElementChild.style.transform = 'scaleX(' + (left / SECONDS) + ')'; }
  if (left === 10 || left === 5) say($lt, left + ' seconds left');
  if (left <= 5 && left > 0 && t) fxc('pulse', t, null, {beatScale: 1.16});
  if (left === 0) return lockIn(true);
  commit();
}
/* An accepted answer locks in at once. At 0 seconds the typed text is accepted only if it matches. */
function lockIn(timedOut, x){
  var inp = document.getElementById('tg-in'), val = inp ? inp.value.trim() : '';
  if (x === undefined){ var r = val ? matcherFor(Q(S.qi))(val) : {none:true}; x = r.idx !== undefined ? r.idx : -1; }
  stopTimer();
  S.given[S.qi] = {t: x >= 0 ? val : '', x: x, up: x < 0};
  S.phase = 'review'; S.timeLeft = 0; commit();
  if (timedOut) say($lt, "Time's up.");
  renderReview();
}
var dym = null;   /* the open "Did you mean?" offer: {k: the typed text it was made for, xs: answer indexes} */
function submit(){
  var inp = document.getElementById('tg-in'), val = inp.value.trim();
  if (!val) return;
  var m = matcherFor(Q(S.qi)), r = m(val), f = document.getElementById('tg-fb'), msg;
  if (r.idx !== undefined && !r.fuzzy) return lockIn(false, r.idx);
  if (dym && dym.k === norm(val) && dym.xs.length === 1) return lockIn(false, dym.xs[0]);   /* Enter again = yes */
  var xs = m.suggest(val);
  if (r.fuzzy && xs.indexOf(r.idx) < 0) xs.unshift(r.idx);
  if (xs.length) return offer(val, xs.slice(0, 4));
  if (r.ambiguous) msg = 'Be more specific: that could mean more than one answer.';
  else { S.tries++; commit(); msg = 'Not an accepted answer, keep trying.'; showTries(); }
  f.className = 'tg-fb no'; f.textContent = msg;
  fx(r.ambiguous ? 'near' : 'wrong', {el: inp, msgEl: f});
  say($ls, msg);
  inp.focus(); inp.select();
}
function offer(val, xs){
  var qq = Q(S.qi), f = document.getElementById('tg-fb'), inp = document.getElementById('tg-in'), one = xs.length === 1;
  dym = {k: norm(val), xs: xs};
  f.className = 'tg-fb dym';
  f.innerHTML = '<span class="dym-q">Did you mean ' + (one ? '<b>' + esc(qq.answers[xs[0]].name) + '</b>?' : 'one of these?') + '</span>' +
    '<span class="dym-row">' + (one ? '<button type="button" class="btn red dym-yes" data-x="' + xs[0] + '">Yes, lock it in</button>'
      : xs.map(function(x){ return '<button type="button" class="btn dym-pick" data-x="' + x + '">' + esc(qq.answers[x].name) + '</button>'; }).join('')) +
    '<button type="button" class="btn ghost dym-no">' + (one ? 'No' : 'None of these') + '</button></span>' +
    (one ? '<span class="dym-hint">Press Enter again to accept.</span>' : '');
  fx('near', {el: inp, msgEl: f, shake: false});
  say($ls, one ? 'Did you mean ' + qq.answers[xs[0]].name + '? Press Enter again or choose Yes.' : 'Did you mean one of these: ' + xs.map(function(x){ return qq.answers[x].name; }).join(', ') + '?');
  inp.focus({preventScroll:true});
}
function closeOffer(msg){
  dym = null;
  var f = document.getElementById('tg-fb'); if (!f) return;
  f.className = 'tg-fb'; f.textContent = msg || '';
}
function showTries(){ var t = document.getElementById('tg-tries'); if (t) t.textContent = S.tries ? S.tries + (S.tries === 1 ? ' try' : ' tries') : ''; }
function nextQuestion(){
  if (S.qi + 1 >= S.ids.length){ S.phase = 'done'; commit(); return renderResults(true); }
  S.qi++; S.timeLeft = SECONDS; S.tries = 0; S.phase = 'q'; commit(); startQuestion(true);
}

function head(){
  var dots = S.ids.map(function(_, i){ return '<i class="' + (i < S.qi || (i === S.qi && S.phase === 'review') ? 'done' : i === S.qi ? 'cur' : '') + '"></i>'; }).join('');
  return '<div class="tg-top"><span>Question ' + (S.qi + 1) + ' of ' + S.ids.length + (S.mode === 'practice' ? '<span class="tg-mode">Practice</span>' : '') + '</span><span class="meta">Total <b class="num" id="tg-ts">' + total() + '</b></span></div><div class="tg-dots" aria-hidden="true">' + dots + '</div>';
}

/* the racecourse behind the page lives in scene.js (window.DHScene); these keep the game working without it */
function scene(){ return window.DHScene || null; }
var DIFF = ['', 'Easy', 'Medium', 'Hard'];
function tierChip(a, cls){ var t = tierOf(a); if (a.jackpot === true) return '<li class="' + (cls || '') + ' rare">' + esc(a.name) + '<em>' + JACKPOT_SQ + ' Dark Horse &middot; ' + JACKPOT_PTS + '</em></li>'; return '<li class="' + (cls || '') + (t >= 4 ? ' rare' : '') + '">' + esc(a.name) + '<em>' + TIER_SQ[t] + ' ' + TIER_NAME[t] + ' &middot; ' + TIER_PTS[t] + '</em></li>'; }

function renderQuestion(){
  if (scene()) scene().set(total(), maxScore());
  var qq = Q(S.qi);
  $game.setAttribute('aria-busy', 'false');
  $game.innerHTML = head() +
    '<h2 class="tg-prompt" id="tg-prompt">' + esc(qq.prompt) + '</h2>' +
    '<div class="tg-tags"><span>' + DIFF[qq.difficulty] + '</span><span>Rarer answers score more.</span></div>' +
    '<div class="tg-clock"><div class="tg-time" id="tg-time" aria-hidden="true">' + Math.ceil(S.timeLeft) + '</div><div class="tg-bar" id="tg-bar" aria-hidden="true"><b></b></div><div class="tg-tries" id="tg-tries"></div></div>' +
    '<form class="tg-form" id="tg-form" autocomplete="off"><label for="tg-in" class="sr-only">Your answer</label>' +
    '<input type="text" id="tg-in" name="answer" inputmode="text" enterkeyhint="send" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type your answer" aria-describedby="tg-fb">' +
    '<button class="btn red" type="submit">Enter</button></form>' +
    '<p class="tg-fb" id="tg-fb">Press Enter to try an answer. Wrong answers are not locked in, so keep trying until time runs out.</p>';
  try { window.scrollTo(0, 0); } catch(e){}   /* a new question starts at the top: after a long review the page used to keep its scroll offset and the prompt and answer box sat above the screen */
  var inp = document.getElementById('tg-in');
  document.getElementById('tg-form').addEventListener('submit', function(e){ e.preventDefault(); submit(); });
  dym = null;
  inp.addEventListener('input', function(){ if (dym && norm(inp.value) !== dym.k) closeOffer(''); });
  document.getElementById('tg-fb').addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('button') : null; if (!b || !dym) return;
    if (b.classList.contains('dym-no')){ closeOffer('OK, keep typing.'); inp.focus(); inp.select(); return; }
    var x = +b.getAttribute('data-x'); if (dym.xs.indexOf(x) >= 0) lockIn(false, x);
  });
  showTries();
  inp.focus({preventScroll:true});
  document.getElementById('tg-bar').firstElementChild.style.transform = 'scaleX(' + (S.timeLeft / SECONDS) + ')';
}
/* a handful of other accepted answers: the rarest three, then a few more */
function otherAnswers(i){
  var qq = Q(i), g = S.given[i], list = qq.answers.map(function(a, x){ return {a:a, x:x}; }).filter(function(p){ return (!g || p.x !== g.x) && p.a.jackpot !== true; });
  list.sort(function(p, q2){ return tierOf(q2.a) - tierOf(p.a) || p.x - q2.x; });
  var out = list.slice(0, 3), rest = list.slice(3);
  return out.concat(rest.slice(0, 5)).map(function(p){ return p.a; });
}
/* tier colours and sizes: tier 1-3 a ring and a pop, tier 4-5 a spark burst, the Dark Horse a full-screen moment (about 1.2 s) */
function reviewFx(qq, g, t, hit){
  var verdict = document.getElementById('tg-verdict'), ts = document.getElementById('tg-ts');
  if (ts && t) fxc('countUp', ts, total(), 650, total() - qScore(S.qi));
  if (scene()) scene().run(total() - qScore(S.qi), total(), {lap: maxScore(), delay: 150, big: hit, label: hit ? '+' + JACKPOT_PTS + ' Dark Horse!' : t ? '+' + TIER_PTS[t] + ' ' + TIER_NAME[t] : ''});
  fxc('slideIn', verdict, {dy: 8});
  if (hit) fx('jackpot', {el: document.querySelector('.tg-jackpot') || verdict, tier: 5});
  else if (t >= 4) fx('rare', {el: verdict, tier: t, color: ['', '', '', '', '#f08a14', '#d92b2b'][t], intensity: t === 5 ? 1 : 0.75});
  else if (t) fx('correct', {el: verdict, tier: t, intensity: t / 6});
  else fx('lose', {el: verdict});
}
function renderReview(){
  var qq = Q(S.qi), g = S.given[S.qi], t = tierAt(S.qi), hit = jackAt(S.qi), last = S.qi + 1 >= S.ids.length;
  var verdict = t ? 'Accepted: ' + esc(qq.answers[g.x].name) : 'Time up';
  var line = hit ? 'Dark Horse &middot; +' + JACKPOT_PTS + ' points' : t ? TIER_NAME[t] + ' answer &middot; +' + TIER_PTS[t] + ' points' : '0 points' + (S.tries ? ' &middot; ' + S.tries + (S.tries === 1 ? ' try' : ' tries') : '');
  var others = otherAnswers(S.qi), jp = jackAnswer(S.qi);
  $game.innerHTML = head() +
    '<h2 class="tg-prompt">' + esc(qq.prompt) + '</h2>' +
    (hit ? '<p class="tg-jackpot"><span aria-hidden="true">★</span> You found the Dark Horse!</p>' : '') +
    '<p class="tg-verdict ' + (t ? 'ok' : 'no') + '" id="tg-verdict" tabindex="-1">' + verdict + '</p>' +
    '<p class="tg-sub" style="margin-top:var(--s2)">' + line + '</p>' +
    (qq.note ? '<p class="tg-note">' + esc(qq.note) + '</p>' : '') +
    (jp ? '<p class="tg-jpline"><b>The Dark Horse:</b> ' + esc(jp.name) + (jp.note ? '. ' + esc(jp.note) : '') + '</p>' : '') +
    (others.length ? '<p class="tg-sub">Other accepted answers</p><ul class="tg-chips">' + others.map(function(a){ return tierChip(a, 'miss'); }).join('') + '</ul>' : '') +
    '<div class="row"><button class="btn red" type="button" id="tg-next">' + (last ? 'See results' : 'Next question') + '</button></div>';
  var b = document.getElementById('tg-next'); b.addEventListener('click', nextQuestion); b.focus({preventScroll:true});   /* keep the verdict and the tier badge on screen (focus used to scroll the page down to the button) */
  reviewFx(qq, g, t, hit);
  say($ls, (hit ? 'You found the Dark Horse! ' : '') + verdict.replace(/&[a-z]+;/g, '"').replace(/<[^>]+>/g, '') + '. ' + line.replace(/&middot;/g, ','));
}
/* ---------- results screen: "Check an answer" look-up + browsable answer list ----------
   Read-only: it uses the same matcher the game scored with (so "accepted" / "close" mean exactly what would have scored) and never touches S or the saved
   result. Everything runs on the answers already loaded (no network). The list is paged (LK_CHUNK at a time), searchable and sortable, so a question with
   5,000 answers never puts 5,000 rows on a phone. Built when a question's row is first opened. */
var LK_CHUNK = 100, lkData = {};
function lkIndex(qq){
  if (lkData[qq.id]) return lkData[qq.id];
  var rows = qq.answers.map(function(a, i){ return {i:i, a:a, keys:[norm(a.name)].concat((a.aliases || []).map(norm)), tier:tierOf(a)}; });
  /* "Rarest first": the Dark Horse always leads, then tiers from Long Shot down */
  var rare = rows.slice().sort(function(x, y){ return (y.a.jackpot === true) - (x.a.jackpot === true) || y.tier - x.tier || x.i - y.i; });
  var az = rows.slice().sort(function(x, y){ return x.keys[0] < y.keys[0] ? -1 : x.keys[0] > y.keys[0] ? 1 : x.i - y.i; });
  return lkData[qq.id] = {rows:rows, rare:rare, az:az};
}
function lkHas(row, q, startsOnly){
  for (var k = 0; k < row.keys.length; k++){ var p = row.keys[k].indexOf(q); if (startsOnly ? p === 0 : p >= 0) return true; }
  return false;
}
function lkScore(a){ return a.jackpot === true ? JACKPOT_SQ + ' Dark Horse &middot; ' + JACKPOT_PTS : TIER_NAME[tierOf(a)] + ' &middot; ' + TIER_PTS[tierOf(a)]; }
/* what the game would have done with this text: {cls, html} */
function lkVerdict(qq, text){
  var val = String(text).trim();
  if (!val) return {cls:'', html:'Type an answer, then press Check, to see whether it would have scored.'};
  var r = matcherFor(qq)(val);
  if (r.idx !== undefined){
    var a = qq.answers[r.idx], same = norm(val) === norm(a.name);
    if (r.fuzzy) return {cls:'ok', html:'Close: did you mean <b>' + esc(a.name) + '</b>? The game would ask you to confirm, then score it: ' + lkScore(a) + ' points.'};
    return {cls:'ok', html:'Accepted' + (same ? '' : ' as <b>' + esc(a.name) + '</b>') + (same ? ': <b>' + esc(a.name) + '</b>' : '') + '. ' + lkScore(a) + ' points.'};
  }
  var xs = matcherFor(qq).suggest(val);
  if (xs.length) return {cls:'no', html:'Not accepted as typed. Did you mean ' + xs.map(function(x){ return '<b>' + esc(qq.answers[x].name) + '</b> (' + lkScore(qq.answers[x]) + ')'; }).join(' or ') + '? In the game you would be asked to confirm.'};
  if (r.ambiguous) return {cls:'no', html:'Be more specific: that could mean more than one answer.'};
  return {cls:'no', html:'Not an accepted answer.'};
}
function buildLookup(body, i){
  var qq = Q(i), ix = lkIndex(qq), n = qq.answers.length, st = {sort:'rare', q:'', shown:LK_CHUNK, list:ix.rare};
  var id = 'lk' + i, open = n <= LK_CHUNK, jp = jackAnswer(i);
  body.innerHTML = (qq.note ? '<p class="tg-note">' + esc(qq.note) + '</p>' : '') +
    /* the rarest answer of the question, always shown first after the game */
    (jp ? '<p class="tg-jpline"><b>' + JACKPOT_SQ + ' The Dark Horse:</b> ' + esc(jp.name) + (jp.note ? '. ' + esc(jp.note) : '') + ' <span class="tg-jppts">+' + JACKPOT_PTS + ' points</span></p>' : '') +
    '<div class="lk"><label class="tg-sub lk-label" for="' + id + '-in">Check an answer</label>' +
    '<div class="lk-row"><input type="text" id="' + id + '-in" class="lk-in" inputmode="text" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type any answer" aria-describedby="' + id + '-res">' +
    '<button class="btn red lk-go" type="button">Check</button></div>' +
    '<div class="lk-sugs" role="group" aria-label="Suggestions" hidden></div>' +
    '<p class="lk-res" id="' + id + '-res" role="status" aria-live="polite"></p>' +
    '<p class="lk-hint fine">Checks use the same rules as the game, including the “Did you mean?” suggestions. Your score does not change.</p>' +
    '<button class="btn ghost lk-bt" type="button" aria-expanded="' + open + '" aria-controls="' + id + '-panel">' + (open ? 'Hide' : 'Browse') + ' all ' + n + ' accepted answers</button>' +
    '<div class="lk-panel" id="' + id + '-panel"' + (open ? '' : ' hidden') + '>' +
      '<div class="lk-tools"><label class="sr-only" for="' + id + '-f">Search this list</label><input type="search" id="' + id + '-f" class="lk-in lk-f" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="Search this list">' +
      '<div class="lk-sort" role="group" aria-label="Sort order"><button type="button" class="btn ghost" data-s="rare" aria-pressed="true">Rarest first</button><button type="button" class="btn ghost" data-s="az" aria-pressed="false">A to Z</button></div></div>' +
      '<p class="lk-count" role="status" aria-live="polite"></p><ul class="tg-chips chips lk-list"></ul>' +
      '<button class="btn ghost lk-more" type="button" hidden></button></div></div>';
  var $ = function(s){ return body.querySelector(s); };
  var inp = $('.lk-in'), res = $('.lk-res'), sugs = $('.lk-sugs'), go = $('.lk-go'), bt = $('.lk-bt'), panel = $('.lk-panel');
  var f = $('.lk-f'), list = $('.lk-list'), count = $('.lk-count'), more = $('.lk-more');
  function setRes(v){ if (res.getAttribute('data-k') === v.html) return; res.setAttribute('data-k', v.html); res.className = 'lk-res ' + v.cls; res.innerHTML = v.html; }
  function suggest(){
    var q = norm(inp.value), out = [], r, j, seen = {};
    if (q){
      for (j = 0; j < ix.rare.length && out.length < 8; j++){ r = ix.rare[j]; if (lkHas(r, q, true)){ out.push(r); seen[r.i] = 1; } }
      for (j = 0; j < ix.rare.length && out.length < 8; j++){ r = ix.rare[j]; if (!seen[r.i] && lkHas(r, q, false)) out.push(r); }
    }
    sugs.hidden = !out.length;
    sugs.innerHTML = out.map(function(r){ return '<button type="button" class="lk-sug" data-i="' + r.i + '">' + esc(r.a.name) + '<em>' + (r.a.jackpot === true ? JACKPOT_SQ : TIER_NAME[r.tier]) + '</em></button>'; }).join('');
  }
  function check(){ setRes(lkVerdict(qq, inp.value)); }
  inp.addEventListener('input', function(){
    suggest();
    var t = inp.value.trim(), r = t ? matcherFor(qq)(t) : null;
    if (!t) setRes(lkVerdict(qq, ''));
    else if (r.idx !== undefined && !r.fuzzy) setRes(lkVerdict(qq, t));   /* an exact answer is confirmed as you type; typo judgements wait for Check */
    else setRes({cls:'', html:'Press Check to see whether it would have scored.'});
  });
  inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); check(); } });
  go.addEventListener('click', function(){ check(); inp.focus({preventScroll:true}); });
  sugs.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('.lk-sug') : null; if (!b) return;
    inp.value = qq.answers[+b.getAttribute('data-i')].name; sugs.hidden = true; check(); inp.focus({preventScroll:true});
  });
  /* browse */
  function paint(append){
    var arr = st.list, from = append ? list.children.length : 0, to = Math.min(arr.length, st.shown);
    var html = ''; for (var j = from; j < to; j++) html += tierChip(arr[j].a, 'miss');
    if (append) list.insertAdjacentHTML('beforeend', html); else list.innerHTML = html;
    count.textContent = arr.length ? 'Showing ' + to + ' of ' + arr.length + (st.q ? ' matching' : ' accepted answers') : 'No accepted answer matches that search.';
    var left = arr.length - to; more.hidden = left <= 0; more.textContent = 'Show ' + Math.min(LK_CHUNK, left) + ' more';
  }
  function refilter(){
    var base = st.sort === 'az' ? ix.az : ix.rare, q = norm(f.value);
    st.q = q; st.shown = LK_CHUNK; st.list = q ? base.filter(function(r){ return lkHas(r, q, false); }) : base; paint(false);
  }
  bt.addEventListener('click', function(){
    var show = panel.hidden; panel.hidden = !show; bt.setAttribute('aria-expanded', show ? 'true' : 'false'); bt.textContent = (show ? 'Hide' : 'Browse') + ' all ' + n + ' accepted answers';
    if (show && !list.children.length) paint(false);
  });
  f.addEventListener('input', refilter);
  more.addEventListener('click', function(){ st.shown += LK_CHUNK; paint(true); });
  Array.prototype.forEach.call(body.querySelectorAll('.lk-sort button'), function(b){
    b.addEventListener('click', function(){
      st.sort = b.getAttribute('data-s');
      Array.prototype.forEach.call(body.querySelectorAll('.lk-sort button'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      refilter();
    });
  });
  if (open) paint(false);
}
function rankFor(){ if (total() > maxScore()) return TOP_RANK; var f = total() / maxScore(); for (var i = 0; i < RANKS.length; i++) if (f >= RANKS[i][0]) return RANKS[i][1]; return RANKS[RANKS.length - 1][1]; }
function shareText(){
  var sq = S.ids.map(function(_, i){ return sqAt(i); }).join('');
  return ['🐴 Dark Horse · Daily Political Trivia · ' + prettyDate(S.date) + (S.mode === 'practice' ? ' (practice)' : ''), sq, total() + '/' + maxScore() + (anyJack() ? ' + Dark Horse bonus' : '') + ' · ' + rankFor(), location.origin + location.pathname].join('\n');
}
function renderResults(justFinished){
  if (scene()) scene().set(total(), maxScore());
  stopTimer();
  var daily = S.mode === 'daily', txt = shareText();
  gameplay(false);
  if (justFinished && daily) adBreak('showPostroll');          // not awaited: shown after the player has seen the score
  var rows = S.ids.map(function(_, i){
    var qq = Q(i), g = S.given[i], t = tierAt(i);
    var mine = t ? qq.answers[g.x].name : 'No accepted answer';
    return '<li><details><summary><span class="p">' + esc(qq.prompt) + '<small>' + sqAt(i) + ' ' + esc(mine) + ' &middot; ' + (jackAt(i) ? 'Dark Horse' : TIER_NAME[t]) + '</small></span><span class="s num">' + qScore(i) + '</span></summary><div class="body" data-i="' + i + '"></div></details></li>';
  }).join('');
  $game.setAttribute('aria-busy', 'false');
  $game.innerHTML = '<div class="tg-top"><span>' + (daily ? prettyDate(S.date) : 'Practice round<span class="tg-mode">Not saved</span>') + '</span></div>' +
    '<h2 class="tg-sub" style="margin-top:var(--s5)">Your score</h2><p class="tg-total num" id="tg-final" tabindex="-1">' + total() + '<small> / ' + maxScore() + (anyJack() ? ' + Dark Horse bonus' : '') + '</small></p>' +
    '<p class="tg-rank">' + rankFor() + '</p>' +
    '<ul class="tg-qlist">' + rows + '</ul>' +
    '<h2 class="tg-sub" style="margin-top:var(--s6)">Share your result (no spoilers)</h2>' +
    '<textarea class="tg-share" id="tg-share" readonly aria-label="Share text">' + esc(txt) + '</textarea>' +
    '<div class="row"><button class="btn red" type="button" id="tg-copy">Share result</button><button class="btn ghost" type="button" id="tg-copy2">Copy result</button><button class="btn ghost" type="button" id="tg-prac">Play a practice round</button></div>' +
    '<p class="studyline"><a class="studylink" href="../../map/">Study up for tomorrow: look up members, senators and governors on the Congress Map</a></p>' +
    '<p class="fine">Colour key: ' + [1,2,3,4,5].map(function(t){ return TIER_SQ[t] + ' ' + TIER_NAME[t]; }).join(', ') + ', ' + TIER_SQ[0] + ' no points. A ' + JACKPOT_SQ + ' means you found the Dark Horse.</p>' +
    (daily ? '<p class="fine">You have played today\'s game. A new one arrives at midnight, your local time.</p>'
           : '<p class="fine">Practice rounds are not saved and do not change your daily result.</p><div class="row"><button class="btn ghost" type="button" id="tg-home">Back to start</button></div>');
  /* the look-up and answer list of a question are built when its row is first opened (a broad question can have thousands of answers) */
  document.querySelector('.tg-qlist').addEventListener('toggle', function(e){
    var d = e.target, body = d && d.querySelector && d.querySelector('.body');
    if (!body || !d.open || body.getAttribute('data-done')) return;
    body.setAttribute('data-done', '1');
    buildLookup(body, +body.getAttribute('data-i'));
  }, true);
  function doShareClick(ev){
    var ta = document.getElementById('tg-share'), t = ta.value;
    function shareOut(t, el, useShare, done) {
      /* Share sheet first (if asked), then clipboard, then the old copy command; if all are blocked (a sandboxed preview, an old browser) the text is left selected so it can be copied by hand. */
      function pick() { try { if (el.select) { el.focus(); el.select(); el.setSelectionRange(0, t.length); } else { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } } catch (e) {} }
      function manual() { pick(); done('manual'); }
      function viaExec() { pick(); try { if (document.execCommand('copy')) { done('copied'); return; } } catch (e) {} manual(); }
      function viaClip() { if (navigator.clipboard && navigator.clipboard.writeText) { try { navigator.clipboard.writeText(t).then(function () { done('copied'); }, viaExec); } catch (e) { viaExec(); } } else viaExec(); }
      if (useShare && navigator.share) { var u = /^https?:$/.test(location.protocol) && !/claude|localhost|127.0|192.168|^10./.test(location.hostname) ? location.origin + location.pathname : ''; try { navigator.share(u ? { text: t, url: u } : { text: t }).then(function () { done('shared'); }, function (e) { if (e && e.name === 'AbortError') return; viaClip(); }); } catch (e) { viaClip(); } } else viaClip();
    }
    shareOut(t, ta, !(ev && ev.currentTarget && ev.currentTarget.id === 'tg-copy2'), function(k){ if (window.SIN && SIN.toast) SIN.toast(k === 'manual' ? 'Text selected. Press and hold it, then tap Copy.' : k === 'shared' ? 'Result shared' : 'Result copied'); });
  }
  document.getElementById('tg-copy').addEventListener('click', doShareClick);
  document.getElementById('tg-copy2').addEventListener('click', doShareClick);
  document.getElementById('tg-prac').addEventListener('click', function(){ newGame('practice'); });
  var h = document.getElementById('tg-home'); if (h) h.addEventListener('click', function(){ S = null; persist = true; renderIntro(); });
  document.getElementById('tg-final').focus({preventScroll:true});
  if (justFinished) resultsFx();
}
function resultsFx(){
  var f = total() / maxScore(), top = total() > maxScore() || f >= 0.7;
  fxc('countUp', document.getElementById('tg-final'), total(), 1000, 0);
  if (scene()) scene().run(0, total(), {lap: maxScore(), delay: 300, ms: Math.round(2200 + 2600 * Math.min(1, total() / (2 * maxScore())))});
  fxc('staggerIn', document.querySelectorAll('.tg-qlist>li'), 90);   // the seven answers land one after another under the score
  fxc('slideIn', document.querySelector('.tg-rank'), {delay: 700, dy: 10});
  if (top) setTimeout(function(){ fx('win', {el: document.querySelector('.tg-rank'), intensity: total() > maxScore() ? 1 : 0.8}); }, 900);
  else if (f >= 0.3) setTimeout(function(){ fx('levelUp', {el: document.querySelector('.tg-rank')}); }, 900);
}

function renderIntro(){
  if (scene()) scene().set(0);
  var saved = load(), date = todayStr(), state = 'new';
  if (saved && saved.v === 2 && saved.date === date && saved.mode === 'daily' && Array.isArray(saved.ids) && saved.ids.every(function(id){ return rowById[id]; })){
    state = saved.phase === 'done' ? 'done' : 'resume';
  } else saved = null;
  $game.setAttribute('aria-busy', 'false');
  if (pool.length < 1){
    $game.innerHTML = '<div class="empty">Today\'s questions could not be loaded. Check your connection and try again.</div><div class="row"><button class="btn red" id="tg-reload" type="button">Try again</button></div>';
    document.getElementById('tg-reload').addEventListener('click', boot); return;
  }
  var n = Math.min(COUNT, pool.length);
  var primary = state === 'resume' ? 'Continue today\'s game (question ' + (saved.qi + 1) + ')' : state === 'done' ? 'See today\'s results' : 'Play today\'s game';
  $game.innerHTML = '<p class="lede">' + prettyDate(date) + '. Dark Horse, the daily rarity quiz: ' + n + ' questions, 30 seconds each, one accepted answer per question.</p>' +
    '<ul class="rules"><li>Type an answer and press Enter. If it is accepted it locks in and scores. If not, nothing is lost: keep trying until the 30 seconds run out. Last names are fine. Misspelled it, or used a nickname or initials (like AOC)? The game asks “Did you mean…?” and you confirm.</li><li>The rarer your correct answer, the more it scores: 5, 20, 45, 70 or 100 points. No accepted answer by time-up scores 0. Maximum ' + n * 100 + ' per day, unless you find the Dark Horse: a hidden, very rare answer worth a 300-point bonus.</li><li>One daily game per day. Practice rounds are unlimited and not saved.</li></ul>' +
    '<div class="tg-scale" aria-label="Points by rarity">' + [1,2,3,4,5].map(function(t){ return '<span class="tg-sc t' + t + '"><b>' + TIER_PTS[t] + '</b>' + TIER_NAME[t] + '</span>'; }).join('') + '<span class="tg-sc tj"><b>+' + JACKPOT_PTS + '</b>Dark Horse</span></div>' +
    '<div class="row"><button class="btn red" id="tg-go" type="button">' + primary + '</button><button class="btn ghost" id="tg-pr" type="button">Practice round</button></div>';
  document.getElementById('tg-go').addEventListener('click', function(){
    if (state === 'done') return needLoad(saved.ids, function(){ S = saved; persist = true; renderResults(); });
    var btn = this;
    function go(){
      gameplay(true);
      if (state === 'new') return newGame('daily');
      needLoad(saved.ids, function(){
        S = saved; persist = true;
        if (S.phase === 'review') return renderReview();
        startQuestion(false);
      });
    }
    // A pre-roll (video ad) needs this click. With ads off, SIN_ADS is absent and go() runs at once, synchronously.
    if (window.SIN_ADS && SIN_ADS.ready){ btn.disabled = true; adBreak('showPreroll').then(go, go); }
    else go();
  });
  document.getElementById('tg-pr').addEventListener('click', function(){ newGame('practice'); });
  document.getElementById('tg-go').focus({preventScroll:true});
}

window.addEventListener('pagehide', function(){ if (S && persist && S.phase === 'q'){ S.timeLeft = Math.max(0, (endAt - Date.now()) / 1000); save(S); } });

/* ---------- boot ---------- */
if (/[?&]reset(=|&|$)/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)){   /* developer helper: only on this PC, never on the public site */
  clearSaved();
  try { history.replaceState(null, '', location.pathname); } catch(e){}
}
function boot(){
  $game.setAttribute('aria-busy', 'true');
  $game.innerHTML = '<p class="lede">Loading today\'s questions...</p>';
  loadIndexFile().catch(function(e){
    /* no index.json deployed (404) or an unusable one: the old whole-bank path. Offline or a server error: friendly error + Retry. */
    if (e && (e.status === 404 || (!e.status && /^(bad|empty) index/.test(e.message)))) return loadBanks();
    throw e;
  }).then(function(){ return new Promise(function(res){ if (window.SIN_SCHEDULE) SIN_SCHEDULE.ready(res); else res(); }); })   /* the admin's schedule (at most ~2.5 s, normally already loaded) */
    .then(renderIntro, function(){ pool = []; renderIntro(); });
}
if (!window.__DH_NO_BOOT) boot();   /* the /admin/ page loads this file only for dailySet(), with __DH_NO_BOOT set */
if (typeof window.__DH_EXPOSE === 'function') window.__DH_EXPOSE({pickSet:pickSet, dailySet:dailySet, rngFrom:rngFrom, norm:norm, buildMatcher:buildMatcher, validQ:validQ, setBroadWeight:function(w){ BROAD_WEIGHT = w; }, BROAD_MIN:BROAD_MIN, getBroadWeight:function(){ return BROAD_WEIGHT; }});
})();
