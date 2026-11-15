#!/usr/bin/env node
/* Tests for tools/build-csp.js (run: node tools/test-csp.js). Builds small pages in a temporary folder, runs the CSP builder on
   them and checks: the policy lands inside <head> (never in a <header>), after <meta charset> and before every script; every
   inline script's SHA-256 hash is listed; script-src has no unsafe-inline/unsafe-eval; object-src 'none' and base-uri are set;
   the referrer policy is added; a page without a <head> fails the build; check-security.js accepts the result.
   Plain Node, no packages. Nothing in the website folder is touched. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpt-csp-'));
const run = (script, args) => spawnSync(process.execPath, [path.join(__dirname, script)].concat(args), { encoding: 'utf8' });
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

try {
  /* 1. a normal page with two inline scripts and a <header> in the body */
  const good = path.join(tmp, 'good'); fs.mkdirSync(path.join(good, 'sub'), { recursive: true });
  const s1 = 'var a = 1;', s2 = '\n  document.title = "x";\n';
  fs.writeFileSync(path.join(good, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><script>' + s1 + '</script></head><body><header>h</header><script>' + s2 + '</script><script type="application/ld+json">{"a":1}</script></body></html>');
  fs.writeFileSync(path.join(good, 'sub', 'page.html'), '<!doctype html><html lang="en"><head>\n<title>t</title><meta charset="utf-8"></head><body><header class="x">h</header></body></html>');
  const r = run('build-csp.js', [good]);
  ok(r.status === 0, 'build-csp exits 0 on valid pages');
  const html = fs.readFileSync(path.join(good, 'index.html'), 'utf8');
  const headEnd = html.indexOf('</head>'), cspAt = html.search(/<meta http-equiv="Content-Security-Policy"/);
  ok(cspAt > 0 && cspAt < headEnd, 'policy is inside <head>');
  ok(cspAt > html.indexOf('<meta charset'), 'policy comes after <meta charset> (charset stays in the first bytes)');
  ok(cspAt < html.indexOf('<script'), 'policy comes before the first script');
  ok(html.indexOf('<header>h</header>') > headEnd && !/<header>\s*<meta/.test(html), 'nothing was injected into <header>');
  const pol = (/content="([^"]*)"/.exec(html.slice(cspAt)) || [])[1] || '';
  ok(pol.includes("'sha256-" + sha(s1) + "'") && pol.includes("'sha256-" + sha(s2) + "'"), 'both inline scripts are hashed exactly');
  ok(!pol.includes(sha('{"a":1}')), 'JSON data blocks are not hashed');
  const scriptSrc = (/script-src ([^;]*)/.exec(pol) || [])[1] || '';
  ok(!/unsafe-inline|unsafe-eval|\*/.test(scriptSrc), "script-src has no 'unsafe-inline', 'unsafe-eval' or wildcard");
  ok(/object-src 'none'/.test(pol) && /base-uri 'none'/.test(pol) && /default-src 'none'/.test(pol) && /form-action 'self'/.test(pol), "object-src/base-uri/default-src 'none' and form-action 'self' are set");
  ok(/<meta name="referrer" content="strict-origin-when-cross-origin">/.test(html), 'referrer policy is added');
  const sub = fs.readFileSync(path.join(good, 'sub', 'page.html'), 'utf8');
  const subCsp = sub.search(/<meta http-equiv="Content-Security-Policy"/);
  ok(subCsp > 0 && subCsp < sub.indexOf('</head>') && sub.indexOf('<header') > sub.indexOf('</head>'), 'page whose charset is not first still gets the policy inside <head>');
  const again = run('build-csp.js', [good]);
  ok(again.status === 0 && (fs.readFileSync(path.join(good, 'index.html'), 'utf8').match(/Content-Security-Policy/g) || []).length === 1, 'running twice leaves exactly one policy');
  const sec = run('check-security.js', [good, '--require-csp', '--quiet']);
  ok(sec.status === 0, 'check-security.js --require-csp accepts the built pages' + (sec.status ? ': ' + sec.stdout.trim().split('\n').pop() : ''));

  /* 2. a page with a <header> but no <head> must fail, never be published without a policy */
  const bad = path.join(tmp, 'bad'); fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'index.html'), '<!doctype html><html lang="en"><title>t</title><header>h</header><script>x()</script></html>');
  const rb = run('build-csp.js', [bad]);
  ok(rb.status !== 0, 'build-csp fails on a page without <head> (exit ' + rb.status + ')');
  ok(!/Content-Security-Policy/.test(fs.readFileSync(path.join(bad, 'index.html'), 'utf8')), 'and does not inject the policy into <header>');

  /* 3. check-security catches a weakened policy */
  const weak = path.join(tmp, 'weak'); fs.mkdirSync(weak);
  fs.writeFileSync(path.join(weak, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'"><meta name="referrer" content="no-referrer"><title>t</title></head><body></body></html>');
  const sw = run('check-security.js', [weak, '--quiet']);
  ok(sw.status !== 0, 'check-security.js fails a policy with unsafe-inline and no object-src/base-uri');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? '\n' + failed + ' test(s) FAILED' : '\nAll CSP tests passed.');
process.exit(failed ? 1 : 0);
