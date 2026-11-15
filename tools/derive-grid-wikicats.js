#!/usr/bin/env node
/* Congressional Grid: turn the Wikipedia categories of each member's article (data/wikicats-cache.json, made by fetch-grid-wikicats.js) into tag ADDITIONS
   for tags whose Wikidata source is known to be incomplete (README "KNOWN GAPS"): military branch, wars, Medal of Honor / Purple Heart, some occupations and schools.
   Only additions are made, never removals. A hand-written "remove" in data/tag-overrides.csv still wins (build-data.ps1 applies that file last).
   Output: data/tag-wikicats.csv (id,tag,action,note) with the category that triggered each tag, and a per-tag summary on stdout.
   Usage: node site/tools/derive-grid-wikicats.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const readJ = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const cache = readJ(path.join(ROOT, 'data', 'wikicats-cache.json'));
const legs = readJ(path.join(ROOT, 'data', 'legislators-historical.json')).concat(readJ(path.join(ROOT, 'data', 'legislators-current.json')));
const msrc = fs.readFileSync(path.join(ROOT, 'data', 'members.js'), 'utf8');
const MEM = eval(msrc.slice(msrc.indexOf('window.MEMBERS=') + 15, msrc.lastIndexOf(']') + 1));
const memBy = {}; MEM.forEach(m => { memBy[m.id] = m; });
// hand removes win: never re-add a tag the audit removed on purpose
const removed = new Set();
fs.readFileSync(path.join(ROOT, 'data', 'tag-overrides.csv'), 'utf8').split(/\r?\n/).slice(1).forEach(l => { const c = l.split(','); if (c[2] === 'remove') removed.add(c[0] + '|' + c[1]); });

const NOT = /alumni|faculty|civilians|Academy|College|School|University|band members|museums|installations|units|bases|ships|equipment|fictional/i;
const WAR = (w) => new RegExp(`\\b(personnel|veterans|officers|soldiers|sailors|marines|airmen|pilots|aviators|generals|admirals|prisoners of war) of ${w}$`);
const RULES = [
  ['army', c => /^(United States|Union|Continental) Army\b(?! [Aa]ir)/i.test(c) && !NOT.test(c) || /\bArmy National Guard (officers|personnel|soldiers)\b/.test(c) || /^United States Army Rangers$|^Green Berets$|^Buffalo Soldiers$/.test(c)],
  ['navy', c => /^(United States|Union|Continental) Navy\b/i.test(c) && !NOT.test(c) || /^United States Navy SEALs$/.test(c)],
  ['marines', c => /^(United States Marines$|United States Marine Corps\b)/.test(c) && !NOT.test(c)],
  ['airforce', c => /^United States Air Force\b/.test(c) && !NOT.test(c) || /\bAir National Guard (officers|personnel)\b/.test(c)],
  ['confederate', c => /^Confederate States (Army|Navy|Marine Corps)\b/.test(c) && !NOT.test(c)],
  ['civilwar', c => /^Union (Army|Navy)\b/i.test(c) && !NOT.test(c) || WAR('the American Civil War').test(c) && !/Confederate/.test(c)],
  ['ww2', c => WAR('World War II').test(c)],
  ['ww1', c => WAR('World War I').test(c)],
  ['korea', c => WAR('the Korean War').test(c)],
  ['gulfwar', c => WAR('the Gulf War').test(c)],
  ['iraqafghan', c => WAR('the Iraq War').test(c) || WAR('the War in Afghanistan \\(2001–2021\\)').test(c)],
  ['spanam', c => WAR('the Spanish[–-]American War').test(c)],
  ['mexwar', c => WAR('the Mexican[–-]American War').test(c)],
  ['war1812', c => WAR('the War of 1812').test(c)],
  ['medalofhonor', c => /Medal of Honor recipients$|recipients of the Medal of Honor$/.test(c)],
  ['purpleheart', c => /Purple Heart/.test(c)],
  ['physician', c => /\b(physicians|surgeons)\b/.test(c) && !/fictional/i.test(c)],
  ['journalist', c => /\b(journalists|newspaper editors|newspaper publishers \(people\)|newspaper founders|columnists)\b/.test(c)],
  ['engineer', c => /\b(civil|mechanical|electrical|mining|chemical|aerospace|industrial|petroleum|nuclear|structural|American|software) engineers\b/.test(c)],
  ['farmer', c => /\b(farmers|planters|ranchers)\b/.test(c)],
  ['clergy', c => /\b(clergy|Methodist ministers|Baptist ministers|Presbyterian ministers|Episcopal priests|Catholic priests|rabbis|Christian clergy|pastors)\b/.test(c)],
  ['accountant', c => /\baccountants\b/.test(c)],
  ['economist', c => /\beconomists\b/.test(c)],
  ['aviator', c => /\b(aviators|aircraft pilots)\b/.test(c) && !/^Shot-down aviators$/.test(c)],   // shot-down aircrew include navigators and bombardiers (grid check r2: Hathaway was a navigator)
  ['police', c => /\b(police officers|sheriffs|police chiefs)\b/.test(c)],
  ['surveyor', c => /\bsurveyors\b/.test(c)],
  ['astronaut', c => /\bastronauts\b/.test(c)],
  // round 4 (2026-11-13): office and job tags whose only source was Wikidata
  ['usattorney', c => /^United States [Aa]ttorneys for the /.test(c)],
  ['mayor', c => /^Mayors of /.test(c) && !/fictional/i.test(c)],
  ['diplomat', c => /^Ambassadors of the United States to |^United States Ministers to |^Envoys of the United States|^Ministers of the United States to /.test(c)],
  ['business', c => /\b(businesspeople|business executives|bankers|merchants|industrialists|manufacturers|real estate developers|businessmen|businesswomen|chief executives|investors|financiers)\b/.test(c) && !/fictional/i.test(c)],
  ['educator', c => /\b(schoolteachers|educators)\b|\bfaculty$|^Academics of |\bprofessors\b|\buniversity and college (faculty|presidents)\b/.test(c) && !/fictional/i.test(c)],
  ['entertainer', c => /\b(actors|actresses|singers|comedians|musicians|television personalities|entertainers|rappers|guitarists|pianists|songwriters|singer-songwriters)\b/.test(c) && /American|from [A-Z]/.test(c) && !/fictional/i.test(c)],
  ['athlete', c => /\b(players|coaches|Olympians|athletes|boxers|wrestlers|swimmers|golfers|jockeys|sprinters|rowers|track and field|racing drivers|figure skaters|skiers|cyclists)\b/.test(c) && !/fictional|chess|poker|video game|Organising Committee/i.test(c)]
  ,
  // round 5 (2026-11-13): party categories that name CONGRESSIONAL service under a party ("Whig Party United States senators", "Know-Nothing members of
  // the United States House of Representatives from ..."). congress-legislators leaves many early terms without a party ("Other") and labels others
  // Pro-/Anti-Administration, Adams or Jackson. 'party:X' rows add X to the member's parties list in build-data.ps1; minor parties are plain tags.
  ['party:Whig', c => /^Whig Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['party:Federalist', c => /^Federalist Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['party:Democratic-Republican', c => /^Democratic-Republican Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['party:National Republican', c => /^National Republican Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['knownothing', c => /^(Know[- ]Nothing|American Party) (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['freesoil', c => /^Free Soil Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['antimason', c => /^Anti-Masonic Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['nullifier', c => /^Nullifier Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['unionist', c => /^(Unconditional )?Union(ist)? Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['progressive', c => /^Progressive Party \(1912\) (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['populist', c => /^(People's Party \(United States\)|Populist Party) (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['greenback', c => /^Greenback Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)],
  ['farmerlabor', c => /^(Minnesota )?Farmer–Labor Party (members of the )?United States (representatives|senators|House of Representatives)\b/.test(c)]
  // (a 'judge' rule was tried and dropped: 2 of 8 sampled were nominees who declined the post; grid check r4)
];
// schools: "<school> alumni" categories, using the same school names as build-data.ps1 (anchored so look-alikes do not match)
const SCHOOL = [
  ['harvard', /^(Harvard (College|University|Law School|Business School|Kennedy School|Medical School|Divinity School|Graduate School of [A-Za-z ]+|Extension School|School of Dental Medicine|T\.H\. Chan School of Public Health)|Radcliffe College) alumni$/],
  ['yale', /^Yale (College|University|Law School|School of [A-Za-z ]+|Divinity School|Graduate School of Arts and Sciences) alumni$/],
  ['princeton', /^Princeton (University|School of Public and International Affairs) alumni$/],
  ['columbia', /^Columbia (University|College|Law School|Business School|Graduate School of [A-Za-z ]+|University School of [A-Za-z ]+) alumni$|^Columbia University Vagelos College of Physicians and Surgeons alumni$/],
  ['penn', /^(University of Pennsylvania( Law School| Carey Law School| School of [A-Za-z ]+)?|Wharton School( of the University of Pennsylvania)?|Perelman School of Medicine at the University of Pennsylvania) alumni$/],
  ['brown', /^Brown University alumni$/], ['dartmouth', /^Dartmouth College alumni$|^Tuck School of Business alumni$/],
  ['cornell', /^(Cornell University|Cornell Law School|Weill Cornell Medical College) alumni$/],
  ['georgetown', /^Georgetown University( Law Center| School of Foreign Service)? alumni$/], ['stanford', /^Stanford (University|Law School|Graduate School of Business) alumni$/],
  ['uva', /^University of Virginia( School of Law)? alumni$/], ['umich', /^University of Michigan( Law School)? alumni$/], ['wm', /^College of William (&|and) Mary alumni$|^William & Mary Law School alumni$/],
  ['oxford', /^Alumni of .* College, Oxford$|^Alumni of the University of Oxford$/], ['utexas', /^University of Texas at Austin alumni$|^University of Texas School of Law alumni$/],
  ['ualabama', /^University of Alabama( School of Law)? alumni$/], ['unc', /^University of North Carolina at Chapel Hill( School of Law)? alumni$/],
  ['vanderbilt', /^Vanderbilt University( Law School)? alumni$/], ['notredame', /^University of Notre Dame( Law School)? alumni$/],
  ['berkeley', /^University of California, Berkeley( School of Law)? alumni$/], ['wlu', /^Washington and Lee University( School of Law)? alumni$/],
  ['hsc', /^Hampden–Sydney College alumni$|^Hampden-Sydney College alumni$/], ['bowdoin', /^Bowdoin College alumni$/], ['williams', /^Williams College alumni$/],
  ['amherst', /^Amherst College alumni$/], ['unioncollege', /^Union College \(New York\) alumni$|^Union College alumni$/], ['ugeorgia', /^University of Georgia( School of Law)? alumni$/],
  ['dickinson', /^Dickinson College alumni$/], ['transylvania', /^Transylvania University alumni$/], ['uwisc', /^University of Wisconsin–Madison alumni$|^University of Wisconsin Law School alumni$/],
  ['howard', /^Howard University( School of Law)? alumni$/], ['gwu', /^George Washington University( Law School)? alumni$/], ['wj', /^Washington & Jefferson College alumni$/],
  ['usc', /^University of South Carolina( School of Law)? alumni$/], ['mizzou', /^University of Missouri( School of Law)? alumni$/], ['osu', /^Ohio State University( Moritz College of Law)? alumni$/],
  ['phillips', /^Phillips Exeter Academy alumni$|^Phillips Academy alumni$/], ['westpoint', /^United States Military Academy alumni$/], ['annapolis', /^United States Naval Academy alumni$/]
];
const IVY = new Set(['harvard', 'yale', 'princeton', 'columbia', 'penn', 'brown', 'dartmouth', 'cornell']);
const MIL = new Set(['army', 'navy', 'marines', 'airforce', 'confederate', 'civilwar', 'ww2', 'ww1', 'korea', 'gulfwar', 'iraqafghan', 'spanam', 'mexwar', 'war1812', 'medalofhonor', 'purpleheart']);
const PARTY_T = new Set(['party:Whig', 'party:Federalist', 'party:Democratic-Republican', 'party:National Republican', 'knownothing', 'freesoil', 'antimason', 'nullifier', 'unionist', 'progressive', 'populist', 'greenback', 'farmerlabor']);
const rows = ['id,tag,action,note'], count = {};
legs.forEach(l => {
  const id = l.id.bioguide, m = memBy[id], cats = cache[l.id.wikipedia];
  if (!m || !cats) return;
  const add = new Map();
  cats.forEach(c => {
    RULES.forEach(([t, f]) => { if (!add.has(t) && f(c)) add.set(t, c); });
    SCHOOL.forEach(([t, re]) => { if (!add.has(t) && re.test(c)) add.set(t, c); });
  });
  [...add.keys()].forEach(t => { if (IVY.has(t) && !add.has('ivy')) add.set('ivy', add.get(t)); if (MIL.has(t) && !add.has('military')) add.set('military', add.get(t)); });
  add.forEach((c, t) => {
    // every derived tag is written, even when members.js already has it: build-data.ps1 starts from the Wikidata tags each time, so the file must be complete (tags are a set; duplicates are harmless)
    if (removed.has(id + '|' + t)) return;
    // party categories only FILL a gap: the member must have a term with no usable party label ("Other"). Where congress-legislators records a
    // party, Wikipedia's categories proved unreliable (grid check r5-party: 11 of 51 false, e.g. pre-party "Free Soil", Know-Nothing endorsements,
    // anachronistic "Democratic-Republican"); with the gap filter all 13 sampled rows were true.
    if (PARTY_T.has(t) && !(m.parties || [m.party]).includes('Other')) return;
    const have = t.startsWith('party:') ? (m.parties || [m.party]).includes(t.slice(6)) : m.tags.includes(t);
    if (!have) count[t] = (count[t] || 0) + 1;
    rows.push([id, t, 'add', '"Wikipedia category: ' + c.replace(/"/g, "'") + '"'].join(','));
  });
});
fs.writeFileSync(path.join(ROOT, 'data', 'tag-wikicats.csv'), rows.join('\n') + '\n');
console.log(Object.keys(cache).length + ' articles; ' + (rows.length - 1) + ' tag rows; new versus the current members.js:');
console.log(Object.entries(count).sort((a, b) => b[1] - a[1]).map(x => x.join('=')).join(' '));
