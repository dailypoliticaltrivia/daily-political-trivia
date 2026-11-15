#!/usr/bin/env node
'use strict';
/* Builds a clean copy of exactly what gets published.   node tools/make-deploy-folder.js [outFolder]
   Default outFolder: ../deploy-site (next to the site folder). The folder is emptied first.
   It also applies the Opinions switch (opinions/config.js "enabled", see tools/deploy-lib.js): when Opinions is off, the
   opinions folder and every link to it are left out of the copy. It writes a CNAME file from tools/site-config.json
   "baseUrl" when that is a real custom domain (GitHub Pages deployed by Actions ignores the file; it is there so the
   copy also works if you ever switch to "Deploy from a branch"). */
const fs = require('fs');
const path = require('path');
const { SITE, publishFiles, opinionsState, transformPublished, TRANSFORMED, readConfig } = require('./deploy-lib');

const out = path.resolve(process.argv[2] || path.join(SITE, '..', 'deploy-site'));
if (out === SITE || SITE.startsWith(out + path.sep) || out.startsWith(SITE + path.sep) || path.parse(out).root === out) {
  console.error('Refusing: the output folder must be a separate folder outside the site folder: ' + out); process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = publishFiles();
const state = opinionsState();
let bytes = 0;
for (const f of files) {
  const dst = path.join(out, f.rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (TRANSFORMED(f.rel)) {                                  // pages, site.js, manifest, sitemap: apply the Opinions on/off rules
    const outText = transformPublished(f.rel, fs.readFileSync(f.full, 'utf8'), state);
    fs.writeFileSync(dst, outText); bytes += Buffer.byteLength(outText);
  } else { fs.copyFileSync(f.full, dst); bytes += f.size; }
}
// CNAME from baseUrl (custom domain only)
try {
  const host = new URL(readConfig().baseUrl).hostname;
  if (host && !/(^|\.)example\.(com|org|net)$/i.test(host) && !/\.github\.io$/i.test(host)) { fs.writeFileSync(path.join(out, 'CNAME'), host + '\n'); console.log('CNAME written: ' + host); }
} catch (e) { /* no usable baseUrl yet */ }
console.log('Opinions: ' + (state.on ? 'ON (' + state.mode + ' mode; ' + state.reason + ')' : 'OFF (' + state.reason + '): the opinions folder, its pages and every link to it are left out'));
console.log(`Deploy folder ready: ${out}`);
console.log(`${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
