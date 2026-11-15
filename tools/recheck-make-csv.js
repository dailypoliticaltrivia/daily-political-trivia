#!/usr/bin/env node
'use strict';
/* Writes audit/dh-curated-check.csv from sample TSV files (recheck-dh-curated.js output) plus a verdicts JSON ({ "<file>:<row>": ["not"|"unsure", "note"] }; every other row is "ok").
   Usage: node site/tools/recheck-make-csv.js <out.csv> <verdicts.json> <sample.tsv> [sample.tsv ...] */
const fs = require('fs');
const path = require('path');
const [out, vfile, ...files] = process.argv.slice(2);
const V = JSON.parse(fs.readFileSync(vfile, 'utf8'));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'audit', 'dh-curated-data', '_ids.json'), 'utf8'));
const CLAIM = {
  'sc-cases': 'is a case decided by the U.S. Supreme Court', 'us-prisons': 'is a prison, jail or detention facility in the U.S.', 'battles-us-soil': 'is a battle fought on present-day U.S. territory',
  'wars-pre1800': 'is a war/rebellion/uprising that began before 1800', 'wars-1800-1945': 'is a war/rebellion/uprising that began 1800-1945', milops: 'is a military operation/campaign/offensive begun 1900 or later',
  'former-states-pre1800': 'is a state that ceased to exist before 1800', 'former-states-1800-1945': 'is a state that ceased to exist 1800-1945', 'former-states-1946': 'is a state that ceased to exist in 1946 or later',
  'treaties-pre1800': 'is a treaty signed before 1800', 'treaties-1800-1945': 'is a treaty signed 1800-1945', 'treaties-1946': 'is a treaty/convention/accord signed 1946 or later',
  'us-parties': 'is a political party in the U.S.', 'parties-europe-old': 'is a European political party founded before 1990', 'parties-europe-new': 'is a European political party founded 1990 or later',
  'parties-asia': 'is a political party from Asia', 'parties-africa': 'is a political party from Africa', 'parties-s-america': 'is a political party from South America', 'parties-n-america': 'is a political party from Canada/Mexico/Central America/Caribbean',
  'think-tanks': 'is a think tank / policy research institute', 'us-agencies': 'is a U.S. federal agency/bureau/commission/office', 'us-military-sites': 'is a U.S. military base/fort/camp/installation',
  'capitals-ever': 'is or was the capital of a country/kingdom/empire/historical state', ministries: 'is a government ministry or department', legislatures: 'is a legislature/assembly/council',
  'county-seats': 'is the (current) county seat of a U.S. county', 'us-counties': 'is a U.S. county or county-equivalent', 'us-places-10k': 'is a U.S. incorporated city/town/village/borough with at least 10,000 residents (2023)', 'us-places-small': 'is a U.S. incorporated place with 1,000-4,999 residents (2023)',
};
const R = path.join(__dirname, '..', '..');
const keyOf = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
const bankNames = {};
for (const f of [1, 2]) { try { for (const qq of JSON.parse(fs.readFileSync(path.join(R, 'site', 'games', 'dark-horse', 'data', 'bank-curated-' + f + '.json'), 'utf8')).questions) bankNames[keyOf[qq.id]] = new Set(qq.answers.map(a => a.name)); } catch (e) { } }
let OY = new Set(); try { const nrm = x => x.toLowerCase().replace(/\bv\.?\b/g, " v ").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(inc|co|corp|ltd|llc|the|of|et|al)\b/g, " ").replace(/\s+/g, " ").trim(); OY = new Set(JSON.parse(fs.readFileSync(path.join(R, "audit", "dh-curated-data", "_oyez-index.json"), "utf8")).map(x => nrm(x[1]))); OY.nrm = nrm; } catch (e) { }
const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const lines = ['question_id,answer,claim,source_url,result,note,in_final_bank'];
for (const f of files) {
  const tag = path.basename(f);
  fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).forEach((l, i) => {
    const c = l.split('\t'); const key = c[1]; const v = V[tag + ':' + (i + 1)] || ['ok', ''];
    const census = /^(us-places|us-counties)/.test(key);
    const url = census ? 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/ + https://en.wikipedia.org/wiki/' + encodeURIComponent(c[4].replace(/ /g, '_')) : key === 'sc-cases' ? 'https://www.oyez.org/ or https://en.wikipedia.org/wiki/' + encodeURIComponent(c[4].replace(/ /g, '_')) : 'https://en.wikipedia.org/wiki/' + encodeURIComponent(c[4].replace(/ /g, '_'));
    const inb = bankNames[key] && bankNames[key].has(c[2]) ? 'yes' : 'no (removed by a later filter)';
    let url2 = url; if (key === 'sc-cases') url2 = (OY.nrm && OY.has(OY.nrm(c[2])) ? 'https://www.oyez.org/ (case name found in Oyez index) and ' : '') + 'https://en.wikipedia.org/wiki/' + encodeURIComponent(c[4].replace(/ /g, '_'));
    lines.push([c[0], q(c[2]), q(c[2] + ' ' + (CLAIM[key] || key) + (c[6] !== '' ? ' (year/pop used: ' + c[6] + ')' : '')), q(url2), v[0], q(v[1] || ''), q(inb)].join(','));
  });
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.length - 1 + ' rows');
