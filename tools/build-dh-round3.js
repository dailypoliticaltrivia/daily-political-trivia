#!/usr/bin/env node
'use strict';
/* Round 3 of the Dark Horse banks: builds site/games/dark-horse/data/bank-round3-N.json from the listings that
   fetch-dh-round3.js saved in audit/round3-dh-data/ and from the Census files of round 1 (audit/dh-curated-data/).
   Usage: node site/tools/build-dh-round3.js [--dry] [--sample N]
     --dry      build and report, write no bank
     --sample N also write audit/round3-dh-sample.csv: N random answers per question (seeded) plus every Dark Horse answer, for the independent check
   Weights (1-5 = 5/20/45/70/100 points): answers ranked by Wikidata sitelinks (number of Wikipedia language editions), then by
   title length; Census questions by 2023 population. Per-question cut-offs by count (cuts). Jackpot: a weight-5 answer whose
   Wikidata description confirms the claim; its note comes from that description (checked by hand in the independent pass).
   Every question is compared with every question of every bank in the data folder (Jaccard of normalised answer names <= 0.80). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'round3-dh-data');
const OLD = path.join(ROOT, 'audit', 'dh-curated-data');
const OUTDIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const FILE_LIMIT = 2.4 * 1024 * 1024;
const MAX_OVERLAP = 0.8;
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SAMPLE = args.includes('--sample') ? +args[args.indexOf('--sample') + 1] : 0;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };

function norm(s) { // must match norm() in trivia.js / validate-trivia.js
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr');
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
const stripParen = t => t.replace(/\s+\([^()]*\)\s*$/, '').trim();
const BAD_TITLE = /^(List|Lists|Timeline|Outline|Index|Glossary|Bibliography|Category|Template|Portal|Draft|Wikipedia|Book)\b|^(List|Lists|Timeline|Outline) of |\(disambiguation\)/i;
const BAD_DESC = /Wikimedia (list|disambiguation|category)|family name|given name/i;
const STATE_ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const STATE_NAMES = Object.keys(STATE_ABBR);
const BLOCK = readJson(path.join(DATA, '_block.json'), {}); // { key: [titles removed after the check, with the reason in the log] }

/* ---------- loaders ---------- */
function wikiRows(key, opt = {}) {
  const out = [];
  for (const r of readJson(path.join(DATA, key + '.json'), [])) {
    if (!r.t || BAD_TITLE.test(r.t) || BAD_DESC.test(r.d || '')) continue;
    if ((BLOCK[key] || []).includes(r.t)) continue;
    if (opt.title && !opt.title.test(r.t)) continue;
    if (opt.notTitle && opt.notTitle.test(r.t)) continue;
    if (opt.desc && !opt.desc(r.d || '', r)) continue;
    out.push({ name: stripParen(r.t), full: r.t, rank: (r.s || 0), q: r.q, d: r.d || '', y: r.y });
  }
  return out;
}
const PLACE_FIX = { 'Nashville-Davidson metropolitan government (balance)': 'Nashville', 'Louisville/Jefferson County metro government (balance)': 'Louisville', 'Lexington-Fayette urban county': 'Lexington', 'Indianapolis city (balance)': 'Indianapolis', 'Hartsville/Trousdale County': 'Hartsville', 'Lynchburg, Moore County metropolitan government': 'Lynchburg' };
function placeBase(n) {
  if (PLACE_FIX[n]) return PLACE_FIX[n];
  let b = n.replace(/\s*\((balance|part)\)\s*$/i, '');
  b = b.replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|metro government|city|town|village|borough|municipality|plantation|corporation|county)\s*$/i, '');
  return b.trim();
}
const statePlaces = (state) => () => readJson(path.join(OLD, 'us-places-10k.json'), []).filter(r => r.st === state).map(r => ({ base: placeBase(r.n), r }))
  .filter(x => x.base && !/^(balance|remainder)/i.test(x.base) && !/(consolidated|unified) government/.test(x.r.n))
  .map(x => ({ name: x.base, full: x.r.n + ', ' + state, rank: x.r.pop, d: x.r.n + ', ' + state + ' (2023 population ' + x.r.pop.toLocaleString('en-US') + ')', state }));
const stateCounties = (state) => () => readJson(path.join(OLD, 'us-counties.json'), []).filter(r => r.st === state).map(r => {
  const m = r.n.match(/^(.+?) (County|Parish)$/), c = r.n.match(/^(.+?) city$/);
  return { name: c ? c[1] + ' (independent city)' : r.n, full: r.n + ', ' + state, rank: r.pop, d: r.n + ', ' + state, aliases: m ? [m[1]] : c ? [c[1], c[1] + ' city'] : [], state, indep: !!c };
});

/* ---------- alias rules per kind ---------- */
function aliasesFor(kind, e) {
  const n = e.name, out = [];
  const cut = (re) => { const m = n.match(re); if (m && m[1].trim().length >= 4) out.push(m[1].trim()); };
  switch (kind) {
    case 'nwr': cut(/^(.+?) National Wildlife Refuge( Complex)?$/); if (!out.length) cut(/^(.+?) Wildlife Refuge$/); if (out[0]) out.push(out[0] + ' Refuge', out[0] + ' Wildlife Refuge', out[0] + ' NWR'); break;
    case 'forest': cut(/^(.+?) National Forests?$/); if (out[0]) out.push(out[0] + ' Forest'); break;
    case 'wild': cut(/^(.+?) Wilderness( Area)?$/); break;
    case 'tribe': { cut(/^(.+?),\s*[A-Z][a-z]+( [A-Z][a-z]+)?$/); cut(/^(.+?) (Nation|Tribe|Indian Tribe|Indians|Tribe of Indians|people|Pueblo)$/); cut(/^(?:The )?(.+?) (Nation|Tribe) of .+$/); break; }
    case 'place': out.push(n + ', ' + e.state, n + ', ' + STATE_ABBR[e.state]); break;
    case 'nhl': { const full = stripParen(e.full); if (full !== n) out.push(full); break; }
  }
  return out.concat(e.aliases || []);
}

/* ---------- the questions ---------- */
const HONOR_NOTE = (what) => 'Anyone (or any group) awarded the ' + what + ' who has an English Wikipedia article counts, living or dead. The last name alone is accepted when only one answer has it.';
const Q = [];
const add = (o) => Q.push(o);
add({ key: 'pmof', cat: 'honors', diff: 2, kind: 'person', rows: () => wikiRows('pmof'), cuts: [25, 80, 200, 400],
  prompt: 'Name a recipient of the Presidential Medal of Freedom (the highest U.S. civilian honor, awarded by the president since 1963)',
  note: HONOR_NOTE('Presidential Medal of Freedom (including the "with distinction" grade and posthumous awards)'),
  src: 'Wikidata award received (P166) = Presidential Medal of Freedom (Q17144), with an English Wikipedia article',
  jp: { desc: /\b(American|U\.S\.)\b/, note: (e) => cap(e.d) + (e.y ? '; awarded the Medal of Freedom in ' + e.y : '') + '.' } });
const DROPPED_KEYS = { 'union-generals': 'check found 2 wrong (Robeson: state militia only; Hooker: lieutenant colonel) and 1 disputed (Eckley) of about 15: the Wikipedia categories are too loose, and requiring a Wikidata general rank still let Robeson through', 'confed-generals': 'same Wikipedia category method as the Union list, which failed its check; the sample held an appointee whose nomination was withdrawn (Richardson), so dropped as doubtful', cgm: 'check found 2 wrong of 15 sampled (a public law and a non-recipient): Wikidata award data for the Congressional Gold Medal is too noisy' };
add({ key: 'cgm', cat: 'honors', diff: 3, kind: 'person', rows: () => wikiRows('cgm'), cuts: [20, 50, 110, 170],
  prompt: 'Name a person or group awarded the Congressional Gold Medal (the highest honor Congress can give)',
  note: HONOR_NOTE('Congressional Gold Medal by an act of Congress'),
  src: 'Wikidata award received (P166) = Congressional Gold Medal (Q721743), with an English Wikipedia article',
  jp: { desc: /./, note: (e) => cap(e.d) + (e.y ? '; Congressional Gold Medal awarded in ' + e.y : '') + '.' } });
add({ key: 'moh', cat: 'honors', diff: 3, kind: 'person', rows: () => wikiRows('moh'), cuts: [25, 80, 250, 700],
  prompt: 'Name a recipient of the Medal of Honor (the highest U.S. military decoration, from the Civil War to today)',
  note: 'Any Medal of Honor recipient with an English Wikipedia article counts (Army, Navy, Marine Corps, Air Force or Coast Guard; any war; posthumous awards included). The last name alone is accepted when only one answer has it.',
  src: 'Wikidata award received (P166) = Medal of Honor (Q203535), with an English Wikipedia article',
  jp: { desc: /Medal of Honor recipient/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'nobel', cat: 'diplomacy', diff: 2, kind: 'person', rows: () => wikiRows('nobel'), cuts: [15, 35, 70, 105], min: 100,
  prompt: 'Name a winner of the Nobel Peace Prize (a person or an organization, any year since 1901)',
  note: 'Every Nobel Peace Prize laureate counts, people and organizations (the Red Cross, the UN, Doctors Without Borders ...). The last name alone is accepted when only one answer has it.',
  src: 'Wikidata award received (P166) = Nobel Peace Prize (Q35637), with an English Wikipedia article',
  jp: { desc: /./, note: (e) => cap(e.d) + (e.y ? '; Nobel Peace Prize ' + e.y : '') + '.' } });
add({ key: 'nwr', cat: 'environment', diff: 3, kind: 'nwr', surnameOff: true, rows: () => wikiRows('nwr'), cuts: [12, 40, 120, 300],
  prompt: 'Name a U.S. National Wildlife Refuge',
  note: 'Any unit of the National Wildlife Refuge System with an English Wikipedia article counts (for example the Arctic National Wildlife Refuge). The name may be typed without "National Wildlife Refuge".',
  src: 'Wikidata instance of (P31) National Wildlife Refuge (Q1410668), with an English Wikipedia article',
  jp: { desc: /refuge|protected area/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'forests', cat: 'environment', diff: 3, kind: 'forest', surnameOff: true, rows: () => wikiRows('forests', { title: /National Forests?$/, notTitle: /^(United States|U\.S\.) National Forest|^National Forest/ }), cuts: [10, 30, 70, 120], min: 100,
  prompt: 'Name a U.S. national forest (current or former)',
  note: 'Any national forest run by the U.S. Forest Service that is listed in Wikipedia\'s list of national forests counts (combined forests such as Uinta-Wasatch-Cache too). "National Forest" may be left off.',
  src: 'English Wikipedia "List of national forests of the United States": linked articles whose title ends in "National Forest(s)"',
  jp: { desc: /national forest/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'wilderness', cat: 'environment', diff: 3, kind: 'wild', surnameOff: true, rows: () => wikiRows('wilderness', { title: /Wilderness( Area)?$/, notTitle: /^(National Wilderness|Wilderness)/ }), cuts: [15, 50, 150, 400],
  prompt: 'Name a federally designated wilderness area in the United States (part of the National Wilderness Preservation System)',
  note: 'Any wilderness area listed in Wikipedia\'s list of wilderness areas of the United States counts (for example the Bob Marshall Wilderness or Frank Church-River of No Return Wilderness). "Wilderness" may be left off.',
  src: 'English Wikipedia "List of wilderness areas of the United States": linked articles whose title ends in "Wilderness"',
  jp: { desc: /wilderness/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'nhl', cat: 'symbols-landmarks', diff: 3, kind: 'nhl', surnameOff: true, rows: () => wikiRows('nhl'), cuts: [30, 100, 350, 1000],
  prompt: 'Name a National Historic Landmark (a building, site or structure the U.S. government has designated for its national historic importance)',
  note: 'Any place designated a National Historic Landmark that has an English Wikipedia article counts, under the name Wikipedia gives it (for example the Empire State Building, Alcatraz Island or the Brooklyn Bridge). Current designations only, as recorded in Wikidata.',
  src: 'Wikidata heritage designation (P1435) = National Historic Landmark (Q624232), with an English Wikipedia article',
  jp: { desc: /historic|house|building|site|church|district/i, note: (e) => cap(e.d) + (e.y ? '; designated a National Historic Landmark in ' + e.y : '') + '.' } });
add({ key: 'dcn', cat: 'dc', diff: 2, kind: 'dc', surnameOff: true, rows: () => wikiRows('dcn').map(r => Object.assign(r, { state: null })), cuts: [12, 30, 70, 110], min: 100,
  prompt: 'Name a neighborhood of Washington, D.C.',
  note: 'Any neighborhood of the District of Columbia with an English Wikipedia article counts (for example Georgetown, Capitol Hill, Anacostia or Adams Morgan).',
  src: 'Wikidata instance of (P31) neighborhood of Washington, D.C. (Q12063697), with an English Wikipedia article',
  jp: { desc: /neighborhood in Washington/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'tribes', cat: 'native-american-history', diff: 3, kind: 'tribe', surnameOff: true, rows: () => wikiRows('tribes'), cuts: [20, 60, 150, 250],
  prompt: 'Name a federally recognized Native American tribe (or Alaska Native village)',
  note: 'Any tribe, nation, band, pueblo, rancheria or Alaska Native village recognized by the Bureau of Indian Affairs that has an English Wikipedia article counts (for example the Navajo Nation, Cherokee Nation or Seminole Tribe of Florida). Short forms are accepted when only one answer has them.',
  src: 'Wikidata instance of (P31) federally recognized Native American tribe in the United States (Q7840353), with an English Wikipedia article',
  jp: { desc: /federally recognized/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'arlington', cat: 'military', diff: 3, kind: 'person', rows: () => wikiRows('arlington'), cuts: [25, 80, 250, 700],
  prompt: 'Name a person buried at Arlington National Cemetery',
  note: 'Anyone whose burial place is Arlington National Cemetery (as recorded in Wikidata) and who has an English Wikipedia article counts: presidents, justices, astronauts, soldiers and others. The last name alone is accepted when only one answer has it.',
  src: 'Wikidata place of burial (P119) = Arlington National Cemetery (Q216344), with an English Wikipedia article',
  jp: { desc: /\b(American|United States|U\.S\.)\b/, note: (e) => cap(e.d) + '; buried at Arlington.' } });
add({ key: 'congressional-cemetery', cat: 'dc', diff: 3, kind: 'person', rows: () => wikiRows('congressional-cemetery'), cuts: [15, 40, 90, 150],
  prompt: 'Name a person buried (or memorialized with a cenotaph) at Congressional Cemetery in Washington, D.C.',
  note: 'Anyone whose burial place is the Congressional Cemetery on Capitol Hill (as recorded in Wikidata) and who has an English Wikipedia article counts, for example J. Edgar Hoover or John Philip Sousa. The last name alone is accepted when only one answer has it.',
  src: 'Wikidata place of burial (P119) = Congressional Cemetery (Q2892262), with an English Wikipedia article',
  jp: { desc: /./, note: (e) => cap(e.d) + '; buried at Congressional Cemetery.' } });
const NOT_GENERAL = (d) => !/\b(colonel|captain|private|sergeant|surgeon|chaplain)\b/i.test(d) || /general/i.test(d);
add({ key: 'union-generals', cat: 'civil-war', diff: 2, kind: 'person', rows: () => wikiRows('union-generals', { desc: NOT_GENERAL }), cuts: [25, 80, 220, 450],
  prompt: 'Name a Union general of the American Civil War (including brevet generals and generals of volunteers)',
  note: 'Anyone in Wikipedia\'s categories of Union Army generals (brigadier and major generals, generals of volunteers and brevet generals) counts. The last name alone is accepted when only one answer has it.',
  src: 'English Wikipedia categories "Union army generals", "Union Army brigadier generals" and "Union Army major generals" (Wikidata description must not name a lower rank)',
  jp: { desc: /general/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'confed-generals', cat: 'civil-war', diff: 2, kind: 'person', rows: () => wikiRows('confed-generals', { desc: NOT_GENERAL }), cuts: [20, 60, 150, 300],
  prompt: 'Name a Confederate general of the American Civil War',
  note: 'Anyone in Wikipedia\'s categories of Confederate States Army generals (brigadier, major, lieutenant and full generals) counts. The last name alone is accepted when only one answer has it.',
  src: 'English Wikipedia categories "Confederate States Army generals" and its brigadier, major, lieutenant and full general subcategories (Wikidata description must not name a lower rank)',
  jp: { desc: /Confederate.*general/i, note: (e) => cap(e.d) + '.' } });
add({ key: 'continental-congress', cat: 'founding-era', diff: 2, kind: 'person', rows: () => wikiRows('continental-congress', { notTitle: /^(Bibliography|Papers|Electoral history|Presidency|Legacy)\b/ }), cuts: [20, 50, 120, 220],
  prompt: 'Name a delegate to the Continental Congress (1774 to 1789)',
  note: 'Anyone who sat in the First or Second Continental Congress or the Congress of the Confederation for one of the thirteen states counts (Wikipedia\'s categories of Continental Congressmen by state). The last name alone is accepted when only one answer has it.',
  src: 'English Wikipedia categories "Continental Congressmen from <state>" for the 13 original states',
  jp: { desc: /politician|delegate|lawyer|merchant|planter|judge|soldier/i, note: (e) => cap(e.d) + '; a delegate to the Continental Congress.' } });

/* Census: incorporated places of eight more states, counties (and Virginia's independent cities) of six */
const PLACE_STATES = [
  ['Maryland', 'cities and towns', [8, 20, 50, 100], 'Name an incorporated city or town in Maryland (Baltimore and the 156 others)'],
  ['Virginia', 'cities and towns', [8, 25, 70, 140], 'Name an incorporated city or town in Virginia'],
  ['Missouri', 'cities, towns and villages', [8, 30, 120, 400], 'Name an incorporated city, town or village in Missouri'],
  ['Minnesota', 'cities', [8, 30, 110, 380], 'Name a city in Minnesota (townships are not included)'],
  ['Wisconsin', 'cities and villages', [8, 25, 90, 300], 'Name a city or village in Wisconsin (the state’s towns are not included)'],
  ['Indiana', 'cities and towns', [8, 25, 90, 300], 'Name an incorporated city or town in Indiana (townships are not included)'],
  ['Tennessee', 'cities and towns', [8, 25, 80, 200], 'Name an incorporated city or town in Tennessee'],
  ['Washington', 'cities and towns', [8, 25, 70, 170], 'Name an incorporated city or town in Washington State'],
];
const PLACE_EXCL = { Minnesota: ' Townships are not included.', Wisconsin: ' The towns of Wisconsin are county subdivisions that the Census Bureau does not list as places, so they are not included.', Indiana: ' Townships are not included.', Virginia: ' Counties are not included; independent cities count.', Maryland: ' Baltimore counts; unincorporated communities such as Columbia, Silver Spring and Bethesda do not.' };
for (const [st, kinds, cuts, prompt] of PLACE_STATES) add({ key: 'places-' + st.toLowerCase(), cat: 'states', diff: 3, kind: 'place', surnameOff: true, rows: statePlaces(st), cuts, min: 150, prompt,
  note: 'Incorporated ' + kinds + ' of ' + st + ' that appear in the Census Bureau 2023 population estimates count, however small. The name may be given with or without the state.' + (PLACE_EXCL[st] || ' Unincorporated communities, townships and census-designated places do not count.'),
  src: 'U.S. Census Bureau Vintage 2023 incorporated place estimates (round-1 file audit/dh-curated-data/us-places-10k.json); tiers by population rank', census: true });
const COUNTY_STATES = [['Virginia', [8, 25, 60, 100]], ['Kentucky', [8, 25, 60, 95]], ['Missouri', [8, 25, 60, 90]], ['Kansas', [8, 25, 55, 85]], ['Illinois', [8, 25, 55, 80]], ['North Carolina', [8, 25, 55, 80]]];
for (const [st, cuts] of COUNTY_STATES) add({ key: 'counties-' + st.toLowerCase().replace(/ /g, '-'), cat: 'states', diff: st === 'Virginia' ? 3 : 2, kind: 'county', surnameOff: true, rows: stateCounties(st), cuts, min: 100,
  prompt: st === 'Virginia' ? 'Name a county or independent city of Virginia (the 133 county-level governments)' : 'Name a county in ' + st,
  note: st === 'Virginia' ? 'All 95 counties and 38 independent cities of Virginia count, with or without the word "County" (for example Fairfax County, Richmond, Norfolk).' : 'All ' + readJson(path.join(OLD, 'us-counties.json'), []).filter(r => r.st === st).length + ' county-level units of ' + st + ' in the Census Bureau 2023 estimates count, with or without the word "County"' + (st === 'Missouri' ? ' (the independent city of St. Louis counts too)' : '') + '.',
  src: 'U.S. Census Bureau Vintage 2023 county estimates (round-1 file audit/dh-curated-data/us-counties.json); tiers by population rank', census: true });

function cap(s) { s = String(s || '').trim().replace(/\.$/, ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- build ---------- */
function build(c, id) {
  const byKey = new Map();
  // Distinct entities (different Wikidata ids) whose names only collide once the bracketed part is stripped ("Old State House (Hartford)",
  // "Old State House (Little Rock)") are kept apart under their full titles; the bare short form then belongs to several answers, so the alias
  // rules below never give it to one of them. Rows of the same entity, and rows without an id (census places), still merge. (answer agent 2026-11-13)
  const rows = c.rows(), ids = new Map();
  for (const it of rows) { const k = norm(it.name); if (k && it.q) (ids.get(k) || ids.set(k, new Set()).get(k)).add(it.q); }
  for (const it of rows) {
    const k0 = norm(it.name);
    if (k0 && it.q && ids.get(k0).size > 1 && it.full && it.full !== it.name) { it.aliases = (it.aliases || []).concat([it.name]); it.name = it.full; }
  }
  for (const it of rows) {
    const k = norm(it.name); if (!k) continue;
    const e = byKey.get(k);
    if (!e) byKey.set(k, Object.assign({}, it));
    else if ((it.rank || 0) > (e.rank || 0)) Object.assign(e, it, { name: e.name });
  }
  const ents = [...byKey.values()].sort((a, b) => (b.rank || 0) - (a.rank || 0) || a.name.length - b.name.length || (a.name < b.name ? -1 : 1));
  const n = ents.length, min = c.min || 150;
  if (n < min) return { skip: `only ${n} distinct answers (minimum ${min})` };
  if (n > 5000) return { skip: `${n} answers (over 5000)` };
  ents.forEach((e, i) => { e.weight = i < c.cuts[0] ? 1 : i < c.cuts[1] ? 2 : i < c.cuts[2] ? 3 : i < c.cuts[3] ? 4 : 5; });
  // aliases: unique within the question, never another answer's name
  const owner = new Map(); ents.forEach((e, i) => owner.set(norm(e.name), i));
  const cnt = new Map(); ents.forEach(e => aliasesFor(c.kind, e).forEach(a => cnt.set(norm(a), (cnt.get(norm(a)) || 0) + 1)));
  ents.forEach((e, i) => {
    e.al = []; const mine = new Set([norm(e.name)]);
    for (const a of aliasesFor(c.kind, e)) { const k = norm(a); if (!k || k.length < 3 || mine.has(k) || owner.has(k) || cnt.get(k) > 1 || STATE_NAMES.some(s => norm(s) === k)) continue; owner.set(k, i); mine.add(k); e.al.push(a); }
  });
  // jackpot: a weight-5 answer whose description supports the claim; deterministic pick
  let jp = null;
  if (c.jp) {
    const cands = ents.filter(e => e.weight === 5 && e.d && c.jp.desc.test(e.d) && e.d.length >= 12 && !/\?/.test(e.d) && (!c.census || e.rank >= 300));
    if (cands.length) { jp = cands.slice().sort((a, b) => hash(c.key + a.name) - hash(c.key + b.name))[0]; jp.jackpot = true; jp.note = c.jp.note(jp); }
  } else if (c.census) {
    const cands = ents.filter(e => e.weight === 5 && e.rank >= 300);
    if (cands.length) { jp = cands.slice().sort((a, b) => hash(c.key + a.name) - hash(c.key + b.name))[0]; jp.jackpot = true; jp.note = c.kind === 'county' ? (jp.indep ? 'An independent city' : 'A county') + ' of ' + jp.state + ' (2023 population ' + jp.rank.toLocaleString('en-US') + ').' : 'Population ' + jp.rank.toLocaleString('en-US') + ' (Census Bureau 2023 estimate).'; }
  }
  const answers = ents.map(e => {
    const a = { name: e.name };
    if (e.al.length) a.aliases = e.al;
    a.weight = e.weight;
    if (c.surnameOff || c.kind !== 'person') a.surname = false;
    if (e.jackpot) { a.jackpot = true; a.note = e.note; }
    return a;
  });
  const hist = [0, 0, 0, 0, 0]; ents.forEach(e => hist[e.weight - 1]++);
  return { q: { id, category: c.cat, prompt: c.prompt, difficulty: c.diff, note: c.note, answers }, n, hist, jp, ents };
}

/* existing questions for the overlap test (every bank file on disk except round 3's own) */
const existing = [];
for (const f of fs.readdirSync(OUTDIR)) if (/^bank-.+\.json$/.test(f) && !/^bank-round3-/.test(f)) for (const q of (readJson(path.join(OUTDIR, f), { questions: [] }).questions || [])) existing.push({ id: q.id, set: new Set(q.answers.map(a => norm(a.name))) });
function jaccard(a, b) { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); }

const IDS = readJson(path.join(DATA, '_ids.json'), {});
let next = Math.max(0, ...Object.values(IDS).map(v => +v.slice(7))) + 1;
const built = [], dropped = [], report = [];
for (const c of Q) {
  if (DROPPED_KEYS[c.key]) { dropped.push([c.key, DROPPED_KEYS[c.key]]); continue; }
  const id = IDS[c.key] || ('round3-' + String(next++).padStart(4, '0'));
  const r = build(c, id);
  if (r.skip) { dropped.push([c.key, r.skip]); continue; }
  const mine = new Set(r.q.answers.map(a => norm(a.name)));
  let worst = { j: 0, id: '' };
  for (const e of existing) { const j = jaccard(mine, e.set); if (j > worst.j) worst = { j, id: e.id }; }
  for (const b of built) { const j = jaccard(mine, b.set); if (j > worst.j) worst = { j, id: b.r.q.id }; }
  if (worst.j > MAX_OVERLAP) { dropped.push([c.key, `overlap ${worst.j.toFixed(3)} with ${worst.id}`]); continue; }
  IDS[c.key] = id;
  built.push({ c, r, set: mine, worst });
}
for (const b of built) report.push({ id: b.r.q.id, key: b.c.key, cat: b.c.cat, diff: b.c.diff, n: b.r.n, hist: b.r.hist, jackpot: b.r.jp ? b.r.jp.name : null, jnote: b.r.jp ? b.r.jp.note : null, overlap: +b.worst.j.toFixed(3), overlapWith: b.worst.id, src: b.c.src, prompt: b.c.prompt });

// The live round-3 bank has been corrected by hand since this script made it (answer audit: audit/answers-dark-horse-log.md, rounds 3-4).
// Rebuilding would silently undo those fixes, so overwriting an existing bank needs an explicit --force.
const FORCE = args.includes('--force');
if (!DRY && !FORCE && fs.readdirSync(OUTDIR).some(f => /^bank-round3-\d+\.json$/.test(f))) {
  console.error('REFUSED: site/games/dark-horse/data/bank-round3-*.json already exists and has been hand-corrected since it was generated\n' +
    '(answers added, wrong answers removed, aliases and weights fixed: see audit/answers-dark-horse-log.md and audit/answers-dark-horse-sources.csv).\n' +
    'Overwriting it would undo those fixes. Use --dry to preview, or pass --force if you really mean to replace it (then re-apply the audit edit files).');
  process.exit(1);
}
if (!DRY) {
  const files = []; let cur = [], size = 0;
  for (const { r } of built) { const s = JSON.stringify(r.q).length; if (cur.length && size + s > FILE_LIMIT) { files.push(cur); cur = []; size = 0; } cur.push(r.q); size += s; }
  if (cur.length) files.push(cur);
  for (const f of fs.readdirSync(OUTDIR)) if (/^bank-round3-\d+\.json$/.test(f)) fs.unlinkSync(path.join(OUTDIR, f));
  files.forEach((qs, i) => fs.writeFileSync(path.join(OUTDIR, `bank-round3-${i + 1}.json`), JSON.stringify({ bank: 'round3-' + (i + 1), questions: qs })));
  fs.writeFileSync(path.join(DATA, '_ids.json'), JSON.stringify(IDS, null, 1));
  console.log(`wrote ${files.length} bank file(s)`);
}
fs.writeFileSync(path.join(DATA, '_report.json'), JSON.stringify({ report, dropped }, null, 1));

if (SAMPLE) { // seeded sample for the independent check: N answers per question across tiers + every jackpot
  const rows = [['qid', 'key', 'answer', 'wikipedia_title', 'weight', 'jackpot', 'claim']];
  const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  for (const { c, r } of built) {
    const pick = new Set();
    const ents = r.ents; const step = ents.length / SAMPLE;
    for (let i = 0; i < SAMPLE; i++) pick.add(ents[Math.min(ents.length - 1, Math.floor(i * step + (hash(c.key + i) % Math.max(1, Math.floor(step)))))]);
    if (r.jp) pick.add(r.jp);
    for (const e of pick) rows.push([r.q.id, c.key, e.name, c.census ? '' : e.full, e.weight, e.jackpot ? 'yes' : '', e.jackpot ? c.prompt + ' || NOTE: ' + e.note : c.prompt].map(esc));
  }
  fs.writeFileSync(path.join(ROOT, 'audit', 'round3-dh-sample.csv'), rows.map(r => r.join(',')).join('\n'));
  console.log('sample rows', rows.length - 1);
}
console.log(`${built.length} questions, ${built.reduce((a, b) => a + b.r.n, 0)} answers; dropped ${dropped.length}`);
for (const r of report) console.log(`${r.id} ${r.key.padEnd(22)} ${String(r.n).padStart(5)} d${r.diff} ${r.hist.join('/')} ov ${r.overlap} ${r.overlapWith}  JP: ${r.jackpot} | ${r.jnote}`);
for (const d of dropped) console.log('DROPPED', d[0], '-', d[1]);
