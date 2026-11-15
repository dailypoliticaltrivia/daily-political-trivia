#!/usr/bin/env node
/* Build site/tools/dh-gov-dates.json (years for undated state-governor roles in people-db/people.json) and site/tools/dh-ltgov-roster.json
   (members of Congress who were lieutenant governor of a STATE) from audit/answers-govlt-roster.csv. Usage: node site/tools/make-dh-gov-dates.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const CODE = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const rows = fs.readFileSync(path.join(ROOT, 'audit', 'answers-govlt-roster.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
  .map(l => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')))
  .map(r => ({ id: r[0], name: r[1], office: r[2], st: CODE[r[3]] || r[3], from: r[4], to: r[5], url: r[6] }));
const ppl = {}; JSON.parse(fs.readFileSync(path.join(ROOT, 'people-db', 'people.json'), 'utf8')).people.forEach(p => { ppl[p.id] = p; });
const dates = {}, lt = {};
const SKIP_LT = new Set(['G000468']);   // Francis M. Griffith: only ACTING lieutenant governor of Indiana as Senate president pro tempore (round-3 check)
rows.forEach(r => {
  if (r.office === 'Governor') {
    const p = ppl[r.id]; const role = p && (p.roles || []).find(x => x.office === 'Governor' && x.place === r.st);
    if (role && !role.from) dates[r.id + '|' + r.st] = [r.from, r.to, r.name];
  } else if (r.office === 'Lieutenant Governor' && !SKIP_LT.has(r.id)) (lt[r.id] = lt[r.id] || []).push([r.st, r.from, r.to, r.url]);
});
fs.writeFileSync(path.join(__dirname, 'dh-gov-dates.json'), JSON.stringify({ _about: 'Years for state governor roles that people-db/people.json lists without dates (bioguide|state -> [from, to, name]), from audit/answers-govlt-roster.csv (Wikipedia lists of governors, each row confirmed by Wikidata or the member article). Read by build-dh-derived.js and build-dh-derived-2.js. Answer agent 2026-11-13.', dates }, null, 1));
fs.writeFileSync(path.join(__dirname, 'dh-ltgov-roster.json'), JSON.stringify({ _about: 'Members of Congress who were lieutenant governor of a U.S. state (bioguide -> [[state, from, to, list url]]), from audit/answers-govlt-roster.csv. Answer agent 2026-11-13.', lt }, null, 1));
console.log(Object.keys(dates).length + ' governor roles dated; ' + Object.keys(lt).length + ' lieutenant governors');
