#!/usr/bin/env node
/* Daily Political Trivia - Content-Security-Policy builder.
   GitHub Pages cannot send HTTP headers, so the policy goes into every page as a <meta http-equiv> tag.
   Most pages have inline <script> blocks, so each page gets its OWN policy that lists the SHA-256 hash of
   each of its inline scripts (a hash lets exactly that code run and blocks any injected script).
   Usage (run it on the BUILT copy of the site, never on the editing folder, because it rewrites the HTML):
       node tools/build-csp.js <folder> [--ads] [--report-only] [--check]
   --ads          add the clearly separated ad-vendor section (Google Publisher Tag, IMA, Funding Choices, AdSense)
   --report-only  use Content-Security-Policy-Report-Only? (not possible in a meta tag; the browser ignores it).
                  Instead use --check, which only prints the policy per page and changes nothing.
   Before the first real use read security/APPLY.md. Plain Node, no packages. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const ADS = flag('--ads'), CHECK = flag('--check'); flag('--report-only');
const root = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(root)) { console.error('Usage: node tools/build-csp.js <built-site-folder> [--ads] [--check]'); process.exit(2); }

/* ---- the Supabase project address comes from opinions/config.js (empty = demo mode = no connection allowed) ---- */
let supabase = '';
try {
  const cfg = fs.readFileSync(path.join(root, 'opinions', 'config.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');   // comments hold an example address
  const m = /url:\s*'(https:\/\/[a-z0-9-]+\.supabase\.co)'/i.exec(cfg);
  if (m) supabase = m[1];
} catch (e) { /* no config */ }

/* ---- extra script sources that the site itself loads (pinned file only, not the whole CDN) ---- */
const SCRIPT_EXTRA = supabase ? ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'] : [];

function policyFor(hashes) {
  const script = ["'self'"].concat(hashes.map((h) => "'sha256-" + h + "'"), SCRIPT_EXTRA);
  const style = ["'self'", "'unsafe-inline'"];   // fonts are self-hosted (assets/fonts.css); inline style="" attributes are used for layout
  const font = ["'self'"];   // self-hosted fonts only (assets/fonts/)
  const img = ["'self'", 'data:'];                                              // no outside pictures: every image is a file of this site
  const connect = ["'self'"].concat(supabase ? [supabase] : []);
  const frame = ["'none'"];
  const media = ["'self'"];
  if (ADS) {
    /* ===== AD VENDORS (documented Google domains; Google itself says allow-lists may need updates: test with the browser console) ===== */
    script.push('https://securepubads.g.doubleclick.net', 'https://pagead2.googlesyndication.com', 'https://www.googletagservices.com',
      'https://partner.googleadservices.com', 'https://tpc.googlesyndication.com', 'https://imasdk.googleapis.com',
      'https://fundingchoicesmessages.google.com', 'https://www.google.com', 'https://ep2.adtrafficquality.google');
    connect.push('https://securepubads.g.doubleclick.net', 'https://pubads.g.doubleclick.net', 'https://pagead2.googlesyndication.com',
      'https://fundingchoicesmessages.google.com', 'https://*.google.com', 'https://*.adtrafficquality.google', 'https://imasdk.googleapis.com');
    frame.length = 0; frame.push("'self'", 'https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://*.safeframe.googlesyndication.com',
      'https://www.google.com', 'https://fundingchoicesmessages.google.com', 'https://imasdk.googleapis.com');
    media.push('https:', 'blob:');
  }
  const d = [
    ["default-src", ["'none'"]], ['script-src', script], ['style-src', style], ['font-src', font], ['img-src', img],
    ['connect-src', connect], ['frame-src', frame], ['media-src', media], ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]], ['base-uri', ["'none'"]], ['form-action', ["'self'"]], ['worker-src', ADS ? ["'self'", 'blob:'] : ["'none'"]]
  ];
  return d.map(([k, v]) => k + ' ' + v.join(' ')).join('; ') + '; upgrade-insecure-requests';
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(f, out); } else if (/\.html?$/i.test(e.name)) out.push(f);
  }
  return out;
}

let changed = 0;
for (const file of walk(root, [])) {
  let html = fs.readFileSync(file, 'utf8');
  const hashes = [];
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return m;                       // external files are allowed by 'self'
    if (/\btype\s*=\s*["']?(application\/(ld\+)?json|importmap)/i.test(attrs)) return m;   // data blocks never execute
    if (body.trim()) hashes.push(crypto.createHash('sha256').update(body, 'utf8').digest('base64'));
    return m;
  });
  const meta = '<meta http-equiv="Content-Security-Policy" content="' + policyFor([...new Set(hashes)]).replace(/"/g, '&quot;') + '">';
  const rel = path.relative(root, file).split(path.sep).join('/');
  // 404.html adds its own <base> element with a script (it must work under /repo-name/ too), so it needs base-uri 'self'.
  if (CHECK) { console.log(rel + ': ' + hashes.length + ' inline script(s)'); continue; }
  html = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>\s*/gi, '');
  // <head> exactly (the old pattern /<head[^>]*>/ also matched <header>, which would have put the policy in the page body, where
  // browsers ignore it). A page without a real <head> FAILS the build instead of being published without a policy.
  const HEAD = /<head(?=[\s>])[^>]*>/i;
  if (!HEAD.test(html)) { console.error('FAILED (no <head> element, so no policy could be added): ' + rel); process.exitCode = 1; continue; }
  const metaFinal = rel === '404.html' ? meta.replace("base-uri 'none'", "base-uri 'self'") : meta;
  // The referrer policy goes in too (only the site name, never the full address, is sent to other sites), on every built page.
  const refMeta = /<meta\s+name=["']referrer["']/i.test(html) ? '' : '\n<meta name="referrer" content="strict-origin-when-cross-origin">';
  // Placement: before any script (a meta CSP only covers what comes after it), but after <meta charset> when that is the first
  // thing in <head>, so the charset stays inside the first 1024 bytes however many script hashes the policy grows to.
  const charset = /^(<head(?=[\s>])[^>]*>\s*<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>)/i;
  const at = html.search(HEAD), headPart = html.slice(at);
  const cm = charset.exec(headPart);
  html = cm ? html.slice(0, at) + cm[1] + '\n' + metaFinal + refMeta + headPart.slice(cm[1].length)
            : html.replace(HEAD, (m) => m + '\n' + metaFinal + refMeta);
  fs.writeFileSync(file, html);
  changed++;
}
console.log(CHECK ? 'Check only: nothing was changed.' : 'CSP added to ' + changed + ' page(s)' + (ADS ? ' (with the ad-vendor section)' : '') + (supabase ? '; Supabase ' + supabase + ' allowed' : '; demo mode: no backend connection allowed') + '.');
