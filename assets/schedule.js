/* Daily Political Trivia: the admin's daily schedule (data/schedule.json, written by the /admin/ page).
   A game asks for its entry for a date; when there is none (or the file is missing, slow or broken) the game uses its
   normal automatic pick. Nothing here ever throws or delays a game by more than about 2.5 seconds.
   File shape: {"v":1,"days":{"YYYY-MM-DD":{"grid":{"rows":[k,k,k],"cols":[k,k,k]},"darkhorse":[id x7],"caucus":"c0040",
                                            "climb":[{"q":id,"s":stopId}, ...]}}}
   Every entry is still checked by the game itself (unknown ids = automatic pick), because this file is input like any other. */
(function () {
  'use strict';
  var URL_ = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return new URL('../data/schedule.json', s).href; } catch (e) {}
    return null;
  })();
  var data = null, done = false, waiters = [];
  function finish(d) {
    if (done) return; done = true;
    data = d && typeof d === 'object' && d.v === 1 && d.days && typeof d.days === 'object' ? d.days : null;
    var w = waiters; waiters = [];
    w.forEach(function (f) { try { f(); } catch (e) {} });
  }
  try {
    if (!URL_ || typeof fetch !== 'function') finish(null);
    else {
      setTimeout(function () { finish(null); }, 2500);
      fetch(URL_, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(finish, function () { finish(null); });
    }
  } catch (e) { finish(null); }

  function entry(game, date) {
    if (!data || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    var day = Object.prototype.hasOwnProperty.call(data, date) ? data[date] : null;
    if (!day || typeof day !== 'object') return null;
    return Object.prototype.hasOwnProperty.call(day, game) ? day[game] : null;
  }
  window.SIN_SCHEDULE = {
    /* calls f once the file has loaded (or failed); immediately if that already happened */
    ready: function (f) { if (done) { try { f(); } catch (e) {} } else waiters.push(f); },
    /* the raw entry for one game and date, or null. Only meaningful after ready(). */
    get: entry
  };
})();
