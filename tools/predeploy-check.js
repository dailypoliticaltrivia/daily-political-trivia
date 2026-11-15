#!/usr/bin/env node
'use strict';
/* Run before every deploy:   node tools/predeploy-check.js            (from the site folder)
   or check an already-built deploy folder:   node tools/predeploy-check.js ..\deploy-site
   Add  --launch  for the strict launch gate: it FAILS if any [BRACKETED] placeholder is still on a published page, if
   baseUrl is still example.com, or if security.txt is not published. (The gate switches itself on for good once
   tools/fill-placeholders.js --launch has succeeded: it sets "launched": true in tools/site-config.json.)
   Works with Opinions on or off (opinions/config.js "enabled"); see the "Opinions switch" check.
   Prints a PASS / WARN / FAIL list. Exit code 1 if anything FAILS. No dependencies. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const lib = require('./deploy-lib');
const { spawnSync } = require('child_process');

// ---- host limits (see DEPLOY.md for sources) -------------------------------------------------
const LIMITS = {
  ghPagesSiteMB: 1024,        // GitHub Pages: published site may be no larger than 1 GB
  ghRepoRecommendedMB: 1024,  // GitHub: recommended repository size limit 1 GB
  cfFiles: 20000,             // Cloudflare Pages Free: files per site
  cfFileMB: 25,               // Cloudflare Pages: 25 MiB per file
  ownFileMB: 25,              // our own ceiling (works on every host)
};

const args = process.argv.slice(2);
const arg = args.find(a => !a.startsWith('--'));
const LAUNCH = args.includes('--launch') || lib.readConfig().launched === true;
const folderMode = !!arg;
const OPS = lib.opinionsState();   // the Opinions switch as set in the source (opinions/config.js)
const ROOT = folderMode ? path.resolve(arg) : lib.SITE;
if (!fs.existsSync(ROOT)) { console.error('Folder not found: ' + ROOT); process.exit(2); }
const pub = folderMode ? lib.walk(ROOT, () => false, ROOT) : lib.publishFiles();
const repo = folderMode ? [] : lib.repoFiles();
const pubSet = new Set(pub.map(f => f.rel));
const MB = n => (n / 1048576).toFixed(1) + ' MB';

const results = [];            // {status, name, details[]}
function check(name, fn) {
  const details = [];
  let status = 'PASS';
  const ctx = { fail: m => { status = 'FAIL'; details.push(m); }, warn: m => { if (status === 'PASS') status = 'WARN'; details.push(m); }, info: m => details.push(m) };
  try { fn(ctx); } catch (e) { status = 'FAIL'; details.push('check crashed: ' + e.message); }
  results.push({ status, name, details });
}
// In folder mode the files are already the built copy. Checking the source folder, apply the same build rules
// (Opinions on/off) so the checks see what visitors would get.
const read = f => { const t = fs.readFileSync(f.full, "utf8").replace(/^﻿/, ""); return (!folderMode && lib.TRANSFORMED(f.rel)) ? lib.transformPublished(f.rel, t, OPS) : t; };
const isExternal = u => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u);

// ---- helpers: HTML link extraction --------------------------------------------------------------
function stripHtml(html) { return html.replace(/<noscript[^>]*>[^]*?<[/]noscript>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, m => m.replace(/>[\s\S]*</, '><')).replace(/<style\b[\s\S]*?<\/style>/gi, ''); }
function refs(html) {
  const out = [];
  const body = stripHtml(html);
  for (const m of body.matchAll(/\b(href|src|poster|action)\s*=\s*("([^"]*)"|'([^']*)')/gi)) out.push({ attr: m[1].toLowerCase(), url: (m[3] ?? m[4]).trim() });
  for (const m of body.matchAll(/\bsrcset\s*=\s*"([^"]*)"/gi)) for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) out.push({ attr: 'srcset', url: u }); }
  return out;
}
function resolveLocal(fromRel, url) {       // returns {rel, absolute:boolean} or null for external/anchor
  if (!url || url[0] === '#' || isExternal(url) || /^(mailto|tel|javascript|data|blob):/i.test(url)) return null;
  const clean = url.split('#')[0].split('?')[0];
  if (!clean) return null;
  const abs = clean[0] === '/';
  let rel = abs ? clean.replace(/^\/+/, '') : path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), clean));
  try { rel = decodeURIComponent(rel); } catch (e) { /* keep */ }
  return { rel, absolute: abs, trailingSlash: /\/$/.test(clean) || clean === '.' || clean === '' };
}
function exists(rel) {
  if (rel === '' || rel === '.') return pubSet.has('index.html');
  if (rel.startsWith('..')) return false;
  if (pubSet.has(rel)) return true;
  const dir = rel.replace(/\/$/, '');
  return pubSet.has(dir + '/index.html');
}
const htmlFiles = pub.filter(f => /\.html?$/i.test(f.rel));

// =========================== 1. forbidden files ===========================================
check('No files that must never be published', c => {
  const bad = [];
  const forbidDirs = /(^|\/)(\.design-backup|\.taste-skill|shots|audit|people-db|photo-work|scratch|tmpx|node_modules|\.git|\.github|tools|deploy|supabase|deploy-site)\//;
  for (const f of pub) {
    if (forbidDirs.test(f.rel) || lib.isNeverPublishFile(f.rel)) bad.push(f.rel);
  }
  bad.slice(0, 15).forEach(b => c.fail('would be published: ' + b));
  if (bad.length > 15) c.fail('...and ' + (bad.length - 15) + ' more');
  c.info((folderMode ? 'checked the deploy folder' : 'publish list built from site/ with the exclusion rules in tools/deploy-lib.js') + ' (' + pub.length + ' files)');
});
if (!folderMode) check('.gitignore keeps private folders out of the repository', c => {
  const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
  for (const d of ['.taste-skill', '.design-backup', 'shots', 'audit', 'people-db', 'scratch']) if (!new RegExp('^' + d.replace('.', '\\.') + '/?\\s*$', 'm').test(gi)) c.fail('.gitignore is missing: ' + d + '/');
  for (const d of ['.taste-skill', '.design-backup', 'shots', 'audit', 'people-db', 'scratch']) if (fs.existsSync(path.join(ROOT, d))) c.info('present on this PC but ignored by git: ' + d + '/');
});

// =========================== 2. size limits ============================================
check('Size and file count within host limits', c => {
  const total = pub.reduce((s, f) => s + f.size, 0);
  const repoTotal = repo.reduce((s, f) => s + f.size, 0);
  c.info(`published: ${pub.length} files, ${MB(total)}   (GitHub Pages limit ${LIMITS.ghPagesSiteMB} MB; Cloudflare Pages limit ${LIMITS.cfFiles} files)`);
  if (!folderMode) c.info(`repository (committed files, before git compression): ${repo.length} files, ${MB(repoTotal)}   (GitHub recommends under ${LIMITS.ghRepoRecommendedMB} MB)`);
  if (total > LIMITS.ghPagesSiteMB * 1048576) c.fail('published site is over the GitHub Pages 1 GB limit');
  else if (total > 0.8 * LIMITS.ghPagesSiteMB * 1048576) c.warn('published site is over 80% of the 1 GB GitHub Pages limit');
  if (!folderMode && repoTotal > LIMITS.ghRepoRecommendedMB * 1048576) c.fail('repository is over 1 GB');
  if (pub.length > LIMITS.cfFiles) c.warn(`more than ${LIMITS.cfFiles} files: would NOT fit on Cloudflare Pages Free (GitHub Pages is fine)`);
  else if (pub.length > 0.8 * LIMITS.cfFiles) c.warn('over 80% of the Cloudflare Pages 20,000-file limit');
  const big = (folderMode ? pub : repo.concat(pub.filter(f => !repo.includes(f)))).filter(f => f.size > LIMITS.ownFileMB * 1048576);
  big.forEach(f => c.fail(`file over ${LIMITS.ownFileMB} MB: ${f.rel} (${MB(f.size)})`));
  const top = pub.slice().sort((a, b) => b.size - a.size).slice(0, 3).map(f => f.rel + ' ' + MB(f.size));
  c.info('largest files: ' + top.join(', '));
});

// =========================== 3. JSON ====================================================
check('JSON files are valid', c => {
  const js = pub.filter(f => /\.(json|webmanifest)$/i.test(f.rel));
  let n = 0;
  for (const f of js) { try { JSON.parse(read(f)); n++; } catch (e) { c.fail(f.rel + ': ' + e.message); } }
  c.info(n + ' of ' + js.length + ' JSON/manifest files parsed');
  for (const need of ['games/games.json', 'manifest.webmanifest']) if (!pubSet.has(need)) c.warn('expected file missing: ' + need);
});

// =========================== 4. links and assets ==========================================
check('Internal links and assets all exist (HTML)', c => {
  let n = 0, bad = 0, abs = 0;
  for (const f of htmlFiles) {
    for (const r of refs(read(f))) {
      const t = resolveLocal(f.rel, r.url);
      if (!t) continue;
      n++;
      if (t.absolute) { abs++; c.fail(`${f.rel}: root-absolute path "${r.url}" breaks under a /repo-name/ address; make it relative`); continue; }
      if (!exists(t.rel)) { bad++; if (bad <= 25) c.fail(`${f.rel}: "${r.url}" not found`); }
    }
  }
  if (bad > 25) c.fail('...and ' + (bad - 25) + ' more broken links');
  c.info(`${n} internal references checked across ${htmlFiles.length} pages (${bad} broken, ${abs} absolute)`);
});
check('Paths inside CSS and JS work at a domain root and under /repo-name/', c => {
  let n = 0;
  // CSS url()
  for (const f of pub.filter(f => /\.css$/i.test(f.rel))) {
    for (const m of read(f).matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      const u = m[2].trim();
      if (/^(#|%23)/.test(u)) continue;   // url(#id): a reference to an SVG filter/pattern in the page itself (also inside data: images), not a file
      const t = resolveLocal(f.rel, u); if (!t) continue; n++;
      if (t.absolute) c.fail(`${f.rel}: url(${u}) is root-absolute`);
      else if (!exists(t.rel)) c.fail(`${f.rel}: url(${u}) not found`);
    }
  }
  // which pages load which scripts (to resolve fetch() relative to the page)
  const pagesOf = new Map();
  for (const h of htmlFiles) for (const r of refs(read(h))) { if (r.attr !== 'src') continue; const t = resolveLocal(h.rel, r.url); if (t && !t.absolute) { if (!pagesOf.has(t.rel)) pagesOf.set(t.rel, []); pagesOf.get(t.rel).push(h.rel); } }
  for (const f of pub.filter(f => /\.js$/i.test(f.rel) && !/\/vendor\//.test(f.rel) && f.size < 2 * 1048576)) {
    const text = read(f);
    // absolute-looking literals such as '/assets/x.js' or "/games/games.json"
    for (const m of text.matchAll(/(['"`])(\/(?!\/)[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.%-]+)*\.(?:html|js|css|json|png|jpe?g|svg|webp|gif|ico|webmanifest))\1/g)) {
      c.fail(`${f.rel}: root-absolute path ${m[1]}${m[2]}${m[1]} breaks under a /repo-name/ address`);
    }
    // SIN.url('x') is relative to the SITE ROOT
    for (const m of text.matchAll(/\bSIN\.url\(\s*(['"])([^'"`$+]+)\1\s*\)/g)) {
      n++; const rel = m[2].split('#')[0].split('?')[0]; if (!exists(rel)) c.fail(`${f.rel}: SIN.url('${m[2]}') not found`);
    }
    // fetch('literal') / import('literal') relative to the page that loads the script
    for (const m of text.matchAll(/\bfetch\(\s*(['"])([^'"`$+]+)\1\s*[,)]/g)) {
      const u = m[2]; if (isExternal(u) || u[0] === '/' ) continue;
      n++;
      const pages = pagesOf.get(f.rel) || [];
      const clean = u.split('?')[0].split('#')[0];
      const ok = pages.length ? pages.some(p => exists(path.posix.normalize(path.posix.join(path.posix.dirname(p), clean)))) : exists(path.posix.normalize(path.posix.join(path.posix.dirname(f.rel), clean)));
      if (!ok) c.warn(`${f.rel}: fetch('${u}') not found relative to ${pages.length ? 'the page(s) that load it' : 'the script'}`);
    }
  }
  // site.js must keep deriving its base from its own script URL (no hard-coded domain or leading slash)
  const sj = pub.find(f => f.rel === 'assets/site.js');
  if (sj) { const t = read(sj); if (!/document\.currentScript/.test(t) || !/new URL\(\s*['"]\.\.\/['"]\s*,\s*script\.src/.test(t)) c.warn('assets/site.js base handling changed: re-check that links work under /repo-name/'); else c.info('site.js derives the site root from its own address (works at a root and under /repo-name/)'); }
  c.info(n + ' CSS/JS path literals checked');
});
check('Dark Horse index and question files match the banks', c => {
  // the game downloads data/index.json + only the day's data/q/*.json; they are built from the banks by tools/build-dh-shards.js
  const dir = path.join(ROOT, 'games', 'dark-horse', 'data');
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return c.warn('games/dark-horse/data/manifest.json not found');
  const dh = require('./build-dh-shards');
  const out = dh.build(dir);
  const idxFile = path.join(dir, 'index.json');
  if (!fs.existsSync(idxFile)) return c.fail('games/dark-horse/data/index.json is missing: run  node tools/build-dh-shards.js  (the game still works by loading whole banks, but slowly)');
  if (fs.readFileSync(idxFile, 'utf8') !== out.indexText) return c.fail('data/index.json is out of date with the banks: run  node tools/build-dh-shards.js');
  const qdir = path.join(dir, 'q'), have = new Set(fs.existsSync(qdir) ? fs.readdirSync(qdir) : []);
  const missing = [...out.files.keys()].filter(f => !have.has(f));
  if (missing.length) return c.fail(missing.length + ' question file(s) missing in data/q/: run  node tools/build-dh-shards.js');
  const extra = [...have].filter(f => !out.files.has(f));
  if (extra.length) c.warn(extra.length + ' leftover file(s) in data/q/ (run node tools/build-dh-shards.js to remove them)');
  const bytes = [...out.files.values()].reduce((n, t) => n + Buffer.byteLength(t), 0);
  c.info(out.index.count + ' questions; index ' + (Buffer.byteLength(out.indexText) / 1024).toFixed(0) + ' KB; question files ' + MB(bytes) + ' (a player downloads only the index and 7 files a day)');
});
check('Congressional Grid photos: every referenced photo exists', c => {
  const mf = pub.find(f => f.rel === 'games/congressional-grid/data/members.js');
  if (!mf) return c.warn('members.js not found (game not published yet? run publish-game.ps1)');
  const sandbox = { window: {} }; vm.createContext(sandbox);
  vm.runInContext(read(mf), sandbox, { timeout: 20000 });
  const members = sandbox.window.MEMBERS || [];
  const photos = new Set(pub.filter(f => f.rel.startsWith('games/congressional-grid/photos/')).map(f => f.rel.split('/').pop()));
  const used = new Set(); let missing = 0;
  for (const m of members) if (m.photo === true) { const fn = m.id + '.jpg'; used.add(fn); if (!photos.has(fn)) { missing++; if (missing <= 5) c.fail('photo missing: ' + fn); } }
  const pf = pub.find(f => f.rel === 'games/congressional-grid/data/presidents.js');
  if (pf) { const sb = { window: {} }; vm.createContext(sb); try { vm.runInContext(read(pf), sb, { timeout: 5000 }); } catch (e) { /* ignore */ }
    for (const v of Object.values(sb.window)) if (Array.isArray(v)) for (const p of v) if (p && p.bio) used.add(p.bio + '.jpg'); }
  if (missing > 5) c.fail('...and ' + (missing - 5) + ' more missing photos');
  const unused = [...photos].filter(p => !used.has(p));
  const unusedBytes = pub.filter(f => f.rel.startsWith('games/congressional-grid/photos/') && !used.has(f.rel.split('/').pop())).reduce((s, f) => s + f.size, 0);
  c.info(`${members.length} members, ${used.size} photos referenced, ${photos.size} photo files published, ${unused.length} unused (${MB(unusedBytes)})`);
  if (unused.length > 0) c.warn(`${unused.length} photo files (${MB(unusedBytes)}) are not used by any member; they could be left out`);
});

// =========================== 5. secrets ===================================================
check('No passwords or private keys in the repository', c => {
  // runs tools/check-secrets.js (scans every file in the folder; skips .git and .taste-skill)
  const sc = path.join(lib.SITE, 'tools', 'check-secrets.js');
  const r = spawnSync(process.execPath, [sc, ROOT], { encoding: 'utf8', timeout: 120000 });
  const out = ((r.stdout || '') + (r.stderr || '')).split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean);
  if (r.status !== 0) out.filter(l => l.startsWith('- ')).forEach(l => c.fail(l.slice(2)));
  if (r.status !== 0 && !out.some(l => l.startsWith('- '))) c.fail('check-secrets.js failed: ' + out.slice(0, 3).join(' '));
  c.info('check-secrets.js: ' + (out[0] || ''));
  const cfg = path.join(ROOT, 'opinions', 'config.js');
  if (fs.existsSync(cfg)) { const t = fs.readFileSync(cfg, 'utf8').replace(/[/][*][^]*?[*][/]/g, ''); c.info(/anonKey:\s*'[^']+'/.test(t) ? 'opinions/config.js has Supabase keys filled in (the anon key is public by design)' : 'opinions/config.js is empty = the public site shows "Opinions are coming soon" (demo mode on localhost only); fill in before launching Opinions'); }
});

// =========================== 6. mixed content =============================================
check('No http:// (insecure) resources', c => {
  let n = 0;
  for (const f of pub.filter(f => /\.(html?|css|js|webmanifest|svg|xml)$/i.test(f.rel) && f.size < 3 * 1048576)) {
    if (/^(sitemap\.xml)$/.test(f.rel) || /\/vendor\//.test(f.rel)) continue;
    const text = read(f);
    for (const m of text.matchAll(/(?:src|href|action|url\(|fetch\()\s*=?\s*["'(]?\s*(http:\/\/[^\s"'<>)]+)/gi)) {
      const u = m[1];
      if (/^http:\/\/(www\.w3\.org|localhost|127\.0\.0\.1)/i.test(u)) continue;
      if (/^(xmlns)/.test(u)) continue;
      n++; if (n <= 15) c.fail(`${f.rel}: ${u}`);
    }
  }
  if (n > 15) c.fail('...and ' + (n - 15) + ' more');
});

// =========================== 7. page basics ===============================================
check('Every page has lang, title and viewport; images have alt', c => {
  let bad = 0;
  for (const f of htmlFiles) {
    if (/^assets\/logos\//.test(f.rel)) continue;
    const t = read(f);
    const body = stripHtml(t);
    const problems = [];
    if (!/<html[^>]*\blang=["'][a-z]/i.test(t)) problems.push('no <html lang>');
    if (!/<title>\s*[^<\s][^<]*<\/title>/i.test(t)) problems.push('no/empty <title>');
    if (!/<meta[^>]+name=["']viewport["']/i.test(t)) problems.push('no viewport meta');
    for (const m of body.matchAll(/<img\b[^>]*>/gi)) if (!/\balt\s*=/i.test(m[0])) { problems.push('<img> without alt'); break; }
    if (problems.length) { bad++; c.fail(f.rel + ': ' + problems.join(', ')); }
  }
  c.info(htmlFiles.length + ' pages checked');
});
check('Deployment extras present (warnings = to do before launch)', c => {
  for (const need of ['404.html', 'robots.txt', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png']) if (!pubSet.has(need)) c.warn('missing: ' + need);
  if (!pubSet.has('sitemap.xml')) c.warn('sitemap.xml missing: run node tools/build-sitemap.js after setting tools/site-config.json');
  else { const cfg = lib.readConfig(); if (/example\.com/.test(cfg.baseUrl)) c.warn('tools/site-config.json still says example.com; set the real address, then run build-sitemap.js'); }
  const idx = pub.find(f => f.rel === 'index.html');
  if (idx) {
    const t = read(idx);
    if (!/rel=["']manifest["']/.test(t)) c.warn('index.html has no manifest link yet (apply deploy/HEAD-PATCH.md)');
    if (!/rel=["']canonical["']/.test(t)) c.warn('index.html has no canonical link yet (apply deploy/HEAD-PATCH.md)');
    if (!/viewport-fit=cover/.test(t)) c.warn('index.html viewport lacks viewport-fit=cover (HEAD-PATCH.md)');
  }
  const robotsPages = ['opinions/admin.html', 'opinions/write.html', 'opinions/account.html', 'ads-status.html'];
  for (const p of robotsPages) { const f = pub.find(x => x.rel === p); if (f && !/name=["']robots["'][^>]*noindex/i.test(read(f))) c.warn(p + ' has no noindex meta yet'); }
});

check('Security policy matches the ad switch; owner-only files are not published', c => {
  // Ads on + a CSP built WITHOUT --ads = the browser silently blocks every ad. Ads off + an --ads CSP = needlessly loose.
  let adsOn = false;
  try { const cfg = fs.readFileSync(path.join(ROOT, 'assets', 'ads', 'ads-config.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); adsOn = /^\s*enabled:\s*true/m.test(cfg); } catch (e) { /* no config */ }
  let withCsp = 0, withAdsCsp = 0;
  for (const h of htmlFiles) { const t = read(h); if (/http-equiv=["']Content-Security-Policy["']/i.test(t)) { withCsp++; if (/securepubads\.g\.doubleclick\.net/.test(t)) withAdsCsp++; } }
  if (withCsp) {
    if (adsOn && withAdsCsp < withCsp) c.fail('ads are enabled in ads-config.js but ' + (withCsp - withAdsCsp) + ' page(s) have a CSP built WITHOUT --ads: no ad would load. Change the pages.yml step to build-csp.js ... --ads (ADS-SETUP.md section 13).');
    if (!adsOn && withAdsCsp) c.warn('ads are off but the CSP was built with --ads (looser than needed). Drop --ads in pages.yml.');
    c.info(withCsp + ' of ' + htmlFiles.length + ' pages carry a CSP' + (withAdsCsp ? ' (ad vendors allowed)' : ' (no ad vendors)'));
  } else if (folderMode) c.warn('no page has a Content-Security-Policy yet (the pages.yml step "Add the Content-Security-Policy tags" adds it to the built copy)');
  if (folderMode && pubSet.has('ads-status.html')) c.fail('ads-status.html is in the deploy folder (owner-only page; deploy-lib leaves it out)');
  const st = pub.filter(f => /(^|\/)security\.txt$/.test(f.rel));
  for (const f of st) { if (/YOUR-[A-Z0-9]/.test(read(f))) c.fail(f.rel + ' still has YOUR-... placeholders'); }
  c.info('security.txt published: ' + (st.length ? st.map(f => f.rel).join(', ') : 'no (template not filled in yet)'));
});

// =========================== Opinions switch ================================================
check('Opinions switch: ' + (OPS.on ? 'ON' : 'OFF') + ' (' + OPS.reason + ')', c => {
  const hasFolder = pubSet.has('opinions/index.html') || [...pubSet].some(p => p.startsWith('opinions/'));
  const hasSupabaseDir = [...pubSet].some(p => /^supabase\//.test(p));
  if (hasSupabaseDir) c.fail('the supabase/ folder (SQL and setup notes) is in the published files');
  if (!OPS.on) {
    if (hasFolder) c.fail('Opinions is OFF but the opinions/ folder would be published');
    const leaks = [];
    for (const f of pub) {
      if (/^opinions\//.test(f.rel)) continue;
      const isText = /\.(html?|webmanifest|xml|txt|json)$/i.test(f.rel) && f.size < 3 * 1048576 && !/^(games\/.*\.json)$/.test(f.rel);
      if (!isText) continue;
      const t = read(f);
      if (/\.html?$/i.test(f.rel)) {
        for (const r of refs(t)) if (/(^|\/)opinions\//i.test(r.url) && !isExternal(r.url)) leaks.push(f.rel + ': link to ' + r.url);
        if (/supabase/i.test(stripHtml(t))) leaks.push(f.rel + ': mentions Supabase');
        if (/\sdata-op(\s|>|=)/.test(t)) leaks.push(f.rel + ': an Opinions-only element (data-op) is still there');
        if (/<(a|li)\b[^>]*>\s*Opinions\b/i.test(t) && !/^privacy|^terms/.test(f.rel)) leaks.push(f.rel + ': an "Opinions" menu or link text');
      } else if (/(manifest|sitemap|robots)/i.test(f.rel) && /opinions/i.test(t)) leaks.push(f.rel + ': mentions opinions');
    }
    const sj = pub.find(f => f.rel === 'assets/site.js');
    if (sj && !/const OPINIONS_BUILD = 'off';/.test(read(sj))) leaks.push("assets/site.js: OPINIONS_BUILD is not 'off' (the page would try to load opinions/db.js)");
    leaks.slice(0, 20).forEach(l => c.fail(l));
    if (leaks.length > 20) c.fail('...and ' + (leaks.length - 20) + ' more');
    c.info('no opinions/ folder, no links to it, no sign-in link, nothing for Supabase in the published files' + (leaks.length ? ' (PROBLEMS ABOVE)' : ' (verified)'));
    const priv = pub.find(f => f.rel === 'privacy.html');
    if (priv && /Opinions accounts|create an Opinions account/i.test(read(priv))) c.fail('privacy.html still describes Opinions accounts while Opinions is off (use the Phase 0 page; see legal/archive-phase1-pages)');
  } else {
    if (!hasFolder) c.fail('Opinions is ON but the opinions/ folder is not in the published files');
    if (!OPS.hasKeys) c.warn('Opinions is ON without Supabase keys (enabled is true = demo mode with fake posts). Do not publish this to the public. Fill in url and anonKey in opinions/config.js (supabase/SETUP.md) or set enabled: false.');
    if (OPS.hasKeys) {
      const priv = pub.find(f => f.rel === 'privacy.html'), terms = pub.find(f => f.rel === 'terms.html');
      if (priv && !/Opinions account/i.test(read(priv))) c.fail('Opinions is ON but privacy.html is the Phase 0 page (no accounts). Restore the Phase 1 page from legal/archive-phase1-pages/ and refill the placeholders first.');
      if (terms && !/Your content and our licence|user content|your content/i.test(read(terms))) c.fail('Opinions is ON but terms.html has no user-content terms. Restore the Phase 1 page from legal/archive-phase1-pages/ first.');
      if (!pubSet.has('dmca.html') || !/designated agent/i.test(pub.find(f => f.rel === 'dmca.html') ? read(pub.find(f => f.rel === 'dmca.html')) : '')) c.warn('Opinions is ON: dmca.html has no designated-agent section (register the agent with the Copyright Office and restore the Phase 1 page).');
    }
  }
});

// =========================== launch gate ===================================================
check('Launch gate: no [BRACKETED] placeholders, real address' + (LAUNCH ? ' (STRICT: --launch / launched)' : ' (advisory until --launch)'), c => {
  const left = new Map();
  for (const f of pub.filter(f => /\.(html?|txt)$/i.test(f.rel) && f.size < 3 * 1048576)) {
    let t = read(f);
    if (/\.html?$/i.test(f.rel)) t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
    for (const m of t.matchAll(/\[[^\]\n<>]{1,90}\]/g)) {
      if (!/[A-Za-z]{3}/.test(m[0])) continue;                       // [1] and similar footnote marks are fine
      if (!left.has(f.rel)) left.set(f.rel, new Set());
      left.get(f.rel).add(m[0]);
    }
    if (/\bYOUR-[A-Z0-9][A-Z0-9-]*/.test(t)) { if (!left.has(f.rel)) left.set(f.rel, new Set()); left.get(f.rel).add('YOUR-... template value'); }
  }
  const total = [...left.values()].reduce((s, v) => s + v.size, 0);
  const say = LAUNCH ? c.fail : c.warn;
  for (const [rel, set] of [...left].slice(0, 20)) say(rel + ': ' + [...set].slice(0, 8).join('  '));
  if (left.size > 20) say('...and ' + (left.size - 20) + ' more pages');
  if (total) say('fill them with tools/fill-placeholders.js (see LAUNCH-CHECKLIST.md step 4)');
  const cfg = lib.readConfig();
  if (/example\.(com|org|net)/.test(cfg.baseUrl || '')) say('tools/site-config.json baseUrl is still ' + cfg.baseUrl);
  if (!pub.some(f => /(^|\/)security\.txt$/.test(f.rel))) say('security.txt is not published (fill its YOUR-... values: fill-placeholders.js does it)');
  if (pub.some(f => f.rel === 'robots.txt') && /example\.com/.test(read(pub.find(f => f.rel === 'robots.txt')))) say('robots.txt still points to example.com (run node tools/build-sitemap.js)');
  c.info(total ? total + ' placeholder token(s) left on ' + left.size + ' page(s)' : 'no [BRACKETED] placeholders on any published page');
});

// =========================== report =======================================================
const icon = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL' };
console.log('\nPre-deploy check of ' + ROOT + '\n' + '='.repeat(60));
for (const r of results) {
  console.log(`[${icon[r.status]}] ${r.name}`);
  for (const d of r.details) console.log('       ' + d);
}
const fails = results.filter(r => r.status === 'FAIL').length, warns = results.filter(r => r.status === 'WARN').length;
console.log('='.repeat(60));
console.log(fails ? `RESULT: FAIL (${fails} check${fails > 1 ? 's' : ''} failed, ${warns} warning${warns === 1 ? '' : 's'}). Do not deploy yet.`
  : `RESULT: PASS${warns ? ` with ${warns} warning${warns > 1 ? 's' : ''} (to-do items, not blockers)` : ''}. Safe to deploy.`);
process.exit(fails ? 1 : 0);
