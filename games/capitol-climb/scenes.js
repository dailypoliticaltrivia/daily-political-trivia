/* Capitol Climb: the scene art. One small original vector picture per stop (drawn in code, flat style, no photos, no outside files).
   DCJ_SCENES.has(id)  true when a scene exists;   DCJ_SCENES.svg(id)  the picture as an <svg> string (decorative: aria-hidden, no text in it).
   Every colour is a class (.sc-*) coloured by CSS variables in dcj.css, so light and dark follow the site themes and a dusk sky is just the dark palette.
   Canvas 400 x 150, ground line near y 112. The page crops the top 20 units on short screens, so keep the important shapes below y 24. */
(function () {
  'use strict';
  var K = '';                                   // id of the scene being built (keeps clip-path ids unique)
  function a(o) { var s = ''; for (var k in o) s += ' ' + k + '="' + o[k] + '"'; return s; }
  function R(c, x, y, w, h) { return '<rect class="' + c + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>'; }
  function P(c, d) { return '<path class="' + c + '" d="' + d + '"/>'; }
  function G(c, p, q) { if (q !== undefined) p = p + ',' + q; return '<polygon class="' + c + '" points="' + p + '"/>'; }
  function C(c, x, y, r) { return '<circle class="' + c + '" cx="' + x + '" cy="' + y + '" r="' + r + '"/>'; }
  function E(c, x, y, rx, ry) { return '<ellipse class="' + c + '" cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '"/>'; }
  function L(c, x1, y1, x2, y2) { return '<line class="' + c + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>'; }
  function arch(c, x, y, w, h) { return P(c, 'M' + x + ' ' + (y + h) + 'V' + (y + w / 2) + 'A' + (w / 2) + ' ' + (w / 2) + ' 0 0 1 ' + (x + w) + ' ' + (y + w / 2) + 'V' + (y + h) + 'Z'); }
  function cols(x0, x1, y, h, n, w, c) { var s = '', i, cx; for (i = 0; i < n; i++) { cx = n > 1 ? x0 + (x1 - x0) * i / (n - 1) : x0; s += R(c || 'st', (cx - w / 2).toFixed(1), y, w, h) + R('st2', (cx + w * 0.08).toFixed(1), y, (w * 0.42).toFixed(1), h); } return s; }
  function steps(cx, y, w, n, h, grow) { var s = '', i; for (i = 0; i < n; i++) { var ww = w + 2 * grow * i; s += R(i % 2 ? 'st2' : 'st', (cx - ww / 2).toFixed(1), y + i * h, ww, h); } return s; }
  function wins(x0, x1, y, n, w, h, c) { var s = '', i; for (i = 0; i < n; i++) s += R(c || 'gl', (n > 1 ? x0 + (x1 - x0) * i / (n - 1) : x0) - w / 2, y, w, h); return s; }
  function archwins(x0, x1, y, n, w, h, c) { var s = '', i; for (i = 0; i < n; i++) s += arch(c || 'gl', ((n > 1 ? x0 + (x1 - x0) * i / (n - 1) : x0) - w / 2).toFixed(1), y, w, h); return s; }
  function tree(x, y, s) { s = s || 1; return R('tk', x - 1.2 * s, y - 8 * s, 2.4 * s, 8 * s) + C('tr2', x + 2 * s, y - 13 * s, 8 * s) + C('tr', x - 1 * s, y - 15 * s, 8 * s); }
  function bloss(x, y, s) { s = s || 1; return R('tk', x - 1.2 * s, y - 8 * s, 2.4 * s, 8 * s) + C('pk2', x + 3 * s, y - 12 * s, 7 * s) + C('pk', x - 1 * s, y - 15 * s, 8 * s) + C('pk2', x - 5 * s, y - 11 * s, 5 * s); }
  function pine(x, y, s) { s = s || 1; return R('tk', x - 1 * s, y - 4 * s, 2 * s, 4 * s) + G('tr2', (x - 7 * s) + ',' + (y - 3 * s) + ' ' + x + ',' + (y - 24 * s) + ' ' + (x + 7 * s) + ',' + (y - 3 * s)); }
  function bush(x, y, s) { s = s || 1; return E('tr2', x, y - 3 * s, 7 * s, 4.5 * s) + E('tr', x - 2 * s, y - 4 * s, 5 * s, 3.5 * s); }
  function flag(x, y, h, w) { h = h || 24; w = w || 13; return L('pole', x, y, x, y - h) + R('rd', x + 0.7, y - h, w, 2.2) + R('st', x + 0.7, y - h + 2.2, w, 2.2) + R('rd', x + 0.7, y - h + 4.4, w, 2.2) + R('bl', x + 0.7, y - h, w * 0.4, 3.6); }
  function lamp(x, y, h) { h = h || 18; return L('pole', x, y, x, y - h) + C('gl', x, y - h - 2, 2.4) + R('pole2', x - 2.4, y - h - 5, 4.8, 1.2); }
  function fig(x, y, s, c) { s = s || 1; return C(c || 'bk2', x, y - 17 * s, 2.6 * s) + P(c || 'bk2', 'M' + (x - 4 * s) + ' ' + y + 'L' + (x - 3 * s) + ' ' + (y - 14 * s) + 'H' + (x + 3 * s) + 'L' + (x + 4 * s) + ' ' + y + 'Z'); }

  function sky(o) {
    o = o || {}; var s = '<defs><linearGradient id="scg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sg1"/><stop offset="1" class="sg2"/></linearGradient></defs>';
    s += R('sk', 0, 0, 400, 150);
    s += '<g class="stars">' + C('stz', 30, 24, 1) + C('stz', 74, 44, .8) + C('stz', 118, 18, 1) + C('stz', 162, 36, .8) + C('stz', 250, 22, 1) + C('stz', 296, 46, .8) + C('stz', 348, 20, 1) + C('stz', 384, 52, .8) + C('stz', 214, 52, .7) + '</g>';
    s += C('sn', o.sx || 330, o.sy || 38, o.sr || 11);
    var c1 = o.cx || 70;
    s += '<g class="cl">' + E('cd', c1, 48, 26, 5.5) + E('cd', c1 + 16, 43, 15, 6) + E('cd', c1 - 14, 44, 12, 5) + '</g>';
    s += '<g class="cl cl2">' + E('cd', o.cx2 || 250, 34, 20, 4.5) + E('cd', (o.cx2 || 250) + 12, 30, 11, 5) + '</g>';
    return s;
  }
  function ground(gy, c) { return R(c || 'gr', 0, gy, 400, 150 - gy) + R('gr2', 0, gy + (150 - gy) * 0.55, 400, (150 - gy) * 0.45); }
  function far(gy, kind) {   // low distant tree line
    var s = '', i; for (i = 0; i < 14; i++) s += C('fr', 15 + i * 30 + (i % 3) * 5, gy - 2 - (i % 4) * 2, 11 + (i % 3) * 2);
    return s + R('fr', 0, gy - 2, 400, 4);
  }
  function refl(inner, gy) {
    return '<clipPath id="rc' + K + '"><rect x="0" y="' + gy + '" width="400" height="' + (150 - gy) + '"/></clipPath><g clip-path="url(#rc' + K + ')"><g class="rfl" transform="translate(0 ' + (2 * gy) + ') scale(1 -1)">' + inner + '</g></g>';
  }
  function ripples(y0, n) { var s = '', i; for (i = 0; i < n; i++) s += R('wt2', 30 + (i * 97) % 300, y0 + i * 6, 40 + (i * 13) % 30, 1.4); return s; }
  function pent(cx, cy, r, sy) { var p = [], i, t; for (i = 0; i < 5; i++) { t = -Math.PI / 2 + i * 2 * Math.PI / 5; p.push((cx + r * Math.cos(t)).toFixed(1) + ',' + (cy + r * Math.sin(t) * sy).toFixed(1)); } return p.join(' '); }

  var S = {};

  S['white-house'] = function () {
    var s = sky({ sx: 336, sy: 40 }) + far(110) + ground(110);
    s += R('st', 84, 80, 232, 30) + R('st2', 84, 104, 232, 6) + R('st', 82, 76, 236, 4) + R('st2', 82, 79, 236, 1.5);
    s += wins(96, 150, 86, 6, 5, 8) + wins(96, 150, 98, 6, 5, 8) + wins(250, 304, 86, 6, 5, 8) + wins(250, 304, 98, 6, 5, 8);
    s += R('st2', 106, 68, 5, 8) + R('st2', 288, 68, 5, 8);
    s += R('st3', 164, 70, 72, 40) + cols(170, 230, 70, 40, 6, 6.5) + R('st', 160, 64, 80, 6) + G('st', 156, '64 200,44 244,64') + G('st2', 168, '62 200,49 232,62'.replace(/^/, '')) + C('gl', 200, 56, 3);
    s += R('st', 166, 108, 68, 2) + R('st2', 160, 110, 80, 3) + R('gl', 190, 90, 20, 18);
    s += flag(200, 44, 20, 12) + tree(46, 116, 1.5) + tree(352, 116, 1.4) + tree(66, 118, 1.1) + bush(122, 112, 1.3) + bush(278, 112, 1.3);
    s += E('wt', 200, 134, 34, 6) + E('wt2', 200, 133, 24, 3.5) + L('wj', 200, 133, 200, 122) + P('wj', 'M200 123 Q192 124 190 131M200 123 Q208 124 210 131');
    return s;
  };

  S['capitol-rotunda'] = function () {
    var s = sky({ sx: 50, sy: 42, cx: 300, cx2: 120 }) + far(110) + ground(110);
    s += '<g transform="translate(30 17) scale(.85)">';
    s += R('st', 58, 88, 284, 22) + R('st2', 58, 105, 284, 5) + wins(70, 142, 94, 7, 5, 8) + wins(258, 330, 94, 7, 5, 8);
    s += R('st', 146, 78, 108, 32) + R('st3', 164, 84, 72, 26) + cols(170, 230, 84, 26, 6, 5.5) + G('st', 160, '84 200,70 240,84'.replace(/^/, ''));
    s += R('st', 160, 82, 80, 4) + steps(200, 108, 100, 3, 3, 8);
    s += R('st', 160, 56, 80, 24) + cols(166, 234, 58, 19, 9, 4.2) + R('st', 158, 52, 84, 5) + R('st3', 162, 60, 76, 3);
    s += P('st', 'M164 52C164 20 236 20 236 52Z') + P('st2', 'M200 22C222 22 236 34 236 52H200Z') + P('wl', 'M200 24V52M184 28Q178 40 178 52M216 28Q222 40 222 52');
    s += R('st', 190, 20, 20, 5) + R('st3', 193, 21, 14, 2) + P('st', 'M192 20Q200 8 208 20Z') + R('gd', 198.4, 6, 3.2, 10) + '</g>';
    s += tree(34, 116, 1.4) + tree(366, 116, 1.4) + tree(100, 114, 1) + tree(300, 114, 1) + R('pv', 176, 118, 48, 32);
    return s;
  };

  function chamber(house) {
    var s = R('wl2', 0, 0, 400, 150) + R('st', 0, 20, 400, 5) + R('st2', 0, 25, 400, 3) + cols(26, 374, 28, 50, 12, 10, 'st') + R('gal', 0, 76, 400, 4), i, y, hw;
    s += R('fl', 0, 80, 400, 70);
    if (house) {
      for (i = 0; i < 7; i++) s += R(i % 2 ? 'st' : 'rd', 136, 32 + i * 7, 128, 7);
      s += R('bl', 136, 32, 54, 28);
      for (i = 0; i < 12; i++) s += C('st', 142 + (i % 4) * 13, 38 + Math.floor(i / 4) * 9, 1.5);
      s += R('gd', 130, 30, 6, 52) + R('gd', 264, 30, 6, 52);
    } else {
      s += R('rd', 150, 30, 100, 52) + P('rd2', 'M150 30Q200 52 250 30V82H150Z') + G('gd', '200,36 202.5,42 208,42 203.5,45.5 205,51 200,47.5 195,51 196.5,45.5 192,42 197.5,42');
      s += L('pole', 120, 30, 120, 100) + L('pole', 280, 30, 280, 100) + R('rd', 112, 38, 8, 3) + R('bl', 280, 38, 8, 12) + R('st', 280, 41, 8, 2) + R('st', 280, 45, 8, 2);
    }
    s += R('bz', 164, 82, 72, 9) + R('gd', 164, 82, 72, 1.5) + R('bz2', 172, 74, 56, 8) + R('gd', 172, 74, 56, 1.5) + R('bz2', 182, 66, 36, 8) + R('gd', 182, 66, 36, 1.5) + C('st', 200, 62, 4.2) + R('st', 196.5, 64, 7, 3);
    for (i = 0; i < 5; i++) {
      y = 98 + i * 10; hw = 66 + i * 40;
      s += P(house ? 'dsk3' : 'dsk2', 'M' + (200 - hw) + ' ' + (y + 3) + 'Q200 ' + (y + 17) + ' ' + (200 + hw) + ' ' + (y + 3));
      s += P(house ? 'dsk4' : 'dsk', 'M' + (200 - hw) + ' ' + y + 'Q200 ' + (y + 14) + ' ' + (200 + hw) + ' ' + y);
    }
    return s;
  }
  S['senate-floor'] = function () { return chamber(false); };
  S['house-floor'] = function () { return chamber(true); };

  S['supreme-court'] = function () {
    var s = sky({ sx: 60, sy: 40 }) + far(112) + ground(112);
    s += R('st', 82, 70, 36, 42) + R('st', 282, 70, 36, 42) + R('st2', 82, 66, 36, 4) + R('st2', 282, 66, 36, 4) + wins(94, 106, 78, 2, 5, 9) + wins(294, 306, 78, 2, 5, 9);
    s += R('st3', 128, 66, 144, 46) + cols(136, 264, 66, 44, 8, 8.5) + R('st', 122, 58, 156, 8) + G('st', 118, '58 200,30 282,58') + G('st2', 128, '56 200,36 272,56'.replace(/^/, ''));
    s += P('st', 'M146 56L200 38L254 56Z') + C('st2', 200, 50, 3) + C('st2', 188, 52, 2.4) + C('st2', 212, 52, 2.4) + C('st2', 176, 54, 2) + C('st2', 224, 54, 2);
    s += steps(200, 110, 156, 5, 3.6, 5) + lamp(104, 126, 20) + lamp(296, 126, 20) + tree(40, 118, 1.5) + tree(362, 118, 1.5) + flag(70, 112, 24, 12);
    return s;
  };

  S['library-of-congress'] = function () {
    var s = sky({ sx: 342, sy: 42 }) + far(112) + ground(112);
    s += R('st', 70, 84, 260, 28) + R('st2', 70, 104, 260, 8) + R('st', 68, 80, 264, 4) + archwins(86, 150, 90, 5, 7, 12) + archwins(250, 314, 90, 5, 7, 12);
    s += R('st', 140, 66, 120, 46) + R('st2', 140, 100, 120, 12) + arch('st3', 152, 92, 20, 20) + arch('st3', 190, 92, 20, 20) + arch('st3', 228, 92, 20, 20);
    s += cols(152, 248, 70, 20, 7, 4.5) + R('st', 138, 64, 124, 4) + R('st', 136, 60, 128, 4) + wins(170, 230, 74, 2, 8, 11, 'gl');
    s += R('st', 168, 46, 64, 16) + R('st2', 168, 56, 64, 6) + archwins(178, 222, 49, 4, 6, 10, 'gl');
    s += P('cp', 'M172 46C174 22 226 22 228 46Z') + P('cp2', 'M200 26C216 27 227 35 228 46H200Z') + R('gd', 168, 44, 64, 2.4) + P('gd', 'M193 25Q200 9 207 25Z') + C('gd2', 200, 8, 2.6);
    s += steps(200, 112, 120, 4, 3.4, 6) + tree(36, 118, 1.4) + tree(366, 118, 1.4) + bush(106, 114, 1.2) + bush(296, 114, 1.2);
    return s;
  };

  S['national-archives'] = function () {
    var s = sky({ sx: 58, sy: 42 }) + far(112) + ground(112);
    s += R('sd2', 96, 76, 208, 36) + R('sd', 92, 36, 216, 10) + R('sd2', 96, 46, 208, 4) + R('st3', 108, 50, 184, 62) + cols(114, 286, 50, 58, 8, 11, 'sd') + R('sd', 90, 32, 220, 5) + R('sd2', 100, 28, 200, 4);
    s += R('bz', 188, 66, 24, 44) + R('bz2', 200, 66, 12, 44) + L('gdl', 200, 66, 200, 110) + arch('bz', 186, 58, 28, 10);
    s += steps(200, 110, 196, 4, 3.2, 6) + R('pv', 150, 124, 100, 26);
    s += fig(110, 112, 1.3, 'bk2') + R('st2', 104, 109, 12, 3) + fig(290, 112, 1.3, 'bk2') + R('st2', 284, 109, 12, 3);
    s += flag(76, 112, 26, 12) + flag(324, 112, 26, 12) + tree(40, 118, 1.5) + tree(362, 118, 1.5);
    return s;
  };

  S['lincoln-memorial'] = function () {
    K = 'lm';
    var temple = R('st', 88, 34, 224, 6) + R('st2', 92, 40, 216, 3) + R('st', 96, 43, 208, 10) + R('st2', 96, 50, 208, 3) + R('st3', 106, 53, 188, 49) + cols(110, 290, 53, 49, 12, 9, 'st')
      + R('st', 98, 100, 204, 5) + steps(200, 104, 208, 3, 3, 8) + R('st', 194, 66, 12, 30) + C('st', 200, 64, 4) + P('st2', 'M190 96L192 78Q200 70 208 78L210 96Z');
    var s = sky({ sx: 340, sy: 44 }) + far(110) + ground(110, 'gr') + temple;
    s += tree(44, 112, 1.6) + tree(360, 112, 1.6) + tree(74, 112, 1.2) + tree(330, 112, 1.2);
    s += R('wt', 0, 120, 400, 30) + refl(temple, 120).replace('translate(0 240)', 'translate(0 230)') + ripples(124, 4) + R('wt2', 0, 120, 400, 1.5);
    return s;
  };

  S['washington-monument'] = function () {
    var s = sky({ sx: 90, sy: 44, cx: 290, cx2: 130 }) + far(112) + ground(112);
    s += P('fr', 'M30 112V100Q40 92 56 94L64 90L72 94Q86 94 88 112Z') + C('fr', 60, 90, 8) + R('fr', 56, 82, 8, 8);
    s += bloss(46, 118, 1.4) + bloss(360, 118, 1.5) + bloss(326, 116, 1.1);
    s += G('st', '188,112 192,40 200,22 208,40 212,112') + G('st2', '200,22 208,40 212,112 200,112') + R('st3', 195, 46, 3, 4) + R('st3', 203, 46, 3, 4) + C('rd', 200, 25, 1.3);
    s += L('ln', 191, 78, 209, 78) + L('ln', 190, 96, 210, 96);
    var i, t;
    for (i = 0; i < 14; i++) { t = i * 2 * Math.PI / 14; s += R(i % 3 ? 'st' : 'rd', (200 + 36 * Math.cos(t) - 1).toFixed(1), (113 + 5 * Math.sin(t) - 5).toFixed(1), 2, 5); }
    s += E('wt', 200, 134, 70, 7) + E('wt2', 200, 134, 54, 3.5);
    return s;
  };

  S['jefferson-memorial'] = function () {
    K = 'jm';
    var m = steps(200, 100, 112, 4, 3, 7) + R('st3', 154, 66, 92, 34) + cols(156, 244, 66, 34, 8, 6, 'st') + R('st', 150, 60, 100, 6) + G('st', '156,60 200,50 244,60'.replace(/^/, '')) + R('st', 160, 54, 80, 6)
      + P('st', 'M158 56C158 24 242 24 242 56Z') + P('st2', 'M200 25C226 26 242 38 242 56H200Z') + R('st', 196, 21, 8, 4) + C('st', 200, 20, 2.4);
    var s = sky({ sx: 52, sy: 44 }) + far(108) + R('gr', 0, 108, 400, 42) + m;
    s += R('wt', 0, 116, 400, 34) + refl(m, 116) + ripples(122, 4);
    s += bloss(40, 124, 1.8) + bloss(356, 124, 1.9) + bloss(80, 118, 1.2) + bloss(318, 118, 1.2);
    return s;
  };

  S['mlk-memorial'] = function () {
    var s = sky({ sx: 336, sy: 42, cx: 60 }) + far(104) + R('wt', 0, 104, 400, 12) + R('gr', 0, 116, 400, 34) + R('gr2', 0, 134, 400, 16);
    s += bloss(30, 112, 1.2) + bloss(372, 112, 1.2);
    s += G('st2', '98,122 110,56 176,70 178,122') + G('st2', '222,70 290,56 302,122 222,122') + G('st3', '176,70 224,70 224,122 176,122');
    s += L('ln', 118, 74, 168, 82) + L('ln', 118, 82, 168, 90) + L('ln', 118, 90, 168, 98) + L('ln', 232, 82, 282, 74) + L('ln', 232, 90, 282, 82) + L('ln', 232, 98, 282, 90);
    s += P('st', 'M170 122V84L180 70H220L230 84V122Z') + P('st2', 'M200 70H220L230 84V122H200Z');
    s += P('st', 'M186 66Q200 60 214 66L220 84H180Z') + C('st', 200, 46, 10) + P('st2', 'M200 36C207 36 210 41 210 46C206 42 203 40 200 40Z') + P('st', 'M190 56Q200 62 210 56L216 72L184 72Z') + P('ln', 'M188 76L212 100M212 76L188 100');
    s += R('st2', 168, 118, 64, 4) + R('st', 140, 122, 120, 4) + bush(70, 130, 1.3) + bush(330, 130, 1.3);
    return s;
  };

  S['fdr-memorial'] = function () {
    var s = sky({ sx: 330, sy: 42 }) + far(106) + ground(106);
    s += R('st2', 0, 66, 90, 62) + R('st', 0, 62, 90, 6) + R('st2', 90, 78, 72, 50) + R('st', 90, 74, 72, 5) + R('st2', 162, 90, 70, 38) + R('st', 162, 86, 70, 5) + R('st2', 232, 100, 168, 28) + R('st', 232, 96, 168, 5);
    var i, fx = [[80, 68, 12], [150, 82, 12], [222, 94, 12], [296, 104, 10]];
    for (i = 0; i < fx.length; i++) { s += R('wf', fx[i][0], fx[i][1], 10, 128 - fx[i][1]) + R('wf2', fx[i][0] + 3, fx[i][1], 2, 128 - fx[i][1]); }
    s += R('wt', 0, 126, 400, 24) + ripples(130, 4) + E('wf', 90, 126, 14, 3) + E('wf', 160, 126, 14, 3) + E('wf', 232, 126, 14, 3);
    s += tree(36, 66, 1.6) + tree(372, 100, 1.4) + fig(342, 96, 1.2, 'bz');
    s += R('st2', 332, 94, 24, 3);
    return s;
  };

  S['wwii-memorial'] = function () {
    var s = sky({ sx: 340, sy: 42 }) + far(108) + ground(108);
    s += G('far', '194,108 197,50 200,40 203,50 206,108'.replace(/^/, '')).replace('far', 'fr');
    s += R('wt', 104, 112, 192, 28) + E('wt2', 200, 126, 90, 10) + E('st2', 200, 126, 98, 14).replace('class="st2"', 'class="st2 ring"');
    s += E('wt', 200, 126, 90, 10) + E('wt2', 200, 125, 76, 7) + P('wj', 'M200 124V104M200 124Q186 104 176 122M200 124Q214 104 224 122M200 124Q172 100 158 124M200 124Q228 100 242 124');
    var i, x, y;
    for (i = 0; i < 13; i++) { x = 104 + i * 16; y = 102 + 12 * Math.pow((x - 200) / 100, 2); s += R('st', x - 2.5, y, 5, 16) + R('st2', x, y, 2, 16) + R('st3', x - 3, y - 1, 6, 1.5); }
    s += R('st', 34, 54, 62, 6) + R('st', 40, 60, 50, 46) + arch('st3', 53, 66, 24, 40) + cols(44, 86, 62, 44, 3, 6, 'st').replace(/x="(\d+\.?\d*)"/, 'x="$1"');
    s += R('st', 304, 54, 62, 6) + R('st', 310, 60, 50, 46) + arch('st3', 323, 66, 24, 40) + cols(314, 356, 62, 44, 3, 6, 'st');
    s += R('gd', 40, 52, 50, 2) + R('gd', 310, 52, 50, 2) + flag(100, 112, 22, 11) + flag(300, 112, 22, 11);
    s += tree(20, 114, 1.3) + tree(380, 114, 1.3);
    return s;
  };

  S['vietnam-memorial'] = function () {
    var s = sky({ sx: 336, sy: 42 }) + far(100) + ground(100);
    s += P('gr2', 'M0 100Q100 82 200 70Q300 82 400 100V112H0Z') + tree(40, 96, 1.6) + tree(366, 96, 1.6) + tree(64, 100, 1.1) + tree(340, 100, 1.1);
    s += G('bk', '62,112 62,108 200,68 200,118') + G('bk2', '200,68 338,108 338,112 200,118') + G('bkl', '62,108 200,68 200,72 62,111'.replace(/^/, ''));
    var i; for (i = 0; i < 16; i++) { s += L('lw', 70 + i * 8, 108 - i * 2.2, 70 + i * 8, 112); s += L('lw', 330 - i * 8, 108 - i * 2.2, 330 - i * 8, 112); }
    s += R('pv', 0, 118, 400, 32) + R('gr', 0, 138, 400, 12) + G('pv', '120,118 280,118 330,150 70,150'.replace(/^/, ''));
    s += C('rd', 150, 120, 1.8) + C('gd', 162, 121, 1.8) + C('st', 176, 120, 1.8) + C('rd', 230, 120, 1.8) + C('gd', 246, 121, 1.8) + flag(330, 118, 24, 12);
    return s;
  };

  S['korean-war-memorial'] = function () {
    var s = sky({ sx: 52, sy: 42 }) + far(100) + ground(100);
    s += R('bk2', 196, 74, 204, 30) + R('bkl', 196, 74, 204, 2) + P('lw', 'M214 84Q226 78 238 86Q246 94 258 90M290 84Q302 78 314 86Q322 94 334 90M350 88Q360 82 372 90');
    s += bush(214, 108, 1.5) + bush(300, 106, 1.4) + bush(388, 106, 1.5) + pine(176, 104, 1.5) + pine(345, 100, 1.3);
    var i, pts = [[56, 150, 2.1], [112, 142, 1.85], [166, 134, 1.6], [216, 127, 1.4], [262, 121, 1.25], [304, 116, 1.12], [342, 112, 1.0]];
    for (i = 0; i < pts.length; i++) { var x = pts[i][0], y = pts[i][1], z = pts[i][2]; s += bush(x - 24 * z, y + 2, 1.1 * z) + P('sl', 'M' + (x - 6.5 * z) + ' ' + y + 'L' + (x - 3.6 * z) + ' ' + (y - 17 * z) + 'H' + (x + 3.6 * z) + 'L' + (x + 7.5 * z) + ' ' + y + 'Z') + C('sl2', x, y - 20.5 * z, 3.2 * z) + P('sl2', 'M' + (x - 4 * z) + ' ' + (y - 17 * z) + 'H' + (x + 4 * z) + 'L' + (x + 2 * z) + ' ' + (y - 12 * z) + 'H' + (x - 2 * z) + 'Z') + L('sl', x + 5 * z, y - 13 * z, x + 10 * z, y - 1 * z); }
    return s;
  };

  S['smithsonian-american-history'] = function () {
    var s = sky({ sx: 340, sy: 42 }) + far(112) + ground(112);
    s += R('st', 70, 56, 260, 56) + R('st2', 70, 104, 260, 8) + R('st2', 70, 52, 260, 5) + R('st', 70, 56, 260, 2);
    s += wins(88, 150, 66, 6, 7, 28) + wins(250, 312, 66, 6, 7, 28);
    s += R('gl2', 162, 58, 76, 52) + R('rd', 176, 58, 48, 4.5) + R('st', 176, 62.5, 48, 4.5) + R('rd', 176, 67, 48, 4.5) + R('st', 176, 71.5, 48, 4.5) + R('rd', 176, 76, 48, 4.5) + R('st', 176, 80.5, 48, 4.5) + R('rd', 176, 85, 48, 4.5) + R('bl', 176, 58, 22, 22.5);
    var i; for (i = 0; i < 12; i++) s += C('st', 180 + (i % 4) * 5, 62 + Math.floor(i / 4) * 6.5, 1);
    s += L('ln', 200, 58, 200, 110) + L('ln', 162, 84, 238, 84);
    s += R('pv', 120, 112, 160, 38) + tree(40, 118, 1.5) + tree(364, 118, 1.5) + lamp(120, 130, 20) + lamp(280, 130, 20);
    return s;
  };

  S['smithsonian-african-american-history'] = function () {
    var s = sky({ sx: 64, sy: 42 }) + far(112) + ground(112);
    s += G('fr', '312,112 316,66 320,56 324,66 328,112'.replace(/^/, ''));
    s += R('gl2', 132, 90, 136, 22) + R('bz3', 138, 96, 124, 14);
    var tiers = ['164,112 236,112 246,88 154,88', '154,88 246,88 258,62 142,62', '142,62 258,62 270,36 130,36'], i;
    for (i = 0; i < 3; i++) s += G(i % 2 ? 'bz2' : 'bz', tiers[i]) + '<polygon fill="url(#lat)" points="' + tiers[i] + '"/>';
    s = '<defs><pattern id="lat" width="7" height="7" patternUnits="userSpaceOnUse"><path class="lat" d="M0 7L7 0M0 0L7 7"/></pattern></defs>' + s;
    s += R('bz2', 130, 36, 140, 2.5) + R('gl', 176, 100, 48, 10) + R('st3', 196, 100, 8, 12);
    s += tree(44, 116, 1.5) + tree(362, 116, 1.5) + bush(100, 114, 1.3) + bush(300, 114, 1.3) + R('pv', 150, 118, 100, 32);
    return s;
  };

  S['smithsonian-american-indian'] = function () {
    var s = sky({ sx: 336, sy: 40 }) + far(108) + ground(108, 'gr');
    s += P('sd', 'M20 116C44 92 90 66 150 58C210 50 280 56 380 116Z');
    s += P('sd2', 'M150 58C210 50 280 56 380 116H260C240 96 200 76 150 58Z') + P('sd3', 'M20 116C44 96 80 80 120 76C150 80 170 98 190 116Z');
    s += P('ln', 'M44 108C80 88 120 74 160 68M72 112C110 92 150 80 200 72M120 114C160 96 220 82 280 80M200 116C240 100 290 94 340 100') + P('lsd', 'M60 100C100 80 140 70 180 64');
    s += R('st3', 238, 92, 40, 20) + R('gl', 240, 94, 36, 14) + R('sd', 232, 88, 52, 5);
    s += R('wt', 0, 122, 400, 28) + ripples(126, 4) + E('st2', 70, 130, 12, 5) + E('st', 70, 128, 10, 3.6) + E('st2', 330, 134, 14, 5) + E('st', 330, 132, 11, 3.6);
    var i; for (i = 0; i < 9; i++) s += L('gras', 20 + i * 11, 124, 18 + i * 11 + (i % 2) * 5, 110 - (i % 3) * 3);
    s += tree(364, 116, 1.4);
    return s;
  };

  S['air-and-space'] = function () {
    var s = sky({ sx: 52, sy: 44 }) + far(112) + ground(112);
    s += R('st', 40, 62, 150, 50) + R('st2', 40, 106, 150, 6) + R('gl2', 52, 72, 126, 30) + L('ln', 90, 72, 90, 102) + L('ln', 132, 72, 132, 102) + R('st2', 40, 58, 150, 5);
    s += R('st', 206, 80, 60, 32) + R('st2', 206, 106, 60, 6);
    var x = 316;
    s += G('rkt', (x - 9) + ',112 ' + (x - 9) + ',50 ' + x + ',24 ' + (x + 9) + ',50 ' + (x + 9) + ',112') + G('rkt2', x + ',24 ' + (x + 9) + ',50 ' + (x + 9) + ',112 ' + x + ',112') + R('bk2', x - 9, 56, 18, 4) + R('bk2', x - 9, 74, 18, 4) + R('bk2', x - 9, 92, 18, 4) + C('gl', x, 44, 2.4);
    s += G('rkt', (x - 9) + ',112 ' + (x - 18) + ',118 ' + (x - 9) + ',100') + G('rkt2', (x + 9) + ',112 ' + (x + 18) + ',118 ' + (x + 9) + ',100');
    s += R('wing', 230, 36, 36, 2.6) + R('wing', 230, 44, 36, 2.6) + L('ln', 236, 38, 236, 45) + L('ln', 260, 38, 260, 45) + R('wing', 266, 40, 4, 1.8) + C('wing', 228, 41, 2.2);
    s += tree(20, 118, 1.4) + tree(374, 118, 1.4) + R('pv', 150, 120, 100, 30);
    return s;
  };

  S['fords-theatre'] = function () {
    var s = sky({ sx: 336, sy: 40, cx: 300 }) + R('pv', 0, 116, 400, 34) + R('pv2', 0, 132, 400, 3);
    s += R('br', 110, 36, 180, 80) + R('br2', 110, 108, 180, 8) + R('st', 106, 32, 188, 5) + R('st2', 106, 37, 188, 2.5);
    s += R('br2', 124, 24, 6, 10) + R('br2', 270, 24, 6, 10);
    s += archwins(126, 274, 46, 5, 9, 16) + archwins(126, 274, 72, 5, 9, 16);
    s += R('st', 108, 66, 184, 2);
    s += arch('st3', 130, 92, 14, 24) + arch('st3', 156, 92, 14, 24) + arch('st3', 230, 92, 14, 24) + arch('st3', 256, 92, 14, 24) + arch('gl', 190, 90, 20, 26);
    s += R('gd', 168, 82, 64, 7) + P('rd', 'M170 82Q176 92 182 82Q188 92 194 82Q200 92 206 82Q212 92 218 82Q224 92 230 82V80H170Z') + P('bl', 'M188 62Q200 78 212 62Z');
    s += flag(200, 36, 20, 12) + lamp(96, 128, 24) + lamp(304, 128, 24) + tree(36, 116, 1.4) + tree(366, 116, 1.4);
    return s;
  };

  S['arlington-cemetery'] = function () {
    var s = sky({ sx: 66, sy: 42, cx: 280 }) + far(86);
    s += P('gr', 'M0 70C60 62 150 74 230 84C300 92 360 96 400 100V150H0Z') + P('gr2', 'M0 100C100 90 240 96 400 112V150H0Z');
    s += P('hill', 'M240 60C262 52 330 52 400 64V86C340 80 290 82 240 84Z'.replace(/^/, ''));
    s += R('st', 276, 52, 76, 5) + G('st', '272,52 314,36 356,52') + R('st3', 280, 58, 68, 18) + cols(284, 344, 58, 18, 7, 4, 'st') + R('st2', 270, 76, 84, 3) + R('st', 258, 60, 16, 20) + R('st', 354, 60, 16, 20);
    var r, i, y, z, sp, x;
    for (r = 0; r < 7; r++) { y = 92 + r * 8.5; z = 0.5 + r * 0.19; sp = 20 * z; for (i = -14; i < 15; i++) { x = 200 + i * sp + (r % 2) * sp / 2; if (x < 8 || x > 392) continue; s += P('st', 'M' + (x - 2.4 * z).toFixed(1) + ' ' + y.toFixed(1) + 'V' + (y - 5 * z).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + (y - 8 * z).toFixed(1) + ' ' + (x + 2.4 * z).toFixed(1) + ' ' + (y - 5 * z).toFixed(1) + 'V' + y.toFixed(1) + 'Z'); } }
    s += tree(40, 92, 2) + tree(120, 86, 1.5) + flag(214, 90, 26, 12) + tree(380, 120, 1.9);
    return s;
  };

  S['pentagon'] = function () {
    var s = sky({ sx: 340, sy: 36 }).replace(R('sk', 0, 0, 400, 150), R('gr', 0, 0, 400, 150));
    s = s.replace(/<g class="stars">.*?<\/g>/, '').replace(/<g class="cl[^>]*>.*?<\/g>/g, '').replace(C('sn', 340, 36, 11), '');
    s += R('gr2', 0, 100, 400, 50) + P('wt', 'M0 20Q80 30 160 14L170 0H0Z') + P('wt', 'M300 150Q340 120 400 118V150Z') + P('pv', 'M0 128H400V136H0Z') + P('pv', 'M60 0L90 150H100L70 0Z') + R('pv', 300, 0, 8, 150);
    var rings = [[62, 'st2'], [58, 'st'], [49, 'st2'], [45, 'st'], [36, 'st2'], [32, 'st']], i;
    for (i = 0; i < rings.length; i++) s += G(rings[i][1], pent(200, 76, rings[i][0], 0.82));
    s += G('gr', pent(200, 76, 22, 0.82)) + G('pv', pent(200, 76, 9, 0.82)) + C('tr', 190, 76, 3) + C('tr', 210, 74, 3) + C('tr', 200, 86, 3);
    s += R('pv', 120, 134, 160, 12) + tree(30, 70, 1.2) + tree(40, 110, 1.2) + tree(360, 70, 1.2);
    return s;
  };

  S['treasury'] = function () {
    var s = sky({ sx: 336, sy: 42 }) + far(112) + ground(112);
    s += R('sd2', 66, 48, 268, 62) + R('sd', 62, 40, 276, 8) + R('sd2', 62, 36, 276, 4) + R('st3', 76, 52, 248, 56) + cols(84, 316, 52, 56, 15, 8, 'sd');
    s += R('sd', 62, 50, 14, 62) + R('sd', 324, 50, 14, 62) + wins(69, 69, 60, 1, 5, 9) + wins(331, 331, 60, 1, 5, 9) + wins(69, 69, 84, 1, 5, 9) + wins(331, 331, 84, 1, 5, 9);
    s += steps(200, 108, 250, 4, 3.4, 6) + R('st2', 340, 100, 22, 12) + P('bz', 'M346 100L348 70Q351 62 354 70L356 100Z') + C('bz', 351, 66, 4) + flag(78, 36, 20, 12) + tree(30, 118, 1.4) + tree(378, 118, 1.4);
    return s;
  };

  S['frederick-douglass-house'] = function () {
    var s = sky({ sx: 336, sy: 40 }) + P('fr', 'M0 100Q60 90 120 98T240 96T400 100V120H0Z') + '<g class="far2">' + R('fr', 330, 88, 3, 8) + P('fr', 'M346 96V88Q352 78 358 88V96Z') + '</g>';
    s += P('gr', 'M0 104Q100 70 200 66Q300 70 400 104V150H0Z') + P('gr2', 'M0 128Q200 100 400 128V150H0Z') + P('pv', 'M184 150L196 106H204L216 150Z');
    s += R('st', 144, 72, 112, 40) + R('st2', 144, 106, 112, 6) + G('rf', '138,72 200,48 262,72') + R('st', 160, 56, 14, 14) + R('rf', 156, 54, 22, 3) + R('st2', 232, 44, 6, 14) + wins(158, 242, 80, 4, 8, 14, 'gl') + R('tr2', 150, 80, 3, 14) + R('tr2', 250, 80, 3, 14);
    s += R('st3', 180, 82, 40, 26) + cols(184, 216, 84, 24, 4, 4, 'st') + R('st', 176, 78, 48, 5) + G('st', '176,78 200,66 224,78') + steps(200, 108, 44, 3, 2.6, 5);
    s += tree(98, 112, 1.9) + tree(310, 112, 1.7) + bush(120, 116, 1.4) + bush(280, 116, 1.4) + tree(60, 120, 1.4);
    return s;
  };

  S['national-cathedral'] = function () {
    var s = sky({ sx: 60, sy: 44, cx: 290 }) + far(112) + ground(112);
    s += R('st', 150, 70, 100, 42) + G('st', '150,70 200,46 250,70') + G('st2', '200,46 250,70 200,70') + R('st2', 150, 98, 100, 14);
    s += P('gl3', 'M190 112V94Q200 80 210 94V112Z') + C('gl', 200, 66, 10) + P('lat2', 'M200 56V76M190 66H210M193 59L207 73M207 59L193 73') + L('ln', 200, 46, 200, 38);
    var tw = [[122, 40], [228, 40]], i, x;
    for (i = 0; i < 2; i++) { x = tw[i][0]; s += R('st', x, 52, 50, 60) + R('st2', x + 30, 52, 20, 60) + R('st', x - 3, 50, 56, 4) + G('st', (x + 2) + ',50 ' + (x + 25) + ',22 ' + (x + 48) + ',50') + G('st2', (x + 25) + ',22 ' + (x + 48) + ',50 ' + (x + 25) + ',50') + P('gl3', 'M' + (x + 20) + ' 112V96Q' + (x + 25) + ' 88 ' + (x + 30) + ' 96V112Z') + P('gl', 'M' + (x + 10) + ' 84V66Q' + (x + 14) + ' 60 ' + (x + 18) + ' 66V84ZM' + (x + 32) + ' 84V66Q' + (x + 36) + ' 60 ' + (x + 40) + ' 66V84Z') + P('gl', 'M' + (x + 20) + ' 60V48Q' + (x + 25) + ' 42 ' + (x + 30) + ' 48V60Z'); }
    s += G('st2', '112,112 122,84 122,112') + G('st2', '288,112 278,84 278,112') + steps(200, 112, 70, 3, 3, 8) + tree(50, 118, 1.6) + tree(352, 118, 1.6) + bush(96, 116, 1.1) + bush(306, 116, 1.1);
    return s;
  };

  S['union-station'] = function () {
    var s = sky({ sx: 58, sy: 42 }) + far(112) + ground(112, 'pv') + R('pv2', 0, 132, 400, 3);
    s += R('st', 72, 54, 256, 58) + R('st2', 72, 104, 256, 8) + R('st', 68, 46, 264, 8) + R('st2', 68, 52, 264, 3);
    var x, i;
    for (i = 0; i < 12; i++) { x = 82 + i * 21.5; s += R('st2', x, 34, 4, 12) + C('st2', x + 2, 32, 2.4); }
    s += arch('st3', 90, 62, 50, 50) + arch('st3', 260, 62, 50, 50) + arch('st3', 168, 58, 64, 54) + archwins(98, 132, 66, 3, 8, 22, 'gl') + archwins(268, 302, 66, 3, 8, 22, 'gl') + archwins(176, 224, 64, 3, 12, 28, 'gl');
    s += cols(152, 152, 58, 54, 1, 7, 'st') + cols(248, 248, 58, 54, 1, 7, 'st') + cols(78, 78, 54, 58, 1, 6, 'st') + cols(322, 322, 54, 58, 1, 6, 'st');
    s += R('st', 150, 52, 100, 6) + R('gd', 150, 50, 100, 2) + flag(200, 52, 18, 12);
    s += R('trn', 0, 120, 400, 12) + R('trn2', 0, 128, 400, 4) + R('trn', 288, 112, 78, 20) + R('trn2', 366, 112, 34, 20) + wins(296, 358, 116, 5, 8, 8, 'gl') + C('gl', 394, 124, 3) + L('ln', 0, 134, 400, 134) + lamp(60, 130, 20) + lamp(176, 130, 20);
    return s;
  };

  var cache = {};
  window.DCJ_SCENES = {
    ids: Object.keys(S),
    has: function (id) { return Object.prototype.hasOwnProperty.call(S, id); },
    svg: function (id) {
      if (!Object.prototype.hasOwnProperty.call(S, id)) return '';
      if (!cache[id]) { K = id.replace(/[^a-z]/g, '').slice(0, 4); cache[id] = '<svg class="sc-svg" viewBox="0 0 400 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' + S[id]() + '</svg>'; }
      return cache[id];
    }
  };
})();
