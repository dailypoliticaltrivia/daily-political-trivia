#!/usr/bin/env node
/* Daily Political Trivia - secrets and private-data scanner.
   Usage:
     node tools/check-secrets.js                scan the website folder (the folder that holds tools/)
     node tools/check-secrets.js --project      scan the whole project folder one level up (workshop files, people-db, ...)
     node tools/check-secrets.js <folder>       scan any folder
     add --strict to also fail on "medium" findings; --quiet prints only the summary.
   Exit code 1 = a high finding (or a medium one with --strict). Run it before every push; it is also safe to run in CI.
   It looks for: API keys and tokens, private keys, database passwords, Supabase service_role keys (the "master key"
   that must never be public), personal e-mail addresses, Windows user-folder paths, and files that should never be
   published (.env, keys, backups, screenshots, working folders).
   A line that must be allowed on purpose can end with the comment  secrets-ok  .
   Plain Node, no packages. Reports never print a whole secret, only its first characters. */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const STRICT = flag('--strict'), QUIET = flag('--quiet'), PROJECT = flag('--project');
const siteRoot = path.resolve(__dirname, '..');
const root = path.resolve(argv[0] || (PROJECT ? path.join(siteRoot, '..') : siteRoot));

const SKIP_DIRS = new Set(['.git', 'node_modules', 'photos', 'photo-work', 'cache', '.taste-skill', 'chrome-check']);   // browser profiles and caches: reported as folders, not read
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svgz|woff2?|ttf|otf|eot|pdf|zip|gz|7z|rar|mp[34]|mov|webm|wav|ogg|exe|dll|bin|dat|db|sqlite)$/i;
const MAX_FILE = 3 * 1024 * 1024;

/* files and folders that must never reach the public site */
const FORBIDDEN_DIRS = new Set(['.design-backup', '.taste-skill', 'shots', 'audit', 'people-db', 'tmpx', 'photo-work', '.claude', 'node_modules', '.vscode', '.idea']);
const FORBIDDEN_FILES = [
  [/^\.env(\..*)?$/i, 'environment file (often holds passwords)'], [/\.(pem|key|pfx|p12|jks|keystore)$/i, 'key or certificate file'],
  [/^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i, 'SSH key'], [/^\.git-credentials$|^\.npmrc$|^\.netrc$/i, 'credentials file'],
  [/\.(log|bak|orig|swp|tmp)$/i, 'log, backup or temporary file'], [/^(Thumbs\.db|\.DS_Store)$/i, 'system junk file'],
  [/\.(bat|cmd|ps1|sh)$/i, 'script (local tooling; keep it out of the published folder)'], [/^serve\.ps1$/i, 'local test server'],
  [/^(credentials|secrets?)\.(json|ya?ml|txt)$/i, 'credentials file'], [/\.(sqlite3?|db)$/i, 'database file']
];
/* Folder names that the website folder's .gitignore ignores at any depth ("name/" or "name" lines without a slash inside)
   and that the deploy build skips. Only used when scanning the website folder itself. */
const GITIGNORED_DIRS = new Set(), DEPLOY_SKIPS = new Set();
if (root === siteRoot) {
  try {
    for (const raw of fs.readFileSync(path.join(siteRoot, '.gitignore'), 'utf8').split(/\r?\n/)) {
      const l = raw.trim(); if (!l || l[0] === '#' || l[0] === '!') continue;
      const n = l.replace(/\/$/, ''); if (!/[\/*?\[]/.test(n)) GITIGNORED_DIRS.add(n);
    }
  } catch (e) { /* no .gitignore: nothing is treated as ignored */ }
  try { for (const n of require('./deploy-lib').REPO_IGNORED_DIRS) DEPLOY_SKIPS.add(n); } catch (e) { /* deploy-lib missing */ }
}
/* tools/ scripts are part of the repo on purpose so scripts under these are only informational */
const SCRIPT_OK_DIRS = new Set(['tools', '.github']);

const RULES = [
  ['high', 'AWS access key id', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['high', 'Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['high', 'GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}\b|\bgithub_pat_[0-9A-Za-z_]{40,}\b/],
  ['high', 'Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/],
  ['high', 'Stripe live key', /\b(sk|rk)_live_[0-9A-Za-z]{16,}\b/],
  ['high', 'Anthropic / OpenAI style secret key', /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['high', 'Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}\b/],
  ['high', 'Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/],
  ['high', 'SendGrid key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/],
  ['high', 'npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['high', 'private key block', /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/],
  ['high', 'database URL with password', /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:@\/]+:[^\s@\/]{3,}@[^\s\/]+/i],
  ['high', 'service_role mentioned next to a key', /service_role['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/i],
  ['medium', 'hard-coded secret assignment', /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)['"]?\s*[:=]\s*['"][A-Za-z0-9\/+_=.-]{16,}['"]/i],
  // both slash styles after the drive letter (backslash or forward slash) and the Git Bash form (/c/Users/...)
  ['medium', 'Windows user-folder path (reveals a real user name)', /\b[A-Za-z]:(\\\\?|\/)Users(\\\\?|\/)(?!Public\b|Default\b|All Users\b|YOU\b|YOUR|<)[A-Za-z0-9._-]{2,}(\\|\/)|(?:^|[\s"'(=`])\/[a-z]\/Users\/(?!Public\b|Default\b|YOU\b|YOUR|<)[A-Za-z0-9._-]{2,}\//i],
  ['medium', 'macOS/Linux home path (reveals a real user name)', /(?:^|[\s"'(=])\/(Users|home)\/(?!you\b|your|user\b|runner\b|<)[a-z0-9._-]{2,}\//i]
];
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;
const EMAIL_OK = /(^|\.)(gov|example\.(com|org|net)|example|invalid|test|localhost|demo\.local|local|users\.noreply\.github\.com|noreply\.github\.com|your-domain|YOUR-DOMAIN\.example)$|^(noreply|no-reply|donotreply)@/i;
const PLACEHOLDER = /(example|your[-_ ]|placeholder|changeme|xxxx|dummy|sample|demo|test|abcdef|0000|1234)/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}\b/g;

const findings = [];
const add = (sev, file, line, what, sample) => findings.push({ sev, file: path.relative(root, file) || file, line, what, sample });
const redact = (s) => (s.length <= 8 ? s : s.slice(0, 6) + '...(' + s.length + ' chars)');

/* Identity guard: ../private-terms.txt (in the PROJECT folder, one level above the website folder, so it is never uploaded)
   lists words that must never appear anywhere in the website files: your name, personal email, Windows username, home town...
   One term per line, case-insensitive; blank lines and lines starting with # are ignored. Any hit is a HIGH finding. */
const PRIVATE_TERMS = [];
try {
  for (const raw of fs.readFileSync(path.join(siteRoot, '..', 'private-terms.txt'), 'utf8').split(/\r?\n/)) {
    const t = raw.trim(); if (t && t[0] !== '#') PRIVATE_TERMS.push(t.toLowerCase());
  }
} catch (e) { /* no private-terms.txt: the guard is off */ }

function scanText(file, text) {
  const seenMail = new Set();
  const lines = text.split(/\r?\n/);
  const isPrivacyOrDocs = /\.(md|txt)$/i.test(file);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.length > 20000 || /secrets-ok/.test(ln)) continue;
    if (PRIVATE_TERMS.length) { const low = ln.toLowerCase(); for (const t of PRIVATE_TERMS) if (low.includes(t)) { add('high', file, i + 1, 'PRIVATE TERM from private-terms.txt (identity guard)', t.slice(0, 2) + '...(' + t.length + ' chars)'); break; } }
    for (const [sev, what, re] of RULES) {
      const m = re.exec(ln);
      if (!m) continue;
      if (what === 'hard-coded secret assignment' && PLACEHOLDER.test(m[0])) continue;
      add(sev, file, i + 1, what, redact(m[0]));
    }
    let j; JWT.lastIndex = 0;
    while ((j = JWT.exec(ln))) {
      let role = '?';
      try { role = JSON.parse(Buffer.from(j[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role || '?'; } catch (e) { /* not a Supabase key */ }
      if (role === 'service_role') add('high', file, i + 1, 'Supabase SERVICE_ROLE key (bypasses all security; must never be published)', redact(j[0]));
      else if (role === 'anon') add('info', file, i + 1, 'Supabase anon key (designed to be public; Row Level Security protects the data)', redact(j[0]));
      else add('medium', file, i + 1, 'JSON web token (role: ' + role + ')', redact(j[0]));
    }
    let e; EMAIL.lastIndex = 0;
    while ((e = EMAIL.exec(ln))) {
      const addr = e[0], domain = addr.split('@')[1];
      if (EMAIL_OK.test(domain) || EMAIL_OK.test(addr)) continue;
      if (/\.(png|jpe?g|webp|svg|gif)$/i.test(domain) || /^[0-9a-f]+@\d/.test(addr)) continue;   // image names like photo@2x.png
      if (seenMail.has(addr + ':' + i)) continue; seenMail.add(addr + ':' + i);
      add(isPrivacyOrDocs ? 'info' : 'medium', file, i + 1, 'e-mail address (personal data unless it is a published contact)', addr.replace(/^(.{2}).*@/, '$1***@'));
    }
  }
}

function walk(dir, rel) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const d of entries) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (FORBIDDEN_DIRS.has(d.name)) {
        // In the website folder, a private folder is fine when BOTH .gitignore keeps it out of the repository AND the deploy
        // build skips it (tools/deploy-lib.js). Then it is only reported as info. Anywhere else (a built copy) it stays medium.
        if (GITIGNORED_DIRS.has(d.name) && DEPLOY_SKIPS.has(d.name)) add('info', full, 0, 'private folder present locally; gitignored and skipped by the deploy build (OK)', d.name + '/');
        else add('medium', full, 0, 'folder that must not be published' + (root === siteRoot ? ' (add it to .gitignore and to REPO_IGNORED_DIRS in tools/deploy-lib.js)' : ''), d.name + '/');
      }
      if (SKIP_DIRS.has(d.name)) continue;
      walk(full, rel + d.name + '/');
      continue;
    }
    if (!d.isFile()) continue;
    for (const [re, why] of FORBIDDEN_FILES) {
      if (!re.test(d.name)) continue;
      const parent = path.basename(dir);
      if (/\.(bat|cmd|ps1|sh)$/i.test(d.name) && SCRIPT_OK_DIRS.has(parent)) continue;
      add('medium', full, 0, 'file that should not be published: ' + why, d.name);
    }
    if (BINARY.test(d.name)) continue;
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.size > MAX_FILE || st.size === 0) continue;
    let buf; try { buf = fs.readFileSync(full); } catch (e) { continue; }
    if (buf.includes(0)) continue;                       // binary content
    scanText(full, buf.toString('utf8'));
  }
}

walk(root, '');
/* ---- opinions/config.js must hold ONLY url, anonKey (a JWT whose role is "anon") and the optional google flag ---- */
function checkConfigJs(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const m = /window\.SIN_SUPABASE\s*=\s*\{([\s\S]*?)\}\s*;?/.exec(code);
  if (!m) { add('high', file, 0, 'opinions/config.js: window.SIN_SUPABASE = {...} not found', ''); return; }
  const body = m[1];
  const keys = [...body.replace(/'[^']*'/g, "''").matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((x) => x[1]);
  for (const k of keys) if (!['url', 'anonKey', 'google', 'enabled'].includes(k)) add('high', file, 0, 'opinions/config.js has an unexpected setting "' + k + '" (only url, anonKey, google, enabled are allowed)', k);
  const rest = code.replace(m[0], '').trim();
  if (rest) add('high', file, 0, 'opinions/config.js contains code other than the SIN_SUPABASE settings', rest.slice(0, 20));
  const url = (/\burl\s*:\s*'([^']*)'/.exec(body) || [])[1];
  const key = (/\banonKey\s*:\s*'([^']*)'/.exec(body) || [])[1];
  const google = (/\bgoogle\s*:\s*([A-Za-z]+)/.exec(body) || [])[1];
  if (google !== undefined && google !== 'true' && google !== 'false') add('high', file, 0, 'opinions/config.js: google must be true or false', google);
  if (url === undefined || key === undefined) { add('high', file, 0, 'opinions/config.js: url and anonKey must both be present (empty = demo mode)', ''); return; }
  if (!url && !key) return;                                     // demo mode
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) add('high', file, 0, 'opinions/config.js: url must look like https://PROJECT.supabase.co', url);
  const parts = key.split('.');
  if (parts.length !== 3) { add('high', file, 0, 'opinions/config.js: anonKey is not a JWT (a newer sb_publishable_ key is fine only if you accept this check being skipped)', redact(key)); return; }
  let role = '?';
  try { role = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role || '?'; } catch (e) { /* ignore */ }
  if (role !== 'anon') add('high', file, 0, 'opinions/config.js: anonKey has role "' + role + '", it must be "anon" (a service_role key bypasses all security)', redact(key));
}
for (const cfgFile of [path.join(root, 'opinions', 'config.js'), path.join(root, 'site', 'opinions', 'config.js')]) if (fs.existsSync(cfgFile)) checkConfigJs(cfgFile);


const order = { high: 0, medium: 1, info: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);
const count = { high: 0, medium: 0, info: 0 };
findings.forEach((f) => { count[f.sev]++; });
// First line = summary (tools/predeploy-check.js shows it). Lines that start with "- " are the failures it reports.
console.log('Secrets scan: ' + count.high + ' high, ' + count.medium + ' medium, ' + count.info + ' info (scanned ' + root + ').');
const fails = (f) => f.sev === 'high' || (STRICT && f.sev === 'medium');
for (const f of findings.filter(fails)) console.log('- ' + f.sev.toUpperCase() + ' ' + f.file + (f.line ? ':' + f.line : '') + '  ' + f.what + '  [' + f.sample + ']');
if (!QUIET) {
  for (const f of findings.filter((x) => !fails(x)).slice(0, 200)) console.log(f.sev.toUpperCase().padEnd(6) + ' ' + f.file + (f.line ? ':' + f.line : '') + '  ' + f.what + '  [' + f.sample + ']');
  if (findings.length > 200) console.log('... more findings not shown');
}
if (count.high || (STRICT && count.medium)) { console.log('FAILED. Remove the secret (and rotate it if it was ever pushed), or mark an intentional line with the comment  secrets-ok'); process.exit(1); }
console.log('OK.');
