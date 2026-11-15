#!/usr/bin/env node
/* Dark Horse answer completeness: fill the hand-written Congress / governor questions in bank-people.json and bank-people-2.json with every
   person who really qualifies, computed from the same corrected data the derived banks use (build-dh-derived.js: legislators-*.json terms with
   its TERM_CLIP / TERM_DROP / READMIT fixes, members.js tags, people.json governor roles with BAD_GOV / PARTY_FIX).
   Usage: node site/tools/fill-dh-people.js [--write] [--only id,id]
     default  report only (counts of missing answers, suspect existing answers, alias additions) into audit/answers-dh-people-report.tsv
     --write  add the missing answers and aliases to the banks (existing answers, weights, notes and jackpots are never changed)
   New answers take the derived banks' weight (Wikipedia page views or the structural prior), never jackpot. Each added row is logged to
   audit/answers-dark-horse-sources.csv with the bioguide / Wikidata id as its source. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes('--write');
const ONLY = ARGS.includes('--only') ? new Set(ARGS[ARGS.indexOf('--only') + 1].split(',')) : null;

// ---- load the derived generator's people model (everything above its "evaluate" section), then run our own specs inside it
const dsrc = fs.readFileSync(path.join(__dirname, 'build-dh-derived.js'), 'utf8').replace(/^#!.*\n/, '');
const cut = dsrc.indexOf('// ---------------------------------------------------------------- evaluate, dedupe, select');
if (cut < 0) throw new Error('build-dh-derived.js layout changed: evaluate marker not found');
const body = dsrc.slice(0, cut) + '\nreturn { people, congress, buildAnswers, norm, served, serveWin, hasCh, partyT, stateT, mtag, stag, isGov, isCab, CAB, CAB_EXCLUDE, ivyHit, firstYear, yrs, chYrs, STATE_NAME, DAY, keyIndex, dispName, aliasesFor };';
const M = new Function('require', '__dirname', '__filename', 'process', body)(require, __dirname, path.join(__dirname, 'build-dh-derived.js'), { argv: ['node', 'x', '--report'] });
const { people, buildAnswers, norm, served, hasCh, partyT, mtag, ivyHit, firstYear, yrs, chYrs, keyIndex } = M;

// ---- specs: question id -> qualifying filter over the people model
const S = t => t.ch === 'S', H = t => t.ch === 'H';
const inCong = p => p.terms.length > 0;
const fem = p => !!(p.m && p.m.gender === 'Woman');
const D119 = Date.UTC(2025, 0, 3);
const in119 = ch => p => p.terms.some(t => (!ch || t.ch === ch) && t.b - Math.max(t.a, D119) >= 7 * M.DAY);
const in119party = (ch, party) => p => p.terms.some(t => t.ch === ch && t.party === party && t.b - Math.max(t.a, D119) >= 7 * M.DAY);
const stSince = (st, y) => served(y, 2026, t => t.ch === 'H' && t.st === st);
const partySince = (ch, party, y) => served(y, 2026, t => t.ch === ch && t.party === party);
const govDuring = (a, b) => p => p.gov.some(g => +g.from <= b && (g.to ? +g.to : 2026) >= a);
const LT = fs.existsSync(path.join(__dirname, 'dh-ltgov-roster.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'dh-ltgov-roster.json'), 'utf8')).lt : {};   // state lieutenant governors (audit/answers-govlt-roster.csv)
const SPECS = {
  'people-0396': p => inCong(p) && !!LT[p.id],
  'people-0147': p => hasCh('S')(p),
  'people-0148': inCong,
  'people-0198': stSince('CA', 1993), 'people-0199': stSince('TX', 1993), 'people-0201': stSince('NY', 1993),
  'people-0250': served(1930, 1939, S), 'people-0251': served(1940, 1949, S), 'people-0252': served(1950, 1959, S), 'people-0253': served(1960, 1969, S),
  'people-0254': served(1970, 1979, S), 'people-0255': served(1980, 1989, S), 'people-0256': served(1990, 1999, S), 'people-0257': served(2000, 2009, S),
  'people-0258': served(2010, 2019, S), 'people-0259': served(2020, 2026, S),
  'people-0260': partySince('S', 'Republican', 1945), 'people-0261': partySince('S', 'Democrat', 1945),
  'people-0262': served(1990, 2026, S),
  'people-0263': partySince('H', 'Republican', 2000), 'people-0264': partySince('H', 'Democrat', 2000),
  'people-0318': p => fem(p) && hasCh('H')(p),
  'people-0319': p => fem(p) && served(1789, 1989)(p),
  'people-0320': p => fem(p) && partyT('Republican')(p),
  'people-0321': p => fem(p) && partyT('Democrat')(p),
  'people-0329': p => hasCh('S')(p) && hasCh('H')(p) && served(1980, 2026)(p),
  'people-0330': p => inCong(p) && yrs(p) >= 30,
  'people-0331': p => chYrs(p, 'S') >= 24,
  'people-0332': p => chYrs(p, 'H') >= 30,
  'people-0333': in119('S'), 'people-0337': in119('H'),
  'people-0338': in119party('H', 'Republican'), 'people-0339': in119party('H', 'Democrat'),
  'people-0340': p => fem(p) && in119('H')(p),
  'people-0389': p => inCong(p) && mtag('black')(p),
  'people-0391': p => inCong(p) && mtag('hispanic')(p),
  'people-0394': p => inCong(p) && M.isGov(p),
  'people-0395': p => hasCh('S')(p) && M.isGov(p),
  'people-0399': p => inCong(p) && mtag('bornabroad')(p),
  'people-0401': p => inCong(p) && ivyHit(p, ['harvard']),
  'people-0402': p => inCong(p) && ivyHit(p, ['yale']),
  'people-0403': p => inCong(p) && ivyHit(p, ['princeton']),
  'people2-0042': govDuring(1950, 1959), 'people2-0043': govDuring(1960, 1969), 'people2-0044': govDuring(1970, 1979), 'people2-0045': govDuring(1980, 1989),
  'people2-0046': govDuring(1990, 1999), 'people2-0047': govDuring(2000, 2009), 'people2-0048': govDuring(2010, 2019),
  'people2-0219': govDuring(1900, 1909), 'people2-0220': govDuring(1910, 1919), 'people2-0221': govDuring(1920, 1929), 'people2-0222': govDuring(1930, 1939), 'people2-0223': govDuring(1940, 1949),
  'people2-0254': p => { const f = firstYear(p); return fem(p) && f >= 2010 && f <= 2019; }
};
// people the data qualifies but an independent check could not confirm (never re-added); see audit/answers-dark-horse-log.md
const EXCLUDE = { 'people2-0219': new Set(['Horace Baker']), 'people-0401': new Set(['Jaime Fuster']) };
// border cases a reviewer should see (counts within half a year of a "30 years" style threshold)
const BORDER = {
  'people-0330': p => Math.abs(yrs(p) - 30) < 0.6, 'people-0331': p => Math.abs(chYrs(p, 'S') - 24) < 0.6, 'people-0332': p => Math.abs(chYrs(p, 'H') - 30) < 0.6
};

// ---- the game's matcher keys (same norm as trivia.js; automatic first+last for 3+ word names)
function keysOf(a) {
  const ks = new Set([norm(a.name)]); (a.aliases || []).forEach(x => ks.add(norm(x)));
  if (a.surname !== false) { const t = norm(a.name).split(' '); if (t.length >= 3) ks.add(t[0] + ' ' + t[t.length - 1]); }
  ks.delete(''); return ks;
}
function personKeys(p) {
  const ks = new Set([norm(M.dispName(p)), norm(p.name)]);
  if (p.leg) {
    const n = p.leg.name;
    if (n.first) ks.add(norm(n.first + ' ' + n.last));
    if (n.nickname) ks.add(norm(n.nickname.replace(/["']/g, '') + ' ' + n.last));
    if (n.official_full) ks.add(norm(n.official_full));
    if (n.first && n.middle) ks.add(norm(n.first + ' ' + n.middle + ' ' + n.last));
  }
  (p.p.aliases || []).forEach(x => { if (/\s/.test(x.trim())) ks.add(norm(x)); });
  ks.delete(''); return ks;
}
const kidx = keyIndex();
// people reachable from an answer key (the derived key index plus our extra person keys)
const PK = new Map();
people.forEach(p => personKeys(p).forEach(k => { let s = PK.get(k); if (!s) PK.set(k, s = new Set()); s.add(p); }));

const BANKS = ['bank-people.json', 'bank-people-2.json'];
const DIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const report = [['qid', 'kind', 'name', 'weight', 'source', 'detail'].join('\t')];
const srcRows = [];
const summary = [];
for (const bf of BANKS) {
  const bank = JSON.parse(fs.readFileSync(path.join(DIR, bf), 'utf8'));
  let changed = false;
  for (const q of bank.questions) {
    const f = SPECS[q.id]; if (!f || (ONLY && !ONLY.has(q.id))) continue;
    const list = people.filter(p => { try { return f(p); } catch (e) { return false; } });
    const qual = new Set(list);
    const computed = buildAnswers(list);
    // existing answer keys -> answer index
    const exKey = new Map(); q.answers.forEach((a, i) => keysOf(a).forEach(k => { if (!exKey.has(k)) exKey.set(k, i); }));
    const matchedEx = new Set();
    const toAdd = [], aliasAdds = [];
    for (const ca of computed) {
      const ps = ca._it.ps;
      const pk = new Set(); ps.forEach(p => personKeys(p).forEach(k => pk.add(k)));
      keysOf(ca).forEach(k => pk.add(k));
      let hit = -1; for (const k of pk) if (exKey.has(k)) { hit = exKey.get(k); break; }
      if (hit >= 0) {
        matchedEx.add(hit);
        // safe extra spellings for the existing answer: the computed name/aliases the existing answer lacks, if no other answer or famous outsider owns them
        const ex = q.answers[hit], have = keysOf(ex);
        const cand = [ca.name].concat(ca.aliases || []);
        for (const x of cand) {
          const k = norm(x); if (have.has(k) || k.split(' ').length < 2) continue;
          if (exKey.has(k) && exKey.get(k) !== hit) continue;
          const owners = [...(PK.get(k) || [])].filter(p2 => !ps.includes(p2));
          if (owners.some(p2 => p2.w <= 3 || qual.has(p2))) continue;
          aliasAdds.push({ i: hit, alias: x, p: ps[0] }); have.add(k); exKey.set(k, hit);
        }
        continue;
      }
      if (EXCLUDE[q.id] && EXCLUDE[q.id].has(ca.name)) continue;
      toAdd.push(ca);
    }
    // existing answers no qualifying person explains
    q.answers.forEach((a, i) => {
      if (matchedEx.has(i)) return;
      const ks = keysOf(a); const ppl = new Set(); ks.forEach(k => (PK.get(k) || []).forEach(p => ppl.add(p)));
      const why = !ppl.size ? 'no person found under this name' : 'found but does not qualify: ' + [...ppl].slice(0, 3).map(p => p.id + ' ' + p.name).join('; ');
      report.push([q.id, 'SUSPECT', a.name, a.weight, '', why].join('\t'));
    });
    toAdd.forEach(ca => {
      const p = ca._it.p, src = p.leg ? 'bioguide ' + p.id : 'wikidata ' + (p.wd || p.id);
      const det = BORDER[q.id] && BORDER[q.id](p) ? 'BORDER ' + (q.id === 'people-0330' ? yrs(p) : chYrs(p, q.id === 'people-0331' ? 'S' : 'H')).toFixed(2) + ' yrs' : '';
      report.push([q.id, 'ADD', ca.name, ca.weight, src, det].join('\t'));
    });
    aliasAdds.forEach(x => report.push([q.id, 'ALIAS', q.answers[x.i].name, '', x.p.leg ? 'bioguide ' + x.p.id : 'wikidata ' + x.p.wd, x.alias].join('\t')));
    summary.push(`${q.id}\t${q.answers.length} -> ${q.answers.length + toAdd.length}\t+${toAdd.length} answers, +${aliasAdds.length} aliases, ${q.answers.length - matchedEx.size} unexplained\t${q.prompt}`);
    if (WRITE && (toAdd.length || aliasAdds.length)) {
      aliasAdds.forEach(x => { const a = q.answers[x.i]; (a.aliases = a.aliases || []).push(x.alias); srcRows.push([q.id, 'alias', a.name + ' => ' + x.alias, x.p.leg ? 'https://bioguide.congress.gov/search/bio/' + x.p.id : 'https://www.wikidata.org/wiki/' + x.p.wd, 'legislators name fields / people.json aliases'].join(',')); });
      toAdd.forEach(ca => {
        const a = { name: ca.name }; if (ca.aliases) a.aliases = ca.aliases; if (ca.surname === false) a.surname = false; a.weight = ca.weight;
        q.answers.push(a);
        const p = ca._it.p;
        srcRows.push([q.id, 'add', '"' + ca.name.replace(/"/g, '') + '"', p.leg ? 'https://bioguide.congress.gov/search/bio/' + p.id : 'https://www.wikidata.org/wiki/' + p.wd, p.leg ? 'congress-legislators terms' : 'people.json governor roles'].join(','));
      });
      changed = true;
    }
  }
  if (WRITE && changed) fs.writeFileSync(path.join(DIR, bf), JSON.stringify(bank));
}
const AUD = path.join(ROOT, 'audit');
fs.writeFileSync(path.join(AUD, 'answers-dh-people-report.tsv'), report.join('\n') + '\n');
if (WRITE && srcRows.length) {
  const f = path.join(AUD, 'answers-dark-horse-sources.csv');
  if (!fs.existsSync(f)) fs.writeFileSync(f, 'question,change,answer,source,evidence\n');
  fs.appendFileSync(f, srcRows.join('\n') + '\n');
}
console.log(summary.join('\n'));
