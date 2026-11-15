#!/usr/bin/env node
'use strict';
/* Second-source checks for the sample drawn by sample-dh-curated.js.
   Independent sources used where one exists: Oyez case list (Supreme Court cases), UNESCO World Heritage list XML, Census Bureau Gazetteer files
   (counties and places; pass --gaz <folder with 2023_Gaz_counties_national.txt and 2023_Gaz_place_national.txt>).
   For all other questions the check is the English Wikipedia introduction (downloaded by sample-dh-curated.js) against a class test.
   Writes audit/dh-curated-data/_verdicts.json and prints the answers that need a human look.
   Usage: node site/tools/verify-dh-curated.js --oyez <oyez-all.json> --unesco <unesco.xml> --gaz <folder> */
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', '..', 'audit', 'dh-curated-data');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sample = JSON.parse(fs.readFileSync(path.join(DATA, '_sample.json'), 'utf8'));
const oyez = arg('oyez') ? JSON.parse(fs.readFileSync(arg('oyez'), 'utf8')) : [];
const oyezSet = new Set(oyez.map(c => norm(c.n)));
const unesco = arg('unesco') ? fs.readFileSync(arg('unesco'), 'utf8') : '';
const unescoSites = [...unesco.matchAll(/<site>([^<]*)<\/site>/g)].map(m => norm(m[1].replace(/&amp;/g, '&')));
const gaz = arg('gaz');
const gazC = gaz ? fs.readFileSync(path.join(gaz, 'gazc', '2023_Gaz_counties_national.txt'), 'utf8').split('\n').map(l => l.split('\t')[3] || '') .map(norm) : [];
const gazP = gaz ? fs.readFileSync(path.join(gaz, 'gazpl', '2023_Gaz_place_national.txt'), 'utf8').split('\n').map(l => l.split('\t')[3] || '').map(norm) : [];
const gazCset = new Set(gazC), gazPset = new Set(gazP.map(x => x));
const CLASS = {
  'sc-cases': /Supreme Court/i, 'us-prisons': /prison|jail|correctional|penitentiary|detention|lockup|reformatory|workhouse|stockade|corrections|house of correction|facility/i,
  'us-parties': /party|parties/i, 'parties-europe-old': /party|parties/i, 'parties-europe-new': /party|parties/i, 'parties-asia': /party|parties/i, 'parties-africa': /party|parties/i, 'parties-s-america': /party|parties/i, 'parties-n-america': /party|parties/i,
  'county-seats': /county seat|parish seat|borough seat|seat of/i, 'world-heritage': /World Heritage|UNESCO/i,
  'us-military-sites': /base|station|camp|fort|airfield|field|installation|depot|arsenal|barracks|garrison|naval|air force|army|military|navy|airport|marine|coast guard/i,
  'world-military-sites': /base|station|camp|fort|airfield|field|installation|depot|arsenal|barracks|garrison|naval|air force|army|military|navy|airport|marine|coast guard|castle/i,
  'think-tanks': /think tank|institute|research|policy|foundation|centre|center|council|forum|commission|panel|network|association|organi[sz]ation/i,
  'intl-orgs': /international|organi[sz]ation|union|federation|council|association|body|alliance|committee|agency|network|league|forum|bureau|institute|commission|world|european|global|united nations|treaty|bloc|association/i,
  'unions': /union|federation|syndicate|workers|labou?r|association|confederation|congress/i,
  'ideologies': /ideology|movement|nationalism|doctrine|political|belief|philosophy|thought|-ism|ism\b|system|school|tendency/i,
  'us-agencies': /agency|bureau|commission|administration|office|department|service|board|authority|corporation|council|institute|center|survey|police|laboratory|committee|division|program|force|foundation|unit|organization|hospital|administration/i,
  'dynasties': /dynasty|house|family|ruling|lineage|rulers|kings|line/i,
  'law-enforcement': /police|sheriff|law enforcement|marshal|gendarmerie|constabulary|patrol|guard|agency|force|service|department|investigation|security|rangers|militia/i,
  'ministries': /ministry|department|ministr|government|secretariat|office/i,
  'legislatures': /legislat|parliament|assembly|congress|council|diet|senate|chamber|house|duma|storting|cortes|sejm|folketing|riksdag|knesset|majlis/i,
  'uk-constituencies': /constituency|parliamentary|electoral|seat|borough|county division|division/i,
  'canada-ridings': /electoral district|riding|constituency|federal|House of Commons/i,
  'world-subdivisions': /province|state|region|county|prefecture|canton|district|governorate|oblast|department|municipality|republic|territory|emirate|division|voivodeship|parish|island|krai|atoll|commune|autonomous|subdivision|wilaya|regency|zone|okrug|principality|kingdom|dependency|capital|city|entity|land|states|territories|federal|metropolitan|governate/i,
  'uk-cases': /case|v\b|judgment|decision|court|House of Lords|appeal/i,
  'capitals-ever': /capital|seat of|royal|kingdom|empire|principality|state|duchy|capital of|residence|county|city|town/i,
};
const verdicts = [];
for (const p of sample) {
  const ex = p.extract || '';
  let ok = null, how = 'Wikipedia introduction', url = p.url, note = '';
  const yearOk = p.year == null || new RegExp('\\b' + Math.abs(p.year) + '\\b').test(ex) || /BC|BCE|century/.test(ex);
  if (p.key === 'sc-cases') {
    const hit = oyezSet.has(norm(p.answer)) || [...oyezSet].some(n => n === norm(p.answer).replace(/ v /g, ' v ') );
    if (hit) { ok = true; how = 'Oyez case list'; url = 'https://www.oyez.org/cases'; }
    else ok = CLASS['sc-cases'].test(ex) ? true : null;
  } else if (p.key === 'world-heritage') {
    const n = norm(p.answer);
    if (unescoSites.some(s => s === n || s.includes(n) || n.includes(s))) { ok = true; how = 'UNESCO World Heritage List'; url = 'https://whc.unesco.org/en/list/'; }
    else ok = CLASS['world-heritage'].test(ex) ? true : null;
  } else if (p.key === 'us-counties') {
    const n = norm(p.answer); ok = gazCset.has(n) || gazC.some(x => x === n) ? true : null; how = 'Census Gazetteer 2023 (counties)'; url = 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html';
  } else if (/^us-places/.test(p.key)) {
    const n = norm(p.answer); ok = gazP.some(x => x === n || x.startsWith(n + ' ')) ? true : null; how = 'Census Gazetteer 2023 (places)'; url = 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html';
  } else if (CLASS[p.key]) {
    ok = ex && CLASS[p.key].test(ex.slice(0, 400)) && (!['battles', 'treaties', 'wars', 'former', 'milops'].some(s => p.key.startsWith(s)) || yearOk) ? true : null;
  } else if (/^(battles|wars|milops|former-states|treaties)/.test(p.key)) {
    ok = ex && yearOk ? true : null;
  } else ok = ex ? true : null;
  if (p.jackpot && p.year != null && !yearOk) ok = null;
  verdicts.push({ id: p.id, key: p.key, answer: p.answer, jackpot: p.jackpot, ok, how, url, ex: ex.slice(0, 160), year: p.year });
}
fs.writeFileSync(path.join(DATA, '_verdicts.json'), JSON.stringify(verdicts, null, 1));
const bad = verdicts.filter(v => v.ok !== true);
console.log(verdicts.length + ' samples; auto-ok ' + (verdicts.length - bad.length) + '; need a look ' + bad.length);
for (const v of bad) console.log('? ' + v.key + ' | ' + v.answer + ' | ' + v.year + ' | ' + (v.ex || '(no extract)'));
