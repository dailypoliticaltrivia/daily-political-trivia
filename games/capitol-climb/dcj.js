/* Capitol Climb: the game page. Logic helpers are in dcj-core.js, the map in map.js, feedback effects in fx.js (DCJ_FX).
   Banks: data/manifest.json -> data/bank-*.json (schema and checks: site/tools/validate-history.js). Stops: data/stops.json. */
(function () {
  'use strict';
  var Core = window.DCJCore, MapLib = window.DCJMap, Scenes = window.DCJ_SCENES || { has: function () { return false; }, svg: function () { return ''; } }, FX = window.DCJ_FX || function () {};
  var esc = (window.SIN && SIN.esc) || function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $game = document.getElementById('game'), $live = document.getElementById('dj-live'), $sheet = document.getElementById('dj-sheet');
  var TITLE = (document.querySelector('.ptitle') || {}).textContent || 'Capitol Climb';
  var SLUG = (location.pathname.match(/\/games\/([^\/]+)\//) || [0, 'capitol-climb'])[1];
  var KEY_DAILY = 'sin.dcj.v1.daily', KEY_SEEN = 'sin.dcj.v1.seen', KEY_SCOPE = 'sin.dcj.v1.scope';

  /* ---------- ads: video breaks, same hooks as the other games (assets/ads/INTEGRATION.md). Never throws, never delays when ads are off. ---------- */
  function adBreak(kind) { try { return window.SIN_ADS && SIN_ADS.ready ? Promise.resolve(SIN_ADS[kind](SLUG)) : Promise.resolve(); } catch (e) { return Promise.resolve(); } }
  function gameplay(on) { try { if (window.SIN_ADS && SIN_ADS.setGameplay) SIN_ADS.setGameplay(on); } catch (e) {} }

  /* ---------- storage (always guarded; the game works without it) ---------- */
  var storageOK = (function () { try { var k = '__dcj'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------- state ---------- */
  var stops = [], stopsById = {}, pool = [], byId = {};
  var S = null;                       // today's journey: {v,mode,date,stops[],ids[],qi,lives,res[],pick[],phase:'q'|'review'|'done'}
  var E = null;                       // endless run: {scope, answered, correct, streak, cur:{q,stop,pick}, last}
  var seen = {};                      // endless: ids already shown
  var lastScope = { stop: null, period: null };
  var view = 'intro', busy = false, introDate = '', ctl = null, stage, hud, panel, nowEl, mapband, sceneEl, sceneId = '', sceneMode = '';

  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function say(msg) { $live.textContent = ''; setTimeout(function () { $live.textContent = msg; }, 30); }
  function stopName(id) { return stopsById[id] ? stopsById[id].name : ''; }
  function eraText(q) { var p = Core.PERIODS[q.period]; return p ? 'Period ' + p.n + ' · ' + p.years + ' · ' + p.name : ''; }

  /* ---------- loading ---------- */
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function loadAll() {
    /* seam for a single-file build (tools/build-artifact-single.js): window.DCJ_DATA = {stops:[...], banks:[{bank,questions:[...]}]} skips every fetch */
    if (window.DCJ_DATA && Array.isArray(window.DCJ_DATA.stops)) {
      var set0 = {}; window.DCJ_DATA.stops.forEach(function (s) { set0[s.id] = 1; });
      return Promise.resolve({ stops: window.DCJ_DATA.stops, pool: Core.mergeBanks(window.DCJ_DATA.banks || [], set0) });
    }
    /* stops and manifest are requested together (one round trip less), then all banks in parallel */
    var pStops = getJSON('data/stops.json'), pMan = getJSON('data/manifest.json');
    pMan.catch(function () {});
    return pStops.then(function (d) { return d.stops || []; }).then(function (st) {
      var set = {}; st.forEach(function (s) { set[s.id] = 1; });
      return pMan.then(function (m) {
        return Promise.all((m.banks || []).map(function (f) { return getJSON('data/' + encodeURIComponent(f)).catch(function () { return null; }); }));
      }).catch(function () { return []; }).then(function (banks) { return { stops: st, pool: Core.mergeBanks(banks, set) }; });
    });
  }

  /* ---------- small renderers ---------- */
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.4S4 15.5 4 9.6A4.4 4.4 0 0 1 8.4 5.2c1.5 0 2.8.7 3.6 1.9.8-1.2 2.1-1.9 3.6-1.9A4.4 4.4 0 0 1 20 9.6c0 5.9-8 10.8-8 10.8z"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var PINSVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="var(--paper)"/></svg>';
  function heartsHtml(n) {
    var h = ''; for (var i = 0; i < Core.LIVES; i++) h += '<span class="dj-heart' + (i < n ? ' is-full' : '') + '">' + HEART + '</span>';
    return '<div class="dj-hearts" role="img" aria-label="' + n + (n === 1 ? ' heart' : ' hearts') + ' left">' + h + '</div>';
  }
  function segsHtml() {
    var h = '';
    for (var i = 0; i < S.ids.length; i++) h += '<i class="' + (S.res[i] === 1 ? 'ok' : S.res[i] === 0 ? 'miss' : i === S.qi ? 'cur' : '') + '"></i>';
    return '<div class="dj-segs" aria-hidden="true">' + h + '</div>';
  }
  function journeyHud() {
    return '<a class="dj-back" href="../" aria-label="Back to games">' + CHEV + '<span>Games</span></a>' +
      '<div class="dj-prog"><div class="dj-step">Stop <b class="num">' + (S.qi + 1) + '</b> of <span class="num">' + S.ids.length + '</span></div>' + segsHtml() + '</div>' + heartsHtml(S.lives);
  }
  function endlessHud() {
    var nm = E.scope.stop ? stopsById[E.scope.stop].short : 'All of DC', per = E.scope.period ? ' · Period ' + E.scope.period : '';
    return '<button class="dj-back" type="button" data-act="stops" aria-label="Back to the list of stops">' + CHEV + '<span>Stops</span></button>' +
      '<div class="dj-prog"><div class="dj-step"><b>' + esc(nm) + '</b>' + per + '</div><div class="dj-sub"><span class="num" id="dj-ec">' + E.correct + '</span> correct of <span class="num">' + E.answered + '</span> · streak <b class="num" id="dj-es">' + E.streak + '</b></div></div>' +
      '<div class="dj-left"><span class="num" id="dj-el">' + (E.cur ? E.cur.left + 1 : 0) + '</span> left</div>';
  }
  /* the name tag sits in the corner of the map band that is farthest from the stop it names */
/* the scene: the picture of the stop you are at (or heading to). A stop without a scene art file simply shows no picture. */
  function setScene(id, mode) {
    if (!id || !Scenes.has(id) || view === 'pick') { sceneEl.hidden = true; stage.removeAttribute('data-scene'); sceneId = ''; sceneMode = ''; sceneEl.classList.remove('is-travel', 'is-arrive'); return; }
    var changed = sceneId !== id;
    if (changed) { sceneEl.firstChild.innerHTML = Scenes.svg(id); sceneId = id; }   // static art from scenes.js, never user text
    var s = stopsById[id];
    sceneEl.querySelector('small').textContent = mode === 'travel' ? 'Heading to' : 'You are at';
    sceneEl.querySelector('b').textContent = s ? s.name : '';
    sceneEl.hidden = false; stage.setAttribute('data-scene', '1');
    sceneEl.classList.toggle('is-travel', mode === 'travel');
    sceneEl.classList.remove('is-arrive');
    if (mode === 'here' && (changed || sceneMode === 'travel')) { void sceneEl.offsetWidth; sceneEl.classList.add('is-arrive'); }
    sceneMode = mode || '';
  }
  function setNow(text, id) {
    if (!text) { nowEl.hidden = true; nowEl.textContent = ''; setScene(null); return; }
    setScene(id, /^Heading to/.test(text) ? 'travel' : 'here');
    var s = stopsById[id] || null;
    nowEl.hidden = false; nowEl.innerHTML = PINSVG + '<span>' + esc(text) + '</span>';
    nowEl.className = 'dj-now' + (s && s.x < 200 ? ' at-r' : '') + (s && s.y > 190 ? ' at-t' : '');
  }

  function optionsHtml(q, picked) {
    return q.options.map(function (t, i) {
      var cls = 'dj-opt', tail = '';
      if (picked != null) {
        if (i === q.answer) { cls += ' is-right'; tail = '<span class="sr-only"> (correct answer)</span>'; }
        else if (i === picked) { cls += ' is-wrong'; tail = '<span class="sr-only"> (your answer, incorrect)</span>'; }
        else cls += ' is-dim';
      }
      return '<button class="' + cls + '" type="button" data-i="' + i + '"' + (picked != null ? ' disabled' : '') + '><span class="dj-key" aria-hidden="true">' + (i + 1) + '</span><span class="dj-ot">' + esc(t) + tail + '</span><span class="dj-mk" aria-hidden="true"></span></button>';
    }).join('');
  }
  function feedbackHtml(q, picked, nextLabel, extra) {
    var ok = picked === q.answer;
    return '<div class="dj-fb ' + (ok ? 'is-right' : 'is-wrong') + '" id="dj-fb"><p class="dj-verdict">' + (ok ? 'Correct.' : 'Not quite. The answer is <b>' + esc(q.options[q.answer]) + '</b>.') + (extra ? ' ' + esc(extra) : '') + '</p>' +
      '<p class="dj-explain">' + esc(q.explain) + '</p><p class="dj-era">' + esc(eraText(q)) + '</p>' +
      '<button class="btn red dj-next" type="button" id="dj-next">' + esc(nextLabel) + '</button></div>';
  }
  function questionHtml(q, stop, picked, nextLabel, extra) {
    return '<section class="dj-q" aria-labelledby="dj-qt"><h2 class="dj-qt" id="dj-qt" tabindex="-1"><span class="sr-only">At ' + esc(stop.name) + '. </span>' + esc(q.q) + '</h2>' +
      '<div class="dj-opts" role="group" aria-label="Answers">' + optionsHtml(q, picked) + '</div>' + (picked != null ? feedbackHtml(q, picked, nextLabel, extra) : '') + '</section>';
  }
  function scrollStageIntoView() { try { var r = stage.getBoundingClientRect(); if (r.top < 0) stage.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {} }

  /* ---------- shell ---------- */
  function buildShell() {
    $game.setAttribute('aria-busy', 'false');
    $game.innerHTML = '<div class="dj-stage" id="dj-stage" data-view="intro"><div class="dj-hud" id="dj-hud" hidden></div>' +
      '<div class="dj-mapband" id="dj-mapband"><div class="dj-mapbox" id="dj-map"></div><p class="dj-now" id="dj-now" hidden></p></div>' +
      '<div class="dj-scene" id="dj-scene" aria-hidden="true" hidden><div class="dj-scene-art"></div><p class="dj-scene-tag"><small></small><b></b></p></div>' +
      '<div class="dj-panel" id="dj-panel"></div></div>';
    stage = document.getElementById('dj-stage'); hud = document.getElementById('dj-hud'); panel = document.getElementById('dj-panel');
    nowEl = document.getElementById('dj-now'); mapband = document.getElementById('dj-mapband'); sceneEl = document.getElementById('dj-scene');
    ctl = MapLib.create(document.getElementById('dj-map'), stops, { onPick: function (id) { selectStop(id, true); } });
    panel.addEventListener('click', onPanelClick);
    hud.addEventListener('click', onPanelClick);
  }
  function setView(v) { view = v; stage.setAttribute('data-view', v); }

  /* ---------- intro ---------- */
  function dailyState() {
    var s = load(KEY_DAILY), date = Core.dateStr();
    if (!s || s.v !== 1 || s.date !== date || s.mode !== 'daily' || !Array.isArray(s.ids) || !Array.isArray(s.res) || s.ids.length !== s.res.length) return { state: 'new', saved: null };
    /* saved numbers are written into the page: force them to plain numbers in range (a hand-edited save cannot inject markup) */
    s.qi = Math.min(Math.max(0, s.qi | 0), Math.max(0, s.ids.length - 1)); s.lives = Math.min(Math.max(0, s.lives | 0), Core.LIVES);
    s.res = s.res.map(function (r) { return r === 1 ? 1 : r === 0 ? 0 : null; });
    s.pick = (Array.isArray(s.pick) ? s.pick : []).map(function (p) { return p == null ? null : p | 0; });
    if (!Array.isArray(s.stops)) return { state: 'new', saved: null };
    if (s.phase === 'done') return { state: 'done', saved: s };
    if (!s.ids.every(function (id) { return byId[id]; }) || !s.stops.every(function (id) { return stopsById[id]; })) return { state: 'new', saved: null };   // banks changed under a run in progress
    return { state: 'resume', saved: s };
  }
  function renderIntro() {
    cancelBusy();
    setView('intro'); hud.hidden = true; hud.innerHTML = ''; setNow('');
    ctl.mode('free'); ctl.setRoute([]); ctl.hidePin(); ctl.select(null);
    introDate = Core.dateStr();
    var d = dailyState(), n = Math.min(Core.ROUTE_LEN, pool.length);
    var primary = d.state === 'resume' ? 'Continue today’s journey (stop ' + (d.saved.qi + 1) + ')' : d.state === 'done' ? 'See today’s result' : 'Start today’s journey';
    var doneLine = '';
    if (d.state === 'done') { var sm = Core.summarize(d.saved.res, d.saved.lives); doneLine = '<p class="dj-done">' + (sm.complete ? 'Finished all ' + sm.total + ' stops' : 'Reached stop ' + sm.reached + ' of ' + sm.total) + ' · ' + Core.rankFor(sm) + '</p>'; }
    var ready = pool.length > 0;
    panel.innerHTML =
      '<p class="lede dj-lede">Travel the National Mall and beyond. Where you stand decides the question: the Senate floor, the Library of Congress, the Lincoln Memorial. All of U.S. history, four choices each.</p>' +
      '<section class="dj-card"><h2>Today’s journey</h2><p class="dj-date">' + esc(Core.prettyDate(introDate)) + '</p>' +
      '<p>' + n + ' stops, ' + Core.LIVES + ' hearts. A wrong answer costs a heart. Everyone gets the same route today; a new one arrives at midnight, your local time.</p>' + doneLine +
      '<div class="dj-row"><button class="btn red" type="button" data-act="daily"' + (ready ? '' : ' disabled') + ' id="dj-go">' + esc(primary) + '</button></div></section>' +
      '<section class="dj-card"><h2>Explore DC</h2><p>Pick any stop, or all of DC, and answer as many questions as you like. No hearts, no clock, and you will not see a question twice until you have seen them all.</p>' +
      '<div class="dj-row"><button class="btn ghost" type="button" data-act="explore"' + (ready ? '' : ' disabled') + '>Choose a stop</button></div></section>' +
      (ready ? '' : '<p class="dj-warn">The questions could not be loaded. Check your connection and reload the page.</p>') +
      (storageOK ? '' : '<p class="fine">Your browser is blocking saved progress, so a journey will not survive a reload.</p>');
    var go = document.getElementById('dj-go'); if (go) go.focus({ preventScroll: true });
  }

  /* ---------- journey ---------- */
  function startDaily() {
    var d = dailyState();
    if (d.state === 'done') { S = d.saved; showFinished(false); openSheet(); return; }
    if (d.state === 'resume') { S = d.saved; gameplay(true); showJourney(); return; }
    var btn = document.getElementById('dj-go');
    function go() {
      var r = Core.pickJourney(pool, stops, Core.dateStr());
      if (!r.ids.length) return;
      S = { v: 1, mode: 'daily', date: r.date, stops: r.stops, ids: r.ids, qi: 0, lives: Core.LIVES, res: r.ids.map(function () { return null; }), pick: r.ids.map(function () { return null; }), phase: 'q' };
      save(KEY_DAILY, S); gameplay(true); showJourney();
    }
    if (window.SIN_ADS && SIN_ADS.ready) { btn.disabled = true; adBreak('showPreroll').then(go, go); } else go();
  }
  function showJourney() {
    setView('play'); stage.setAttribute('data-mode', 'journey'); hud.hidden = false;
    hud.innerHTML = journeyHud();
    ctl.mode('journey'); ctl.setRoute(S.stops); ctl.setProgress(S.qi, S.res);
    ctl.moveTo(S.stops[S.qi], { instant: true, routeIndex: S.qi });
    renderJourneyQuestion(true);
  }
  function jNextLabel() { return (S.lives <= 0 || S.qi + 1 >= S.ids.length) ? 'See results' : 'Next stop'; }
  function renderJourneyQuestion(focus) {
    var q = byId[S.ids[S.qi]], stop = stopsById[S.stops[S.qi]], picked = S.phase === 'review' ? S.pick[S.qi] : null;
    setNow(stop.name, stop.id);
    panel.classList.remove('is-travel');
    panel.innerHTML = questionHtml(q, stop, picked, jNextLabel(), S.phase === 'review' && picked !== q.answer && S.lives <= 0 ? 'That was your last heart.' : '');
    scrollStageIntoView();
    say('Stop ' + (S.qi + 1) + ' of ' + S.ids.length + ', ' + stop.name + '. ' + q.q);
    if (focus) { var h = document.getElementById(picked != null ? 'dj-next' : 'dj-qt'); if (h) h.focus({ preventScroll: true }); }
  }
  function answerJourney(i, btn) {
    if (S.phase !== 'q') return;
    var q = byId[S.ids[S.qi]], ok = i === q.answer;
    FX('select', { el: btn });
    S.pick[S.qi] = i; S.res[S.qi] = ok ? 1 : 0; S.phase = 'review';
    if (!ok) S.lives--;
    save(KEY_DAILY, S);
    ctl.setProgress(S.qi, S.res);
    var sec = panel.querySelector('.dj-q');
    panel.querySelector('.dj-opts').outerHTML = '<div class="dj-opts" role="group" aria-label="Answers">' + optionsHtml(q, i) + '</div>';
    sec.insertAdjacentHTML('beforeend', feedbackHtml(q, i, jNextLabel(), !ok && S.lives <= 0 ? 'That was your last heart.' : ''));
    var chosen = panel.querySelector('.dj-opt[data-i="' + i + '"]');
    FX(ok ? 'correct' : 'wrong', { el: chosen });
    if (!ok) { FX('reveal', { el: panel.querySelector('.dj-opt[data-i="' + q.answer + '"]') }); }
    hud.innerHTML = journeyHud();
    if (!ok) FX('heart-lost', { el: hud.querySelectorAll('.dj-heart')[S.lives] });
    say((ok ? 'Correct. ' : 'Not quite. The answer is ' + q.options[q.answer] + '. ') + q.explain + (S.lives <= 0 && !ok ? ' That was your last heart.' : '') + ' ' + S.lives + (S.lives === 1 ? ' heart' : ' hearts') + ' left.');
    var nx = document.getElementById('dj-next'); nx.focus({ preventScroll: true });
    try { document.getElementById('dj-fb').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) {}
  }
  function nextJourney(btn) {
    if (S.phase !== 'review') return;
    FX('next', { el: btn });
    if (S.lives <= 0 || S.qi + 1 >= S.ids.length) { S.phase = 'done'; save(KEY_DAILY, S); gameplay(false); showFinished(true); return; }
    busy = true;
    S.qi++; S.phase = 'q'; save(KEY_DAILY, S);
    hud.innerHTML = journeyHud();
    ctl.setProgress(S.qi, S.res);
    panel.classList.add('is-travel');
    setNow('Heading to ' + stopName(S.stops[S.qi]), S.stops[S.qi]);
    FX('travel', { el: mapband });
    var qi = S.qi;
    ctl.moveTo(S.stops[qi], { routeIndex: qi }).then(function () {
      if (!busy || !S || S.qi !== qi || view !== 'play') return;
      busy = false; FX('arrive', { el: mapband }); renderJourneyQuestion(true);
    });
  }
  function showFinished(justNow) {
    cancelBusy();
    setView('done'); stage.setAttribute('data-mode', 'journey'); hud.hidden = true; hud.innerHTML = '';
    var sm = Core.summarize(S.res, S.lives), lastIdx = Math.max(0, sm.reached - 1);
    ctl.mode('journey'); ctl.setRoute(S.stops); ctl.setProgress(lastIdx, S.res); ctl.moveTo(S.stops[lastIdx], { instant: true, routeIndex: lastIdx });
    setNow(stopName(S.stops[lastIdx]), S.stops[lastIdx]);
    panel.innerHTML = '<section class="dj-card dj-final"><h2>' + (sm.complete ? 'Route complete' : 'Journey over') + '</h2><p class="dj-big num">Stop ' + sm.reached + '<small> of ' + sm.total + '</small></p>' +
      '<p>' + sm.correct + ' correct · ' + sm.lives + (sm.lives === 1 ? ' heart' : ' hearts') + ' left · <b>' + esc(Core.rankFor(sm)) + '</b></p>' +
      '<div class="dj-row"><button class="btn red" type="button" data-act="sheet">See results</button><button class="btn ghost" type="button" data-act="explore">Explore DC</button></div>' +
      '<p class="fine">You have played today’s journey. A new route arrives at midnight, your local time.</p></section>';
    if (justNow) { openSheet(); adBreak('showPostroll'); }
  }

  /* ---------- results sheet ---------- */
  function shareString() {
    var sm = Core.summarize(S.res, S.lives), last = S.stops[Math.max(0, sm.reached - 1)];
    return Core.shareText({ title: TITLE, date: S.date, res: S.res, lives: S.lives, lastStopName: stopName(last), url: location.origin + location.pathname.replace(/index\.html$/, '') });
  }
  function openSheet() {
    var sm = Core.summarize(S.res, S.lives), last = S.stops[Math.max(0, sm.reached - 1)], txt = shareString();
    var sq = Core.squares(S.res).map(function (c, i) { return '<i class="' + (S.res[i] === 1 ? 'ok' : S.res[i] === 0 ? 'miss' : 'none') + '">' + c + '</i>'; });
    var label = S.res.map(function (r, i) { return 'stop ' + (i + 1) + (r === 1 ? ' correct' : r === 0 ? ' missed' : ' not reached'); }).join(', ');
    $sheet.innerHTML = '<div class="dj-sheet-in"><span class="dj-grab" aria-hidden="true"></span>' +
      '<h2 id="dj-sheet-title" tabindex="-1">' + (sm.complete ? 'Route complete' : 'Out of hearts') + '</h2>' +
      '<p class="dj-big num">Stop ' + sm.reached + '<small> of ' + sm.total + '</small></p>' +
      '<p class="dj-laststop">' + (sm.complete ? 'Last stop: ' : 'Your journey ended at ') + '<b>' + esc(stopName(last)) + '</b></p>' +
      '<div class="dj-squares" role="img" aria-label="' + esc(label) + '"><span>' + sq.slice(0, Math.ceil(sq.length / 2)).join('') + '</span><span>' + sq.slice(Math.ceil(sq.length / 2)).join('') + '</span></div>' +
      '<dl class="dj-stats"><div><dt>Correct</dt><dd class="num">' + sm.correct + '</dd></div><div><dt>Hearts left</dt><dd class="num">' + sm.lives + '</dd></div><div><dt>Rank</dt><dd>' + esc(Core.rankFor(sm)) + '</dd></div></dl>' +
      '<label class="sr-only" for="dj-share">Share text</label><textarea class="dj-share" id="dj-share" readonly rows="6">' + esc(txt) + '</textarea>' +
      '<div class="dj-row"><button class="btn red" type="button" data-act="share">Share result</button><button class="btn ghost" type="button" data-act="copy">Copy result</button><button class="btn ghost" type="button" data-act="explore-sheet">Explore DC</button></div>' +
      '<p class="studyline"><a class="studylink" href="../../map/">See who represented each place over time on the Congress Map</a></p>' +
      '<button class="dj-close" type="button" data-act="close-sheet">Close</button>' +
      '<p class="fine">Spoiler-free: the share text shows only right, wrong and not reached. A new route arrives at midnight, your local time.</p></div>';
    if (!$sheet.open) { if ($sheet.showModal) $sheet.showModal(); else $sheet.setAttribute('open', ''); }
    FX('sheet', { el: $sheet.firstChild }); FX(sm.complete ? 'win' : 'lose', { el: $sheet.firstChild });
    try { var big = $sheet.querySelector('.dj-big'); if (big && window.SINFX) SINFX.countUp(big, sm.reached, 900, 0); } catch (e) { /* effects are optional */ }
    var t = document.getElementById('dj-sheet-title'); if (t) t.focus({ preventScroll: true });
  }
  function closeSheet() { if ($sheet.open) { if ($sheet.close) $sheet.close(); else $sheet.removeAttribute('open'); } }
  function doShare(sheet) {
    var ta = document.getElementById('dj-share'), t = ta.value;
    function shareOut(t, el, useShare, done) {
      /* Share sheet first (if asked), then clipboard, then the old copy command; if all are blocked (a sandboxed preview, an old browser) the text is left selected so it can be copied by hand. */
      function pick() { try { if (el.select) { el.focus(); el.select(); el.setSelectionRange(0, t.length); } else { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } } catch (e) {} }
      function manual() { pick(); done('manual'); }
      function viaExec() { pick(); try { if (document.execCommand('copy')) { done('copied'); return; } } catch (e) {} manual(); }
      function viaClip() { if (navigator.clipboard && navigator.clipboard.writeText) { try { navigator.clipboard.writeText(t).then(function () { done('copied'); }, viaExec); } catch (e) { viaExec(); } } else viaExec(); }
      if (useShare && navigator.share) { var u = /^https?:$/.test(location.protocol) && !/claude|localhost|127.0|192.168|^10./.test(location.hostname) ? location.origin + location.pathname : ''; try { navigator.share(u ? { text: t, url: u } : { text: t }).then(function () { done('shared'); }, function (e) { if (e && e.name === 'AbortError') return; viaClip(); }); } catch (e) { viaClip(); } } else viaClip();
    }
    shareOut(t, ta, sheet !== false, function (k) { if (window.SIN && SIN.toast) SIN.toast(k === 'manual' ? 'Text selected. Press and hold it, then tap Copy.' : k === 'shared' ? 'Result shared' : 'Result copied'); });
  }

  /* ---------- explore (endless) ---------- */
  function loadSeen() { var s = load(KEY_SEEN); seen = s && typeof s === 'object' && !Array.isArray(s) ? s : {}; var sc = load(KEY_SCOPE); if (sc && typeof sc === 'object') lastScope = { stop: stopsById[sc.stop] ? sc.stop : null, period: sc.period >= 1 && sc.period <= 9 ? sc.period : null }; }
  function saveSeen() { save(KEY_SEEN, seen); }
  var sel = { stop: null, period: null };
  function countFor(stopId, period) {
    var all = Core.scopePool(pool, { stop: stopId, period: period }), left = 0;
    all.forEach(function (q) { if (!seen[q.id]) left++; });
    return { total: all.length, left: left };
  }
  function renderPicker() {
    cancelBusy();
    setView('pick'); stage.setAttribute('data-mode', 'explore'); hud.hidden = false; setNow('');
    sel = { stop: lastScope.stop, period: lastScope.period };
    hud.innerHTML = '<button class="dj-back" type="button" data-act="home" aria-label="Back to the start screen">' + CHEV + '<span>Back</span></button><div class="dj-prog"><div class="dj-step"><b>Explore DC</b></div><div class="dj-sub">Pick a stop on the map or in the list</div></div>';
    ctl.mode('pick'); ctl.setRoute([]); ctl.select(sel.stop); ctl.hidePin();
    var periods = '<option value="">All periods</option>' + Core.PERIODS.slice(1).map(function (p) { return '<option value="' + p.n + '"' + (sel.period === p.n ? ' selected' : '') + '>Period ' + p.n + ' · ' + p.years + ' · ' + esc(p.name) + '</option>'; }).join('');
    panel.innerHTML = '<div class="dj-pickhead"><label for="dj-period">Period</label><select id="dj-period">' + periods + '</select></div>' +
      '<ul class="dj-list" id="dj-list" aria-label="Stops"></ul>' +
      '<div class="dj-pickfoot"><p class="fine" id="dj-seen"></p><button class="dj-link" type="button" data-act="reset-all" id="dj-reset">Forget which questions I have seen</button></div>' +
      '<div class="dj-visit"><button class="btn red" type="button" data-act="visit" id="dj-visit"></button></div>';
    document.getElementById('dj-period').addEventListener('change', function () { sel.period = this.value ? +this.value : null; fillList(); });
    fillList();
    var li = document.querySelector('#dj-list [aria-pressed="true"]'); if (li) try { li.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  function fillList() {
    var rows = [{ id: null, name: 'All of DC', blurb: 'Every stop at once. The pin hops to wherever the question belongs.' }].concat(stops.slice().sort(function (a, b) { return a.x - b.x; }).map(function (s) { return { id: s.id, name: s.name, blurb: s.blurb }; }));
    document.getElementById('dj-list').innerHTML = rows.map(function (r) {
      var c = countFor(r.id, sel.period), dis = c.total === 0;
      return '<li><button type="button" class="dj-row-btn" data-act="pick" data-stop="' + (r.id || '') + '" aria-pressed="' + (sel.stop === r.id ? 'true' : 'false') + '"' + (dis ? ' disabled' : '') + '>' +
        '<span class="dj-rn">' + esc(r.name) + '</span><span class="dj-rb">' + esc(r.blurb) + '</span><span class="dj-rc num">' + (dis ? 'No questions yet' : c.left === 0 ? 'All seen' : c.left + ' of ' + c.total + ' left') + '</span></button></li>';
    }).join('');
    updateVisit();
    var all = Core.scopePool(pool, {}), left = 0; all.forEach(function (q) { if (!seen[q.id]) left++; });
    document.getElementById('dj-seen').textContent = 'You have seen ' + (all.length - left) + ' of ' + all.length + ' questions.';
  }
  function updateVisit() {
    var b = document.getElementById('dj-visit'), c = countFor(sel.stop, sel.period);
    b.textContent = 'Visit ' + (sel.stop ? stopsById[sel.stop].name : 'all of DC');
    b.disabled = c.total === 0;
    [].forEach.call(document.querySelectorAll('#dj-list .dj-row-btn'), function (r) { r.setAttribute('aria-pressed', (r.getAttribute('data-stop') || null) === sel.stop ? 'true' : 'false'); });
  }
  function selectStop(id, fromMap) {
    if (view !== 'pick') return;
    if (id && countFor(id, sel.period).total === 0 && fromMap) { setNow(stopName(id) + ': no questions yet', id); }
    sel.stop = id || null; ctl.select(sel.stop);
    if (sel.stop) { ctl.placePin(sel.stop); setNow(stopName(sel.stop), sel.stop); } else { ctl.hidePin(); setNow(''); }
    updateVisit();
    if (fromMap) { var r = document.querySelector('#dj-list [aria-pressed="true"]'); if (r) try { r.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) {} }
  }
  function startEndless() {
    lastScope = { stop: sel.stop, period: sel.period }; save(KEY_SCOPE, lastScope);
    E = { scope: { stop: sel.stop, period: sel.period }, answered: 0, correct: 0, streak: 0, cur: null, last: null };
    setView('play'); stage.setAttribute('data-mode', 'explore'); hud.hidden = false;
    ctl.mode('free'); ctl.setRoute([]);
    nextEndless(true);
  }
  function nextEndless(first) {
    var r = Core.pickEndless(pool, E.scope, seen, Math.random, E.last);
    if (!r.q) return renderExhausted(r.total);
    seen[r.q.id] = 1; saveSeen(); E.last = r.q.id;
    E.cur = { q: r.q, stop: r.stop, pick: null, left: r.left };
    hud.innerHTML = endlessHud(); ctl.select(r.stop);
    function show() { busy = false; renderEndlessQuestion(true); }
    if (first || reduced()) { ctl.placePin(r.stop); ctl.select(r.stop); show(); return; }
    busy = true; panel.classList.add('is-travel'); setNow('Heading to ' + stopName(r.stop), r.stop); FX('travel', { el: mapband });
    var cur = E.cur;
    ctl.moveTo(r.stop).then(function () { if (!busy || !E || E.cur !== cur || view !== 'play') return; FX('arrive', { el: mapband }); show(); });
  }
  function renderEndlessQuestion(focus) {
    var c = E.cur; setNow(stopName(c.stop), c.stop); panel.classList.remove('is-travel');
    panel.innerHTML = questionHtml(c.q, stopsById[c.stop], c.pick, 'Next question', '');
    scrollStageIntoView();
    say(stopName(c.stop) + '. ' + c.q.q);
    if (focus) { var h = document.getElementById('dj-qt'); if (h) h.focus({ preventScroll: true }); }
  }
  function answerEndless(i, btn) {
    var c = E.cur; if (!c || c.pick != null) return;
    var q = c.q, ok = i === q.answer;
    FX('select', { el: btn });
    c.pick = i; E.answered++; if (ok) { E.correct++; E.streak++; } else E.streak = 0;
    ctl.select(c.stop);
    panel.querySelector('.dj-opts').outerHTML = '<div class="dj-opts" role="group" aria-label="Answers">' + optionsHtml(q, i) + '</div>';
    panel.querySelector('.dj-q').insertAdjacentHTML('beforeend', feedbackHtml(q, i, 'Next question', ''));
    FX(ok ? 'correct' : 'wrong', { el: panel.querySelector('.dj-opt[data-i="' + i + '"]') });
    if (!ok) FX('reveal', { el: panel.querySelector('.dj-opt[data-i="' + q.answer + '"]') });
    hud.innerHTML = endlessHud();
    if (ok && E.streak >= 3 && E.streak % 3 === 0) FX('streak', { el: document.getElementById('dj-es'), n: E.streak });
    say((ok ? 'Correct. ' : 'Not quite. The answer is ' + q.options[q.answer] + '. ') + q.explain);
    var nx = document.getElementById('dj-next'); nx.focus({ preventScroll: true });
    try { document.getElementById('dj-fb').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) {}
  }
  function renderExhausted(total) {
    setNow(''); panel.classList.remove('is-travel');
    var where = E.scope.stop ? stopName(E.scope.stop) : 'all of DC', per = E.scope.period ? ' in period ' + E.scope.period : '';
    hud.innerHTML = '<button class="dj-back" type="button" data-act="stops" aria-label="Back to the list of stops">' + CHEV + '<span>Stops</span></button><div class="dj-prog"><div class="dj-step"><b>' + esc(E.scope.stop ? stopsById[E.scope.stop].short : 'All of DC') + '</b></div><div class="dj-sub"><span class="num">' + E.correct + '</span> correct of <span class="num">' + E.answered + '</span></div></div><div class="dj-left"><span class="num">0</span> left</div>';
    panel.innerHTML = '<section class="dj-card"><h2>You have seen every question here</h2><p>' + total + (total === 1 ? ' question' : ' questions') + ' at ' + esc(where) + esc(per) + ', all answered. Start them over, or visit another stop.</p>' +
      '<div class="dj-row"><button class="btn red" type="button" data-act="reset-scope">Start this stop over</button><button class="btn ghost" type="button" data-act="stops">Choose another stop</button></div></section>';
    say('You have seen every question here.');
    scrollStageIntoView();
  }
  function resetScope(scope) {
    Core.scopePool(pool, scope).forEach(function (q) { delete seen[q.id]; }); saveSeen();
  }

  /* ---------- events ---------- */
  function cancelBusy() { busy = false; panel && panel.classList.remove('is-travel'); }
  function onPanelClick(e) {
    var t = e.target.closest ? e.target.closest('button,a') : null; if (!t) return;
    var opt = t.classList.contains('dj-opt') ? t : null;
    if (opt && view === 'play' && !busy) { var i = +opt.getAttribute('data-i'); if (E && stage.getAttribute('data-mode') === 'explore') answerEndless(i, opt); else answerJourney(i, opt); return; }
    if (t.id === 'dj-next' && !busy) { if (stage.getAttribute('data-mode') === 'explore') { FX('next', { el: t }); nextEndless(false); } else nextJourney(t); return; }
    var act = t.getAttribute('data-act'); if (!act) return;
    if (act === 'daily') startDaily();
    else if (act === 'explore') renderPicker();
    else if (act === 'sheet') openSheet();
    else if (act === 'home') renderIntro();
    else if (act === 'stops') renderPicker();
    else if (act === 'pick') selectStop(t.getAttribute('data-stop') || null, false);
    else if (act === 'visit') startEndless();
    else if (act === 'reset-scope') { resetScope(E.scope); nextEndless(true); }
    else if (act === 'reset-all') {
      if (t.getAttribute('data-sure') === '1') { seen = {}; saveSeen(); t.removeAttribute('data-sure'); t.textContent = 'Forget which questions I have seen'; fillList(); if (window.SIN && SIN.toast) SIN.toast('Seen list cleared'); }
      else { t.setAttribute('data-sure', '1'); t.textContent = 'Tap again to clear'; setTimeout(function () { if (t.getAttribute('data-sure') === '1') { t.removeAttribute('data-sure'); t.textContent = 'Forget which questions I have seen'; } }, 4000); }
    }
  }
  $sheet.addEventListener('click', function (e) {
    if (e.target === $sheet) return closeSheet();
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'close-sheet') closeSheet();
    else if (act === 'share') doShare(); else if (act === 'copy') doShare(false);
    else if (act === 'explore-sheet') { closeSheet(); renderPicker(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || $sheet.open || view !== 'play' || busy) return;
    var tg = e.target; if (tg && /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName)) return;
    var k = e.key, mode = stage.getAttribute('data-mode');
    var answering = mode === 'explore' ? (E && E.cur && E.cur.pick == null) : (S && S.phase === 'q');
    if (answering && k >= '1' && k <= '4') {
      var b = panel.querySelector('.dj-opt[data-i="' + (+k - 1) + '"]'); if (b) { e.preventDefault(); b.click(); }
    } else if (!answering && k === 'Enter' && !(tg && tg.closest && tg.closest('button,a,select'))) {
      var nx = document.getElementById('dj-next'); if (nx) { e.preventDefault(); nx.click(); }
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && (view === 'intro' || view === 'done') && Core.dateStr() !== introDate) renderIntro();   // the day rolled over while the page was open
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted && (view === 'intro')) renderIntro(); });

  /* ---------- boot ---------- */
  if (/[?&]reset(=|&|$)/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {   // developer helper: only on this PC, never on the public site
    drop(KEY_DAILY); drop(KEY_SEEN); drop(KEY_SCOPE);
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  }
  loadAll().then(function (r) {
    stops = r.stops; pool = r.pool;
    stops.forEach(function (s) { stopsById[s.id] = s; });
    pool.forEach(function (q) { byId[q.id] = q; });
    loadSeen();
    buildShell();
    renderIntro();
  }).catch(function () {
    $game.setAttribute('aria-busy', 'false');
    $game.innerHTML = '<div class="empty">The map could not be loaded. Please reload the page.</div>';
  });
})();
