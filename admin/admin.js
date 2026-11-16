/* Daily Political Trivia: admin page (/admin/).
   Lets the site owner choose today's or tomorrow's puzzle for each game. Choices are saved to data/schedule.json in the site's
   GitHub repository through the GitHub API, using a fine-grained GitHub key (personal access token) that the owner pastes in.
   Only a key with write access to this one repository can save, so the page itself holds no secret and gives nothing away.
   Saving makes a commit; the normal "Deploy site" workflow then publishes it (about 2 to 10 minutes until players see it).
   The games read the file through assets/schedule.js and check every entry again; anything unusable falls back to the automatic pick.
   Security: no innerHTML anywhere (every value is set with textContent); the key is kept in sessionStorage (or localStorage when the
   owner ticks "stay signed in") and is only ever sent to api.github.com, which is also the only outside address the page's CSP allows. */
(function () {
  'use strict';
  var REPO = 'dailypoliticaltrivia/daily-political-trivia', BRANCH = 'main', FILE = 'data/schedule.json', API = 'https://api.github.com';
  var KEY = 'dpt.admin.key';
  var TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=Daily%20Political%20Trivia%20admin&description=Saves%20the%20daily%20puzzle%20schedule&target_name=dailypoliticaltrivia&expires_in=90&contents=write';
  var CAUCUS_EPOCH = Date.UTC(2026, 10, 11) / 864e5;   // must match games/caucus-sort/caucus-sort.js
  var DH_COUNT = 7, DH_MIN_ANSWERS = 100;               // must match games/dark-horse/trivia.js (COUNT, MIN_ANSWERS)
  var GRID_MIN_COUNTS = [4, 3, 2];                      // must match the congress game in games/congressional-grid/index.html
  var DIFF = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  var root = document.getElementById('adm');

  /* ---------- tiny DOM helper (text only, never HTML) ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }

  /* ---------- dates (the admin's local calendar, the same rule the games use) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayFrom(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function pretty(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dayNum(s) { var p = s.split('-'); return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
  var TODAY = dayFrom(0), TOMORROW = dayFrom(1), YESTERDAY = dayFrom(-1);

  /* ---------- key storage ---------- */
  var token = '';
  function readToken() { try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function storeToken(t, keep) {
    try { sessionStorage.setItem(KEY, t); } catch (e) {}
    try { if (keep) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) {}
  }
  function dropToken() { token = ''; try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- GitHub API ---------- */
  function gh(method, path, body) {
    var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, j: j }; }); });
  }
  function b64ToText(s) { var bin = atob(String(s).replace(/\s/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
  function textToB64(t) { var u = new TextEncoder().encode(t), bin = ''; for (var i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]); return btoa(bin); }
  function readSchedule() {
    return gh('GET', '/repos/' + REPO + '/contents/' + FILE + '?ref=' + BRANCH).then(function (r) {
      if (r.status === 404) return { sha: null, days: {} };
      if (r.status === 401) throw new Error('auth');
      if (!r.ok || !r.j.content) throw new Error('GitHub answered ' + r.status);
      var d = {}; try { d = JSON.parse(b64ToText(r.j.content)); } catch (e) { d = {}; }
      return { sha: r.j.sha, days: d && d.days && typeof d.days === 'object' ? d.days : {} };
    });
  }

  /* ---------- loading game data (all from this site) ---------- */
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); }); }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = function () { rej(new Error(src)); }; document.head.appendChild(s); });
  }
  var D = {};   // grid, dh, caucus, climb data

  function loadGrid() {
    return loadScript('../games/congressional-grid/data/members.js').then(function () { return loadScript('../games/congressional-grid/categories.js'); }).then(function () {
      var M = (Array.isArray(window.MEMBERS) ? window.MEMBERS : []).filter(function (m) { return m && m.id && m.name; });
      var defs = []; try { defs = (typeof window.CATEGORIES === 'function' ? window.CATEGORIES(M) : []).filter(function (c) { return c && c.key != null && typeof c.test === 'function'; }); } catch (e) { defs = []; }
      var n = M.length, W = Math.max(1, Math.ceil(n / 32));
      var cats = defs.map(function (c, ci) {
        var bits = new Uint32Array(W), cnt = 0;
        for (var i = 0; i < n; i++) { var ok = false; try { ok = !!c.test(M[i]); } catch (e) {} if (ok) { bits[i >>> 5] |= (1 << (i & 31)); cnt++; } }
        return { ix: ci, group: c.group || 'other', key: String(c.key), label: c.label, bits: bits, count: cnt };
      });
      var byKey = {}; cats.forEach(function (c) { byKey[c.key] = c; });
      var groups = []; cats.forEach(function (c) { if (groups.indexOf(c.group) < 0) groups.push(c.group); });
      var pools = {}; groups.forEach(function (g) { pools[g] = cats.filter(function (c) { return c.group === g; }); });
      var memo = {};
      function popcnt(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24); }
      function overlap(a, b) {
        var k = a.ix * cats.length + b.ix; if (memo[k] != null) return memo[k];
        var v = 0; for (var w = 0; w < W; w++) { var x = a.bits[w] & b.bits[w]; if (x) v += popcnt(x); }
        memo[k] = memo[b.ix * cats.length + a.ix] = v; return v;
      }
      D.grid = { cats: cats, byKey: byKey, groups: groups, pools: pools, overlap: overlap };
    });
  }
  /* The automatic grid for a date: a faithful copy of makeGrid()/gridFor() in games/congressional-grid/index.html (congress game). */
  function gHash(s) { var hh = 1779033703 ^ s.length; for (var i = 0; i < s.length; i++) { hh = Math.imul(hh ^ s.charCodeAt(i), 3432918353); hh = hh << 13 | hh >>> 19; } return function () { hh = Math.imul(hh ^ hh >>> 16, 2246822507); hh = Math.imul(hh ^ hh >>> 13, 3266489909); return (hh ^= hh >>> 16) >>> 0; }; }
  function gRng(seed) { var a = gHash(seed)(); return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function makeGrid(seed) {
    var G = D.grid, rnd = gRng(seed);
    function pickCat() { var g = rnd() < 0.18 && G.pools.state ? 'state' : G.groups[Math.floor(rnd() * G.groups.length)]; var pool = G.pools[g] || []; return pool[Math.floor(rnd() * pool.length)] || null; }
    for (var mi = 0; mi < GRID_MIN_COUNTS.length; mi++) {
      var minCount = GRID_MIN_COUNTS[mi];
      for (var t = 0; t < 6000; t++) {
        var six = [], guard = 0;
        while (six.length < 6 && guard++ < 50) { var c = pickCat(); if (c && six.indexOf(c) < 0) six.push(c); }
        if (six.length < 6) continue;
        var gs = {}; six.forEach(function (x) { gs[x.group] = 1; });
        if (Object.keys(gs).length < 4) continue;
        if (six.filter(function (x) { return x.group === 'state'; }).length > 1) continue;
        var rows = six.slice(0, 3), cols = six.slice(3), ok = true;
        for (var r = 0; r < 3 && ok; r++) for (var k = 0; k < 3; k++) if (G.overlap(rows[r], cols[k]) < minCount) { ok = false; break; }
        if (ok) return { rows: rows.map(function (x) { return x.key; }), cols: cols.map(function (x) { return x.key; }) };
      }
    }
    return null;
  }
  function autoGrid(date) { var g = makeGrid(date); for (var k = 2; !g && k <= 4; k++) g = makeGrid(date + '#' + k); return g; }

  function loadDH() {
    return getJSON('../games/dark-horse/data/index.json').then(function (ix) {
      var seen = {}, rows = [];
      (ix && Array.isArray(ix.q) ? ix.q : []).forEach(function (r) {
        if (r && typeof r.id === 'string' && typeof r.c === 'string' && (r.d === 1 || r.d === 2 || r.d === 3) && typeof r.f === 'string' && r.f && r.n >= DH_MIN_ANSWERS && !seen[r.id]) {
          seen[r.id] = 1; rows.push({ id: r.id, category: r.c, difficulty: r.d, prompt: r.p || '', n: r.n || 0, broad: !!r.b, f: r.f });
        }
      });
      rows.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      var byId = {}; rows.forEach(function (x) { byId[x.id] = x; });
      D.dh = { pool: rows, byId: byId, api: null };
      /* the game's own dailySet(), so the automatic set shown here is exactly what players get (the file does not start the game) */
      window.__DH_NO_BOOT = true;
      window.__DH_EXPOSE = function (a) { D.dh.api = a; };
      return loadScript('../games/dark-horse/trivia.js').catch(function () {});
    });
  }
  function autoDH(date) { try { return D.dh.api ? D.dh.api.dailySet(D.dh.pool, date).map(function (x) { return x.id; }) : null; } catch (e) { return null; } }

  function loadCaucus() {
    return getJSON('../games/caucus-sort/data/puzzles.json').then(function (d) {
      var ps = Array.isArray(d && d.puzzles) ? d.puzzles : [], byId = {};
      ps.forEach(function (p, i) { byId[p.id] = i; });
      D.caucus = { puzzles: ps, byId: byId };
    });
  }
  function autoCaucus(date) { var n = D.caucus.puzzles.length; return n ? D.caucus.puzzles[((dayNum(date) - CAUCUS_EPOCH) % n + n) % n].id : null; }

  function loadClimb() {
    return loadScript('../games/capitol-climb/dcj-core.js').then(function () {
      return Promise.all([getJSON('../games/capitol-climb/data/stops.json'), getJSON('../games/capitol-climb/data/manifest.json')]);
    }).then(function (a) {
      var stops = a[0].stops || [], set = {}, byStop = {};
      stops.forEach(function (s) { set[s.id] = 1; byStop[s.id] = s; });
      return Promise.all((a[1].banks || []).map(function (f) { return getJSON('../games/capitol-climb/data/' + encodeURIComponent(f)).catch(function () { return null; }); })).then(function (banks) {
        var Core = window.DCJCore, pool = Core.mergeBanks(banks, set), byId = {};
        pool.forEach(function (q) { byId[q.id] = q; });
        D.climb = { core: Core, stops: stops, stopById: byStop, pool: pool, byId: byId, max: Core.ROUTE_LEN };
      });
    });
  }
  function autoClimb(date) { try { var r = D.climb.core.pickJourney(D.climb.pool, D.climb.stops, date); return r.ids.map(function (id, i) { return { q: id, s: r.stops[i] }; }); } catch (e) { return null; } }

  /* ---------- state ---------- */
  var S = { date: TODAY, days: {}, sha: null, dirty: false, msg: '', msgKind: '', picker: null, saving: false };
  function dayEntry(date, make) { if (!S.days[date] && make) S.days[date] = {}; return S.days[date] || null; }
  function custom(game) { var e = dayEntry(S.date); return e && Object.prototype.hasOwnProperty.call(e, game) ? e[game] : null; }
  function setCustom(game, v) {
    var e = dayEntry(S.date, true);
    if (v == null) delete e[game]; else e[game] = v;
    if (!Object.keys(e).length) delete S.days[S.date];
    S.dirty = true; S.msg = ''; render();
  }

  /* ---------- validation (the games re-check; this tells the admin before saving) ---------- */
  function checkGrid(e) {
    var G = D.grid, err = [], warn = [];
    var keys = (e.rows || []).concat(e.cols || []);
    if (keys.length !== 6 || keys.some(function (k) { return !G.byKey[k]; })) err.push('Choose all six categories.');
    else if (new Set(keys).size !== 6) err.push('Each category can only be used once.');
    else {
      var lo = 99;
      for (var r = 0; r < 3; r++) for (var c = 3; c < 6; c++) lo = Math.min(lo, G.overlap(G.byKey[keys[r]], G.byKey[keys[c]]));
      if (lo < 2) err.push('Every square needs at least 2 possible answers.');
      else if (lo < 4) warn.push('Some squares have only ' + lo + ' possible answers (the automatic grid needs 4 when it can).');
    }
    return { err: err, warn: warn };
  }
  function checkDH(e) {
    var err = [], warn = [], cats = {};
    if (!Array.isArray(e) || e.length !== DH_COUNT || e.some(function (id) { return !D.dh.byId[id]; })) err.push('Choose all ' + DH_COUNT + ' questions.');
    else if (new Set(e).size !== DH_COUNT) err.push('Each question can only be used once.');
    else {
      e.forEach(function (id) { var c = D.dh.byId[id].category; cats[c] = (cats[c] || 0) + 1; });
      var rep = Object.keys(cats).filter(function (c) { return cats[c] > 1; });
      if (rep.length) warn.push('More than one question from: ' + rep.join(', ') + '.');
    }
    return { err: err, warn: warn };
  }
  function checkCaucus(e) { return { err: typeof e === 'string' && D.caucus.byId[e] != null ? [] : ['Choose a puzzle.'], warn: [] }; }
  function checkClimb(e) {
    var C = D.climb, err = [], warn = [], seen = {};
    if (!Array.isArray(e) || e.length < 5 || e.length > C.max) err.push('A route needs 5 to ' + C.max + ' stops.');
    (Array.isArray(e) ? e : []).forEach(function (it, i) {
      var q = C.byId[it.q];
      if (!q || !C.stopById[it.s] || q.stops.indexOf(it.s) < 0) err.push('Stop ' + (i + 1) + ' is not usable.');
      else if (seen[q.id]) err.push('Stop ' + (i + 1) + ' repeats a question.');
      seen[it.q] = 1;
      if (i && e[i - 1].s === it.s) warn.push('Stops ' + i + ' and ' + (i + 1) + ' are at the same place.');
    });
    if (Array.isArray(e) && e.length && e.length < C.max) warn.push('The automatic route has ' + C.max + ' stops; this one has ' + e.length + '.');
    return { err: err, warn: warn };
  }
  var CHECK = { grid: checkGrid, darkhorse: checkDH, caucus: checkCaucus, climb: checkClimb };
  function problems() {
    var out = [];
    [TODAY, TOMORROW].forEach(function (d) {
      var e = S.days[d]; if (!e) return;
      Object.keys(CHECK).forEach(function (g) { if (e[g] != null && CHECK[g](e[g]).err.length) out.push(TITLE[g] + ' (' + pretty(d) + ')'); });
    });
    return out;
  }
  var TITLE = { grid: 'Congressional Grid', darkhorse: 'Dark Horse', caucus: 'Caucus Sort', climb: 'Capitol Climb' };

  /* ---------- picker (search a list, pick one) ---------- */
  function picker(opts) {
    var q = h('input', { type: 'search', placeholder: opts.placeholder || 'Search', 'aria-label': 'Search' });
    var filters = (opts.filters || []).map(function (f) {
      return h('select', { 'aria-label': f.label }, f.options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    });
    var res = h('div', { class: 'res', role: 'list' });
    function run() {
      clear(res);
      var vals = filters.map(function (s) { return s.value; });
      var items = opts.search(q.value.trim().toLowerCase(), vals), shown = items.slice(0, 80);
      if (!items.length) res.appendChild(h('p', { class: 'adm-small', text: 'Nothing matches.' }));
      shown.forEach(function (it) {
        res.appendChild(h('button', { type: 'button', class: 'adm-pick', role: 'listitem', onclick: function () { S.picker = null; opts.onPick(it.value); } }, [it.label, h('small', { text: it.sub || '' })]));
      });
      if (items.length > shown.length) res.appendChild(h('p', { class: 'adm-small', text: 'Showing 80 of ' + fmt(items.length) + '. Type to narrow it down.' }));
    }
    q.addEventListener('input', run); filters.forEach(function (s) { s.addEventListener('change', run); });
    var box = h('div', { class: 'adm-picker' }, [
      h('div', { class: 'adm-head' }, [h('h3', { text: opts.title }), h('button', { type: 'button', class: 'adm-mini', text: 'Cancel', onclick: function () { S.picker = null; render(); } })]),
      h('div', { class: 'adm-grid-sel' }, [q].concat(filters)), res
    ]);
    run(); setTimeout(function () { try { q.focus(); } catch (e) {} }, 0);
    return box;
  }

  /* ---------- game cards ---------- */
  function card(game, autoView, editView, startCustom) {
    var cur = custom(game), on = cur != null;
    var head = h('div', { class: 'adm-head' }, [h('h2', { text: TITLE[game] }), h('span', { class: 'adm-badge' + (on ? ' on' : ''), text: on ? 'Custom' : 'Automatic' })]);
    var body = [head];
    if (!on) {
      body.push(autoView());
      body.push(h('div', { class: 'row' }, [h('button', { type: 'button', class: 'btn ghost', text: 'Customize', onclick: function () { setCustom(game, startCustom()); } })]));
    } else {
      body.push(editView(cur));
      var ck = CHECK[game](cur);
      ck.err.forEach(function (m) { body.push(h('p', { class: 'adm-err', text: m })); });
      ck.warn.forEach(function (m) { body.push(h('p', { class: 'adm-warn', text: m })); });
      body.push(h('div', { class: 'row' }, [h('button', { type: 'button', class: 'btn ghost', text: 'Back to automatic', onclick: function () { S.picker = null; setCustom(game, null); } })]));
    }
    return h('section', { class: 'adm-card', 'aria-label': TITLE[game] }, body);
  }

  /* Congressional Grid */
  function gridTable(rows, cols) {
    var G = D.grid;
    var head = h('tr', null, [h('th', { text: '' })].concat(cols.map(function (k) { return h('th', { scope: 'col', text: G.byKey[k] ? G.byKey[k].label : '—' }); })));
    var trs = rows.map(function (rk) {
      return h('tr', null, [h('th', { scope: 'row', text: G.byKey[rk] ? G.byKey[rk].label : '—' })].concat(cols.map(function (ck) {
        var v = G.byKey[rk] && G.byKey[ck] ? G.overlap(G.byKey[rk], G.byKey[ck]) : null;
        return h('td', { class: v == null ? '' : v < 2 ? 'lo' : v < 4 ? 'mid' : '', text: v == null ? '' : fmt(v) });
      })));
    });
    return h('table', { class: 'adm-cells' }, [h('caption', { class: 'adm-small', text: 'Number of members who fit each square' }), h('thead', null, [head]), h('tbody', null, trs)]);
  }
  function gridCard() {
    var auto = autoGrid(S.date);
    return card('grid', function () {
      if (!auto) return h('p', { class: 'adm-note', text: 'The automatic grid could not be worked out here.' });
      return h('div', null, [h('p', { class: 'adm-small', text: 'Automatic grid for ' + pretty(S.date) + ' (the main Congress grid; Presidents and state grids stay automatic):' }), gridTable(auto.rows, auto.cols)]);
    }, function (cur) {
      var G = D.grid, sels = [];
      function sel(label, idx) {
        var all = cur.rows.concat(cur.cols);
        var s = h('select', { 'aria-label': label, onchange: function () {
          var keys = cur.rows.concat(cur.cols).slice(); keys[idx] = s.value;
          setCustom('grid', { rows: keys.slice(0, 3), cols: keys.slice(3) });
        } }, [h('option', { value: '', text: 'Choose…' })].concat(G.groups.map(function (g) {
          return h('optgroup', { label: g.charAt(0).toUpperCase() + g.slice(1) }, G.pools[g].slice().sort(function (a, b) { return a.label < b.label ? -1 : 1; }).map(function (c) {
            return h('option', { value: c.key, text: c.label + ' (' + fmt(c.count) + ')', selected: c.key === all[idx] });
          }));
        })));
        sels.push(s);
        return h('div', null, [h('label', { text: label }), s]);
      }
      return h('div', null, [
        h('p', { class: 'adm-small', text: 'Pick three rows and three columns. The table shows how many members fit each square.' }),
        h('div', { class: 'adm-grid-sel' }, [sel('Row 1', 0), sel('Row 2', 1), sel('Row 3', 2), sel('Column 1', 3), sel('Column 2', 4), sel('Column 3', 5)]),
        gridTable(cur.rows, cur.cols)
      ]);
    }, function () { return auto ? { rows: auto.rows.slice(), cols: auto.cols.slice() } : { rows: ['', '', ''], cols: ['', '', ''] }; });
  }

  /* Dark Horse */
  function dhLine(id) { var x = D.dh.byId[id]; return x ? { t: x.prompt || x.id, m: DIFF[x.difficulty] + ' · ' + x.category + ' · ' + fmt(x.n) + ' answers' } : { t: id + ' (no longer available)', m: '' }; }
  function dhCard() {
    var auto = autoDH(S.date);
    return card('darkhorse', function () {
      if (!auto) return h('p', { class: 'adm-note', text: 'The automatic questions could not be worked out here.' });
      return h('div', null, [h('p', { class: 'adm-small', text: 'Automatic questions for ' + pretty(S.date) + ':' }),
        h('ol', { class: 'adm-list' }, auto.map(function (id) { var l = dhLine(id); return h('li', null, [h('div', null, [h('div', { class: 't', text: l.t }), h('div', { class: 'm', text: l.m })])]); }))]);
    }, function (cur) {
      var list = h('ol', { class: 'adm-list' }, cur.map(function (id, i) {
        var l = dhLine(id);
        return h('li', null, [h('div', null, [h('div', { class: 't', text: (i + 1) + '. ' + l.t }), h('div', { class: 'm', text: l.m })]),
          h('div', { class: 'acts' }, [h('button', { type: 'button', class: 'adm-mini', text: 'Change', onclick: function () { S.picker = { game: 'darkhorse', i: i }; render(); } })])]);
      }));
      var out = [h('p', { class: 'adm-small', text: 'Players see these easiest first. Use Change to swap any question.' }), list];
      if (S.picker && S.picker.game === 'darkhorse') {
        var at = S.picker.i;
        out.push(picker({
          title: 'Choose question ' + (at + 1), placeholder: 'Search questions or categories',
          filters: [{ label: 'Difficulty', options: [['', 'Any difficulty'], ['1', 'Easy'], ['2', 'Medium'], ['3', 'Hard']] }],
          search: function (q, f) {
            return D.dh.pool.filter(function (x) {
              return cur.indexOf(x.id) < 0 && (!f[0] || String(x.difficulty) === f[0]) && (!q || (x.prompt + ' ' + x.category + ' ' + x.id).toLowerCase().indexOf(q) >= 0);
            }).map(function (x) { return { value: x.id, label: x.prompt || x.id, sub: DIFF[x.difficulty] + ' · ' + x.category + ' · ' + fmt(x.n) + ' answers' }; });
          },
          onPick: function (id) { var n = cur.slice(); n[at] = id; setCustom('darkhorse', n); }
        }));
      }
      return h('div', null, out);
    }, function () { return auto ? auto.slice() : []; });
  }

  /* Caucus Sort */
  function caucusView(id) {
    var i = D.caucus.byId[id], p = D.caucus.puzzles[i];
    if (!p) return h('p', { class: 'adm-note', text: 'No puzzle chosen.' });
    return h('div', null, [h('p', { class: 't', text: 'Puzzle #' + (i + 1) }),
      h('ol', { class: 'adm-list' }, p.g.map(function (g) { return h('li', null, [h('div', null, [h('div', { class: 't', text: g.t }), h('div', { class: 'm', text: g.p.map(function (x) { return x[0]; }).join(', ') })])]); }))]);
  }
  function caucusCard() {
    var auto = autoCaucus(S.date);
    return card('caucus', function () {
      return h('div', null, [h('p', { class: 'adm-small', text: 'Automatic puzzle for ' + pretty(S.date) + ':' }), caucusView(auto)]);
    }, function (cur) {
      var out = [caucusView(cur), h('div', { class: 'row' }, [h('button', { type: 'button', class: 'adm-mini', text: 'Choose a different puzzle', onclick: function () { S.picker = { game: 'caucus' }; render(); } })])];
      if (S.picker && S.picker.game === 'caucus') {
        out.push(picker({
          title: 'Choose a puzzle', placeholder: 'Search group names or people',
          search: function (q) {
            return D.caucus.puzzles.map(function (p, i) { return { p: p, i: i }; }).filter(function (o) {
              return !q || o.p.g.some(function (g) { return (g.t + ' ' + g.p.map(function (x) { return x[0]; }).join(' ')).toLowerCase().indexOf(q) >= 0; });
            }).map(function (o) { return { value: o.p.id, label: 'Puzzle #' + (o.i + 1), sub: o.p.g.map(function (g) { return g.t; }).join(' · ') }; });
          },
          onPick: function (id) { setCustom('caucus', id); }
        }));
      }
      return h('div', null, out);
    }, function () { return auto; });
  }

  /* Capitol Climb */
  function climbLine(it) {
    var C = D.climb, q = C.byId[it.q], s = C.stopById[it.s];
    return q ? { t: q.q, m: (s ? s.name : it.s) + ' · ' + DIFF[q.difficulty] + ' · period ' + q.period } : { t: it.q + ' (no longer available)', m: '' };
  }
  function climbCard() {
    var auto = autoClimb(S.date), C = D.climb;
    return card('climb', function () {
      if (!auto) return h('p', { class: 'adm-note', text: 'The automatic route could not be worked out here.' });
      return h('div', null, [h('p', { class: 'adm-small', text: 'Automatic route for ' + pretty(S.date) + ' (' + auto.length + ' stops):' }),
        h('ol', { class: 'adm-list' }, auto.map(function (it, i) { var l = climbLine(it); return h('li', null, [h('div', null, [h('div', { class: 't', text: (i + 1) + '. ' + l.t }), h('div', { class: 'm', text: l.m })])]); }))]);
    }, function (cur) {
      function upd(n) { setCustom('climb', n); }
      var list = h('ol', { class: 'adm-list' }, cur.map(function (it, i) {
        var l = climbLine(it);
        return h('li', null, [h('div', null, [h('div', { class: 't', text: (i + 1) + '. ' + l.t }), h('div', { class: 'm', text: l.m })]),
          h('div', { class: 'acts' }, [
            h('button', { type: 'button', class: 'adm-mini', text: '↑', 'aria-label': 'Move stop ' + (i + 1) + ' up', disabled: i === 0, onclick: function () { var n = cur.slice(); var t = n[i - 1]; n[i - 1] = n[i]; n[i] = t; upd(n); } }),
            h('button', { type: 'button', class: 'adm-mini', text: '↓', 'aria-label': 'Move stop ' + (i + 1) + ' down', disabled: i === cur.length - 1, onclick: function () { var n = cur.slice(); var t = n[i + 1]; n[i + 1] = n[i]; n[i] = t; upd(n); } }),
            h('button', { type: 'button', class: 'adm-mini', text: 'Change', onclick: function () { S.picker = { game: 'climb', i: i }; render(); } }),
            h('button', { type: 'button', class: 'adm-mini', text: 'Remove', disabled: cur.length <= 5, onclick: function () { var n = cur.slice(); n.splice(i, 1); S.picker = null; upd(n); } })
          ])]);
      }));
      var out = [h('p', { class: 'adm-small', text: 'Easy stops usually come first and hard ones last. Each question is asked at one of its own places on the map.' }), list,
        h('div', { class: 'row' }, [h('button', { type: 'button', class: 'adm-mini', text: 'Add a stop', disabled: cur.length >= C.max, onclick: function () { S.picker = { game: 'climb', i: cur.length }; render(); } })])];
      if (S.picker && S.picker.game === 'climb') {
        var at = S.picker.i, used = {};
        cur.forEach(function (it) { used[it.q] = 1; });
        out.push(picker({
          title: at < cur.length ? 'Choose stop ' + (at + 1) : 'Add stop ' + (at + 1), placeholder: 'Search questions',
          filters: [
            { label: 'Place', options: [['', 'Any place']].concat(C.stops.map(function (s) { return [s.id, s.name]; })) },
            { label: 'Difficulty', options: [['', 'Any difficulty'], ['1', 'Easy'], ['2', 'Medium'], ['3', 'Hard']] }
          ],
          search: function (q, f) {
            return C.pool.filter(function (x) {
              return !used[x.id] && (!f[0] || x.stops.indexOf(f[0]) >= 0) && (!f[1] || String(x.difficulty) === f[1]) && (!q || (x.q + ' ' + x.id).toLowerCase().indexOf(q) >= 0);
            }).map(function (x) {
              var old = cur[at], sid = f[0] || (old && x.stops.indexOf(old.s) >= 0 ? old.s : x.stops.filter(function (s) { return C.stopById[s]; })[0]);   // keep the current place when the new question belongs there too
              return { value: { q: x.id, s: sid }, label: x.q, sub: (C.stopById[sid] ? C.stopById[sid].name : sid) + ' · ' + DIFF[x.difficulty] + ' · period ' + x.period };
            });
          },
          onPick: function (v) { var n = cur.slice(); n[at] = v; upd(n); }
        }));
      }
      return h('div', null, out);
    }, function () { return auto ? auto.slice() : []; });
  }

  /* ---------- screens ---------- */
  function render() {
    clear(root);
    if (!token) return renderSignIn();
    var top = h('div', { class: 'adm-top' }, [
      h('div', { class: 'adm-seg', role: 'group', 'aria-label': 'Day' }, [[TODAY, 'Today'], [TOMORROW, 'Tomorrow']].map(function (d) {
        return h('button', { type: 'button', 'aria-pressed': String(S.date === d[0]), text: d[1] + ' · ' + pretty(d[0]), onclick: function () { S.date = d[0]; S.picker = null; render(); } });
      })),
      h('button', { type: 'button', class: 'adm-mini', text: 'Sign out', onclick: function () { if (S.dirty && !window.confirm('You have unsaved changes. Sign out anyway?')) return; dropToken(); S = { date: TODAY, days: {}, sha: null, dirty: false, msg: '', msgKind: '', picker: null, saving: false }; render(); } })
    ]);
    root.appendChild(top);
    if (S.date === TODAY) root.appendChild(h('p', { class: 'adm-small', text: 'Changes to today only reach players who have not started that game yet; anyone who already began keeps the puzzle they started.' }));
    [gridCard, dhCard, caucusCard, climbCard].forEach(function (f) {
      try { root.appendChild(f()); } catch (e) { root.appendChild(h('section', { class: 'adm-card' }, [h('p', { class: 'adm-err', text: 'This game could not be shown: ' + e.message })])); }
    });
    var probs = problems();
    var note = S.saving ? 'Saving…' : S.msg ? S.msg : S.dirty ? 'You have unsaved changes.' : 'Everything is saved.';
    var bar = h('div', { class: 'adm-save' }, [
      h('p', { class: S.msgKind === 'err' ? 'adm-err' : S.msgKind === 'ok' ? 'adm-ok' : '', text: probs.length ? 'Fix these first: ' + probs.join(', ') + '.' : note }),
      h('button', { type: 'button', class: 'btn red', text: 'Save schedule', disabled: S.saving || !S.dirty || probs.length > 0, onclick: save })
    ]);
    root.appendChild(bar);
  }

  function renderSignIn(err) {
    clear(root);
    var inp = h('input', { type: 'password', id: 'adm-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…', 'aria-describedby': 'adm-key-help' });
    var keep = h('input', { type: 'checkbox', id: 'adm-keep' });
    var btn = h('button', { type: 'submit', class: 'btn red', text: 'Sign in' });
    var msg = h('p', { class: 'adm-err', role: 'alert', text: err || '' });
    var form = h('form', { onsubmit: function (ev) {
      ev.preventDefault();
      var t = inp.value.trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { msg.textContent = 'That does not look like a GitHub key. It starts with github_pat_.'; return; }
      btn.disabled = true; msg.textContent = ''; btn.textContent = 'Checking…';
      token = t;
      gh('GET', '/repos/' + REPO).then(function (r) {
        if (r.status === 401) throw new Error('GitHub did not accept that key. Check that you copied all of it and that it has not expired.');
        if (!r.ok) throw new Error('That key cannot see the site’s repository. When you create it, choose "Only select repositories" and pick daily-political-trivia.');
        if (!(r.j.permissions && r.j.permissions.push)) throw new Error('That key can read the site but not save to it. Give it Contents: Read and write.');
        storeToken(t, keep.checked);
        start();
      }).catch(function (e) { token = ''; btn.disabled = false; btn.textContent = 'Sign in'; msg.textContent = e.message || 'Could not reach GitHub. Check your connection and try again.'; });
    } }, [
      h('label', { for: 'adm-key', text: 'GitHub key' }), inp,
      h('p', { class: 'adm-small', id: 'adm-key-help', text: 'Your key stays in this browser and is only sent to GitHub.' }),
      h('div', { class: 'row' }, [keep, h('label', { for: 'adm-keep', text: 'Stay signed in on this device (not on a shared computer)' })]),
      h('div', { class: 'row' }, [btn]), msg
    ]);
    root.appendChild(h('section', { class: 'adm-card' }, [
      h('h2', { text: 'Sign in' }),
      h('p', { text: 'This page saves your choices to the site’s GitHub repository, so it needs a key from the GitHub account that owns the site. The key can only change this one repository.' }),
      h('h3', { text: 'First time: make a key' }),
      h('ol', null, [
        h('li', null, ['Signed in to GitHub as the site’s account, open ', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener noreferrer', text: 'New fine-grained key' }), '.']),
        h('li', { text: 'Repository access: choose "Only select repositories" and pick daily-political-trivia.' }),
        h('li', { text: 'Permissions: set Contents to "Read and write" (leave everything else as it is).' }),
        h('li', { text: 'Pick an expiry date, press Generate, then copy the key and paste it below.' })
      ]),
      form
    ]));
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 0);
  }

  function save() {
    if (S.saving) return;
    S.saving = true; S.msg = ''; render();
    readSchedule().then(function (remote) {
      var days = remote.days;
      [TODAY, TOMORROW].forEach(function (d) { if (S.days[d] && Object.keys(S.days[d]).length) days[d] = S.days[d]; else delete days[d]; });
      var keep = {};
      Object.keys(days).sort().forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= YESTERDAY) keep[k] = days[k]; });   // old days are dropped
      var text = JSON.stringify({ v: 1, days: keep }, null, 1) + '\n';
      var changed = [TODAY, TOMORROW].filter(function (d) { return S.days[d]; }).map(pretty).join(' and ') || 'back to automatic';
      return gh('PUT', '/repos/' + REPO + '/contents/' + FILE, { message: 'Admin: daily schedule (' + changed + ')', content: textToB64(text), sha: remote.sha || undefined, branch: BRANCH });
    }).then(function (r) {
      if (r.status === 401) throw new Error('auth');
      if (r.status === 409 || r.status === 422) throw new Error('The schedule changed on GitHub while you were editing. Press Save again.');
      if (!r.ok) throw new Error('GitHub did not save it (' + r.status + (r.j && r.j.message ? ': ' + r.j.message : '') + ').');
      S.saving = false; S.dirty = false; S.msgKind = 'ok';
      S.msg = 'Saved. Players will see it in about 2 to 10 minutes, once the site finishes updating.';
      render();
    }).catch(function (e) {
      S.saving = false;
      if (e.message === 'auth') { dropToken(); return renderSignIn('Your key has expired or was removed. Make a new one and sign in again.'); }
      S.msgKind = 'err'; S.msg = e.message || 'Could not reach GitHub. Check your connection and try again.'; render();
    });
  }

  function start() {
    clear(root);
    root.appendChild(h('p', { class: 'adm-note', text: 'Loading the games and the current schedule…' }));
    Promise.all([readSchedule(), loadGrid(), loadDH(), loadCaucus(), loadClimb()]).then(function (a) {
      S.days = {};
      [TODAY, TOMORROW].forEach(function (d) { if (a[0].days[d] && typeof a[0].days[d] === 'object') S.days[d] = JSON.parse(JSON.stringify(a[0].days[d])); });
      S.sha = a[0].sha; S.dirty = false;
      render();
    }).catch(function (e) {
      if (e && e.message === 'auth') { dropToken(); return renderSignIn('Your key has expired or was removed. Make a new one and sign in again.'); }
      clear(root);
      root.appendChild(h('p', { class: 'adm-err', text: 'Something did not load: ' + (e && e.message ? e.message : 'unknown error') + '. Reload the page to try again.' }));
    });
  }

  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  token = readToken();
  if (token) start(); else render();
})();
