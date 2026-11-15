/* Interactive map: data loading and date logic (no DOM). Contract: design-notes/map/SCHEMA.md.
   Exposes window.MAPDATA (and module.exports for node tests).
   Every path inside the data files resolves against the data root (data/ or data/sample/). */
(function (root) {
  'use strict';

  /* ---------- dates ---------- */
  const DAY = 86400000;
  const t = s => Date.parse(s + 'T00:00:00Z');
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return MONTHS[m - 1] + ' ' + d + ', ' + y; }
  function fmtShort(s) { if (!s) return ''; const [, m, d] = s.split('-').map(Number); return MONTHS[m - 1] + ' ' + d; }
  function ordinal(n) { const v = n % 100; return n + ((v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); }

  /* ---------- parties ---------- */
  const PARTY_KEYS = { dem: ['Democrat', 'D'], rep: ['Republican', 'R'], whig: ['Whig', 'W'], fed: ['Federalist', 'F'], dr: ['Democratic-Republican', 'DR'], oth: ['Other', 'O'], vac: ['Vacant', '–'] };
  function partyKey(p) {
    const s = String(p || '').toLowerCase();
    if (!s) return 'oth';
    if (/democratic[- ]republican|jeffersonian|anti-administration/.test(s)) return 'dr';
    if (/^democrat|^dfl$|democratic-farmer|democratic-npl/.test(s)) return 'dem';   // Minnesota DFL and North Dakota NPL are the Democratic Party there
    if (/^republican/.test(s)) return 'rep';
    if (/whig/.test(s)) return 'whig';
    if (/federalist|pro-administration/.test(s)) return 'fed';
    return 'oth';
  }
  function partyName(p) { const k = partyKey(p); return k === 'oth' ? (p || 'Independent or other') : PARTY_KEYS[k][0]; }
  function partyLetter(p) { const k = partyKey(p); if (k !== 'oth') return PARTY_KEYS[k][1]; const s = String(p || ''); return /independent/i.test(s) ? 'I' : (s ? s[0].toUpperCase() : 'O'); }

  /* ---------- tenures in one seat ---------- */
  // merge contiguous terms of the same person (B may write one row per term)
  function merge(list) {
    const out = [];
    for (const x of (list || []).slice().sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
      const last = out[out.length - 1];
      if (last && last.id === x.id && last.to && t(x.from) - t(last.to) <= DAY && last.party === x.party) { last.to = x.to; continue; }
      out.push(Object.assign({}, x));
    }
    return out;
  }
  // who held the seat during [ws, we] (ISO, inclusive), with gaps as vacant entries; viewDate picks the primary one
  function segments(list, ws, we, viewDate) {
    const W0 = t(ws), W1 = t(we), out = [];
    const terms = merge(list).filter(x => t(x.from) <= W1 && (x.to == null || t(x.to) > W0));
    let cur = W0;
    for (const x of terms) {
      const f = t(x.from);
      if (f - cur > DAY) out.push({ vacant: true, from: iso(cur), to: x.from });
      out.push(Object.assign({ vacant: false }, x));
      cur = Math.max(cur, x.to == null ? Infinity : t(x.to));
    }
    if (cur !== Infinity && W1 - cur >= DAY) out.push({ vacant: true, from: iso(cur), to: null, openEnd: we });
    const v = t(viewDate);
    let primary = out.find(s => t(s.from) <= v && (s.to == null || t(s.to) > v));
    if (!primary && out.length) primary = out[out.length - 1];
    out.forEach(s => { s.primary = s === primary; });
    return out;
  }
  function holderOn(list, date) {
    const v = t(date);
    return merge(list).find(x => t(x.from) <= v && (x.to == null || t(x.to) > v)) || null;
  }
  // the full tenure (merged) of the person who holds the seat at this segment
  function tenureOf(list, seg) { return merge(list).find(x => x.id === seg.id && t(x.from) <= t(seg.from) && (x.to == null || t(x.to) >= t(seg.from))) || seg; }

  /* ---------- house seat keys for a district number ("0" -> "0", "0a", "0b"...) ---------- */
  function seatKeys(house, dnum) {
    const k = String(dnum);
    const keys = Object.keys(house || {}).filter(x => x === k || (x.length === k.length + 1 && x.indexOf(k) === 0 && /[a-z]$/.test(x))).sort();
    return keys.length ? keys : [k];
  }

  /* ---------- loader ---------- */
  function Loader(opts) {
    this.base = opts.base;              // 'data/' or 'data/sample/'
    this.index = null;
    this.cache = new Map();
    this.fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
  }
  // the page's own address; outside a browser (node tests) paths are simply joined
  const pageHref = () => (root.location && root.location.href) || (typeof document !== 'undefined' && document.baseURI) || null;
  Loader.prototype.url = function (rel) { const h = pageHref(); return h ? new URL(rel, new URL(this.base, h)).href : this.base + rel; };
  Loader.prototype.json = function (rel) {
    const u = this.url(rel);
    if (!this.cache.has(u)) {
      const p = this.fetchImpl(u, { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + rel); return r.json(); });
      p.catch(() => this.cache.delete(u));
      this.cache.set(u, p);
    }
    return this.cache.get(u);
  };
  Loader.prototype.congressFor = function (year) {
    const d = year + '-07-01';
    const cs = this.index.congresses;
    return cs.find(c => c.start <= d && d < c.end) || null;
  };
  Loader.prototype.congressByN = function (n) { return this.index.congresses.find(c => c.n === n) || null; };
  Loader.prototype.nation = function (c) { return c && c.geo ? this.json(c.geo) : Promise.reject(new Error('no geo')); };
  // A writes geo/state/<ST>/cNNN.json only for the Congresses listed in changes.json[ST] (when the map changed);
  // Congress n uses the largest listed Congress <= n. Without a changes list, ask for n itself.
  Loader.prototype.stateFileN = function (st, n, changes) {
    const list = changes && changes[st];
    if (!Array.isArray(list)) return n;
    let best = null; for (const k of list) if (k <= n && (best === null || k > best)) best = k;
    return best;
  };
  Loader.prototype.stateGeo = function (st, n, changes) {
    const k = this.stateFileN(st, n, changes);
    if (k === null) return Promise.reject(new Error('no state file'));
    return this.json('geo/state/' + st + '/c' + String(k).padStart(3, '0') + '.json');
  };
  Loader.prototype.people = function (st) { return this.json('people/' + st + '.json'); };
  Loader.prototype.hasHistory = function (st) { const h = this.index.history; return Array.isArray(h) ? h.indexOf(st) >= 0 : true; };
  Loader.prototype.history = function (st) { return this.hasHistory(st) ? this.json('history/' + st + '.json') : Promise.reject(new Error('no history')); };
  Loader.prototype.changes = function () { return this.json('geo/changes.json').catch(() => ({})); };
  Loader.prototype.summary = function (n) {
    const s = this.index.summary; if (!s || !this.congressByN(n)) return Promise.resolve(null);
    return this.json(s + 'c' + String(n).padStart(3, '0') + '.json').catch(() => null);
  };
  Loader.prototype.bios = function (ids) {
    const shards = Array.from(new Set(ids.filter(Boolean).map(id => id[0])));
    const allowed = this.index.bioShards;
    return Promise.all(shards.filter(s => !allowed || allowed.indexOf(s) >= 0).map(s => this.json('people/bios/' + s + '.json').catch(() => ({}))))
      .then(list => { const out = {}; list.forEach(o => Object.assign(out, o)); return out; });
  };
  // photos and other assets named inside bios resolve against the page (site/map/), as SCHEMA says
  Loader.prototype.asset = function (rel) { if (!rel) return null; const h = pageHref(); if (!h) return rel; try { return new URL(rel, h).href; } catch (e) { return null; } };
  Loader.prototype.stateExisted = function (st, date) { const s = this.index.states && this.index.states[st]; return !s || !s.admitted || s.admitted <= date; };

  // search rows [id, name, st, office, seat, from, to]; from people/search.json, or built from every state + bio shard
  Loader.prototype.searchRows = function () {
    if (this._rows) return this._rows;
    const ix = this.index;
    this._rows = (ix.search ? this.json(ix.search).then(j => j.rows || []) : Promise.reject())
      .catch(() => {
        const sts = Object.keys(ix.states || {});
        return Promise.all(sts.map(st => this.people(st).catch(() => null))).then(files => {
          const rows = [];
          files.forEach(P => { if (!P) return;
            Object.entries(P.house || {}).forEach(([k, l]) => merge(l).forEach(x => rows.push([x.id, '', P.st, 'h', k, x.from, x.to])));
            Object.entries(P.senate || {}).forEach(([k, l]) => merge(l).forEach(x => rows.push([x.id, '', P.st, 's', k, x.from, x.to])));
            merge(P.governor).forEach(x => rows.push([x.id, '', P.st, 'g', '', x.from, x.to]));
          });
          return this.bios(rows.map(r => r[0])).then(b => rows.map(r => { r[1] = (b[r[0]] && b[r[0]].name) || r[0]; return r; }));
        });
      });
    return this._rows;
  };

  // pick the data root: ?data=sample forces the sample; otherwise the real index if it exists, else the sample
  function pickBase(search, fetchImpl) {
    const q = new URLSearchParams(search || '');
    // forced sample: still consume the page's preloaded index request, so the browser does not warn about an unused preload
    if (q.get('data') === 'sample') { fetchImpl('data/index.json', { credentials: 'same-origin' }).then(r => r.body && r.body.cancel && r.body.cancel(), () => {}); return Promise.resolve('data/sample/'); }
    // the probe IS the index request (it matches the <link rel="preload"> in the page, so it costs no extra round trip)
    return fetchImpl('data/index.json', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json().then(index => ({ base: 'data/', index })) : 'data/sample/'), () => 'data/sample/');
  }

  const api = { Loader, pickBase, segments, holderOn, merge, tenureOf, seatKeys, partyKey, partyName, partyLetter, fmtDate, fmtShort, ordinal, iso, t, PARTY_KEYS };
  root.MAPDATA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
