/* Capitol Climb: the schematic map of central Washington (original artwork, drawn here as SVG; not to scale).
   DCJMap.create(host, stops, {onPick}) returns a controller:
     setRoute(ids)            draw the day's route (dashed) and mark its stops
     setProgress(i, res)      i is the current stop; res[k] 1 = answered right, 0 = missed (stops with a result are drawn as visited)
     moveTo(id, opts)         move the pin to a stop (animated; instant under prefers-reduced-motion); returns a Promise
     select(id|null)          highlight one stop (picker)
     mode('journey'|'pick'|'free')
     destroy()
   Colours come from CSS classes (dcj.css) so light and dark follow the site tokens. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* one small symbol per landmark, drawn in a 20 x 20 box centred on (0,0). Classes: f = solid (ink colour), k = outline, kb = thick line, c = cut-out (plate colour), kc = line in plate colour.
     The names are the "glyph" values in data/stops.json. */
  var COLS = function (xs, y0, y1, w, cls) { return xs.map(function (x) { return '<rect class="' + (cls || 'c') + '" x="' + (x - w / 2) + '" y="' + y0 + '" width="' + w + '" height="' + (y1 - y0) + '"/>'; }).join(''); };
  var ICONS = {
    whitehouse: '<path class="f" d="M-9 8V2.2h18V8z"/><path class="f" d="M-6 2.2V-.6L0-5.2l6 4.6v2.8z"/><path class="k" d="M0-5.2V-9M0-9h3.4"/>' + COLS([-4.2, -1.4, 1.4, 4.2], 3.4, 8, 1.3),
    cottage: '<path class="f" d="M-9 .5L0-7l9 7.5z"/><path class="f" d="M-6.5 .5h13V8h-13z"/><path class="f" d="M4-5v-3.4h2.2v5z"/><path class="c" d="M-1.6 8V3.4h3.2V8z"/><path class="c" d="M-5 3h2v2.2h-2zM3 3h2v2.2h-2z"/>',
    dome: '<path class="f" d="M-9 8V5.2h18V8z"/><path class="f" d="M-6.2 5.2V1h12.4v4.2z"/><path class="f" d="M-5.2 1C-5.2-7.2 5.2-7.2 5.2 1z"/><path class="k" d="M0-5.6V-9.2"/>' + COLS([-3.4, 0, 3.4], 1.8, 4.6, 1.3),
    wing: '<path class="f" d="M-9 8V5.4h18V8z"/><path class="f" d="M-7.4 5.4V.2h14.8v5.2z"/><path class="f" d="M-8.4.2L0-3.6l8.4 3.8z"/><path class="f" d="M-2.6-2.4C-2.6-7.6 2.6-7.6 2.6-2.4z"/>' + COLS([-5, -1.7, 1.7, 5], .9, 5.4, 1.3),
    wingflag: '<path class="f" d="M-9 8V5.4h18V8z"/><path class="f" d="M-7.4 5.4V.2h14.8v5.2z"/><path class="f" d="M-8.4.2L0-3.6l8.4 3.8z"/><path class="k" d="M0-3.4V-9M0-9h4.6V-6H0"/>' + COLS([-5, -1.7, 1.7, 5], .9, 5.4, 1.3),
    temple: '<path class="f" d="M-9.4-1.6L0-8l9.4 6.4z"/><path class="f" d="M-8.4-.8h16.8v1.8H-8.4z"/><path class="f" d="M-9 6.2h18v1.6H-9z"/><path class="f" d="M-10 7.8h20v1.4H-10z"/>' + COLS([-6.2, -2.1, 2.1, 6.2], 1, 6.2, 2.3, 'f'),
    book: '<path class="f" d="M0 6.2C-3 4.2-6.6 4-9 4.6V-5C-6.6-5.6-3-5.2 0-3.2z"/><path class="f" d="M0 6.2C3 4.2 6.6 4 9 4.6V-5C6.6-5.6 3-5.2 0-3.2z"/><path class="kc" d="M-7-1.6C-5-1.9-3-1.6-1.8-.6M-7 1.6C-5 1.3-3 1.6-1.8 2.6M7-1.6C5-1.9 3-1.6 1.8-.6M7 1.6C5 1.3 3 1.6 1.8 2.6"/><path class="k" d="M-9 7.8C-5 6.6-2 7.4 0 8.8 2 7.4 5 6.6 9 7.8"/>',
    scroll: '<path class="f" d="M-5.4-8.6H4.4L7.4-5.6V6.8a2.2 2.2 0 0 1-2.2 2.2H-5.4a2.2 2.2 0 0 1-2.2-2.2V-6.4a2.2 2.2 0 0 1 2.2-2.2z"/><path class="kc" d="M-4-4h8M-4-1h8M-4 2h8M-4 5h4.6"/>',
    flat: '<path class="f" d="M-9.4-6.8h18.8v2.6H-9.4z"/><path class="f" d="M-8-4.2h16v1.4H-8z"/><path class="f" d="M-9 6h18v1.6H-9z"/><path class="f" d="M-10 7.6h20v1.6H-10z"/>' + COLS([-7, -4.2, -1.4, 1.4, 4.2, 7], -2.4, 6, 1.7, 'f'),
    obelisk: '<path class="f" d="M-2.8 7.4L-2-4.2L0-9.4L2-4.2L2.8 7.4z"/><path class="f" d="M-5 7.4h10V9H-5z"/>',
    rotunda: '<path class="f" d="M-8.6 8V5.6h17.2V8z"/><path class="f" d="M-7.6-.4C-7.6-8.6 7.6-8.6 7.6-.4z"/><path class="f" d="M-7.2-.4H7.2V1.2H-7.2z"/>' + COLS([-5.6, -2.8, 0, 2.8, 5.6], 1.2, 5.6, 1.4, 'f'),
    stone: '<path class="f" d="M-9 8V-1.4l5.4-2V8z"/><path class="f" d="M3.6 8V-3.4L9-1.4V8z"/><circle class="f" cx="0" cy="-6.2" r="2.2"/><path class="f" d="M-2.6 8V-2.8Q0-4.4 2.6-2.8V8z"/>',
    cascade: '<path class="f" d="M-9-6.4h6v4.4h-6zM-3-2h6v4.4h-6zM3 2.4h6V8H3z"/><path class="k" d="M-6-2v3.6M0 2.4V6M6 8v1.4"/>',
    ring: '<ellipse class="k" cx="0" cy="0" rx="8" ry="5"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { var t = i * Math.PI / 5; return '<circle class="f" cx="' + (8 * Math.cos(t)).toFixed(1) + '" cy="' + (5 * Math.sin(t)).toFixed(1) + '" r="1.5"/>'; }).join('') + '<circle class="f" cx="0" cy="0" r="1.8"/>',
    wall: '<path class="kb" d="M-8.4-4.4L0 5L8.4-4.4"/><path class="k" d="M-9 8h18"/>',
    patrol: '<circle class="f" cx="-5.6" cy="-7" r="1.7"/><path class="f" d="M-8 2l1.2-6.8h2.8L-2.8 2z"/><circle class="f" cx="0" cy="-5.4" r="1.7"/><path class="f" d="M-2.6 4l1.2-7.2h2.8L2.6 4z"/><circle class="f" cx="5.6" cy="-3.8" r="1.7"/><path class="f" d="M2.8 6.4l1.2-7.6h2.8l1.2 7.6z"/><path class="k" d="M-9 9h18"/>',
    flag: '<path class="k" d="M-6-9.2V9.4"/><path class="f" d="M-5-8.4Q-1.6-10.4 2-8.4T9-8.4V.4Q5.4 2.4 2 .4T-5 .4z"/><path class="kc" d="M-3-5.2h10M-3-2.6h10"/>',
    corona: '<path class="f" d="M-3 9L-4.6 3H4.6L3 9z"/><path class="f" d="M-4.6 3L-6.4-3h12.8L4.6 3z"/><path class="f" d="M-6.4-3L-8.8-9H8.8L6.4-3z"/><path class="kc" d="M-3.6 6h7.2M-5.5 0h11M-7.6-6h15.2"/>',
    curve: '<path class="f" d="M-9.4 8.6C-8.4 0-4-6.6 2-7.4C6.4-8 8.4 0 9.4 8.6z"/><path class="kc" d="M-7.6 4.4C-4 2.4 2 1.4 7.4 3.4M-5.6-.4C-2-2.4 2-3.4 6.2-1.4"/>',
    plane: '<path class="f" d="M0-9.4L1.6-2.6L9.4 2V4L1.6 2L1.2 6.6L3.8 8.2V9.4L0 8.4L-3.8 9.4V8.2L-1.2 6.6L-1.6 2L-9.4 4V2L-1.6-2.6z"/>',
    stage: '<path class="f" d="M-8.6 8.4V-1Q-8.6-8.4 0-8.4Q8.6-8.4 8.6-1V8.4z"/><path class="c" d="M-5 8.4V-.6Q-5-4.6 0-4.6Q5-4.6 5-.6V8.4z"/><path class="f" d="M-5-2.4Q-2.6 .4-1.8 8.4H-5zM5-2.4Q2.6 .4 1.8 8.4H5z"/>',
    graves: '<path class="f" d="M-9 8V1.6Q-9-1.4-6.4-1.4Q-3.8-1.4-3.8 1.6V8z"/><path class="f" d="M-2.6 8V-1.6Q-2.6-5.4 0-5.4Q2.6-5.4 2.6-1.6V8z"/><path class="f" d="M3.8 8V1.6Q3.8-1.4 6.4-1.4Q9-1.4 9 1.6V8z"/><path class="k" d="M-10 9.4h20"/>',
    pentagon: '<polygon class="f" points="' + pentPts(9.4) + '"/><polygon class="c" points="' + pentPts(5.6) + '"/><polygon class="f" points="' + pentPts(2.6) + '"/>',
    coin: '<circle class="f" cx="0" cy="0" r="9"/><circle class="c" cx="0" cy="0" r="6.4"/><path class="f" d="M-4.2-1.2L0-4.4L4.2-1.2z"/><path class="f" d="M-4.4 4.6h8.8V3.6H-4.4z"/>' + COLS([-3, -.6, 1.8, 4].slice(0, 3).map(function (x) { return x - .2; }), -.4, 3.6, 1.2, 'f'),
    spires: '<path class="f" d="M-9 9V1L-6-9L-3 1V9z"/><path class="f" d="M3 9V1L6-9L9 1V9z"/><path class="f" d="M-3 9V3.4L0 .8L3 3.4V9z"/><path class="c" d="M-1.2 9V5.8Q0 4 1.2 5.8V9z"/><path class="c" d="M-6.8 5V2.6Q-6 1.6-5.2 2.6V5zM5.2 5V2.6Q6 1.6 6.8 2.6V5z"/>',
    arch: '<path class="f" d="M-9.4 8.6V-3.6h18.8V8.6H6.4V.6Q6.4-4.8 0-4.8T-6.4 .6V8.6z"/><path class="f" d="M-9.4-3.6V-7h18.8v3.4z"/>'
  };
  function pentPts(r) { var p = [], i, t; for (i = 0; i < 5; i++) { t = -Math.PI / 2 + i * 2 * Math.PI / 5; p.push((r * Math.cos(t)).toFixed(1) + ',' + (r * Math.sin(t)).toFixed(1)); } return p.join(' '); }
  function symbol(g, glyphName) {
    var sym = el('g', { 'class': 'dm-ic', 'aria-hidden': 'true' }, g);
    var m = ICONS[glyphName];
    if (!m) { el('circle', { 'class': 'f', r: 3.4 }, sym); return sym; }
    sym.innerHTML = m;   /* static markup defined above, never user text */
    return sym;
  }

  function create(host, stops, opts) {
    opts = opts || {};
    var meta = {}; stops.forEach(function (s) { meta[s.id] = s; });
    var svg = el('svg', { viewBox: '6 6 388 270', 'class': 'dm', role: 'img', 'aria-label': 'Schematic map of central Washington, D.C., with the Capitol at the east end of the National Mall and the Lincoln Memorial at the west end.', preserveAspectRatio: 'xMidYMid meet' });
    host.appendChild(svg);

    /* ---- ground ---- */
    el('rect', { x: 0, y: 0, width: 400, height: 300, 'class': 'dm-land' }, svg);
    var park = el('g', { 'class': 'dm-park' }, svg);
    el('ellipse', { cx: 150, cy: 196, rx: 76, ry: 56 }, park);              // West Potomac Park
    el('ellipse', { cx: 132, cy: 58, rx: 22, ry: 40, transform: 'rotate(-18 132 58)' }, park);   // Rock Creek
    el('ellipse', { cx: 28, cy: 172, rx: 20, ry: 26 }, park);               // Arlington hillside
    el('ellipse', { cx: 194, cy: 98, rx: 16, ry: 11 }, park);               // the Ellipse
    el('rect', { x: 92, y: 123, width: 232, height: 18, rx: 3 }, park);     // the Mall
    var water = el('g', { 'class': 'dm-water' }, svg);
    el('path', { d: 'M28 -10 C50 40 62 80 58 120 C54 160 52 190 74 220 C96 250 136 248 172 262 C204 273 226 284 236 312', 'class': 'dm-river', 'stroke-width': 26 }, water);
    el('path', { d: 'M412 148 C380 160 350 190 322 214 C296 236 268 262 238 296', 'class': 'dm-river', 'stroke-width': 18 }, water);
    el('ellipse', { cx: 160, cy: 198, rx: 28, ry: 24 }, water);              // Tidal Basin
    el('rect', { x: 94, y: 128, width: 56, height: 8, rx: 3 }, water);       // Reflecting Pool
    /* ---- streets ---- */
    var roads = el('g', { 'class': 'dm-road' }, svg);
    [['M180 68 L318 128'], ['M96 121 H340'], ['M96 143 H340'], ['M192 44 V240'], ['M318 132 H404'], ['M262 60 V150'], ['M318 20 V250'], ['M104 100 L190 60']].forEach(function (p) { el('path', { d: p[0] }, roads); });
    el('path', { d: 'M72 134 L34 160', 'class': 'dm-bridge' }, svg);        // Arlington Memorial Bridge
    el('path', { d: 'M296 244 L360 244', 'class': 'dm-bridge dm-thin' }, svg);
    /* north arrow */
    var nA = el('g', { 'class': 'dm-north', transform: 'translate(374 28)' }, svg);
    el('path', { d: 'M0 -14 L7 8 L0 3 L-7 8 Z' }, nA);

    /* ---- route layers ---- */
    var routeLine = el('path', { 'class': 'dm-route', d: '' }, svg);
    var trailLine = el('path', { 'class': 'dm-trail', d: '' }, svg);

    /* ---- stops ---- */
    var stopG = el('g', { 'class': 'dm-stops' }, svg), nodes = {};
    stops.forEach(function (s) {
      var g = el('g', { 'class': 'dm-stop', 'data-id': s.id, transform: 'translate(' + s.x + ' ' + s.y + ')' }, stopG);
      var tt = el('title', {}, g); tt.textContent = s.name;
      el('circle', { 'class': 'dm-ring', r: 15.5 }, g);
      el('circle', { 'class': 'dm-plate', r: 13.2 }, g);
      symbol(g, s.glyph);
      var bd = el('g', { 'class': 'dm-badge', transform: 'translate(9.6 -9.6)' }, g);
      el('circle', { 'class': 'dm-badge-bg', r: 5.2 }, bd);
      el('path', { 'class': 'dm-mark dm-mark-ok', d: 'M-2.6 .2 L-.8 2 L2.8 -2' }, bd);
      el('path', { 'class': 'dm-mark dm-mark-miss', d: 'M-2.2 -2.2 L2.2 2.2 M2.2 -2.2 L-2.2 2.2' }, bd);
      nodes[s.id] = g;
    });

    /* ---- pin ---- */
    var pin = el('g', { 'class': 'dm-pin', style: 'opacity:0' }, svg);
    el('ellipse', { 'class': 'dm-pin-shadow', cx: 0, cy: 0, rx: 5, ry: 2 }, pin);
    var pinBody = el('g', { 'class': 'dm-pin-body' }, pin);
    el('path', { d: 'M0 -1 C-4 -8 -8 -11 -8 -15 A8 8 0 1 1 8 -15 C8 -11 4 -8 0 -1Z', 'class': 'dm-pin-shape' }, pinBody);
    el('circle', { cx: 0, cy: -15, r: 3, 'class': 'dm-pin-eye' }, pinBody);

    var st = { route: [], idx: -1, res: [], pos: null, mode: opts.mode || 'free', raf: 0, selected: null };

    function pt(id) { return meta[id] ? { x: meta[id].x, y: meta[id].y } : null; }
    function setPin(p) { pin.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + (p.y - 12.6).toFixed(1) + ') scale(.72)'); st.pos = p; }
    function pathTo(ids, extra) {
      var d = '';
      ids.forEach(function (id, i) { var p = pt(id); if (p) d += (d ? 'L' : 'M') + p.x + ' ' + p.y; });
      if (extra) d += (d ? 'L' : 'M') + extra.x.toFixed(1) + ' ' + extra.y.toFixed(1);
      return d;
    }
    function paint() {
            Object.keys(nodes).forEach(function (id) {
        var g = nodes[id], k = st.route.indexOf(id), cls = 'dm-stop';
        if (st.mode === 'journey') {
          if (k >= 0) cls += ' on-route';
          /* a stop can appear twice on a thin route: colour by the latest visit */
          var last = -1; st.route.forEach(function (rid, j) { if (rid === id && (st.res[j] === 1 || st.res[j] === 0)) last = j; });
          if (last >= 0) cls += st.res[last] === 0 ? ' is-miss' : ' is-ok';
          if (k >= 0 && st.route[st.idx] === id) cls += ' is-current';
        } else if (st.mode === 'pick') {
          cls += ' pickable' + (st.selected === id ? ' is-sel' : '');
        } else if (st.selected === id) cls += ' is-current';
        g.setAttribute('class', cls);
      });
      svg.setAttribute('data-mode', st.mode);
      routeLine.setAttribute('d', st.mode === 'journey' ? pathTo(st.route) : '');
    }

    var anim = null;
    function cancelAnim() { if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; } if (anim) { var a = anim; anim = null; a.finish(); } }

    function moveTo(id, o) {
      o = o || {};
      var to = pt(id); if (!to) return Promise.resolve();
      cancelAnim();
      pin.style.opacity = 1;
      var from = st.pos, instant = o.instant || reduced() || !from;
      var routeIdx = o.routeIndex;
      if (instant) {
        setPin(to);
        if (st.mode === 'journey' && routeIdx >= 0) trailLine.setAttribute('d', pathTo(st.route.slice(0, routeIdx + 1)));
        pinBody.setAttribute('transform', '');
        return Promise.resolve();
      }
      var dx = to.x - from.x, dy = to.y - from.y, len = Math.sqrt(dx * dx + dy * dy);
      var dur = Math.max(420, Math.min(1000, 380 + len * 4.2));
      return new Promise(function (resolve) {
        var t0 = null, done = false;
        function finish() { if (done) return; done = true; setPin(to); pinBody.setAttribute('transform', ''); if (st.mode === 'journey' && routeIdx >= 0) trailLine.setAttribute('d', pathTo(st.route.slice(0, routeIdx + 1))); resolve(); }
        anim = { finish: finish };
        function step(ts) {
          if (done) return;
          if (t0 === null) t0 = ts;
          var k = Math.min(1, (ts - t0) / dur), e = ease(k);
          var p = { x: from.x + dx * e, y: from.y + dy * e };
          setPin(p);
          pinBody.setAttribute('transform', 'translate(0 ' + (-Math.sin(Math.PI * k) * 6).toFixed(2) + ')');
          if (st.mode === 'journey' && routeIdx >= 0) trailLine.setAttribute('d', pathTo(st.route.slice(0, routeIdx), p));
          if (k < 1) st.raf = requestAnimationFrame(step); else { st.raf = 0; anim = null; finish(); }
        }
        st.raf = requestAnimationFrame(step);
      });
    }

    function nearest(cx, cy, reach) {
      var m = svg.getScreenCTM(); if (!m) return null;
      var pt0 = svg.createSVGPoint(); pt0.x = cx; pt0.y = cy; var p = pt0.matrixTransform(m.inverse());
      var best = null, bd = reach * reach;
      stops.forEach(function (s) { var dx = s.x - p.x, dy = s.y - p.y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = s.id; } });
      return best;
    }
    svg.addEventListener('click', function (e) {
      if (st.mode !== 'pick' || !opts.onPick) return;
      /* the nearest symbol within 27 map units (about 24 to 27 px each way on a phone, so a finger never has to hit a thin target) */
      var id = nearest(e.clientX, e.clientY, 27);
      if (id) opts.onPick(id);
    });

    return {
      svg: svg,
      mode: function (m) { st.mode = m; if (m !== 'journey') { trailLine.setAttribute('d', ''); } paint(); },
      setRoute: function (ids) { st.route = ids.slice(); st.idx = -1; st.res = []; trailLine.setAttribute('d', ''); paint(); },
      setProgress: function (i, res) {
        st.idx = i; st.res = res || [];
        paint();
        if (st.mode === 'journey') trailLine.setAttribute('d', i > 0 ? pathTo(st.route.slice(0, i + 1)) : '');
      },
      moveTo: function (id, o) { return moveTo(id, o); },
      placePin: function (id) { var p = pt(id); if (p) { pin.style.opacity = 1; setPin(p); } },
      hidePin: function () { pin.style.opacity = 0; st.pos = null; },
      select: function (id) { st.selected = id; paint(); },
      destroy: function () { cancelAnim(); if (svg.parentNode) svg.parentNode.removeChild(svg); }
    };
  }
  window.DCJMap = { create: create };
})();
