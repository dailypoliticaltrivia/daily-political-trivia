# SINFX: how a game hooks into the shared effects (for Capitol Climb)

Files: `site/assets/fx.js` and `site/assets/fx.css` (same-origin, no libraries, CSP-clean). Full rules and the effect language: `design-notes/FX.md`.

## 1. Load it

In the game page, after the game's own scripts and stylesheet:

```html
<link rel="stylesheet" href="../../assets/fx.css">   <!-- in <head>, after the game's css -->
...
<script src="../../assets/fx.js"></script>            <!-- last script on the page -->
```

Capitol Climb already has its own `fx.js`/`fx.css` next to `index.html` (the `DCJ_FX(type, {el, n})` hook). Keep that file as the single place the game calls, and make it forward to SINFX (section 4). The shared file adds a `window.SINFX` object; every class it uses is prefixed `sinfx-`, so it cannot clash with the game's `fx-*` classes.

## 2. Call it only through a guard

A missing file must never break a game. Use a helper, not bare calls:

```js
function sfx(type, o){ try { if (window.SINFX) SINFX.play(type, o); } catch (e) {} }
```

(Optional chaining `window.SINFX?.play(...)` is fine in code that already uses modern syntax; the helper above also works in old browsers.)

## 3. The API

`window.SINFX = { play(type, opts), setEnabled(bool), isEnabled(), setSound(bool), isSound(), burst(x, y, opts), countUp(el, to, ms), shake(el), pulse(el, color), flip(el), confetti(opts), ... }`

`play(type, opts)`: `type` is one of `tap, correct, wrong, near, rare, jackpot, solve, win, lose, lifeLost, reveal, levelUp`.
`opts`: `el` (target element), `els` (list of elements for shake/wiggle), `tier` (1-5, trivia style tiers, picks the colour), `color` (any CSS colour), `intensity` (0-1, size of the burst and pop), `x`/`y` (viewport pixels, instead of `el`), `visual:false` (sound/haptics only), `shake:false` (colour only, for elements that already shake).

| type | what it does | use it for |
|---|---|---|
| `tap` | soft ripple at the element (or x,y) and a tick | a plain press that needs a sound (buttons already get press feedback automatically) |
| `correct` | pop on `el`, ring in the tier/green colour; sparks only when `intensity >= .5` or `tier >= 4` | a right answer |
| `wrong` | gentle shake of `el`/`els` plus a red fade over `el` | a wrong answer |
| `near` | wiggle plus an amber fade, `msgEl` beats once | "so close" |
| `rare` | bigger pop, double ring, 14-46 gold sparks | a rare or hard answer |
| `jackpot` | edge glow, two rings, 56 confetti, `el` scales in (about 1.2 s in all) | a bonus or the Dark Horse |
| `solve` | `el` (a row/group) wipes in with `color`, its `.sym` pops, small burst | a stop or group completed |
| `win` | confetti (intensity >= .5) or a small burst, `el` scales in, edge glow | route finished, perfect result |
| `lose` | `el` slides in softly with a faint red fade, no particles | game over |
| `lifeLost` | the element cracks in two halves that fall and fade, soft thud | a heart lost |
| `reveal` | `el` slides up 12 px and fades in (`dy`, `delay`, `ms` optional) | the right option, sheets, screens |
| `levelUp` | pop, ring, 18 gold sparks | streak reached, new rank |

Helpers (all safe to call when effects are off): `SINFX.countUp(el, to, ms, from)` counts the first number in `el` while the real text stays final; `SINFX.pulse(el, null, {beatScale:1.14})` is a scale beat (no colour); `SINFX.crackFall(el)`, `SINFX.slideIn(el, {dy, delay, ms})`, `SINFX.staggerIn(list, gapMs)`, `SINFX.flip(el, midFn)`, `SINFX.confetti({intensity})`, `SINFX.burst(x, y, {count, colors, shape:'mix'|'dot'|'line', speed, gravity, life})`, `SINFX.snapshot(list)` + `SINFX.slideFrom(snap, list)` (slide re-rendered nodes in from their old positions), `SINFX.mountControls(parent, {only, labels})`.

## 4. Mapping for Capitol Climb's existing `DCJ_FX(type, {el, n})`

Put this in Capitol Climb's `fx.js` (replace the class-adding body, keep the vibration table or drop it, SINFX vibrates itself):

```js
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
function DCJ_FX(type, o) {
  o = o || {};
  var m = MAP[type]; if (!m || !window.SINFX) return;
  var opts = { el: o.el }; for (var k in m[1]) opts[k] = m[1][k];
  SINFX.play(m[0], opts);
  if (type === 'streak' && o.n >= 5) SINFX.play('rare', { el: o.el, intensity: Math.min(1, o.n / 12) });
}
window.DCJ_FX = DCJ_FX;
```

Extra spots worth wiring: when the results sheet shows the final score, `SINFX.countUp(scoreEl, score, 900, 0)`; when the player earns a perfect route, `SINFX.play('win', { el: titleEl, intensity: 1 })`; `travel` (pin moves) needs nothing. Add `<span class="sinfx-slot" data-sinfx-controls></span>` where the game has room in its header or menu: `fx.js` fills it with the Effects and Sound toggles (use `data-sinfx-controls="labels"` inside a sheet for labelled switches).

## 5. Rules the module enforces for you

Reduced motion = no particles, no shake, no big motion, only brief colour/opacity changes. Effects can be switched off by the player (`localStorage["sinfx.on"]`, default on); sound is off by default (`localStorage["sinfx.sound"]`), starts only after a tap, no audio files. Colour flashes are capped at 2 per second. Nothing runs while the tab is hidden. Decorative nodes are `aria-hidden`, never take taps or focus, and are removed after use. Nothing is announced to screen readers: keep your own `aria-live` text, effects add none.
