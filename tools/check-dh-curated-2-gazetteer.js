#!/usr/bin/env node
'use strict';
/* Independent check of the Census-based round-2 questions (places-<state>, counties-texas, counties-georgia): every accepted answer must be an active
   incorporated place (or New England town) / county in the Census Bureau 2023 Gazetteer, a different Census product from the population-estimate file the
   questions were built from.
   Usage: node site/tools/check-dh-curated-2-gazetteer.js <folder with 2023_Gaz_place_national.txt, 2023_Gaz_cousubs_national.txt, 2023_Gaz_counties_national.txt>
   (files: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/ ). Writes audit/dh-curated2-data/_gazetteer-check.json */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BANKS = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const GZ = process.argv[2];
if (!GZ) { console.log('give the Gazetteer folder'); process.exit(1); }
const AB = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const rd = f => { const L = fs.readFileSync(path.join(GZ, f), 'latin1').split(/\r?\n/).filter(Boolean); const h = L[0].split('\t').map(x => x.trim()); return L.slice(1).map(l => { const c = l.split('\t').map(x => x.trim()); return Object.fromEntries(h.map((k, i) => [k, c[i]])); }); };
const strip = s => s.replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|metro government|city|town|village|borough|municipality|plantation|corporation|CDP|county)\s*$/i, '').replace(/\s*\((balance|part)\)\s*$/i, '').trim();
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const P = new Map(); // USPS|base name -> status
for (const f of ['2023_Gaz_place_national.txt', '2023_Gaz_cousubs_national.txt']) for (const r of rd(f)) { const k = r.USPS + '|' + fold(strip(Buffer.from(r.NAME, 'latin1').toString('utf8'))); if (r.FUNCSTAT === 'A' || !P.has(k)) P.set(k, r.FUNCSTAT); }
const C = new Set(rd('2023_Gaz_counties_national.txt').map(r => r.USPS + '|' + fold(Buffer.from(r.NAME, 'latin1').toString('utf8'))));
const out = [];
for (const f of fs.readdirSync(BANKS).filter(f => /^bank-curated2-\d+\.json$/.test(f))) {
  for (const q of JSON.parse(fs.readFileSync(path.join(BANKS, f), 'utf8')).questions) {
    const pm = q.prompt.match(/in (Texas|California|Florida|New York|Pennsylvania|Illinois|Ohio|Georgia|North Carolina|Michigan|New Jersey|Massachusetts)\b/);
    if (!pm || !/^Name an? (incorporated city|city|borough|county)/.test(q.prompt)) continue;
    const st = pm[1], isCounty = /^Name a county/.test(q.prompt); let bad = [];
    for (const a of q.answers) {
      const SPECIAL = { Augusta: 'Augusta-Richmond County consolidated government', Macon: 'Macon-Bibb County', Athens: 'Athens-Clarke County unified government' };
      const k = AB[st] + '|' + fold(isCounty ? a.name : (st === 'Georgia' && SPECIAL[a.name] ? strip(SPECIAL[a.name] + ' (balance)') : a.name));
      const ok = isCounty ? C.has(k) : P.get(k) === 'A';
      if (!ok) bad.push(a.name + ' [' + (isCounty ? 'no county' : (P.get(k) || 'no match')) + ']');
    }
    out.push({ id: q.id, state: st, kind: isCounty ? 'county' : 'place', answers: q.answers.length, notActiveOrUnmatched: bad });
    console.log(q.id, st, isCounty ? 'counties' : 'places', q.answers.length, 'not matched:', bad.length, bad.slice(0, 8).join('; '));
  }
}
fs.writeFileSync(path.join(ROOT, 'audit', 'dh-curated2-data', '_gazetteer-check.json'), JSON.stringify(out, null, 1));
