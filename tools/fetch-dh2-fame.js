#!/usr/bin/env node
/* Fame audit for Dark Horse derived banks round 2. The weight (1-5 = 5/20/45/70/100 points) of a person without cached Wikipedia page views comes from a structural prior
   (offices held, years served), which under- and over-rates people. This measures real views for the people who are in a round-2 answer list and stores them.
   Page views come from the "Page views in the past 30 days" line of each article's "Page information" page (index.php?action=info), because the page-view REST API rate-limits this machine.
   Usage:  node site/tools/build-dh-derived-2.js --out <tmp> --dump-fame <tmp>/fame.json     (writes the list of people to measure)
           node site/tools/fetch-dh2-fame.js <tmp>/fame.json [N]                              (writes people-db/cache/dh2-fame-measured.json  { id: views in the 30 days before the run, _ok: [ids whose page is a real article, not a redirect] }; N = only the N highest-prior people)
   Resumable and polite (one request every ~0.5 s, descriptive User-Agent). build-dh-derived-2.js uses a measured value in place of the structural prior when the page is a real article (_ok), and only as an upgrade otherwise. */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const OUT = path.resolve(__dirname, '..', '..', 'people-db', 'cache', 'dh2-fame-measured.json');
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const M = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
M._ok = M._ok || [];   // a measured person counts as confirmed only when the page is an article (a redirect title shows almost no views)
const OKSET = new Set(M._ok);
const UA = 'StayInformedNews-DarkHorse-audit/1.0 (page view audit, low volume)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getText = u => new Promise((res, rej) => https.get(u, { headers: { 'User-Agent': UA }, timeout: 30000 }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => r.statusCode === 200 ? res(b) : rej(Object.assign(new Error('HTTP ' + r.statusCode), { code: r.statusCode, retry: +r.headers['retry-after'] || 0 }))); }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); }));
(async () => {
  const todo = list.filter(r => !r.cached && !OKSET.has(r.id) && r.title && !(M._redir || []).includes(r.id));
  const LIMIT = +process.argv[3] || 1e9;
  const work = todo.sort((a, b) => b.fame - a.fame).slice(0, LIMIT);
  console.log('to measure', work.length, 'of', list.filter(r => !r.cached).length, 'uncached people');
  let n = 0, next = 0;
  async function worker() {
    while (next < work.length) {
      const r = work[next++];
      const u = 'https://en.wikipedia.org/w/index.php?action=info&title=' + encodeURIComponent(r.title.replace(/ /g, '_'));
      for (let k = 0; k < 6; k++) {
        try {
          const h = await getText(u);
          const m = /Page views in the past 30 days<\/th><td><div class="mw-pvi-month"><a[^>]*>([\d,]+)<\/a>/.exec(h);
          if (/class="mw-redirect" title="View the content page/.test(h)) { (M._redir = M._redir || []).push(r.id); break; }
          if (m) { M[r.id] = +m[1].replace(/,/g, ''); if (!OKSET.has(r.id)) { OKSET.add(r.id); M._ok.push(r.id); } }
          break;
        } catch (e) { if (e.code === 404) break; await sleep(e.code === 429 ? ((e.retry || 20) + 3) * 1000 : 2000 * (k + 1)); }
      }
      if (++n % 50 === 0) { fs.writeFileSync(OUT, JSON.stringify(M)); console.log('measured', n, '/', work.length); }
      await sleep(300);
    }
  }
  await Promise.all([worker(), worker(), worker()]);   // three at a time
  fs.writeFileSync(OUT, JSON.stringify(M)); console.log('done', Object.keys(M).length);
})();
