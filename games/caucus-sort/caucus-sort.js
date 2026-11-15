/* Caucus Sort (display name set in site/tools/game-names.json): game logic. Puzzles come from data/puzzles.json (built by site/tools/build-caucus-sort.js). */
(function () {
  'use strict';
  var PHOTO_BASE = '../congressional-grid/photos/';
  var MAX_MISTAKES = 4;
  var EPOCH = Date.UTC(2026, 10, 11) / 864e5;
  var SYMS = ['●', '▲', '■', '◆'];                       // circle, triangle, square, diamond
  var COLS = ['amber', 'rose', 'teal', 'indigo'];
  var LEVELS = ['Easiest', 'Easy', 'Hard', 'Hardest'];
  var EMOJI = ['🟠', '🔴', '🟢', '🟣'];   // circles matching the group colours in slot order: amber, rose, teal, indigo
  var K = 'caucus.v1.';
  var root = document.getElementById('game');
  var live = document.getElementById('cx-live');
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(op, key, val) {
    try {
      if (op === 'get') return localStorage.getItem(key);
      if (op === 'set') localStorage.setItem(key, val);
      if (op === 'del') localStorage.removeItem(key);
      if (op === 'keys') { var o = []; for (var i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); return o; }
    } catch (e) { return null; }
  }
  // ---- ads: video breaks (see assets/ads/INTEGRATION.md). Never throws; with ads off nothing here waits for anything.
  var GAME_ID = 'caucus-sort';   // internal id (ads, storage); the display name lives in site/tools/game-names.json
  function adBreak(kind) {
    try { return window.SIN_ADS && SIN_ADS.ready ? Promise.resolve(SIN_ADS[kind](GAME_ID)) : Promise.resolve(); } catch (e) { return Promise.resolve(); }
  }
  function gameplay(on) { try { if (window.SIN_ADS && SIN_ADS.setGameplay) SIN_ADS.setGameplay(on); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // optional shared effects (assets/fx.js): a missing file changes nothing
  function fx(type, o) { try { if (window.SINFX) SINFX.play(type, o); } catch (e) {} }
  function fxc(name) { try { return window.SINFX ? SINFX[name].apply(SINFX, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) {} }
  function fxOn() { try { return !!(window.SINFX && SINFX.isEnabled()); } catch (e) { return false; } }
  function say(t) { if (live) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); } }
  function mod(a, n) { return ((a % n) + n) % n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDate() { var d = new Date(); return { s: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), n: Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) }; }
  function initials(n) { return n.split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }

  // ?reset clears saved progress (settings are kept). Developer helper: only on this PC (localhost), never on the public site.
  var qs = new URLSearchParams(location.search);
  if (qs.has('reset') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    (store('keys') || []).forEach(function (k) { if (k.indexOf(K + 'day.') === 0) store('del', k); });
    qs.delete('reset');
    try { history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '')); } catch (e) {}
  }

  var DATA = null, S = null;       // S = current game state
  var mode = qs.has('practice') ? 'practice' : 'daily';
  var facesOnly = store('get', K + 'faces') === '1';
  var dayInfo = localDate();

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function tilesOf(p) {
    var t = [];
    p.g.forEach(function (g, gi) { g.p.forEach(function (x) { t.push({ name: x[0], file: x[1], slot: gi }); }); });  // slot 0..3 = amber..indigo (g is stored in difficulty order)
    return t;
  }
  function newState(p, idx, daily) {
    var r = seeded(dayInfo.n * 7919 + idx);
    var order = []; for (var i = 0; i < 16; i++) order.push(i);
    for (var k = 15; k > 0; k--) { var j = Math.floor(r() * (k + 1)); var tmp = order[k]; order[k] = order[j]; order[j] = tmp; }
    if (!daily) order = shuffle(order);
    return { pid: p.id, idx: idx, order: order, solved: [], mistakes: 0, guesses: [], over: null, daily: daily };
  }
  function save() { if (S && S.daily) store('set', K + 'day.' + dayInfo.s, JSON.stringify({ pid: S.pid, idx: S.idx, order: S.order, solved: S.solved, mistakes: S.mistakes, guesses: S.guesses, over: S.over, seen: S.seen, missed: S.missed })); }
  function loadDaily() {
    var idx = mod(dayInfo.n - EPOCH, DATA.puzzles.length), p = DATA.puzzles[idx];
    var raw = store('get', K + 'day.' + dayInfo.s), st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (e) { st = null; }
    if (st && st.pid === p.id && Array.isArray(st.order) && st.order.length === 16) {
      // SECURITY: saved progress comes from localStorage, which anything running on this origin can edit. Re-build the
      // fields that are written into the page as plain numbers so a poisoned value can never become markup.
      var ints = function (a, max) { return (Array.isArray(a) ? a : []).map(function (x) { return x | 0; }).filter(function (x) { return x >= 0 && x < max; }); };
      st.idx = idx; st.mistakes = Math.max(0, st.mistakes | 0); st.solved = ints(st.solved, 4); st.missed = ints(st.missed, 4);
      st.order = ints(st.order, 16);
      st.guesses = (Array.isArray(st.guesses) ? st.guesses : []).filter(Array.isArray).map(function (g) { return ints(g, 4); }).slice(0, 40);
      st.seen = (Array.isArray(st.seen) ? st.seen : []).filter(function (x) { return typeof x === 'string' && x.length < 40; }).slice(0, 200);
      st.over = (st.over === 'won' || st.over === 'lost') ? st.over : null;
      if (st.order.length !== 16) return newState(p, idx, true);
      st.daily = true; return st;
    }
    return newState(p, idx, true);
  }
  // The puzzle just ended (won or lost): gameplay is over, then a post-roll may follow (not awaited).
  function gameOver() { gameplay(false); if (S && S.daily) adBreak('showPostroll'); }

  function puzzle() { return DATA.puzzles[S.idx]; }

  // ------------------------------------------------------------------ rendering
  var sel = [];       // selected tile ids (0..15)
  var msg = '', msgWarn = false;
  var tiles = [];

  function setMode(m) {
    mode = m;
    sel = []; msg = ''; msgWarn = false;
    if (m === 'daily') S = loadDaily();
    else { var i = Math.floor(Math.random() * DATA.puzzles.length); S = newState(DATA.puzzles[i], i, false); }
    tiles = tilesOf(puzzle());
    render();
    say(m === 'daily' ? 'Daily puzzle number ' + (S.idx + 1) : 'Practice puzzle');
  }

  var MAP_Q = '../../map/?q=';   /* after a puzzle ends, each name opens that person on the Congress Map (empty = no links) */
  function whoHtml(x) {
    var m = /^(?:p-)?([A-Z]d{6}|Qd+).(?:jpg|webp|png)$/.exec(x[1] || '');
    if (!MAP_Q || !S.over || !m) return esc(x[0]);
    return '<a class="cx-who" href="' + esc(MAP_Q + m[1]) + '">' + esc(x[0]) + '</a>';
  }
  function groupHtml(gi, missed) {
    var g = puzzle().g[gi];
    return '<div class="cx-group d' + (gi + 1) + (missed ? ' missed' : '') + '" role="group" aria-label="' + esc(COLS[gi] + ' group, ' + LEVELS[gi].toLowerCase() + ': ' + g.t + '. ' + g.p.map(function (x) { return x[0]; }).join(', ')) + '">' +
      '<div class="t"><span class="sym" aria-hidden="true">' + SYMS[gi] + '</span>' + esc(g.t) + '</div>' +
      '<div class="n">' + g.p.map(whoHtml).join(', ') + '</div>' +
      '<div class="lvl">' + COLS[gi] + ' · ' + LEVELS[gi].toLowerCase() + '</div></div>';
  }
  function shareText() {
    var rows = S.guesses.map(function (g) { return g.map(function (s) { return EMOJI[s]; }).join(''); }).join('\n');
    var won = S.over === 'won';
    var gname = (document.querySelector('h1.ptitle') || {}).textContent || document.title.split(' · ')[0];   // stamped from site/tools/game-names.json
    var title = mode === 'daily' ? gname + ' #' + (S.idx + 1) : gname + ' (practice)';
    return title + '\n' + (won ? (S.mistakes ? 'Solved with ' + S.mistakes + ' mistake' + (S.mistakes > 1 ? 's' : '') : 'Solved with no mistakes') : 'Not solved (4 mistakes)') + '\n' + rows;
  }

  function render() {
    var p = puzzle(), over = !!S.over;
    var remaining = S.order.filter(function (t) { return S.solved.indexOf(tiles[t].slot) < 0; });
    var h = '<div class="cx-bar">' +
      '<div class="cx-seg" role="group" aria-label="Game mode"><button type="button" data-mode="daily" aria-pressed="' + (mode === 'daily') + '">Daily</button><button type="button" data-mode="practice" aria-pressed="' + (mode === 'practice') + '">Practice</button></div>' +
      '<label class="cx-check"><input type="checkbox" id="cx-faces"' + (facesOnly ? ' checked' : '') + '> Faces only (hard mode)</label></div>';
    h += '<div class="cx-meta"><span>' + (mode === 'daily' ? 'Daily puzzle <b>#' + (S.idx + 1) + '</b> · ' + esc(dayInfo.s) : 'Practice puzzle <b>#' + (S.idx + 1) + '</b> (not saved)') + '</span>' +
      '<span class="cx-lives" role="img" aria-label="Mistakes remaining: ' + (MAX_MISTAKES - S.mistakes) + ' of ' + MAX_MISTAKES + '">Mistakes left ';
    for (var i = 0; i < MAX_MISTAKES; i++) h += '<i class="' + (i < S.mistakes ? 'lost' : '') + '"></i>';
    h += '</span></div>';
    h += '<div class="cx-solved">' + S.solved.map(function (gi) { return groupHtml(gi, S.missed && S.missed.indexOf(gi) >= 0); }).join('') + '</div>';
    if (!over) {
      h += '<div class="cx-board' + (facesOnly ? ' cx-faces' : '') + '" id="cx-board" role="group" aria-label="Politician tiles. Select four that share a category.">';
      remaining.forEach(function (t) {
        var x = tiles[t], on = sel.indexOf(t) >= 0;
        h += '<button type="button" class="cx-tile" data-t="' + t + '" aria-pressed="' + on + '" aria-label="' + esc(x.name) + '">' +
          '<img src="' + esc(PHOTO_BASE + x.file) + '" alt="" width="225" height="275" loading="eager" decoding="async" draggable="false">' +
          '<span class="nm" aria-hidden="true">' + esc(x.name) + '</span></button>';
      });
      h += '</div>';
      h += '<div class="cx-msg' + (msgWarn ? ' warn' : '') + '" id="cx-msg" aria-hidden="true">' + esc(msg) + '</div>';
      h += '<div class="cx-actions"><button type="button" class="btn ghost" id="cx-shuffle">Shuffle</button>' +
        '<button type="button" class="btn ghost" id="cx-clear"' + (sel.length ? '' : ' disabled') + '>Clear</button>' +
        '<button type="button" class="btn red" id="cx-submit"' + (sel.length === 4 ? '' : ' disabled') + '>Submit</button></div>';
    } else {
      var won = S.over === 'won';
      h += '<div class="cx-result" id="cx-result"><h2>' + (won ? (S.mistakes === 0 ? 'Perfect!' : 'You got it!') : 'Out of mistakes') + '</h2>' +
        '<p class="cx-big num">' + (4 - (S.missed ? S.missed.length : 0)) + '<small> of 4 groups</small></p><p class="sum">' + (won ? 'All four groups found with ' + S.mistakes + ' mistake' + (S.mistakes === 1 ? '' : 's') + '.' : 'Here are the answers. The dashed groups are the ones you missed.') + '</p>' +
        '<div class="cx-share" id="cx-sharetext">' + esc(shareText()) + '</div>' +
        '<div class="cx-actions"><button type="button" class="btn red" id="cx-share-btn">Share result</button><button type="button" class="btn ghost" id="cx-copy">Copy result</button>' +
        (mode === 'daily' ? '<button type="button" class="btn ghost" id="cx-prac">Play a practice puzzle</button>' : '<button type="button" class="btn ghost" id="cx-prac">Another practice puzzle</button>') + '</div>' +
        '<p class="studyline"><a class="studylink" href="../../map/">Learn the faces: explore who served where on the Congress Map</a></p>' + (mode === 'daily' ? '<p class="cx-note">A new daily puzzle arrives at midnight, your local time.</p>' : '') + '</div>';
    }
    root.innerHTML = h;
    root.setAttribute('aria-busy', 'false');
    wire();
    var board = document.getElementById('cx-board');
    if (board) {
      // images that fail to load fall back to initials so the tile still works
      board.querySelectorAll('img').forEach(function (im) { im.addEventListener('error', function () { var d = document.createElement('span'); d.className = 'ph'; d.setAttribute('aria-hidden', 'true'); d.textContent = initials(tiles[+im.parentNode.getAttribute('data-t')].name); im.replaceWith(d); }); });
    }
  }

  function wire() {
    root.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { var m = b.getAttribute('data-mode'); if (m !== mode) { setMode(m); var nb = root.querySelector('[data-mode="' + m + '"]'); if (nb) nb.focus(); } }); });
    var f = document.getElementById('cx-faces');
    f.addEventListener('change', function () { facesOnly = f.checked; store('set', K + 'faces', facesOnly ? '1' : '0'); var b = document.getElementById('cx-board'); if (b) b.classList.toggle('cx-faces', facesOnly); say(facesOnly ? 'Faces only: names hidden. Tiles are still labelled for screen readers.' : 'Names shown'); });
    var board = document.getElementById('cx-board');
    if (board) {
      board.addEventListener('click', function (e) { var b = e.target.closest('.cx-tile'); if (b) toggle(+b.getAttribute('data-t'), b); });
      board.addEventListener('keydown', function (e) {
        var keys = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
        if (!(e.key in keys)) return;
        var all = Array.prototype.slice.call(board.querySelectorAll('.cx-tile')), i = all.indexOf(document.activeElement);
        if (i < 0) return;
        var n = i + keys[e.key]; if (n >= 0 && n < all.length) { all[n].focus(); e.preventDefault(); }
      });
      document.getElementById('cx-shuffle').addEventListener('click', function () { S.order = shuffle(S.order); save(); render(); document.getElementById('cx-shuffle').focus(); });
      document.getElementById('cx-clear').addEventListener('click', function () { sel = []; msg = ''; render(); var fb = document.querySelector('.cx-tile'); if (fb) fb.focus(); });
      document.getElementById('cx-submit').addEventListener('click', submit);
    } else {
      var c = document.getElementById('cx-copy');
      c.addEventListener('click', function () { copyShare(false); });
      document.getElementById('cx-share-btn').addEventListener('click', function () { copyShare(true); });
      document.getElementById('cx-prac').addEventListener('click', function () { setMode('practice'); window.scrollTo(0, 0); var ft = document.querySelector('.cx-tile'); if (ft) ft.focus({ preventScroll: true }); });
      document.getElementById('cx-share-btn').focus({ preventScroll: true });
    }
  }

  function toggle(t, btn) {
    var i = sel.indexOf(t);
    if (i >= 0) sel.splice(i, 1);
    else { if (sel.length >= 4) { setMsg('Four tiles selected. Deselect one first.', true); return; } sel.push(t); }
    btn.setAttribute('aria-pressed', sel.indexOf(t) >= 0 ? 'true' : 'false');
    if (sel.indexOf(t) >= 0) { fx('tap', { visual: false }); fxc('pop', btn, 0.07); }
    document.getElementById('cx-submit').disabled = sel.length !== 4;
    document.getElementById('cx-clear').disabled = sel.length === 0;
    setMsg(sel.length + ' of 4 selected', false);
  }
  function setMsg(t, warn) { msg = t; msgWarn = !!warn; var m = document.getElementById('cx-msg'); if (m) { m.textContent = t; m.classList.toggle('warn', !!warn); } say(t); }

  function submit() {
    if (sel.length !== 4 || S.over) return;
    var slots = sel.map(function (t) { return tiles[t].slot; });
    var counts = [0, 0, 0, 0]; slots.forEach(function (s) { counts[s]++; });
    var best = Math.max.apply(null, counts), gi = counts.indexOf(best);
    var sig = sel.slice().sort(function (a, b) { return a - b; }).join(',');
    if (best === 4) {
      var snap = fxc('snapshot', document.querySelectorAll('.cx-tile')), picked = [].filter.call(document.querySelectorAll('.cx-tile'), function (b) { return sel.indexOf(+b.getAttribute('data-t')) >= 0; }), last = S.solved.length === 3, ghosts = last ? [] : fxc('ghost', picked);
      S.guesses.push(slots.slice().sort());
      S.solved.push(gi);
      msg = 'Correct! ' + puzzle().g[gi].t; msgWarn = false;
      if (S.solved.length === 4) { S.over = 'won'; gameOver(); }
      sel = []; save(); render();
      if (!S.over) { var ft = document.querySelector('.cx-tile'); if (ft) ft.focus({ preventScroll: true }); }   // the Submit button was re-drawn: keep keyboard focus on the board
      say('Correct. ' + COLS[gi] + ' group: ' + puzzle().g[gi].t + (S.over ? '. Puzzle complete.' : ''));
      var gEl = document.querySelector('.cx-solved .cx-group.d' + (gi + 1));
      if (gEl) {
        var gcol = ''; try { gcol = getComputedStyle(gEl).backgroundColor; } catch (e) {}
        fxc('glide', ghosts, gEl); fxc('slideFrom', snap, document.querySelectorAll('.cx-tile'));
        fx('solve', { el: gEl, color: gcol || undefined, plain: last });
        if (S.over) setTimeout(function () { fx('win', { el: document.querySelector('#cx-result h2'), intensity: S.mistakes === 0 ? 1 : 0.35 }); }, 520);
      }
      if (S.over) { var r = document.getElementById('cx-result'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }); }
      return;
    }
    S.seen = S.seen || [];
    if (S.seen.indexOf(sig) >= 0) { setMsg('Already guessed that set.', true); return; }
    S.seen.push(sig);
    S.mistakes++;
    S.guesses.push(slots.slice());
    var text = best === 3 ? 'So close, three of four.' : 'Not quite.';
    var chosen = sel.slice();
    if (S.mistakes >= MAX_MISTAKES) {
      gameOver(); S.over = 'lost'; S.missed = [0, 1, 2, 3].filter(function (g) { return S.solved.indexOf(g) < 0; });
      S.solved = S.solved.concat(S.missed);
      sel = []; msg = ''; save(); render();
      say('Out of mistakes. The answers are shown.');
      fxc('staggerIn', document.querySelectorAll('.cx-solved .cx-group.missed'), 260);
      fx('lose', { el: document.querySelector('#cx-result h2') });
      return;
    }
    save();
    msg = text; msgWarn = true;
    var chosenEls = [].filter.call(document.querySelectorAll('.cx-tile'), function (b) { return chosen.indexOf(+b.getAttribute('data-t')) >= 0; }), useFx = fxOn();
    if (!useFx) chosenEls.forEach(function (b) { if (!REDUCED) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } });
    var lives = document.querySelectorAll('.cx-lives i');
    if (lives[S.mistakes - 1]) fx('lifeLost', { el: lives[S.mistakes - 1] });
    fx(best === 3 ? 'near' : 'wrong', { els: chosenEls, el: document.getElementById('cx-msg'), msgEl: document.getElementById('cx-msg'), color: best === 3 ? undefined : undefined });
    if (lives[S.mistakes - 1]) lives[S.mistakes - 1].classList.add('lost');
    var lv = document.querySelector('.cx-lives'); if (lv) lv.setAttribute('aria-label', 'Mistakes remaining: ' + (MAX_MISTAKES - S.mistakes) + ' of ' + MAX_MISTAKES);
    setMsg(text + ' ' + (MAX_MISTAKES - S.mistakes) + ' mistake' + (MAX_MISTAKES - S.mistakes === 1 ? '' : 's') + ' left.', true);
    msg = text;
  }

  function copyShare(viaSheet) {
    var t = shareText(), b = document.getElementById('cx-copy');
    if (viaSheet) { b = document.getElementById('cx-share-btn'); }
    var label = viaSheet ? 'Share results' : 'Copy results';   // each button gets its own label back (Share used to turn into a second "Copy results")
    function ok() { b.textContent = 'Copied!'; say('Results copied to the clipboard'); setTimeout(function () { b.textContent = label; }, 2000); }
    function shareOut(t, el, useShare, done) {
      /* Share sheet first (if asked), then clipboard, then the old copy command; if all are blocked (a sandboxed preview, an old browser) the text is left selected so it can be copied by hand. */
      function pick() { try { if (el.select) { el.focus(); el.select(); el.setSelectionRange(0, t.length); } else { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } } catch (e) {} }
      function manual() { pick(); done('manual'); }
      function viaExec() { pick(); try { if (document.execCommand('copy')) { done('copied'); return; } } catch (e) {} manual(); }
      function viaClip() { if (navigator.clipboard && navigator.clipboard.writeText) { try { navigator.clipboard.writeText(t).then(function () { done('copied'); }, viaExec); } catch (e) { viaExec(); } } else viaExec(); }
      if (useShare && navigator.share) { var u = /^https?:$/.test(location.protocol) && !/claude|localhost|127.0|192.168|^10./.test(location.hostname) ? location.origin + location.pathname : ''; try { navigator.share(u ? { text: t, url: u } : { text: t }).then(function () { done('shared'); }, function (e) { if (e && e.name === 'AbortError') return; viaClip(); }); } catch (e) { viaClip(); } } else viaClip();
    }
    shareOut(t, document.getElementById('cx-sharetext'), !!viaSheet, function (k) {
      if (k === 'shared') { say('Results shared'); } else if (k === 'manual') { b.textContent = 'Text selected: press and hold, then Copy'; say('Text selected. Press and hold it, then tap Copy.'); setTimeout(function () { b.textContent = label; }, 4000); } else ok();
    });
  }

  // ------------------------------------------------------------------ start screen
  // Shown for today's puzzle until the player presses Start (or Continue when they already began today). The button press
  // is the player action a video pre-roll needs. With ads off Start behaves exactly like a normal start, with no delay.
  function showIntro(started) {
    var n = DATA.puzzles.length ? mod(dayInfo.n - EPOCH, DATA.puzzles.length) + 1 : 1;
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = '<div class="cx-intro"><p class="cx-intro-date">Daily puzzle <b>#' + n + '</b> · ' + esc(dayInfo.s) + '</p>' +
      '<p class="cx-intro-rules">Sixteen faces, four hidden groups of four. You can make four mistakes. A new puzzle arrives every day at midnight, your local time.</p>' +
      '<div class="row"><button class="btn red" id="cx-go" type="button">' + (started ? 'Continue today’s puzzle' : 'Play today’s puzzle') + '</button>' +
      '<button class="btn ghost" id="cx-pr" type="button">Practice puzzle</button></div></div>';
    var go = document.getElementById('cx-go');
    go.addEventListener('click', function () {
      function begin() { gameplay(true); setMode('daily'); var fb = document.querySelector('.cx-tile'); if (fb) fb.focus({ preventScroll: true }); fx('reveal', { el: document.getElementById('cx-board') }); }
      if (window.SIN_ADS && SIN_ADS.ready) { go.disabled = true; adBreak('showPreroll').then(begin, begin); }
      else begin();
    });
    document.getElementById('cx-pr').addEventListener('click', function () { gameplay(true); setMode('practice'); var ft = document.querySelector('.cx-tile'); if (ft) ft.focus({ preventScroll: true }); });
    go.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ start
  fetch('data/puzzles.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    DATA = d;
    if (mode === 'daily') {
      var d0 = loadDaily();
      if (!d0.over) return showIntro(d0.guesses.length > 0 || d0.solved.length > 0 || d0.mistakes > 0);
    }
    setMode(mode);
  }).catch(function () { root.innerHTML = '<p class="lede">Sorry, the puzzles could not be loaded. Please try again later.</p>'; root.setAttribute('aria-busy', 'false'); });
})();
