#!/usr/bin/env node
/* List the Dark Horse questions of the next N days' daily sets (the real dailySet() from games/dark-horse/trivia.js on the current index.json),
   so answer work can start with what players will actually see. Usage: node site/tools/dh-upcoming.js [days=30] [--from YYYY-MM-DD] [--ids] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse');
const SRC = fs.readFileSync(path.join(DIR, 'trivia.js'), 'utf8');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'index.json'), 'utf8'));
const args = process.argv.slice(2);
const days = +(args.find(a => /^\d+$/.test(a)) || 30);
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : new Date().toISOString().slice(0, 10);
// a do-nothing browser: enough for trivia.js to load and hand over its internals through __DH_EXPOSE
const noop = () => {}, el = () => ({ style: {}, classList: { toggle: noop, add: noop, remove: noop }, addEventListener: noop, setAttribute: noop, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], focus: noop });
let api;
const win = { document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  location: { search: '', origin: 'http://x', pathname: '/' }, history: { replaceState: noop }, addEventListener: noop, scrollTo: noop, navigator: {},
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, fetch: () => new Promise(noop), __DH_EXPOSE: a => { api = a; } };
win.window = win;
vm.runInNewContext(SRC, Object.assign(win, { document: win.document, location: win.location, localStorage: win.localStorage }));
const pool = idx.q.map(r => ({ id: r.id, category: r.c, difficulty: r.d, prompt: r.p || '', n: r.n || 0, broad: !!r.b, f: r.f }));
const count = {}, first = {};
for (let i = 0; i < days; i++) {
  const d = new Date(Date.parse(from + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
  const set = api.dailySet(pool, d) || [];
  set.forEach(q => { count[q.id] = (count[q.id] || 0) + 1; if (!first[q.id]) first[q.id] = d; });
  if (!args.includes('--ids')) console.log(d + '  ' + set.map(q => q.id).join(' '));
}
const ids = Object.keys(count).sort((a, b) => first[a] < first[b] ? -1 : 1);
if (args.includes('--ids')) ids.forEach(id => { const r = pool.find(p => p.id === id); console.log(`${id}\t${first[id]}\t${r.n}\t${r.prompt}`); });
else console.log(`${ids.length} distinct questions in ${days} days from ${from}`);
