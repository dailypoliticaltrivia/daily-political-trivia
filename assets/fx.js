/* SINFX: the shared effects module for every game (Grid, typed-answer trivia, Caucus Sort, Capitol Climb).
   One small file, no libraries, no network, no inline handlers. Read design-notes/FX.md for the effect language and the rules.
   Games call it only through a guard (a missing file must never break a game):   window.SINFX && SINFX.play('correct', {el: node})
   Rules kept here: transform/opacity only (plus one canvas for particles), 120-450 ms motion, at most 60 particles per burst and 140 alive,
   everything decorative is aria-hidden and never takes a tap or focus, nothing runs while the tab is hidden, prefers-reduced-motion = no particles,
   no shake, no big motion (only brief colour/opacity), never more than 2 colour flashes per second (WCAG 2.3.1 allows 3). */
(function () {
  'use strict';
  if (window.SINFX) return;
  var doc = document, root = doc.documentElement;
  var KEY_ON = 'sinfx.on', KEY_SND = 'sinfx.sound';
  function ls(op, k, v) { try { if (op === 'get') return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage blocked: defaults apply */ } return null; }
  var enabled = ls('get', KEY_ON) !== '0';          // default ON
  var sound = ls('get', KEY_SND) === '1';           // default OFF
  var mq = null; try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { /* no matchMedia */ }
  function calm() { return !!(mq && mq.matches); }
  function hidden() { return doc.hidden; }
  var CAN = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  var MAXP = 140;

  /* ---- the colour language (game scales: trivia tiers, grid rarity, caucus groups) ---- */
  var TIER = [null, '#3b82f6', '#22a35a', '#e0b000', '#f08a14', '#d92b2b'];   // household, familiar, insider, scholar, long shot: the same cool-to-hot scale as the share squares
  var GOLD = '#f2b705', GOOD = '#1f8a4c', BAD = '#d92b2b', WARM = '#e8a317';
  var CONFETTI = [GOLD, '#e8505b', '#2f6fd0', '#1f8a4c', '#8a4fd0', '#f08a14'];
  function cssVar(n, fb) { try { var v = getComputedStyle(root).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; } }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---- bookkeeping: everything the module adds to the page is tracked so it can be cancelled and removed ---- */
  var live = [], counters = [], idleT = 0;
  function track(a, node) {
    var rec = { a: a, n: node }, gone = false;
    live.push(rec);
    function done() { if (gone) return; gone = true; var i = live.indexOf(rec); if (i >= 0) live.splice(i, 1); if (node && node.parentNode) node.parentNode.removeChild(node); idle(); }
    a.onfinish = done; a.oncancel = done;
    setTimeout(done, (a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : 1500) + 500);   // failsafe
    return a;
  }
  function cancelAll() {
    live.slice().forEach(function (r) { try { r.a.cancel(); } catch (e) { /* already gone */ } if (r.n && r.n.parentNode) r.n.parentNode.removeChild(r.n); });
    live.length = 0;
    counters.slice().forEach(function (c) { c.finish(); });
    killParticles();
    release();
  }

  /* ---- the layer: one fixed, click-through, aria-hidden container (in the top layer via popover so it also shows over open dialogs) ---- */
  var layer = null;
  var stackedFor = null;
  function restack(force) {
    if (!layer || typeof layer.showPopover !== 'function') return;
    // re-stacking (hide + show) puts the layer above a dialog that opened after it; do it only when a different dialog is on screen
    var d = doc.querySelector('dialog[open]');
    if (!force && d === stackedFor && layer.matches(':popover-open')) return;
    stackedFor = d;
    try { if (layer.matches(':popover-open')) layer.hidePopover(); layer.showPopover(); if (cv && cx) sizeCanvas(); } catch (e) { /* popover unsupported: the fixed layer still works outside dialogs */ }
  }
  function getLayer() {
    clearTimeout(idleT);
    if (layer && layer.isConnected) { restack(); return layer; }
    layer = doc.createElement('div');
    layer.className = 'sinfx-layer';
    layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('role', 'presentation');
    if (typeof layer.showPopover === 'function') layer.setAttribute('popover', 'manual');
    doc.body.appendChild(layer);
    stackedFor = null; restack(true);
    return layer;
  }
  function idle() {
    clearTimeout(idleT);
    idleT = setTimeout(function () { if (!live.length && !P.length) release(); }, 400);
  }
  function release() {
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    cv = null; cx = null;
    if (layer) { try { if (typeof layer.hidePopover === 'function' && layer.matches(':popover-open')) layer.hidePopover(); } catch (e) { /* ignore */ } if (layer.parentNode) layer.parentNode.removeChild(layer); }
    layer = null;
  }
  function el2(cls, styles) {
    var d = doc.createElement('div'); d.className = cls;
    if (styles) for (var k in styles) d.style[k] = styles[k];
    getLayer().appendChild(d); return d;
  }
  function rectOf(el) { if (!el || !el.getBoundingClientRect) return null; var r = el.getBoundingClientRect(); return (r.width > 0 || r.height > 0) ? r : null; }
  function posOf(o) {
    if (o.x != null && o.y != null) return { x: o.x, y: o.y };
    var r = rectOf(o.el);
    if (r) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return { x: innerWidth / 2, y: innerHeight * 0.38 };
  }

  /* ---- WCAG 2.3.1: colour flashes (edge glow, colour pulse) limited to 2 per rolling second ---- */
  var flashes = [];
  function flashOk() { var n = performance.now(); while (flashes.length && n - flashes[0] > 1000) flashes.shift(); if (flashes.length >= 2) return false; flashes.push(n); return true; }

  /* ---- particles: one canvas, created on demand, removed when the last particle is gone ---- */
  var cv = null, cx = null, P = [], raf = 0, lastT = 0, dpr = 1, W = 0, H = 0, ftimes = [], frames = 0;
  function sizeCanvas() { W = innerWidth; H = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 1.5); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function ensureCanvas() {
    if (cv && cv.isConnected) return true;
    try { cv = doc.createElement('canvas'); cx = cv.getContext && cv.getContext('2d'); } catch (e) { cx = null; }
    if (!cx) { cv = null; return false; }                    // no canvas: particles are skipped silently
    cv.setAttribute('aria-hidden', 'true');
    sizeCanvas(); getLayer().appendChild(cv); return true;
  }
  function killParticles() { P.length = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } if (cv) { if (cv.parentNode) cv.parentNode.removeChild(cv); cv = null; cx = null; } }
  function burst(x, y, o) {
    o = o || {};
    if (!enabled || calm() || hidden() || !ensureCanvas()) return;
    var room = MAXP - P.length; if (room <= 0) return;
    var n = Math.min(clamp(Math.round(o.count || 24), 4, 60), room);
    var cols = o.colors && o.colors.length ? o.colors : [o.color || GOLD], shape = o.shape || 'dot';
    var full = o.spread == null || o.spread >= 6.28, base = o.angle == null ? -Math.PI / 2 : o.angle;
    for (var i = 0; i < n; i++) {
      var a = full ? Math.random() * 6.2832 : base + (Math.random() - 0.5) * o.spread, sp = (o.speed || 280) * (0.45 + Math.random() * 0.65);
      P.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.gravity == null ? 520 : o.gravity, life: 0, max: (o.life || 850) * (0.7 + Math.random() * 0.5),
        s: (o.size || 5) * (0.6 + Math.random() * 0.8), c: cols[i % cols.length], sh: shape === 'mix' ? ['rect', 'dot', 'rect', 'line'][i % 4] : shape, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12 });
    }
    if (!raf) { lastT = 0; raf = requestAnimationFrame(step); }
  }
  function step(t) {
    raf = 0;
    if (hidden() || !cx) { killParticles(); return; }
    var w0 = performance.now(), dt = lastT ? Math.min(t - lastT, 40) : 16, s = dt / 1000; lastT = t;
    cx.clearRect(0, 0, W, H);
    var drag = 1 - 1.5 * s;
    for (var i = P.length - 1; i >= 0; i--) {
      var p = P[i]; p.life += dt;
      if (p.life >= p.max) { P.splice(i, 1); continue; }
      p.vx *= drag; p.vy = p.vy * drag + p.g * s; p.x += p.vx * s; p.y += p.vy * s; p.r += p.vr * s;
      var k = p.life / p.max; cx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; cx.fillStyle = p.c; cx.strokeStyle = p.c;
      if (p.sh === 'rect') { var c = Math.cos(p.r), sn = Math.sin(p.r); cx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, p.x * dpr, p.y * dpr); cx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s); cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      else if (p.sh === 'line') { cx.lineWidth = 2; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); cx.stroke(); }
      else { cx.beginPath(); cx.arc(p.x, p.y, p.s * 0.7, 0, 6.2832); cx.fill(); }
    }
    cx.globalAlpha = 1;
    frames++; ftimes.push(performance.now() - w0); if (ftimes.length > 240) ftimes.shift();
    if (P.length) raf = requestAnimationFrame(step); else { killParticles(); idle(); }
  }
  function confetti(o) {
    o = o || {};
    if (!enabled || calm() || hidden()) return;
    var I = o.intensity == null ? 0.6 : clamp(o.intensity, 0, 1), n = Math.min(o.count || Math.round(22 + I * 38), 60), cols = o.colors || CONFETTI;
    if (o.x != null && o.y != null) { burst(o.x, o.y, { count: n, colors: cols, shape: 'mix', speed: 520, gravity: 650, life: o.life || 1300, angle: -Math.PI / 2, spread: 2.2 }); return; }
    var w = innerWidth, h = innerHeight, half = Math.ceil(n / 2);
    burst(w * 0.1, h * 0.82, { count: half, colors: cols, shape: 'mix', speed: 700, gravity: 720, life: o.life || 1400, angle: -1.15, spread: 1.0 });
    burst(w * 0.9, h * 0.82, { count: n - half, colors: cols, shape: 'mix', speed: 700, gravity: 720, life: o.life || 1400, angle: -Math.PI + 1.15, spread: 1.0 });
  }

  /* ---- DOM effects (WAAPI: transform and opacity only) ---- */
  function ring(x, y, color, size, ms) {
    if (!CAN || !enabled || calm() || hidden()) return;
    var s = size || 56, n = el2('sinfx-ring', { width: s + 'px', height: s + 'px', borderColor: color || GOOD });
    track(n.animate([{ transform: 'translate(' + (x - s / 2) + 'px,' + (y - s / 2) + 'px) scale(.25)', opacity: 0.95 }, { transform: 'translate(' + (x - s / 2) + 'px,' + (y - s / 2) + 'px) scale(1.25)', opacity: 0 }], { duration: ms || 420, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }), n);
  }
  function ripple(x, y, size) {
    if (!CAN || !enabled || calm() || hidden()) return;
    var s = size || 30, n = el2('sinfx-ripple', { width: s + 'px', height: s + 'px' });
    track(n.animate([{ transform: 'translate(' + (x - s / 2) + 'px,' + (y - s / 2) + 'px) scale(.3)', opacity: 0.5 }, { transform: 'translate(' + (x - s / 2) + 'px,' + (y - s / 2) + 'px) scale(1.7)', opacity: 0 }], { duration: 340, easing: 'ease-out', fill: 'forwards' }), n);
  }
  function edge(color, strong) {
    if (!CAN || !enabled || hidden() || !flashOk()) return;
    var n = el2('sinfx-glow'); n.style.setProperty('--sinfx-c', color || GOLD);
    var peak = calm() ? 0.3 : (strong ? 0.95 : 0.7);
    track(n.animate([{ opacity: 0 }, { opacity: peak, offset: 0.25 }, { opacity: 0 }], { duration: calm() ? 450 : 750, easing: 'ease-out', fill: 'forwards' }), n);
  }
  /* a colour fill over a node (opacity only); with no colour it is a scale beat (used for the clock) */
  function pulse(el, color, opts) {
    opts = opts || {};
    if (!CAN || !enabled || hidden() || !el) return;
    if (!color) { if (!calm()) el.animate([{ scale: '1' }, { scale: String(opts.beatScale || 1.14), offset: 0.4 }, { scale: '1' }], { duration: 260, easing: 'ease-out' }); return; }
    var r = rectOf(el); if (!r || !flashOk()) return;
    var cs; try { cs = getComputedStyle(el); } catch (e) { cs = null; }
    var n = el2('sinfx-fill', { width: r.width + 'px', height: r.height + 'px', background: color, borderRadius: cs ? cs.borderRadius : '4px' });
    var al = opts.alpha == null ? 0.38 : opts.alpha;
    track(n.animate([{ transform: 'translate(' + r.left + 'px,' + r.top + 'px)', opacity: 0 }, { transform: 'translate(' + r.left + 'px,' + r.top + 'px)', opacity: al, offset: 0.25 }, { transform: 'translate(' + r.left + 'px,' + r.top + 'px)', opacity: 0 }], { duration: opts.ms || 380, easing: 'ease-out', fill: 'forwards' }), n);
  }
  function pop(el, amt) {
    if (!CAN || !enabled || calm() || hidden() || !el) return;
    var a = amt == null ? 0.1 : amt;
    el.animate([{ scale: String(1 - a * 0.6) }, { scale: String(1 + a), offset: 0.55 }, { scale: '1' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  }
  function popIn(el) {
    if (!CAN || !enabled || hidden() || !el) return;
    if (calm()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
    el.animate([{ scale: '.3', opacity: 0 }, { scale: '1.18', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  }
  function shake(el) {
    if (!CAN || !enabled || hidden() || !el || calm()) return;
    el.animate([{ translate: '0 0' }, { translate: '-6px 0', offset: 0.2 }, { translate: '6px 0', offset: 0.4 }, { translate: '-4px 0', offset: 0.6 }, { translate: '4px 0', offset: 0.8 }, { translate: '0 0' }], { duration: 340, easing: 'ease-out' });
  }
  function wiggle(el) {
    if (!CAN || !enabled || hidden() || !el || calm()) return;
    el.animate([{ rotate: '0deg' }, { rotate: '-3deg', offset: 0.25 }, { rotate: '3deg', offset: 0.55 }, { rotate: '-1.5deg', offset: 0.8 }, { rotate: '0deg' }], { duration: 320, easing: 'ease-in-out' });
  }
  function slideIn(el, o) {
    o = o || {};
    if (!CAN || !enabled || hidden() || !el) return;
    var d = o.delay || 0;
    if (calm()) { el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 180, delay: d, fill: 'backwards' }); return; }
    el.animate([{ translate: '0 ' + (o.dy == null ? 12 : o.dy) + 'px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: o.ms || 260, delay: d, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }
  function flip(el, mid) {
    if (!el) return;
    var done = false; function m() { if (!done) { done = true; if (typeof mid === 'function') { try { mid(); } catch (e) { /* ignore */ } } } }
    if (!CAN || !enabled || calm() || hidden()) { m(); if (CAN && enabled && !hidden()) el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160 }); return; }
    var a = el.animate([{ transform: 'perspective(420px) rotateY(0deg)' }, { transform: 'perspective(420px) rotateY(90deg)', offset: 0.5 }, { transform: 'perspective(420px) rotateY(0deg)' }], { duration: 420, easing: 'ease-in-out' });
    setTimeout(m, 205); a.onfinish = m;
  }
  /* a node about to be replaced falls apart in two halves (a heart or star lost) */
  function ghostOf(el, r) {
    var cs = getComputedStyle(el), g = el.cloneNode(true);
    g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true'); g.setAttribute('tabindex', '-1'); g.removeAttribute('data-t');
    g.className = 'sinfx-ghost';
    g.style.margin = '0'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    g.style.color = cs.color; g.style.fill = cs.fill; g.style.background = cs.backgroundColor; g.style.borderRadius = cs.borderRadius; g.style.border = cs.border; g.style.opacity = '1'; g.style.boxSizing = 'border-box';
    return g;
  }
  function crackFall(el) {
    if (!CAN || !enabled || hidden() || !el) return;
    var r = rectOf(el); if (!r) return;
    if (calm()) { pulse(el, BAD, { alpha: 0.3 }); return; }
    var L = getLayer(), parts = [['inset(0 50% 0 0)', -1], ['inset(0 0 0 50%)', 1]];
    el.animate([{ scale: '1' }, { scale: '1.35', offset: 0.3 }, { scale: '1' }], { duration: 260, easing: 'ease-out' });
    parts.forEach(function (pp) {
      var g = ghostOf(el, r); g.style.clipPath = pp[0]; L.appendChild(g);
      var x = r.left, y = r.top;
      track(g.animate([{ transform: 'translate(' + x + 'px,' + y + 'px) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (x + pp[1] * 4) + 'px,' + (y + 4) + 'px) rotate(' + pp[1] * 6 + 'deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(' + (x + pp[1] * 14) + 'px,' + (y + 46) + 'px) rotate(' + pp[1] * 38 + 'deg)', opacity: 0 }], { duration: 640, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' }), g);
    });
  }
  /* FLIP helpers: snapshot positions before a re-render, then slide the new nodes in from where the old ones were */
  function keyOf(e) { return e.getAttribute('data-t') || e.getAttribute('data-idx') || e.id || ''; }
  function snapshot(list) { var m = {}; Array.prototype.forEach.call(list || [], function (e) { var r = e.getBoundingClientRect(); m[keyOf(e)] = { x: r.left, y: r.top }; }); return m; }
  function slideFrom(snap, list, ms) {
    if (!CAN || !enabled || calm() || hidden() || !snap) return;
    Array.prototype.forEach.call(list || [], function (e) {
      var o = snap[keyOf(e)]; if (!o) return;
      var r = e.getBoundingClientRect(), dx = o.x - r.left, dy = o.y - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      e.animate([{ translate: dx + 'px ' + dy + 'px' }, { translate: '0 0' }], { duration: ms || 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  /* clones of the picked tiles, laid exactly on top of the originals just before a re-render */
  function ghost(list) {
    var out = [];
    if (!CAN || !enabled || calm() || hidden()) return out;
    var L = getLayer();
    Array.prototype.forEach.call(list || [], function (e) {
      var r = rectOf(e); if (!r) return;
      var cs = getComputedStyle(e), g = doc.createElement('div'), im = e.querySelector('img');   // a photo-and-border stand-in, never a clone of the tile (no class, no id, no duplicate controls)
      g.className = 'sinfx-ghost'; g.setAttribute('aria-hidden', 'true');
      g.style.width = r.width + 'px'; g.style.height = r.height + 'px'; g.style.overflow = 'hidden'; g.style.boxSizing = 'border-box'; g.style.background = cs.backgroundColor; g.style.borderRadius = cs.borderRadius; g.style.border = '2px solid ' + cs.borderTopColor;
      if (im && im.src) { var c = doc.createElement('img'); c.src = im.src; c.alt = ''; c.setAttribute('aria-hidden', 'true'); c.draggable = false; c.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover'; g.appendChild(c); }
      g.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px)'; L.appendChild(g);
      out.push({ n: g, r: r });
    });
    return out;
  }
  function glide(ghosts, target) {
    if (!ghosts || !ghosts.length) return;
    var t = rectOf(target);
    ghosts.forEach(function (g, i) {
      if (!t || !CAN || hidden()) { if (g.n.parentNode) g.n.parentNode.removeChild(g.n); return; }
      var tx = t.left + t.width * (0.2 + 0.2 * i) - g.r.width * 0.15, ty = t.top + t.height / 2 - g.r.height * 0.15;
      track(g.n.animate([{ transform: 'translate(' + g.r.left + 'px,' + g.r.top + 'px) scale(1)', opacity: 1 }, { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.3)', opacity: 0.9, offset: 0.75 }, { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.3)', opacity: 0 }],
        { duration: 420 + i * 45, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }), g.n);
    });
  }
  function staggerIn(list, gap) {
    if (!CAN || !enabled || hidden()) return;
    Array.prototype.forEach.call(list || [], function (e, i) { slideIn(e, { delay: i * (gap || 220), dy: 10, ms: 300 }); });
  }
  /* a solved group: the colour wipes in from the left, the group fades up over it, the shape icon pops */
  function solve(el, color, plain) {
    if (!CAN || !enabled || hidden() || !el) return;
    var r = rectOf(el);
    if (calm() || !r) { el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 200 }); return; }
    if (plain) {   // the page is about to scroll (finished puzzle): no fixed-position wipe, just the fade and the icon pop
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
      var sy = el.querySelector('.sym'); if (sy) sy.animate([{ scale: '0.2', opacity: 0 }, { scale: '1.6', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], { duration: 420, delay: 120, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
      return;
    }
    el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: 480, easing: 'ease-out' });
    var n = el2('sinfx-fill', { width: r.width + 'px', height: r.height + 'px', background: color || GOOD, borderRadius: (function () { try { return getComputedStyle(el).borderRadius; } catch (e) { return '4px'; } })(), transformOrigin: '0 50%' });
    var tr = 'translate(' + r.left + 'px,' + r.top + 'px)';
    track(n.animate([{ transform: tr + ' scaleX(0)', opacity: 1 }, { transform: tr + ' scaleX(1)', opacity: 1, offset: 0.55 }, { transform: tr + ' scaleX(1)', opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }), n);
    var sym = el.querySelector('.sym'); if (sym) sym.animate([{ scale: '0.2', opacity: 0 }, { scale: '1.6', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], { duration: 420, delay: 300, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
    setTimeout(function () { if (!hidden() && enabled) { burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, colors: [color || GOOD, '#ffffff', GOLD], speed: 300, gravity: 380, life: 650, shape: 'mix', size: 4 }); } }, 300);
  }

  /* ---- number count-up. The game has already written the final number: this animates the first number in the text, then writes the original text back. ---- */
  function numNode(el) {
    var w = doc.createTreeWalker(el, 4, null, false), n;
    while ((n = w.nextNode())) if (/\d/.test(n.data)) return n;
    return null;
  }
  function countUp(el, to, ms, from) {
    if (!el || !enabled || calm() || hidden() || !CAN) return;
    to = +to; if (!isFinite(to)) return;
    var tn = numNode(el); if (!tn || !tn.parentNode) return;
    for (var q = counters.length - 1; q >= 0; q--) if (counters[q].tn === tn) counters[q].finish();
    // The real text keeps its final value the whole time (screen readers, copy, tests). A decorative overlay counts; the real text is only made transparent.
    var par = tn.parentNode, orig = tn.data, commas = /d,d/.test(orig), start = from == null ? 0 : +from, dur = clamp(ms || 600, 200, 1200), t0 = 0, rafId = 0, ended = false, rg, ov, cs, savedColor = par.style.color;
    try { rg = doc.createRange(); rg.selectNodeContents(tn); cs = getComputedStyle(par); } catch (e) { return; }
    var r0 = rg.getBoundingClientRect(); if (!r0.width && !r0.height) return;
    ov = el2('sinfx-num');
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariationSettings', 'fontFeatureSettings', 'textTransform'].forEach(function (k) { ov.style[k] = cs[k]; }); ov.style.letterSpacing = cs.letterSpacing; ov.style.fontVariantNumeric = cs.fontVariantNumeric; ov.style.color = cs.color; ov.style.lineHeight = cs.lineHeight; ov.style.textAlign = /center|right/.test(cs.textAlign) ? cs.textAlign.replace('end', 'right') : 'left';
    ov.style.width = Math.ceil(r0.width) + 'px'; ov.style.height = Math.ceil(r0.height) + 'px'; ov.style.whiteSpace = 'pre';
    par.style.color = 'transparent';
    function fmt(v) { v = Math.round(v); return commas ? String(v).replace(/B(?=(d{3})+(?!d))/g, ',') : String(v); }
    function set(v) { ov.textContent = orig.replace(/d[d,]*/, fmt(v)); var r = rg.getBoundingClientRect(); ov.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px)'; }
    var rec = { tn: tn, finish: function () { if (ended) return; ended = true; cancelAnimationFrame(rafId); par.style.color = savedColor; if (ov.parentNode) ov.parentNode.removeChild(ov); var i = counters.indexOf(rec); if (i >= 0) counters.splice(i, 1); idle(); } };
    counters.push(rec); set(start);
    function tick(t) {
      if (ended) return;
      if (!tn.isConnected || hidden()) { rec.finish(); return; }
      if (!t0) t0 = t;
      var k = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
      set(start + (to - start) * e);
      if (k < 1) rafId = requestAnimationFrame(tick); else rec.finish();
    }
    rafId = requestAnimationFrame(tick);
  }

  /* ---- sound: small synthesized voices (pluck, bell, thud, noise), OFF by default, started only after a user gesture.
     One master bus: a soft compressor so nothing clips, plus a short generated room echo. No audio files, no network. ---- */
  var ac = null, bus = null, wet = null, noiseBuf = null;
  function audio() {
    if (ac) return ac;
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
      ac = new C();
      var comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      var master = ac.createGain(); master.gain.value = 0.9; comp.connect(master); master.connect(ac.destination);
      bus = ac.createGain(); bus.connect(comp);
      try {   // room echo: 0.9 s of decaying stereo noise as an impulse response
        var len = Math.floor(ac.sampleRate * 0.9), ir = ac.createBuffer(2, len, ac.sampleRate);
        for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
        var conv = ac.createConvolver(); conv.buffer = ir; wet = ac.createGain(); wet.gain.value = 0.16; wet.connect(conv); conv.connect(comp);
      } catch (e) { wet = null; }
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate);
      var nd = noiseBuf.getChannelData(0); for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
    return ac;
  }
  function out(node) { node.connect(bus); if (wet) node.connect(wet); }
  function env(g, s, vol, att, dur) { g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + att); g.gain.exponentialRampToValueAtTime(0.0001, s + dur); }
  /* voices. n = [kind, freq, start, duration, volume, endFreq] */
  function voice(c, n, t0) {
    var kind = n[0], f = n[1], s = t0 + n[2], dur = n[3], vol = n[4] || 0.08, g = c.createGain(), o, m, mg, flt, src;
    if (kind === 'pluck') {          // warm plucked note: triangle + a quiet octave, low-pass that closes as it fades
      o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, s);
      m = c.createOscillator(); m.type = 'sine'; m.frequency.setValueAtTime(f * 2, s); mg = c.createGain(); mg.gain.value = 0.25; m.connect(mg); mg.connect(g);
      flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(Math.min(9000, f * 8), s); flt.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), s + dur);
      o.connect(g); g.connect(flt); out(flt); env(g, s, vol, 0.005, dur);
      o.start(s); m.start(s); o.stop(s + dur + 0.05); m.stop(s + dur + 0.05);
    } else if (kind === 'bell') {    // FM bell: inharmonic modulator, bright attack that mellows
      o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, s);
      m = c.createOscillator(); m.type = 'sine'; m.frequency.setValueAtTime(f * 3.5, s); mg = c.createGain();
      mg.gain.setValueAtTime(f * 2.2, s); mg.gain.exponentialRampToValueAtTime(f * 0.05, s + dur); m.connect(mg); mg.connect(o.frequency);
      o.connect(g); out(g); env(g, s, vol, 0.004, dur);
      o.start(s); m.start(s); o.stop(s + dur + 0.05); m.stop(s + dur + 0.05);
    } else if (kind === 'thud') {    // soft low knock with a pitch drop (wrong answers, lost hearts): never harsh
      o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(n[5] || f * 0.5, s + dur);
      o.connect(g); g.connect(bus); env(g, s, vol, 0.006, dur);
      o.start(s); o.stop(s + dur + 0.05);
    } else if (kind === 'noise' || kind === 'whoosh') {   // filtered noise: a tick (tap) or an airy sweep (reveal, shimmer)
      if (!noiseBuf) return;
      src = c.createBufferSource(); src.buffer = noiseBuf;
      flt = c.createBiquadFilter(); flt.type = kind === 'noise' ? 'highpass' : 'bandpass'; flt.Q.value = kind === 'noise' ? 0.7 : 1.4;
      flt.frequency.setValueAtTime(f, s); if (n[5]) flt.frequency.exponentialRampToValueAtTime(n[5], s + dur);
      src.connect(flt); flt.connect(g); if (kind === 'whoosh') out(g); else g.connect(bus);
      env(g, s, vol, kind === 'noise' ? 0.002 : dur * 0.4, dur);
      src.start(s); src.stop(s + dur + 0.05);
    }
  }
  /* notes (Hz): C4 262, E4 330, G4 392, A4 440, C5 523, E5 659, G5 784, A5 880, C6 1047, E6 1319, G6 1568 */
  var SND = {
    tap: [['noise', 3200, 0, 0.03, 0.05]],
    correct: [['pluck', 523, 0, 0.22, 0.09], ['pluck', 784, 0.07, 0.32, 0.09]],
    wrong: [['thud', 180, 0, 0.22, 0.16, 90], ['pluck', 233, 0.02, 0.18, 0.04]],
    near: [['pluck', 440, 0, 0.16, 0.07], ['pluck', 494, 0.11, 0.2, 0.07]],
    rare: [['bell', 784, 0, 0.6, 0.06], ['bell', 1047, 0.08, 0.6, 0.06], ['bell', 1319, 0.16, 0.9, 0.06], ['whoosh', 5000, 0.12, 0.5, 0.025, 9000]],
    jackpot: [['bell', 523, 0, 0.7, 0.06], ['bell', 659, 0.09, 0.7, 0.06], ['bell', 784, 0.18, 0.7, 0.06], ['bell', 1047, 0.27, 0.9, 0.065], ['bell', 1568, 0.4, 1.4, 0.055],
              ['whoosh', 3000, 0.3, 0.9, 0.04, 10000], ['thud', 131, 0, 0.5, 0.09, 98]],
    solve: [['pluck', 392, 0, 0.2, 0.08], ['pluck', 523, 0.08, 0.2, 0.08], ['pluck', 659, 0.16, 0.38, 0.09]],
    win: [['pluck', 523, 0, 0.25, 0.08], ['pluck', 659, 0.1, 0.25, 0.08], ['pluck', 784, 0.2, 0.25, 0.08], ['bell', 1047, 0.3, 1.1, 0.06], ['bell', 1319, 0.3, 1.1, 0.04], ['thud', 131, 0.3, 0.45, 0.08, 110]],
    lose: [['pluck', 392, 0, 0.3, 0.07], ['pluck', 311, 0.18, 0.3, 0.07], ['pluck', 262, 0.36, 0.6, 0.07], ['thud', 110, 0.36, 0.5, 0.08, 70]],
    lifeLost: [['thud', 150, 0, 0.3, 0.16, 70], ['noise', 1800, 0, 0.08, 0.03]],
    reveal: [['whoosh', 900, 0, 0.22, 0.05, 2600]],
    levelUp: [['pluck', 440, 0, 0.2, 0.08], ['pluck', 659, 0.08, 0.2, 0.08], ['bell', 880, 0.16, 0.7, 0.06]]
  };
  /* a correct answer with a rarity tier climbs the scale: rarer answers sound brighter */
  var TIER_UP = [1, 1, 1.122, 1.26, 1.335, 1.498];
  function snd(type, o) {
    if (!sound || !SND[type]) return;
    var c = audio(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      var t0 = c.currentTime + 0.01, k = (type === 'correct' && o && o.tier) ? (TIER_UP[o.tier | 0] || 1) : 1;
      SND[type].forEach(function (n) { voice(c, k === 1 ? n : [n[0], n[1] * k, n[2], n[3], n[4], n[5] && n[5] * k], t0); });
      if (k >= 1.335) voice(c, ['bell', 1568 * k / 1.335, 0.14, 0.7, 0.035], t0);   // scholar and long-shot answers get a sparkle on top
    } catch (e) { /* audio is optional */ }
  }
  var VIB = { correct: [14], wrong: [30, 40, 30], near: [20], rare: [12, 30, 24], jackpot: [20, 40, 20, 40, 80], solve: [16, 30, 16], win: [24, 40, 24, 40, 70], lose: [90], lifeLost: [60], levelUp: [14, 30, 14] };
  function hap(type) {
    try { if (VIB[type] && !calm() && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(VIB[type]); } catch (e) { /* haptics are optional */ }
  }

  /* ---- the effect language: one vocabulary, each type a combination of the pieces above ---- */
  function play(type, o) {
    o = o || {};
    try {
      if (!enabled) return;
      snd(type, o); hap(type);
      if (hidden() || o.visual === false) return;
      visual(type, o);
    } catch (e) { /* an effect must never break a game */ }
  }
  function visual(type, o) {
    var el = o.el, c = posOf(o), I = o.intensity == null ? 0.5 : clamp(o.intensity, 0, 1), tier = o.tier | 0, cm = calm(), col = o.color, els = o.els;
    function each(fn) { if (els) Array.prototype.forEach.call(els, fn); else if (el) fn(el); }
    switch (type) {
      case 'tap': ripple(c.x, c.y, 30); break;
      case 'correct':
        col = col || (tier ? TIER[tier] : cssVar('--good', GOOD));
        if (cm) { if (el) pulse(el, col, { alpha: 0.25 }); break; }
        if (el) pop(el, 0.08 + I * 0.08);
        ring(c.x, c.y, col, 44 + I * 36);
        if (I >= 0.5 || tier >= 4) burst(c.x, c.y, { count: 8 + I * 20, colors: [col, GOLD], speed: 240, gravity: 420, life: 650, shape: 'mix', size: 4 });
        break;
      case 'wrong':
        col = col || cssVar('--bad', BAD);
        each(function (e) { if (o.shake !== false) shake(e); });
        if (el) pulse(el, col, { alpha: cm ? 0.22 : 0.3 });
        break;
      case 'near':
        col = col || WARM;
        each(function (e) { wiggle(e); });
        if (o.msgEl) pulse(o.msgEl, null, { beatScale: 1.08 });
        if (el) pulse(el, col, { alpha: 0.28 });
        break;
      case 'rare':
        col = col || GOLD;
        if (cm) { if (el) pulse(el, col, { alpha: 0.3 }); break; }
        if (el) pop(el, 0.14);
        ring(c.x, c.y, col, 60 + I * 40, 480);
        burst(c.x, c.y, { count: 14 + I * 32, colors: [col, '#ffffff', TIER[5] === col ? GOLD : col], speed: 300 + I * 120, gravity: 460, life: 780, shape: 'mix', size: 4 + I * 2 });
        break;
      case 'jackpot':
        if (el) popIn(el);
        edge(GOLD, true);
        if (cm) break;
        ring(c.x, c.y, GOLD, 120, 700); setTimeout(function () { ring(c.x, c.y, GOLD, 200, 700); }, 140);
        confetti({ intensity: 1, count: 56, life: 1000 });
        break;
      case 'solve': solve(el, col, o.plain); break;
      case 'win':
        if (cm) { if (el) pulse(el, col || GOLD, { alpha: 0.2 }); edge(col || GOLD); break; }
        if (el) popIn(el);
        if (I >= 0.5) confetti({ intensity: I }); else burst(c.x, c.y, { count: 24, colors: [col || GOLD, '#ffffff'], speed: 320, gravity: 420, life: 700, shape: 'mix', size: 4 });
        edge(col || GOLD);
        break;
      case 'lose':
        if (el) { if (!cm) slideIn(el, { dy: 8, ms: 300 }); pulse(el, cssVar('--bad', BAD), { alpha: 0.14, ms: 450 }); }
        break;
      case 'lifeLost': crackFall(el); break;
      case 'reveal': if (el) slideIn(el, { dy: o.dy, delay: o.delay, ms: o.ms }); break;
      case 'levelUp':
        if (el) pop(el, 0.14);
        if (!cm) { ring(c.x, c.y, col || GOLD, 80, 520); burst(c.x, c.y, { count: 18, colors: [col || GOLD, '#ffffff'], speed: 260, gravity: 380, life: 700, shape: 'mix', size: 4 }); }
        break;
      default: break;
    }
  }

  /* ---- button press feedback site-wide: scale .97 and a soft ripple (decorative, no layout change, no focus change) ---- */
  var pressEl = null, pressA = null;
  function pressable(t) {
    var b = t && t.closest ? t.closest('button,[role="button"],.btn,.hbtn,summary,.cx-tile,.cell') : null;
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true' || b.closest('.sinfx-layer')) return null;
    if (b.classList.contains('hbtn')) { b = b.closest('a') || b; }
    try { if (getComputedStyle(b).display === 'inline') return null; } catch (e) { /* ignore */ }
    return b;
  }
  function down(e) {
    if (!enabled || calm() || hidden() || !CAN || (e.button != null && e.button > 0)) return;
    var b = pressable(e.target); if (!b) return;
    if (b.classList.contains('sinfx-nopress')) return;
    pressEl = b; pressA = b.animate([{ scale: '1' }, { scale: '.97' }], { duration: 80, fill: 'forwards', easing: 'ease-out' });
    ripple(e.clientX, e.clientY, 34);
  }
  function up() {
    if (!pressEl) return;
    var b = pressEl; pressEl = null;
    try { if (pressA) pressA.cancel(); pressA = null; b.animate([{ scale: '.97' }, { scale: '1' }], { duration: 150, easing: 'ease-out' }); } catch (e) { /* ignore */ }
  }

  /* ---- the on/off controls: an Effects toggle and a Sound toggle (speaker icon) ---- */
  var ctls = [], NS = 'http://www.w3.org/2000/svg';
  function svg(items) {
    var s = doc.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    items.forEach(function (it) { var p = doc.createElementNS(NS, 'path'); p.setAttribute('d', it[0]); if (it[1]) p.setAttribute('class', it[1]); s.appendChild(p); });
    return s;
  }
  function mkBtn(kind, labels) {
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'sinfx-btn sinfx-nopress'; b.setAttribute('data-sinfx', kind);
    if (kind === 'fx') b.appendChild(svg([['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'], ['M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z'], ['M4 4l16 16', 'p-off']]));
    else b.appendChild(svg([['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z'], ['M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11', 'p-on'], ['M16 9.5l5 5M21 9.5l-5 5', 'p-off']]));
    if (labels) { var t = doc.createElement('span'); t.className = 'sinfx-lbl'; b.appendChild(t); }
    b.addEventListener('click', function () {
      if (kind === 'fx') { setEnabled(!enabled); if (enabled) play('reveal', { el: b }); }
      else { setSound(!sound); if (sound) play('correct'); }
    });
    return b;
  }
  function sync() {
    ctls.slice().forEach(function (c) {
      if (!c.b.isConnected) { ctls.splice(ctls.indexOf(c), 1); return; }
      var on = c.kind === 'fx' ? enabled : sound;
      c.b.setAttribute('aria-pressed', on ? 'true' : 'false');
      c.b.setAttribute('aria-label', (c.kind === 'fx' ? 'Visual effects' : 'Sound effects') + ': ' + (on ? 'on' : 'off'));
      c.b.title = (c.kind === 'fx' ? 'Visual effects ' : 'Sound effects ') + (on ? 'on' : 'off');
      var l = c.b.querySelector('.sinfx-lbl'); if (l) l.textContent = (c.kind === 'fx' ? 'Effects ' : 'Sound ') + (on ? 'on' : 'off');
    });
  }
  /* mountControls(parent, {only: 'fx'|'sound', labels: true}) */
  function mountControls(parent, o) {
    o = o || {};
    if (!parent || parent.querySelector('.sinfx-ctl')) return;
    var w = doc.createElement('span'); w.className = 'sinfx-ctl' + (o.labels ? ' sinfx-labels' : '');
    ['fx', 'sound'].forEach(function (k) { if (o.only && o.only !== k) return; var b = mkBtn(k, o.labels); ctls.push({ b: b, kind: k }); w.appendChild(b); });
    parent.appendChild(w); sync();
  }
  function autoMount() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-sinfx-controls]'), function (p) {
      var v = p.getAttribute('data-sinfx-controls') || '';
      mountControls(p, { only: v === 'sound' ? 'sound' : v === 'fx' ? 'fx' : '', labels: v === 'labels' });
    });
  }

  /* ---- public switches ---- */
  function setEnabled(b) { enabled = !!b; ls('set', KEY_ON, enabled ? '1' : '0'); root.classList.toggle('sinfx-off', !enabled); if (!enabled) cancelAll(); sync(); }
  function setSound(b) { sound = !!b; ls('set', KEY_SND, sound ? '1' : '0'); if (sound) audio(); sync(); }
  function stats() {
    var a = ftimes.slice().sort(function (x, y) { return x - y; }), n = a.length, sum = 0; a.forEach(function (v) { sum += v; });
    return { frames: frames, samples: n, avgMs: n ? +(sum / n).toFixed(2) : 0, p95Ms: n ? +a[Math.floor(n * 0.95)].toFixed(2) : 0, maxMs: n ? +a[n - 1].toFixed(2) : 0, particles: P.length, live: live.length };
  }

  doc.addEventListener('visibilitychange', function () { if (doc.hidden) cancelAll(); });
  window.addEventListener('resize', function () { if (cv && cx) sizeCanvas(); });
  window.addEventListener('pagehide', cancelAll);
  doc.addEventListener('pointerdown', down, { capture: true, passive: true });
  doc.addEventListener('pointerup', up, { capture: true, passive: true });
  doc.addEventListener('pointercancel', up, { capture: true, passive: true });
  doc.addEventListener('dragstart', up, { capture: true, passive: true });
  root.classList.toggle('sinfx-off', !enabled);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', autoMount); else autoMount();

  window.SINFX = {
    play: play, setEnabled: setEnabled, isEnabled: function () { return enabled; }, setSound: setSound, isSound: function () { return sound; },
    burst: burst, countUp: countUp, shake: shake, pulse: pulse, flip: flip, confetti: confetti,
    pop: pop, popIn: popIn, ring: ring, edge: edge, wiggle: wiggle, slideIn: slideIn, crackFall: crackFall, staggerIn: staggerIn,
    snapshot: snapshot, slideFrom: slideFrom, ghost: ghost, glide: glide, mountControls: mountControls, stats: stats, isCalm: calm, cancel: cancelAll, version: 1
  };
})();
