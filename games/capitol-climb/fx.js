/* Capitol Climb: feedback effects. THE ONLY HOOK the game calls:   DCJ_FX(type, {el, n})
   It forwards to the shared effects module (site/assets/fx.js, window.SINFX; how it works: site/assets/FX.md). A missing shared file changes nothing.
   Types and where they fire:
     'select'      an answer was just chosen (el = the option button)
     'correct'     the answer was right (el = the chosen option button)
     'wrong'       the answer was wrong (el = the chosen option button)
     'reveal'      the right option is shown after a wrong answer (el = the correct option button)
     'heart-lost'  a heart was lost (el = the heart element in the top bar)
     'travel'      the pin starts moving to the next stop (el = the map band)      (no effect)
     'arrive'      the pin has arrived (el = the map band)
     'next'        the player pressed Next (el = the button)                        (no effect)
     'win'         the route was finished (el = the results sheet)
     'lose'        the last heart is gone (el = the results sheet)
     'sheet'       the results sheet opened (el = the sheet)
     'streak'      endless mode streak reached n (el = the streak counter, n = streak length)
   SINFX handles reduced motion, the Effects and Sound switches and vibration itself. */
(function () {
  'use strict';
  var MAP = {
    select:       ['tap',      { visual: false }],          // sound only: the option already has its own lift
    correct:      ['correct',  { intensity: 0.55 }],
    wrong:        ['wrong',    {}],
    reveal:       ['reveal',   {}],                         // the right option after a wrong answer
    'heart-lost': ['lifeLost', {}],
    arrive:       ['solve',    { color: '#1f8a4c' }],       // pin arrived: el = map band; colour wipes across it
    win:          ['win',      { intensity: 1 }],
    lose:         ['lose',     {}],
    sheet:        ['reveal',   { dy: 14, ms: 280 }],
    streak:       ['levelUp',  {}]
  };
  function fx(type, o) {
    o = o || {};
    try {
      var m = MAP[type]; if (!m || !window.SINFX) return;
      var opts = { el: o.el }; for (var k in m[1]) opts[k] = m[1][k];
      SINFX.play(m[0], opts);
      if (type === 'streak' && o.n >= 5) SINFX.play('rare', { el: o.el, intensity: Math.min(1, o.n / 12) });
    } catch (e) { /* effects are optional */ }
  }
  window.DCJ_FX = fx;
})();
