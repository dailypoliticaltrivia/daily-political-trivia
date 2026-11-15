// Counts real content from the game data files and writes assets/home-stats.json,
// then refreshes the "by the numbers" figures in index.html (between the home-stats markers).
// Run from site/:  node tools/home-stats.js   (re-run after adding questions or puzzles)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = path.join(__dirname, '..', 'games');
const rj = p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8'));
const fmt = n => n.toLocaleString('en-US');

function bankTotal(dir) {
  return rj(dir + '/data/manifest.json').banks.reduce((n, b) => n + rj(dir + '/data/' + b).questions.length, 0);
}
function loadWin(p) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(G, p), 'utf8'), ctx); return ctx.window;
}
const members = loadWin('congressional-grid/data/members.js').MEMBERS;
const presidents = loadWin('congressional-grid/data/presidents.js').PRESIDENTS;
const stats = {
  generated: new Date().toISOString().slice(0, 10),
  members: members.length,
  presidents: presidents.length,
  darkHorseQuestions: (() => { try { return JSON.parse(fs.readFileSync(path.join(G, 'dark-horse', 'data', 'index.json'), 'utf8')).count; } catch (e) { return bankTotal('dark-horse'); } })(),   // only questions the game actually plays (100+ answers)
  caucusPuzzles: rj('caucus-sort/data/puzzles.json').puzzles.length,
  climbQuestions: bankTotal('capitol-climb'),
  climbStops: rj('capitol-climb/data/stops.json').stops.length
};
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'home-stats.json'), JSON.stringify(stats, null, 1) + '\n');

const items = [
  [stats.members, 'members of Congress in Congressional Grid'],
  [stats.darkHorseQuestions, 'questions in Dark Horse'],
  [stats.caucusPuzzles, 'puzzles in Caucus Sort'],
  [stats.climbQuestions, 'history questions in Capitol Climb']
];
const html = '<!-- home-stats:start (written by tools/home-stats.js) -->\n<dl class="nums">' +
  items.map(([n, l]) => '<div><dt>' + fmt(n) + '</dt><dd>' + l + '</dd></div>').join('') +
  '</dl>\n<!-- home-stats:end -->';
const f = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(f, 'utf8');
const re = /<!-- home-stats:start[\s\S]*?<!-- home-stats:end -->/;
if (re.test(s)) { fs.writeFileSync(f, s.replace(re, () => html)); console.log('index.html updated'); }
else console.log('markers not found in index.html');
console.log(stats);
