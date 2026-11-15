/* The Congress Map: page logic (map, timeline, panel, search, URL state, phone sheet).
   Data rules: design-notes/map/SCHEMA.md. Data/date helpers: map-data.js (window.MAPDATA).
   CSP: no inline scripts or handlers, no external hosts, styles set through the CSSOM. */
(function () {
  'use strict';
  const M = window.MAPDATA;
  if (!M) return;
  const $ = id => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeHttp = u => (typeof u === 'string' && /^https:\/\/[^\s"'<>`\\]+$/i.test(u)) ? u : null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => matchMedia('(max-width: 759px)').matches;
  function sfx(type, o) { try { if (window.SINFX) window.SINFX.play(type, o || {}); } catch (e) { /* effects are optional */ } }

  const NOW_YEAR = new Date().getFullYear();
  const Y0 = 1789; let Y1 = NOW_YEAR;
  const TODAY = new Date().toISOString().slice(0, 10);
  let CHIPS = [[1789, '1789'], [1912, '1912'], [1964, '1964'], [NOW_YEAR, 'Today']];
  const isElect = c => !!(c && c.elect);
  let electYear = null;
  // called once the index is loaded: extend the range to an elect Congress and give it a prominent chip
  function setRange() {
    const ec = (L.index.congresses || []).filter(c => c.elect && c.geo).pop();
    if (ec) { electYear = +ec.start.slice(0, 4); Y1 = Math.max(NOW_YEAR, electYear); CHIPS = [[1789, '1789'], [1912, '1912'], [1964, '1964'], [NOW_YEAR, 'Today'], [electYear, electYear + ': the new Congress', true]]; }
  }
  const VIEW = { w: 975, h: 610 };
  const ERAS = [[1789, 1815, 'Founding', 'Founding era'], [1815, 1861, 'Antebellum', 'Antebellum'], [1861, 1877, 'Civil War', 'Civil War & Reconstruction'], [1877, 1900, 'Gilded Age', 'Gilded Age'],
    [1900, 1933, 'Progressive', 'Progressive Era'], [1933, 1954, 'New Deal', 'New Deal & World War II'], [1954, 1981, 'Civil Rights', 'Civil Rights era'], [1981, 9999, 'Modern', 'Modern era']];
  const eraOf = y => ERAS.find(e => y >= e[0] && y < e[1]) || ERAS[ERAS.length - 1];

  const el = {
    svg: $('mp-svg'), gFocus: $('mp-g-focus'), gStates: $('mp-g-states'), gShadow: $('mp-g-shadow'), gSel: $('mp-g-sel'), gDist: $('mp-g-dist'), gChg: $('mp-g-chg'), gGhost: $('mp-g-ghost'), gLift: $('mp-g-lift'), gLabels: $('mp-g-labels'),
    wrap: $('mp-mapwrap'), tip: $('mp-tip'), empty: $('mp-empty'), loading: $('mp-loading'), legend: $('mp-legend'), crumbs: $('mp-crumbs'),
    year: $('mp-year'), cong: $('mp-cong'), play: $('mp-play'), chips: $('mp-chips'), track: $('mp-track'), thumb: $('mp-thumb'), flag: $('mp-thumb-flag'),
    fill: $('mp-fill'), ticks: $('mp-ticks'), avail: $('mp-avail'), ghost: $('mp-ghost'), zin: $('mp-zin'), zout: $('mp-zout'),
    panel: $('mp-panel'), pbody: $('mp-panel-body'), ptitle: $('mp-panel-title'), pcontent: $('mp-panel-content'), grip: $('mp-grip'),
    table: $('mp-table'), tableNote: $('mp-table-note'), time: document.querySelector('.mp-time'), modeSeg: $('mp-mode'), bal: $('mp-balance'), tours: $('mp-tours'), tour: $('mp-tour'), cmpBtn: $('mp-cmp'), svg2: $('mp-svg2'), cmpBar: $('mp-cmpbar'), cmpSel: $('mp-cmp-year'), cmpX: $('mp-cmp-x'), cmpDiv: $('mp-cmp-div'), cmpTagA: $('mp-cmp-a'), cmpTagB: $('mp-cmp-b'), share: $('mp-share'), moments: $('mp-moments'), co: $('mp-co'), pcrumbs: $('mp-pcrumbs'), psum: $('mp-panel-sum'), era: $('mp-era'), speed: $('mp-speed'), eras: $('mp-eras'),
    keyCap: $('mp-key-cap'), noteMap: $('mp-note-map'), onboard: $('mp-onboard'), onboardX: $('mp-onboard-x'), live: $('mp-live'), q: $('mp-q'), results: $('mp-results'), sample: $('mp-sample')
  };

  const S = { year: Y1, st: null, d: null, ghost: false, mode: 'h' };      // what the URL holds
  let L = null;                                                 // loader
  let V = {};                                                   // what is drawn now
  let token = 0, drawnNation = null, zoomKey = null, playing = false, playTimer = 0, lastAnnounced = '';

  /* ======================= helpers ======================= */
  const pad3 = n => String(n).padStart(3, '0');
  const stName = st => (L && L.index.states && L.index.states[st] && L.index.states[st].name) || st;
  const congNfor = y => Math.floor((y - 1789) / 2) + 1;
  function votingState(st) { const i = L && L.index.states && L.index.states[st]; if (!i) return true; if ((i.kind || 'state') !== 'state') return false; return !i.admitted || i.admitted <= viewDate(V.c); }
  function congLabel(c, y) {
    if (isElect(c)) return M.ordinal(c.n) + ' Congress-elect · takes office ' + M.fmtDate(c.start);
    if (c) return M.ordinal(c.n) + ' Congress · ' + c.start.slice(0, 4) + '–' + c.end.slice(0, 4);
    const n = congNfor(y), s = 1789 + 2 * (n - 1);
    return M.ordinal(n) + ' Congress · ' + s + '–' + (s + 2);
  }
  function distName(st, d, short) {
    if (String(d) === '0') return short ? st + ' at-large' : stName(st) + ' at-large';
    return short ? st + '-' + d : stName(st) + '’s ' + M.ordinal(+d) + ' district';
  }
  function announce(msg) {
    if (playing || !msg || msg === lastAnnounced) return;
    if (document.activeElement === el.thumb && /^\d{4},/.test(msg)) { lastAnnounced = msg; return; }
    lastAnnounced = msg; el.live.textContent = '';
    setTimeout(() => { el.live.textContent = msg; }, 40);
  }
  function svgEl(tag, attrs) { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function viewDate(c) {           // 1 July of the year, kept inside the Congress
    const d = S.year + '-07-01';
    if (!c) return d;
    if (d < c.start) return c.start;
    if (d >= c.end) return M.iso(M.t(c.end) - 86400000);
    return d;
  }
  function yearWindow(c) {         // the calendar year, clipped to the Congress (for House seats)
    let a = S.year + '-01-01', b = S.year + '-12-31';
    if (c) { if (a < c.start) a = c.start; const e = M.iso(M.t(c.end) - 86400000); if (b > e) b = e; }
    return [a, b];
  }
  const fullYear = () => [S.year + '-01-01', S.year + '-12-31'];

  /* ======================= URL state ======================= */
  function readURL() {
    const q = new URLSearchParams(location.search);
    const y = parseInt(q.get('y'), 10);
    S.year = (y >= Y0 && y <= Y1) ? y : defaultYear();
    const s = (q.get('s') || '').toUpperCase();
    S.st = /^[A-Z]{2}$/.test(s) ? s : null;
    const d = q.get('d');
    S.d = S.st && d != null && /^\d{1,2}$/.test(d) ? String(+d) : null;
    S.ghost = q.get('r') === '1';
    S.mode = /^[hsg]$/.test(q.get('m') || '') ? q.get('m') : 'h';
    S.q = (q.get('q') || '').trim().slice(0, 80) || null;
  }
  function writeURL(mode) {
    const q = new URLSearchParams(location.search);
    ['y', 's', 'd', 'r', 'm'].forEach(k => q.delete(k));
    if (mode === 'push') { V.focusId = null; q.delete('q'); }
    q.set('y', S.year);
    if (S.st) q.set('s', S.st);
    if (S.st && S.d != null) q.set('d', S.d);
    if (S.ghost) q.set('r', '1');
    if (S.mode !== 'h') q.set('m', S.mode);
    const u = location.pathname + '?' + q.toString() + location.hash;
    if (u === location.pathname + location.search + location.hash) return;
    try { history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', u); } catch (e) { /* file:// or sandbox */ }
  }
  function defaultYear() {
    if (!L) return Y1;
    for (let y = Y1; y >= Y0; y--) { const c = L.congressFor(y); if (c && c.geo) return y; }
    return Y1;
  }

  /* ======================= viewBox: fit, animate, pan, pinch ======================= */
  let vb = [0, 0, VIEW.w, VIEW.h], anim = 0, shadow = null, soft = null, labelK = 1, svgW = 700, svgH = 440;
  function measureSvg() { const r = el.svg.getBoundingClientRect(); if (r.width) { svgW = r.width; svgH = r.height; } }
  function aspect() { return svgW > 0 && svgH > 0 ? svgW / svgH : VIEW.w / VIEW.h; }   // cached size (measureSvg on resize): no layout read per render
  function fit(box, padFrac) {
    let [x0, y0, x1, y1] = box;
    const p = padFrac == null ? 0.1 : padFrac;
    let w = x1 - x0, h = y1 - y0;
    const minW = 60; if (w < minW) { x0 -= (minW - w) / 2; w = minW; } if (h < minW / 2) { y0 -= (minW / 2 - h) / 2; h = minW / 2; }
    x0 -= w * p; y0 -= h * p; w *= 1 + 2 * p; h *= 1 + 2 * p;
    const a = aspect();
    if (w / h > a) { const nh = w / a; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * a; x0 -= (nw - w) / 2; w = nw; }
    return [x0, y0, w, h];
  }
  // grow a viewBox so its content sits below a band of topPx screen pixels (the back button and map tools)
  function padTop(v, topPx) {
    if (!svgH || topPx >= svgH - 40) return v;
    const k = svgH / (svgH - topPx), h = v[3] * k, w = h * (v[2] / v[3]);
    return [v[0] - (w - v[2]) / 2, v[1] - (h - v[3]), w, h];
  }
  // the same for a band at the bottom (the compare bar)
  function padBottom(v, botPx) {
    if (!botPx || !svgH || botPx >= svgH - 40) return v;
    const k = svgH / (svgH - botPx), h = v[3] * k, w = h * (v[2] / v[3]);
    return [v[0] - (w - v[2]) / 2, v[1], w, h];
  }
  function setVB(v) {
    vb = v;
    el.svg.setAttribute('viewBox', v.map(n => n.toFixed(2)).join(' '));
    if (el.svg2 && CMP.on) { el.svg2.setAttribute('viewBox', el.svg.getAttribute('viewBox')); const g2 = el.svg2.querySelector('.mp-g-labels'); if (g2) { g2.setAttribute('font-size', el.gLabels.getAttribute('font-size')); g2.setAttribute('stroke-width', el.gLabels.getAttribute('stroke-width')); } }
    const k = v[2] / VIEW.w;               // label size follows the zoom
    el.gLabels.style.setProperty('--k', k.toFixed(4));
    const upp = Math.max(v[2] / svgW, v[3] / svgH);            // user units per screen pixel
    el.gLabels.setAttribute('font-size', ((svgW < 520 ? 9.5 : 11) * upp).toFixed(3));
    el.gLabels.setAttribute('stroke-width', (2.6 * upp).toFixed(3));
    if (!shadow) shadow = document.querySelector('#mp-lift feDropShadow');
    if (shadow) { shadow.setAttribute('dy', (1.4 * k).toFixed(3)); shadow.setAttribute('stdDeviation', (1.8 * k).toFixed(3)); }
    if (!soft) soft = document.querySelector('#mp-soft feGaussianBlur');
    if (soft) soft.setAttribute('stdDeviation', (5 * k).toFixed(3));
    const sh = el.gShadow.firstChild; if (sh) sh.setAttribute('transform', 'translate(0 ' + (3 * k).toFixed(3) + ')');
    labelK = k;
  }
  function animateVB(target, ms) {
    cancelAnimationFrame(anim);
    if (ms && !reduced()) hideCallouts();
    if (reduced() || !ms) { setVB(target); fitLabels(); return; }
    const from = vb.slice(), t0 = performance.now();
    const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    // interpolate in log space for the size so the zoom feels even
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = ease(p);
      const w = Math.exp(Math.log(from[2]) + (Math.log(target[2]) - Math.log(from[2])) * e);
      const a0 = from[2] / from[3], a1 = target[2] / target[3], h = w / (a0 + (a1 - a0) * e);
      const cx = from[0] + from[2] / 2 + ((target[0] + target[2] / 2) - (from[0] + from[2] / 2)) * e;
      const cy = from[1] + from[3] / 2 + ((target[1] + target[3] / 2) - (from[1] + from[3] / 2)) * e;
      setVB([cx - w / 2, cy - h / 2, w, h]);
      if (p < 1) anim = requestAnimationFrame(step); else { setVB(target); fitLabels(); }
    };
    anim = requestAnimationFrame(step);
  }
  // viewBox <-> screen maths (svg-relative pixels), so label work never forces a layout
  function geoXf() {
    const sc = Math.max(vb[2] / svgW, vb[3] / svgH), ox = (svgW * sc - vb[2]) / 2, oy = (svgH * sc - vb[3]) / 2;
    return { sc, toScr: (x, y) => [(x - vb[0] + ox) / sc, (y - vb[1] + oy) / sc], toUser: (x, y) => [vb[0] - ox + x * sc, vb[1] - oy + y * sc] };
  }
  // cached bounding box of a path (cleared whenever its d changes)
  function bbOf(p) { if (!p._bb) p._bb = p.getBBox(); return p._bb; }
  function setD(p, d) { if (p.getAttribute('d') !== d) { p.setAttribute('d', d); p._bb = null; } }
  // while the timeline is dragged or played, labels re-fit once things settle
  let fitT = 0;
  function scheduleFit() { clearTimeout(fitT); if (dragging || playing) fitT = setTimeout(fitLabels, 180); else requestAnimationFrame(fitLabels); }
  // labels: hide those whose shape is too small on screen, then drop any that would overlap a label already placed
  function labelBox(t, X, em) {
    const fsPx = (svgW < 520 ? 9.5 : 11) * em, n = t.textContent.length;
    const [x, y] = X.toScr(+t.getAttribute('x'), +t.getAttribute('y'));
    const w = n * fsPx * 0.62 + 4, h = fsPx + 3;
    return [x - w / 2 - 3, y - h / 2 - 1, x + w / 2 + 3, y + h / 2 + 1];
  }
  function fitLabels() {
    if (!svgW) return;
    const X = geoXf(), pxPer = 1 / X.sc;
    const placed = [];
    const tryPlace = (t, box, keep) => {
      if (!keep && placed.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) { t.classList.add('is-tiny'); return; }
      placed.push(box);
    };
    const dg = el.gLabels.querySelector('.mp-lab-dist');
    if (dg) {
      const items = [];
      for (const t of dg.children) {
        const id = t.getAttribute('data-id'); const p = id && $('mp-d-' + id); if (!p) continue;
        const b = bbOf(p); const sz = Math.min(b.width, b.height * 1.6) * pxPer;
        const sel = t.classList.contains('is-sel');
        t.classList.toggle('is-tiny', !sel && sz < 22);
        items.push([t, b.width * b.height, sel]);
      }
      items.sort((a, b) => (b[2] - a[2]) || b[1] - a[1]);
      items.forEach(([t, , sel]) => { if (!t.classList.contains('is-tiny')) tryPlace(t, labelBox(t, X, sel ? 1.3 : 1.1), sel); });
    }
    const sg = el.gLabels.querySelector('.mp-lab-states');
    if (sg && !S.st) {
      const items = [];
      for (const t of sg.children) {
        const p = $('mp-s-' + t.getAttribute('data-st')); if (!p) continue;
        const b = bbOf(p); const sz = Math.min(b.width, b.height * 1.4) * pxPer;
        t.classList.toggle('is-tiny', sz < 18);
        items.push([t, b.width * b.height]);
      }
      items.sort((a, b) => b[1] - a[1]);
      items.forEach(([t]) => { if (!t.classList.contains('is-tiny')) tryPlace(t, labelBox(t, X, 0.95), false); });
    }
    drawCallouts(sg, placed, X);
    buildDistrictCallouts(placed, X);
    if (CMP.on) fitCmpLabels();
  }
  /* Callouts for districts too small to label at this zoom (city districts at state view).
     Nearby tiny districts form a cluster; each gets a clickable label in a column beside its cluster, joined by a hairline
     leader, and a cluster of 4+ also gets a "Zoom in" chip. On a phone a big cluster gets the chip only (44px targets cannot
     stack that high). The labels are a visual shortcut: every district stays a keyboard button on the map itself. */
  function hideCallouts() { if (el.co) el.co.classList.add('is-hidden'); }
  function buildDistrictCallouts(placed, X) {
    const layer = el.co; if (!layer) return;
    layer.textContent = ''; layer.classList.remove('is-hidden');
    if (!S.st || !V.sgeo) return;
    X = X || geoXf();
    if (V.pin) {
      const [px, py] = X.toScr(V.pin.x, V.pin.y);
      if (px > 0 && py > 0 && px < svgW && py < svgH) {
        const pin = document.createElement('div'); pin.className = 'mp-pinx'; pin.setAttribute('aria-hidden', 'true');
        pin.style.left = px + 'px'; pin.style.top = py + 'px';
        pin.innerHTML = '<i></i><span>' + esc(V.pin.name) + '</span>';
        layer.appendChild(pin);
      }
    }
    const dg = el.gLabels.querySelector('.mp-lab-dist'); if (!dg) return;
    X = X || geoXf();
    const W = svgW, H = svgH, phone = isPhone();
    const dpaths = Array.from(el.gDist.children).filter(p => !p.classList.contains('mp-al'));
    // is this screen point over a district (or the map controls)? geometry only, no layout
    const ctl = (x, y) => y < 56 && (x < 230 || x > W - 300);
    const overDistrict = (x, y) => {
      if (ctl(x, y)) return 6;
      const [ux, uy] = X.toUser(x, y), pt = new DOMPoint(ux, uy);
      for (const p of dpaths) { const b = bbOf(p); if (ux < b.x || uy < b.y || ux > b.x + b.width || uy > b.y + b.height) continue; try { if (p.isPointInFill(pt)) return 1; } catch (e) { return 1; } }
      return 0;
    };
    const colBoxes = [];
    const items = [];
    for (const t of dg.children) {
      if (!t.classList.contains('is-tiny')) continue;
      const id = t.getAttribute('data-id'), p = id && $('mp-d-' + id); if (!p) continue;
      const [x, y] = X.toScr(+t.getAttribute('x'), +t.getAttribute('y'));
      if (x < 24 || y < 60 || x > W - 24 || y > H - 24) continue;              // off screen (or under the controls) after a pan or zoom
      const m = (p.className.baseVal.match(/(?:^|\s)(p-[a-z]+)/) || [0, 'p-none'])[1];
      const lab = t.textContent.replace(/\s+/g, ' ').trim();
      items.push({ id, dn: p.getAttribute('data-d'), x, y, cls: m, lab, sel: p.classList.contains('is-sel') });
    }
    if (!items.length) return;
    // single-link clustering within ~10% of the map width (40-64px); oversized clusters are split again below
    const link = Math.max(36, Math.min(64, W * 0.1));
    let groups = [];
    items.forEach(it => {
      const near = groups.filter(g => g.some(o => Math.hypot(o.x - it.x, o.y - it.y) < link));
      if (!near.length) groups.push([it]);
      else { const g0 = near[0]; g0.push(it); near.slice(1).forEach(g => { g0.push(...g); groups.splice(groups.indexOf(g), 1); }); }
    });
    const span = g => { const xs = g.map(o => o.x), ys = g.map(o => o.y); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); };
    for (let pass = 0; pass < 3; pass++) {
      const out = [];
      groups.forEach(g => {
        if (g.length < 4 || span(g) < Math.min(W, H) * 0.3) { out.push(g); return; }
        // split along the longer axis at the biggest gap
        const xs = g.map(o => o.x), ys = g.map(o => o.y), byX = (Math.max(...xs) - Math.min(...xs)) >= (Math.max(...ys) - Math.min(...ys));
        const srt = g.slice().sort((a, b) => byX ? a.x - b.x : a.y - b.y);
        let cut = 1, best = -1;
        for (let i = 1; i < srt.length; i++) { const d = byX ? srt[i].x - srt[i - 1].x : srt[i].y - srt[i - 1].y; if (d > best) { best = d; cut = i; } }
        out.push(srt.slice(0, cut), srt.slice(cut));
      });
      groups = out;
    }
    const svgNS = 'http://www.w3.org/2000/svg';
    const lines = document.createElementNS(svgNS, 'svg'); lines.setAttribute('class', 'mp-co-lines'); lines.setAttribute('aria-hidden', 'true');
    layer.appendChild(lines);
    groups.forEach(g => {
      layer._col = null;
      const xs = g.map(o => o.x), ys = g.map(o => o.y);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const cy = (by0 + by1) / 2;
      const gap = phone ? 46 : 19;
      const big = g.length >= 4;
      const showLabels = !(phone && g.length > 3) && g.length < 9 && g.length * gap < H - 70;
      if (showLabels) {
        // the column goes where it covers the fewest districts (open water or neighbouring states), nearest first
        g.sort((a, b) => a.y - b.y);
        const bottomPad = phone ? 52 : 16;     // the phone legend floats over the map's bottom edge
        let top = Math.max(phone ? 64 : 56, Math.min(H - bottomPad - (g.length - 1) * gap - 18, cy - (g.length - 1) * gap / 2));
        const cw = phone ? 54 : 44;
        const cands = [[bx1 + 34, 1], [bx1 + 80, 1], [bx1 + 140, 1], [bx0 - 34, 0], [bx0 - 80, 0], [bx0 - 140, 0]]
          .map(([x, r]) => [r ? Math.min(W - cw - 12, x) : Math.max(cw + 12, x), r]);
        const cost = ([x, r]) => {
          let hits = 0;
          for (let i = 0; i < g.length; i++) {
            const yy = top + i * gap;
            for (const dx of [6, cw / 2, cw - 6]) hits += overDistrict(r ? x + dx : x - dx, yy);
          }
          return hits * 100 + Math.abs(r ? x - bx1 : bx0 - x);
        };
        const best = cands.reduce((a, c) => (cost(c) < cost(a) ? c : a));
        const right = !!best[1], colX = best[0];
        // a second cluster's column must not land on an earlier one: move it below (or above) the one it hits
        const colH = (g.length - 1) * gap + 18, x0c = right ? colX : colX - cw, x1c = right ? colX + cw : colX;
        for (let k = 0; k < 4; k++) {
          const hit = colBoxes.find(b => x0c < b[2] && x1c > b[0] && top - 10 < b[3] && top + colH > b[1]);
          if (!hit) break;
          const below = hit[3] + 4, above = hit[1] - colH - 4;
          top = below + colH <= H - bottomPad ? below : Math.max(phone ? 64 : 56, above);
        }
        layer._col = { x: colX, right, top, end: top + (g.length - 1) * gap };
        colBoxes.push(right ? [colX, top - 10, colX + cw, top + g.length * gap] : [colX - cw, top - 10, colX, top + g.length * gap]);
        g.forEach((o, i) => {
          const ly = top + i * gap;
          const b = document.createElement('button');
          b.type = 'button'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true');
          b.className = 'mp-co ' + o.cls + (right ? ' is-r' : ' is-l') + (o.sel ? ' is-sel' : '');
          b.dataset.d = o.dn; b.textContent = o.lab;
          b.style.top = ly + 'px';
          if (right) b.style.left = colX + 'px'; else b.style.right = (W - colX) + 'px';
          layer.appendChild(b);
          const ln = document.createElementNS(svgNS, 'path');
          ln.setAttribute('d', 'M' + o.x.toFixed(1) + ',' + o.y.toFixed(1) + 'L' + (colX + (right ? -4 : 4)).toFixed(1) + ',' + ly.toFixed(1));
          ln.setAttribute('class', 'mp-co-line' + (o.sel ? ' is-sel' : ''));
          lines.appendChild(ln);
          const dot = document.createElementNS(svgNS, 'circle');
          dot.setAttribute('cx', o.x.toFixed(1)); dot.setAttribute('cy', o.y.toFixed(1)); dot.setAttribute('r', '1.8'); dot.setAttribute('class', 'mp-co-dot');
          lines.appendChild(dot);
        });
      }
      if (big) {
        const z = document.createElement('button');
        z.type = 'button'; z.className = 'mp-co-zoom';
        z.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.4 10.4L14 14M7 5v4M5 7h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>' + (phone ? '+' + g.length : g.length + ' districts');
        if (phone) z.classList.add('is-badge');
        z.setAttribute('aria-label', 'Zoom in: ' + g.length + ' districts');
        let zx, zy;
        if (phone && !layer._col) {
          // on a phone the badge sits on the ring, on the side with the most room
          const rr1 = Math.max(10, Math.hypot(bx1 - bx0, by1 - by0) / 2 + 7), cx1 = (bx0 + bx1) / 2, cy1 = (by0 + by1) / 2;
          const opts = [[cx1 + rr1 * 0.71, cy1 + rr1 * 0.71], [cx1 - rr1 * 0.71, cy1 + rr1 * 0.71], [cx1 + rr1, cy1], [cx1 - rr1, cy1], [cx1, cy1 + rr1]]
            .map(([x, y]) => [Math.max(34, Math.min(W - 34, x)), Math.max(104, Math.min(H - 12, y + 20))]);
          [zx, zy] = opts.reduce((b, c) => (overDistrict(c[0], c[1] - 20) < overDistrict(b[0], b[1] - 20) ? c : b));
        }
        else if (layer._col) {
          zx = Math.max(60, Math.min(W - 60, layer._col.right ? layer._col.x + 40 : layer._col.x - 40)); zy = layer._col.top - (phone ? 26 : 14);
          if (zy - (phone ? 44 : 28) < 56) zy = layer._col.end + (phone ? 70 : 42);      // no room above (map controls): put it under the column
        }
        else {
          // try spots around the cluster; keep the one over open water or a neighbouring state
          const cxm = (bx0 + bx1) / 2, hw = phone ? 80 : 60;
          const rr0 = Math.hypot(bx1 - bx0, by1 - by0) / 2 + 7;
          const spots = [[bx1 + hw + 16 + rr0 / 2, (by0 + by1) / 2 + 20], [cxm + hw, by1 + 54 + rr0 / 2], [cxm, by1 + 58 + rr0 / 2], [bx0 - hw - 16 - rr0 / 2, (by0 + by1) / 2 + 20], [cxm, by0 - 30 - rr0 / 2], [bx1 + hw + 30, by1 + 50], [bx0 - hw - 30, by1 + 50]]
            .map(([x, y]) => [Math.max(hw + 8, Math.min(W - hw - 8, x)), Math.max(phone ? 108 : 84, Math.min(H - 10, y))]);
          const ringR = Math.max(10, Math.hypot(bx1 - bx0, by1 - by0) / 2 + 7), rcx = (bx0 + bx1) / 2, rcy = (by0 + by1) / 2;
          const hitsAt = ([x, y]) => { let n = Math.hypot(x - rcx, y - 14 - rcy) < ringR + 26 ? 20 : 0; for (const dx of [-hw * 0.8, 0, hw * 0.8]) for (const dy of [-18, -6]) { const px = x + dx, py = y + dy; n += overDistrict(px, py) + (colBoxes.some(b => px > b[0] && px < b[2] && py > b[1] && py < b[3]) ? 1 : 0); } return n; };
          const near = [[rcx + ringR + hw * 0.55, rcy + 18], [rcx - ringR - hw * 0.55, rcy + 18], [rcx, rcy + ringR + 40], [rcx, rcy - ringR - 8]].map(([x, y]) => [Math.max(hw + 8, Math.min(W - hw - 8, x)), Math.max(phone ? 108 : 84, Math.min(H - 10, y))]);
          const costAt = c => hitsAt(c) * 10 + Math.hypot(c[0] - rcx, c[1] - rcy) / 60;
          [zx, zy] = near.concat(spots).reduce((b, c) => (costAt(c) < costAt(b) ? c : b));
        }
        z.style.left = zx + 'px'; z.style.top = zy + 'px';
        // a dashed ring marks the cluster; a short leader ties it to its chip
        const ccx = (bx0 + bx1) / 2, ccy = (by0 + by1) / 2, rr = Math.max(10, Math.hypot(bx1 - bx0, by1 - by0) / 2 + 7);
        const ring = document.createElementNS(svgNS, 'circle');
        ring.setAttribute('cx', ccx.toFixed(1)); ring.setAttribute('cy', ccy.toFixed(1)); ring.setAttribute('r', rr.toFixed(1)); ring.setAttribute('class', 'mp-co-ring');
        lines.appendChild(ring);
        if (!layer._col && !phone) {
          const ty = zy - (phone ? 22 : 14), d = Math.hypot(zx - ccx, ty - ccy);
          if (d > rr + 6) { const ux = (zx - ccx) / d, uy = (ty - ccy) / d; const ln = document.createElementNS(svgNS, 'path'); ln.setAttribute('d', 'M' + (ccx + ux * rr).toFixed(1) + ',' + (ccy + uy * rr).toFixed(1) + 'L' + zx.toFixed(1) + ',' + ty.toFixed(1)); ln.setAttribute('class', 'mp-co-line'); lines.appendChild(ln); }
        }
        z._box = g.map(o => o.id);
        layer.appendChild(z);
      }
    });
  }
  // zoom to the bounding box of a cluster's districts
  function zoomToIds(ids) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ids.forEach(id => { const p = $('mp-d-' + id); if (!p) return; const b = p.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
    if (!isFinite(x0)) return;
    zoomKey = 'cluster';
    animateVB(clampVB(fit([x0, y0, x1, y1], 0.12)), 650);
  }
  if (el.co) el.co.addEventListener('click', e => {
    const z = e.target.closest('.mp-co-zoom'); if (z) { zoomToIds(z._box || []); return; }
    const b = e.target.closest('.mp-co'); if (!b) return;
    const p = $('mp-d-' + S.st + '-' + b.dataset.d); if (p) activate(p, e);
  });
  // NYT-style callouts: small East Coast states that lost their label get one in the Atlantic margin, with a hairline leader
  function drawCallouts(sg, placed, X) {
    let g = el.gLabels.querySelector('.mp-callouts');
    if (g) g.textContent = '';
    if (!sg || S.st || !V.nation) return;
    const fs0 = parseFloat(el.gLabels.getAttribute('font-size')) || 11;
    const list = [];
    for (const t of sg.children) {
      if (!t.classList.contains('is-tiny')) continue;
      const x = +t.getAttribute('x'), y = +t.getAttribute('y');
      if (x < 780 || y > 420) continue;                     // East Coast only (not the territory insets)
      list.push({ st: t.getAttribute('data-st'), x, y });
    }
    if (!list.length) return;
    if (!g) { g = svgEl('g', { class: 'mp-callouts' }); el.gLabels.appendChild(g); }
    list.sort((a, b) => a.y - b.y);
    const gap = fs0 * 1.25, cx = Math.min(VIEW.w - fs0 * 1.6, vb[0] + vb[2] - fs0 * 2.2);
    let last = -Infinity;
    list.forEach(o => { o.ty = Math.max(o.y, last + gap); last = o.ty; });
    const over = last - list[list.length - 1].y;           // pull the stack back up if it ran long
    if (over > 0) list.forEach(o => { o.ty -= over / 2; });
    list.forEach(o => {
      const p = $('mp-s-' + o.st);
      const cls = p ? (p.className.baseVal.match(/(?:^|\s)(p-[a-z]+)/) || [0, 'p-none'])[1] : 'p-none';
      g.appendChild(svgEl('path', { d: 'M' + o.x.toFixed(1) + ',' + o.y.toFixed(1) + 'L' + (cx - fs0 * 0.5).toFixed(1) + ',' + o.ty.toFixed(1), class: 'mp-leader' }));
      g.appendChild(svgEl('circle', { cx: o.x.toFixed(1), cy: o.y.toFixed(1), r: (fs0 * 0.14).toFixed(2), class: 'mp-leader-dot' }));
      const t = svgEl('text', { x: cx.toFixed(1), y: o.ty.toFixed(1), class: 'mp-callout ' + cls });
      t.textContent = o.st; g.appendChild(t);
      // a callout that would sit on a placed label (e.g. Maine on a phone) is dropped with its leader
      if (X && placed) { const [sx, sy] = X.toScr(cx, o.ty), fsPx = svgW < 520 ? 8.6 : 10, b = [sx, sy - fsPx / 2, sx + fsPx * 1.3, sy + fsPx / 2];
        if (placed.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) { t.remove(); g.lastChild.remove(); g.lastChild.remove(); } }
    });
  }
  function clampVB(v) {
    const a = v[2] / v[3];
    let w = Math.max(VIEW.w / 70, Math.min(VIEW.w * 1.25, v[2]));
    const h = w / a;
    let x = v[0] + (v[2] - w) / 2, y = v[1] + (v[3] - h) / 2;
    x = Math.max(-w * 0.6, Math.min(VIEW.w - w * 0.4, x));
    y = Math.max(-h * 0.6, Math.min(VIEW.h - h * 0.4, y));
    return [x, y, w, h];
  }
  function toSvg(cx, cy) { const r = el.svg.getBoundingClientRect(); const s = Math.max(vb[2] / r.width, vb[3] / r.height); const ox = (r.width * s - vb[2]) / 2, oy = (r.height * s - vb[3]) / 2; return [vb[0] - ox + (cx - r.left) * s, vb[1] - oy + (cy - r.top) * s, s]; }
  let userZoomAt = -1e9;      // a zoom the user just made (double tap, pinch, wheel, buttons) wins over automatic framing
  function zoomAt(px, py, factor, ms) {
    userZoomAt = performance.now();
    const nw = vb[2] * factor, nh = vb[3] * factor;
    const t = clampVB([px - (px - vb[0]) * factor, py - (py - vb[1]) * factor, nw, nh]);
    animateVB(t, ms);
  }
  function zoomCenter(f) { zoomAt(vb[0] + vb[2] / 2, vb[1] + vb[3] / 2, f, 320); }
  function zoomToCurrent(force) {
    // a small selected district gets a gentle zoom (the state stays in view around it)
    let dbox = null;
    if (S.st && V.sgeo && S.d != null) {
      const dp = $('mp-d-' + S.st + '-' + S.d), sb = V.sgeo.box;
      if (dp && sb) { const b = dp.getBBox(); const ratio = Math.max(b.width / (sb[2] - sb[0]), b.height / (sb[3] - sb[1])); if (ratio < 0.2) { const cx = b.x + b.width / 2, cy = b.y + b.height / 2, hw = Math.max(b.width * 1.2, (sb[2] - sb[0]) * 0.24), hh = Math.max(b.height * 1.2, (sb[3] - sb[1]) * 0.24); dbox = [cx - hw, cy - hh, cx + hw, cy + hh]; } }
    }
    const key = (S.st && (V.sgeo || V.outlineOnly) ? S.st + (dbox ? '-' + S.d : '') : 'US' + el.gStates.querySelectorAll('.mp-st').length) + '|' + Math.round(aspect() * 100);
    if (!force && key === zoomKey) return;
    if (!force && zoomKey !== null && performance.now() - userZoomAt < 800) { zoomKey = key; return; }
    if (!force && zoomKey === 'cluster' && S.st && V.sgeo && key.indexOf(S.st) === 0) { zoomKey = 'cluster'; return; }
    const first = zoomKey === null;
    zoomKey = key;
    if (dbox) animateVB(fit(dbox, 0.08), first ? 0 : 720);
    else if (S.st && V.outlineOnly) animateVB(padTop(fit(bboxOf(S.st), 0.12), isPhone() ? 58 : 50), first ? 0 : 720);
    else if (S.st && V.sgeo) animateVB(padBottom(padTop(fit(V.sgeo.box || bboxOf(S.st), isPhone() ? 0.06 : 0.1), isPhone() ? 58 : 50), CMP.on ? (isPhone() ? 120 : 30) : S.ghost ? 44 : (isPhone() ? 28 : 0)), first ? 0 : 720);
    else {
      let b = [0, 0, VIEW.w, VIEW.h];
      const ps = Array.from(el.gStates.querySelectorAll('.mp-st'));
      if (ps.length) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; ps.forEach(p => { const r = bbOf(p); if (!r.width) return; x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.height); }); if (isFinite(x0)) b = [x0, y0, x1, y1]; }
      animateVB(padTop(fit(b, 0.03), isPhone() ? 54 : 40), first ? 0 : 640);
    }
  }
  function bboxOf(st) { const p = $('mp-s-' + st); if (!p) return [0, 0, VIEW.w, VIEW.h]; const b = p.getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height]; }

  // pointer gestures: drag pans, two fingers pinch, double tap zooms in
  const ptrs = new Map();
  let gesture = null, suppressClick = false, lastTap = null, lastPtrType = 'mouse';
  el.svg.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastPtrType = e.pointerType;
    if (ptrs.size === 1) gesture = { moved: false, sx: e.clientX, sy: e.clientY, type: e.pointerType };
    else if (ptrs.size === 2) gesture = Object.assign(gesture || {}, { moved: true, pinch: pinchState() });
    cancelAnimationFrame(anim);
  });
  function pinchState() { const [a, b] = Array.from(ptrs.values()); return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  window.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size >= 2) {
      const p0 = gesture.pinch, p1 = pinchState();
      if (p0 && p0.d > 0) {
        const [sx, sy] = toSvg(p0.mx, p0.my);
        const f = p0.d / Math.max(1, p1.d);
        let t = [sx - (sx - vb[0]) * f, sy - (sy - vb[1]) * f, vb[2] * f, vb[3] * f];
        const s = toSvg(0, 0)[2] * f;
        t[0] -= (p1.mx - p0.mx) * s; t[1] -= (p1.my - p0.my) * s;
        setVB(clampVB(t)); userZoomAt = performance.now();
      }
      gesture.pinch = p1; hideTip(); hideCallouts();
      return;
    }
    if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) < 7) return;
    gesture.moved = true; el.wrap.classList.add('is-panning'); hideTip(); hideCallouts();
    const s = toSvg(0, 0)[2];
    setVB(clampVB([vb[0] - (e.clientX - prev.x) * s, vb[1] - (e.clientY - prev.y) * s, vb[2], vb[3]]));
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 1 && gesture) { gesture.pinch = null; const p = Array.from(ptrs.values())[0]; gesture.sx = p.x; gesture.sy = p.y; }
    if (ptrs.size) return;
    el.wrap.classList.remove('is-panning');
    if (gesture && gesture.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 60); fitLabels(); }
    else if (gesture && gesture.type === 'touch' && e.type === 'pointerup') {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        clearTimeout(tapTimer); suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
        const [x, y] = toSvg(e.clientX, e.clientY); zoomAt(x, y, 0.5, 280); lastTap = null;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    gesture = null;
  }
  window.addEventListener('pointerup', endPtr);
  window.addEventListener('pointercancel', endPtr);
  el.svg.addEventListener('dblclick', e => { if (e.pointerType === 'touch') return; const [x, y] = toSvg(e.clientX, e.clientY); zoomAt(x, y, 0.5, 300); });
  el.svg.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;          // plain wheel scrolls the page; pinch on a trackpad arrives as ctrl+wheel
    e.preventDefault();
    const [x, y] = toSvg(e.clientX, e.clientY);
    zoomAt(x, y, Math.exp(e.deltaY * 0.01), 0);
  }, { passive: false });
  el.zin.addEventListener('click', () => zoomCenter(0.6));
  el.zout.addEventListener('click', () => zoomCenter(1 / 0.6));

  /* ======================= map drawing ======================= */
  function partyClass(p) { return 'p-' + M.partyKey(p); }
  function majority(counts) {
    if (!counts) return null;
    let best = null, bn = -1, tie = false;
    for (const [p, n] of Object.entries(counts)) { if (n > bn) { best = p; bn = n; tie = false; } else if (n === bn) tie = true; }
    return tie ? null : best;
  }
  function delegationText(counts) {
    if (!counts) return '';
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, n]) => n + ' ' + M.partyName(p)).join(', ');
  }

  // states are updated in place (keyed by code) so a year change cross-fades colours instead of flashing
  let drawnSummary = null, drawnMode = '';
  // what colours a state at nation view: its House delegation, its two senators, or its governor
  function modeCounts(st, summary) {
    if (S.mode === 's') return summary && summary.senate && summary.senate[st] || null;
    if (S.mode === 'g') { const p = V.gov && V.gov[st]; return p ? { [p]: 1 } : null; }
    return summary && summary.house && summary.house[st] || null;
  }
  function shareOf(counts, maj) { if (!counts || !maj) return 0; const tot = Object.values(counts).reduce((a, b) => a + b, 0); return tot ? counts[maj] / tot : 0; }
  function isDRtie(counts) { if (!counts) return false; const d = counts.Democrat || 0, r = counts.Republican || 0; return d > 0 && d === r && Object.values(counts).every(n => n <= d); }
  function drawNation(c, nation, summary) {
    const modeKey = S.mode + (S.mode === 'g' ? '|' + (V.govKey || '') : '');
    if (drawnNation === nation && drawnSummary === summary && drawnMode === modeKey) { markStates(); return; }
    drawnNation = nation; drawnSummary = summary; drawnMode = modeKey;
    if (!el.gStates.querySelector('.mp-inset')) {
      const insets = L.index.view && L.index.view.insets;
      if (insets) (Array.isArray(insets) ? insets : Object.values(insets)).forEach(b => { if (Array.isArray(b) && b.length === 4) el.gStates.insertBefore(svgEl('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], rx: 3, class: 'mp-inset', 'aria-hidden': 'true' }), el.gStates.firstChild); });
    }
    let sl = el.gLabels.querySelector('.mp-lab-states');
    if (!sl) { sl = svgEl('g', { class: 'mp-lab-states' }); el.gLabels.insertBefore(sl, el.gLabels.firstChild); }
    const ids = Object.keys(nation.states).sort((a, b) => stName(a).localeCompare(stName(b)));
    const keep = new Set(ids);
    for (const p of Array.from(el.gStates.querySelectorAll('.mp-st'))) if (!keep.has(p.getAttribute('data-st'))) p.remove();
    for (const t of Array.from(sl.children)) if (!keep.has(t.getAttribute('data-st'))) t.remove();
    let added = false;
    const fresh = [];
    for (const st of ids) {
      const s0 = nation.states[st];
      const counts = modeCounts(st, summary);
      const maj = majority(counts), tie = isDRtie(counts);
      let share = shareOf(counts, maj);
      if (S.mode === 's' && counts) share = (counts[maj] || 0) / 2;          // a seat vacant: lean, both seats: solid
      const seats = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
      let p = $('mp-s-' + st);
      if (!p) { p = svgEl('path', { id: 'mp-s-' + st, 'data-st': st, tabindex: '0', role: 'button' }); el.gStates.appendChild(p); added = true; fresh.push(st); }
      setD(p, s0.d);
      // shade by the size of the majority: a bare majority is pale, a sweep is full colour
      const step = !maj ? 0 : share >= 0.75 ? 3 : share >= 0.6 ? 2 : 1;            // lean, likely, solid
      const mix = [0, 52, 76, 100][step];
      const mixed = !maj && !tie && counts && Object.keys(counts).length > 1;    // e.g. one Democrat and one independent
      p.setAttribute('class', 'mp-st ' + (tie ? 'p-tie' : maj ? partyClass(maj) + ' is-tint' : mixed ? 'p-oth is-tint' : 'p-none'));
      if (mixed) p.style.setProperty('--mix', '76%');
      if (maj) p.style.setProperty('--mix', mix + '%'); else p.style.removeProperty('--mix');
      const what = S.mode === 'g' ? (maj ? ': governor, ' + M.partyName(maj) : '') : seats ? ': ' + seats + (S.mode === 's' ? (seats === 1 ? ' senator, ' : ' senators, ') : (seats === 1 ? ' seat, ' : ' seats, ')) + delegationText(counts) : '';
      p.setAttribute('aria-label', stName(st) + what);
      p._info = { kind: 'st', st, title: stName(st), counts, seats, tie, mode: S.mode };
      if (s0.label) {
        let t = sl.querySelector('[data-st="' + st + '"]');
        if (!t) { t = svgEl('text', { 'data-st': st }); t.textContent = st; sl.appendChild(t); }
        t.setAttribute('x', s0.label[0]); t.setAttribute('y', s0.label[1]);
        const tiny = false, hid = t.classList.contains('is-hidden');
        t.setAttribute('class', 'mp-lab mp-lab-st' + (maj && mix >= 70 ? ' ' + partyClass(maj) : ' off-tint') + (tiny ? ' is-tiny' : '') + (hid ? ' is-hidden' : ''));
      }
    }
    if (added) ids.forEach(st => { const p = $('mp-s-' + st); if (p) el.gStates.appendChild(p); });   // keep the tab order alphabetical
    // hide labels of states too small to hold them at nation scale
    if (fresh.length) scheduleFit();
    V.nationIds = ids;
    markStates();
  }
  function markStates() {
    const redrawn = new Set();
    if (S.ghost && V.changes && V.c) for (const [st, list] of Object.entries(V.changes)) if (Array.isArray(list) && list.indexOf(V.c.n) >= 0) redrawn.add(st);
    for (const p of el.gStates.children) {
      const st = p.getAttribute('data-st'); if (!st) continue;
      p.classList.toggle('is-sel', st === S.st && !!V.sgeo);
      p.classList.toggle('is-dim', !!S.st && st !== S.st);
      p.classList.toggle('is-redrawn', !S.st && redrawn.has(st));
      p.classList.toggle('is-unseated', !!(V.c && (V.c.outlineOnly || []).indexOf(st) >= 0));
    }
    for (const t of el.gLabels.querySelectorAll('.mp-lab-st')) t.classList.toggle('is-hidden', !!S.st);
    if (!S.st) el.gChg.textContent = '';
    if (!S.st && S.ghost) for (const st of redrawn) { const p = $('mp-s-' + st); if (p) el.gChg.appendChild(svgEl('path', { d: p.getAttribute('d'), class: 'mp-chg' })); }
    V.redrawn = redrawn;
    if (!S.st || !V.sgeo) rove();
  }

  function districtsOf(sgeo) {
    return Object.keys(sgeo.districts).sort((a, b) => (+a.split('-')[1]) - (+b.split('-')[1]));
  }
  function seatInfo(dnum) {          // segments for a district in the selected year and Congress
    const P = V.people; if (!P) return null;
    const keys = M.seatKeys(P.house, dnum);
    const [a, b] = yearWindow(V.c), vd = viewDate(V.c);
    const all = keys.map(k => ({ key: k, list: (P.house || {})[k] || [], segs: M.segments((P.house || {})[k] || [], a, b, vd) }));
    // extra seats ("5b", "0b") count only in years someone held them (early multi-member districts)
    const held = all.filter(x => x.segs.some(sg => !sg.vacant));
    const used = all.filter((x, i) => (i === 0 && (held.length === 0 || held.indexOf(x) >= 0 || all.length === 1)) || held.indexOf(x) >= 0);
    return used.length ? used : (held.length ? held : all.slice(0, 1));
  }
  function primaryOf(info) { if (!info || !info.length) return null; const s = info[0].segs.find(x => x.primary); return s || null; }

  function drawDistricts() {
    lift(null); hideTip();
    el.gGhost.textContent = '';
    const old = el.gLabels.querySelector('.mp-lab-dist'); if (old) old.remove();
    if (!S.st || !V.sgeo) { el.gDist.textContent = ''; el.gDist.removeAttribute('data-st'); el.noteMap.hidden = true; drawSelection(); markStates(); return; }
    const sg = V.sgeo, ids = districtsOf(sg);
    // the same state with a new set of lines (redistricting): the old map fades out over the new one
    if (el.gDist.getAttribute('data-st') === S.st && el.gDist._sg && el.gDist._sg !== sg && !reduced() && el.gDist.children.length) {
      const oldH = Object.values(el.gDist._sg.districts).map(x => x.h || x.d).join('|'), newH = Object.values(sg.districts).map(x => x.h || x.d).join('|');
      if (oldH !== newH) {
        const prevX = el.svg.querySelector('.mp-xfade'); if (prevX) prevX.remove();
        const xf = el.gDist.cloneNode(true);
        xf.removeAttribute('id'); xf.setAttribute('class', 'mp-xfade'); xf.setAttribute('aria-hidden', 'true');
        xf.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); xf.querySelectorAll('[tabindex]').forEach(n => n.removeAttribute('tabindex'));
        el.gDist.parentNode.insertBefore(xf, el.gDist.nextSibling);
        const a = xf.animate([{ opacity: 1 }, { opacity: 0 }], { duration: playing ? 380 : 520, easing: 'cubic-bezier(.4,0,.2,1)' });
        a.onfinish = () => xf.remove();
      }
    }
    el.gDist._sg = sg;
    // same state as before: update paths in place so party colours cross-fade between years
    if (el.gDist.getAttribute('data-st') !== S.st) { el.gDist.textContent = ''; el.gDist.setAttribute('data-st', S.st); el.gDist.classList.remove('is-in'); void el.gDist.getBoundingClientRect(); el.gDist.classList.add('is-in'); }
    const keepIds = new Set(ids.map(id => 'mp-d-' + id));
    for (const p of Array.from(el.gDist.children)) if (!keepIds.has(p.id)) p.remove();
    const dl = svgEl('g', { class: 'mp-lab-dist' });
    const changed = V.changed || {};
    const mixed = ids.length > 1 && !!sg.districts[S.st + '-0'];   // at-large seat(s) next to numbered districts: outline only
    const order = [], overlay = [];
    for (const id of ids) {
      const dn = id.split('-')[1], g = sg.districts[id];
      const isAL = mixed && dn === '0';
      const info = seatInfo(dn), pr = primaryOf(info);
      const plural = info && info.length > 1;
      const party = pr && !pr.vacant ? pr.party : null;
      const cls = 'mp-d ' + (isAL ? 'mp-al ' : '') + (pr ? (pr.vacant ? 'p-vac' : partyClass(party)) : 'p-none') + (String(dn) === S.d ? ' is-sel' : '') + (changed[id] && !isAL ? ' is-changed' : '');
      let p = $('mp-d-' + id);
      if (!p) p = svgEl('path', { id: 'mp-d-' + id, 'data-d': dn, tabindex: '0', role: 'button' });
      setD(p, g.d);
      p.setAttribute('class', cls);
      const who = pr ? (pr.vacant ? (isElect(V.c) ? 'Race not yet called' : 'Vacant') : (personName(pr.id) + ', ' + M.partyName(party))) : 'No data';
      p.setAttribute('aria-label', distName(S.st, dn) + ': ' + (plural ? info.length + ' at-large seats' : who) + (changed[id] ? '. Lines changed this Congress' : ''));
      if (S.d != null && String(dn) === S.d) p.setAttribute('aria-pressed', 'true'); else p.removeAttribute('aria-pressed');
      p._info = { kind: 'd', title: String(dn) === '0' ? stName(S.st) + ' at-large' : distName(S.st, dn), short: distName(S.st, dn, true), who: plural ? info.length + ' seats elected statewide' : (pr ? (pr.vacant ? (isElect(V.c) ? 'Race not yet called' : 'Vacant') : personName(pr.id)) : 'No data'), party, id: pr && !pr.vacant && !plural ? pr.id : null };
      (isAL ? overlay : order).push(p);
      if (!isAL && g.label) {
        const t = svgEl('text', { x: g.label[0], y: g.label[1], 'data-id': id, class: 'mp-lab mp-lab-d' + (String(dn) === S.d ? ' is-sel' : '') + (!pr || pr.vacant ? ' off-tint' : ' ' + partyClass(party)) });
        const n1 = svgEl('tspan', { class: 'mp-lab-n' }); n1.textContent = String(dn) === '0' ? 'AL' : dn;
        t.appendChild(n1);
        if (pr) { const n2 = svgEl('tspan', { class: 'mp-lab-p', dx: '0.18em' }); n2.textContent = plural ? '×' + info.length : (pr.vacant ? '–' : M.partyLetter(party)); t.appendChild(n2); }
        dl.appendChild(t);
      }
    }
    order.concat(overlay).forEach((p, i) => { if (el.gDist.children[i] !== p) el.gDist.insertBefore(p, el.gDist.children[i] || null); });
    el.gLabels.appendChild(dl);
    scheduleFit();
    // previous lines are drawn only where they differ from this Congress's lines
    const anyChange = Object.values(changed).some(Boolean);
    el.noteMap.hidden = !(S.ghost && V.prev && !anyChange);
    el.noteMap.textContent = 'No line changes since the ' + M.ordinal(V.c.n - 1) + ' Congress';
    if (S.ghost && V.prev && anyChange) {
      const pids = Object.keys(V.prev.districts), pmixed = pids.length > 1;
      const curH = new Set(Object.values(sg.districts).map(x => x.h || x.d));
      for (const id of pids) if (!(pmixed && /-0$/.test(id)) && !curH.has(V.prev.districts[id].h || V.prev.districts[id].d)) el.gGhost.appendChild(svgEl('path', { d: V.prev.districts[id].d, class: 'mp-ghostline' }));
      if (!reduced()) { el.gGhost.classList.remove('is-anim'); void el.gGhost.getBoundingClientRect(); el.gGhost.classList.add('is-anim'); }
    }
    el.gChg.textContent = '';
    if (S.ghost) for (const id of ids) if (changed[id] && !(mixed && /-0$/.test(id))) el.gChg.appendChild(svgEl('path', { d: sg.districts[id].d, class: 'mp-chg' }));
    drawSelection();
    markStates();
    rove();
  }
  // soft shadow under the open state and a glow ring around the chosen district
  function drawSelection() {
    el.gShadow.textContent = ''; el.gSel.textContent = '';
    if (!S.st) return;

    // (no drop shadow: water holes in districts would show it through)
    if (S.d != null && V.sgeo) {
      const dp = $('mp-d-' + S.st + '-' + S.d);
      if (dp) { el.gSel.appendChild(svgEl('path', { d: dp.getAttribute('d'), class: 'mp-sel-halo' })); el.gSel.appendChild(svgEl('path', { d: dp.getAttribute('d'), class: 'mp-sel-line' })); }
    }
  }
  function personName(id) { const b = V.bios && V.bios[id]; return b ? b.name : (id || 'Unknown'); }

  // hover lift + tooltip
  let liftUse = null;
  function lift(p) {
    if (!liftUse) { liftUse = svgEl('use', { class: 'mp-liftuse' }); el.gLift.appendChild(liftUse); }
    if (!p || (p.classList.contains('mp-st') && S.st === p.getAttribute('data-st')) || (p.classList.contains('mp-d') && p.classList.contains('is-sel'))) { liftUse.removeAttribute('href'); el.gLift.classList.remove('on'); return; }
    liftUse.setAttribute('href', '#' + p.id);
    liftUse.setAttribute('class', 'mp-liftuse ' + (p.className.baseVal.match(/(?:^|\s)(p-[a-z]+)/) || [0, 'p-none'])[1]);
    el.gLift.classList.add('on');
  }
  function showTip(p, x, y) {
    if (!p || !p._info) return hideTip();
    const i = p._info;
    let h;
    if (i.kind === 'st') {
      const c = i.counts;
      const bar = c && i.seats ? '<span class="mp-tip-bar" aria-hidden="true">' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([pp, n]) => '<i class="' + partyClass(pp) + '" style="flex:' + n + '"></i>').join('') + '</span>' : '';
      const lead = i.mode === 'g' ? 'Governor · ' : i.mode === 's' ? 'Senate · ' : i.seats + (i.seats === 1 ? ' seat · ' : ' seats · ');
      h = '<span class="mp-tip-t">' + esc(i.title) + '</span>' + (c ? '<span class="mp-tip-s">' + esc(lead + (i.mode === 'g' ? M.partyName(Object.keys(c)[0]) : delegationText(c))) + '</span>' + (i.mode === 'g' ? '' : bar) : '');
    } else {
      const b = i.id && V.bios && V.bios[i.id];
      const src = b && b.photo ? L.asset(b.photo) : null;
      h = (src ? '<img class="mp-tip-img" src="' + esc(src) + '" alt="">' : '') + '<span class="mp-tip-txt"><span class="mp-tip-k">' + esc(i.short) + '</span><span class="mp-tip-t">' + esc(i.who) + '</span>' +
        (i.party ? '<span class="mp-tip-p ' + partyClass(i.party) + '"><i></i>' + esc(M.partyName(i.party)) + '</span>' : '') + '</span>';
    }
    if (el.tip._h !== h) { el.tip.innerHTML = h; el.tip._h = h; }
    el.tip.classList.toggle('has-img', !!el.tip.querySelector('img'));
    const r = el.wrap.getBoundingClientRect(), tw = el.tip.offsetWidth || 180;
    el.tip.style.left = Math.min(r.width - tw / 2 - 8, Math.max(tw / 2 + 8, x - r.left)) + 'px';
    el.tip.style.top = Math.max(8, y - r.top) + 'px';
    el.tip.classList.toggle('below', y - r.top < 90);
    el.tip.classList.add('on');
  }
  function hideTip() { el.tip.classList.remove('on'); }
  const shapeOf = t => t && t.closest && t.closest('.mp-st,.mp-d');
  el.svg.addEventListener('pointerover', e => { const p = shapeOf(e.target); if (p && e.pointerType !== 'touch') lift(p); });
  el.svg.addEventListener('pointerout', e => { const p = shapeOf(e.target); if (p && !p.contains(e.relatedTarget)) { lift(null); hideTip(); } });
  el.svg.addEventListener('pointermove', e => { if (e.pointerType === 'touch' || gesture && gesture.moved) return; const p = shapeOf(e.target); if (p) showTip(p, e.clientX, e.clientY); });
  function focusRing(p) {
    el.gFocus.textContent = '';
    if (!p) return;
    ['mp-ring-out', 'mp-ring-in'].forEach(c => { const u = svgEl('use', { class: c }); u.setAttribute('href', '#' + p.id); el.gFocus.appendChild(u); });
  }
  el.svg.addEventListener('focusout', () => focusRing(null));
  el.svg.addEventListener('focusin', e => { const p = shapeOf(e.target); if (!p || !p.matches(':focus-visible')) return; lift(p); focusRing(p); const b = p.getBoundingClientRect(); showTip(p, b.left + b.width / 2, b.top + Math.min(b.height / 2, 40)); });
  el.svg.addEventListener('focusout', () => { lift(null); hideTip(); });

  function activate(p, ev) {
    if (!p) return;
    lift(null); hideTip();
    if (p.classList.contains('mp-st')) {
      const st = p.getAttribute('data-st');
      if (st === S.st && V.sgeo) return;
      selectState(st);
      if (!ev) refocus = 'first-district';
    } else if (p.classList.contains('mp-d')) {
      const dn = p.getAttribute('data-d');
      S.d = S.d === dn ? null : dn;
      writeURL('push'); render();
      if (ev && ev.clientX) sfx('tap', { x: ev.clientX, y: ev.clientY, visual: false });
      if (S.d != null) openSheet('half');
    }
  }
  // a tap on the sheet's grip moves the sheet away; the click that follows must not land on the map underneath
  // on touch, a single tap waits briefly in case it is the first half of a double tap (which zooms instead of selecting)
  let tapTimer = 0;
  el.svg.addEventListener('click', e => {
    if (suppressClick || performance.now() - sheetGestureAt < 450) return;
    const p = shapeOf(e.target);
    if (lastPtrType === 'touch') { clearTimeout(tapTimer); tapTimer = setTimeout(() => activate(p, e), 260); }
    else activate(p, e);
  });
  function mapShapes() {           // the shapes keyboard users move through: the districts at state view, else the states
    if (S.st && V.sgeo) return Array.from(el.gDist.querySelectorAll('.mp-d'));
    return Array.from(el.gStates.querySelectorAll('.mp-st'));
  }
  function rove() {
    const list = mapShapes();
    const others = S.st && V.sgeo ? el.gStates.querySelectorAll('.mp-st') : el.gDist.querySelectorAll('.mp-d');
    others.forEach(p => p.setAttribute('tabindex', '-1'));
    const cur = list.find(p => p === document.activeElement) || list.find(p => p.classList.contains('is-sel')) || list.find(p => p.getAttribute('data-st') === S.st) || list[0];
    list.forEach(p => p.setAttribute('tabindex', p === cur ? '0' : '-1'));
  }
  el.svg.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { const p = shapeOf(e.target); if (p) { e.preventDefault(); refocus = null; activate(p); if (!refocus) refocus = p.id; } return; }
    const k = e.key, list = mapShapes(), i = list.indexOf(shapeOf(e.target));
    if (i < 0 || !/^(ArrowRight|ArrowDown|ArrowLeft|ArrowUp|Home|End)$/.test(k)) return;
    e.preventDefault();
    const j = k === 'Home' ? 0 : k === 'End' ? list.length - 1 : (i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list.forEach(p => p.setAttribute('tabindex', '-1')); list[j].setAttribute('tabindex', '0'); list[j].focus();
  });
  let refocus = null;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (el.tip.classList.contains('on')) { hideTip(); lift(null); e.preventDefault(); return; }
    if (document.activeElement === el.q || el.results.contains(document.activeElement)) return;
    const a = document.activeElement, timeBox = document.querySelector('.mp-time');
    if (el.wrap.contains(a) || el.panel.contains(a) || (timeBox && timeBox.contains(a)) || a === document.body) { if (goUp()) e.preventDefault(); }
  });
  function goUp() {
    V.zipMsg = null;
    if (S.d != null) { S.d = null; writeURL('push'); render(); return true; }
    if (S.st) { const st = S.st; S.st = null; writeURL('push'); render(); refocus = 'mp-s-' + st; return true; }
    return false;
  }
  function selectState(st, d) {
    S.st = st; S.d = d == null ? null : String(d);
    writeURL('push'); render();
    openSheet(isPhone() ? 'half' : null);
  }

  /* ======================= legend + key caption ======================= */
  function drawLegend() {
    const seen = new Set();
    el.svg.querySelectorAll(S.st && V.sgeo ? '.mp-d' : '.mp-st.is-tint, .mp-st.p-tie').forEach(p => { const m = p.className.baseVal.match(/(?:^|\s)p-([a-z]+)/); if (m && m[1] !== 'none') seen.add(m[1]); });
    const order = ['dem', 'rep', 'whig', 'fed', 'dr', 'oth', 'tie', 'vac'];
    const nation = !S.st || !V.sgeo;
    let h = order.filter(k => seen.has(k)).map(k => {
      if (k === 'vac') return '<li><i class="mp-sw p-vac" aria-hidden="true"></i>' + (isElect(V.c) ? 'Not yet called' : 'Vacant') + '</li>';
      if (k === 'tie') return '<li><i class="mp-sw p-tie" aria-hidden="true"></i>' + (S.mode === 's' ? 'One of each' : 'Even split') + '</li>';
      const steps = nation && S.mode === 'h';
      return '<li><i class="mp-sw p-' + k + (steps ? ' mp-sw-steps' : '') + '" aria-hidden="true">' + (steps ? '<b></b><b></b><b></b>' : '') + '</i>' + M.PARTY_KEYS[k][0] + ' <span class="mp-lg-l">(' + M.PARTY_KEYS[k][1] + ')</span></li>';
    }).join('');
    if (nation && S.mode === 's' && el.gStates.querySelector('.mp-st.is-tint[style*="--mix: 52%"]')) h += '<li><i class="mp-sw p-dem" style="opacity:.55" aria-hidden="true"></i>One seat filled</li>';
    if (nation && V.nation && el.gStates.querySelector('.mp-st.p-none:not(.is-unseated)')) h += '<li><i class="mp-sw p-none" aria-hidden="true"></i>' + (S.mode === 'g' && isElect(V.c) ? 'Not yet called' : 'No data') + '</li>';
    if (V.nation && el.gStates.querySelector('.mp-st.is-unseated')) h += '<li><i class="mp-sw p-vac" aria-hidden="true"></i>No members seated</li>';
    if (S.ghost) {
      if (S.st ? Object.values(V.changed || {}).some(Boolean) : V.redrawn && V.redrawn.size) h += '<li><i class="mp-sw mp-sw-chg" aria-hidden="true"></i>' + (S.st ? 'Lines changed' : 'New map this Congress') + '</li>';
      if (S.st && V.prev && Object.values(V.changed || {}).some(Boolean)) h += '<li><i class="mp-sw mp-sw-ghost" aria-hidden="true"></i>Previous lines</li>';
    }
    if (!V.nation) h = '';
    el.legend.innerHTML = h;
    el.keyCap.textContent = !V.nation ? '' : nation ? (S.mode === 's' ? 'Color: party of the state’s two U.S. senators. Stripes: one Democrat and one Republican; grey: an independent or other party holds a seat.' : S.mode === 'g' ? 'Color: party of each state’s governor on ' + M.fmtShort(viewDate(V.c)) + ', ' + S.year + '.' : V.summary ? 'Color: party with most of the state’s House seats. Three shades: lean (under 60%), likely, solid (75% or more).' : '') : (isElect(V.c) ? 'Color: party of each member-elect (elected Nov 2026, takes office ' + M.fmtDate(V.c.start) + ').' : 'Color: party holding each seat on ' + M.fmtShort(viewDate(V.c)) + ', ' + S.year + '.');
  }

  /* ======================= panel ======================= */
  function initials(name) { return String(name || '?').split(/\s+/).filter(w => /^[A-Za-z]/.test(w) && !/^(jr|sr|ii|iii)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  function portrait(b) {
    const src = b && b.photo ? L.asset(b.photo) : null;
    const ini = '<span class="mp-ini" aria-hidden="true">' + esc(initials(b && b.name)) + '</span>';
    return '<div class="mp-portrait">' + ini + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : '') + '</div>';
  }
  function pill(party) { return '<span class="mp-pill ' + partyClass(party) + '"><i aria-hidden="true"></i>' + esc(M.partyName(party)) + '</span>'; }
  // "approx" entries (and dates written as a bare year) have year precision only
  const fmtD = (d, approx) => (!d ? '' : approx || d.length === 4 ? d.slice(0, 4) : M.fmtDate(d));
  function rangeText(from, to, approx) { return fmtD(from, approx) + ' – ' + (to ? fmtD(to, approx) : 'present'); }
  // a territory's delegate sits in the state's House lists until the admission date
  function houseRole(P) { const a = L.index.states && L.index.states[S.st] && L.index.states[S.st].admitted; return (P.delegate || (a && viewDate(V.c) < a)) ? 'Delegate' : 'U.S. Representative'; }
  const HOW = { special: 'Won a special election', appointed: 'Appointed', 'chosen-by-legislature': 'Chosen by the state legislature' };
  const yrPct = y => Math.max(0, Math.min(100, (y - Y0) / (Y1 - Y0) * 100));
  function tenureBar(ten) {
    const a = +String(ten.from).slice(0, 4), b = ten.to ? +String(ten.to).slice(0, 4) : Y1;
    return '<div class="mp-tenure" role="img" aria-label="In this seat ' + a + ' to ' + (ten.to ? b : 'today') + '"><i style="left:' + yrPct(a).toFixed(2) + '%;width:' + Math.max(0.6, yrPct(b) - yrPct(a)).toFixed(2) + '%"></i><b style="left:' + yrPct(S.year).toFixed(2) + '%"></b></div>' +
      '<div class="mp-tenure-x" aria-hidden="true"><span>' + Y0 + '</span><span>' + a + '–' + (ten.to ? b : 'now') + '</span><span>' + Y1 + '</span></div>';
  }
  // other offices the same person held in this state (from the state's own lists)
  const delegCache = new Map();
  function delegation() {
    const P = V.people; if (!P || !L.index.congresses) return null;
    if (delegCache.has(P)) return delegCache.get(P);
    const adm = L.index.states[S.st] && L.index.states[S.st].admitted;
    const keys = Object.keys(P.house || {});
    const merged = keys.map(k => M.merge(P.house[k] || []));
    const out = [];
    for (const c of L.index.congresses) {
      let d = String(+c.start.slice(0, 4) + (c.start.slice(5) > '07-01' ? 1 : 0)) + '-07-01';
      if (d >= c.end) d = c.start;
      if (adm && d < adm) continue;
      const counts = {}; let n = 0;
      merged.forEach(list => { const h = list.find(x => x.from <= d && (x.to == null || x.to > d)); if (h) { const k = M.partyKey(h.party); counts[k] = (counts[k] || 0) + 1; n++; } });
      if (n) out.push({ n: c.n, y: +d.slice(0, 4), counts, total: n });
    }
    delegCache.set(P, out);
    return out;
  }
  function delegationChart() {
    const D = delegation(); if (!D || D.length < 2) return '';
    const max = Math.max(...D.map(x => x.total)), W = 100, H = 46, bw = W / D.length, TK = 3;
    const order = ['dem', 'rep', 'whig', 'fed', 'dr', 'oth'];
    let bars = '', marks = '';
    D.forEach((x, i) => {
      let y = H;
      order.forEach(k => { const v = x.counts[k] || 0; if (!v) return; const hh = v / max * (H - 4); y -= hh; bars += '<rect x="' + (i * bw).toFixed(3) + '" y="' + y.toFixed(3) + '" width="' + Math.max(0.3, bw - (bw > 1.2 ? 0.25 : 0)).toFixed(3) + '" height="' + hh.toFixed(3) + '" class="p-' + k + '"/>'; });
      // a change in the number of seats (a reapportionment) gets a tick above the bar
      const seatsAt = j => Math.max(D[j].total, D[j + 1] ? D[j + 1].total : 0, D[j - 1] && D[j + 1] && D[j - 1].total === D[j + 1].total ? D[j - 1].total : 0);
      if (i > 1 && seatsAt(i) !== seatsAt(i - 1) && (!D[i + 1] || seatsAt(i + 1) === seatsAt(i))) marks += '<rect x="' + (i * bw).toFixed(3) + '" y="' + H + '" width="0.45" height="' + TK + '" class="mp-dg-mark"/>';
    });
    const cur = D.findIndex(x => V.c && x.n === V.c.n);
    if (cur >= 0) marks += '<rect x="' + (cur * bw).toFixed(3) + '" y="' + (H - D[cur].total / max * (H - 4)).toFixed(3) + '" width="' + Math.max(0.6, bw).toFixed(3) + '" height="' + (D[cur].total / max * (H - 4)).toFixed(3) + '" class="mp-dg-cur"/>';
    const yx = y => { const i = D.findIndex(x => x.y >= y); return i < 0 ? null : (i + 0.5) * bw; };
    const axis = [1800, 1850, 1900, 1950, 2000].filter(y => y > D[0].y + 8 && y < D[D.length - 1].y - 8).map(y => '<span style="left:' + yx(y).toFixed(2) + '%">' + y + '</span>').join('');
    const curTag = cur >= 0 ? '<span class="mp-dg-tag" style="left:' + ((cur + 0.5) * bw).toFixed(2) + '%">' + S.year + '</span>' : '';
    const first = D[0], last = D[D.length - 1], now = cur >= 0 ? D[cur] : null;
    const sum = now ? now.total + ' seat' + (now.total === 1 ? '' : 's') + ' in ' + S.year + ': ' + order.filter(k => now.counts[k]).map(k => now.counts[k] + ' ' + (k === 'oth' ? 'other' : M.PARTY_KEYS[k][0])).join(', ') : '';
    return '<section class="mp-sec"><h3 class="mp-sec-h">House delegation over time</h3>' +
      '<div class="mp-dg" data-n0="' + D.length + '">' + curTag + '<svg viewBox="0 0 ' + W + ' ' + (H + TK) + '" preserveAspectRatio="none" role="img" aria-label="' + esc(stName(S.st) + ' House seats by party for each Congress, ' + first.y + ' to ' + last.y + '. Peak ' + max + ' seats.' + (sum ? ' ' + sum + '.' : '')) + '">' + bars + marks + '</svg>' +
      '<div class="mp-dg-ax" aria-hidden="true"><span style="left:0">' + first.y + '</span>' + axis + '<span style="right:0;left:auto">' + last.y + '</span></div>' +
      '<p class="mp-dg-sum">' + esc(sum) + '</p></div>' +
      '<p class="mp-note mp-muted">Click a bar to jump to that Congress. Ticks under the bars mark a new number of seats after a census.</p></section>';
  }
  // ---------- career: every seat the person held (this state's file, plus other states from the search rows when loaded) ----------
  let careerRows = null;
  function loadCareerRows() { if (careerRows) return; careerRows = 'loading'; L.searchRows().then(r => { careerRows = r; if (S.d != null || S.st) renderPanel(); }).catch(() => { careerRows = []; }); }
  function career(id) {
    const P = V.people; if (!id) return '';
    const rows = [];
    const seen = new Set();
    const add = (st, kind, seat, from, to) => { const k = st + kind + seat + from; if (seen.has(k)) return; seen.add(k); rows.push({ st, kind, seat, from, to }); };
    if (P) {
      Object.entries(P.house || {}).forEach(([k, l]) => M.merge(l).forEach(x => { if (x.id === id) add(S.st, 'h', k, x.from, x.to); }));
      Object.entries(P.senate || {}).forEach(([k, l]) => M.merge(l).forEach(x => { if (x.id === id) add(S.st, 's', k, x.from, x.to); }));
      M.merge(P.governor || []).forEach(x => { if (x.id === id) add(S.st, 'g', '', x.from, x.to); });
    }
    if (Array.isArray(careerRows)) careerRows.forEach(r => { if (r[0] === id) add(r[2], r[3], r[4], r[5], r[6]); });
    else loadCareerRows();
    if (rows.length < 2) return '';
    rows.sort((a, b) => (a.from < b.from ? -1 : 1));
    for (let i = rows.length - 1; i > 0; i--) { const a = rows[i - 1], b = rows[i]; if (a.st === b.st && a.kind === b.kind && String(parseInt(a.seat, 10) || 0) === String(parseInt(b.seat, 10) || 0) && a.to && b.from <= a.to.slice(0, 4) + '-12-31' && b.from >= a.from) { a.to = b.to; rows.splice(i, 1); } }
    const label = r => { const dn = String(parseInt(r.seat, 10) || 0); const adm = L.index.states[r.st] && L.index.states[r.st].admitted;
      return r.kind === 'h' ? ((adm && r.from < adm) ? 'Delegate' : 'House') + ', ' + (dn === '0' ? r.st + ' at-large' : r.st + '-' + dn) : r.kind === 's' ? 'Senate, ' + stName(r.st) : 'Governor of ' + stName(r.st); };
    const yr = d => +String(d).slice(0, 4);
    return '<div class="mp-career"><div class="mp-label">Career</div><ol>' + rows.map(r => {
      const y = Math.min(Y1, yr(r.from) + (String(r.from).slice(5) > '07-01' ? 1 : 0));
      const isHere = r.st === S.st && ((r.kind === 'h' && String(parseInt(r.seat, 10) || 0) === S.d) || false) && V.c && y <= S.year && (r.to == null || yr(r.to) >= S.year);
      return '<li' + (isHere ? ' class="on"' : '') + '><button type="button" data-career="' + esc(r.st + '|' + r.kind + '|' + r.seat + '|' + y) + '"><span>' + esc(label(r)) + (isHere ? ' <em class="mp-viewing">Viewing</em>' : '') + '</span><span class="mp-od">' + yr(r.from) + '–' + (r.to ? yr(r.to) : 'now') + '</span><svg class="mp-chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button></li>';
    }).join('') + '</ol></div>';
  }
  function alsoServed(id, curKind) {
    const P = V.people; if (!P || !id) return '';
    const out = [];
    const scan = (lists, kind, label) => Object.entries(lists || {}).forEach(([k, l]) => M.merge(l).forEach(x => { if (x.id === id && kind !== curKind) out.push(label(k) + ' ' + String(x.from).slice(0, 4) + '–' + (x.to ? String(x.to).slice(0, 4) : 'now')); }));
    scan(P.house, 'h', k => (String(parseInt(k, 10) || 0) === '0' ? 'House, at-large' : 'House, ' + M.ordinal(parseInt(k, 10)) + ' district'));
    scan(P.senate, 's', () => 'Senate');
    scan({ g: P.governor }, 'g', () => 'Governor');
    return out.length ? '<p class="mp-also"><b>Also served:</b> ' + esc(out.slice(0, 3).join('; ')) + '</p>' : '';
  }
  function personCard(seg, list, role, big, kind) {
    if (!seg) return '';
    if (seg.id && V.focusId && seg.id === V.focusId) big = true;            // ?q=… opens this person's full card and career
    const future = seg.from && seg.from > TODAY;
    if (future && !seg.vacant) role = kind === 's' ? 'Senator-elect' + (role ? ' · ' + role : '') : kind === 'g' ? 'Governor-elect' : kind === 'h' ? (role === 'Delegate' ? 'Delegate-elect' : 'Representative-elect') : role;
    if (seg.vacant && isElect(V.c) && (seg.to == null || seg.to > TODAY) && (seg.from >= TODAY || (seg.openEnd && seg.openEnd > TODAY))) {
      return '<article class="mp-card p-vac mp-vacant mp-uncalled' + (big ? ' mp-card-lg' : '') + '"><div class="mp-portrait mp-port-vac" aria-hidden="true"></div><div class="mp-card-main">' +
        (role ? '<div class="mp-role">' + esc(role) + '</div>' : '') + '<h3 class="mp-name">Race not yet called</h3><div class="mp-meta">The winner takes office ' + esc(M.fmtDate(V.c.start)) + '.</div></div></article>';
    }
    if (seg.vacant) {
      return '<article class="mp-card p-vac mp-vacant' + (big ? ' mp-card-lg' : '') + '"><div class="mp-portrait mp-port-vac" aria-hidden="true"></div><div class="mp-card-main">' +
        '<div class="mp-role">' + esc(role) + '</div><h3 class="mp-name">Vacant</h3><div class="mp-meta">' + esc(rangeText(seg.from, seg.to || seg.openEnd)) + '</div></div></article>';
    }
    const b = V.bios[seg.id] || {};
    const ten = M.tenureOf(list, seg);
    const wiki = safeHttp(b.wiki);
    const how = HOW[ten.how] ? '<div class="mp-how">' + esc(HOW[ten.how]) + '</div>' : '';
    const yrs = Math.max(0, (ten.to ? +String(ten.to).slice(0, 4) : Y1) - +String(ten.from).slice(0, 4));
    const wikiA = wiki ? '<a class="mp-wiki" href="' + esc(wiki) + '" target="_blank" rel="noopener noreferrer">Wikipedia<span class="sr-only"> article about ' + esc(b.name || '') + ' (opens in a new tab)</span><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3h7v7M13 3L5 11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></a>' : '';
    if (big) return '<article class="mp-card mp-card-lg ' + partyClass(seg.party) + '"><div class="mp-card-head">' + portrait(b) +
      '<div class="mp-card-main"><div class="mp-role">' + esc(role) + '</div><h3 class="mp-name">' + esc(b.name || seg.id) + '</h3>' +
      '<div class="mp-meta">' + pill(seg.party) + '</div><div class="mp-served-l">' + esc(rangeText(ten.from, ten.to, ten.approx || seg.approx)) + (yrs >= 2 ? ' · <span class="mp-nw">' + yrs + ' years</span>' : '') + '</div>' + how + '</div></div>' +
      (b.bio ? '<p class="mp-bio">' + esc(b.bio) + '</p>' : '') + (career(seg.id) || alsoServed(seg.id, kind)) +
      '<div class="mp-card-foot">' + wikiA + '</div>' + (b.photoCredit && b.photo ? '<p class="mp-credit">Photo: ' + esc(b.photoCredit) + '</p>' : '') + '</article>';
    return '<article class="mp-card ' + partyClass(seg.party) + '">' + portrait(b) +
      '<div class="mp-card-main">' + (role ? '<div class="mp-role">' + esc(role) + '</div>' : '') +
      '<h3 class="mp-name">' + esc(b.name || seg.id) + '</h3>' +
      '<div class="mp-meta">' + pill(seg.party) + '<span class="mp-served">' + esc(rangeText(ten.from, ten.to, ten.approx || seg.approx)) + '</span></div>' + how +
      (false ? '<a class="mp-wiki" href="' + esc(wiki) + '" target="_blank" rel="noopener noreferrer">Wikipedia<span class="sr-only"> article about ' + esc(b.name || '') + ' (opens in a new tab)</span><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3h7v7M13 3L5 11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></a>' : '') +
      (big && b.photoCredit && b.photo ? '<div class="mp-credit" title="' + esc(b.photoCredit) + '">Photo: ' + esc(b.photoCredit) + '</div>' : '') +
      '</div></article>';
  }
  function othersList(segs) {
    const rest = segs.filter(s => !s.primary);
    if (!rest.length) return '';
    return '<ul class="mp-others" aria-label="Also during ' + S.year + '">' + rest.map(s => {
      const end = s.to || s.openEnd;
      const sh = d => (s.approx ? d.slice(0, 4) : M.fmtShort(d));
      const dates = s.approx ? fmtD(s.from, true) + (end ? '–' + fmtD(end, true) : '') : (s.from <= S.year + '-01-01' ? 'until ' + sh(end) : end && end <= S.year + '-12-31' ? sh(s.from) + ' – ' + sh(end) : 'from ' + sh(s.from));
      return s.vacant ? '<li class="p-vac"><i class="mp-dot" aria-hidden="true"></i><span>Vacant</span><span class="mp-od">' + esc(dates) + '</span></li>'
        : '<li class="' + partyClass(s.party) + '"><i class="mp-dot" aria-hidden="true"></i><span>' + esc(personName(s.id)) + ' <span class="mp-ol">(' + esc(M.partyLetter(s.party)) + ')</span></span><span class="mp-od">' + esc(dates) + '</span></li>';
    }).join('') + '</ul>';
  }
  function seatBlock(list, role, big, window2, kind) {
    const [a, b] = window2 || fullYear();
    const segs = M.segments(list || [], a, b, viewDate(V.c));
    if (!segs.length) return '<article class="mp-card p-vac mp-vacant"><div class="mp-portrait mp-port-vac" aria-hidden="true"></div><div class="mp-card-main"><div class="mp-role">' + esc(role) + '</div><h3 class="mp-name">Vacant</h3></div></article>';
    return personCard(segs.find(s => s.primary), list, role, big, kind) + othersList(segs);
  }
  function senateBlocks() {
    const P = V.people; if (!P) return '';
    const classes = Object.keys(P.senate || {}).sort();
    if (!classes.length || P.delegate) return '';
    const before1913 = S.year < 1914;
    return '<section class="mp-sec"><h3 class="mp-sec-h">U.S. Senate</h3>' + classes.map(k => seatBlock(P.senate[k], 'Class ' + k + ' seat', false, null, 's')).join('') +
      (before1913 ? '<p class="mp-note">Before 1913, state legislatures chose senators.</p>' : '') + '</section>';
  }
  function governorBlock() {
    const P = V.people; if (!P || !P.governor || !P.governor.length) return '';
    return '<section class="mp-sec"><h3 class="mp-sec-h">Governor</h3>' + seatBlock(P.governor, '', false, null, 'g') + '</section>';
  }
  // every holder of this seat number since it was created, as a clickable strip
  function seatTimeline(dn) {
    const P = V.people; if (!P) return '';
    const key = M.seatKeys(P.house, dn)[0];
    const list = M.merge((P.house || {})[key] || []);
    if (list.length < 2) return '';
    const t0 = +list[0].from.slice(0, 4), t1 = Y1 + 1;
    let cur = t0, bar = '';
    list.forEach((x, i) => {
      const a = +x.from.slice(0, 4), b = x.to ? +x.to.slice(0, 4) : t1;
      if (a > cur) bar += '<span class="gap" style="flex:' + Math.min(a - cur, 6) + '" title="' + (a - cur) + ' years without this seat"></span>';
      const on = S.year >= a && S.year < Math.max(b, a + 1);
      bar += '<span class="' + partyClass(x.party) + (on ? ' on' : '') + '" style="flex:' + Math.max(0.6, b - a) + '" title="' + esc(personName(x.id) + ', ' + a + '–' + (x.to ? b : 'now')) + '"></span>';
      cur = Math.max(cur, b);
    });
    const goY = x => { const a = +x.from.slice(0, 4); return Math.min(Y1, x.from.slice(5) > '07-01' ? a + 1 : a); };
    const row = x => { const a = x.from.slice(0, 4), b = x.to ? x.to.slice(0, 4) : 'now', on = S.year >= +a && (x.to ? S.year < +b || S.year === +a : true);
      return '<li class="' + partyClass(x.party) + (on ? ' on' : '') + '"><button type="button" data-go-year="' + goY(x) + '"><i class="mp-dot" aria-hidden="true"></i><span>' + esc(personName(x.id)) + '</span><span class="mp-od">' + a + '–' + b + '</span><span class="sr-only">, go to ' + goY(x) + '</span></button></li>'; };
    const recent = list.slice(-5).reverse(), older = list.slice(0, -5).reverse();
    return '<section class="mp-sec"><h3 class="mp-sec-h">Who held this seat</h3><div class="mp-seatline"><div class="mp-seatline-bar" aria-hidden="true">' + bar + '</div><div class="mp-seatline-x" aria-hidden="true"><span>' + t0 + '</span><span>' + list.length + ' holders · long gaps shortened</span><span>today</span></div>' + seatKey(list) + '</div>' +
      '<ul class="mp-seatlist">' + recent.map(row).join('') + '</ul>' + (older.length ? '<details class="mp-more"><summary>Earlier holders (' + older.length + ')</summary><ul class="mp-seatlist">' + older.map(row).join('') + '</ul></details>' : '') +
      '<p class="mp-note mp-muted">Numbers are reused after redistricting, so a seat’s area can change between holders.</p></section>';
  }
  function seatKey(list) {
    const ps = Array.from(new Set(list.map(x => M.partyKey(x.party))));
    return '<div class="mp-split-k mp-seatkey-k" aria-hidden="true">' + ps.map(k => '<span class="p-' + k + '"><i></i>' + (k === 'oth' ? 'Other' : M.PARTY_KEYS[k][0]) + '</span>').join('') + '</div>';
  }
  function gauge(v, was) {
    const word = v >= 0.4 ? 'Compact' : v >= 0.2 ? 'Average' : v >= 0.1 ? 'Irregular' : 'Very irregular';
    return '<div class="mp-gauge"><div class="mp-gauge-h"><span>Compactness</span><span><b>' + v.toFixed(2) + '</b> ' + word + (was != null ? ' · was ' + was.toFixed(2) : '') + '</span></div>' +
      '<div class="mp-gauge-bar" role="img" aria-label="Compactness ' + v.toFixed(2) + ' of 1, ' + word + (was != null ? ', previously ' + was.toFixed(2) : '') + '">' + (was != null ? '<i class="was" style="left:' + (Math.min(1, was) * 100).toFixed(1) + '%"></i>' : '') + '<i style="left:' + (Math.min(1, v) * 100).toFixed(1) + '%"></i></div>' +
      '<div class="mp-gauge-x" aria-hidden="true"><span>Twisted</span><span>Circle</span></div><p class="mp-gauge-help">Polsby-Popper score: the district’s area compared with a circle of the same perimeter. Low scores often signal gerrymandering, but rivers and coastlines lower them too.</p></div>';
  }
  function lastRedrawBtn() {
    const list = V.changes && V.changes[S.st]; if (!Array.isArray(list)) return '';
    const k = list.filter(n => n <= V.c.n && n > 1).pop(); const c = k && L.congressByN(k);
    if (!c || k === V.c.n) return '';
    const y = +c.start.slice(0, 4) + (c.start.slice(5) > '07-01' ? 1 : 0);
    return '<button type="button" class="mp-linkbtn" data-go-year="' + y + '">See the last redraw (' + y + ', ' + M.ordinal(k) + ' Congress)</button>';
  }
  function historyBlock(dn) {
    if (!S.ghost) return '';
    const H = V.history;
    let h = '<section class="mp-sec mp-hist"><h3 class="mp-sec-h">Redistricting</h3>';
    const cmp = H && H.compactness, cur = cmp && (cmp['c' + pad3(V.c.n)] || cmp['c' + V.c.n]), prv = cmp && (cmp['c' + pad3(V.c.n - 1)] || cmp['c' + (V.c.n - 1)]);
    if (dn != null) {
      const id = S.st + '-' + dn;
      const ch = V.changed && V.changed[id];
      h += '<p class="mp-note">' + (V.prev ? (ch ? '<b>Lines changed</b> since the ' + M.ordinal(V.c.n - 1) + ' Congress.' : 'Same lines as the ' + M.ordinal(V.c.n - 1) + ' Congress.') : 'No earlier map to compare.') + '</p>' + (V.prev && !ch ? lastRedrawBtn() : '');
      if (cur && cur[id] != null) h += gauge(cur[id], prv && prv[id] != null && ch ? prv[id] : null);
    } else if (V.prev) {
      const n = Object.values(V.changed || {}).filter(Boolean).length;
      h += '<p class="mp-note">' + (n ? '<b>' + n + ' of ' + districtsOf(V.sgeo).length + '</b> districts changed shape since the ' + M.ordinal(V.c.n - 1) + ' Congress.' : 'No district changed shape since the ' + M.ordinal(V.c.n - 1) + ' Congress.') + '</p>' + (n ? '' : lastRedrawBtn());
    }
    if (H && Array.isArray(H.seats) && H.seats.length) {
      const seats = H.seats.slice().sort((a, b) => a.census - b.census);
      const max = Math.max.apply(null, seats.map(x => x.seats)) || 1;
      const curC = seats.filter(x => x.census <= S.year).pop();
      const bw = 100 / seats.length;
      h += '<h4 class="mp-sub">Seats after each census</h4><div class="mp-bars" role="img" aria-label="' + esc(seats.map(x => x.census + ': ' + x.seats).join(', ')) + '">' +
        '<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        seats.map((x, i) => { const hh = Math.max(1.2, x.seats / max * 36); return '<rect rx="0.6" x="' + (i * bw + bw * 0.14).toFixed(2) + '" y="' + (40 - hh).toFixed(2) + '" width="' + (bw * 0.72).toFixed(2) + '" height="' + hh.toFixed(2) + '" class="' + (x === curC ? 'on' : '') + '"/>'; }).join('') +
        '</svg><div class="mp-bars-x" aria-hidden="true"><span>' + seats[0].census + '</span>' + (curC ? '<span class="on">' + curC.census + ': ' + curC.seats + ' seat' + (curC.seats === 1 ? '' : 's') + '</span>' : '') + '<span>' + seats[seats.length - 1].census + '</span></div></div>';
    }
    if (H && Array.isArray(H.events) && H.events.length) {
      const ev = H.events.filter(x => !x.year || x.year <= S.year + 1).sort((a, b) => (b.year || 0) - (a.year || 0));
      const evHtml = x => {
        const now = x.congress === V.c.n;
        const src = (x.sources || []).map(safeHttp).filter(Boolean);
        return '<li class="' + (now ? 'is-now' : '') + '"><span class="mp-ev-y">' + esc(x.year || '') + '</span>' + (now ? '<span class="mp-ev-now">This Congress</span>' : '') + '<b>' + esc(x.title || '') + '</b>' +
          '<p>' + esc(x.text || '') + '</p>' + (src.length ? '<p class="mp-ev-src">' + src.map((u, i) => '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Source' + (src.length > 1 ? ' ' + (i + 1) : '') + '<span class="sr-only"> (opens in a new tab)</span></a>').join(' · ') + '</p>' : '') + '</li>';
      };
      if (ev.length) {
        h += '<h4 class="mp-sub">Why the map changed</h4><ol class="mp-events">' + ev.slice(0, 4).map(evHtml).join('') + '</ol>';
        if (ev.length > 4) h += '<details class="mp-more"><summary>Earlier events (' + (ev.length - 4) + ')</summary><ol class="mp-events">' + ev.slice(4).map(evHtml).join('') + '</ol></details>';
      }
    }
    if (!H) h += '<p class="mp-note mp-muted">No redistricting history for ' + esc(stName(S.st)) + ' yet.</p>';
    return h + '</section>';
  }
  function splitBar(label, counts, total) {
    if (!counts) return '';
    const ent = Object.entries(counts).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
    const tot = ent.reduce((a, e) => a + e[1], 0); if (!tot) return '';
    return '<div class="mp-split"><div class="mp-split-h"><span class="mp-label">' + esc(label) + '</span><span class="mp-split-n">' + esc(total || tot + ' seats') + '</span></div>' +
      '<div class="mp-split-bar" role="img" aria-label="' + esc(label + ': ' + ent.map(e => e[1] + ' ' + M.partyName(e[0])).join(', ')) + '">' + ent.map(e => '<i class="' + partyClass(e[0]) + '" style="flex-grow:' + e[1] + '"></i>').join('') + '</div>' +
      '<div class="mp-split-k" aria-hidden="true">' + ent.slice(0, 4).map(e => '<span class="' + partyClass(e[0]) + '"><i></i><b>' + e[1] + '</b> ' + esc(M.partyName(e[0])) + '</span>').join('') + '</div></div>';
  }
  function sumCounts(by) { const out = {}; Object.values(by || {}).forEach(c => Object.entries(c || {}).forEach(([p, n]) => { out[p] = (out[p] || 0) + n; })); return out; }

  function renderPanel() {
    const c = V.c;
    let title = 'United States', sum = '', h = '';
    const crumbs = [];
    if (S.st) crumbs.push(['us', 'United States']);
    if (S.st && S.d != null && V.sgeo && V.sgeo.districts[S.st + '-' + S.d]) crumbs.push(['st', stName(S.st)]);
    if (!c || !V.nation) {
      title = S.st ? stName(S.st) : 'United States';
      sum = congLabel(c, S.year);
      h = '<div class="mp-emptycard"><p>' + esc(emptyMessage()) + '</p>' + nearestButton() + '</div>';
    } else if (!S.st) {
      const n = (V.nationIds || []).length;
      const kindOf = st => (L.index.states && L.index.states[st] && L.index.states[st].kind) || 'state';
      const voting = {}, dels = {};
      Object.entries((V.summary && V.summary.house) || {}).forEach(([st, cc]) => { const tgt = votingState(st) ? voting : dels; Object.entries(cc || {}).forEach(([p, k]) => { tgt[p] = (tgt[p] || 0) + k; }); });
      const nV = Object.values(voting).reduce((a, b) => a + b, 0), nD = Object.values(dels).reduce((a, b) => a + b, 0);
      const nStates = (V.nationIds || []).filter(st => kindOf(st) === 'state').length;
      sum = nStates + ' states' + (n > nStates ? ' and ' + (n - nStates) + ' other areas' : '') + ' on the map';
      const senate = V.summary && sumCounts(V.summary.senate);
      h = nV && isElect(c) ? '<p class="mp-note"><b>' + nV + ' of 435</b> House races called so far. The new Congress takes office ' + M.fmtDate(c.start) + '.</p>' : nV ? '<p class="mp-note">' + nV + ' voting House seats filled on ' + M.fmtDate(viewDate(c)).replace(/^(w+) (d+), (d+)$/, '$1 $2, $3') + (nD ? ', plus ' + nD + ' non-voting delegate' + (nD === 1 ? '' : 's') : '') + '.</p>' : '';
      if (V.prevSummary && nV) {
        const byKey = o => { const r = {}; Object.entries(o).forEach(([p, k]) => { const pk = M.partyKey(p); r[pk] = (r[pk] || 0) + k; }); return r; };
        const pv0 = {}; Object.entries(V.prevSummary.house || {}).forEach(([st, cc]) => { if (votingState(st)) Object.entries(cc || {}).forEach(([p, k]) => { pv0[p] = (pv0[p] || 0) + k; }); });
        const pv = byKey(pv0), vk = byKey(voting), NAME = { dem: 'Democrat', rep: 'Republican', whig: 'Whig', fed: 'Federalist', dr: 'Democratic-Republican', oth: 'Other' };
        const moves = Object.keys(Object.assign({}, vk, pv)).map(k => [NAME[k], (vk[k] || 0) - (pv[k] || 0)]).filter(e => e[1] && e[0] !== 'Other').sort((a, b) => b[1] - a[1]);
        if (moves.length) h += '<p class="mp-delta"><span class="mp-label">' + (isElect(c) ? 'House seats called vs. the ' : 'House seats since the ') + M.ordinal(c.n - 1) + ' Congress</span>' + moves.slice(0, 3).map(([p, d]) => '<span class="' + partyClass(p) + '"><i></i>' + esc(M.partyName(p)) + 's&nbsp;<b>' + (d > 0 ? '+' : '−') + Math.abs(d) + '</b>&nbsp;seat' + (Math.abs(d) === 1 ? '' : 's') + '</span>').join('') + '</p>';
      }
      if (!h) h = '<p class="mp-intro">Choose a state on the map to see its districts and who represented them in ' + S.year + '.</p>';
      if (S.ghost && V.redrawn) {
        const r = Array.from(V.redrawn).sort((a, b) => stName(a).localeCompare(stName(b)));
        h += '<section class="mp-sec"><h3 class="mp-sec-h">Redistricting</h3><p class="mp-note">' + (r.length ? '<b>' + r.length + '</b> state' + (r.length === 1 ? '' : 's') + ' used a new district map in the ' + M.ordinal(c.n) + ' Congress (hatched on the map).' : 'No state changed its district map in the ' + M.ordinal(c.n) + ' Congress.') + '</p>' +
          (r.length ? '<ul class="mp-big">' + r.slice(0, 12).map(st => '<li><button type="button" data-go-st="' + esc(st) + '">' + esc(stName(st)) + '</button></li>').join('') + '</ul>' : '') + '</section>';
      }
      if (S.ghost && V.national && Array.isArray(V.national.explainers) && V.national.explainers.length) {
        h += '<section class="mp-sec mp-hist"><h3 class="mp-sec-h">How districts are drawn</h3>' + V.national.explainers.slice(0, 6).map(x => {
          const src = (x.sources || []).map(safeHttp).filter(Boolean);
          const paras = Array.isArray(x.text) ? x.text : [x.text];
          return '<details class="mp-expl"><summary>' + esc(x.title || '') + '</summary>' + paras.map(p => '<p>' + esc(p) + '</p>').join('') +
            (src.length ? '<p class="mp-ev-src">' + src.map((u, i) => '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Source' + (src.length > 1 ? ' ' + (i + 1) : '') + '<span class="sr-only"> (opens in a new tab)</span></a>').join(' · ') + '</p>' : '') + '</details>';
        }).join('') + '</section>';
      }
      h += '<p class="mp-intro">' + (isElect(c) ? 'Click a state to see who won each seat in November 2026.' : 'Click a state to see its districts and who held each seat in ' + S.year + '.') + ' Every state is also listed in the table view below the map.</p>';
      const ms = V.national && Array.isArray(V.national.milestones) ? V.national.milestones.filter(x => x.year && x.year <= S.year).sort((a, b) => b.year - a.year).slice(0, 3) : [];
      if (ms.length) h += '<section class="mp-sec"><h3 class="mp-sec-h">Milestones up to ' + S.year + '</h3><ol class="mp-events">' + ms.map((x, i) => {
        const src = (x.sources || []).map(safeHttp).filter(Boolean);
        return '<li class="' + (i === 0 ? 'is-now' : '') + '"><span class="mp-ev-y">' + esc(x.year) + '</span><b>' + esc(x.title || '') + '</b><p>' + esc(x.text || '') + '</p>' + (src.length ? '<p class="mp-ev-src"><a href="' + esc(src[0]) + '" target="_blank" rel="noopener noreferrer">Source<span class="sr-only"> (opens in a new tab)</span></a></p>' : '') + '</li>';
      }).join('') + '</ol></section>';
      const ns = (c.noShape || []).filter(st => !V.nation.states[st]);
      if (ns.length) h += '<p class="mp-note mp-muted">Seated this Congress but not drawn (no boundary recorded): ' + ns.map(st => '<button type="button" class="mp-inl" data-go-st="' + esc(st) + '">' + esc(stName(st)) + '</button>').join(', ') + '.</p>';
    } else if (!V.sgeo && V.noShape && V.people) {
      title = stName(S.st);
      const P = V.people, keys = Object.keys(P.house || {}).sort();
      sum = 'No district map exists for this Congress';
      h = '<p class="mp-note">' + esc(stName(S.st)) + ' had a seat in this Congress but no boundary was recorded, so it is not drawn.</p>' +
        '<section class="mp-sec"><h3 class="mp-sec-h">' + (houseRole(P) === 'Delegate' ? 'Delegate' : 'House') + '</h3>' +
        keys.map(k => seatBlock(P.house[k], houseRole(P) + (keys.length > 1 ? ' · seat ' + k : ''), keys.length === 1, yearWindow(c), 'h')).join('') + '</section>' + senateBlocks() + governorBlock();
    } else if (!V.sgeo) {
      title = stName(S.st);
      const info = L.index.states && L.index.states[S.st];
      const later = info && info.admitted && info.admitted > viewDate(c);
      sum = later ? 'Not yet a state in ' + S.year : V.outlineOnly ? 'No members seated in ' + S.year : 'No map for ' + S.year;
      h = '<div class="mp-emptycard"><p>' + esc(later ? stName(S.st) + ' joined the Union on ' + M.fmtDate(info.admitted) + '.' : (V.outlineOnly ? 'No members were seated: ' + stName(S.st) + ' had seceded. Its House seats stayed empty until it was readmitted.' : 'No district map for ' + stName(S.st) + ' in ' + S.year + '.')) + '</p>' + (later ? '<button type="button" class="btn ghost" data-go-year="' + (+info.admitted.slice(0, 4) + 1) + '">Go to ' + (+info.admitted.slice(0, 4) + 1) + '</button>' : '') + '</div>' +
        (!later && V.people ? senateBlocks() + governorBlock() : '');
    } else if (S.d == null || !V.sgeo.districts[S.st + '-' + S.d]) {
      title = stName(S.st);
      const ids = districtsOf(V.sgeo);
      const counts = {};
      ids.forEach(id => { const pr = primaryOf(seatInfo(id.split('-')[1])); const k = pr ? (pr.vacant ? 'Vacant' : M.partyName(pr.party)) : 'No data'; counts[k] = (counts[k] || 0) + 1; });
      sum = ids.length + (ids.length === 1 ? ' district · ' : ' districts · ') + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' ' + k).join(', ');
      const missing = S.d != null ? '<p class="mp-note">' + esc(distName(S.st, S.d)) + ' did not exist in ' + S.year + '.</p>' : '';
      h = missing + '<section class="mp-sec"><h3 class="mp-sec-h">House districts</h3><ul class="mp-dlist">' + ids.map(id => {
          const dn = id.split('-')[1], info = seatInfo(dn), pr = primaryOf(info);
          const plural = info && info.length > 1;
          const nm = plural ? info.length + ' members elected statewide' : pr ? (pr.vacant ? 'Vacant' : personName(pr.id)) : 'No data';
          return '<li><button type="button" class="mp-drow ' + (pr ? (pr.vacant ? 'p-vac' : partyClass(pr.party)) : 'p-none') + '" data-go-d="' + esc(dn) + '"><span class="mp-dn">' + (dn === '0' ? 'AL' : esc(dn)) + '</span><span class="mp-dname">' + esc(nm) + '</span>' +
            (pr && !pr.vacant && !plural ? '<span class="mp-dp" aria-label="' + esc(M.partyName(pr.party)) + '">' + esc(M.partyLetter(pr.party)) + '</span>' : '') +
            (S.ghost && V.changed && V.changed[id] ? '<span class="mp-tag">changed</span>' : '') + '</button></li>';
        }).join('') + '</ul></section>' + historyBlock(null);
      h = senateBlocks() + governorBlock() + h + delegationChart();
    } else {
      const dn = S.d;
      title = distName(S.st, dn);
      const info = seatInfo(dn) || [];
      const P = V.people || {};
      const role = houseRole(P);
      const win = yearWindow(c);
      const pr = primaryOf(info);
      sum = info.length > 1 ? info.length + ' members elected statewide' : pr ? (pr.vacant ? 'Vacant on ' + M.fmtShort(viewDate(c)) : personName(pr.id) + ' · ' + M.partyName(pr.party)) : 'No House data';
      h = '<section class="mp-sec"><h3 class="sr-only">House</h3>' +
        (info.length ? info.map((x, i) => (info.length > 1 ? '<div class="mp-seatkey mp-label">Seat ' + (i + 1) + '</div>' : '') + seatBlock(x.list, role, info.length === 1, win, 'h')).join('') : '<p class="mp-note">No House data for this district yet.</p>') +
        '</section>' + historyBlock(dn) + (info.length === 1 ? seatTimeline(dn) : '') + senateBlocks() + governorBlock();
    }
    el.pcrumbs.innerHTML = crumbs.map(([k, l]) => '<button type="button" data-crumb="' + k + '">' + esc(l) + '</button>').join('<span class="sep" aria-hidden="true">›</span>') + (crumbs.length ? '' : '<span class="here">Overview, ' + S.year + '</span>');
    el.ptitle.textContent = title;
    el.psum.textContent = sum;
    el.psum.classList.toggle('is-dup', !!(S.st && S.d != null && V.sgeo && V.sgeo.districts[S.st + '-' + S.d]));
    if (V.zipMsg && S.st) h = '<div class="mp-zipnote"><p>' + esc(V.zipMsg) + '</p></div>' + h;
    if (V.pin && V.pin.note && S.st) h = '<div class="mp-zipnote"><p>' + esc(V.pin.name) + ' is placed in ' + esc(S.d != null ? distName(S.st, S.d, true) : stName(S.st)) + '. ZIPs can cross district lines.</p><details><summary>How we place ZIPs</summary><p>' + esc(V.pin.note) + '</p></details></div>' + h;
    el.pcontent.innerHTML = h;
    const sr = el.grip.querySelector('.sr-only'); if (sr) sr.textContent = (sheet === 'peek' ? 'Expand' : 'Collapse') + ' details: ' + title;
  }
  el.pcrumbs.addEventListener('click', e => {
    const b = e.target.closest('[data-crumb]'); if (!b) return;
    if (b.getAttribute('data-crumb') === 'us') { S.st = null; S.d = null; } else S.d = null;
    writeURL('push'); render(); refocus = 'panel-title';
  });
  el.pcontent.addEventListener('change', e => { if (e.target.id === 'mp-jump' && e.target.value) selectState(e.target.value); });
  el.panel.addEventListener('load', e => { const t = e.target; if (t && t.tagName === 'IMG') t.classList.add('is-on'); }, true);
  function availableYears() {
    if (V._avail) return V._avail;
    const ys = []; for (let y = Y0; y <= Y1; y++) { const c = L.congressFor(y); if (c && c.geo) ys.push(y); }
    return (V._avail = ys);
  }
  function emptyMessage() {
    const ys = availableYears();
    if (!ys.length) return 'No map data yet.';
    if (L.index.sample) return 'This preview only has maps for ' + ys[0] + ' to ' + ys[ys.length - 1] + '. The full history is on its way.';
    return 'No district map for ' + S.year + ' yet.';
  }
  function nearestButton() {
    const ys = availableYears(); if (!ys.length) return '';
    const near = ys.reduce((a, b) => Math.abs(b - S.year) < Math.abs(a - S.year) ? b : a);
    return '<button type="button" class="btn ghost" data-go-year="' + near + '">Go to ' + near + '</button>';
  }
  el.pcontent.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-go-st')) { selectState(b.getAttribute('data-go-st')); }
    else if (b.hasAttribute('data-go-d')) { S.d = b.getAttribute('data-go-d'); writeURL('push'); render(); refocus = 'panel-title'; }
    else if (b.hasAttribute('data-go-up')) { goUp(); refocus = 'panel-title'; }
    else if (b.hasAttribute('data-go-year')) { setYear(+b.getAttribute('data-go-year'), 'push'); }
    else if (b.hasAttribute('data-career')) {
      const [st, kind, seat, y] = b.getAttribute('data-career').split('|');
      stopPlay(); V.pin = null; S.year = +y; S.st = st; S.d = kind === 'h' ? String(parseInt(seat, 10) || 0) : null;
      writeURL('push'); render(); refocus = 'panel-title';
    }
  });
  el.pcontent.addEventListener('click', e => {
    const svg = e.target.closest('.mp-dg svg'); if (!svg) return;
    const D = delegation(); if (!D) return;
    const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(D.length - 1, Math.floor((e.clientX - r.left) / r.width * D.length)));
    setYear(D[i].y, 'push');
  });
  el.panel.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG') { t.remove(); } }, true);

  /* ======================= table view ======================= */
  function renderTable() {
    let h = '';
    if (!V.c || !V.nation) { h = '<p class="mp-note">' + esc(emptyMessage()) + '</p>'; el.tableNote.textContent = ''; }
    else if (S.st && V.sgeo) {
      const ids = districtsOf(V.sgeo);
      el.tableNote.textContent = stName(S.st) + ', ' + S.year + ' · ' + ids.length + (ids.length === 1 ? ' district' : ' districts');
      h = '<table class="mp-tbl"><caption class="sr-only">House districts of ' + esc(stName(S.st)) + ' in ' + S.year + ' (' + esc(congLabel(V.c)) + ')</caption><thead><tr><th scope="col">District</th><th scope="col">Representative on ' + esc(M.fmtShort(viewDate(V.c))) + '</th><th scope="col">Party</th><th scope="col">Others this year</th>' + (S.ghost ? '<th scope="col">Lines</th>' : '') + '</tr></thead><tbody>' +
        ids.map(id => {
          const dn = id.split('-')[1], info = seatInfo(dn) || [];
          const rows = info.length ? info : [{ segs: [] }];
          return rows.map((x, i) => {
            const pr = x.segs.find(s => s.primary);
            const others = x.segs.filter(s => !s.primary).map(s => s.vacant ? 'Vacant (' + M.fmtShort(s.from) + ')' : personName(s.id) + ' (' + M.partyLetter(s.party) + ')').join('; ');
            return '<tr><th scope="row"><button type="button" class="mp-tlink" data-go-d="' + esc(dn) + '">' + esc(distName(S.st, dn, true)) + (rows.length > 1 ? ' seat ' + (i + 1) : '') + '</button></th><td>' + (pr ? (pr.vacant ? 'Vacant' : esc(personName(pr.id))) : 'No data') + '</td><td>' + (pr && !pr.vacant ? esc(M.partyName(pr.party)) : '–') + '</td><td>' + esc(others || '–') + '</td>' +
              (S.ghost ? '<td>' + (V.prev ? (V.changed && V.changed[id] ? 'Changed' : 'Same') : 'No earlier map') + '</td>' : '') + '</tr>';
          }).join('');
        }).join('') + '</tbody></table>';
    } else {
      const ids = V.nationIds || [];
      el.tableNote.textContent = 'States, ' + S.year + ' · ' + ids.length;
      h = '<table class="mp-tbl"><caption class="sr-only">States on the map in ' + S.year + '</caption><thead><tr><th scope="col">State</th><th scope="col">House delegation</th>' + (S.ghost ? '<th scope="col">District map</th>' : '') + '</tr></thead><tbody>' +
        ids.map(st => { const c = V.summary && V.summary.house && V.summary.house[st];
          return '<tr><th scope="row"><button type="button" class="mp-tlink" data-go-st="' + esc(st) + '">' + esc(stName(st)) + '</button></th><td>' + esc(delegationText(c) || '–') + '</td>' + (S.ghost ? '<td>' + (V.redrawn && V.redrawn.has(st) ? 'New this Congress' : 'Unchanged') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>';
    }
    el.table.innerHTML = h;
  }
  el.table.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-go-st')) selectState(b.getAttribute('data-go-st'));
    else if (b.hasAttribute('data-go-d')) { S.d = b.getAttribute('data-go-d'); writeURL('push'); render(); }
  });

  /* ======================= main render ======================= */
  let loadingTimer = 0;
  function setLoading(on) {
    clearTimeout(loadingTimer);
    if (on) loadingTimer = setTimeout(() => el.loading.classList.add('on'), 160); else el.loading.classList.remove('on');
  }
  function render() {
    const my = ++token;
    const c = L.congressFor(S.year);
    updateReadout(c);
    if (!c || !c.geo) {
      V = Object.assign(V, { c, nation: null, sgeo: null, people: null, prev: null, history: null, changed: null });
      clearMap(); el.empty.textContent = emptyMessage(); el.empty.hidden = false;
      renderPanel(); renderTable(); drawLegend(); syncChips(); setLoading(false);
      announceState();
      return Promise.resolve();
    }
    el.empty.hidden = true;
    setLoading(true);
    return Promise.all([L.nation(c), L.summary(c.n), L.changes()]).then(([nation, summary, changes]) => {
      if (my !== token) return;
      V.c = c; V.nation = nation; V.summary = summary; V.changes = changes;
      if (S.mode === 'g') {
        // B's summaries give the governor's party on 1 July of each year (governors change in second years too)
        const gy = summary && summary.governorByYear && summary.governorByYear[S.year];
        if (gy) { V.gov = gy; V.govKey = 'y' + S.year; }
        else if (summary && summary.governor && !summary.governorByYear) { V.gov = summary.governor; V.govKey = 'c' + c.n; }
        else if (V.govKey !== S.year + '') {
          const d = viewDate(c), sts = Object.keys(nation.states);
          return Promise.all(sts.map(st => L.people(st).catch(() => null))).then(files => {
            if (my !== token) return;
            const g = {}; files.forEach((P, i) => { if (!P) return; const x = M.holderOn(P.governor || [], d); if (x && x.party) g[sts[i]] = x.party; });
            V.gov = g; V.govKey = S.year + '';
            return render();
          });
        }
      }
      V.prevSummary = null; L.summary(c.n - 1).then(ps => { if (my === token && ps) { V.prevSummary = ps; if (!S.st) renderPanel(); } }).catch(() => {});
      drawNation(c, nation, summary);
      V.noShape = !!(S.st && !nation.states[S.st] && (c.noShape || []).indexOf(S.st) >= 0); V.outlineOnly = false;
      if (!S.st || !nation.states[S.st]) {
        V.sgeo = null; V.people = null; V.prev = null; V.history = null; V.changed = null;
        if (S.st && !L.index.states[S.st] && !nation.states[S.st] && !V.noShape) { S.st = null; S.d = null; writeURL('replace'); }
        const extra = [];
        if (S.st && (V.noShape || (L.index.states[S.st] && L.stateExisted(S.st, viewDate(c))))) extra.push(L.people(S.st).then(p => { V.people = p; return L.bios(neededIds()); }).then(b => { V.bios = Object.assign(V.bios || {}, b); }).catch(() => null));
        if (!S.st && V.national === undefined && L.hasHistory('national')) { V.national = null; L.json('history/national.json').then(n => { V.national = n; if (!S.st) renderPanel(); }).catch(() => { V.national = false; }); }
        return Promise.all(extra).then(() => finish(my));
      }
      const st = S.st;
      const pc = L.congressByN(c.n - 1);
      const curFile = L.stateFileN(st, c.n, changes), prevFile = pc ? L.stateFileN(st, pc.n, changes) : null;
      const wantPrev = S.ghost && pc && pc.geo && prevFile !== null && L.stateExisted(st, pc.end);
      return Promise.all([
        L.stateGeo(st, c.n, changes),
        L.people(st).catch(() => null),
        wantPrev ? L.stateGeo(st, pc.n, changes).catch(() => null) : Promise.resolve(null),
        S.ghost ? L.history(st).catch(() => null) : Promise.resolve(null)
      ]).then(([sgeo, people, prev, hist]) => {
        if (my !== token) return;
        V.outlineOnly = !!(sgeo && !Object.keys(sgeo.districts || {}).length);
        V.sgeo = V.outlineOnly ? null : sgeo; V.people = people; V.prev = V.outlineOnly ? null : prev; V.history = hist;
        if (V.outlineOnly) { V.changed = {}; return L.bios(neededIds()).then(b => { if (my !== token) return; V.bios = Object.assign(V.bios || {}, b); return finish(my); }); }
        V.changed = {};
        if (prev) for (const id of Object.keys(sgeo.districts)) { const o = prev.districts[id]; V.changed[id] = !o || (o.h && sgeo.districts[id].h ? o.h !== sgeo.districts[id].h : o.d !== sgeo.districts[id].d); }
        const ids = neededIds();
        return L.bios(ids).then(b => { if (my !== token) return; V.bios = Object.assign(V.bios || {}, b); return finish(my); });
      });
    }).catch(err => {
      if (my !== token) return;
      setLoading(false);
      V.sgeo = null;
      clearDistricts();
      showRetry('This map could not be loaded. Check your connection and try again.', () => render());
      el.empty.hidden = false;
      renderPanel();
      if (window.console && console.warn) console.warn('[map]', err && err.message);
    });
  }
  function neededIds() {
    const P = V.people, ids = new Set(); if (!P) return [];
    const [a, b] = fullYear();
    const add = list => M.segments(list || [], a, b, a).forEach(s => { if (!s.vacant) ids.add(s.id); });
    Object.values(P.house || {}).forEach(add); Object.values(P.senate || {}).forEach(add); add(P.governor);
    if (S.d != null) M.seatKeys(P.house, S.d).forEach(k => ((P.house || {})[k] || []).forEach(x => ids.add(x.id)));   // the seat's full history
    return Array.from(ids);
  }
  function finish(my) {
    if (my !== token) return;
    setLoading(false);
    drawDistricts();
    zoomToCurrent();
    drawLegend(); syncChips(); crumbs(); syncCmp(); syncMode(); drawBalance();
    if (isPhone()) { const H = SHEET(); if (sheet === 'peek') applySheet(H.peek, false); } if (CMP.on) drawCmp();
    el.wrap.classList.remove('is-skel');
    if (S.st) dismissOnboard();
    preload();
    // the panel and table are built a frame later, so the map paints first (opening a 52-district state on a slow phone)
    clearTimeout(panelT); cancelAnimationFrame(panelR);
    const paint = () => {
      if (my !== token) return;
      const prevKey = V.panelKey, key = (S.st || '') + '|' + (S.d || '');
      renderPanel(); renderTable(); fadeCached();
      if (prevKey !== key) {
        V.panelKey = key;
        el.pbody.scrollTop = 0;
        if (!reduced()) { el.pcontent.classList.remove('is-swap'); void el.pcontent.offsetWidth; el.pcontent.classList.add('is-swap'); }
      }
      if (refocus) {
        const id = refocus; refocus = null;
        const t = id === 'panel-title' ? el.ptitle : id === 'first-district' ? (mapShapes()[0] || el.ptitle) : $(id);
        if (t) { if (t === el.ptitle) t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: isPhone() }); } catch (e) { t.focus(); } }
      }
    };
    // while the timeline is being dragged or played, only the map redraws each frame; the panel and table follow when it settles
    if (dragging || playing) panelT = setTimeout(paint, playing ? 0 : 140);
    else panelR = requestAnimationFrame(paint);
    announceState();
  }
  let panelT = 0, panelR = 0;
  function fadeCached() { el.pcontent.querySelectorAll('img').forEach(i => { if (i.complete && i.naturalWidth) i.classList.add('is-on'); }); }
  // fetch the neighbouring Congresses in idle time so scrubbing and Play stay smooth
  let preloadT = 0;
  function preload() {
    clearTimeout(preloadT);
    preloadT = setTimeout(() => {
      if (!V.c) return;
      [V.c.n + 1, V.c.n - 1].forEach(n => {
        const c = L.congressByN(n); if (!c || !c.geo) return;
        L.nation(c).catch(() => {}); L.summary(n).catch(() => {});
        if (S.st && V.changes && L.stateFileN(S.st, n, V.changes) !== null && L.stateExisted(S.st, c.start)) L.stateGeo(S.st, n, V.changes).catch(() => {});
      });
    }, playing ? 0 : (preload.first ? 400 : (preload.first = 2500)));
  }
  // first-visit hint
  const ONB = 'mp.onboarded';
  function showOnboard() {
    let seen = false; try { seen = localStorage.getItem(ONB) === '1'; } catch (e) { /* storage blocked */ }
    if (seen || S.st) return;
    el.onboard.hidden = false;
    if (isPhone()) { setTimeout(dismissOnboard, 6000); ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, function once(e) { if (el.onboard.contains(e.target)) return; document.removeEventListener(t, once, true); setTimeout(dismissOnboard, 400); }, true)); }
  }
  function dismissOnboard() { if (el.onboard.hidden) return; el.onboard.hidden = true; if (isPhone()) requestAnimationFrame(() => SHEET()); try { localStorage.setItem(ONB, '1'); } catch (e) { /* storage blocked */ } }
  el.onboardX.addEventListener('click', dismissOnboard);
  el.track.addEventListener('pointerdown', dismissOnboard);
  function announceState() {
    let m = S.year + ', ' + congLabel(V.c, S.year).replace(' · ', ', ');
    if (S.st) m += '. ' + (S.d != null && V.sgeo && V.sgeo.districts[S.st + '-' + S.d] ? distName(S.st, S.d) + ': ' + (function () { const pr = primaryOf(seatInfo(S.d)); return pr ? (pr.vacant ? 'vacant' : personName(pr.id) + ', ' + M.partyName(pr.party)) : 'no data'; })() : stName(S.st) + (V.sgeo ? ', ' + districtsOf(V.sgeo).length + ' districts' : ''));
    if (!V.nation) m += '. ' + emptyMessage();
    announce(m);
  }
  // a friendly message with a Try again button, in place of a blank map
  function showRetry(msg, again) {
    el.empty.innerHTML = '<p>' + esc(msg) + '</p><button type="button" class="btn" id="mp-retry">Try again</button>';
    el.empty.hidden = false;
    const b = $('mp-retry'); b.addEventListener('click', () => { el.empty.hidden = true; again(); });
    announce(msg);
  }
  window.addEventListener('online', () => { if (!el.empty.hidden && $('mp-retry')) $('mp-retry').click(); });
  function clearDistricts() { el.gDist.textContent = ''; el.gGhost.textContent = ''; el.gChg.textContent = ''; const o = el.gLabels.querySelector('.mp-lab-dist'); if (o) o.remove(); }
  function clearMap() { clearDistricts(); el.gStates.textContent = ''; el.gLabels.textContent = ''; drawnNation = null; lift(null); }
  function crumbs() {
    let h = '';
    if (S.st) h = '<button type="button" class="mp-crumb" data-crumb="' + (S.d != null && V.sgeo && V.sgeo.districts[S.st + '-' + S.d] ? 'st' : 'us') + '"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' + esc(S.d != null && V.sgeo && V.sgeo.districts[S.st + '-' + S.d] ? stName(S.st) : 'United States') + '</button>';
    el.crumbs.innerHTML = h;
  }
  el.crumbs.addEventListener('click', e => {
    const b = e.target.closest('[data-crumb]'); if (!b) return;
    if (b.getAttribute('data-crumb') === 'us') { const st = S.st; S.st = null; S.d = null; refocus = 'mp-s-' + st; }
    else S.d = null;
    writeURL('push'); render();
  });

  /* ======================= timeline ======================= */
  const pct = y => (y - Y0) / (Y1 - Y0) * 100;
  function buildTimeline() {
    el.thumb.setAttribute('aria-valuemin', Y0); el.thumb.setAttribute('aria-valuemax', Y1);
    let h = '';
    for (let y = 1790; y <= Y1; y += 10) {
      const lab = y % 50 === 0 ? '<span>' + y + '</span>' : '';
      h += '<i class="mp-tick' + (y % 50 === 0 ? ' big' : '') + '" style="left:' + pct(y).toFixed(3) + '%">' + lab + '</i>';
    }
    el.ticks.innerHTML = h;
    // where map data exists
    const ys = availableYears(); let runs = [], s = null, p = null;
    ys.forEach(y => { if (s === null) s = y; else if (y !== p + 1) { runs.push([s, p]); s = y; } p = y; });
    if (s !== null) runs.push([s, p]);
    el.avail.innerHTML = runs.map(([a, b]) => '<i style="left:' + pct(a).toFixed(3) + '%;width:' + Math.max(0.5, pct(b + 1) - pct(a)).toFixed(3) + '%"></i>').join('');
    el.avail.classList.toggle('is-full', ys.length >= (Y1 - Y0 + 1) - 2);
    el.eras.innerHTML = ERAS.map(e => { const a = Math.max(Y0, e[0]), b = Math.min(Y1 + 1, e[1]); return '<i data-a="' + e[0] + '" style="left:' + pct(a).toFixed(3) + '%;width:' + (pct(b) - pct(a)).toFixed(3) + '%" title="' + e[3] + ', ' + e[0] + '–' + (e[1] > Y1 ? 'today' : e[1]) + '"><b>' + e[2] + '</b></i>'; }).join('');
    requestAnimationFrame(fitEras);
    el.chips.innerHTML = CHIPS.map(([y, l, hot]) => '<button type="button" class="mp-chip' + (hot ? ' mp-chip-hot' : '') + '" data-y="' + y + '" aria-pressed="false">' + l + '</button>').join('');
  }
  // era labels: the current era always shows; the others show only with 8px of clearance
  // era labels: the current era's label is never clipped (it may extend past its band, centred, but stays inside the track);
  // every other label shows only if it fits its band and keeps 8px from the labels already placed
  function fitEras() {
    const bs = Array.from(el.eras.querySelectorAll('b'));
    const tr = el.eras.getBoundingClientRect();
    const placed = [];
    const onB = bs.filter(b => b.parentNode.classList.contains('on'));
    const rest = bs.filter(b => !b.parentNode.classList.contains('on'));
    onB.concat(rest).forEach(b => {
      const on = b.parentNode.classList.contains('on');
      b.classList.remove('cut', 'free'); b.style.removeProperty('--shift');
      if (on) {
        b.classList.add('free');
        let r = b.getBoundingClientRect();
        const shift = r.left < tr.left ? tr.left - r.left : r.right > tr.right ? tr.right - r.right : 0;
        if (shift) { b.style.setProperty('--shift', shift + 'px'); r = b.getBoundingClientRect(); }
        placed.push([r.left, r.right]);
        return;
      }
      const over = b.scrollWidth > b.clientWidth + 1, r = b.getBoundingClientRect(), tw = Math.min(b.scrollWidth, b.clientWidth), l = r.left + (r.width - tw) / 2;
      if (over || placed.some(p => l < p[1] + 8 && l + tw > p[0] - 8)) b.classList.add('cut'); else placed.push([l, l + tw]);
    });
  }
  window.addEventListener('resize', () => requestAnimationFrame(fitEras));
  function updateReadout(c) {
    el.year.textContent = S.year;
    const cl = congLabel(c, S.year).split(' · ');
    const yy = (cl[1] || '').split('–');
    el.cong.innerHTML = esc(cl[0]).replace(' Congress', '<span class="mp-cong-n"> Congress</span>') + '<span class="mp-cong-y"> · ' + esc(cl[1] || '') + '</span>' + (yy.length === 2 ? '<span class="mp-cong-ys"> · ' + esc(yy[0] + '–' + yy[1].slice(2)) + '</span>' : '');
    el.thumb.setAttribute('aria-valuenow', S.year);
    el.thumb.setAttribute('aria-valuetext', S.year + ', ' + congLabel(c, S.year).replace(' · ', ', '));
    el.flag.textContent = S.year;
    el.time && el.time.classList.toggle('is-elect', isElect(c));
    const era = eraOf(S.year);
    if (isElect(c)) { el.era.textContent = 'Congress-elect'; for (const i of el.eras.children) i.classList.toggle('on', +i.getAttribute('data-a') === era[0]); }
    else if (el.era.textContent !== era[3]) { el.era.textContent = era[3]; for (const i of el.eras.children) i.classList.toggle('on', +i.getAttribute('data-a') === era[0]); fitEras(); }
    const p = pct(S.year).toFixed(3) + '%';
    el.thumb.style.left = p; el.fill.style.width = p;
  }
  function syncChips() {
    if (el.moments) for (const b of el.moments.querySelectorAll('.mp-moment')) { const on = +b.getAttribute('data-y') === S.year; b.classList.toggle('is-on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); } for (const b of el.chips.children) b.setAttribute('aria-pressed', String(+b.getAttribute('data-y') === S.year)); }
  let renderTimer = 0;
  function setYear(y, mode) {
    y = Math.max(Y0, Math.min(Y1, Math.round(y)));
    if (y === S.year && mode !== 'push') return;
    S.year = y;
    updateReadout(L.congressFor(y));
    cancelAnimationFrame(renderTimer);
    if (mode === 'drag') { hideCallouts(); renderTimer = requestAnimationFrame(render); }
    else render();
    if (mode !== 'drag') writeURL(mode === 'push' ? 'push' : 'replace');
  }
  el.chips.addEventListener('click', e => { const b = e.target.closest('[data-y]'); if (!b) return; stopPlay(); setYear(+b.getAttribute('data-y'), 'push'); });
  let trackRect = null;     // measured once per drag: reading layout on every pointer move stalls slow phones
  function yearFromX(x) { const r = trackRect || el.track.getBoundingClientRect(); return Y0 + (Math.max(0, Math.min(r.width, x - r.left)) / r.width) * (Y1 - Y0); }
  let dragging = false;
  el.track.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    stopPlay(); dragging = true; trackRect = el.track.getBoundingClientRect(); el.track.setPointerCapture(e.pointerId); el.track.classList.add('is-drag');
    setYear(yearFromX(e.clientX), 'drag'); el.thumb.focus({ preventScroll: true }); e.preventDefault();
  });
  el.track.addEventListener('pointermove', e => { if (dragging) setYear(yearFromX(e.clientX), 'drag'); });
  const endDrag = () => { if (!dragging) return; dragging = false; trackRect = null; scheduleFit(); el.track.classList.remove('is-drag'); writeURL('push'); };
  el.track.addEventListener('pointerup', endDrag); el.track.addEventListener('pointercancel', endDrag);
  el.thumb.addEventListener('keydown', e => {
    const step = e.shiftKey ? 10 : 1;
    const k = e.key; let y = null;
    if (k === 'ArrowRight' || k === 'ArrowUp') y = S.year + step;
    else if (k === 'ArrowLeft' || k === 'ArrowDown') y = S.year - step;
    else if (k === 'PageUp') y = S.year + 10; else if (k === 'PageDown') y = S.year - 10;
    else if (k === 'Home') y = Y0; else if (k === 'End') y = Y1;
    if (y === null) return;
    e.preventDefault(); stopPlay(); setYear(y, 'replace');
  });
  el.thumb.addEventListener('blur', () => writeURL('replace'));

  function stopPlay() {
    if (!playing) return;
    playing = false; clearTimeout(playTimer);
    el.play.setAttribute('aria-pressed', 'false'); el.play.setAttribute('aria-label', 'Play through the years');
    writeURL('push'); announceState();
  }
  function startPlay() {
    if (S.year >= Y1) setYear(Y0, 'replace');
    playing = true; el.speed.hidden = false;
    el.play.setAttribute('aria-pressed', 'true'); el.play.setAttribute('aria-label', 'Pause');
    const tick = () => {
      if (!playing) return;
      const next = S.year + 2 - ((S.year - 1789) % 2 ? 1 : 0);  // one Congress at a time (odd years)
      if (next > Y1) { setYear(Y1, 'replace'); stopPlay(); return; }
      setYear(next, 'replace');
      playTimer = setTimeout(tick, (reduced() ? 1100 : 800) / SPEEDS[speedI]);
    };
    playTimer = setTimeout(tick, 250);
  }
  el.play.addEventListener('click', () => { if (playing) stopPlay(); else startPlay(); });
  function stepCongress(dir) {
    stopPlay();
    const c = L.congressFor(S.year) || null, n = (c ? c.n : congNfor(S.year)) + dir;
    const t = L.congressByN(n);
    let y = t ? +t.start.slice(0, 4) + (t.start.slice(5) > '07-01' ? 1 : 0) : S.year + 2 * dir;
    if (y === S.year) y += dir;
    setYear(y, 'push');
  }
  $('mp-prev').addEventListener('click', () => stepCongress(-1));
  $('mp-next').addEventListener('click', () => stepCongress(1));
  const SPEEDS = [1, 2, 4]; let speedI = 0;
  el.speed.addEventListener('click', () => { speedI = (speedI + 1) % SPEEDS.length; el.speed.textContent = SPEEDS[speedI] + '×'; el.speed.setAttribute('aria-label', 'Playback speed: ' + SPEEDS[speedI] + ' times'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlay(); });

  /* ======================= ?q deep link ======================= */
  // /map/?q=R000606 (bioguide id), /map/?q=Q7983732 (Wikidata id for governors) or /map/?q=Jamie%20Raskin (a name)
  function openPerson(q) {
    const nq = norm(q);
    return L.searchRows().then(rows => {
      let mine = rows.filter(r => r[0].toLowerCase() === q.toLowerCase());
      if (!mine.length) mine = rows.filter(r => norm(r[1]) === nq);
      if (!mine.length) { const toks = nq.split(/\s+/); mine = rows.filter(r => { const w = norm(r[1]).split(/[\s.,-]+/); return toks.every(t => w.some(x => x.startsWith(t))); }); }
      if (!mine.length) { S.q = null; writeURL('replace'); render(); announce('No person found for ' + q + '.'); return; }
      // one person: the id with the most recent tenure
      mine.sort((a, b) => (b[5] > a[5] ? 1 : -1));
      const id = mine[0][0], r = mine.filter(x => x[0] === id).sort((a, b) => (b[5] > a[5] ? 1 : -1))[0];
      const fy = +r[5].slice(0, 4) + (r[5].slice(5) > '07-01' ? 1 : 0);
      let ty = r[6] ? +r[6].slice(0, 4) - (r[6].slice(5) <= '07-01' ? 1 : 0) : Math.max(fy, NOW_YEAR);
      ty = Math.min(Y1, Math.max(fy, ty));
      let y = ty; while (y > fy && !(L.congressFor(y) || {}).geo) y--;
      S.year = y; S.st = r[2]; S.d = r[3] === 'h' ? String(parseInt(r[4], 10) || 0) : null; S.q = null;
      V.focusId = id;
      writeURL('replace');
      return render().then(() => {
        openSheet('half');
        const card = Array.from(el.pcontent.querySelectorAll('.mp-card-lg')).find(c => c.querySelector('.mp-name'));
        if (card && !isPhone()) card.scrollIntoView({ block: 'nearest' });
        el.ptitle.setAttribute('tabindex', '-1'); el.ptitle.focus({ preventScroll: true });
        announce(personName(id) + '.');
      });
    }).catch(() => { S.q = null; writeURL('replace'); return render(); });
  }

  /* ======================= colour mode ======================= */
  function syncMode() {
    if (!el.modeSeg) return;
    el.modeSeg.hidden = !!(S.st && V.sgeo);
    el.modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === S.mode)));
  }
  if (el.modeSeg) el.modeSeg.addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b || b.getAttribute('data-m') === S.mode) return;
    S.mode = b.getAttribute('data-m'); writeURL('replace'); syncMode(); render(); dismissOnboard();
    announce('Colouring states by ' + ({ h: 'House delegation', s: 'Senate delegation', g: 'governor' })[S.mode] + '.');
  });

  /* ======================= national balance strip ======================= */
  function drawBalance() {
    if (!el.bal) return;
    const sm = V.summary; if (!sm || !V.nation) { el.bal.hidden = true; return; }
    const isState = votingState;
    const tot = by => { const o = {}; Object.entries(by || {}).forEach(([st, c]) => { if (isState(st)) Object.entries(c || {}).forEach(([p, n]) => { const k = M.partyKey(p); o[k] = (o[k] || 0) + n; }); }); return o; };
    const rows = [['House', tot(sm.house)], ['Senate', tot(sm.senate)]].filter(r => Object.keys(r[1]).length);
    if (!rows.length) { el.bal.hidden = true; return; }
    el.bal.hidden = false;
    const order = ['dem', 'rep', 'whig', 'fed', 'dr', 'oth'];
    const html = rows.map(([lab, c]) => {
      const n = Object.values(c).reduce((a, b) => a + b, 0);
      const parts = order.filter(k => c[k]).sort((a, b) => c[b] - c[a]);
      const lead = parts[0], need = Math.floor(n / 2) + 1;
      const shown = order.filter(k => c[k]);
      return '<div class="mp-bal-row" data-row="' + lab + '"><span class="mp-bal-l">' + lab + '</span>' +
        '<span class="mp-bal-bar" role="img" aria-label="' + esc(lab + ', ' + S.year + ': ' + parts.map(k => c[k] + ' ' + (k === 'oth' ? 'other' : M.PARTY_KEYS[k][0])).join(', ') + '. ' + need + ' needed for a majority.') + '">' +
        order.map(k => '<i class="p-' + k + '" style="flex-grow:' + (c[k] || 0) + '"></i>').join('') + '<b class="mp-bal-mid" aria-hidden="true" title="' + need + ' for a majority"></b></span>' +
        '<span class="mp-bal-n" aria-hidden="true">' + shown.slice(0, 3).map(k => '<span class="p-' + k + '"><i></i>' + (k === 'oth' ? 'O' : M.PARTY_KEYS[k][1]) + ' ' + c[k] + '</span>').join('') + '<span class="mp-bal-need">' + need + ' to win</span></span></div>';
    }).join('');
    // update in place so the segments animate between years
    const sig = rows.map(r => r[0]).join();
    if (el.bal._sig !== sig) { el.bal.innerHTML = html; el.bal._sig = sig; return; }
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    tmp.querySelectorAll('.mp-bal-row').forEach(nr => {
      const or = el.bal.querySelector('[data-row="' + nr.getAttribute('data-row') + '"]'); if (!or) return;
      const ob = or.querySelector('.mp-bal-bar'), nb = nr.querySelector('.mp-bal-bar');
      ob.setAttribute('aria-label', nb.getAttribute('aria-label'));
      nb.querySelectorAll('i').forEach((ni, j) => { const oi = ob.querySelectorAll('i')[j]; if (oi) oi.style.flexGrow = ni.style.flexGrow; });
      or.querySelector('.mp-bal-n').innerHTML = nr.querySelector('.mp-bal-n').innerHTML;
    });
  }

  /* ======================= guided tours ======================= */
  // Steps set the year, state and view. Text comes from workstream D's sourced files (ref: [file, event title]);
  // steps without a ref only describe what the map itself shows. {seats} = voting House seats filled on 1 July.
  const TOURS = [
    { id: 'reconstruction', title: 'Reconstruction and the empty Southern seats', steps: [
      { y: 1860, t: 'Before the war', text: 'In 1860 every state had members in the House: {seats} voting seats were filled on July 1.' },
      { y: 1862, t: 'Secession', text: 'After secession, the hatched states had no members seated. Their House seats stayed empty.' },
      { y: 1866, t: 'The war ends', text: 'Even after the war ended, most of the former Confederate states were still not seated in the House. The hatched states had no members seated.' },
      { y: 1868, t: 'Readmission', text: 'By 1868 most of the South was seated again. On this map, only Texas is still hatched.' },
      { y: 1873, st: 'GA', t: 'A larger South', ref: ['GA', '1870 census apportionment'] }
    ] },
    { id: '435', title: 'How the House grew to 435', steps: [
      { y: 1789, t: 'The first House', text: 'The first House met in 1789. {seats} voting seats were filled on July 1.' },
      { y: 1843, t: 'Districts required', ref: ['national', 'Apportionment Act of 1842'] },
      { y: 1913, t: '435 seats', ref: ['national', 'The House reaches 435 seats'] },
      { y: 1925, t: 'A skipped census', ref: ['national', 'No reapportionment after the 1920 census'] },
      { y: 1933, t: 'Fixed at 435', ref: ['national', 'Permanent Apportionment Act'] }
    ] },
    { id: 'oneperson', title: 'One person, one vote (1962–64)', steps: [
      { y: 1962, t: 'Courts step in', ref: ['national', 'Baker v. Carr'] },
      { y: 1964, st: 'GA', d: 5, t: 'Atlanta’s district', ref: ['GA', 'Wesberry v. Sanders'] },
      { y: 1965, st: 'GA', r: true, t: 'A new map', text: 'Georgia drew a new district map after Wesberry v. Sanders. Dashed lines show the previous map, and hatched districts changed.' },
      { y: 1964, t: 'Across the country', ref: ['national', 'Reynolds v. Sims'] }
    ] },
    { id: 'texas', title: 'The 2003 Texas redraw', steps: [
      { y: 2003, st: 'TX', t: 'A court-drawn map', ref: ['TX', '2000 census apportionment'] },
      { y: 2005, st: 'TX', r: true, t: 'Mid-decade redraw', ref: ['TX', 'Mid-decade redistricting'] },
      { y: 2007, st: 'TX', r: true, t: 'The Supreme Court', ref: ['TX', 'LULAC v. Perry'] }
    ] }
  ];
  const TOUR = { t: null, i: 0, files: {} };
  function buildTours() {
    if (!el.tours || L.index.sample) { if (el.tours) el.tours.hidden = true; return; }
    el.tours.innerHTML = TOURS.map((t, i) => '<li><button type="button" class="mp-tourbtn" data-tour="' + i + '"><span class="mp-tourbtn-k">Tour · ' + t.steps.length + ' steps</span><span class="mp-tourbtn-t">' + esc(t.title) + '</span></button></li>').join('');
  }
  function stepText(st) {
    if (st.ref) {
      const file = TOUR.files[st.ref[0]];
      const list = file ? (file.milestones || file.events || []) : [];
      const e = list.find(x => x.title === st.ref[1]);
      if (e) return { text: e.text, src: (e.sources || []).map(safeHttp).filter(Boolean)[0] || null };
    }
    let t = st.text || '';
    if (t.indexOf('{seats}') >= 0) {
      const sm = V.summary; let n = 0;
      if (sm && sm.house) Object.entries(sm.house).forEach(([k, c]) => { if (votingState(k)) Object.values(c || {}).forEach(v => { n += v; }); });
      t = t.replace('{seats}', n || 'All');
    }
    return { text: t, src: null };
  }
  function showStep() {
    const t = TOUR.t; if (!t) return;
    const st = t.steps[TOUR.i];
    stopPlay(); V.pin = null;
    S.year = st.y; S.st = st.st || null; S.d = st.d != null ? String(st.d) : null; S.ghost = !!st.r; S.mode = 'h';
    syncGhost(); syncMode(); writeURL('replace');
    render().then(() => {
      const x = stepText(st);
      el.tour.hidden = false;
      el.tour.innerHTML = '<div class="mp-tour-h"><span class="mp-label">' + esc(t.title) + '</span><span class="mp-tour-n">' + (TOUR.i + 1) + ' of ' + t.steps.length + '</span></div>' +
        '<h3 class="mp-tour-t" id="mp-tour-t" tabindex="-1">' + st.y + ' · ' + esc(st.t) + '</h3><p class="mp-tour-x">' + esc(x.text) + '</p>' +
        (x.src ? '<p class="mp-tour-src"><a href="' + esc(x.src) + '" target="_blank" rel="noopener noreferrer">Source<span class="sr-only"> (opens in a new tab)</span></a></p>' : '') +
        '<div class="mp-tour-b"><button type="button" class="mp-tour-x-btn" data-tour-x>Exit tour</button><span><button type="button" data-tour-prev' + (TOUR.i ? '' : ' disabled') + '>Back</button>' +
        '<button type="button" class="mp-tour-next" data-tour-next>' + (TOUR.i < t.steps.length - 1 ? 'Next' : 'Finish') + '</button></span></div>';
      const h = $('mp-tour-t'); if (h) h.focus({ preventScroll: true });
      el.pbody.scrollTop = 0; if (isPhone()) openSheet(sheet === 'full' ? 'full' : 'half');
    });
  }
  function startTour(i) {
    const t = TOURS[i];
    const need = Array.from(new Set(t.steps.filter(x => x.ref).map(x => x.ref[0]))).filter(k => !TOUR.files[k]);
    Promise.all(need.map(k => (k === 'national' ? L.json('history/national.json') : L.history(k)).then(j => { TOUR.files[k] = j; }).catch(() => {}))).then(() => {
      TOUR.t = t; TOUR.i = 0; el.wrap.classList.add('is-tour'); dismissOnboard();
      el.wrap.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      showStep();
    });
  }
  function endTour() { if (!TOUR.t) return; TOUR.t = null; el.tour.hidden = true; el.tour.innerHTML = ''; el.wrap.classList.remove('is-tour'); writeURL('push'); announce('Tour closed.'); }
  if (el.tours) el.tours.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (b) startTour(+b.getAttribute('data-tour')); });
  if (el.tour) el.tour.addEventListener('click', e => {
    if (e.target.closest('[data-tour-x]')) { endTour(); return; }
    if (e.target.closest('[data-tour-prev]') && TOUR.i > 0) { TOUR.i--; showStep(); return; }
    if (e.target.closest('[data-tour-next]')) { if (TOUR.i < TOUR.t.steps.length - 1) { TOUR.i++; showStep(); } else endTour(); }
  });
  document.addEventListener('keydown', e => {
    if (!TOUR.t) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour(); }
    else if (el.tour.contains(document.activeElement) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); const b = el.tour.querySelector(e.key === 'ArrowRight' ? '[data-tour-next]' : '[data-tour-prev]'); if (b && !b.disabled) b.click(); }
  }, true);

  /* ======================= share ======================= */
  function shareTitle() {
    if (S.st && S.d != null && V.sgeo && V.sgeo.districts[S.st + '-' + S.d]) return distName(S.st, S.d) + ' in ' + S.year;
    if (S.st) return stName(S.st) + ' in ' + S.year;
    return 'Congress in ' + S.year;
  }
  function shareUrl() {
    const q = new URLSearchParams(location.search); q.delete('data');
    return location.origin + location.pathname + '?' + q.toString();
  }
  function toast(m) { try { if (window.SIN && SIN.toast) { SIN.toast(m); return; } } catch (e) { /* no toast */ } announce(m); }
  if (el.share) el.share.addEventListener('click', () => {
    const url = shareUrl(), title = shareTitle() + ' · The Congress Map';
    const copy = () => {
      const done = () => toast('Link copied');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
      function fallback() { const t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); toast(ok ? 'Link copied' : url); }
    };
    // the share sheet on phones (only for a real public address), the clipboard elsewhere
    const publicHost = /^https:$/.test(location.protocol) && !/localhost|127\.0|192\.168|claude/.test(location.hostname);
    if (navigator.share && publicHost && matchMedia('(pointer:coarse)').matches) navigator.share({ title, url }).catch(e => { if (!e || e.name !== 'AbortError') copy(); });
    else copy();
  });

  /* ======================= famous moments ======================= */
  // jump points with one line of context; titles and text come from workstream D's sourced history files when present
  const MOMENTS = [
    { y: 1789, label: 'First Congress', fallback: 'The first House meets: 65 seats, 13 states.' },
    { y: 1843, ref: ['national', 'Apportionment Act of 1842'], label: 'Districts required', blurb: 'Congress requires single-member districts.' },
    { y: 1862, label: 'Civil War', fallback: 'Seceded states’ House seats sit empty.', st: null },
    { y: 1913, ref: ['national', 'The House reaches 435 seats'], label: '435 seats', blurb: 'The House grows to its modern size.' },
    { y: 1964, ref: ['national', 'Wesberry v. Sanders'], label: 'One person, one vote', blurb: 'Districts must have equal populations.' },
    { y: 2005, ref: ['TX', 'Mid-decade redistricting'], label: 'Texas redraw', st: 'TX', ghost: true, blurb: 'Texas redraws its map mid-decade.' },
    { y: 2019, ref: ['national', 'Rucho v. Common Cause'], label: 'Rucho v. Common Cause', blurb: 'Courts can’t police partisan maps.' }
  ];
  function firstSentence(t) { const m = String(t || '').match(/^.*?[.!?](\s|$)/); const x = (m ? m[0] : String(t || '')).trim(); return x.length > 170 ? x.slice(0, 167).replace(/\s+\S*$/, '') + '…' : x; }
  function buildMoments() {
    if (!el.moments || L.index.sample) { if (el.moments) el.moments.closest('section').hidden = true; return; }
    if (!buildMoments.go) {
      const sec = el.moments.closest('section');
      if ('IntersectionObserver' in window && sec) { const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); buildMoments.go = true; buildMoments(); } }, { rootMargin: '300px' }); io.observe(sec); return; }
    }
    const need = Array.from(new Set(MOMENTS.filter(m => m.ref).map(m => m.ref[0])));
    Promise.all(need.map(k => (k === 'national' ? L.json('history/national.json') : L.history(k)).catch(() => null))).then(files => {
      const by = {}; need.forEach((k, i) => { by[k] = files[i]; });
      el.moments.innerHTML = MOMENTS.map((m, i) => {
        let text = m.blurb || m.fallback || '', full = '';
        if (m.ref && by[m.ref[0]]) { const list = by[m.ref[0]].milestones || by[m.ref[0]].events || []; const e = list.find(x => x.title === m.ref[1]); if (e) full = firstSentence(e.text); }
        if (!text) return '';
        return '<li><button type="button" class="mp-moment" data-m="' + i + '" data-y="' + m.y + '"' + (full ? ' title="' + esc(full) + '"' : '') + '><span class="mp-moment-y">' + m.y + '</span><span class="mp-moment-t">' + esc(m.label) + '</span><span class="mp-moment-x">' + esc(text) + '</span><span class="mp-moment-go" aria-hidden="true">Jump to ' + m.y + ' →</span></button></li>';
      }).join('');
    });
  }
  if (el.moments) el.moments.addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const m = MOMENTS[+b.getAttribute('data-m')];
    stopPlay(); V.pin = null;
    S.year = m.y; S.st = m.st || null; S.d = null; if (m.ghost) { S.ghost = true; syncGhost(); }
    writeURL('push'); render();
    el.wrap.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    if (S.st) openSheet('half');
  });

  /* ======================= redistricting toggle ======================= */
  /* ======================= compare mode =======================
     A second, read-only pane draws the same state's districts in another year. Desktop: two panes side by side, sharing one
     view (pan and zoom the left one). Phones: the panes overlap and a draggable divider reveals one or the other. */
  const CMP = { on: false, y: null, pos: 50 };
  function cmpVersions() {        // one entry per distinct district map of this state (A's changes list), newest first
    const list = (V.changes && V.changes[S.st]) || [];
    return list.map(n => L.congressByN(n)).filter(c => c && c.geo).map(c => ({ n: c.n, y: +c.start.slice(0, 4) + (c.start.slice(5) > '07-01' ? 1 : 0) })).reverse();
  }
  function syncCmp() {
    const ok = !!(S.st && V.sgeo && cmpVersions().length > 1);
    el.cmpBtn.hidden = !ok;
    if (!ok && CMP.on) setCmp(false);
    el.cmpBtn.setAttribute('aria-pressed', String(CMP.on));
  }
  function setCmp(on) {
    CMP.on = on;
    el.wrap.classList.toggle('is-cmp', on);
    el.cmpBar.hidden = !on; el.svg2.toggleAttribute('hidden', !on); el.cmpDiv.hidden = !on || !isPhone();   // SVG elements have no .hidden property
    el.cmpBtn.setAttribute('aria-pressed', String(on));
    if (on) {
      const vs = cmpVersions(), curN = V.c ? V.c.n : 0;
      const prev = vs.find(v => v.n < curN && !(V.changes[S.st] || []).includes(curN) ? true : v.n < curN) || vs[vs.length - 1];
      // default: the map before the one in use now
      const inUse = vs.find(v => v.n <= curN);
      const before = vs.find(v => inUse && v.n < inUse.n);
      CMP.y = (before || prev || vs[0]).y;
      el.cmpSel.innerHTML = vs.map(v => '<option value="' + v.y + '">' + v.y + ' (' + M.ordinal(v.n) + ' Congress)</option>').join('');
      el.cmpSel.value = String(CMP.y);
    }
    requestAnimationFrame(() => { measureSvg(); zoomToCurrent(true); drawCmp(); fitLabels(); });
    announce(on ? 'Compare on: ' + stName(S.st) + ' in ' + CMP.y + ' beside ' + S.year + '.' : 'Compare off.');
  }
  let cmpTok = 0;
  function drawCmp() {
    if (!CMP.on || !S.st) return;
    const my = ++cmpTok, c2 = L.congressFor(CMP.y);
    el.cmpTagA.textContent = String(CMP.y); el.cmpTagB.textContent = String(S.year);
    if (!c2) return;
    L.stateGeo(S.st, c2.n, V.changes).then(g => {
      if (my !== cmpTok) return;
      const P = V.people, d = String(CMP.y) + '-07-01';
      const keyOf = id => String(parseInt(id.split('-')[1], 10));
      let h = '';
      const ids = Object.keys(g.districts).sort((a, b) => +keyOf(a) - +keyOf(b));
      const mixed = ids.length > 1;
      for (const id of ids) {
        if (mixed && /-0$/.test(id)) continue;
        let party = null;
        if (P) { const ks = M.seatKeys(P.house, keyOf(id)); for (const k of ks) { const x = M.holderOn((P.house || {})[k] || [], d); if (x) { party = x.party; break; } } }
        h += '<path d="' + g.districts[id].d + '" class="mp-d ' + (party ? 'p-' + M.partyKey(party) : 'p-none') + '" data-k="' + id + '"/>';
        const lab = g.districts[id].label; if (lab) h += '<text x="' + lab[0] + '" y="' + lab[1] + '" class="mp-lab mp-lab-d ' + (party ? 'p-' + M.partyKey(party) : 'off-tint') + '" data-id="' + id + '">' + keyOf(id) + (party ? ' ' + M.partyLetter(party) : '') + '</text>';
      }
      el.svg2.innerHTML = '<g class="mp-g-cmp">' + h.replace(/<text[^>]*>[^<]*<\/text>/g, '') + '</g><g class="mp-g-labels" font-size="' + el.gLabels.getAttribute('font-size') + '" stroke-width="' + el.gLabels.getAttribute('stroke-width') + '">' + (h.match(/<text[^>]*>[^<]*<\/text>/g) || []).join('') + '</g>';
      el.svg2.setAttribute('viewBox', el.svg.getAttribute('viewBox'));
      // the same basemap as the main pane (dimmed neighbours)
      const base = el.gStates.cloneNode(true); base.removeAttribute('id'); base.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); base.querySelectorAll('[tabindex]').forEach(n => n.removeAttribute('tabindex'));
      base.querySelectorAll('.mp-st').forEach(n => { n.classList.add('is-dim'); n.classList.remove('is-sel'); });
      el.svg2.insertBefore(base, el.svg2.firstChild);
      fitCmpLabels();
    }).catch(() => { el.svg2.innerHTML = ''; });
  }
  // compare-pane labels: only those whose district is big enough on screen and whose point lies inside it
  function fitCmpLabels() {
    if (!CMP.on || !el.svg2.firstChild) return;
    const pxPer = 1 / geoXf().sc;
    el.svg2.querySelectorAll('.mp-lab-d').forEach(t => {
      const p = el.svg2.querySelector('[data-k="' + t.getAttribute('data-id') + '"]'); if (!p) return;
      const b = p.getBBox(); let inside = true;
      try { inside = p.isPointInFill(new DOMPoint(+t.getAttribute('x'), +t.getAttribute('y'))); } catch (e) { /* old browser */ }
      t.classList.toggle('is-tiny', !inside || Math.min(b.width, b.height * 1.6) * pxPer < 26);
    });
  }
  el.cmpBtn.addEventListener('click', () => setCmp(!CMP.on));
  el.cmpX.addEventListener('click', () => { setCmp(false); el.cmpBtn.focus(); });
  el.cmpSel.addEventListener('change', () => { CMP.y = +el.cmpSel.value; drawCmp(); announce('Comparing with ' + CMP.y + '.'); });
  // phone divider
  let cmpDrag = false;
  function setPos(p) { CMP.pos = Math.max(4, Math.min(96, p)); el.wrap.style.setProperty('--cmp-pos', CMP.pos + '%'); el.cmpDiv.setAttribute('aria-valuenow', Math.round(CMP.pos)); }
  el.cmpDiv.addEventListener('pointerdown', e => { cmpDrag = true; el.cmpDiv.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
  el.cmpDiv.addEventListener('pointermove', e => { if (!cmpDrag) return; const r = el.wrap.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width * 100); });
  el.cmpDiv.addEventListener('pointerup', () => { cmpDrag = false; });
  el.cmpDiv.addEventListener('keydown', e => { const k = e.key; if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); setPos(CMP.pos + (k === 'ArrowLeft' ? -5 : 5)); } });
  setPos(50);
  function syncGhost() { el.ghost.setAttribute('aria-pressed', String(S.ghost)); el.wrap.classList.toggle('is-ghost', S.ghost); }
  (function () { const sw = document.createElement('span'); sw.className = 'mp-switch'; sw.setAttribute('aria-hidden', 'true'); el.ghost.appendChild(sw); })();
  el.ghost.addEventListener('click', () => {
    S.ghost = !S.ghost; syncGhost(); writeURL('replace'); render();
    announce(S.ghost ? 'Redistricting view on: previous lines dashed, changed districts hatched.' : 'Redistricting view off.');
  });

  /* ======================= search ======================= */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let rowsP = null, active = -1, items = [], searchTimer = 0;
  // the largest U.S. cities (2020 census, about the top 80) rank first among places with the same name; no population data ships with the map
  const MAJOR = new Set(('New York|NY,Los Angeles|CA,Chicago|IL,Houston|TX,Phoenix|AZ,Philadelphia|PA,San Antonio|TX,San Diego|CA,Dallas|TX,Austin|TX,Jacksonville|FL,Fort Worth|TX,San Jose|CA,Columbus|OH,Charlotte|NC,Indianapolis|IN,San Francisco|CA,Seattle|WA,Denver|CO,Oklahoma City|OK,Nashville|TN,Washington|DC,El Paso|TX,Las Vegas|NV,Boston|MA,Detroit|MI,Portland|OR,Louisville|KY,Memphis|TN,Baltimore|MD,Milwaukee|WI,Albuquerque|NM,Tucson|AZ,Fresno|CA,Sacramento|CA,Mesa|AZ,Atlanta|GA,Kansas City|MO,Colorado Springs|CO,Omaha|NE,Raleigh|NC,Miami|FL,Virginia Beach|VA,Long Beach|CA,Oakland|CA,Minneapolis|MN,Bakersfield|CA,Tulsa|OK,Tampa|FL,Arlington|TX,Wichita|KS,Aurora|CO,New Orleans|LA,Cleveland|OH,Honolulu|HI,Anaheim|CA,Henderson|NV,Orlando|FL,Lexington|KY,Stockton|CA,Riverside|CA,Corpus Christi|TX,Irvine|CA,Cincinnati|OH,Santa Ana|CA,Newark|NJ,Saint Paul|MN,Pittsburgh|PA,Greensboro|NC,Durham|NC,Lincoln|NE,Jersey City|NJ,Plano|TX,Anchorage|AK,North Las Vegas|NV,St. Louis|MO,Madison|WI,Chandler|AZ,Gilbert|AZ,Reno|NV,Buffalo|NY,Chula Vista|CA,Fort Wayne|IN,Lubbock|TX,Toledo|OH,St. Petersburg|FL,Laredo|TX,Irving|TX,Chesapeake|VA,Glendale|AZ,Winston-Salem|NC,Port St. Lucie|FL,Scottsdale|AZ,Garland|TX,Boise|ID,Norfolk|VA,Spokane|WA,Richmond|VA,Fremont|CA,Huntsville|AL,Frisco|TX,Cape Coral|FL,Santa Clarita|CA,San Bernardino|CA,Tacoma|WA,Hialeah|FL,Baton Rouge|LA,Modesto|CA,Fontana|CA,McKinney|TX,Moreno Valley|CA,Des Moines|IA,Fayetteville|NC,Salt Lake City|UT,Yonkers|NY,Worcester|MA,Rochester|NY,Sioux Falls|SD,Little Rock|AR,Amarillo|TX,Tallahassee|FL,Grand Prairie|TX,Columbus|GA,Augusta|GA,Peoria|AZ,Oxnard|CA,Knoxville|TN,Overland Park|KS,Birmingham|AL,Grand Rapids|MI,Vancouver|WA,Montgomery|AL,Huntington Beach|CA,Providence|RI,Brownsville|TX,Tempe|AZ,Akron|OH,Glendale|CA,Chattanooga|TN,Fort Lauderdale|FL,Newport News|VA,Mobile|AL,Ontario|CA,Clarksville|TN,Cary|NC,Elk Grove|CA,Shreveport|LA,Eugene|OR,Aurora|IL,Salem|OR,Santa Rosa|CA,Rancho Cucamonga|CA,Pembroke Pines|FL,Fort Collins|CO,Springfield|MO,Oceanside|CA,Garden Grove|CA,Lancaster|CA,Murfreesboro|TN,Palmdale|CA,Corona|CA,Killeen|TX,Salinas|CA,Roseville|CA,Denton|TX,Surprise|AZ,Macon|GA,Paterson|NJ,Lakewood|CO,Hayward|CA,Charleston|SC,Alexandria|VA,Hollywood|FL,Springfield|MA,Kansas City|KS,Sunnyvale|CA,Bellevue|WA,Joliet|IL,Naperville|IL,Escondido|CA,Bridgeport|CT,Savannah|GA,Olathe|KS,Mesquite|TX,Syracuse|NY,Pasadena|TX,McAllen|TX,Rockford|IL,Gainesville|FL,Thornton|CO,Dayton|OH,Jackson|MS,Hartford|CT,Springfield|IL,Boston|MA,Trenton|NJ,Albany|NY,Annapolis|MD,Concord|NH,Montpelier|VT,Augusta|ME,Dover|DE,Charleston|WV,Columbia|SC,Harrisburg|PA,Lansing|MI,Topeka|KS,Pierre|SD,Bismarck|ND,Helena|MT,Cheyenne|WY,Carson City|NV,Santa Fe|NM,Olympia|WA,Juneau|AK,Frankfort|KY,Jefferson City|MO').split(',').map(x => x.toLowerCase()));
  let placesP = null;
  function ensurePlaces() { if (!placesP) placesP = (L.index.sample ? Promise.resolve(null) : L.json(L.index.places ? L.index.places + 'index.json' : 'places/index.json')).catch(() => null); return placesP; }
  function ensureRows() { ensurePlaces(); if (!rowsP) rowsP = L.searchRows().catch(() => []); return rowsP; }
  el.q.addEventListener('focus', ensureRows);
  el.q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 110); });
  function yearsOf(r) {
    const fy = +r[5].slice(0, 4) + (r[5].slice(5) > '07-01' ? 1 : 0);
    const ty = r[6] ? +r[6].slice(0, 4) - (r[6].slice(5) <= '07-01' ? 1 : 0) : Y1;
    return [Math.max(Y0, Math.min(fy, ty)), Math.max(fy, ty)];
  }
  function runSearch() {
    const q = norm(el.q.value).trim();
    if (/^\d{5}$/.test(q) && !L.index.sample) { zipSearch(q); return; }
    if (q.length < 2) return closeResults();
    const toks = q.split(/\s+/);
    Promise.all([ensureRows(), ensurePlaces()]).then(([rows, places]) => {
      if (norm(el.q.value).trim() !== q) return;
      const out = [];
      if (places && places.states) {
        let n = 0;
        if (!places._freq) { places._freq = new Map(); Object.values(places.states).forEach(l => l.forEach(r => { const k = norm(r[0]); places._freq.set(k, (places._freq.get(k) || 0) + 1); })); }
        for (const [st, list] of Object.entries(places.states)) {
          list.forEach((r, i) => {
            if (n > 400) return;
            const nm = norm(r[0]);
            if (nm.startsWith(q) || (q.length > 3 && nm.indexOf(' ' + q) >= 0)) { n++; out.push({ kind: 'pl', st, i, row: r, label: r[0] + ', ' + st, name: r[0], sub: (r[1] === 'c' ? 'County' : 'Place') + ' in ' + stName(st), score: 2 + (nm === q ? -0.5 : 0) + (nm.startsWith(q) ? 0 : 0.3) }); }
          });
        }
      }
      for (const [st, s] of Object.entries(L.index.states || {})) {
        const n = norm(s.name);
        if (n.startsWith(q) || st.toLowerCase() === q) out.push({ kind: 'st', st, label: s.name, sub: 'State', score: 0 });
      }
      for (const r of rows) {
        const words = norm(r[1]).split(/[\s.,-]+/);
        if (!toks.every(t => words.some(w => w.startsWith(t)))) continue;
        const [fy, ty] = yearsOf(r);
        const dnum = String(parseInt(r[4], 10) || 0);
        const adm = L.index.states && L.index.states[r[2]] && L.index.states[r[2]].admitted;
        const office = r[3] === 'h' ? (dnum === '0' ? r[2] + ' at-large' : r[2] + '-' + dnum) + (adm && r[5] < adm ? ' · Delegate' : ' · House') : r[3] === 's' ? stName(r[2]) + ' · Senate' : stName(r[2]) + ' · Governor';
        out.push({ kind: 'p', r, label: r[1], sub: office + ' · ' + fy + (ty !== fy ? '–' + (r[6] ? ty : 'now') : ''), score: 1 + (words[0].startsWith(toks[0]) ? 0 : 0.5) - (ty / 10000) });
        if (out.length > 200) break;
      }
      // places: a name found in many states (Springfield) is likely the one meant; then alphabetical
      out.forEach(o => { if (o.kind === 'pl') { o.score -= Math.min(0.9, (places && places._freq ? places._freq.get(norm(o.name)) || 1 : 1) / 40); if (MAJOR.has(norm(o.name) + '|' + o.st.toLowerCase())) o.score -= 2; } });
      out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
      const people = out.filter(o => o.kind === 'p').slice(0, 5), sts = out.filter(o => o.kind === 'st').slice(0, 3), pls = out.filter(o => o.kind === 'pl').slice(0, 6);
      // a query that names a major city leads with places
      items = pls.length && pls[0].score < 0.5 ? sts.concat(pls, people) : sts.concat(people, pls);
      active = items.length ? 0 : -1;
      drawResults();
    });
  }
  function drawResults() {
    if (!items.length) { el.results.innerHTML = '<li class="mp-res-none" role="option" aria-disabled="true">No matches</li>'; }
    else {
      const q = norm(el.q.value).trim(), HEAD = { st: 'States', p: 'People', pl: 'Places', zip: 'ZIP code', zip3: 'ZIP code' };
      const mark = t => { const n = norm(t), i = q ? n.indexOf(q) : -1; return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); };
      const groups = []; items.forEach((it, i) => { if (!groups.length || groups[groups.length - 1].kind !== it.kind) groups.push({ kind: it.kind, list: [] }); groups[groups.length - 1].list.push([it, i]); });
      el.results.innerHTML = groups.map(g => '<li role="group" aria-labelledby="mp-res-h-' + g.kind + '" class="mp-res-g"><div class="mp-res-h" id="mp-res-h-' + g.kind + '">' + HEAD[g.kind] + '</div><ul role="none">' +
        g.list.map(([it, i]) => '<li id="mp-res-' + i + '" role="option" class="mp-res' + (i === active ? ' on' : '') + '" aria-selected="' + (i === active) + '" data-i="' + i + '"><b>' + mark(it.label) + '</b><span>' + esc(it.sub) + '</span></li>').join('') + '</ul></li>').join('');
    }
    el.results.hidden = false; el.q.setAttribute('aria-expanded', 'true');
    if (active >= 0) el.q.setAttribute('aria-activedescendant', 'mp-res-' + active); else el.q.removeAttribute('aria-activedescendant');
  }
  function closeResults() { el.results.hidden = true; el.results.innerHTML = ''; el.q.setAttribute('aria-expanded', 'false'); el.q.removeAttribute('aria-activedescendant'); items = []; active = -1; }
  el.q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; drawResults(); }
    else if (e.key === 'Enter') { if (active >= 0 && items[active]) { e.preventDefault(); choose(items[active]); } }
    else if (e.key === 'Escape') { if (!el.results.hidden) { e.preventDefault(); closeResults(); } }
  });
  el.results.addEventListener('pointerdown', e => e.preventDefault());
  el.results.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) choose(items[+li.getAttribute('data-i')]); });
  el.q.addEventListener('blur', () => setTimeout(closeResults, 150));
  // SCHEMA 9: zips/<first digit>.json rows [zip, st, x, y, seqIndex], sorted by ZIP
  let zipNote = null;
  function zipSearch(q) {
    Promise.all([L.json('zips/' + q[0] + '.json'), zipNote ? Promise.resolve(null) : L.json('zips/index.json').catch(() => null)]).then(([Z, ix]) => {
      if (ix && ix.note) zipNote = ix.note;
      if (norm(el.q.value).trim() !== q) return;
      let lo = 0, hi = Z.z.length - 1, row = null;
      while (lo <= hi) { const m = (lo + hi) >> 1, k = Z.z[m][0]; if (k === q) { row = Z.z[m]; break; } if (k < q) lo = m + 1; else hi = m - 1; }
      items = row ? [{ kind: 'zip', st: row[1], row, seq: Z.seqs[row[4]], label: 'ZIP ' + q, name: 'ZIP ' + q, sub: stName(row[1]) + ' · district shown is approximate' }] : [];
      active = items.length ? 0 : -1;
      // no mapped area (PO boxes, unique ZIPs such as 20500): the state that most ZIP areas with the same first three digits fall in
      if (!row) {
        const p3 = q.slice(0, 3), tally = {};
        Z.z.forEach(r => { if (r[0].slice(0, 3) === p3) tally[r[1]] = (tally[r[1]] || 0) + 1; });
        const st = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
        if (st) { items = [{ kind: 'zip3', st, label: 'ZIP ' + q, name: 'ZIP ' + q, sub: 'No mapped area · ' + stName(st) }]; active = 0; drawResults(); return; }
      }
      if (row) drawResults(); else { el.results.innerHTML = '<li class="mp-res-none" role="option" aria-disabled="true">ZIP ' + esc(q) + ' not found (not a residential ZIP area)</li>'; el.results.hidden = false; el.q.setAttribute('aria-expanded', 'true'); }
    }).catch(() => { items = []; el.results.innerHTML = '<li class="mp-res-none" role="option" aria-disabled="true">ZIP lookup unavailable</li>'; el.results.hidden = false; });
  }
  // a "startCongress:district" run string -> { st, d } for Congress n (SCHEMA 8 and 9)
  function runAt(seq, n, homeSt) {
    let v = null;
    if (seq) seq.split(' ').forEach(pair => { const ix = pair.indexOf(':'); if (+pair.slice(0, ix) <= n) v = pair.slice(ix + 1); });
    if (!v || v === '-') return { st: homeSt, d: null, none: v === '-' };
    const m = /^([A-Z]{2})-(\d+)$/.exec(v);
    return m ? { st: m[1], d: String(+m[2]) } : { st: homeSt, d: /^\d+$/.test(v) ? String(+v) : null };
  }
  function choose(it) {
    closeResults(); el.q.value = it.label; stopPlay(); V.zipMsg = null;
    if (it.kind === 'st') { S.st = it.st; S.d = null; V.pin = null; }
    else if (it.kind === 'zip3') {
      S.st = it.st; S.d = null; V.pin = null; V.zipMsg = it.name + ' has no mapped area; showing ' + stName(it.st) + '.';
      writeURL('push');
      render().then(() => {
        // a state with a single district (at-large, DC, a territory): go straight to it
        const ids = V.sgeo ? Object.keys(V.sgeo.districts) : [];
        if (ids.length === 1) { S.d = String(parseInt(ids[0].split('-')[1], 10) || 0); writeURL('replace'); return render(); }
      }).then(() => { openSheet('half'); el.ptitle.setAttribute('tabindex', '-1'); el.ptitle.focus({ preventScroll: isPhone() }); });
      announce(V.zipMsg);
      return;
    }
    else if (it.kind === 'zip') {
      const c = L.congressFor(S.year), r = runAt(it.seq, c ? c.n : 0, it.st);
      S.st = r.st; S.d = r.d; V.pin = { x: it.row[2], y: it.row[3], name: it.name, note: zipNote };
      announce(r.none ? it.name + ' was not in any district in ' + S.year + '.' : it.name + ': the district shown is approximate.');
      writeURL('push'); render().then(() => { openSheet('half'); el.ptitle.setAttribute('tabindex', '-1'); el.ptitle.focus({ preventScroll: isPhone() }); });
      return;
    }
    else if (it.kind === 'pl') {
      // the district a place was in during the selected year's Congress: places/<ST>.json "seqs" holds "congress:district" steps
      const c = L.congressFor(S.year);
      L.json((L.index.places || 'places/') + it.st + '.json').then(P => {
        const seq = P && P.seqs && P.seqs[P.p[it.i]];
        // SCHEMA 8: runs of "startCongress:district"; the district is a number in this state, "ST-d" in another state
        // (Wheeling, WV in 1813 = VA-1), or "-" for none
        let v = null;
        if (seq && c) seq.split(' ').forEach(pair => { const ix = pair.indexOf(':'); if (+pair.slice(0, ix) <= c.n) v = pair.slice(ix + 1); });
        let st = it.st, d = null;
        if (v && v !== '-') { const m = /^([A-Z]{2})-(\d+)$/.exec(v); if (m) { st = m[1]; d = String(+m[2]); } else if (/^\d+$/.test(v)) d = String(+v); }
        S.st = st; S.d = d; V.pin = { x: it.row[2], y: it.row[3], name: it.name || it.label };
        if (v === '-') announce(it.label + ' was not in any district in ' + S.year + '.');
        writeURL('push'); render().then(() => { openSheet('half'); el.ptitle.setAttribute('tabindex', '-1'); el.ptitle.focus({ preventScroll: isPhone() }); });
      }).catch(() => { S.st = it.st; S.d = null; writeURL('push'); render(); });
      return;
    }
    else {
      V.pin = null;
      const r = it.r, [fy, ty] = yearsOf(r);
      let y = fy; for (let k = fy; k <= ty; k++) { const c = L.congressFor(k); if (c && c.geo) { y = k; break; } }
      S.year = y; S.st = r[2]; S.d = r[3] === 'h' ? String(parseInt(r[4], 10) || 0) : null;
    }
    writeURL('push');
    render().then(() => { openSheet('half'); refocus = null; el.ptitle.setAttribute('tabindex', '-1'); el.ptitle.focus({ preventScroll: isPhone() }); });
  }

  /* ======================= phone bottom sheet ======================= */
  let sheet = 'peek';
  const timeEl = document.querySelector('.mp-time'), mapCol = document.querySelector('.mp-mapcol');
  function placeTimeline() {
    if (!timeEl || !mapCol) return;
    if (isPhone()) { if (timeEl.parentNode !== el.panel) { el.panel.insertBefore(timeEl, el.pbody); trackRect = null; requestAnimationFrame(fitEras); } }
    else if (timeEl.parentNode !== mapCol) { mapCol.appendChild(timeEl); trackRect = null; requestAnimationFrame(fitEras); }
    // the tour card: over the map on desktop, at the top of the sheet's content on phones (it would cover the small map)
    if (el.tour && el.tour.parentNode !== el.pbody) el.pbody.insertBefore(el.tour, el.pbody.firstChild);
    // phones: the party balance shares the title row with the search icon (the title is visually hidden there), so the map gets the height
    const head = document.querySelector('.mp-head'), srch = document.querySelector('.mp-search');
    if (el.bal && head && srch) {
      if (isPhone()) { if (el.bal.parentNode !== head) head.insertBefore(el.bal, srch); }
      else if (el.bal.parentNode !== mapCol) mapCol.insertBefore(el.bal, mapCol.firstChild);
    }
  }
  const SHEET = () => {
    const vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    const tab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) || 58;
    const full = Math.round(vh - tab - 72);
    // peek shows the grip, the docked timeline and the title; half stops just under the map
    const tH = timeEl && timeEl.parentNode === el.panel ? timeEl.offsetHeight : 0;
    // phones: the peek is just the grip and the slim timeline; the title and summary sit below it (drag up or tap the map)
    const peek = Math.round(tH ? Math.max(0, el.grip.offsetTop + el.grip.offsetHeight) + tH : 40 + 66);
    const mapBottom = el.wrap.offsetHeight + (document.querySelector('.mp-key') || { offsetHeight: 0 }).offsetHeight;
    const half = Math.round(Math.min(full, Math.max(peek + 120, vh - tab - Math.min(mapBottom, vh * 0.5))));
    document.documentElement.style.setProperty('--mp-peek', peek + 'px');
    if (isPhone()) {
      let top = 0; for (let n = el.wrap; n; n = n.offsetParent) top += n.offsetTop;
      const keyH = (document.querySelector('.mp-key') || { offsetHeight: 0 }).offsetHeight, balH = 0;
      const h = Math.round(Math.max(220, Math.min(window.innerWidth * 1.6, vh - top - peek - tab - 4)));
      if (Math.abs((parseFloat(el.wrap.style.height) || 0) - h) > 2) { el.wrap.style.height = h + 'px'; measureSvg(); }
    } else if (el.wrap.style.height) { el.wrap.style.height = ''; measureSvg(); }
    return { peek, half, full };
  };
  function applySheet(h, animate) {
    if (!isPhone()) { el.panel.style.removeProperty('--sheet-y'); el.panel.style.removeProperty('--sheet-full'); return; }
    const H = SHEET();
    el.panel.style.setProperty('--sheet-full', H.full + 'px');
    el.panel.classList.toggle('is-anim', !!animate && !reduced());
    el.panel.style.setProperty('--sheet-y', Math.max(0, H.full - h) + 'px');
  }
  function openSheet(state) {
    if (!isPhone() || !state) return;
    if (state === 'half' && sheet === 'full') return;
    const top = el.wrap.getBoundingClientRect().top;
    if (Math.abs(top) > 4) window.scrollBy({ top, behavior: reduced() ? 'auto' : 'smooth' });
    sheet = state; const H = SHEET(); applySheet(H[state], true); syncSheet();
  }
  let sheetChangedAt = 0;
  function syncSheet() {
    sheetChangedAt = performance.now();
    el.panel.dataset.sheet = sheet;
    document.documentElement.classList.toggle('mp-sheet-full', isPhone() && sheet === 'full');
    el.grip.setAttribute('aria-expanded', String(sheet !== 'peek'));
    const sr = el.grip.querySelector('.sr-only'); if (sr) sr.textContent = (sheet === 'peek' ? 'Expand' : 'Collapse') + ' details: ' + el.ptitle.textContent;
  }
  let sd = null, sheetGestureAt = 0;
  function sheetDown(e) {
    if (!isPhone() || (e.button && e.button !== 0)) return;
    const H = SHEET();
    sd = { y: e.clientY, h: H[sheet], moved: false, id: e.pointerId, t: performance.now(), src: e.currentTarget };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  }
  function sheetMove(e) {
    if (!sd || e.pointerId !== sd.id) return;
    const dy = e.clientY - sd.y;
    if (!sd.moved && Math.abs(dy) < 6) return;
    sd.moved = true;
    const H = SHEET();
    applySheet(Math.max(H.peek - 20, Math.min(H.full, sd.h - dy)), false);
  }
  function sheetUp(e) {
    if (!sd || e.pointerId !== sd.id) return;
    sheetGestureAt = performance.now();
    const H = SHEET(), dy = e.clientY - sd.y, v = dy / Math.max(1, performance.now() - sd.t);
    if (!sd.moved) { if (sd.src === el.grip) sheet = sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek'; else { sd = null; return; } }
    else {
      const h = sd.h - dy;
      if (v > 0.6) sheet = sheet === 'full' ? 'half' : 'peek';
      else if (v < -0.6) sheet = sheet === 'peek' ? 'half' : 'full';
      else sheet = ['peek', 'half', 'full'].reduce((a, b) => Math.abs(H[b] - h) < Math.abs(H[a] - h) ? b : a);
    }
    sd = null; applySheet(H[sheet], true); syncSheet();
  }
  [el.grip, el.ptitle].forEach(n => { n.addEventListener('pointerdown', sheetDown); n.addEventListener('pointermove', sheetMove); n.addEventListener('pointerup', sheetUp); n.addEventListener('pointercancel', sheetUp); });
  el.grip.addEventListener('click', e => { if (e.detail === 0 && isPhone()) { sheet = sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek'; applySheet(SHEET()[sheet], true); syncSheet(); } });
  el.panel.addEventListener('focusin', e => {
    if (!isPhone() || e.target === el.grip) return;
    if (sheet === 'peek' && performance.now() - sheetChangedAt > 500) openSheet('half');
    requestAnimationFrame(() => {
      const r = e.target.getBoundingClientRect(), tab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) || 58;
      if (r.bottom > window.innerHeight - tab - 8 && sheet !== 'full') { sheet = 'full'; applySheet(SHEET().full, true); syncSheet(); }
      setTimeout(() => { try { e.target.scrollIntoView({ block: 'nearest' }); } catch (x) { /* old browser */ } }, reduced() ? 0 : 380);
    });
  });
  let rz = 0;
  function onResize() {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => { placeTimeline(); measureSvg(); applySheet(SHEET()[sheet], false); syncSheet(); zoomToCurrent(); setVB(vb); fitLabels(); });
  }
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  try { new ResizeObserver(onResize).observe(el.svg); } catch (e) { /* old browser */ }

  /* ======================= start ======================= */
  window.addEventListener('popstate', () => { stopPlay(); readURL(); syncGhost(); render(); });
  el.wrap.classList.add('is-skel');
  M.pickBase(location.search, (u, o) => fetch(u, o)).then(pick => {
    const base = typeof pick === 'string' ? pick : pick.base;
    L = new M.Loader({ base });
    return typeof pick === 'string' ? L.json('index.json') : pick.index;
  }).then(index => {
    L.index = index;
    if (index.view && index.view.width) { VIEW.w = index.view.width; VIEW.h = index.view.height; }
    el.sample.hidden = !index.sample;
    document.documentElement.classList.toggle('mp-is-sample', !!index.sample);
    setRange(); placeTimeline(); measureSvg(); buildTimeline(); buildMoments(); buildTours(); readURL(); syncGhost(); syncSheet(); applySheet(SHEET()[sheet], false); showOnboard();
    if (S.q) return openPerson(S.q);
    writeURL('replace');
    return render();
  }).catch(err => {
    el.wrap.classList.remove('is-skel');
    showRetry('The map could not be loaded. Check your connection and try again.', () => location.reload());
    if (window.console && console.warn) console.warn('[map]', err && err.message);
  });
})();
