#!/usr/bin/env node
/* Dark Horse place questions (Census-built city / county / county-seat lists): add the spellings players actually type that the matcher cannot reach.
   - "St. X" <-> "Saint X", "Ste. X" <-> "Sainte X", "Mount X" <-> "Mt. X", "Fort X" <-> "Ft. X" (the typo tolerance cannot bridge "st" and "saint")
   - Census form names: "Weymouth Town" (Massachusetts town-form cities) -> "Weymouth"; "Town of Pecos" / "Village of Clarkston" / "The Village of Indian Hill" -> the bare name;
     "Juneau City and Borough" -> "Juneau"; a New Jersey "Freehold Borough" county seat -> "Freehold"
   An alias is only proposed when no other answer of the same question already owns that spelling (so nothing becomes ambiguous).
   Usage: node site/tools/fill-dh-place-aliases.js > audit/answers-dh-edits-r2-places.json   then apply with dh-answer-edits.js */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'games', 'dark-horse', 'data');
const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'dark-horse', 'trivia.js'), 'utf8');
const norm = new Function(src.slice(src.indexOf('function norm('), src.indexOf('/* Optimal string')) + '\nreturn norm;')();
const IDS = new Set(['curated-0044', 'curated-0045', 'curated-0046', 'curated-0047'].concat(Array.from({ length: 14 }, (_, i) => 'curated2-00' + (19 + i))));
const SWAP = [[/^St\. /, 'Saint '], [/^Saint /, 'St. '], [/ St\. /, ' Saint '], [/ Saint /, ' St. '], [/^Ste\. /, 'Sainte '], [/ Ste\. /, ' Sainte '], [/^Sainte /, 'Ste. '],
  [/^Mount /, 'Mt. '], [/ Mount /, ' Mt. '], [/^Mt\. /, 'Mount '], [/^Fort /, 'Ft. '], [/ Fort /, ' Ft. '], [/^Ft\. /, 'Fort ']];
const edits = [];
JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).banks.forEach(f => {
  JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).questions.forEach(q => {
    if (!IDS.has(q.id)) return;
    const owner = new Map();
    q.answers.forEach((a, i) => [a.name].concat(a.aliases || []).forEach(x => { const k = norm(x); if (!owner.has(k)) owner.set(k, i); }));
    q.answers.forEach((a, i) => {
      const cand = new Set();
      [a.name].concat((a.aliases || []).filter(x => !x.includes(','))).forEach(nm => SWAP.forEach(([re, rep]) => { if (re.test(nm)) cand.add(nm.replace(re, rep)); }));
      const ma = (a.aliases || []).some(x => /Massachusetts|, MA$/.test(x)) || q.id === 'curated2-0030';
      let m;
      if (ma && (m = /^(.+) Town$/.exec(a.name))) cand.add(m[1]);
      if ((m = /^(?:The )?(?:Town|Village|City) of (.+)$/.exec(a.name))) cand.add(m[1]);
      if ((m = /^(.+) City and Borough$/.exec(a.name))) cand.add(m[1]);
      // Census disambiguation in brackets: "Rutland (city)" -> "Rutland" (the matcher's last-word rule would only reach "city"); "San Buenaventura (Ventura)" -> both names
      if ((m = /^(.+?) \(([^)]+)\)$/.exec(a.name))) { cand.add(m[1]); if (!/^(city|town|village|CDP|hamlet|borough)$/i.test(m[2])) cand.add(m[2]); }
      if (q.id === 'curated-0044' && (m = /^(.+) Borough$/.exec(a.name))) cand.add(m[1]);
      [...cand].forEach(c => {
        // the swapped form of a derived base name too (e.g. "Village of St. X" -> "Saint X")
        SWAP.forEach(([re, rep]) => { if (re.test(c)) cand.add(c.replace(re, rep)); });
      });
      cand.forEach(c => {
        const k = norm(c); if (!k || owner.has(k)) return;
        owner.set(k, i);
        edits.push({ q: q.id, op: 'alias', name: a.name, alias: c, source: 'name variant', reason: 'standard abbreviation / Census form name of the same place' });
      });
    });
  });
});
process.stdout.write(JSON.stringify(edits, null, 1) + '\n');
console.error(edits.length + ' alias edits');
