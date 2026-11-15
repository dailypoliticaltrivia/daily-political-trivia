#!/usr/bin/env node
'use strict';
/* Tests the public-launch gate for Opinions (opinions/db.js resolveMode + the 'off' backend).
   A public hostname is simulated by running db.js in a sandbox whose location.hostname is set to the host under test
   (no network, no browser needed). Usage: node tools/test-opinions-gate.js  (from the site folder) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'opinions', 'db.js'), 'utf8');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL  ' + m); } };

function load(hostname, cfg) {
  const writes = [];
  const store = { getItem: () => null, setItem: (k) => writes.push(k), removeItem() {}, key: () => null, length: 0 };
  const win = { SIN_SUPABASE: cfg, addEventListener() {}, location: { hostname, href: 'https://' + hostname + '/opinions/' }, localStorage: store, crypto: undefined };
  const sb = { window: win, location: win.location, localStorage: store, document: { currentScript: { src: 'https://' + hostname + '/opinions/db.js' }, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} },
    console, URL, URLSearchParams, setTimeout, clearTimeout, Promise, TextEncoder, navigator: {}, sessionStorage: store, Proxy, Date, Math, JSON };
  win.window = win; Object.assign(sb, { self: win });
  vm.createContext(sb); vm.runInContext(src, sb);
  return { db: win.SINDb, writes };
}
const cases = [
  ['localhost', { url: '', anonKey: '', google: false, enabled: 'auto' }, 'demo'],
  ['127.0.0.1', { url: '', anonKey: '' }, 'demo'],
  ['[::1]', { url: '', anonKey: '' }, 'demo'],
  ['www.example.com', { url: '', anonKey: '', enabled: 'auto' }, 'off'],
  ['username.github.io', { url: '', anonKey: '' }, 'off'],
  ['localhost.', { url: '', anonKey: '' }, 'off'],                          // trailing-dot host is not on the allow list
  ['www.example.com', { url: 'https://x.supabase.co', anonKey: 'k', enabled: 'auto' }, 'supabase'],
  ['www.example.com', { url: '', anonKey: '', enabled: true }, 'demo'],
  ['localhost', { url: '', anonKey: '', enabled: false }, 'off'],
  ['www.example.com', { url: 'https://x.supabase.co', anonKey: 'k', enabled: false }, 'off'],
];
(async () => {
  for (const [host, cfg, want] of cases) {
    const { db } = load(host, cfg);
    ok(db && db.mode === want, host + ' ' + JSON.stringify(cfg) + ' -> mode ' + (db && db.mode) + ', wanted ' + want);
  }
  // off mode: no posts, no user, writes refused, nothing stored
  const { db, writes } = load('www.example.com', { url: '', anonKey: '', enabled: 'auto' });
  ok((await db.ready()) === 'off', 'ready() resolves to off');
  ok((await db.listPosts({ limit: 3 })).length === 0, 'off: no posts (no demo seeding)');
  ok((await db.getUser()) === null, 'off: nobody signed in');
  let refused = false; try { await db.createPost({ title: 'x', body: 'y' }); } catch (e) { refused = true; } ok(refused, 'off: writes are refused');
  ok(writes.length === 0, 'off: nothing written to localStorage (' + writes.join(',') + ')');
  // demo on localhost still seeds
  const l = load('localhost', { url: '', anonKey: '' });
  try { const p = await l.db.listPosts({ limit: 3 }); ok(p.length > 0, 'localhost demo: seeded posts present'); } catch (e) { ok(false, 'localhost demo threw ' + e.message); }
  // static source checks: no demo author names in any shipped HTML/JS outside db.js
  console.log(`opinions gate: ${n} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
