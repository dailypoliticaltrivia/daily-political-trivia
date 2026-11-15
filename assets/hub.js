/* Games hub: today's daily games with their state ("Play", "Continue", "Done today"), shared by the home page and games/index.html.
   Usage: <div id="hub"></div> ... <script src="assets/site.js"></script><script src="assets/hub.js"></script>
   Reads games/games.json (the single list of games) and each game's own saved-progress key from localStorage, READ ONLY and always inside
   try/catch: nothing here writes anything or changes how a game behaves.
   Saved-progress keys (same ones the games use):
     Congressional Grid   cg-YYYY-MM-DD     {cells:[9], left}            done = left <= 0 or all nine squares filled
     Dark Horse sin.politrivia.v1 {v:2, mode:'daily', date, phase}   done = phase 'done' for today's daily game
     Caucus Sort          caucus.v1.day.YYYY-MM-DD   JSON {over, solved, guesses}   done = over is set
     Capitol Climb           sin.dcj.v1.daily   {v:1, mode:'daily', date, phase, res[]}   done = phase 'done' for today; in progress once any stop is answered
   (local date, like the games). */
(function () {
  'use strict';
  var SIN = window.SIN;
  var box = document.getElementById('hub');
  if (!SIN || !box) return;
  var esc = SIN.esc;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function read(key) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  var hd = document.getElementById('hubDate');
  if (hd) hd.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  var STATE = {
    grid: function (day) {
      var s = read('cg-' + day); if (!s || !Array.isArray(s.cells)) return 'new';
      if (s.left <= 0 || s.cells.every(Boolean)) return 'done';
      return (s.cells.some(Boolean) || s.left < 9) ? 'resume' : 'new';
    },
    trivia: function (day) {
      var s = read('sin.politrivia.v1'); if (!s || s.v !== 2 || s.date !== day || s.mode !== 'daily') return 'new';
      return s.phase === 'done' ? 'done' : 'resume';
    },
    'caucus-sort': function (day) {
      var s = read('caucus.v1.day.' + day); if (!s || typeof s !== 'object') return 'new';
      if (s.over) return 'done';
      return ((s.solved && s.solved.length) || (s.guesses && s.guesses.length)) ? 'resume' : 'new';
    },
    'dc-journey': function (day) {
      var s = read('sin.dcj.v1.daily'); if (!s || s.v !== 1 || s.date !== day || s.mode !== 'daily') return 'new';
      if (s.phase === 'done') return 'done';
      return (Array.isArray(s.res) && s.res.some(function (r) { return r === 0 || r === 1; })) ? 'resume' : 'new';
    }
  };
  function countdown(el) {
    if (!el) return;
    function tick() {
      var now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), ms = next - now;
      if (ms <= 1000) { location.reload(); return; }
      var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
      el.textContent = 'New puzzles in ' + (h ? h + 'h ' : '') + m + 'm.';
    }
    tick(); var t = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInterval(t); } else { tick(); clearInterval(t); t = setInterval(tick, 20000); } });
  }
  var LABEL = { new: 'Play today’s puzzle', resume: 'Continue', done: 'See results' };
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

  function art(k) {
    return fetch(SIN.url('assets/logos/' + k + '.svg')).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      return t.replace(/<svg /, '<svg aria-hidden="true" focusable="false" ').replace(/ role="img"| aria-label="[^"]*"/g, '');
    }).catch(function () { return ''; });
  }

  fetch(SIN.url('games/games.json')).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (list) {
    var live = list.filter(function (g) { return g.status === 'live' && g.url; });
    var soon = list.some(function (g) { return g.status !== 'live'; });
    var day = dateKey();
    return Promise.all(live.map(function (g) { return art(g.art); })).then(function (svgs) {
      var done = 0;
      var html = live.map(function (g, i) {
        var st = (STATE[g.art] ? STATE[g.art](day) : 'new'); if (st === 'done') done++;
        var href = SIN.url('games/' + g.url);
        return '<li class="hli" style="--i:' + i + '"><a class="hcard" data-game="' + esc(String(g.art).replace(/[^a-z-]/g, '')) + '" data-state="' + st + '" href="' + esc(href) + '">' +
          '<span class="hart">' + (svgs[i] || '') + '</span>' +
          '<span class="hmain"><span class="hname">' + esc(g.title) + '</span>' +
          '<span class="hpitch">' + esc(g.pitch || g.tagline) + '</span></span>' +
          '<span class="hgo">' + (st === 'done' ? '<span class="hdone">' + CHECK + ' Done today</span>' : (st === 'resume' ? '<span class="hdone hpart">In progress</span>' : '')) +
          '<span class="hbtn' + (st === 'done' ? ' ghost' : '') + '">' + LABEL[st] + '</span></span></a></li>';
      }).join('');
      box.innerHTML = '<ul class="hcards">' + html + '</ul>' + (soon ? '<p class="hsoon">More daily games are on the way.</p>' : '');
      box.classList.add('ready');
      var sum = document.getElementById('hubSummary');
      if (sum) {
        var pips = live.map(function (g) { var st = STATE[g.art] ? STATE[g.art](day) : 'new'; return '<i class="hpip" data-game="' + esc(String(g.art).replace(/[^a-z-]/g, '')) + '" data-state="' + st + '" aria-hidden="true"></i>'; }).join('');
        var all = done === live.length && live.length;
        sum.innerHTML = '<span class="hprog" aria-hidden="true">' + pips + '</span><span class="htxt">' + (all ? 'All ' + live.length + ' played today.' : done + ' of ' + live.length + ' played today') + '</span>' +
          (all ? ' <span class="hcount" id="hubCount"></span>' : '');
        if (all) countdown(document.getElementById('hubCount'));
      }
    });
  }).catch(function () {
    box.innerHTML = '<p class="empty">The games could not be loaded. Please reload the page.</p>';
  });
  // coming back with the browser's Back button restores an old page: reload so "Done today" is current
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
})();
