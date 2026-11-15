'use strict';
/* Dark Horse curated banks, round 2 (non-person lists, plus world leaders): SOURCES say where each list comes from (a Wikidata query, a Wikipedia
   list table, or a round-1 listing re-used); QUESTIONS say how each question is cut from a source (era / region / type filters, wording, tier cut-offs).
   fetch-dh-curated-2.js downloads the sources into audit/dh-curated2-data/; build-dh-curated-2.js builds site/games/dark-horse/data/bank-curated2-N.json. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

const stripParenT = t => t.replace(/\s+\([^()]*\)\s*$/, '').trim();
const SOURCES = [];
const src = (o) => SOURCES.push(o);

/* ---------------- law, Congress, federal government ---------------- */
src({ key: 'acts', intro: true, introTop: 300, want: r => !ACT_BAD.test(r.t) && !actYears().get(r.t), pattern: '?x wdt:P31 wd:Q476068.', date: 'wdt:P577|wdt:P571|wdt:P585', why: 'Wikidata instance of Act of Congress in the United States (Q476068)' });
src({ key: 'cong-committees', skipViews: true, pattern: '?x wdt:P31/wdt:P279* wd:Q476190.', date: 'wdt:P571', why: 'Wikidata instance of United States congressional committee (Q476190 and subclasses)' });
src({ key: 'nps-list', viewsTop: 600, wikitable: 'List of areas in the United States National Park System', why: 'Wikipedia list of areas in the National Park System (table, one row per unit)' });
src({ key: 'sc-cases', intro: true, introTop: 300, want: r => scSet().has(stripParenT(r.t)) && !scYears().get(r.t), reuse: 'sc-cases.json', why: 'round-1 listing (Wikidata court = Supreme Court of the United States, checked against Oyez)' });
src({ key: 'sc-extra', inlineFile: 'dh-curated2-sc-extra.json', why: 'hand-added Supreme Court cases named in the civics banks but missing from the round-1 Wikidata list (dh-curated2-sc-extra.json)' });
src({ key: 'battles-us-soil', reuse: 'battles-us-soil.json', want: r => r.y >= 1861 && r.y <= 1865, viewsTop: 600, why: 'round-1 listing of battles located in a U.S. state or territory (Wikidata location chain)' });
src({ key: 'civilwar-battles', viewsTop: 520, pattern: '?x wdt:P31/wdt:P279* wd:Q178561; wdt:P361|wdt:P607 wd:Q8676.', date: 'wdt:P585|wdt:P580', why: 'Wikidata battles that are part of / conflict = American Civil War (Q8676)' });
src({ key: 'unrest-us', pattern: 'VALUES ?c { wd:Q49776 wd:Q124757 } ?x wdt:P31 ?c; wdt:P17 wd:Q30.', date: 'wdt:P580|wdt:P585', why: 'Wikidata direct instances of strike (Q49776) and riot (Q124757) in the United States' });
src({ key: 'usn-ships', viewsTop: 1000, want: r => /^USS /.test(r.t) && /(destroyer|frigate|submarine|battleship|carrier|cruiser)/i.test(r.ds || ''), pattern: '?x wdt:P137 wd:Q11220. ?x wdt:P31/wdt:P279* wd:Q11446.', date: 'wdt:P729|wdt:P571|wdt:P1619', why: 'Wikidata ships operated by the United States Navy (Q11220)' });

src({ key: 'latin-terms', rawlist: 'List_of_Latin_legal_terms', why: 'Wikipedia "List of Latin legal terms" (table rows)' });
src({ key: 'scandals', intro: true, reuse: 'scandals.json', why: 'round-1 listing (Wikidata instance of political scandal)' });
src({ key: 'courts', intro: true, reuse: 'courts.json', why: 'round-1 listing (Wikidata instance of court)' });
src({ key: 'advocacy-groups', intro: true, reuse: 'advocacy-groups.json', why: 'round-1 listing (Wikidata instance of pressure group)' });
src({ key: 'us-other-cases', intro: true, reuse: 'us-other-cases.json', why: 'round-1 listing (Wikidata legal cases of U.S. courts other than the Supreme Court)' });

src({ key: 'sc-meta', pattern: '?x wdt:P4884 wd:Q11201. OPTIONAL { ?x wdt:P1031 ?cit. }', date: 'wdt:P577|wdt:P585', skipViews: true,
  extra: { sel: '(GROUP_CONCAT(DISTINCT ?cit; separator=" ; ") AS ?cits)', group: '', read: b => [b.cits ? b.cits.value : ''] }, why: 'Wikidata Supreme Court cases with legal citations (P1031) and dates, used to date cases' });
src({ key: 'acts-meta', pattern: '?x wdt:P31 wd:Q476068. OPTIONAL { ?x wdt:P1031 ?cit. }', date: 'wdt:P577|wdt:P571|wdt:P585', skipViews: true,
  extra: { sel: '(GROUP_CONCAT(DISTINCT ?cit; separator=" ; ") AS ?cits)', group: '', read: b => [b.cits ? b.cits.value : ''] }, why: 'Wikidata acts of Congress with legal citations (P1031), used to date acts' });

/* ---------------- world politics ---------------- */
src({ key: 'intel-agencies', intro: true, pattern: '?x wdt:P31/wdt:P279* wd:Q47913.', date: 'wdt:P571', why: 'Wikidata instance of intelligence agency (Q47913 and subclasses)' });
src({ key: 'summits', skipViews: true, pattern: '?x wdt:P31/wdt:P279* wd:Q1072326.', date: 'wdt:P580|wdt:P585', why: 'Wikidata instance of summit (Q1072326 and subclasses)' });
src({ key: 'coups', skipViews: true, pattern: '?x wdt:P31/wdt:P279* wd:Q45382.', date: 'wdt:P585|wdt:P580', why: 'Wikidata instance of coup d’état (Q45382 and subclasses)' });
src({ key: 'revolutions', skipViews: true, pattern: '?x wdt:P31/wdt:P279* wd:Q10931.', date: 'wdt:P580|wdt:P585', why: 'Wikidata instance of revolution (Q10931 and subclasses)' });
src({ key: 'us-named-places', skipViews: true, pattern: '?x wdt:P17 wd:Q30; wdt:P31/wdt:P279* wd:Q486972; wdt:P138 ?nm. ?nm wdt:P31 wd:Q5.', date: 'wdt:P571', why: 'Wikidata human settlements in the United States whose "named after" (P138) is a person' });
src({ key: 'leaders', viewsTop: 3000, want: r => r.y != null && r.y >= 1900, pattern: `?c wdt:P31 wd:Q3624078. FILTER(?c != wd:Q30) ?c wdt:P1313|wdt:P1906 ?pos. ?pos rdfs:label ?pln. FILTER(LANG(?pln) = 'en')
    ?x p:P39 ?stt. ?stt ps:P39 ?pos. OPTIONAL { ?stt pq:P580 ?sd. } BIND(YEAR(?sd) AS ?y0) ?x wdt:P31 wd:Q5.`,
  extra: { sel: '(SAMPLE(?pln) AS ?pl) (SAMPLE(STRAFTER(STR(?c), "entity/")) AS ?cc)', group: '', read: b => [b.pl ? b.pl.value : '', b.cc ? b.cc.value : ''] },
  why: 'Wikidata humans holding the office that a sovereign state (other than the United States) lists as its head of government (P1313) or head of state (P1906) office' });

src({ key: 'leaders-manual', manualFile: 'dh-curated2-leaders-manual.json', skipViews: true, why: 'hand-added heads of state/government missing from the Wikidata office links (dh-curated2-leaders-manual.json); sitelinks looked up by title' });
src({ key: 'leaders2', viewsTop: 1500, want: r => r.y != null && r.y >= 1900, pattern: `{ ?c wdt:P31 wd:Q3624078 } UNION { ?c wdt:P31/wdt:P279* wd:Q3024240 } FILTER(?c != wd:Q30) ?c p:P6|p:P35 ?stt. ?stt ps:P6|ps:P35 ?x. ?x wdt:P31 wd:Q5. OPTIONAL { ?stt pq:P580 ?sd. } BIND(YEAR(?sd) AS ?y0)`,
  extra: { sel: '(SAMPLE(STRAFTER(STR(?c), "entity/")) AS ?cc)', group: '', read: b => ['', b.cc ? b.cc.value : ''] },
  why: 'Wikidata humans listed as head of government (P6) or head of state (P35) of a sovereign or historical state (other than the United States)' });

/* ======================================================================== QUESTIONS ======================================================================== */
const QUESTIONS = [];
const Q = (o) => QUESTIONS.push(Object.assign({ diff: 2, kind: 'plain' }, o));

/* ---- Supreme Court cases by decision year (the round-1 verified, Oyez-checked list). Year of a case, in this order: a year printed in its
        citation ("(2003)" or "1896 U.S. LEXIS"), the U.S. Reports volume converted to a year, the Wikidata date, the Oyez term. Cases with no year
        at all, or a year that is only a volume/term estimate within a year of an era boundary, are left out of the era questions (they stay in the round-1 all-eras question). ---- */
const DATAD = path.join(ROOT, 'audit', 'dh-curated2-data');
let SCSET = null;
function scSet() {
  if (!SCSET) {
    const b = readJson(path.join(ROOT, 'site', 'games', 'dark-horse', 'data', 'bank-curated-1.json'), { questions: [] });
    const q = b.questions.find(x => x.id === 'curated-0001');
    SCSET = new Set(q ? q.answers.map(a => a.name) : []);
  }
  return SCSET;
}
const US_ANCH = [[1, 1791], [4, 1800], [5, 1801], [13, 1815], [14, 1816], [25, 1827], [26, 1828], [41, 1842], [42, 1843], [65, 1860], [66, 1861], [67, 1862], [68, 1863], [90, 1874], [91, 1875], [107, 1883], [113, 1885], [128, 1888], [143, 1892], [163, 1896], [198, 1905], [245, 1918], [260, 1922], [268, 1925], [281, 1930], [287, 1932], [300, 1937], [310, 1940], [319, 1943], [323, 1944], [333, 1948], [343, 1952], [347, 1954], [360, 1959], [372, 1963], [384, 1966], [393, 1969], [410, 1973], [420, 1975], [438, 1978], [453, 1981], [470, 1985], [474, 1986], [483, 1987], [500, 1991], [505, 1992], [515, 1995], [521, 1997], [530, 2000], [539, 2003], [543, 2005], [550, 2007], [554, 2008], [558, 2009], [561, 2010], [564, 2011], [567, 2012], [570, 2013], [573, 2014], [576, 2015], [579, 2016], [581, 2017], [584, 2018], [588, 2019], [591, 2020], [593, 2021], [597, 2022], [598, 2023], [601, 2024], [604, 2025]];
function interp(table, v) { for (let i = 0; i < table.length - 1; i++) { const [a, ya] = table[i], [b, yb] = table[i + 1]; if (v >= a && v <= b) return Math.round(ya + (yb - ya) * (v - a) / Math.max(1, b - a)); } return null; }
const YEARS_MANUAL = readJson(path.join(__dirname, 'dh-curated2-years-manual.json'), {});
let INTROC = null;
/* year printed in the Wikipedia lead of a case ("347 U.S. 483 (1954)") or act ("enacted July 2, 1964"); the lead cache is filled by fetch-dh-curated-2.js with INTROS=1 */
function leadYear(title, kind) {
  if (!INTROC) INTROC = Object.assign({}, readJson(path.join(ROOT, 'audit', 'dh-curated-data', '_intros.json'), {}), readJson(path.join(DATAD, '_intros.json'), {}));
  const t = INTROC[title]; if (!t) return null;
  let m;
  if (kind === 'sc') { m = t.match(/\bU\.\s?S\.\s*\d+[^()]{0,40}\(\s*(?:[A-Za-z.]+ \d{1,2}, )?(1[789]\d\d|20[0-2]\d)\s*\)/) || t.match(/\b(?:decided|ruled|held)[^.]{0,60}?\b(1[789]\d\d|20[0-2]\d)\b/i) || t.match(/\((?:[A-Za-z]+ \d{1,2}, )(1[789]\d\d|20[0-2]\d)\)/); }
  else { m = t.match(/\b(?:enacted|signed|approved|passed|became law|adopted|enacted into law)[^.]{0,60}?\b(1[789]\d\d|20[0-2]\d)\b/i) || t.match(/\bof (1[789]\d\d|20[0-2]\d)\b/); }
  return m ? +m[1] : null;
}
let SCY = null;
function scYears() {
  if (SCY) return SCY;
  SCY = new Map();
  const oy = readJson(path.join(ROOT, 'audit', 'dh-curated-data', '_oyez-index.json'), {});
  const oyBy = new Map(); for (const v of Object.values(oy)) oyBy.set(String(v[1]).toLowerCase(), v[0]);
  for (const r of readJson(path.join(DATAD, 'sc-meta.json'), [])) {
    const name = r.t.replace(/\s+\([^()]*\)\s*$/, '').trim();
    const c = (r.x && r.x[0]) || '';
    let y = null, how = '', m;
    if ((m = c.match(/\((\d{4})\)/) || c.match(/\b(1[789]\d\d|20[0-2]\d) U\.S\. LEXIS/))) { y = +m[1]; how = 'citation'; }
    else if ((m = c.match(/\b(\d{1,3}) U\.S\. (\d+)/))) { y = interp(US_ANCH, +m[1]); how = 'volume'; }
    else if (r.y) { y = r.y; how = 'date'; }
    else if (oyBy.has(name.toLowerCase())) { y = oyBy.get(name.toLowerCase()); how = 'oyez'; }
    if (!y) { const ly = leadYear(r.t, 'sc'); if (ly) { y = ly; how = 'lead'; } }
    else if (how === 'volume' || how === 'oyez') { const ly = leadYear(r.t, 'sc'); if (ly) { y = ly; how = 'lead'; } }
    if (!y && YEARS_MANUAL.sc && YEARS_MANUAL.sc[r.t]) { y = YEARS_MANUAL.sc[r.t]; how = 'manual'; }
    if (y) SCY.set(r.t, { y, how });
  }
  return SCY;
}
const SC_BOUNDS = [1932, 1933, 1968, 1969, 1985, 1986, 2004, 2005];
const scYear = (r) => { if (r.manual) return r.y; const e = scYears().get(r.t); return e ? e.y : null; };
const scWhere = (r, intro, y, key) => {
  if (key === 'sc-extra') return true;
  if (!scSet().has(r.t.replace(/\s+\([^()]*\)\s*$/, '').trim())) return false;
  const e = scYears().get(r.t); if (!e) return false;
  return !((e.how === 'volume' || e.how === 'oyez') && SC_BOUNDS.includes(e.y));
};
const SC_NOTE = 'Any U.S. Supreme Court decision with its own English Wikipedia article and a decision year in that range counts, landmark or obscure. The year is the year the Court decided the case.';
const scEra = (key, label, lo, hi, cuts) => Q({ key, source: ['sc-cases', 'sc-extra'], cat: 'supreme-court', diff: 2, kind: 'case', prompt: 'Name a U.S. Supreme Court case decided ' + label, note: SC_NOTE, lo, hi, yearFrom: scYear, where: scWhere, cuts,
  src: 'Round-1 Supreme Court list (Wikidata court = Supreme Court of the United States; Oyez-checked), cut by decision year (citation, U.S. Reports volume, Wikidata date, Oyez term)', fame: { prompt: /Supreme Court case/i, t1: 4, t2: 3, mention: 3, floor: 3 } });
scEra('sc-to-1932', 'in 1932 or earlier', null, 1932, [10, 30, 70, 130]);
scEra('sc-1933-1968', 'between 1933 and 1968', 1933, 1968, [14, 40, 90, 180]);
scEra('sc-1969-1985', 'between 1969 and 1985', 1969, 1985, [14, 40, 90, 180]);
scEra('sc-1986-2004', 'between 1986 and 2004', 1986, 2004, [14, 40, 90, 180]);
scEra('sc-2005-on', 'in 2005 or later', 2005, null, [14, 40, 90, 180]);

/* ---- Acts of Congress by enactment year. Year of an act: "of YYYY" in the title, else the Wikidata date, else the Statutes at Large volume converted
        to a year, else the Congress number of its Public Law; estimates within a year of an era boundary are left out. ---- */
const ACT_BAD = /^(P\.L\.|Public Law|Treaty |Title \d|.*United States Code$|.*Order$)|Resolution$|^Authorization for Use|^An Act /;
const STAT_ANCH = [[1, 1789], [9, 1845], [12, 1861], [14, 1866], [17, 1872], [20, 1878], [25, 1888], [30, 1898], [35, 1908], [40, 1918], [45, 1928], [50, 1936], [55, 1941], [60, 1946], [65, 1951], [70, 1956], [75, 1961], [78, 1964], [80, 1966], [85, 1971], [90, 1976], [94, 1980], [100, 1986], [104, 1990], [108, 1994], [112, 1998], [116, 2002], [120, 2006], [124, 2010], [128, 2014], [132, 2018], [136, 2022], [138, 2024]];
let ACTY = null;
function actYears() {
  if (ACTY) return ACTY;
  ACTY = new Map();
  for (const r of readJson(path.join(DATAD, 'acts-meta.json'), [])) {
    const c = (r.x && r.x[0]) || '';
    let y = null, how = '', m;
    if ((m = r.t.match(/\b(?:of|,) (1[78]\d\d|19\d\d|20[0-2]\d)\b/))) { y = +m[1]; how = 'title'; }
    else if (r.y) { y = r.y; how = 'date'; }
    else if ((m = c.match(/\b(\d{1,3}) Stat\. \d+/))) { y = interp(STAT_ANCH, +m[1]); how = 'stat'; }
    else if ((m = c.match(/P(?:ub)?\.? ?L\.? ?(\d{2,3})\s*[–−-]\s*\d+/))) { const n = +m[1]; if (n >= 1 && n <= 119) { y = 1790 + 2 * (n - 1) + 1; how = 'congress'; } }
    if (!y || how === 'stat' || how === 'congress') { const ly = leadYear(r.t, 'act'); if (ly) { y = ly; how = 'lead'; } }
    if ((!y || how === 'stat' || how === 'congress') && YEARS_MANUAL.acts && YEARS_MANUAL.acts[r.t]) { y = YEARS_MANUAL.acts[r.t]; how = 'manual'; }
    if (y) ACTY.set(r.t, { y, how });
  }
  return ACTY;
}
const ACT_BOUNDS = [1900, 1901, 1945, 1946, 1980, 1981, 2000, 2001];
const actYear = (r) => { const e = actYears().get(r.t); return e ? e.y : null; };
const actWhere = (r) => { if (ACT_BAD.test(r.t)) return false; const e = actYears().get(r.t); if (!e) return false; return !((e.how === 'stat' || e.how === 'congress') && ACT_BOUNDS.includes(e.y)); };
const ACT_NOTE = 'Acts of the U.S. Congress with their own English Wikipedia article and an enactment year in that range count, famous or obscure (for example the Homestead Act or the Civil Rights Act of 1964). Joint resolutions, treaties and executive orders do not.';
const actEra = (key, label, lo, hi, cuts) => Q({ key, source: 'acts', cat: 'federal-laws', diff: 2, kind: 'act', prompt: 'Name an act of Congress passed ' + label, note: ACT_NOTE, lo, hi, yearFrom: actYear, where: actWhere, cuts,
  src: 'Wikidata instance of Act of Congress in the United States; year from the title, the Wikidata date or the Statutes at Large / Public Law citation', fame: { category: 'federal-laws', t1: 4, t2: 3, mention: 3, floor: 3 } });
actEra('acts-to-1900', 'in 1900 or earlier', null, 1900, [10, 30, 70, 130]);
actEra('acts-1901-1945', 'between 1901 and 1945', 1901, 1945, [10, 30, 70, 130]);
actEra('acts-1946-1980', 'between 1946 and 1980', 1946, 1980, [10, 30, 70, 130]);
actEra('acts-1981-2000', 'between 1981 and 2000', 1981, 2000, [10, 30, 70, 130]);
actEra('acts-2001-on', 'in 2001 or later', 2001, null, [10, 30, 70, 130]);

/* ---- National Park System ---- */
Q({ key: 'nps', source: 'nps-list', cat: 'symbols-landmarks', diff: 2, prompt: 'Name a unit of the U.S. National Park System (a national park, monument, memorial, battlefield, historic site or similar)',
  note: 'Any of the roughly 430 areas administered by the National Park Service, under the name Wikipedia gives it, counts (for example Yosemite National Park, Gettysburg National Military Park, Statue of Liberty National Monument). The short name without the type may be accepted when unambiguous.',
  src: 'Wikipedia "List of areas in the United States National Park System" (current sections only; former, authorized and transferred areas and affiliated areas are left out)', kind: 'nps', cuts: [12, 40, 130, 330], mergeByTitle: true, fame: { prompt: /national park|monument|memorial|historic landmark/i, mention: 3 },
  where: (r) => !/^(Former|Authorized|Transferred|Other|National heritage)/i.test(r.sec || '') || (/^Other/.test(r.sec || '') && NPS_OTHER_OK.test(r.n)) });
const NPS_OTHER_OK = /^(Catoctin Mountain Park|Constitution Gardens|Fort Washington Park|Greenbelt Park|National Capital Parks-East|National Mall and Memorial Parks|Piscataway Park|Prince William Forest Park|Rock Creek Park|White House|Wolf Trap National Park for the Performing Arts|Aleutian World War II National Historic Area)$/;

/* ---- American Civil War (Wikidata "part of the American Civil War" plus the round-1 U.S.-soil battle list for 1861-1865 whose Wikipedia lead says Civil War) ---- */
Q({ key: 'civilwar', source: ['civilwar-battles', 'battles-us-soil'], yearSources: ['battles-us-soil'], lo: 1861, hi: 1865, where: (r, intro, y, key) => key !== 'battles-us-soil' || !intro || /Civil War/.test(intro),
  cat: 'wars-foreign-policy', diff: 2, kind: 'battle', prompt: 'Name a battle, siege or skirmish of the American Civil War (1861-1865)',
  note: 'Any engagement of the American Civil War with its own English Wikipedia article counts, from Bull Run and Gettysburg to small skirmishes. The name may be given with or without "Battle of".',
  src: 'Wikidata battles that are part of the American Civil War, plus the round-1 U.S.-soil battle list (1861-1865, Wikipedia lead says Civil War)', cuts: [14, 45, 110, 250], fame: { prompt: /Civil War/i, t1: 2, mention: 2, floor: 2 } });

/* ---- Latin legal terms ---- */
const LATIN_T1 = ['habeas corpus', 'pro bono', 'quid pro quo', 'mens rea', 'de facto', 'de jure', 'ad hoc', 'per se', 'prima facie', 'subpoena', 'bona fide', 'amicus curiae', 'voir dire', 'pro se', 'stare decisis', 'ex post facto', 'in loco parentis', 'caveat emptor', 'alibi', 'pro tempore', 'et cetera', 'in absentia', 'status quo', 'persona non grata', 'ipso facto', 'sub judice', 'actus reus', 'res judicata', 'ex parte', 'in re'];
const LATIN_T2 = ['certiorari', 'ultra vires', 'sine die', 'nolo contendere', 'in camera', 'pro rata', 'guardian ad litem', 'ad litem', 'de novo', 'sua sponte', 'pro forma', 'corpus delicti', 'modus operandi', 'per curiam', 'obiter dictum', 'affidavit', 'pendente lite', 'in flagrante delicto', 'ex officio', 'ad valorem', 'mea culpa', 'nunc pro tunc', 'ab initio', 'de minimis', 'ex rel', 'mandamus', 'sine qua non', 'res ipsa loquitur', 'in limine', 'inter alia', 'a priori', 'jus soli', 'jus sanguinis', 'casus belli', 'terra nullius', 'ceteris paribus', 'mutatis mutandis', 'ad infinitum', 'pari passu', 'locus standi', 'amicus', 'ex gratia', 'in personam', 'in rem', 'lex loci', 'lis pendens', 'mala fide', 'mala in se', 'malum prohibitum', 'non compos mentis', 'onus probandi', 'pro hac vice', 'quantum meruit', 'quo warranto', 'respondeat superior', 'sui generis', 'ultimatum'];
Q({ key: 'latin-legal', source: 'latin-terms', manualTiers: { 1: LATIN_T1, 2: LATIN_T2 }, where: (r) => !r.nolink && (r.n || r.t).length >= 3, cat: 'political-terms', diff: 3, kind: 'plain', prompt: 'Name a Latin term or phrase used in law (such as habeas corpus)',
  note: 'Any Latin (or Law Latin) term or maxim from Wikipedia’s list of Latin legal terms counts, in common-law, civil-law and church-law use (for example habeas corpus, mens rea, pro bono, quid pro quo). Capitals and accents do not matter.',
  src: 'Wikipedia "List of Latin legal terms" (page-less terms: sitelinks of the linked article; tiers 1-2 set by hand for the 90 terms every civics student knows)', cuts: [0, 0, 40, 130], min: 150 });

/* ---- Reused round-1 listings that were left out only for being under 350 answers ---- */
Q({ key: 'scandals', source: 'scandals', where: (r) => r.s >= 2 && scandLeadOk(r.t) && /(scandal|affair|controvers|gate$|incident|case|scam|leak|corruption|bribe|fraud|crisis|plot|conspiracy|allegation|misconduct|revelation|\bCar Wash\b|Contra|Watergate|Whitewater|Profumo|Dreyfus|Lewinsky)/i.test(r.t + ' ' + (r.ds || '')) && !/Children's gulag|Hidden Supplies|Countrywide|Rose Valley|Euro Bank|Hangul|Hong Kong 818|Pegasus Project|Workers' Youth League/.test(r.t), cat: 'scandals', diff: 2, kind: 'scandal', prompt: 'Name a political scandal or affair from anywhere in the world',
  note: 'Any political scandal, affair or corruption case with its own English Wikipedia article counts (any country or era), for example Watergate, Iran-Contra or the Whiskey Ring.', src: 'Wikidata instance of political scandal', cuts: [14, 45, 100, 160], fame: { prompt: /scandal|Watergate/i, mention: 2 } });
Q({ key: 'us-other-cases', source: 'us-other-cases', cat: 'civics-basics', diff: 2, kind: 'case', prompt: 'Name a U.S. court case that was NOT decided by the Supreme Court (a trial, state-court or lower federal court case)',
  note: 'U.S. trials, state-court cases and lower federal court cases with an English Wikipedia article count (for example the Scopes trial or the Salem witch trials); Supreme Court decisions do not.', src: 'Wikidata legal cases of U.S. courts other than the Supreme Court', cuts: [10, 30, 70, 130] });
Q({ key: 'courts', source: 'courts', cat: 'supreme-court', diff: 2, prompt: 'Name a court from any country (a supreme court, appeals court, tribunal or other court)',
  note: 'Courts and tribunals with an English Wikipedia article count (national, regional or international, current or former). Courts of different places with the same name are one answer.', src: 'Wikidata instance of court', cuts: [10, 30, 70, 130] });
Q({ key: 'advocacy-groups', source: 'advocacy-groups', cat: 'organizations', diff: 2, prompt: 'Name a pressure group, lobby group or advocacy organization (any country)',
  note: 'Advocacy groups, lobbying groups and pressure groups with an English Wikipedia article count.', src: 'Wikidata instance of pressure group', cuts: [10, 30, 70, 130] });

/* Lead-sentence checks for the two questions whose Wikidata classes are loosest (intelligence agencies, political scandals): the Wikipedia lead of every answer was
   fetched by fetch-dh-curated-2-leads.js (cache _sample-leads.json) and an answer is kept only if its lead says what it is. Answers without a cached lead are left out. */
let LEADC = null;
const leadOfTitle = (t) => { if (!LEADC) LEADC = readJson(path.join(DATAD, '_sample-leads.json'), {}); return LEADC[t]; };
const leadFirst = (l) => { const t = l.replace(/^\[[^\]]*\]\s*/, ''); const m = t.match(/^.*?[a-z\)\]\d]\.(?=\s|$)/); return (m ? m[0] : t).slice(0, 330); };
const leadDesc = (l) => { const m = l.match(/^\[([^\]]*)\]/); return m ? m[1] : ''; };
const INTEL_POS = /(intelligence|secret police|secret service|security (agency|service|services|bureau|directorate|office|apparatus|organi[sz]ation)|state security|counter-?intelligence|cryptologic|espionage)/i;
const INTEL_NEG = /(\bunit of\b|\bnetwork\b|collection sites|\bstate agency\b|criminal police|law enforcement agency|party body|Communist Party|state authority for|\bdivision of\b|Garrison|State Office for the Protection)/i;
const intelLeadOk = (t) => { const l = leadOfTitle(t); if (l == null || !l) return false; const x = leadDesc(l) + ' ' + leadFirst(l); return INTEL_POS.test(x) && !INTEL_NEG.test(x) && !/\(disambiguation\)/.test(l); };
const SCAND_POS = /(scandal|affair|controvers|corruption|bribe|fraud|scam|leak|allegation|misconduct|slush|kickback|\bcase\b|plot|conspiracy|interference|crisis|incident)/i;
const SCAND_POL = /(politic|government|minister|president|prime minister|parliament|party|election|senator|congress|official|cabinet|legislat|state|public|mayor|police|court)/i;
const scandLeadOk = (t) => { const l = leadOfTitle(t); if (l == null || !l) return false; const x = leadDesc(l) + ' ' + leadFirst(l); return SCAND_POS.test(x) && SCAND_POL.test(l.slice(0, 400)); };

/* ---- Intelligence agencies ---- */
const INTEL_OK = /(intelligence|security|secret (police|service)|espionage|counter-?intelligence|signals|reconnaissance|cryptolog|\bSIS\b|Gestapo|Stasi|Cheka|KGB|GRU|Okhrana|Securitate|Mossad|Abwehr|SAVAK|SMERSH|StB|NKVD|PIDE|OZNA|Shin Bet|GCHQ|OSS|SOE|Sicherheitsdienst|Santebal|Carlingue)/i;
const INTEL_BAD = /Reserve|Militsiya|Spetsnaz|Bodyguard|National Guard|Presidential Guard|Internal Troops|Oprichnina|Guard Corps|Special Organization|Carlingue|Soviet Socialist Republic|^KGB of|Republican Guard|Household|Directorate of Operations|Intelligence Community|Israeli intelligence community|Australian intelligence community|Special Higher Police|Third Section|Cabinet noir|Gendarmerie Intelligence|Preventive Security|Royal Household|Army |Brigade|Troops|Regiment|Battalion|Department of Defense|Counterintelligence Corps|Prussian Secret Police|Drug Enforcement|Directorate of Revenue Intelligence|^National Security Council|^Lab \d+|^Unit \d+|Kikan|^MI(?!5$|6$)\d+$|Sûreté|Landesamt|^Agency 114$|[Ii]ntelligence [Cc]ommunity|Intelligence Bureau of the Joint Staff|^National Security Department$|^Special Intelligence Service$|Marine Corps Intelligence|Pakistani intelligence community|Serbian Gestapo/;
Q({ key: 'intel', source: 'intel-agencies', cat: 'organizations', diff: 2, where: (r) => !INTEL_BAD.test(r.t) && r.s >= 3 && INTEL_OK.test(r.t + ' ' + (r.ds || '')) && intelLeadOk(r.t), prompt: 'Name an intelligence or security agency from any country (such as the CIA or MI6)',
  note: 'National intelligence, security and secret-service agencies with an English Wikipedia article count, current or historical (for example CIA, KGB, Mossad, MI5, Stasi). Units of an agency, police departments and state or regional offices do not.', src: 'Wikidata instance of intelligence agency', cuts: [12, 40, 90, 160], fame: { prompt: /Intelligence Community|law enforcement agency/i, mention: 2 } });

/* ---- U.S. Navy ships (USS ...) by class ---- */
const shipWhere = (re, not) => (r) => /^USS /.test(r.t) && re.test(r.ds || '') && !(not && not.test(r.ds || ''));
const SHIP_NOTE = (what) => 'Any U.S. Navy ' + what + ' with its own English Wikipedia article counts, under the name Wikipedia gives it (for example USS Missouri). Several ships of the same name are one answer. "USS" may be left off.';
Q({ key: 'ships-destroyers', source: 'usn-ships', cat: 'wars-foreign-policy', diff: 2, kind: 'ship', where: shipWhere(/destroyer|frigate/i, /submarine/i), prompt: 'Name a U.S. Navy destroyer, destroyer escort or frigate (a USS ship)', note: SHIP_NOTE('destroyer, destroyer escort or frigate'), src: 'Wikidata ships operated by the U.S. Navy with description destroyer or frigate', cuts: [10, 30, 100, 300] });
Q({ key: 'ships-subs', source: 'usn-ships', cat: 'wars-foreign-policy', diff: 2, kind: 'ship', where: shipWhere(/submarine/i), prompt: 'Name a U.S. Navy submarine (a USS ship)', note: SHIP_NOTE('submarine'), src: 'Wikidata ships operated by the U.S. Navy with description submarine', cuts: [8, 25, 80, 250] });
Q({ key: 'ships-capital', source: 'usn-ships', cat: 'wars-foreign-policy', diff: 2, kind: 'ship', where: shipWhere(/battleship|aircraft carrier|carrier|cruiser/i, /submarine|destroyer|frigate|escort/i), prompt: 'Name a U.S. Navy battleship, aircraft carrier or cruiser (a USS ship)', note: SHIP_NOTE('battleship, aircraft carrier or cruiser'), src: 'Wikidata ships operated by the U.S. Navy with description battleship, carrier or cruiser', cuts: [14, 40, 90, 200] });

/* ---- Census-based: incorporated places of one state, and the counties of Texas and Georgia (population rank sets the tiers) ---- */
const PLACE_FIX = { 'Urban Honolulu CDP': 'Honolulu', 'Nashville-Davidson metropolitan government (balance)': 'Nashville', 'Louisville/Jefferson County metro government (balance)': 'Louisville', 'Lexington-Fayette urban county': 'Lexington', 'Athens-Clarke County unified government (balance)': 'Athens', 'Augusta-Richmond County consolidated government (balance)': 'Augusta', 'Macon-Bibb County': 'Macon', 'Butte-Silver Bow (balance)': 'Butte' };
function placeBase(n) {
  if (PLACE_FIX[n]) return PLACE_FIX[n];
  let b = n.replace(/\s*\((balance|part)\)\s*$/i, '');
  b = b.replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|metro government|city|town|village|borough|municipality|plantation|corporation|county)\s*$/i, '');
  return b.trim();
}
const statePlaces = (state) => (ctx) => {
  const out = [];
  for (const r of ctx.readJson(path.join(ctx.OLD, 'us-places-10k.json'), [])) {
    if (r.st !== state) continue;
    const base = placeBase(r.n);
    if (!base || /^(balance|remainder)/i.test(base) || /(consolidated|unified) government$/.test(r.n)) continue;
    out.push({ name: base, full: r.n + ', ' + state, score: r.pop, views: r.pop, y: null, q: '', states: [state] });
  }
  return out;
};
const stateCounties = (state) => (ctx) => ctx.readJson(path.join(ctx.OLD, 'us-counties.json'), []).filter(r => r.st === state).map(r => {
  const m = r.n.match(/^(.+?) (County|Parish|Borough|Census Area|Municipality)$/);
  return { name: r.n, full: r.n + ', ' + state, score: r.pop, views: r.pop, y: null, q: '', aliases: m ? [m[1]] : [], states: [state] };
});
/* [state, kinds of place, tier cut-offs by count] */
const PLACE_STATES = [
  ['Texas', 'cities, towns and villages', [8, 30, 120, 450]], ['California', 'cities and towns', [8, 30, 100, 320]], ['Florida', 'cities, towns and villages', [8, 25, 80, 250]],
  ['New York', 'cities and villages', [8, 25, 90, 300]], ['Pennsylvania', 'cities and boroughs', [8, 30, 120, 450]], ['Illinois', 'cities, towns and villages', [8, 30, 120, 500]],
  ['Ohio', 'cities and villages', [8, 30, 110, 420]], ['Georgia', 'cities and towns', [8, 25, 100, 330]], ['North Carolina', 'cities, towns and villages', [8, 25, 100, 330]],
  ['Michigan', 'cities and villages', [8, 25, 100, 320]], ['New Jersey', 'cities, boroughs, towns and villages', [8, 20, 70, 200]], ['Massachusetts', 'cities and towns', [8, 25, 80, 220]],
];
const PLACE_PROMPT = {
  Texas: 'Name an incorporated city, town or village in Texas', California: 'Name an incorporated city or town in California', Florida: 'Name an incorporated city, town or village in Florida',
  'New York': 'Name a city or village in New York (the state\u2019s towns are not included)', Pennsylvania: 'Name a city or borough in Pennsylvania (townships are not included)',
  Illinois: 'Name an incorporated city, town or village in Illinois', Ohio: 'Name a city or village in Ohio (townships are not included)', Georgia: 'Name an incorporated city or town in Georgia',
  'North Carolina': 'Name an incorporated city, town or village in North Carolina', Michigan: 'Name a city or village in Michigan (townships are not included)',
  'New Jersey': 'Name a borough, city, town or village in New Jersey (townships are not included)', Massachusetts: 'Name a city or town in Massachusetts',
};
const PLACE_EXCL = { 'New York': ' The towns of New York (Brookhaven, Hempstead ...) are county subdivisions that the Census Bureau does not list as places, so they are not included.', Pennsylvania: ' Townships are not included.', Ohio: ' Townships are not included.', Michigan: ' Townships are not included.', 'New Jersey': ' Townships are not included.' };
for (const [st, kinds, cuts] of PLACE_STATES) Q({ key: 'places-' + st.toLowerCase().replace(/ /g, '-'), rows: statePlaces(st), cat: 'states', diff: 2, kind: 'place', cuts,
  prompt: PLACE_PROMPT[st],
  note: 'Incorporated ' + kinds + ' of ' + st + ' that appear in the Census Bureau 2023 population estimates count, however small. The name may be given with or without the state.' + (PLACE_EXCL[st] || ' Unincorporated communities, townships and census-designated places do not count.'),
  src: 'U.S. Census Bureau Vintage 2023 incorporated place estimates (sub-est2023.csv); tiers by population rank' });
Q({ key: 'counties-texas', rows: stateCounties('Texas'), cat: 'states', diff: 2, kind: 'county', cuts: [8, 25, 80, 180], prompt: 'Name a county in Texas', note: 'All 254 Texas counties count, with or without the word "County".', src: 'U.S. Census Bureau Vintage 2023 county estimates (co-est2023-alldata.csv); tiers by population rank' });
Q({ key: 'counties-georgia', rows: stateCounties('Georgia'), cat: 'states', diff: 2, kind: 'county', cuts: [6, 20, 60, 120], prompt: 'Name a county in Georgia', note: 'All 159 Georgia counties count, with or without the word "County".', src: 'U.S. Census Bureau Vintage 2023 county estimates (co-est2023-alldata.csv); tiers by population rank' });

/* ---- World leaders: heads of state or government of a country other than the U.S. whose first term began in 1900 or later ---- */
const LEADER_LABEL = /^(prime minister|president|premier|federal chancellor|chancellor|taoiseach|chairman|king|queen|monarch|emperor|empress|sultan|emir|prince|grand duke|yang di-pertuan agong|supreme leader|captain regent|state president|head of state|grand duchess)\b/i;
const LEADER_BAD = /deputy|co-prince|vice|governor|pope|cardinal|secretary|senate|parliament|assembly|court|council of state|mayor|speaker|board|committee|academy|club|company|federation|olympic|rtve|generalitat|xunta|region|island council|city council/i;
const ASIA_OVERRIDE = new Set(['Q43', 'Q230', 'Q399', 'Q227', 'Q232', 'Q12560']), EUROPE_OVERRIDE = new Set(['Q159', 'Q229', 'Q15180', 'Q34266', 'Q7318', 'Q8680']);
function regionOf(cq, cont) {
  if (ASIA_OVERRIDE.has(cq)) return 'asia'; if (EUROPE_OVERRIDE.has(cq)) return 'europe'; if (cq === 'Q79') return 'africa';
  const k = (cont[cq] && cont[cq].k) || [];
  if (k.includes('Q48') && !k.includes('Q46')) return 'asia';
  if (k.includes('Q46') && !k.includes('Q48')) return 'europe';
  if (k.includes('Q15') && k.length === 1) return 'africa';
  if (k.some(x => x === 'Q49' || x === 'Q18' || x === 'Q828') && !k.includes('Q46') && !k.includes('Q48')) return 'americas';
  if (k.some(x => x === 'Q55643' || x === 'Q538' || x === 'Q3960') && !k.includes('Q46') && !k.includes('Q48')) return 'oceania';
  if (k.includes('Q48')) return 'asia'; if (k.includes('Q46')) return 'europe';
  return null;
}
const leaderRows = (region) => (ctx) => {
  const cont = ctx.readJson(path.join(ctx.DATA, '_continents2.json'), {});
  const by = new Map();
  for (const key of ['leaders', 'leaders2']) for (const r of ctx.readJson(path.join(ctx.DATA, key + '.json'), [])) {
    const lab = (r.x && r.x[0]) || '', cq = r.x && r.x[1];
    if (key === 'leaders' && (!LEADER_LABEL.test(lab) || LEADER_BAD.test(lab))) continue;
    if (!cq || regionOf(cq, cont) !== region) continue;
    let e = by.get(r.q); if (!e) { e = { t: r.t, q: r.q, s: r.s, st: r.st, y: null, ds: r.ds || '' }; by.set(r.q, e); }
    if (r.y != null && (e.y == null || r.y < e.y)) e.y = r.y;
  }
  for (const r of ctx.readJson(path.join(ctx.DATA, 'leaders-manual.json'), [])) {
    if (r.region !== region) continue;
    let e = by.get(r.q); if (!e) { e = { t: r.t, q: r.q, s: r.s, st: r.st, y: null, ds: '' }; by.set(r.q, e); }
    if (r.y != null && (e.y == null || r.y < e.y)) e.y = r.y;
  }
  const out = [];
  for (const e of by.values()) {
    if (e.y == null || e.y < 1900 || LEADER_BLOCK.has(e.t) || BAD_T.test(e.t) || /^Pope /.test(e.t) || /\b(pope|cardinal|archbishop|bishop of rome|vice[- ]president|deputy prime minister|governor|mayor|speaker)\b/i.test(e.ds)) continue;
    const v = ctx.VIEWS[e.t] > 0 ? ctx.VIEWS[e.t] : 0;
    out.push({ name: ctx.stripParen(e.t), full: e.t, score: (e.s || 0) * 1000 + Math.min(e.st || 0, 999), views: v, y: e.y, q: e.q, intro: ctx.INTROS[e.t] || '' });
  }
  return out;
};
const LEADER_BLOCK = new Set(['Hawadle Madar']); // a vice president that Wikidata also lists as head of state
const BAD_T = /^(List|Lists|Timeline|Outline) of |\(disambiguation\)/;
const LEADER_NOTE = (where) => 'Any head of state or head of government of ' + where + ' with an English Wikipedia article counts if their first term in such an office began in 1900 or later: presidents, prime ministers, premiers, chancellors, kings, queens, emperors and similar. Popes and U.S. presidents do not count here. The last name alone is accepted when only one answer has it.';
Q({ key: 'leaders-europe', rows: leaderRows('europe'), cat: 'world-leaders', diff: 2, kind: 'person', cuts: [25, 70, 200, 600], prompt: 'Name a president, prime minister, monarch or other head of state or government of a European country who took office in 1900 or later',
  note: LEADER_NOTE('a European country (Russia, the Soviet Union and Cyprus count as Europe; Turkey, Georgia, Armenia, Azerbaijan and Kazakhstan as Asia)'), src: 'Wikidata humans holding the head-of-government or head-of-state office of a sovereign or historical state (P1313, P1906, P6, P35), country on the continent; first term from 1900; tiers by Wikipedia page views' });
Q({ key: 'leaders-asia', rows: leaderRows('asia'), cat: 'world-leaders', diff: 2, kind: 'person', cuts: [25, 70, 200, 500], prompt: 'Name a president, prime minister, monarch or other head of state or government of an Asian country (including the Middle East) who took office in 1900 or later',
  note: LEADER_NOTE('an Asian country (including the Middle East, Turkey, Georgia, Armenia, Azerbaijan and Kazakhstan)'), src: 'Wikidata humans holding the head-of-government or head-of-state office of a sovereign or historical state, country in Asia; first term from 1900; tiers by page views' });
Q({ key: 'leaders-africa', rows: leaderRows('africa'), cat: 'world-leaders', diff: 2, kind: 'person', cuts: [20, 60, 160, 400], prompt: 'Name a president, prime minister or other head of state or government of an African country who took office in 1900 or later',
  note: LEADER_NOTE('an African country (Egypt counts as Africa)'), src: 'Wikidata humans holding the head-of-government or head-of-state office of a sovereign or historical state, country in Africa; first term from 1900; tiers by page views' });
Q({ key: 'leaders-americas', rows: leaderRows('americas'), cat: 'world-leaders', diff: 2, kind: 'person', cuts: [20, 60, 160, 400], prompt: 'Name a president, prime minister or other head of state or government of a country in the Americas other than the United States who took office in 1900 or later',
  note: LEADER_NOTE('a country in North, Central or South America or the Caribbean other than the United States (for example Canada, Mexico, Cuba, Brazil, Argentina)'), src: 'Wikidata humans holding the head-of-government or head-of-state office of a sovereign or historical state, country in the Americas; first term from 1900; tiers by page views' });

/* Difficulty (1 easy, 2 medium, 3 hard): how many answers a typical American player can name. Round 2 aims at 2 and 3. */
const DIFFICULTY = {
  'sc-to-1932': 3, 'sc-1933-1968': 2, 'sc-1969-1985': 2, 'sc-1986-2004': 2, 'sc-2005-on': 2,
  'acts-to-1900': 3, 'acts-1901-1945': 3, 'acts-1946-1980': 2, 'acts-1981-2000': 3, 'acts-2001-on': 2,
  nps: 2, civilwar: 2, 'latin-legal': 3, scandals: 2, intel: 2, 'ships-destroyers': 3, 'ships-subs': 3, 'ships-capital': 2,
  'places-texas': 2, 'places-california': 2, 'places-florida': 2, 'places-new-york': 2, 'places-pennsylvania': 3, 'places-illinois': 3, 'places-ohio': 3, 'places-georgia': 3,
  'places-north-carolina': 3, 'places-michigan': 3, 'places-new-jersey': 3, 'places-massachusetts': 3, 'counties-texas': 2, 'counties-georgia': 3,
  'leaders-europe': 2, 'leaders-asia': 2, 'leaders-africa': 3, 'leaders-americas': 3,
};
QUESTIONS.forEach(q => { if (DIFFICULTY[q.key]) q.diff = DIFFICULTY[q.key]; });

module.exports = { SOURCES, QUESTIONS, scYears, actYears, scSet, regionOf };
