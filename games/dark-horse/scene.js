/* Dark Horse: the racecourse behind the game.
   The whole page is a side-on racecourse: sky, the Washington skyline in the haze, hills, a tree line with a grandstand, then the
   infield, the rail and the dirt track along the bottom of the screen. The horse stays put on screen and the world scrolls past
   (parallax) as the score grows: every point is K units of track, a distance pole marks each 100 points, the finish post stands at a
   perfect day (7 x 100) and a Dark Horse bonus carries the horse on into a victory lap.
   API for trivia.js:  DHScene.set(points, lap)   DHScene.run(from, to, {label, ms, delay})   DHScene.balk()
   Decorative only (aria-hidden). No style attributes in markup (the site's CSP): positions are set through element.style. */
(function () {
  'use strict';
  if (!document.body || document.body.getAttribute('data-game') !== 'trivia') return;
  var MOTION = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var K = 6;                    // track units per point
  var STRIP = 190, GROUND = 156; // the front strip's height and the hoof line inside it (units)
  var HS = 1.65;                // horse scale
  var lap = 700, pts = 0, s = 1, vw = 0, horseX = 0, busy = 0;
  var NS = 'http://www.w3.org/2000/svg';
  function mk(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function ease(q) { return q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2; }

  /* ---------------------------------------------------------------- scenery tiles (each repeats sideways as an SVG pattern) */
  var uid = 0;
  function layer(parent, cls, H, w, factor, inner, defs) {
    var id = 'dhs' + (++uid);
    var box = mk('div', 'dhs-layer ' + cls, parent);
    box.innerHTML = '<svg xmlns="' + NS + '" preserveAspectRatio="xMinYMax slice" focusable="false"><defs>' + (defs || '') +
      '<pattern id="' + id + '" width="' + w + '" height="' + H + '" patternUnits="userSpaceOnUse">' + inner + '</pattern></defs>' +
      '<rect x="0" y="0" width="100%" height="' + H + '" fill="url(#' + id + ')"/></svg>';
    return { box: box, svg: box.firstChild, pat: box.querySelector('pattern'), H: H, w: w, f: factor };
  }

  // the Mall in the haze: Washington Monument, the Capitol, the Lincoln Memorial and low city blocks
  var SKY_W = 1500;
  function skyline() {
    var b = '', x;
    var blocks = [[20, 128, 60], [86, 136, 40], [130, 124, 46], [420, 132, 70], [500, 126, 38], [548, 134, 54], [612, 128, 40], [980, 130, 56], [1046, 136, 44], [1240, 126, 60], [1310, 134, 50], [1372, 130, 70], [1450, 136, 40]];
    blocks.forEach(function (k) { b += '<rect x="' + k[0] + '" y="' + k[1] + '" width="' + k[2] + '" height="' + (150 - k[1]) + '"/>'; });
    for (x = 0; x < SKY_W; x += 34) b += '<ellipse cx="' + (x + 17) + '" cy="' + (146 - (x * 7 % 9)) + '" rx="22" ry="' + (9 + (x * 13 % 6)) + '"/>';
    return '<g class="far">' + b +
      '<path d="M282 150L298 150L295.4 30L290 21L284.6 30Z"/>' +                                                   // Washington Monument
      '<path d="M730 150V124H770V116H800V104H806V96H854V104H860V116H890V124H930V150Z"/>' +                       // Capitol wings and base
      '<path d="M808 97C808 70 852 70 852 97Z"/><rect x="826" y="64" width="8" height="10"/><path d="M828 64h4l-1-9h-2z"/>' +  // dome, lantern, statue
      '<path d="M1108 150V124H1112V121H1198V124H1202V150Z"/>' +                                                   // Lincoln Memorial
      '</g>';
  }
  var HILL_W = 1300;
  function hills() { return '<path class="hill1" d="M0 120V70C140 46 290 52 430 68C580 86 720 40 880 44C1030 48 1160 74 1300 70V120Z"/>'; }
  var HILL2_W = 1100;
  function hills2() { return '<path class="hill2" d="M0 90V58C120 40 260 46 380 56C520 68 640 34 790 38C930 42 1020 60 1100 58V90Z"/>'; }
  var TREE_W = 1000;
  function trees() {
    var t = '', i, xs = [30, 70, 112, 150, 196, 236, 274, 640, 682, 722, 766, 806, 850, 892, 936, 972];
    xs.forEach(function (x, i) { var r = 20 + (i * 7 % 9), y = 92 - (i * 5 % 12); t += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/><circle cx="' + (x + 12) + '" cy="' + (y + 8) + '" r="' + (r - 5) + '"/>'; });
    var stand = '<g class="stand"><rect class="st-base" x="320" y="62" width="280" height="58"/><rect class="st-seat" x="328" y="70" width="264" height="30"/>' +
      '<path class="st-roof" d="M306 64H614L598 48H322Z"/><rect class="st-base" x="320" y="100" width="280" height="4"/>';
    for (i = 0; i < 9; i++) stand += '<rect class="st-col" x="' + (330 + i * 32) + '" y="64" width="3" height="40"/>';
    [360, 460, 560].forEach(function (x, k) { stand += '<rect class="st-pole" x="' + x + '" y="24" width="2" height="26"/><path class="' + (k === 1 ? 'st-flag2' : 'st-flag') + '" d="M' + (x + 2) + ' 25h16l-3 5 3 5h-16z"/>'; });
    return '<g class="tree">' + t + '</g>' + stand + '</g>';
  }
  // the front strip: infield turf with mowing stripes, the far rail, the dirt track with hoof-scuffed marks
  var STRIPE_W = 180, RAIL_W = 60, MARK_W = 260;
  function marks() {
    var m = '', i;
    for (i = 0; i < 14; i++) m += '<ellipse cx="' + ((i * 97) % MARK_W) + '" cy="' + (78 + (i * 37) % 104) + '" rx="' + (6 + i % 5 * 3) + '" ry="1.2"/>';
    return '<g class="mk">' + m + '</g>';
  }

  /* ---------------------------------------------------------------- the horse and jockey (side on, facing right, hooves on y = 0) */
  var LEGS = [ // hip/elbow pivot, upper and lower length, place in the stride, foreleg?, far side?
    { x: -22, y: -42, u: 22, l: 20, o: 0.00, f: 0, far: 0 }, { x: -19, y: -42, u: 22, l: 20, o: 0.10, f: 0, far: 1 },
    { x: 18, y: -36, u: 17, l: 19, o: 0.44, f: 1, far: 0 }, { x: 21, y: -36, u: 17, l: 19, o: 0.54, f: 1, far: 1 }];
  var FORE_UP = '<path class="coat" d="M-4.6 -2C-5.2 6 -3.2 13 -2.4 17L2.4 17C3.2 12 4.8 5 4.2 -2Z"/>';
  var FORE_LO = '<path class="pt" d="M-2.4 0L-2 11C-2 13 -1.3 15 -.3 16.5L-.6 19L4.4 19C4.4 17.5 3.6 16 2.5 15L2 11L2.4 0Z"/>';
  var HIND_UP = '<path class="coat" d="M-7.5 -4C-8.5 5 -5.4 14 -2.6 22L2.2 22C3.4 14 6.4 4 6.4 -4Z"/>';
  var HIND_LO = '<path class="pt" d="M-2.3 0C-2.1 3 -1.9 9 -1.9 13C-1.9 15 -1.2 16.8 -.1 18L-.4 20L4.4 20C4.4 18.6 3.5 17.2 2.4 16L2 13C2.1 9 2.4 3 2.7 0Z"/>';
  function leg(L) {
    return '<g class="leg' + (L.far ? ' far' : '') + '" transform="translate(' + L.x + ' ' + L.y + ')"><g>' + (L.f ? FORE_UP : HIND_UP) +
      '<g transform="translate(0 ' + L.u + ')">' + (L.f ? FORE_LO : HIND_LO) + '</g></g></g>';
  }
  var HORSE_SVG = '<svg xmlns="' + NS + '" viewBox="-66 -100 122 104" focusable="false"><defs>' +
    '<linearGradient id="dhsCoat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4b2c"/><stop offset=".55" stop-color="#4a2c1b"/><stop offset="1" stop-color="#2a1810"/></linearGradient>' +
    '<radialGradient id="dhsShade" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse class="shade" cx="-2" cy="1" rx="34" ry="4" fill="url(#dhsShade)"/>' +
    '<g class="hb">' +
      leg(LEGS[1]) + leg(LEGS[3]) +
      '<g class="tail-idle" transform="translate(-31.5 -57)"><path class="hair" d="M0 -2C-5 -1 -8 4 -9 12C-10 20 -8 28 -7 34C-5 30 -4 22 -3.5 15C-3 8 -1 4 1 3Z"/></g>' +
      '<g class="tail-run" transform="translate(-31.5 -57)"><path class="hair" d="M0 -2.5C-10 -4 -20 -3 -29 4C-24 3 -17 4 -11 7C-17 9 -22 12 -27 17C-17 14 -8 10 1 3Z"/></g>' +
      '<path class="coat" d="M-24 -61C-30 -60 -34 -55 -33.5 -49C-33 -44 -31 -40 -27 -37C-22 -33.5 -16 -33 -10 -33.5C0 -32.5 10 -32.5 16 -34C22 -35.5 28 -40 30 -46C31.5 -51 29 -56 26 -58C22 -61 17 -62.5 13 -61.5C6 -58 -2 -57 -8 -58C-14 -59.5 -19 -61.5 -24 -61Z"/>' +
      '<g class="neck"><g transform="rotate(22 14 -58)">' +
        '<path class="coat" d="M12 -61.5C15 -69 20 -77 26 -82.5C28 -84 30.5 -84.5 32.5 -83.5C36 -80 40.5 -73 44 -67.5C45 -65.5 44 -63.3 41.5 -63.6C39.5 -63.8 37 -65.5 35 -67.5C33 -69.5 31.5 -70.5 30 -69.5C29 -64 29.5 -57 29.5 -50Z"/>' +
        '<path class="blaze" d="M33.6 -82C36.6 -78 39.6 -73 42.6 -68.6L41.6 -67.7C38.6 -72 35.6 -77 32.7 -81.2Z"/>' +
        '<path class="coat" d="M29 -83L29.6 -89L32 -84Z"/>' +
        '<path class="hair" d="M27.5 -82.5C24 -80 21 -74 18 -70C16 -67 14 -64 12 -61.5L9.6 -62.4C12 -66 13 -70 15.6 -73.4C17.4 -76.4 20 -79.4 23.6 -82.2Z"/>' +
        '</g></g>' +
      '<path class="rein" d="M25.6 -66.6L44 -60.4"/>' +
      '<path class="cloth" d="M-9 -60.5H8.5L7.5 -49.5H-8Z"/><text class="cloth-n" x="-.2" y="-52">7</text>' +
      '<path class="breech" d="M-4 -66L9 -67L10.5 -64L6.5 -56.5L3.5 -57L6 -63.5L-3 -62Z"/>' +
      '<path class="boot" d="M6.6 -58.6L3.4 -57L3.8 -55.4L8.4 -55.8L8.8 -57.4Z"/>' +
      '<path class="silk" d="M-6 -66.5C-4 -72 6 -76.5 15 -76C17.6 -75.7 18.4 -73.2 16.6 -71.6C9 -70 1 -66 -3.5 -62.8Z"/>' +
      '<path class="silk-w" d="M2.5 -72.6L8.5 -74.6L10.5 -72L4.4 -69.8Z"/>' +
      '<path class="sleeve" d="M13 -74.5L22.5 -68.8L25.5 -67.2L24.5 -65.8L21 -67.5L11.5 -71.4Z"/>' +
      '<circle class="face" cx="23.4" cy="-77.4" r="1.7"/>' +
      '<circle class="helmet" cx="20.6" cy="-79.2" r="3.9"/><path class="helmet" d="M22.8 -80.6L27.2 -79.6L24 -78.2Z"/><path class="helmet-s" d="M17.4 -81.6Q20.6 -84.4 23.8 -81.6"/>' +
      leg(LEGS[0]) + leg(LEGS[2]) +
    '</g></svg>';

  /* ---------------------------------------------------------------- build */
  var root = mk('div', 'dhs'); root.setAttribute('aria-hidden', 'true');
  var back = mk('div', 'dhs-back', root);
  mk('div', 'dhs-sun', back);
  var stars = mk('div', 'dhs-stars', back);
  (function () {
    var d = '', i, x, y;
    for (i = 0; i < 70; i++) { x = (i * 137.5) % 1000; y = (i * 61.7) % 420; d += '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + (i % 7 ? .9 : 1.6) + '"/>'; }
    stars.innerHTML = '<svg xmlns="' + NS + '" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMin slice">' + d + '</svg>';
  })();
  var cloudBox = mk('div', 'dhs-clouds', back);
  [[6, 12, 1], [34, 6, .8], [58, 18, 1.2], [80, 9, .9], [102, 15, 1]].forEach(function (c, i) {
    var e = mk('div', 'dhs-cloud c' + i, cloudBox);
    e.innerHTML = '<svg xmlns="' + NS + '" viewBox="0 0 200 70"><path d="M18 60C4 60 2 44 16 41C14 26 34 20 44 30C50 12 82 8 92 28C102 16 128 18 130 36C146 30 164 40 158 52C176 52 180 60 170 62Z"/></svg>';
    e.style.left = c[0] + '%'; e.style.top = c[1] + '%'; e.style.setProperty('--cs', c[2]);
  });
  var L_SKY = layer(back, 'l-sky', 150, SKY_W, 0.06, skyline());
  var L_HILL = layer(back, 'l-hill', 120, HILL_W, 0.12, hills());
  var L_HILL2 = layer(back, 'l-hill2', 90, HILL2_W, 0.2, hills2());
  var L_TREE = layer(back, 'l-tree', 120, TREE_W, 0.36, trees());
  var strip = mk('div', 'dhs-strip', root);
  strip.innerHTML = '<svg xmlns="' + NS + '" class="dhs-ground" preserveAspectRatio="none" focusable="false"><defs>' +
    '<linearGradient id="dhsDirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="d1"/><stop offset="1" class="d2"/></linearGradient>' +
    '<pattern id="dhsStripe" width="' + STRIPE_W + '" height="64" patternUnits="userSpaceOnUse"><rect class="turf2" width="' + (STRIPE_W / 2) + '" height="64"/></pattern>' +
    '<pattern id="dhsRail" width="' + RAIL_W + '" height="64" patternUnits="userSpaceOnUse"><rect class="post" x="0" y="34" width="3.2" height="28"/></pattern>' +
    '<pattern id="dhsMarks" width="' + MARK_W + '" height="' + STRIP + '" patternUnits="userSpaceOnUse">' + marks() + '</pattern></defs>' +
    '<rect class="turf" x="0" y="0" width="100%" height="64"/>' +
    '<rect class="dirt" x="0" y="62" width="100%" height="' + (STRIP - 62) + '" fill="url(#dhsDirt)"/>' +
    '<g class="mv"><rect x="0" y="0" width="100%" height="62" fill="url(#dhsStripe)"/><rect x="0" y="0" width="100%" height="' + STRIP + '" fill="url(#dhsMarks)"/>' +
    '<rect x="0" y="0" width="100%" height="64" fill="url(#dhsRail)"/></g>' +
    '<rect class="railshade" x="0" y="62" width="100%" height="5"/>' +
    '<rect class="post" x="0" y="34" width="100%" height="3.4"/><rect class="post" x="0" y="45" width="100%" height="2.4"/>' +
    '<rect class="edge" x="0" y="' + (STRIP - 6) + '" width="100%" height="6"/></svg>';
  var ground = strip.firstChild;
  var PAT = [['dhsStripe', STRIPE_W], ['dhsRail', RAIL_W], ['dhsMarks', MARK_W]].map(function (p) { return [ground.querySelector('#' + p[0]), p[1]]; });
  var world = mk('div', 'dhs-world', strip);
  var horseBox = mk('div', 'dhs-horse', strip);
  horseBox.innerHTML = HORSE_SVG;
  var hsvg = horseBox.firstChild, hb = hsvg.querySelector('.hb'), neck = hsvg.querySelector('.neck'), tailRun = hsvg.querySelector('.tail-run');
  var legEls = [hsvg.querySelectorAll('.leg')[2], hsvg.querySelectorAll('.leg')[0], hsvg.querySelectorAll('.leg')[3], hsvg.querySelectorAll('.leg')[1]];  // in LEGS order
  document.body.insertBefore(root, document.body.firstChild);
  document.body.classList.add('dhs-on');

  /* distance poles: one every lap/7 points up to three laps; the finish post at one lap */
  function buildPoles() {
    world.innerHTML = '';
    var step = lap / 7, k, x, e, v;
    for (k = 1; k <= 21; k++) {
      v = Math.round(step * k); x = horseX / s + v * K;
      if (k === 7) {
        e = mk('div', 'dhs-finish', world);
        e.innerHTML = '<svg xmlns="' + NS + '" viewBox="0 0 70 62"><rect class="fp" x="8" y="16" width="4" height="46"/><rect class="fp" x="58" y="16" width="4" height="46"/>' +
          '<rect class="fb" x="4" y="6" width="62" height="20" rx="2"/><text class="ft" x="35" y="20.5">FINISH</text>' +
          '<g class="chk">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<rect x="' + (12 + (i % 4) * 4) + '" y="' + (30 + Math.floor(i / 4) * 4) + '" width="4" height="4"' + ((i + Math.floor(i / 4)) % 2 ? ' class="b"' : '') + '/>'; }).join('') + '</g></svg>';
        e.style.left = r1((x - 35) * s) + 'px'; e.style.width = r1(70 * s) + 'px'; e.style.top = '0px';
        var line = mk('div', 'dhs-line', world);
        line.style.left = r1((x - 2) * s) + 'px'; line.style.top = r1(64 * s) + 'px'; line.style.width = r1(5 * s) + 'px'; line.style.height = r1((STRIP - 70) * s) + 'px';
      } else {
        e = mk('div', 'dhs-pole' + (k > 7 ? ' gold' : ''), world);
        e.innerHTML = '<svg xmlns="' + NS + '" viewBox="0 0 40 60"><rect class="pp" x="18" y="22" width="4" height="38"/><circle class="pd" cx="20" cy="15" r="13"/><text class="pt" x="20" y="19">' + v + '</text></svg>';
        e.style.left = r1((x - 20) * s) + 'px'; e.style.width = r1(40 * s) + 'px'; e.style.top = r1(2 * s) + 'px';
      }
    }
  }

  /* ---------------------------------------------------------------- layout */
  function layout() {
    vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = window.innerHeight;
    s = Math.max(0.5, Math.min(1.12, vh / 900, vw / 640));
    horseX = Math.max(84 * s, Math.min(vw * 0.2, 300));
    var stripPx = STRIP * s;
    document.documentElement.style.setProperty('--dhs-strip', r1(stripPx) + 'px');
    strip.style.height = r1(stripPx) + 'px';
    ground.setAttribute('viewBox', '0 0 ' + r1(vw / s) + ' ' + STRIP);
    [L_SKY, L_HILL, L_HILL2, L_TREE].forEach(function (L) {
      L.svg.setAttribute('viewBox', '0 0 ' + r1(vw / s) + ' ' + L.H);
      L.box.style.height = r1(L.H * s) + 'px';
    });
    L_SKY.box.style.bottom = r1(stripPx + 34 * s) + 'px';
    L_HILL.box.style.bottom = r1(stripPx + 12 * s) + 'px';
    L_HILL2.box.style.bottom = r1(stripPx - 4 * s) + 'px';
    L_TREE.box.style.bottom = r1(stripPx - 6 * s) + 'px';
    var hw = 122 * HS * s, hh = 104 * HS * s;
    horseBox.style.width = r1(hw) + 'px'; horseBox.style.height = r1(hh) + 'px';
    horseBox.style.left = r1(horseX - 66 * HS * s) + 'px';
    horseBox.style.top = r1(GROUND * s - 100 * HS * s) + 'px';
    if (typeof trail !== 'undefined' && trail) {   // the streak behind the horse while it runs
      trail.style.left = r1(horseX - 190 * s) + 'px'; trail.style.width = r1(170 * s) + 'px';
      trail.style.top = r1((GROUND - 62 * HS) * s) + 'px'; trail.style.height = r1(30 * HS * s) + 'px';
    }
    buildPoles();
    paint(pts);
  }
  /* move the world to a score */
  function paint(p) {
    var cam = p * K;
    [L_SKY, L_HILL, L_HILL2, L_TREE].forEach(function (L) { L.pat.setAttribute('patternTransform', 'translate(' + r1(-(cam * L.f) % L.w) + ' 0)'); });
    PAT.forEach(function (q) { q[0].setAttribute('patternTransform', 'translate(' + r1(-cam % q[1]) + ' 0)'); });
    world.style.transform = 'translate3d(' + r1(-cam * s) + 'px,0,0)';
    cloudBox.style.transform = 'translate3d(' + r1(-cam * 0.03 * s) + 'px,0,0)';
  }

  /* ---------------------------------------------------------------- the gait (a rotary gallop: hind, hind, fore, fore, then a moment of suspension) */
  function angles(L, t) {
    var p = ((t + L.o) % 1 + 1) % 1, u, l, q;
    if (L.f) {
      if (p < .36) { q = p / .36; u = -30 + 62 * q; l = -4 + 12 * q; }
      else { q = (p - .36) / .64; u = 32 - 64 * ease(q); l = q < .78 ? 112 * Math.sin(Math.PI * q / .78) : -6 * (q - .78) / .22; }
    } else {
      if (p < .4) { q = p / .4; u = -24 + 58 * q; l = -12 + 16 * q; }
      else { q = (p - .4) / .6; u = 34 - 58 * ease(q); l = -82 * Math.sin(Math.PI * Math.min(1, q / .8)); }
      u += 10; l -= 10;
    }
    return [u, l, p];
  }
  function pose(t, vel) {
    vel = vel || 0;
    for (var i = 0; i < 4; i++) {
      var a = angles(LEGS[i], t), g = legEls[i].firstChild;
      g.setAttribute('transform', 'rotate(' + r1(a[0]) + ')');
      g.lastChild.setAttribute('transform', 'translate(0 ' + LEGS[i].u + ') rotate(' + r1(a[1]) + ')');
    }
    var w = 2 * Math.PI * t;
    hb.setAttribute('transform', 'translate(0 ' + r1(-2.6 - (2 + 2 * vel) * Math.sin(w * 2 + .6)) + ') rotate(' + r1(3.5 * vel + (1.6 + 1.6 * vel) * Math.sin(w + .8)) + ' 0 -40)');
    neck.setAttribute('transform', 'rotate(' + r1(-3 + 4 * Math.sin(w + 2.2)) + ' 14 -58)');
    tailRun.setAttribute('transform', 'translate(-31.5 -57) rotate(' + r1(5 * Math.sin(w * 2)) + ')');
  }
  function stand() {
    for (var i = 0; i < 4; i++) {
      var g = legEls[i].firstChild, L = LEGS[i];
      g.setAttribute('transform', 'rotate(' + (L.f ? 2 : 10) + ')');
      g.lastChild.setAttribute('transform', 'translate(0 ' + L.u + ') rotate(' + (L.f ? 0 : -10) + ')');
    }
    hb.removeAttribute('transform'); neck.removeAttribute('transform');
  }

  /* hoof dust and the points pop-up */
  var dustN = 0;
  function dust(dx, vel) {
    vel = vel || .5;
    if (dustN > 26) return;
    var d = mk('div', 'dhs-dust', strip); dustN++;
    d.style.left = r1(horseX + 56 * s * vel + dx * HS * s) + 'px'; d.style.top = r1((GROUND - 6) * s) + 'px';
    d.style.setProperty('--ds', r1(s * (0.6 + vel * 0.9 + Math.random() * 0.5)));
    d.addEventListener('animationend', function () { d.remove(); dustN--; });
  }
  function pop(text, big) {
    if (!text) return;
    var e = mk('div', 'dhs-pop' + (big ? ' big' : ''), strip);
    e.textContent = text;
    e.style.left = r1(horseX + 50 * HS * s) + 'px'; e.style.top = r1((GROUND - 96 * HS) * s) + 'px';
    e.addEventListener('animationend', function () { e.remove(); });
  }

  /* ---------------------------------------------------------------- motion effects while galloping
     speed lines (in front of the track and over the lower sky), a sideways blur on the moving ground and trees, a streak behind the
     horse, the horse surging forward and leaning in, the track bumping under it. All of it follows the run's speed (0 at rest, 1 flat out). */
  function speedSvg(id) {
    var l = '', i;
    for (i = 0; i < 16; i++) {
      var y = (i * 53 + 17) % 300, len = 70 + (i * 97) % 190, x = (i * 211) % 900, h = 1.4 + (i % 3) * .7;
      l += '<rect x="' + x + '" y="' + y + '" width="' + len + '" height="' + h + '" rx="' + (h / 2) + '" opacity="' + (.45 + (i % 4) * .15) + '"/>';
    }
    return '<svg xmlns="' + NS + '" width="100%" height="100%" focusable="false"><defs><pattern id="' + id + '" width="900" height="300" patternUnits="userSpaceOnUse">' + l + '</pattern></defs>' +
      '<rect width="100%" height="100%" fill="url(#' + id + ')"/></svg>';
  }
  var speedBack = mk('div', 'dhs-speed dhs-speed-back', back), speedFront = mk('div', 'dhs-speed dhs-speed-front', strip);
  speedBack.innerHTML = speedSvg('dhsSpB'); speedFront.innerHTML = speedSvg('dhsSpF');
  var SPEED = [speedBack.querySelector('pattern'), speedFront.querySelector('pattern')];
  var trail = mk('div', 'dhs-trail', strip);
  strip.insertBefore(trail, horseBox);
  /* the sideways blur: one filter for the track (ground svg) and one for the tree line */
  function addBlur(svg, id) {
    var defs = svg.querySelector('defs');
    defs.insertAdjacentHTML('beforeend', '<filter id="' + id + '" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>');
    return defs.querySelector('#' + id + ' feGaussianBlur');
  }
  var blurG = addBlur(ground, 'dhsMbG'), blurT = addBlur(L_TREE.svg, 'dhsMbT');
  var blurTargets = [[ground.querySelector('.mv'), 'dhsMbG', blurG], [L_TREE.svg.querySelector('rect'), 'dhsMbT', blurT], [L_HILL2.svg.querySelector('rect'), 'dhsMbT', null]];
  var blurOn = false;
  function motion(vel, cam, k, big) {
    var a = Math.max(0, (vel - .2) / .8);
    speedBack.style.opacity = r1(a * .55); speedFront.style.opacity = r1(a * .8);
    SPEED[0].setAttribute('patternTransform', 'translate(' + r1(-(cam * s * 1.3) % 900) + ' 0)');
    SPEED[1].setAttribute('patternTransform', 'translate(' + r1(-(cam * s * 2.2) % 900) + ' 0)');
    var sd = vel > .3 ? (vel - .3) * 10 : 0;
    if (sd > .25) {
      blurG.setAttribute('stdDeviation', r1(sd) + ' 0'); blurT.setAttribute('stdDeviation', r1(sd * .6) + ' 0');
      if (!blurOn) { blurTargets.forEach(function (b) { if (b[0]) b[0].setAttribute('filter', 'url(#' + b[1] + ')'); }); blurOn = true; }
    } else if (blurOn) { blurTargets.forEach(function (b) { if (b[0]) b[0].removeAttribute('filter'); }); blurOn = false; }
    var bump = vel > .1 ? (Math.random() - .5) * 2.2 * vel * s : 0;
    ground.style.transform = bump ? 'translate3d(0,' + r1(bump) + 'px,0)' : '';
    horseBox.style.transform = 'translate3d(' + r1(56 * s * vel) + 'px,' + r1(-3 * s * vel) + 'px,0)';
    trail.style.opacity = r1(a * (big ? 1 : .75));
    trail.style.transform = 'translate3d(' + r1(56 * s * vel) + 'px,0,0) scaleX(' + r1(.4 + a) + ')';
    trail.classList.toggle('gold', !!big);
  }
  function motionOff() {
    speedBack.style.opacity = 0; speedFront.style.opacity = 0; trail.style.opacity = 0;
    if (blurOn) { blurTargets.forEach(function (b) { if (b[0]) b[0].removeAttribute('filter'); }); blurOn = false; }
    ground.style.transform = ''; horseBox.style.transform = '';
  }

  /* ---------------------------------------------------------------- public */
  var token = 0;
  function set(p, lp) {
    token++; busy = 0; horseBox.classList.remove('run'); motionOff();
    if (lp && lp !== lap) { lap = lp; buildPoles(); }
    pts = Math.max(0, p || 0); stand(); paint(pts);
  }
  /* an S-curve with a long flat-out middle: a burst away, a hard run, then pulling up */
  var RA = .22, RB = .8, RAREA = RA / 2 + (RB - RA) + (1 - RB) / 2;
  function runEase(k) { return (k < RA ? k * k / (2 * RA) : k <= RB ? RA / 2 + (k - RA) : RAREA - (1 - k) * (1 - k) / (2 * (1 - RB))) / RAREA; }
  function runVel(k) { return k < .22 ? k / .22 : k > .8 ? (1 - k) / .2 : 1; }
  function run(from, to, o) {
    o = o || {};
    set(from, o.lap);
    var my = token;
    if (!MOTION) { pts = to; paint(pts); pop(o.label, o.big); return; }
    if (to <= from) { setTimeout(function () { if (my === token) balk(); }, o.delay || 0); return; }
    var ms = o.ms || Math.round(1300 + 2600 * Math.min(1, (to - from) / 300));
    setTimeout(function () {
      if (my !== token) return;
      var slow = +window.__DHS_SLOW || 1, t0 = null, prev = null, phase = 0, STRIDE = 400 * slow, last = [];   /* __DHS_SLOW: a testing aid (slow motion), never set by the site */
      ms *= slow;
      horseBox.classList.add('run'); busy = 1;
      function step(ts) {
        if (my !== token) return;
        if (t0 === null) { t0 = ts; prev = ts; }
        var el = ts - t0, k = Math.min(1, el / ms), vel = runVel(k), dt = ts - prev; prev = ts;
        phase += dt / (STRIDE * (1.3 - .55 * vel));   // the legs speed up as the horse gets going
        pts = from + (to - from) * runEase(k);
        paint(pts);
        if (k < 1) {
          pose(phase % 1, vel);
          motion(vel, pts * K, k, o.big);
          for (var i = 0; i < 4; i++) {
            var ph = angles(LEGS[i], phase % 1)[2];
            if (last[i] !== undefined && ph < last[i] && !LEGS[i].far) { dust(LEGS[i].x + 4, vel); if (vel > .7) dust(LEGS[i].x - 6, vel); }
            last[i] = ph;
          }
          requestAnimationFrame(step);
        } else { horseBox.classList.remove('run'); busy = 0; motionOff(); stand(); pop(o.label, o.big); }
      }
      requestAnimationFrame(step);
    }, o.delay || 0);
  }
  function balk() {
    if (!MOTION) return;
    var my = ++token, t0 = null, ms = 900;
    function step(ts) {
      if (my !== token) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms), a = Math.sin(Math.PI * k);
      hb.setAttribute('transform', 'rotate(' + r1(-9 * a) + ' -22 0)');
      neck.setAttribute('transform', 'rotate(' + r1(-8 * Math.sin(Math.PI * 3 * k) * a) + ' 14 -58)');
      [2, 3].forEach(function (i) { var g = legEls[i].firstChild; g.setAttribute('transform', 'rotate(' + r1(2 - 50 * a) + ')'); g.lastChild.setAttribute('transform', 'translate(0 ' + LEGS[i].u + ') rotate(' + r1(80 * a) + ')'); });
      if (k < 1) requestAnimationFrame(step); else stand();
    }
    requestAnimationFrame(step);
  }
  window.DHScene = { set: set, run: run, balk: balk };

  stand();
  layout();
  /* re-lay out on a real resize only: a phone's address bar sliding in and out while scrolling changes the height a little, and rebuilding then made the scene jump */
  var rz = 0, lastW = vw, lastH = window.innerHeight;
  window.addEventListener('resize', function () {
    var w = document.documentElement.clientWidth || window.innerWidth, h = window.innerHeight;
    if (w === lastW && Math.abs(h - lastH) < 160) return;
    lastW = w; lastH = h; cancelAnimationFrame(rz); rz = requestAnimationFrame(layout);
  });
})();
