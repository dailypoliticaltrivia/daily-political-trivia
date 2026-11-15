#!/usr/bin/env node
'use strict';
/* Independent check of round 3's Census questions: every answer of a places-/counties- question in bank-round3-*.json must be an
   active incorporated place (FUNCSTAT A, not a census-designated place) / a county or county-equivalent of the right state in the
   Census Bureau 2023 Gazetteer, a different Census product from the population-estimate file the lists were built from.
   Usage: node site/tools/check-dh-round3-gazetteer.js <folder with 2023_Gaz_place_national.txt and 2023_Gaz_counties_national.txt>
   (https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/). Writes audit/round3-dh-gazetteer.json */
const fs = require('fs'), path = require('path');
const GZ = process.argv[2]; if (!GZ) { console.log('give the Gazetteer folder'); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
function norm(s) { s = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr'); if (t.length > 1 && t[0] === 'the') t.shift(); return t.join(' '); }
const ABBR = { Maryland: 'MD', Virginia: 'VA', Missouri: 'MO', Minnesota: 'MN', Wisconsin: 'WI', Indiana: 'IN', Tennessee: 'TN', Washington: 'WA', Kentucky: 'KY', Kansas: 'KS', Illinois: 'IL', 'North Carolina': 'NC' };
const read = f => fs.readFileSync(path.join(GZ, f), 'utf8').split(/\r?\n/).slice(1).map(l => l.split('\t')).filter(r => r.length > 5);
const places = {}, counties = {};
for (const r of read('2023_Gaz_place_national.txt')) { if ((r[5] !== 'A' && !(r[5] === 'F' && /\(balance\)$/.test(r[3]))) || / CDP$/.test(r[3])) continue; const base = r[3].replace(/\s+\((balance|part)\)$/, '').replace(/\s+(city|town|village|borough|municipality|corporation)$/i, '').replace(/-Davidson metropolitan government$|\/Trousdale County$|, Moore County metropolitan government$|\/Jefferson County metro government$|-Fayette urban county$/, ''); (places[r[0]] = places[r[0]] || new Set()).add(norm(base)); }
for (const r of read('2023_Gaz_counties_national.txt')) (counties[r[0]] = counties[r[0]] || new Set()).add(norm(r[3]));
const out = { checked: 0, missing: [] };
for (const f of fs.readdirSync(DIR).filter(f => /^bank-round3-\d+\.json$/.test(f))) for (const q of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).questions) {
  const m = q.prompt.match(/(Maryland|Virginia|Missouri|Minnesota|Wisconsin|Indiana|Tennessee|Washington|Kentucky|Kansas|Illinois|North Carolina)/);
  const isCounty = /county/i.test(q.prompt), isPlace = /city|town|village/i.test(q.prompt) && !isCounty;
  if (!m || !(isCounty || isPlace) || /neighborhood/.test(q.prompt)) continue;
  const st = ABBR[m[1]];
  for (const a of q.answers) {
    out.checked++;
    let ok;
    if (isCounty) { const indep = / \(independent city\)$/.test(a.name); ok = indep ? counties[st].has(norm(a.name.replace(/ \(independent city\)$/, '') + ' city')) : counties[st].has(norm(a.name)); }
    else ok = places[st].has(norm(a.name));
    if (!ok) out.missing.push([q.id, m[1], a.name]);
  }
}
fs.writeFileSync(path.join(ROOT, 'audit', 'round3-dh-gazetteer.json'), JSON.stringify(out, null, 1));
console.log('checked', out.checked, 'not found', out.missing.length); out.missing.forEach(x => console.log('  ', x.join(' | ')));
