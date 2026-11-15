#!/usr/bin/env node
/* Daily Political Trivia - page security scanner.
   Usage:  node tools/check-security.js [folder] [--require-csp] [--quiet]
   Default folder = the website folder. Scans every .html page and every .js file (skipping vendor/, .taste-skill, node_modules).
   FAIL (exit 1):  inline event handlers (onclick=...), links with target="_blank" but no rel="noopener",
                   eval / new Function / document.write / string-based setTimeout, http:// resources (mixed content),
                   javascript: addresses in markup, and (with --require-csp) pages without a Content-Security-Policy tag.
   WARN:           innerHTML / outerHTML / insertAdjacentHTML sinks (each one is a place that needs escaping: the report
                   marks the ones whose line does not call an escaping helper), pages without a referrer-policy tag,
                   pages without a CSP tag, forms that post to another site, <script src> from outside without integrity.
   Plain Node, no packages. */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const REQUIRE_CSP = flag('--require-csp'), QUIET = flag('--quiet');
const root = path.resolve(argv[0] || path.join(__dirname, '..'));
const SKIP = new Set(['.git', 'node_modules', '.taste-skill', '.design-backup', 'vendor', 'shots', 'audit', 'people-db', 'photo-work', 'tmpx', 'deploy-site']);

const out = { fail: [], warn: [] };
const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
function add(kind, file, text, idx, msg) { out[kind].push(rel(file) + ':' + lineOf(text, idx) + '  ' + msg); }

function files(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) files(path.join(dir, e.name), acc); }
    else if (/\.(html?|js)$/i.test(e.name) && !/^test[-_.]|[-_.]test\.js$|^(build|validate|check|make|predeploy|deploy)-/.test(e.name) && !/[\\/]tools[\\/]/.test(path.join(dir, e.name))) acc.push(path.join(dir, e.name));
  }
  return acc;
}

const ESCAPERS = /\b(esc|SIN\.esc|OP\.esc|SINMd\.[a-z]+|encodeURIComponent|textContent)\b/;
for (const file of files(root, [])) {
  const text = fs.readFileSync(file, 'utf8');
  const isHtml = /\.html?$/i.test(file);
  if (text.length > 3e6) continue;

  if (isHtml) {
    for (const m of text.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=\s*["'][^"']*/gi)) add('fail', file, text, m.index, 'inline event handler "' + m[1] + '" (blocked by a strict CSP; use addEventListener)');
    for (const m of text.matchAll(/<a\b[^>]*>/gi)) {
      if (/target\s*=\s*["']?_blank/i.test(m[0]) && !/rel\s*=\s*["'][^"']*noopener/i.test(m[0])) add('fail', file, text, m.index, 'target="_blank" link without rel="noopener"');
    }
    for (const m of text.matchAll(/\b(?:src|href|action|data)\s*=\s*["']\s*(javascript:|data:text\/html|vbscript:)/gi)) add('fail', file, text, m.index, 'dangerous address scheme in markup: ' + m[1]);
    for (const m of text.matchAll(/<(?:script|img|link|iframe|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["'](http:\/\/(?!www\.w3\.org)[^"']+)/gi)) add('fail', file, text, m.index, 'mixed content (http://): ' + m[1]);
    for (const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi)) if (!/integrity\s*=/i.test(m[0])) add('warn', file, text, m.index, 'external script without integrity (SRI): ' + m[1]);
    for (const m of text.matchAll(/<form\b[^>]*\baction\s*=\s*["'](https?:\/\/[^"']+)/gi)) add('warn', file, text, m.index, 'form posts to another site: ' + m[1]);
    const head = (/<head[\s\S]*?<\/head>/i.exec(text) || [''])[0];
    if (!/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(head)) { if (REQUIRE_CSP) out.fail.push(rel(file) + '  no Content-Security-Policy meta tag'); else out.warn.push(rel(file) + '  no Content-Security-Policy meta tag (see security/APPLY.md)'); }
    // A CSP that is present must also be strict and must come before every script (a meta CSP does not cover what precedes it).
    const cspM = /<meta\s+http-equiv\s*=\s*["']Content-Security-Policy["']\s+content\s*=\s*"([^"]*)"/i.exec(head);
    if (cspM) {
      const pol = cspM[1].replace(/&quot;/g, '"'), dir = (n) => ((new RegExp('(?:^|;)\\s*' + n + '\\s+([^;]*)', 'i').exec(pol) || [])[1] || null);
      const ss = dir('script-src') || dir('default-src') || '';
      if (/'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'|(^|\s)(\*|data:|https?:|blob:)(\s|$)/i.test(ss)) out.fail.push(rel(file) + '  CSP script-src is not strict: ' + ss.slice(0, 80));
      if (!/^\s*'none'\s*$/.test(dir('object-src') || dir('default-src') || '')) out.fail.push(rel(file) + "  CSP lacks object-src 'none'");
      if (!dir('base-uri')) out.fail.push(rel(file) + '  CSP lacks base-uri');
      const firstScript = head.search(/<script\b/i);
      if (firstScript >= 0 && firstScript < cspM.index) out.fail.push(rel(file) + '  CSP meta tag comes after a <script> (that script is not covered)');
    }
    if (!/<meta\s+name\s*=\s*["']referrer["']/i.test(head)) out.warn.push(rel(file) + '  no <meta name="referrer"> tag');
    if (!/<meta\s+charset/i.test(head)) out.warn.push(rel(file) + '  no <meta charset> tag');
  }

  /* script text: inline <script> bodies in HTML, or the whole .js file */
  const code = isHtml ? [...text.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => ({ body: m[1], off: m.index })) : [{ body: text, off: 0 }];
  for (const c of code) {
    const b = c.body;
    for (const m of b.matchAll(/\beval\s*\(|\bnew\s+Function\s*\(|\bdocument\.write(ln)?\s*\(|\bset(Timeout|Interval)\s*\(\s*["'`]/g)) {
      // A written waiver: a line carrying the marker  security-waiver  (with its reason in the comment above it) is accepted. Used once, in assets/site.js.
      const s0 = b.lastIndexOf('\n', m.index) + 1, e0 = b.indexOf('\n', m.index);
      if (/security-waiver/.test(b.slice(s0, e0 < 0 ? undefined : e0))) continue;
      add('fail', file, text, c.off + m.index, 'code-from-string sink: ' + m[0].trim());
    }
    for (const m of b.matchAll(/\.(innerHTML|outerHTML)\s*(\+?=)|\.insertAdjacentHTML\s*\(/g)) {
      const s = b.lastIndexOf('\n', m.index) + 1, e = b.indexOf('\n', m.index);
      const ln = b.slice(s, e < 0 ? undefined : e);
      const literalOnly = /=\s*(''|""|`[^`$]*`|'[^'+]*'|"[^"+]*")\s*;?\s*$/.test(ln);
      if (literalOnly) continue;
      if (!QUIET) out.warn.push(rel(file) + ':' + lineOf(text, c.off + m.index) + '  HTML sink' + (ESCAPERS.test(ln) ? ' (line calls an escaping helper)' : ' (CHECK: no escaping helper on this line)'));
    }
    for (const m of b.matchAll(/['"`](http:\/\/(?!www\.w3\.org|localhost|127\.0\.0\.1)[^'"`\s]+)/g)) add('fail', file, text, c.off + m.index, 'mixed content (http://) in script: ' + m[1].slice(0, 60));
  }
}

const uniq = (a) => [...new Set(a)];
if (!QUIET) { uniq(out.fail).forEach((l) => console.log('FAIL  ' + l)); uniq(out.warn).forEach((l) => console.log('WARN  ' + l)); }
const checkLines = uniq(out.warn).filter((l) => /CHECK:/.test(l)).length;
console.log('\nPage security scan of ' + root + ': ' + uniq(out.fail).length + ' failure(s), ' + uniq(out.warn).length + ' warning(s) (' + checkLines + ' HTML sinks to review by hand).');
if (out.fail.length) process.exit(1);
console.log('OK (no failures).');
