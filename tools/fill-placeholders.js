#!/usr/bin/env node
'use strict';
/* LAUNCH FILL-IN: replaces every placeholder token on the public pages with the owner's real answers, from ONE json file.

   1. Copy tools/launch-answers.example.json to tools/launch-answers.json and fill it in (Notepad is fine).
   2. See what would change, without changing anything:   node tools/fill-placeholders.js tools/launch-answers.json --dry-run
   3. Do it:                                              node tools/fill-placeholders.js tools/launch-answers.json
   4. When everything is filled and you are ready to go public:
                                                          node tools/fill-placeholders.js tools/launch-answers.json --launch
      --launch also sets baseUrl, fills security.txt, runs build-sitemap.js and apply-head-patch.js, and FAILS (exit 1) if any
      [BRACKETED] token is still on a published page. After it succeeds, tools/site-config.json says "launched": true and
      tools/predeploy-check.js (also run by the "Deploy site" workflow) fails the deploy if a token ever comes back.

   Tokens handled (see legal/PLACEHOLDERS.md):
     [OPERATOR]   "<ownerName>, an individual in Maryland, doing business as Daily Political Trivia"   (override with operatorText)
     [COUNTY]     county (the word "County" is added by the pages, so give just "Montgomery")
     [DOMAIN]     domain, e.g. example.com  (no https://, no www)
     [DATE]       today's date (override with "date")
     legal@[DOMAIN] privacy@[DOMAIN] dmca@[DOMAIN] corrections@[DOMAIN] accessibility@[DOMAIN] security@[DOMAIN]
                  default to <name>@<domain>; give "emails": { "dmca": "copyright@example.com" } to use another address.
   A token whose answer is missing is left alone and listed (so you can fill in two rounds, e.g. name first, domain later).
   Before a real run, the original files are copied to scratch/placeholder-backup-<time>/ (not committed, not published).
   No dependencies. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('./deploy-lib');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run') || args.includes('--dry');
const LAUNCH = args.includes('--launch');
const file = args.find(a => !a.startsWith('--'));
const die = m => { console.error('\nERROR: ' + m + '\n'); process.exit(2); };
if (args.includes('--help') || !file) {
  console.log('Usage: node tools/fill-placeholders.js tools/launch-answers.json [--dry-run] [--launch]\nStart from tools/launch-answers.example.json. Read the comment at the top of this file.');
  process.exit(file ? 0 : 2);
}
let ans; try { ans = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, '')); } catch (e) { die('Could not read ' + file + ': ' + e.message); }

// ---- validate and normalise the answers --------------------------------------------------------------------
const clean = s => (typeof s === 'string' ? s.trim() : '');
const isPlaceholderValue = s => !s || /^(your|example|jane doe|john doe|todo|fill|xxx|\?+)/i.test(s);
const problems = [];
const owner = clean(ans.ownerName);
let county = clean(ans.county).replace(/\s+county$/i, '');
let domain = clean(ans.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const values = {};
// PRIVACY: no personal name is needed. Leave ownerName empty and the pages say "an individual in Maryland, doing business as Daily Political Trivia".
// (Give ownerName only if you choose to publish your name; operatorText overrides the whole phrase.)
if (owner && !isPlaceholderValue(owner)) { if (!/\S+\s+\S+/.test(owner)) problems.push('ownerName should be your full legal name (first and last), or leave it empty to stay unnamed'); else values['[OPERATOR]'] = clean(ans.operatorText) || owner + ', an individual in Maryland, doing business as Daily Political Trivia'; }
else values['[OPERATOR]'] = clean(ans.operatorText) || 'an individual in Maryland, doing business as Daily Political Trivia';
if (county && !isPlaceholderValue(county)) values['[COUNTY]'] = county;   // no page uses [COUNTY] any more; kept only for older copies
if (domain && !isPlaceholderValue(domain)) { if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain) || /example\.(com|org|net)$/.test(domain)) problems.push('domain "' + domain + '" is not a real domain name (example: dailypoliticaltrivia.com)'); else values['[DOMAIN]'] = domain; }
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();
values['[DATE]'] = clean(ans.date) || months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
const ROLES = ['legal', 'privacy', 'dmca', 'corrections', 'accessibility', 'security'];
const emailMap = {};                                         // 'legal@[DOMAIN]' -> real address
const EMAIL = /^[^\s@<>"']+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
for (const r of ROLES) {
  const custom = clean((ans.emails || {})[r]);
  if (custom) { if (!EMAIL.test(custom)) problems.push('emails.' + r + ' "' + custom + '" is not a valid email address'); else emailMap[r + '@[DOMAIN]'] = custom; }
  else if (values['[DOMAIN]']) emailMap[r + '@[DOMAIN]'] = r + '@' + values['[DOMAIN]'];
}
if (problems.length) die('Fix these in ' + file + ':\n  - ' + problems.join('\n  - '));

// ---- which files ---------------------------------------------------------------------------------------------
// Every page that is (or, with Opinions back on, could be) published: all .html/.txt under site/ except tools, guides, private folders.
const targets = lib.walk(lib.SITE, n => lib.PUBLISH_EXCLUDED_DIRS.has(n) || n === 'node_modules', lib.SITE)
  .filter(f => /\.html?$/i.test(f.rel) && !lib.isNeverPublishFile(f.rel))
  .map(f => ({ rel: f.rel, full: f.full, html: true }));
const sec = path.join(lib.SITE, '.well-known', 'security.txt');
if (fs.existsSync(sec)) targets.push({ rel: '.well-known/security.txt', full: sec, html: false });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plan = [];     // {rel, counts:{token:n}, newText}
for (const t of targets) {
  let text = fs.readFileSync(t.full, 'utf8');
  const before = text, counts = {};
  const sub = (token, val) => { const n = text.split(token).length - 1; if (n) { counts[token] = (counts[token] || 0) + n; text = text.split(token).join(t.html ? esc(val) : val); } };
  for (const [tok, addr] of Object.entries(emailMap)) sub(tok, addr);       // emails first (they contain [DOMAIN])
  for (const tok of ['[OPERATOR]', '[COUNTY]', '[DOMAIN]', '[DATE]']) if (values[tok]) sub(tok, values[tok]);
  if (!t.html && values['[DOMAIN]']) {                                       // security.txt (RFC 9116)
    const exp = new Date(Date.now() + 360 * 864e5).toISOString().replace(/\.\d+Z$/, '.000Z');
    text = text.replace(/^# TEMPLATE.*\r?\n/gm, '').replace(/^# Note: GitHub.*\r?\n/gm, '')
      .replace(/YOUR-DOMAIN\.example/g, values['[DOMAIN]'] === undefined ? 'YOUR-DOMAIN.example' : values['[DOMAIN]'])
      .replace(/^Contact: mailto:.*$/m, 'Contact: mailto:' + (emailMap['security@[DOMAIN]'] || 'security@' + values['[DOMAIN]']))
      .replace(/^Expires:.*$/m, 'Expires: ' + exp);
    counts['security.txt values'] = 1;
  }
  if (text !== before) plan.push({ rel: t.rel, full: t.full, counts, newText: text });
}

// ---- report ---------------------------------------------------------------------------------------------------
console.log('\nFill-in plan' + (DRY ? ' (DRY RUN: nothing will be changed)' : '') + '\n' + '='.repeat(60));
const show = Object.assign({}, values); delete show['[DATE]'];
for (const [k, v] of Object.entries(values)) console.log(('  ' + k).padEnd(16) + ' -> ' + v + (k === '[DATE]' && !clean(ans.date) ? '   (today)' : ''));
for (const [k, v] of Object.entries(emailMap)) console.log(('  ' + k).padEnd(28) + ' -> ' + v);
console.log('');
let totalSubs = 0;
for (const p of plan) { const n = Object.values(p.counts).reduce((s, v) => s + v, 0); totalSubs += n; console.log(`  ${p.rel.padEnd(34)} ${n} change${n === 1 ? '' : 's'}  (${Object.entries(p.counts).map(([k, v]) => k + ' x' + v).join(', ')})`); }
console.log(`\n  ${totalSubs} replacement(s) in ${plan.length} file(s).`);
const unanswered = ['[DOMAIN]'].filter(k => !values[k]);
if (unanswered.length) console.log('  Not answered yet (left as they are): ' + unanswered.join(', ') + '  (' + { '[OPERATOR]': 'ownerName', '[COUNTY]': 'county', '[DOMAIN]': 'domain' }[unanswered[0]] + ' ...)');
if (LAUNCH && !values['[DOMAIN]']) die('--launch needs a domain in ' + file);

// ---- write ----------------------------------------------------------------------------------------------------
function remaining(root) {                  // [BRACKETED] tokens left on pages that would be published (read after writing)
  const left = [];
  for (const f of lib.publishFiles()) {
    if (!/\.(html?|txt)$/i.test(f.rel)) continue;
    let t = fs.readFileSync(f.full, 'utf8');
    if (/\.html?$/i.test(f.rel)) { try { t = lib.transformPublished(f.rel, t); } catch (e) { /* keep */ } t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, ''); }
    const hits = new Set();
    for (const m of t.matchAll(/\[[^\]\n<>]{1,90}\]/g)) if (/[A-Za-z]{3}/.test(m[0])) hits.add(m[0]);
    if (/\bYOUR-[A-Z0-9][A-Z0-9-]*/.test(t)) hits.add('YOUR-... template value');
    if (hits.size) left.push(f.rel + ': ' + [...hits].slice(0, 8).join('  '));
  }
  return left;
}
if (DRY) {
  console.log('\nDry run finished. Nothing was written. Run again without --dry-run to apply.');
  if (LAUNCH) console.log('(--launch would also set baseUrl to https://' + values['[DOMAIN]'] + ', run build-sitemap.js and apply-head-patch.js, and fail if any token remains.)');
  process.exit(0);
}
if (plan.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bdir = path.join(lib.SITE, 'scratch', 'placeholder-backup-' + stamp);
  for (const p of plan) { const dst = path.join(bdir, p.rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(p.full, dst); }
  for (const p of plan) fs.writeFileSync(p.full, p.newText);
  console.log('\n  Done. Originals saved in ' + path.relative(process.cwd(), bdir) + ' (to undo, copy them back).');
} else console.log('\n  Nothing to replace (already filled in?).');

const cfgPath = path.join(lib.SITE, 'tools', 'site-config.json');
if (LAUNCH) {
  const cfg = lib.readConfig(); cfg.baseUrl = clean(ans.baseUrl) || 'https://' + values['[DOMAIN]'];
  delete cfg._help2;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log('  baseUrl set to ' + cfg.baseUrl);
  for (const s of ['build-sitemap.js', 'apply-head-patch.js']) {
    const r = spawnSync(process.execPath, [path.join(__dirname, s)], { encoding: 'utf8' });
    console.log('  ' + s + ': ' + ((r.stdout || '').trim().split('\n').pop() || '') + (r.status ? '  FAILED ' + (r.stderr || '').trim() : ''));
    if (r.status) process.exit(1);
  }
}
const left = remaining();
if (left.length) {
  console.log('\n  Still to fill in (' + left.length + ' page' + (left.length === 1 ? '' : 's') + '):');
  left.forEach(l => console.log('    ' + l));
  if (LAUNCH) { console.error('\nLAUNCH BLOCKED: placeholders remain on published pages. Fill them (answers file) and run again.'); process.exit(1); }
} else {
  console.log('\n  No [BRACKETED] placeholder is left on any published page.');
  if (LAUNCH) {
    const cfg = lib.readConfig(); cfg.launched = true; fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    console.log('  site-config.json now says "launched": true: predeploy-check.js will fail the deploy if a placeholder ever returns.');
    console.log('  Next: node tools/predeploy-check.js --launch');
  }
}
