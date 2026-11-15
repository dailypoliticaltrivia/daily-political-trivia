#!/usr/bin/env node
/* Daily Political Trivia - XSS test: a corpus of attack strings is pushed through the real rendering code and the
   OUTPUT HTML is checked to be inert (only known tags, no on* attributes, no script/data/javascript addresses).
   Usage:  node tools/test-xss.js [--site-js path/to/site.js] [--md-js path/to/md.js]
     Part A (no packages): opinions/md.js (posts, comments), SIN.esc / SIN.safeHttp from assets/site.js and the
             games hub renderer (assets/hub.js), run in a minimal fake browser (vm sandbox).
   Exit code 1 if anything is not inert. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const mdJsOpt = opt('--md-js');
const siteJsPath = path.resolve(opt('--site-js') || path.join(__dirname, '..', 'assets', 'site.js'));
const siteRoot = path.resolve(__dirname, '..');
const mdJsPath = mdJsOpt ? path.resolve(mdJsOpt) : path.join(siteRoot, 'opinions', 'md.js');

/* ---------------- attack corpus ---------------- */
const NUL = String.fromCharCode(0);
const PAYLOADS = [
  '<script>alert(1)</script>', '<SCRIPT SRC=//evil.example/x.js></SCRIPT>', '<img src=x onerror=alert(1)>', '"><img src=x onerror=alert(1)>',
  "'><svg/onload=alert(1)>", '<svg><script>alert(1)</script></svg>', '<iframe src="javascript:alert(1)"></iframe>', '<body onload=alert(1)>',
  '<a href="javascript:alert(1)">x</a>', '<a href=" javascript:alert(1)">x</a>', '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">',
  '<details open ontoggle=alert(1)>', '<input autofocus onfocus=alert(1)>', '<style>@import "javascript:alert(1)"</style>', '<meta http-equiv=refresh content="0;url=javascript:alert(1)">',
  '<scr' + NUL + 'ipt>alert(1)</scr' + NUL + 'ipt>', '&lt;script&gt;alert(1)&lt;/script&gt;', '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;', '&amp;lt;script&amp;gt;', '\uFF1Cscript\uFF1Ealert(1)\uFF1C/script\uFF1E',
  '[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x]( javascript:alert(1))', '[x](java&#115;cript:alert(1))', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[x](vbscript:msgbox(1))', '[x](//evil.example)', '[x](http://a.example"onmouseover="alert(1))', "[x](http://a.example'onmouseover='alert(1))", '[x](<javascript:alert(1)>)', '[x](http://a.example/<script>alert(1)</script>)',
  '[<img src=x onerror=alert(1)>](http://a.example)', '[[x](http://a.example)](http://b.example)', '![x](javascript:alert(1))', '![x](http://a.example/x.png"onerror="alert(1))', '![](x" onerror="alert(1))',
  'http://a.example/"onmouseover="alert(1)', 'https://a.example/&quot;onmouseover=&quot;alert(1)', 'http://a.example/<script>alert(1)</script>', 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
  '**<img src=x onerror=alert(1)>**', '*<img src=x onerror=alert(1)>*', '__<script>alert(1)</script>__', '`<script>alert(1)</script>`', '```\n<script>alert(1)</script>\n```', '# <script>alert(1)</script>', '> <img src=x onerror=alert(1)>',
  '- <img src=x onerror=alert(1)>', '1. <svg onload=alert(1)>', '<a href="http://a.example" onclick="alert(1)">x</a>', '<div style="background:url(javascript:alert(1))">x</div>', '{{constructor.constructor("alert(1)")()}}',
  '${alert(1)}', '</textarea><script>alert(1)</script>', '</title><script>alert(1)</script>', '<!--', '<![CDATA[<script>alert(1)</script>]]>', '\u202Ejavascript:alert(1)', 'x\u0000<img src=x onerror=alert(1)>'
];

/* ---------------- output checker ---------------- */
function decodeEntities(s) {
  return s.replace(/&#x([0-9a-f]+);?/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);?/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&(lt|gt|quot|amp|apos|colon|tab|newline);/gi, (m, n) => ({ lt: '<', gt: '>', quot: '"', amp: '&', apos: "'", colon: ':', tab: '\t', newline: '\n' }[n.toLowerCase()]));
}
function* tags(html) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let m, last = 0;
  while ((m = re.exec(html))) {
    yield { text: html.slice(last, m.index), closing: !!m[1], name: m[2].toLowerCase(), attrs: m[3] || '' };
    last = re.lastIndex;
  }
  yield { text: html.slice(last), end: true };
}
function attrsOf(s) {
  const o = []; const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g; let m;
  while ((m = re.exec(s))) o.push([m[1].toLowerCase(), m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || '']);
  return o;
}
/* allowed: tag -> allowed attributes. Anything else is a failure. */
function inert(html, allow, label) {
  const problems = [];
  for (const t of tags(html)) {
    if (/[<>]/.test(decodeEntities(t.text).replace(/&/g, '')) && /<[a-zA-Z\/!]/.test(t.text)) problems.push('raw "<" in text: ' + t.text.slice(0, 60));
    if (t.end) continue;
    const a = allow[t.name];
    if (!a) { problems.push('tag <' + t.name + '> not allowed'); continue; }
    if (t.closing) continue;
    for (const [k, v] of attrsOf(t.attrs)) {
      if (k.startsWith('on')) problems.push('event handler ' + k + ' on <' + t.name + '>');
      else if (!a.includes(k)) problems.push('attribute ' + k + ' not allowed on <' + t.name + '>');
      if (k === 'href' || k === 'src') {
        const d = decodeEntities(v).replace(/[\u0000- \u007f-\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/g, '').toLowerCase();
        if (!/^(https?:\/\/[^\s"<>]+|#|[a-z0-9_.\/-]+\.html(\?[\w=&%.-]*)?|\.\.\/[\w\/.?=&%-]*)$/.test(d) && !(d === '')) problems.push(k + ' has unsafe value: ' + v.slice(0, 60));
      }
      if (k === 'target' && v === '_blank' && !/noopener/.test((attrsOf(t.attrs).find((x) => x[0] === 'rel') || [0, ''])[1])) problems.push('target=_blank without noopener');
    }
  }
  return problems.map((p) => label + ': ' + p);
}

let failures = 0, checks = 0;
function expectInert(html, allow, label) {
  checks++;
  const p = inert(html, allow, label);
  if (p.length) { failures++; console.log('FAIL  ' + p[0] + '\n      output: ' + html.slice(0, 160).replace(/\n/g, ' ')); }
}
function expect(cond, label) { checks++; if (!cond) { failures++; console.log('FAIL  ' + label); } }

/* ---------------- Part A1: md.js ---------------- */
{
  const sb = { window: {} }; sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(mdJsPath, 'utf8'), sb);
  const M = sb.SINMd;
  const MD_ALLOW = { p: [], h2: [], h3: [], h4: [], strong: [], em: [], a: ['href', 'rel', 'target'], blockquote: [], ul: [], ol: [], li: [], pre: [], code: [], hr: [], br: [] };
  for (const p of PAYLOADS) {
    expectInert(M.render(p), MD_ALLOW, 'md.render(' + JSON.stringify(p.slice(0, 40)) + ')');
    expectInert(M.comment(p), MD_ALLOW, 'md.comment(' + JSON.stringify(p.slice(0, 40)) + ')');
    expectInert(M.inline(p), MD_ALLOW, 'md.inline(' + JSON.stringify(p.slice(0, 40)) + ')');
    expectInert(M.render('# ' + p + '\n\n> ' + p + '\n\n- ' + p + '\n\ntext ' + p + ' **' + p + '**'), MD_ALLOW, 'md.render(wrapped ' + JSON.stringify(p.slice(0, 30)) + ')');
  }
  expect(/href="https:\/\/ok\.example\/a\?b=1&amp;c=2"/.test(M.render('[go](https://ok.example/a?b=1&c=2)')), 'normal https link still works');
  expect(/rel="nofollow ugc noopener"/.test(M.render('see https://ok.example now')), 'bare link gets rel');
  /* speed: hostile inputs must not freeze the browser (regex backtracking) */
  const heavy = ['*'.repeat(60000), '**a' + ' '.repeat(60000), '_'.repeat(60000), '[' .repeat(30000), '`'.repeat(60000), '> '.repeat(30000) + 'x', '- '.repeat(30000) + 'x', 'http://' + 'a'.repeat(100000), '[x](' + 'a'.repeat(100000) + ')', ('**a ').repeat(15000), ('* a ').repeat(15000), '<'.repeat(100000)];
  for (const h of heavy) {
    const t0 = Date.now(); let ok = true; try { M.render(h); M.comment(h); } catch (e) { ok = false; }
    const ms = Date.now() - t0; expect(ok && ms < 1500, 'speed: ' + JSON.stringify(h.slice(0, 14)) + '... took ' + ms + ' ms' + (ok ? '' : ' (threw)'));
  }
}

/* ---------------- Part A2: site.js helpers in a fake browser ---------------- */
function loadSite() {
  const el = () => new Proxy(function () {}, {
    get: (t, k) => { if (k === 'dataset') return {}; if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false }; if (k === 'querySelector' || k === 'closest' || k === 'getElementById') return () => el(); if (k === 'style') return {}; if (k === Symbol.toPrimitive) return () => ''; if (k === 'src') return ''; return typeof k === 'string' && /^(innerHTML|textContent|href|id|className|value|title)$/.test(k) ? '' : el(); },
    set: () => true, apply: () => el()
  });
  const doc = { currentScript: { src: 'https://site.example/assets/site.js' }, body: Object.assign(el(), { dataset: { section: 'games' } }), head: el(), documentElement: { dataset: {}, style: {} }, createElement: () => el(), getElementById: () => el(), addEventListener() {}, querySelector: () => null, scripts: [], hidden: false };
  const sb = { document: doc, location: { hostname: 'site.example', protocol: 'https:', origin: 'https://site.example', search: '' }, localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false }), setInterval() {}, setTimeout, clearTimeout, URL, Date, Math, console, fetch: () => Promise.reject(new Error('no net')), navigator: {}, history: {}, Intl };
  sb.window = sb; sb.window.top = sb; sb.self = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(siteJsPath, 'utf8'), sb);
  return sb.SIN;
}
const SIN = loadSite();
{
  expect(SIN.esc('<>"\'&') === '&lt;&gt;&quot;&#39;&amp;', 'SIN.esc escapes the five special characters');
  for (const p of PAYLOADS) {
    expectInert('<p>' + SIN.esc(p) + '</p>', { p: [] }, 'SIN.esc(' + JSON.stringify(p.slice(0, 30)) + ')');
    expectInert('<a href="' + SIN.esc(SIN.safeHttp(p)) + '">x</a>', { a: ['href'] }, 'SIN.safeHttp(' + JSON.stringify(p.slice(0, 30)) + ')');
  }
  expect(SIN.safeHttp('javascript:alert(1)') === '#', 'safeHttp refuses javascript:');
  expect(SIN.safeHttp('https://ok.example/a?b=1') === 'https://ok.example/a?b=1', 'safeHttp keeps a normal https link');
}

/* ---------------- Part A3: the games hub renderer (assets/hub.js) with a hostile games.json ---------------- */
async function hubTest() {
  const HUB_ALLOW = { ul: ['class'], li: ['class', 'style'], a: ['class', 'data-game', 'data-state', 'href'], span: ['class'], p: ['class'], svg: ['width', 'height', 'viewbox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden'], path: ['d'] };
  const hubSrc = fs.readFileSync(path.join(siteRoot, 'assets', 'hub.js'), 'utf8');
  for (const p of PAYLOADS) {
    const box = { innerHTML: '', classList: { add() {} } };
    const games = [{ slug: 'a', title: p, tagline: p, pitch: p, url: p, status: 'live', art: 'grid' }, { slug: 'b', title: 'ok', tagline: p, url: 'x/', status: 'live', art: 'trivia' }, { slug: 'c', title: p, status: 'soon' }];
    const sb = { SIN, document: { getElementById: (id) => (id === 'hub' ? box : null) }, window: null, localStorage: { getItem: () => null }, location: { reload() {} }, Promise, JSON, Date, Array,
      fetch: (u) => Promise.resolve(String(u).endsWith('games.json') ? { ok: true, json: () => Promise.resolve(games) } : { ok: false, text: () => Promise.resolve('') }) };
    sb.window = { addEventListener() {} }; vm.createContext(sb); sb.window.SIN = SIN;
    vm.runInContext(hubSrc, sb);
    await new Promise((r) => setTimeout(r, 5));
    expect(box.innerHTML.length > 0, 'hub rendered something for ' + JSON.stringify(p.slice(0, 20)));
    expectInert(box.innerHTML, HUB_ALLOW, 'hub.js with hostile games.json ' + JSON.stringify(p.slice(0, 30)));
  }
}

(async () => {
  await hubTest();
  console.log('(Part B, the jsdom page test, was removed with the News pages.)');
  console.log(String.fromCharCode(10)+'XSS test (' + path.relative(siteRoot, siteJsPath) + '): ' + checks + ' checks, ' + failures + ' failure(s).');
  process.exit(failures ? 1 : 0);
})();
