#!/usr/bin/env node
'use strict';
/* Dark Horse curated banks, round 2: downloads the source listings and enrichment (see dh-curated2-config.js).
   Output (audit/dh-curated2-data/):
     <source>.json     list of {t: English Wikipedia title, s: language editions, st: Wikidata statements, y: year or null, q: Wikidata id, ds: short description, x: extra}
     _intros.json      { title: first sentences of the English Wikipedia article }  (seeded from the round-1 cache)
     _pageviews.json   { title: English Wikipedia page views, 12 months Oct 2025 - Sep 2026 (human users) }  = the fame proxy for weights
   Usage: node site/tools/fetch-dh-curated-2.js [--force] [--no-enrich] [source ...]
   Needs internet. Resumable (caches are kept). */
const fs = require('fs');
const path = require('path');
const { SOURCES } = require('./dh-curated2-config.js');
const UA = 'StayInformedNewsTriviaBot-curated2/1.0 (educational trivia research; one request at a time)';
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'audit', 'dh-curated2-data');
const OLD = path.join(ROOT, 'audit', 'dh-curated-data');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

async function sparql(q) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(q) });
      if (r.ok) return (await r.json()).results.bindings;
      if (r.status === 429 || r.status >= 500) { await sleep(10000 * (i + 1)); continue; }
      throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    } catch (e) { if (i === 5) throw e; await sleep(4000); }
  }
}
function buildQuery(c) {
  const lo = c.lo, hi = c.hi;
  const hasDate = !!c.date;
  const sel = c.extra ? ' ' + c.extra.sel : '';
  return `SELECT ?x ?t ?s ?st (SAMPLE(?dd) AS ?ds) (MIN(?y0) AS ?yy)${sel} WHERE { ${c.pattern}
  ?a schema:about ?x; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. ?x wikibase:sitelinks ?s; wikibase:statements ?st.
  OPTIONAL { ?x schema:description ?dd. FILTER(LANG(?dd) = 'en') }
  ${hasDate ? 'OPTIONAL { ?x ' + c.date + ' ?d0. } BIND(YEAR(?d0) AS ?y0)' : ''} }
  GROUP BY ?x ?t ?s ?st${sel ? ' ' + c.extra.group : ''} LIMIT ${c.limit || 9000}`;
}
async function getJson(url) {
  for (let k = 0; k < 40; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.json();
      const ra = +r.headers.get('retry-after') || 20;
      await sleep(Math.min(120, ra + 3 + k) * 1000);
    } catch (e) { await sleep(5000); }
  }
  throw new Error('getJson gave up: ' + url.slice(0, 120));
}
async function fetchPageviews(titles, cache, file) {
  const todo = titles.filter(t => !(t in cache));
  console.log('pageviews to fetch:', todo.length);
  let i = 0, done = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      const u = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + encodeURIComponent(t.replace(/ /g, '_')) + '/monthly/2025100100/2026093000';
      for (let k = 0; k < 25; k++) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': UA } });
          if (r.status === 404) { cache[t] = 0; break; }
          if (r.ok) { const j = await r.json(); cache[t] = (j.items || []).reduce((a, b) => a + b.views, 0); await sleep(450); break; }
          await sleep(Math.min(90, (+r.headers.get('retry-after') || 5) + 1) * 1000);
        } catch (e) { await sleep(3000); }
      }
      if (++done % 100 === 0) { fs.writeFileSync(file, JSON.stringify(cache)); console.log('  views', done); }
    }
  }
  await Promise.all(Array.from({ length: 1 }, worker));
  fs.writeFileSync(file, JSON.stringify(cache));
}
async function fetchIntros(titles, cache, file) { // REST summary endpoint (own rate-limit bucket); first paragraph of the article, 700 characters
  const todo = titles.filter(t => !(t in cache));
  console.log('intros to fetch:', todo.length);
  let i = 0, done = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      const u = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')) + '?redirect=true';
      for (let k = 0; k < 8; k++) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': UA } });
          if (r.status === 404) { cache[t] = ''; break; }
          if (r.ok) { const j = await r.json(); await sleep(400); cache[t] = (j.type === 'disambiguation' ? '' : (j.extract || '')).replace(/\s+/g, ' ').trim().slice(0, 700); break; }
          await sleep(Math.min(60, (+r.headers.get('retry-after') || 3) + k) * 1000);
        } catch (e) { await sleep(2000); }
      }
      /* a failed title stays unset, so a re-run retries it */
      if (++done % 40 === 0) { fs.writeFileSync(file, JSON.stringify(cache)); console.log('  intros', done); }
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  fs.writeFileSync(file, JSON.stringify(cache));
}

/* A Wikipedia list table: every row whose first cell links to an article gives {t: article (redirects resolved), n: displayed name, y: first plain 4-digit cell}. */
async function wikitable(c) {
  const u = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&action=parse&prop=wikitext&page=" + encodeURIComponent(c.wikitable);
  const w = (await getJson(u)).parse.wikitext;
  const rows = [];
  const heads = []; { const re = /^(={2,4})\s*(.+?)\s*\1\s*$/mg; let hm; while ((hm = re.exec(w))) heads.push([hm.index, hm[2]]); }
  let pos = 0;
  for (const blk of w.split(/\n\|-[^\n]*\n/)) {
    const here = pos; pos += blk.length + 4;
    const cells = blk.split(/\n\|(?!\})\s*/).map(x => x.replace(/^\|\s*/, '').trim());
    const m = (cells[0] || '').match(/^\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
    if (!m) continue;
    const yc = cells.slice(1, 6).map(x => x.match(/^(\d{4})$/)).find(Boolean);
    let sec = ''; for (const h of heads) if (h[0] <= here) sec = h[1];
    rows.push({ t: m[1].trim(), n: (m[2] || m[1]).trim(), y: yc ? +yc[1] : null, sec });
  }
  // resolve redirects
  const out = [];
  for (let i = 0; i < rows.length; i += 40) {
    const b = rows.slice(i, i + 40);
    const j = await getJson("https://en.wikipedia.org/w/api.php?format=json&action=query&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=" + encodeURIComponent(b.map(r => r.t).join("|")));
    const map = {}; (j.query.normalized || []).forEach(r => map[r.from] = r.to); (j.query.redirects || []).forEach(r => map[r.from] = r.to);
    const q = {}; for (const p of Object.values(j.query.pages || {})) q[p.title] = p.pageprops ? p.pageprops.wikibase_item : "";
    for (const r of b) { let k = r.t; for (let n = 0; n < 3 && map[k]; n++) k = map[k]; out.push({ t: k, n: r.n, y: r.y, q: q[k] || "", s: 0, st: 0, ds: "", sec: r.sec }); }
    await sleep(150);
  }
  return out;
}
/* Wikipedia "List of Latin legal terms": every table row whose first cell holds the term in italics (display text; link target used for page views). */
async function latinTerms(c) {
  let w = null;
  for (let k = 0; k < 10 && !w; k++) { try { const r = await fetch('https://en.wikipedia.org/w/index.php?title=' + c.rawlist + '&action=raw', { headers: { 'User-Agent': UA } }); if (r.ok) w = await r.text(); else await sleep(15000); } catch (e) { await sleep(5000); } }
  const out = [];
  for (const r of w.split(/\n\|-[^\n]*\n/).slice(1)) {
    const m = r.split('\n')[0].match(/''(.+?)''/); if (!m) continue;
    let txt = m[1], link = null, name = txt;
    const lm = txt.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (lm) { link = lm[1].replace(/#.*$/, ''); name = lm[2] || lm[1]; }
    name = name.replace(/\[\[|\]\]/g, '').replace(/^wikt:/i, '').trim();
    if (link && /^(Wiktionary:|Wikt:)/i.test(link)) link = null;
    out.push({ t: link || ('~' + name), n: name, y: null, q: '', s: 0, st: 0, ds: '', nolink: !link });
  }
  return out;
}
/* Sitelink and statement counts (the fame proxy) for list rows that came from a Wikipedia list rather than a Wikidata query: looked up by article title. */
async function lookupSitelinks(rows) {
  const need = rows.filter(r => r.t && r.t[0] !== '~' && !r.s);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const lit = t => '"' + t.split('\\').join('\\\\').split('"').join('\\"') + '"@en';
  for (let i = 0; i < need.length; i += 120) {
    const batch = need.slice(i, i + 120);
    const vals = [...new Set(batch.flatMap(r => [lit(r.t), lit(cap(r.t))]))].join(' ');
    const out = await sparql('SELECT ?t ?x ?s ?st WHERE { VALUES ?t { ' + vals + ' } ?a schema:name ?t; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?x. ?x wikibase:sitelinks ?s; wikibase:statements ?st }');
    const by = new Map(out.map(b => [b.t.value, b]));
    for (const r of batch) { const b = by.get(r.t) || by.get(cap(r.t)); if (b) { r.s = +b.s.value; r.st = +b.st.value; r.q = b.x.value.split('/').pop(); } }
    await sleep(1200);
  }
  return rows;
}
(async () => {
  const args = process.argv.slice(2); const force = args.includes('--force'); const noEnrich = args.includes('--no-enrich');
  const keys = args.filter(a => !a.startsWith('--'));
  const all = new Set(), allIntro = new Set();
  for (const c of SOURCES) {
    if (keys.length && !keys.includes(c.key)) continue;
    const f = path.join(OUT, c.key + '.json');
    if (c.reuse) { console.log('reuse', c.key); }
    else if (c.inlineFile) { console.log('inline', c.key); }
    else if (c.manualFile) { if (fs.existsSync(f) && !force) console.log('have', c.key); else { const m = JSON.parse(fs.readFileSync(path.join(__dirname, c.manualFile), 'utf8')).leaders; let d = await lookupSitelinks(m.map(([t, region, y]) => ({ t, region, y, s: 0, st: 0, q: '', ds: '' }))); const lost = d.filter(r => !r.s).map(r => r.t); d = d.filter(r => r.s); fs.writeFileSync(f, JSON.stringify(d)); console.log('saved', c.key, d.length, 'titles not found:', lost.join('; ')); } }
    else if (c.rawlist) { if (fs.existsSync(f) && !force) console.log('have', c.key); else { let d = await latinTerms(c); d = await lookupSitelinks(d); fs.writeFileSync(f, JSON.stringify(d)); console.log('saved', c.key, d.length); } }
    else if (c.wikitable) { if (fs.existsSync(f) && !force) console.log('have', c.key); else { let d = null; /* retried below */ for (let k = 0; k < 6 && !d; k++) { try { d = await wikitable(c); } catch (e) { console.log('retry wikitable', e.message.slice(0, 60)); await sleep(20000); } } d = await lookupSitelinks(d); fs.writeFileSync(f, JSON.stringify(d)); console.log('saved', c.key, d.length); } }
    else if (fs.existsSync(f) && !force) console.log('have', c.key);
    else {
      try {
        const data = (await sparql(buildQuery(c))).map(b => ({ t: b.t.value, s: +b.s.value, st: +b.st.value, y: b.yy && b.yy.value !== '' ? +b.yy.value : null, q: b.x.value.split('/').pop(), ds: b.ds ? b.ds.value : '', x: c.extra ? c.extra.read(b) : undefined }));
        fs.writeFileSync(f, JSON.stringify(data));
        console.log('saved', c.key, data.length);
      } catch (e) { console.log('FAILED', c.key, e.message); }
      await sleep(1500);
    }
    const rows = readJson(f, null) || (c.reuse ? readJson(path.join(OLD, c.reuse), []) : []);
    let sel = rows.filter(r => !/^(List|Lists|Timeline|Outline) of /.test(r.t) && r.t[0] !== '~' && (!c.want || c.want(r)));
    if (c.viewsTop) sel = sel.slice().sort((a, b) => (b.s - a.s) || (b.st - a.st)).slice(0, c.viewsTop); // page views only for the best-known titles of a big list; the tail is tier 5 anyway
    sel.forEach(r => { if (!c.skipViews) all.add(r.t); });
    if (c.intro) sel.slice().sort((a, b) => (b.s - a.s) || (b.st - a.st)).slice(0, c.introTop || 1e9).forEach(r => allIntro.add(r.t)); // best-known titles first: the lead sentence is read only to date the ones Wikidata cannot
  }
  if (args.includes('continents')) { // continent(s) of every country that appears in the leader listings (P30, else the continent of the country it succeeded or replaced)
    const cc = new Set();
    for (const k of ['leaders', 'leaders2']) for (const r of readJson(path.join(OUT, k + '.json'), [])) if (r.x && r.x[1]) cc.add(r.x[1]);
    const list = [...cc]; const res = {};
    for (let i = 0; i < list.length; i += 150) {
      const vals = list.slice(i, i + 150).map(q => 'wd:' + q).join(' ');
      const rows = await sparql(`SELECT ?c ?k ?cl WHERE { VALUES ?c { ${vals} } OPTIONAL { ?c wdt:P30 ?k } OPTIONAL { ?c rdfs:label ?cl FILTER(LANG(?cl)='en') } }`);
      for (const b of rows) { const q = b.c.value.split('/').pop(); res[q] = res[q] || { l: b.cl ? b.cl.value : '', k: [] }; if (b.k) { const kq = b.k.value.split('/').pop(); if (!res[q].k.includes(kq)) res[q].k.push(kq); } }
    }
    // countries without P30: take the continent of what they were a part of / succeeded (P361, P155, P156, P17 chain, two steps)
    const miss = list.filter(q => !res[q] || !res[q].k.length);
    for (let i = 0; i < miss.length; i += 100) {
      const vals = miss.slice(i, i + 100).map(q => 'wd:' + q).join(' ');
      const rows = await sparql(`SELECT ?c ?k WHERE { VALUES ?c { ${vals} } ?c wdt:P361|wdt:P155|wdt:P156|wdt:P1365|wdt:P1366|wdt:P17|wdt:P131|wdt:P37 ?o. ?o wdt:P30 ?k }`);
      for (const b of rows) { const q = b.c.value.split('/').pop(); res[q] = res[q] || { l: '', k: [] }; const kq = b.k.value.split('/').pop(); if (!res[q].k.includes(kq)) res[q].k.push(kq); }
    }
    fs.writeFileSync(path.join(OUT, '_continents2.json'), JSON.stringify(res));
    console.log('continents for', list.length, 'countries; still without:', list.filter(q => !res[q] || !res[q].k.length).length);
  }
  if (noEnrich) return;
  const ic = path.join(OUT, '_intros.json'), pc = path.join(OUT, '_pageviews.json');
  const intros = readJson(ic, null) || readJson(path.join(OLD, '_intros.json'), {});
  // Wikipedia page views and lead sentences are fetched only on request (VIEWS=1 / INTROS=1): the Wikimedia APIs rate-limit this shared IP to a trickle, so the weights use Wikidata sitelink counts
  if (process.env.VIEWS) await fetchPageviews([...all], readJson(pc, {}), pc);
  if (process.env.INTROS) await fetchIntros([...allIntro], intros, ic);
  console.log('done');
})();
