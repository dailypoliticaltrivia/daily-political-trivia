#!/usr/bin/env node
/* Dark Horse derived banks, ROUND 2: new broad, hard-leaning questions whose answer sets are computed from the project's structured data.
   Usage: node site/tools/build-dh-derived-2.js [--report] [--select] [--out <dir>] [--sample N --sample-out <file> [--all-jackpots]] [--probe <prompt part> <name;name>] [--dump-fame <file>]
     --report  every candidate with its size, number of well-known answers and overlap with existing banks, then stop (nothing written)
     --select  the final question list only (nothing written)
   Inputs : data/legislators-*.json, data/wikidata-facts.csv, site/games/congressional-grid/data/members.js, people-db/people.json, people-db/cache/fame.json (as round 1: build-dh-derived.js),
            people-db/cache/dh2-birthstate.json (tools/fetch-dh2-birthstates.js), people-db/cache/dh2-fame-measured.json (tools/fetch-dh2-fame.js)
   Output : site/games/dark-horse/data/bank-derived2-N.json (ids derived2-0001...), audit/dh-derived2-questions.tsv, audit/dh-derived2-dropped.tsv
   Everything round 1 learned is reused (see build-dh-derived.js and audit/dh-derived-recheck-log.md): terms cut at the real death date, TERM_CLIP / TERM_DROP / READMIT, territorial delegates do not count for a
   state before statehood, governor roles and party checked against the lists of governors, mayors need a birth date, strict Wikidata tags, safe aliases, decade prompts that spell the years, jackpots that survive a 60-day margin.
   New in round 2: Senate terms are cut when the next holder of the same seat starts (SEAT_CLIPS); a candidate question is dropped when its answer set overlaps (Jaccard > 0.8) any question in ANY existing bank; a question needs at
   least 8 well-known (weight 1-3) answers; fame weights use measured page views as upgrades; difficulty: 1/2/3 from the number of well-known answers (>= 60 / >= 15 / fewer), raised to at least 2 for questions that need
   an era or a career, and to 3 for date-exact questions (birth year, death decade, Congress number) that have fewer than 100 well-known answers. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const REPORT = ARGS.includes('--report');
const OUT = ARGS.includes('--out') ? path.resolve(ARGS[ARGS.indexOf('--out') + 1]) : path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const MIN = 150, MAX = 5000;

function norm(s) {
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr');
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
const readJ = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

// ---------------------------------------------------------------- load
const legs = readJ(path.join(ROOT, 'data', 'legislators-historical.json')).concat(readJ(path.join(ROOT, 'data', 'legislators-current.json')));
const legBy = {}; legs.forEach(l => { legBy[l.id.bioguide] = l; });
const msrc = fs.readFileSync(path.join(ROOT, 'site', 'games', 'congressional-grid', 'data', 'members.js'), 'utf8');
const MEM = eval(msrc.slice(msrc.indexOf('window.MEMBERS=') + 15, msrc.lastIndexOf(']') + 1));
const memBy = {}; MEM.forEach(m => { memBy[m.id] = m; });
const raw = readJ(path.join(ROOT, 'people-db', 'people.json')).people;
const fame = readJ(path.join(ROOT, 'people-db', 'cache', 'fame.json'));
// exact death dates (Wikidata P570) so a term is cut at the day the member died, not at the end of the death year (audit fix)
const WDEATH = {};
fs.readFileSync(path.join(ROOT, 'data', 'wikidata-facts.csv'), 'utf8').split('\n').forEach(line => {
  const c = line.split(','); if (c[1] !== 'P570') return;
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(c[2] || ''); if (!m || (m[2] === '01' && m[3] === '01' && +m[1] % 100 === 0)) return;
  (WDEATH[c[0]] = WDEATH[c[0]] || []).push(Date.UTC(+m[1], +m[2] - 1, +m[3]));
});

const STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const STATE_NAME = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'the District of Columbia', PR: 'Puerto Rico' };
const REGION = {};
'CT ME MA NH RI VT NJ NY PA'.split(' ').forEach(s => REGION[s] = 'Northeast');
'IL IN MI OH WI IA KS MN MO NE ND SD'.split(' ').forEach(s => REGION[s] = 'Midwest');
'DE FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX'.split(' ').forEach(s => REGION[s] = 'South');
'AZ CO ID MT NV NM UT WY AK CA HI OR WA'.split(' ').forEach(s => REGION[s] = 'West');
const CONFED = new Set('SC MS FL AL GA LA TX VA AR NC TN'.split(' '));
// year each state joined the Union (governor roles before this are territorial and are excluded)
const STATEHOOD = { DE: 1776, PA: 1776, NJ: 1776, GA: 1776, CT: 1776, MA: 1776, MD: 1776, SC: 1776, NH: 1776, VA: 1776, NY: 1776, NC: 1776, RI: 1776, VT: 1791, KY: 1792, TN: 1796, OH: 1803, LA: 1812, IN: 1816, MS: 1817, IL: 1818, AL: 1819, ME: 1820, MO: 1821, AR: 1836, MI: 1837, FL: 1845, TX: 1845, IA: 1846, WI: 1848, CA: 1850, MN: 1858, OR: 1859, KS: 1861, WV: 1863, NV: 1864, NE: 1867, CO: 1876, ND: 1889, SD: 1889, MT: 1889, WA: 1889, ID: 1890, WY: 1890, UT: 1896, OK: 1907, NM: 1912, AZ: 1912, AK: 1959, HI: 1959 };

// governor roles removed after checking every role against Wikipedia's lists of governors (name|state|from-year)
const BAD_GOV = new Set(['Robert Ritchie|FL|1992', 'Robert Ritchie|FL|2000', "Massachusetts Governor's Council|MA|1800", 'Ray Sullivan|WV|2002', 'Seth John Cuthbert|GA|1779', 'William Glascock|GA|1779',
  'Thomas Wilson Dorr|RI|1842', 'John Catlin|WI|1848', 'George Law Curry|OR|1859', 'Earl Long|LA|1913', 'Samuel Dinsmoor, Jr.|NH|1835']);

// term corrections: id -> [[chamber, our interval start, our interval end, true start (or empty), true end (or empty)]]; terms never held (elected but not seated) are dropped by id -> [[chamber, our term start]]
const READMIT = { TN: '1866-07-24', AR: '1868-06-22', AL: '1868-07-21', FL: '1868-07-21', LA: '1868-07-21', NC: '1868-07-21', SC: '1868-07-21', GA: '1868-07-25', VA: '1870-01-26', MS: '1870-02-23', TX: '1870-03-30' };
const TERM_CLIP = {
  L000491: [["H","1993-05-10","2027-01-03","1994-05-10",""]],
  P000034: [["H","1987-01-06","2027-01-03","1988-11-08",""]],
  M001137: [["H","1997-01-07","2027-01-03","1998-02-03",""]],
  P000197: [["H","1987-01-06","2027-01-03","1987-06-02",""]],
  H000874: [["H","1981-01-05","2027-01-03","1981-05-19",""]],
  I000055: [["H","1999-01-06","2005-01-03","1999-02-23",""]],
  D000355: [["H","1955-01-05","2015-01-03","1955-12-13",""]],
  P000265: [["H","1979-01-15","2015-01-03","1979-04-03",""]],
  I000025: [["H","1959-01-07","1963-01-03","1959-08-21",""]],
  A000022: [["H","1983-01-03","2013-01-03","1983-03-01",""]],
  O000007: [["H","1969-01-03","2011-01-03","1969-04-01",""]],
  M001120: [["H","1973-01-03","2010-02-08","1974-02-05",""]],
  A000014: [["H","1985-01-03","1987-01-03","1986-09-20",""]],
  M000388: [["H","1987-01-06","2009-01-03","1988-04-16",""]],
  O000163: [["H","1981-01-05","2007-01-03","1981-06-25",""]],
  T000058: [["H","1979-01-15","2005-01-03","1980-05-22",""]],
  B000780: [["H","1971-01-21","1987-01-03","1972-09-30",""]],
  C000873: [["H","1969-01-03","2005-01-03","1969-11-25",""]],
  P000444: [["H","1979-01-15","2001-01-03","1980-01-22",""]],
  M000206: [["H","1981-01-05","2001-01-03","1982-07-13",""]],
  K000118: [["H","1981-01-05","1999-01-03","1982-01-12",""]],
  L000371: [["H","1977-01-04","1999-03-01","1977-08-27",""]],
  S000109: [["H","1983-01-03","1999-01-03","1983-03-29",""]],
  G000272: [["H","1961-01-03","1999-01-03","1961-11-04",""]],
  M000854: [["S","1897-03-15","1899-03-03","1897-10-08",""]],
  B001142: [["H","1893-08-07","1895-03-03","","1895-01-23"]],
  W000435: [["S","1868-01-01","1869-03-03","1868-07-13",""]],
  P000130: [["H","1875-12-06","1877-03-03","","1876-08-01"],["H","1877-10-15","1879-03-03","1877-12-13",""]],
  H000377: [["H","1871-03-04","1873-03-03","1872-12-02",""]],
  S000922: [["S","1864-01-01","1875-03-03","1865-02-01",""]],
  G000507: [["H","1893-08-07","1895-03-03","1894-02-26",""]],
  S000346: [["S","1873-12-01","1877-12-31","","1877-03-08"],["S","1893-08-07","1897-12-31","","1897-03-04"]],
  H000732: [["H","1865-12-04","1873-03-03","1867-03-04",""]],
  V000116: [["H","1865-12-04","1867-03-03","","1866-02-23"]],
  G000313: [["S","1873-12-01","1881-03-03","","1880-05-26"]],
  V000042: [["H","1895-12-02","1897-03-03","1896-02-27",""]],
  H000999: [["S","1892-01-01","1895-03-03","1892-05-28",""]],
  B000524: [["S","1879-03-18","1885-03-03","1879-06-18",""]],
  B001059: [["H","1893-08-07","1895-03-03","1893-12-04",""]],
  W000594: [["H","1861-07-04","1863-03-03","1861-10-08",""]],
  C000152: [["S","1890-01-01","1893-12-31","1890-05-26","1893-02-04"]],
  E000056: [["S","1866-01-01","1875-03-03","1866-04-03",""],["S","1887-12-05","1891-12-31","","1891-11-01"]],
  R000098: [["S","1887-12-05","1891-12-31","","1891-06-10"]],
  F000037: [["H","1875-12-06","1877-03-03","","1876-05-06"]],
  B000116: [["H","1857-12-07","1859-03-03","","1857-12-24"]],
  W000429: [["S","1886-01-01","1887-03-03","1886-04-16",""]],
  C000839: [["H","1885-12-07","1887-03-03","1886-11-02",""]],
  B001064: [["H","1871-03-04","1873-03-03","1872-12-24",""]],
  N000160: [["S","1871-03-04","1877-03-03","1871-11-14",""]],
  H000552: [["H","1885-12-07","1887-03-03","","1886-12-30"]],
  L000403: [["H","1861-07-04","1863-03-03","","1862-04-02"]],
  W000025: [["H","1875-12-06","1877-03-03","1876-04-12",""]],
  H000019: [["H","1861-07-04","1863-03-03","1863-02-17",""]],
  S000445: [["H","1859-12-05","1861-03-03","","1861-01-21"]],
  S000502: [["H","1881-12-05","1883-03-03","1882-07-19",""],["H","1883-12-03","1885-03-03","1884-03-18",""]],
  L000030: [["S","1883-12-03","1885-12-31","","1885-03-06"],["H","1859-12-05","1861-03-03","","1861-01-12"]],
  B000253: [["S","1881-12-05","1885-12-31","","1885-03-06"]],
  S000319: [["S","1884-01-01","1885-12-31","1884-11-19","1885-01-20"]],
  S000103: [["H","1883-12-03","1885-03-03","","1884-12-30"]],
  S000326: [["H","1883-12-03","1885-03-03","","1885-01-09"]],
  M000024: [["H","1875-12-06","1877-03-03","","1876-07-19"],["H","1881-12-05","1883-03-03","1882-05-31",""]],
  R000335: [["H","1883-12-03","1885-03-03","","1884-01-07"]],
  B000485: [["H","1881-12-05","1883-03-03","1882-06-01",""]],
  B000326: [["H","1877-10-15","1881-03-03","1879-03-04",""]],
  C000272: [["H","1881-12-05","1883-03-03","","1882-04-29"],["H","1883-12-03","1885-03-03","1884-06-25",""]],
  K000018: [["H","1883-12-03","1885-03-03","","1884-07-13"]],
  C000048: [["H","1883-12-03","1885-03-03","","1884-10-20"]],
  K000069: [["S","1868-07-21","1873-03-03","","1872-11-01"]],
  S000854: [["H","1881-12-05","1883-03-03","","1882-11-04"]],
  F000134: [["H","1881-12-05","1883-03-03","","1882-06-01"]],
  L000533: [["H","1881-12-05","1883-03-03","1882-04-29",""]],
  G000505: [["H","1857-12-07","1859-03-03","1859-02-14",""]],
  G000527: [["H","1873-12-01","1875-03-03","1874-06-16",""]],
  C000681: [["S","1873-12-01","1881-12-31","","1881-05-16"]],
  K000242: [["S","1877-10-15","1881-12-31","","1881-03-07"]],
  C000593: [["H","1865-12-04","1867-03-03","","1866-07-18"]],
  L000272: [["H","1879-03-18","1881-03-03","","1880-10-01"]],
  H000527: [["H","1875-12-06","1877-03-03","","1877-01-31"]],
  H000121: [["S","1848-01-01","1851-03-03","1848-06-08",""],["S","1851-12-01","1857-03-03","","1857-01-07"],["S","1857-12-07","1861-12-31","","1861-01-17"]],
  G000063: [["H","1877-10-15","1881-03-03","","1880-11-08"]],
  P000304: [["H","1879-03-18","1881-03-03","1880-01-10",""]],
  B000042: [["H","1877-10-15","1881-03-03","1878-11-05",""]],
  A000023: [["H","1877-10-15","1881-03-03","1878-02-20",""]],
  B000268: [["H","1877-10-15","1881-03-03","1879-01-23",""]],
  C000373: [["H","1873-12-01","1875-03-03","1874-11-03",""]],
  M000075: [["H","1877-10-15","1881-03-03","1878-11-05","1879-03-03"]],
  C000379: [["S","1875-12-06","1879-12-31","","1879-02-10"]],
  D000170: [["H","1877-10-15","1879-03-03","1878-03-28",""]],
  G000166: [["H","1871-03-04","1873-03-03","1872-05-13",""]],
  A000279: [["S","1877-10-15","1879-03-03","","1879-01-26"]],
  B001070: [["H","1869-03-04","1873-03-03","1869-12-06",""]],
  Y000045: [["H","1877-10-15","1879-03-03","1878-11-05",""]],
  T000209: [["H","1873-12-01","1875-03-03","1875-01-05",""]],
  R000016: [["H","1869-03-04","1873-03-03","1870-12-12",""]],
  W000155: [["H","1875-12-06","1877-03-03","1876-12-04",""]],
  W000449: [["H","1877-10-15","1879-03-03","1878-02-07",""]],
  B000824: [["H","1847-12-06","1849-03-03","1848-03-06",""]],
  F000073: [["H","1875-12-06","1877-03-03","1876-06-23",""]],
  M000385: [["S","1868-01-01","1871-03-03","1868-02-19",""]],
  F000197: [["H","1877-10-15","1879-03-03","1879-02-10",""]],
  B000166: [["S","1876-01-01","1879-03-03","1876-05-18",""]],
  L000538: [["H","1847-12-06","1849-03-03","1848-06-05",""]],
  K000156: [["S","1875-12-06","1877-12-31","","1877-01-19"]],
  P000530: [["S","1876-01-01","1877-12-31","1876-08-26","1877-01-26"]],
  C000068: [["S","1857-12-07","1861-12-31","","1861-03-04"],["S","1873-12-01","1877-12-31","","1877-03-12"]],
  W000074: [["H","1869-03-04","1873-03-03","1870-05-27",""]],
  H000959: [["H","1875-12-06","1877-03-03","1876-12-05",""]],
  C000255: [["H","1873-12-01","1875-03-03","1875-02-01",""]],
  B001202: [["H","1875-12-06","1877-03-03","1876-11-07",""]],
  F000104: [["H","1875-12-06","1877-03-03","1877-01-11",""]],
  M000942: [["H","1875-12-06","1877-03-03","","1876-06-08"]],
  F000369: [["S","1866-01-01","1869-03-03","1866-11-12",""]],
  B000674: [["H","1865-12-04","1871-03-03","","1869-03-12"]],
  W000209: [["H","1875-12-06","1877-03-03","1876-08-12",""]],
  W000507: [["H","1875-12-06","1877-03-03","","1876-12-01"]],
  E000185: [["S","1875-12-06","1877-03-03","","1876-05-17"]],
  A000079: [["S","1871-03-04","1877-03-03","1871-12-01",""]],
  H000307: [["S","1874-01-01","1877-03-03","1874-02-12",""]],
  L000162: [["H","1875-12-06","1877-03-03","1876-05-06",""]],
  B000933: [["H","1859-12-05","1861-03-03","1860-12-03",""]],
  A000007: [["H","1875-12-06","1877-03-03","1876-07-28",""]],
  W000093: [["H","1875-12-06","1877-03-03","","1876-04-19"]],
  M000970: [["S","1863-12-07","1877-03-03","","1876-07-07"]],
  C000179: [["H","1875-12-06","1877-03-03","1876-12-05",""]],
  F000394: [["H","1875-12-06","1877-03-03","","1876-07-28"]],
  E000167: [["H","1875-12-06","1877-03-03","","1876-12-11"]],
  H000698: [["H","1869-03-04","1871-03-03","1869-04-08",""]],
  B000383: [["H","1875-12-06","1877-03-03","","1876-06-23"]],
  S000731: [["H","1875-12-06","1877-03-03","1876-06-08","1877-01-08"]],
  S000807: [["H","1875-12-06","1877-03-03","1876-11-07",""]],
  W000567: [["H","1873-12-01","1875-03-03","","1874-06-16"]],
  K000154: [["H","1875-12-06","1877-03-03","","1876-07-19"]],
  H000765: [["H","1861-07-04","1863-03-03","1861-12-02",""]],
  A000172: [["S","1870-02-23","1875-03-03","","1874-01-10"]],
  D000091: [["H","1873-12-01","1875-03-03","","1874-03-05"]],
  C000916: [["H","1871-03-04","1873-03-03","1872-01-02",""]],
  S000877: [["H","1873-12-01","1875-03-03","1875-01-27",""]],
  T000161: [["H","1873-12-01","1875-03-03","1874-03-05",""]],
  G000274: [["H","1857-12-07","1859-03-03","1858-01-31",""]],
  M000487: [["H","1873-12-01","1875-03-03","","1875-01-01"]],
  P000172: [["S","1874-01-01","1875-03-03","1874-02-03",""]],
  B000189: [["H","1870-02-23","1873-03-03","1870-04-08",""]],
  J000105: [["H","1873-12-01","1875-03-03","","1874-06-23"]],
  S000939: [["S","1865-12-04","1867-03-03","","1866-03-27"]],
  C000170: [["H","1873-12-01","1875-03-03","1874-11-03",""]],
  R000074: [["H","1873-12-01","1875-03-03","","1874-03-24"]],
  C000370: [["H","1871-03-04","1873-03-03","1871-04-21",""]],
  F000077: [["H","1863-12-07","1865-03-03","","1864-12-20"]],
  W000408: [["H","1869-03-04","1873-03-03","1870-12-22",""]],
  S000114: [["H","1873-12-01","1875-03-03","1874-12-07",""]],
  E000128: [["H","1873-12-01","1875-03-03","","1874-11-01"]],
  C000952: [["S","1873-12-01","1875-03-03","","1874-02-12"]],
  W000713: [["H","1873-12-01","1875-03-03","","1874-07-01"]],
  W000174: [["S","1874-01-01","1875-03-03","1874-04-17",""],["H","1865-12-04","1873-03-03","","1871-12-05"]],
  C000027: [["S","1871-03-04","1873-12-31","","1873-03-24"]],
  W000585: [["S","1865-12-04","1873-12-31","","1873-03-03"]],
  F000315: [["H","1871-03-04","1873-03-03","1871-12-04",""]],
  B000579: [["H","1871-03-04","1873-03-03","1872-12-03",""]],
  C000715: [["H","1865-12-04","1873-03-03","","1871-08-26"]],
  E000225: [["H","1871-03-04","1873-03-03","1872-12-02",""]],
  T000331: [["H","1863-12-07","1865-03-03","1864-12-05",""]],
  P000175: [["H","1869-03-04","1873-03-03","1870-04-23",""]],
  B000288: [["H","1871-03-04","1873-03-03","1872-12-02",""]],
  B000523: [["H","1859-12-05","1861-03-03","1860-06-08","1860-06-25"],["H","1863-12-07","1865-03-03","","1864-06-10"]],
  B000879: [["H","1869-03-04","1873-03-03","1869-11-02","1872-05-13"]],
  V000095: [["S","1868-01-01","1873-03-03","1868-03-07",""]],
  S000649: [["H","1871-03-04","1873-03-03","1871-12-04",""]],
  H000211: [["S","1861-07-04","1865-12-31","","1865-05-15"]],
  M000367: [["H","1867-03-04","1873-03-03","1867-12-17",""]],
  N000177: [["S","1864-01-01","1873-03-03","1865-02-01",""]],
  B000283: [["H","1867-03-04","1873-03-03","1868-02-05",""]],
  E000072: [["H","1871-03-04","1873-03-03","","1872-02-09"]],
  B000430: [["H","1871-03-04","1873-03-03","1871-11-04","1873-01-04"]],
  G000022: [["H","1855-12-03","1857-03-03","","1856-07-23"]],
  L000289: [["H","1869-03-04","1873-03-03","1870-05-10",""]],
  H000599: [["H","1859-12-05","1861-03-03","","1861-01-23"]],
  C000096: [["H","1857-12-07","1859-03-03","","1858-05-25"]],
  D000315: [["H","1867-03-04","1873-03-03","1868-12-07",""]],
  D000393: [["H","1871-03-04","1873-03-03","1872-10-08",""]],
  D000521: [["H","1870-01-26","1873-03-03","1870-11-08",""]],
  D000208: [["H","1871-03-04","1873-03-03","","1873-01-24"]],
  P000533: [["H","1869-03-04","1873-03-03","1871-01-16",""]],
  C000455: [["H","1870-03-30","1873-03-03","","1872-05-13"]],
  J000103: [["S","1870-01-01","1871-12-31","1870-12-19","1871-01-20"]],
  C000254: [["S","1866-01-01","1871-03-03","1866-09-19",""]],
  B000034: [["H","1867-03-04","1871-03-03","1867-11-30",""]],
  W000427: [["H","1868-07-21","1871-03-03","","1870-02-24"]],
  D000484: [["S","1867-03-04","1871-03-03","","1870-12-19"]],
  A000335: [["H","1869-03-04","1871-03-03","1870-02-15",""]],
  I000017: [["H","1863-12-07","1865-03-03","1864-05-20",""]],
  R000445: [["S","1866-01-01","1871-03-03","1866-07-19",""]],
  W000730: [["H","1867-03-04","1871-03-03","1867-11-21",""]],
  G000426: [["H","1869-03-04","1871-03-03","","1870-02-17"]],
  G000271: [["H","1867-03-04","1871-03-03","1867-12-05","1870-02-28"]],
  C000260: [["H","1857-12-07","1859-03-03","1858-05-11",""]],
  L000419: [["H","1869-03-04","1871-03-03","1871-01-16",""]],
  M000109: [["H","1869-03-04","1871-03-03","1870-12-07",""]],
  M000838: [["H","1869-03-04","1871-03-03","","1869-04-09"]],
  R000096: [["H","1869-03-04","1871-03-03","","1870-04-13"]],
  D000291: [["H","1868-07-21","1871-03-03","","1870-02-28"]],
  C000519: [["H","1868-07-25","1871-03-03","","1869-03-03"]],
  B000424: [["H","1869-03-04","1871-03-03","1870-12-22",""]],
  T000269: [["H","1868-07-25","1871-03-03","","1869-03-03"]],
  D000126: [["H","1869-03-04","1871-03-03","","1870-07-15"]],
  S000118: [["H","1865-12-04","1871-03-03","","1871-01-05"]],
  G000347: [["H","1868-07-25","1871-03-03","","1869-03-03"]],
  C000776: [["H","1869-03-04","1871-03-03","1871-01-24",""]],
  N000166: [["H","1869-03-04","1871-03-03","1869-12-06",""]],
  E000085: [["H","1868-07-25","1871-03-03","","1869-03-03"]],
  W000676: [["H","1869-03-04","1871-03-03","1870-12-06",""]],
  P000031: [["H","1869-03-04","1871-03-03","1870-12-22",""]],
  F000099: [["S","1854-01-01","1859-03-03","1854-02-10",""],["S","1859-12-05","1865-03-03","","1864-07-01"]],
  C000517: [["H","1867-03-04","1869-03-03","1867-09-02",""]],
  B000248: [["S","1863-12-07","1865-03-03","","1864-01-29"]],
  G000534: [["S","1865-12-04","1869-03-03","","1868-02-07"]],
  E000123: [["H","1868-06-22","1869-03-03","1869-01-13",""]],
  J000169: [["S","1845-12-01","1849-12-31","","1849-03-07"],["S","1863-12-07","1869-03-03","","1868-07-10"]],
  H000393: [["H","1865-12-04","1869-03-03","","1867-07-20"]],
  C000216: [["H","1867-03-04","1869-03-03","1867-11-21",""]],
  E000106: [["H","1853-12-05","1855-03-03","1854-04-17",""]],
  M000140: [["H","1865-12-04","1869-03-03","1867-03-02","1867-03-03"]],
  K000311: [["H","1865-12-04","1869-03-03","1866-07-18",""]],
  H000644: [["H","1865-12-04","1867-05-08","1866-12-03",""]],
  R000239: [["S","1864-01-01","1867-03-29","1864-02-02",""]],
  W000126: [["H","1865-12-04","1867-03-03","1866-12-03",""]],
  C000427: [["S","1861-07-04","1867-03-03","","1866-07-27"]],
  F000234: [["S","1866-01-01","1867-03-03","1866-08-31",""]],
  S000544: [["H","1865-12-04","1867-03-03","","1866-07-13"]],
  L000060: [["H","1839-12-02","1841-03-03","1840-08-03",""]],
  G000301: [["H","1865-12-04","1867-03-03","1866-01-17",""]],
  H000984: [["H","1865-12-04","1867-03-03","1866-12-04",""]],
  M000476: [["H","1861-07-04","1863-03-03","1863-01-26",""]],
  D000397: [["H","1865-12-04","1867-03-03","1866-04-07",""]],
  H000567: [["S","1862-01-01","1865-02-14","1862-12-29",""]],
  K000276: [["H","1861-07-04","1863-03-03","1861-12-12",""]],
  H000189: [["S","1862-01-01","1865-03-03","1862-09-12",""]],
  P000458: [["H","1863-12-07","1865-03-03","1864-12-05",""]],
  Y000015: [["H","1861-07-04","1863-03-03","1862-12-01",""]],
  M001038: [["H","1863-12-07","1865-03-03","","1864-10-31"]],
  S000825: [["H","1863-12-07","1865-03-03","","1864-10-24"]],
  W000747: [["H","1863-12-07","1865-03-03","1864-10-31",""]],
  A000128: [["H","1855-12-03","1857-03-03","","1856-07-18"]],
  S000227: [["H","1861-07-04","1863-03-03","1862-03-16",""]],
  F000038: [["S","1864-01-01","1865-03-03","1864-10-27",""]],
  D000006: [["H","1859-12-05","1861-03-03","1860-05-18",""]],
  K000297: [["H","1863-12-07","1865-03-03","1864-06-10",""]],
  H000079: [["H","1861-07-04","1863-03-03","1862-01-20",""]],
  R000228: [["H","1861-07-04","1863-03-03","","1863-01-12"]],
  W000086: [["H","1863-12-07","1865-03-03","1864-02-01",""]],
  A000152: [["H","1861-07-04","1863-03-03","1862-06-02",""]],
  J000066: [["H","1863-12-07","1865-03-03","","1864-06-17"]],
  B000960: [["S","1861-07-04","1863-12-31","","1863-01-12"]],
  W000609: [["S","1862-01-01","1863-12-31","","1863-11-13"]],
  W000045: [["H","1861-07-04","1863-03-03","1862-12-01",""]],
  T000144: [["H","1861-07-04","1863-03-03","","1861-07-30"]],
  F000189: [["H","1861-07-04","1863-03-03","1863-02-17",""]],
  S000809: [["S","1861-07-04","1863-03-03","1861-10-29","1862-09-12"]],
  U000030: [["H","1861-07-04","1863-03-03","","1862-02-27"]],
  W000112: [["H","1861-07-04","1863-03-03","","1862-05-26"]],
  V000008: [["H","1857-12-07","1859-03-03","1858-05-25",""]],
  L000469: [["H","1861-07-04","1863-03-03","1862-06-03",""]],
  B000822: [["H","1861-07-04","1863-03-03","1863-02-25",""]],
  B001120: [["H","1861-07-04","1863-03-03","","1861-12-03"]],
  J000019: [["H","1861-07-04","1862-10-08","","1861-12-13"]],
  M000337: [["H","1861-07-04","1863-03-03","","1861-10-28"]],
  C000441: [["H","1861-07-04","1863-03-03","","1861-07-13"]],
  C000850: [["H","1861-07-04","1863-03-03","1861-12-02",""]],
  R000149: [["H","1861-07-04","1863-03-03","","1861-08-03"]],
  W000766: [["S","1862-01-01","1863-03-03","1862-02-24","1863-01-14"]],
  C000713: [["H","1859-12-05","1861-03-03","1861-01-29",""]],
  F000106: [["S","1862-01-01","1863-03-03","1862-11-21","1863-01-14"]],
  A000295: [["S","1862-01-01","1863-03-03","1862-12-01",""]],
  C000229: [["H","1861-07-04","1863-03-03","1862-03-10",""]],
  C001013: [["H","1861-07-04","1863-03-03","","1861-08-04"]],
  F000098: [["H","1861-07-04","1863-03-03","1862-12-01",""]],
  C000791: [["S","1845-12-01","1851-03-03","","1850-07-20"],["H","1839-12-02","1841-03-03","","1840-05-30"]],
  P000532: [["H","1861-07-04","1863-03-03","1862-01-21",""]],
  J000179: [["S","1861-07-04","1863-03-03","","1862-01-10"]],
  A000270: [["H","1861-07-04","1862-02-15","","1861-09-27"]],
  M000801: [["S","1861-07-04","1861-12-31","","1861-07-11"]],
  M000703: [["H","1979-01-15","1981-01-03","","1979-09-26"]],
  D000316: [["H","1909-03-15","1911-03-03","1910-02-01",""]],
  M000757: [["H","1889-12-02","1891-03-03","1890-09-24",""]],
  C000618: [["H","1975-01-14","1977-01-03","1976-11-02",""]],
  M001021: [["H","1971-01-21","1973-01-03","","1971-01-29"]],
  B001153: [["H","1973-01-03","1975-01-03","1974-06-04",""]]
};
const TERM_DROP = {
  S000768: [["H","1865-12-04"],["H","1869-03-04"]],
  E000085: [["H","1869-03-04"]],
  B000933: [["H","1867-03-04"]],
  M000075: [["H","1879-03-18"]],
  A000038: [["H","1815-12-04"]],
  P000537: [["H","1869-03-04"]],
  C000519: [["H","1869-03-04"]],
  G000347: [["H","1869-03-04"]],
  J000208: [["H","1865-12-04"]],
  A000350: [["H","1839-12-02"]]
};
// governor role parties that contradicted Wikipedia lists of governors (name|state|from year -> party; Other = a party other than Democratic/Republican, or a mid-term switch)
const PARTY_FIX = {"James C. Justice|WV|2017":"Other","Lowell Weicker|CT|1991":"Other","William Langer|ND|1937":"Other","James F. Byrnes|SC|1951":"Democratic","Octaviano Ambrosio Larrazolo|NM|1919":"Republican","John M. Palmer|IL|1869":"Republican","Zebulon Vance|NC|1862":"Other","Nathaniel P. Banks|MA|1858":"Republican","Henry B. Anthony|RI|1849":"Other","Hannibal Hamlin|ME|1857":"Republican","Thomas Swann|MD|1866":"Other","Harris M. Plaisted|ME|1881":"Other","Andrew Johnson|TN|1862":"Other","Adelbert Ames|MS|1868":"Other","Reuben Fenton|NY|1865":"Other","William Sprague IV|RI|1860":"Democratic","Francis Thomas|MD|1842":"Democratic","B. Gratz Brown|MO|1871":"Republican","Thomas Holliday Hicks|MD|1858":"Other","William Temple|DE|1846":"Other","Charles A. Wickliffe|KY|1839":"Other","Frederick Low|CA|1863":"Other","Thomas Corwin|OH|1840":"Other","Kinsley S. Bingham|MI|1855":"Republican","Salmon P. Chase|OH|1856":"Republican","Andrew Jackson Hamilton|TX|1865":"Other","William H. Seward|NY|1839":"Other","William Pennington|NJ|1837":"Other","Sam Houston|TX|1859":"Other","Hamilton Fish|NY|1849":"Other","Howell Cobb|GA|1851":"Other","James C. Jones|TN|1841":"Other","Edward Everett|MA|1836":"Other","William Henry Bissell|IL|1857":"Republican","Chauncey F. Cleveland|CT|1842":"Democratic","Willard P. Hall|MO|1864":"Other","Roger Sherman Baldwin|CT|1844":"Other","Paul Dillingham|VT|1865":"Republican","Thomas Walker Gilmer|VA|1840":"Other","William Sprague III|RI|1838":"Other","John M. Patton|VA|1841":"Other","Joshua L. Martin|AL|1845":"Other","William W. Ellsworth|CT|1838":"Other","Robert Y. Hayne|SC|1832":"Other","Edward Bishop Dudley|NC|1836":"Other","James Hamilton Jr.|SC|1830":"Other","Matthew Harvey|NH|1830":"Democratic","William A. Palmer|VT|1831":"Other","Earl Warren|CA|1943":"Republican","Sonny Perdue|GA|2003":"Republican","Wally Hickel|AK|1990":"Other","Pat Brown|CA|1959":"Democratic","William Hugh Smith|AL|1868":"Republican","Thomas H. Watts|AL|1863":"Other","Wager Swayne|AL|1867":"Other","Robert M. Patton|AL|1865":"Other","Forrest Hood James, Jr.|AL|1995":"Republican","Lewis E. Parsons|AL|1865":"Other","Richard H. Vose|ME|1841":"Other","Joseph H. Williams|ME|1857":"Republican","Nathaniel B. Baker|NH|1854":"Democratic","William T. Minor|CT|1855":"Other","David S. Walker|FL|1865":"Other","Wayne Mixson|FL|1987":"Democratic","William Marvin|FL|1865":"Other","Walter Maddock|ND|1928":"Republican","Robert Burns Smith|MT|1897":"Other","John Rankin Rogers|WA|1897":"Other","Henry H. Wells|VA|1868":"Other","Mills E. Godwin|VA|1966":"Democratic","Francis Harrison Pierpont|VA|1861":"Other","William E. Cameron|VA|1882":"Other","Charles Jackson|RI|1845":"Other","Byron Diman|RI|1846":"Other","Elisha Harris|RI|1847":"Other","Thomas King Carroll|MD|1830":"Other","William Cannon|DE|1863":"Other","George Hoadly|OH|1884":"Democratic","Charles Anderson|OH|1865":"Other","Joseph Ritner|PA|1835":"Other","Conrad Baker|IN|1867":"Other","Elisha M. Pease|TX|1853":"Democratic","Elisha M. Pease|TX|1867":"Other","Jonathan Worth|NC|1865":"Other","Benjamin Franklin Perry|SC|1865":"Other","Abram M. Scott|MS|1832":"Republican","Benjamin Grubb Humphreys|MS|1865":"Other","Floyd B. Olson|MN|1931":"Other","William Robert Taylor|WI|1874":"Other","William A. Poynter|NE|1899":"Other","Silas A. Holcomb|NE|1895":"Other","Lorenzo D. Lewelling|KS|1893":"Other","Mark Parkinson|KS|2009":"Democratic","Hamilton Rowan Gamble|MO|1861":"Other","George Foster Shepley|LA|1862":"Other","James Madison Wells|LA|1865":"Other","John L. Helm|KY|1850":"Other","Isaac Murphy|AR|1864":"Other","Erastus Fairbanks|VT|1852":"Other"};
// ---------------------------------------------------------------- people
const DAY = 86400000;
const GOV_DATES = fs.existsSync(path.join(__dirname, 'dh-gov-dates.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'dh-gov-dates.json'), 'utf8')).dates : {};
const people = [];
raw.forEach(p => {
  const roles = (p.roles || []).filter(r => r.status !== 'elect').map(r => { const gd = r.office === 'Governor' && !r.from && GOV_DATES[p.id + '|' + r.place]; return gd ? Object.assign({}, r, { from: gd[0], to: gd[1] }) : r; });   // undated governor roles get their years from site/tools/dh-gov-dates.json (answer agent 2026-11-13)
  if (!roles.length) return;
  const rec = { id: p.id, name: p.name, p, roles, wd: p.wikidata, tags: new Set(p.tags || []), terms: [], m: memBy[p.id] || null };
  const l = legBy[p.id];
  if (l && rec.m) {
    rec.leg = l;
    const died = rec.m.died ? +rec.m.died : null;
    let dday = null;
    if (died && p.wikidata && WDEATH[p.wikidata]) {   // only a Wikidata date that agrees with the death year already in the data
      const c = WDEATH[p.wikidata].filter(d => new Date(d).getUTCFullYear() === died).sort((x, y) => x - y);
      const lastStart = Date.parse(l.terms[l.terms.length - 1].start);
      dday = c.find(d => d >= lastStart) || c[c.length - 1] || null;
    }
    rec.dday = dday;
    l.terms.forEach(t => {
      const a = Date.parse(t.start); let b = Date.parse(t.end);
      if (died) b = Math.min(b, dday != null ? dday : Date.UTC(died, 11, 31));
      if (b < a) return;
      const pn = (p, st) => p === 'Democrat' ? 'Democrat' : p === 'Republican' && +st.slice(0, 4) >= 1854 ? 'Republican' : p === 'Whig' ? 'Whig' : 'Other';
      const base = { ch: t.type === 'sen' ? 'S' : 'H', st: t.state, cls: t.class || 0, real: !!STATEHOOD[t.state] && new Date(a).getUTCFullYear() >= STATEHOOD[t.state], a0: a };
      // a mid-term party switch is only in party_affiliations: split the term at the switch (answer agent 2026-11-12)
      const pa = (t.party_affiliations || []).filter(x => x.party && x.start && x.end);
      if (pa.length > 1) pa.forEach(x => { const xa = Math.max(a, Date.parse(x.start)), xb = Math.min(b, Date.parse(x.end)); if (xb > xa) rec.terms.push(Object.assign({}, base, { party: pn(x.party, x.start), pr: x.party, a: xa, b: xb })); });
      else rec.terms.push(Object.assign({}, base, { party: pn(t.party, t.start), pr: t.party || '', a, b }));   // real = a seat for a state, not a territorial delegate
    });
    // Reconstruction: a Southern state had no seats in Congress until it was readmitted, so a term the data dates from the opening of the 39th-41st Congresses is cut back to the
    // day the state's members were actually seated (a term that ended before that was never served)
    rec.terms.forEach(t => { const r = READMIT[t.st]; if (r && t.a >= Date.UTC(1865, 11, 1) && t.a <= Date.UTC(1871, 2, 4) && t.a < Date.parse(r)) t.a = Date.parse(r); });
    // term dates corrected from Wikipedia / the Biographical Directory text (see TERM_CLIP and TERM_DROP below)
    (TERM_CLIP[p.id] || []).forEach(([ch, from, to, ns, ne]) => {
      const f0 = Date.parse(from), t0 = Date.parse(to) + DAY;
      rec.terms.forEach(t => { if (t.ch === ch && t.a >= f0 && t.b <= t0) { if (ns) t.a = Math.max(t.a, Date.parse(ns)); if (ne) t.b = Math.min(t.b, Date.parse(ne)); } });
    });
    rec.terms = rec.terms.filter(t => t.b > t.a && !(TERM_DROP[p.id] || []).some(([ch, st]) => ch === t.ch && Date.parse(st) === t.a0));
    rec.terms.sort((x, y) => x.a - y.a);
  }
  rec.gov = roles.filter(r => r.office === 'Governor' && STATEHOOD[r.place] && r.from && +r.from <= 2026 && +r.from >= Math.max(1776, STATEHOOD[r.place]) && (!r.to || +r.to >= +r.from) && !BAD_GOV.has(p.name + '|' + r.place + '|' + r.from)).map(r => { const pf = PARTY_FIX[p.name + '|' + r.place + '|' + r.from]; return pf !== undefined ? Object.assign({}, r, { party: pf }) : r; });
  // role fixes found in the audit (wrong person, wrong dates, territorial or contested "governors"); Earl Long and Dinsmoor Jr. keep their correct roles with corrected dates
  if (p.name === 'Samuel Dinsmoor, Jr.') rec.gov = [{ office: 'Governor', place: 'NH', from: '1849', to: '1852', party: 'Democratic' }];
  // mayors (audit): a real person with a birth date (the source also held fictional mayors, list/template pages and colonial mayors), serving in 1776 or later; the Mexican-era alcaldes of California towns are not U.S. mayors
  const CA_CITY = new Set(['San Francisco', 'San Jose', 'Los Angeles', 'San Diego', 'Oakland']);
  const born = p.born && p.born.length >= 4 ? +p.born.slice(0, 4) : null;
  rec.mayor = !born ? [] : roles.filter(r => r.office === 'Mayor' && !(r.from && +r.from < 1776) && !(CA_CITY.has(r.place) && ((r.from && +r.from < 1850) || (!r.from && born < 1815))));
  people.push(rec);
});
const byId = {}; people.forEach(r => { byId[r.id] = r; });
const congress = people.filter(r => r.terms.length);

// audit: Wikipedia page views measured for ~1,950 people the structural prior might under-rate (long Wikipedia articles, long careers, high offices); only those whose measured
// views put them in a better tier than the prior are listed (id: average monthly views over 60 days, Nov 2026)
const FAME_BOOST = {"R000572":375227,"P000619":258206,"S001222":188524,"J000296":162342,"G000578":96167,"G000571":78699,"G000596":72100,"M000315":57269,"G000554":52814,"C000918":52362,"H000827":39079,"C001109":38671,"L000418":38018,"F000262":37110,"K000378":34643,"E000288":33657,"W000792":33197,"K000110":29310,"L000007":27235,"B000254":26558,"G000594":23715,"B001167":23654,"R000166":23456,"B000968":23335,"K000379":22156,"C001104":20136,"L000591":19864,"P000477":18836,"G000566":17545,"B001256":17542,"P000618":17124,"G000575":16618,"C000681":16384,"H000287":16330,"S000887":16312,"R000047":15774,"P000600":15642,"C000670":15305,"R000055":15227,"L000576":14287,"J000266":14264,"R000607":12598,"B001224":12297,"S000854":12153,"B000871":11977,"J000308":11717,"P000616":10177,"W000811":10156,"Y000006":9853,"A000367":9786,"M001186":9259,"C001127":9112,"L000588":9064,"S000502":9064,"B001130":9038,"F000451":8789,"L000592":8781,"W000826":8349,"W000825":8264,"D000007":8244,"P000222":8095,"D000627":7941,"A000018":7768,"M001185":7549,"H001087":7469,"S000402":7355,"J000306":7157,"S001175":7115,"F000245":7012,"C001122":6892,"B001290":6825,"F000069":6474,"H001078":6327,"F000238":6324,"A000355":6251,"S001135":6242,"G000388":5938,"A000073":5923,"W000807":5895,"S001179":5892,"S000890":5752,"N000194":5661,"C001090":5454,"F000473":5454,"V000105":5386,"Y000065":5384,"H000141":5261,"L000584":5230,"G000282":5179,"C000994":5135,"C001092":5074,"H000291":5057,"R000613":5043,"A000370":4967,"B000460":4926,"C001085":4918,"H000905":4873,"R000588":4847,"D000354":4764,"T000010":4758,"T000483":4757,"A000358":4754,"W000338":4715,"Q000024":4631,"M001001":4526,"A000014":4419,"B001297":4405,"A000069":4358,"H001056":4238,"A000172":4138,"H000975":4121,"M001155":4105,"T000470":4099,"C001078":4094,"C000264":4090,"I000057":4089,"C001105":4073,"H001073":4033,"P000591":4023,"U000039":4022,"J000301":4013,"L000578":3949,"M001203":3854,"W000819":3746,"C001054":3724,"M001221":3719,"P000059":3645,"S000257":3573,"Y000024":3559,"V000008":3546,"G000595":3449,"B001274":3447,"L000573":3408,"D000395":3405,"G000579":3362,"M001168":3342,"R000578":3199,"R000592":3127,"B001283":3026,"M001202":3007,"D000620":2923,"G000590":2870,"M001195":2772,"B001311":2637,"B001286":2616,"H001057":2571,"G000061":2562,"C001084":2521,"H001048":2521,"E000291":2412,"S001169":2398,"D000604":2384,"H001088":2344,"W000813":2297,"C001079":2274,"K000382":2172,"K000368":2170,"T000458":2148,"R000611":2140,"H001084":2131,"R000103":2129,"H001050":2104,"B001127":2018,"S001170":2016,"H001071":1962,"G000569":1953,"W000828":1925,"D000610":1898,"K000386":1891,"G000556":1868,"E000290":1862,"P000611":1846,"M001191":1845,"H001063":1826,"M001149":1782,"N000192":1781,"H001060":1779,"P000604":1774,"L000589":1742,"M001135":1733,"H000267":1732,"C001107":1659,"K000380":1650,"A000342":1614,"I000023":1609,"B001284":1606,"P000586":1604,"R000604":1588,"R000602":1579,"D000612":1572,"J000303":1545,"C001044":1500,"T000465":1497,"B001259":1480,"M000337":1455,"P000588":1445,"D000611":1438,"T000477":1429,"H001053":1400,"M001150":1362,"L000587":1336,"F000460":1313,"B001308":1312,"N000081":1294,"C000100":1290,"M001148":1287,"E000063":1264,"D000609":1264,"R000580":1261,"R000591":1258,"M001174":1232,"F000464":1226,"C001049":1225,"M001142":1224,"J000255":1222,"H000988":1212,"S001187":1211,"M001147":1208,"D000619":1205,"Q880546":1203,"C001060":1203,"Q262440":1200,"H001035":4313,"Q880186":1690,"Q80766":17860};
// ---------------------------------------------------------------- fame proxy
const MEASURED = fs.existsSync(path.join(ROOT, 'people-db', 'cache', 'dh2-fame-measured.json')) ? readJ(path.join(ROOT, 'people-db', 'cache', 'dh2-fame-measured.json')) : {};
const OKM = new Set(MEASURED._ok || []);
function roleScore(p) {
  let s = [];
  p.roles.forEach(r => {
    const o = r.office;
    if (o === 'President') s.push(200000);
    else if (o === 'Vice President') s.push(50000);
    else if (/Chief Justice/.test(o)) s.push(30000);
    else if (/Associate Justice/.test(o)) s.push(15000);
    else if (/^Secretary of (State|the Treasury|Defense|War)$|^Attorney General$/.test(o)) s.push(12000);
    else if (/^Secretary of|Postmaster General/.test(o)) s.push(4000);
    else if (o === 'Presidential Candidate') s.push(r.result === 'won' ? 200000 : 20000);
    else if (o === 'Vice Presidential Candidate') s.push(8000);
    else if (o === 'Governor') s.push(900);
    else if (o === 'Mayor') s.push(700);
    else if (o === 'First Lady') s.push(20000);
    else if (/Chief of Staff|Press Secretary|National Security Advisor/.test(o)) s.push(5000);
  });
  if (p.terms.length) {
    let yrs = 0; p.terms.forEach(t => { yrs += (t.b - t.a) / DAY / 365.25; });
    const sen = p.terms.some(t => t.ch === 'S');
    s.push(sen ? Math.min(6000, 1200 + 150 * yrs) : Math.min(3000, 350 + 60 * yrs));
    const tg = p.m && p.m.tags || [];
    if (tg.includes('speaker')) s.push(25000);
    if (tg.includes('ppt') || tg.includes('leader')) s.push(8000);
  }
  s.sort((a, b) => b - a);
  return Math.round((s[0] || 300) + 0.3 * s.slice(1).reduce((x, y) => x + y, 0));
}
function famous(p) {
  const v = p.wd && fame.views[p.wd];
  const base = v ? Math.max(v, 0) : roleScore(p);   // cached Wikipedia views win; otherwise the structural prior
  // measured page views (round-1 FAME_BOOST, round-2 dh2-fame-measured.json). A person whose measured page is a real article (OKM) is weighted by the measured views, up or down;
  // otherwise a measurement can only move the person UP a tier (a moved or redirected Wikipedia title shows too few views)
  const fb = FAME_BOOST[p.id] || 0, mv = MEASURED[p.id];
  if (!v && mv != null && OKM.has(p.id)) return Math.max(mv, fb);
  const b = Math.max(fb, mv || 0);
  return b > base ? b : base;
}
people.forEach(p => { p.fame = famous(p); p.w = p.fame >= 60000 ? 1 : p.fame >= 15000 ? 2 : p.fame >= 4000 ? 3 : p.fame >= 1200 ? 4 : 5; });

// ---------------------------------------------------------------- helpers
const y = s => +String(s).slice(0, 4);
function overlap(t, a, b) { // days of overlap of term t with [Jan 1 a, Dec 31 b]
  const lo = Math.max(t.a, Date.UTC(a, 0, 1)), hi = Math.min(t.b, Date.UTC(b, 11, 31));
  return (hi - lo) / DAY;
}
const served = (a, b, f) => p => p.terms.some(t => (!f || f(t)) && overlap(t, a, b) >= 31);
const serveWin = (lo, hi, f) => p => p.terms.some(t => (!f || f(t)) && (Math.min(t.b, hi) - Math.max(t.a, lo)) / DAY >= 31);
const firstYear = (p, ch) => { const t = p.terms.filter(t => !ch || t.ch === ch)[0]; return t ? new Date(t.a).getUTCFullYear() : null; };
// born year: full dates only; a Jan 1 on a round year is a Wikidata precision placeholder, and a birth date within 18 years of the first term is a term date by mistake
const bornYear = p => {
  const b = p.p.born; if (!b || b.length !== 10) return null;
  const yr = +b.slice(0, 4); if (/-01-01$/.test(b) && yr % 10 === 0) return null;
  if (p.terms.length && new Date(p.terms[0].a).getUTCFullYear() - yr < 18) return null;
  return yr;
};
const hasCh = ch => p => p.terms.some(t => t.ch === ch);
const sen = hasCh('S');
const house = hasCh('H');
const partyT = (party, ch) => p => p.terms.some(t => t.party === party && (!ch || t.ch === ch));
const stateT = (set, ch) => p => p.terms.some(t => t.real && set.has(t.st) && (!ch || t.ch === ch));
const regionSet = r => new Set(STATES.filter(s => REGION[s] === r));
const mtag = t => p => !!(p.m && p.m.tags.includes(t));

// ---- strict versions of the Wikidata-built tags (audit): the build-data tags also fire on near-miss labels, so each tag is re-confirmed from the raw Wikidata facts
const WF = {};
fs.readFileSync(path.join(ROOT, 'data', 'wikidata-facts.csv'), 'utf8').split(String.fromCharCode(10)).forEach(line => {
  const c = line.split(','); if (!/^P(39|69|241|410|606|607|106)$/.test(c[1])) return;
  (WF[c[0]] = WF[c[0]] || []).push([c[1], c.slice(3).join(',').trim().replace(/^"|"$/g, '')]);
});
const labs = (p, prop) => (WF[p.wd] || []).filter(x => x[0] === prop).map(x => x[1]);
const RANKS = /^(general|captain|private|lieutenant colonel|lieutenant|brigadier general|major|sub-lieutenant|sergeant|major general|colonel|senior lieutenant|lieutenant commander|commander|corporal|first lieutenant|seaman|staff sergeant|lieutenant \(junior grade\)|ensign|specialist|lieutenant general|rear admiral|second lieutenant|flight cadet|sergeant major|sergeant first class|admiral|first sergeant|private first class|seaman apprentice|yeoman|senior chief petty officer|master chief petty officer of the navy|command sergeant major|vice admiral|air force pilot|aviation cadet|gunner's mate|boatswain's mate|technical sergeant|master sergeant|midshipman|brigadegeneral|regimental sergeant major|battalion sergeant major|adjutant general|officer candidate)$/i;
const OCC_MIL = /soldier|military officer|military personnel|army officer|naval officer|military leader|military commander|officer of the/i;
const IVYRE = {
  harvard: l => /^(Harvard (?!-Westlake|Summer|Extension)|Radcliffe College)/.test(l),
  yale: l => /^Yale /.test(l),
  princeton: l => /^Princeton (University|School)/.test(l),
  columbia: l => /^Columbia (University|Law School)|Columbia University|^Columbia College$/.test(l),
  penn: l => /^(University of Pennsylvania|The Wharton School|Perelman School of Medicine)/.test(l),
  brown: l => /^Brown University/.test(l),
  dartmouth: l => /^(Dartmouth|Tuck School|Thayer School|Geisel School)/.test(l),
  cornell: l => /^(Cornell (University|Law School|Institute)|Weill Cornell)/.test(l)
};
const ivyHit = (p, which) => labs(p, 'P69').some(l => (which || Object.keys(IVYRE)).some(k => IVYRE[k](l))) ||
  ((!which || which.includes('princeton')) && labs(p, 'P69').some(l => /^(The )?College of New Jersey$/.test(l)) && +(p.p.born || '9999').slice(0, 4) < 1850);
const STRICT = {
  lawyer: p => labs(p, 'P106').some(l => /^(lawyer|corporate lawyer|barrister|solicitor|district attorney|assistant district attorney|city attorney|county attorney|state's attorney|United States Attorney|public prosecutor general|prosecutor)$/i.test(l)),
  military: p => labs(p, 'P241').some(l => !/Reserve Officers|British Army|Republic of Korea/i.test(l)) || labs(p, 'P607').some(l => !/Merit Cross/.test(l)) || labs(p, 'P106').some(l => OCC_MIL.test(l)) || labs(p, 'P410').some(l => RANKS.test(l)),
  // U.S. Army, Union Army or Continental Army only: not militia, an unspecified National Guard, the Air Force, or foreign armies
  army: p => labs(p, 'P241').some(l => /United States Army(?! Air)|^Union Army$|^Continental Army$|^army$|Army National Guard|Army Reserve|Army Corps of Engineers|United States Volunteers/i.test(l) && !/British/i.test(l)),
  ivy: p => ivyHit(p), harvard: p => ivyHit(p, ['harvard']),
  lived90: p => {
    const m = p.m, bd = p.leg && p.leg.bio && p.leg.bio.birthday;
    if (!m.died || !m.born) return false;
    if (bd && p.dday && /^\d{4}-\d\d-\d\d$/.test(bd) && +bd.slice(0, 4) === +m.born) return Math.floor((p.dday - Date.parse(bd)) / DAY / 365.2425) >= 90;
    return m.died - m.born >= 91;
  }
};
const stag = t => p => mtag(t)(p) && (!STRICT[t] || STRICT[t](p));
const AND = (...f) => p => f.every(x => x(p));
const OR = (...f) => p => f.some(x => x(p));
const isGov = p => p.gov.length > 0;
const isMayor = p => p.mayor.length > 0;
const lastName = p => {
  const l = p.leg && p.leg.name.last; return l || null;
};

// presidencies: inauguration dates, administration = from inauguration until next inauguration
const PRES = [['George Washington', '1789-04-30'], ['John Adams', '1797-03-04'], ['Thomas Jefferson', '1801-03-04'], ['James Madison', '1809-03-04'], ['James Monroe', '1817-03-04'], ['John Quincy Adams', '1825-03-04'], ['Andrew Jackson', '1829-03-04'], ['Martin Van Buren', '1837-03-04'], ['James K. Polk', '1845-03-04'], ['Franklin Pierce', '1853-03-04'], ['James Buchanan', '1857-03-04'], ['Abraham Lincoln', '1861-03-04'], ['Ulysses S. Grant', '1869-03-04'], ['Rutherford B. Hayes', '1877-03-04'], ['Grover Cleveland (first term)', '1885-03-04'], ['Benjamin Harrison', '1889-03-04'], ['Grover Cleveland (second term)', '1893-03-04'], ['William McKinley', '1897-03-04'], ['Theodore Roosevelt', '1901-09-14'], ['William Howard Taft', '1909-03-04'], ['Woodrow Wilson', '1913-03-04'], ['Warren G. Harding', '1921-03-04'], ['Calvin Coolidge', '1923-08-03'], ['Herbert Hoover', '1929-03-04'], ['Franklin D. Roosevelt', '1933-03-04'], ['Harry S. Truman', '1945-04-12'], ['Dwight D. Eisenhower', '1953-01-20'], ['John F. Kennedy', '1961-01-20'], ['Lyndon B. Johnson', '1963-11-22'], ['Richard Nixon', '1969-01-20'], ['Gerald Ford', '1974-08-09'], ['Jimmy Carter', '1977-01-20'], ['Ronald Reagan', '1981-01-20'], ['George H. W. Bush', '1989-01-20'], ['Bill Clinton', '1993-01-20'], ['George W. Bush', '2001-01-20'], ['Barack Obama', '2009-01-20'], ['Donald Trump (first term)', '2017-01-20'], ['Joe Biden', '2021-01-20']];


// ---------------------------------------------------------------- cabinet (department heads only, >= 1 year in the post)
const CAB = /^(Secretary of (State|the Treasury|War|the Navy|the Interior|Agriculture|Commerce|Labor|Defense|Energy|Education|Transportation|Housing and Urban Development|Health and Human Services|Veterans Affairs|Homeland Security|Health, Education, and Welfare)|Attorney General|Postmaster General)$/;
people.forEach(p => {
  p.cab = p.roles.filter(r => CAB.test(r.office) && r.from &&
    (r.to == null ? true : +r.to - +r.from >= 1) &&
    !(r.office === 'Secretary of the Navy' && +r.from >= 1947) && !(r.office === 'Postmaster General' && +r.from >= 1971));
});
// acting or pre-1789 (Continental Congress / Confederation) officials and unverified recent names that the data lists as department heads
const CAB_EXCLUDE = new Set(['Adrianne Todman', 'Rebecca Blank', 'Elaine Duke', 'Keith Sonderling', 'Todd Blanche', 'Markwayne Mullin', 'Herbert A. Meyer', 'Benjamin Franklin', 'John Jay', 'Benjamin Lincoln', 'Richard Bache', 'Ebenezer Hazard', 'Egil Krogh']);
const isCab = p => p.cab.length > 0 && p.tags.has('cabinet') && !CAB_EXCLUDE.has(p.name);

const SUF = /,?\s+(II|III|IV|V)$/;
function dispName(p) { return p.name.replace(SUF, '').trim(); }
function aliasesFor(p, nm) {
  const out = [], keys = new Set([norm(nm)]);
  const add1 = x => { const k = norm(x); if (!x || keys.has(k) || k.split(' ').length < 2) return; keys.add(k); out.push(x); };
  if (p.leg) {
    const n = p.leg.name, last = n.last;
    if (n.first) add1(`${n.first} ${last}`);
    if (n.nickname) add1(`${n.nickname.replace(/["']/g, '')} ${last}`);
  } else (p.p.aliases || []).filter(a => /\s/.test(a.trim())).slice(0, 1).forEach(add1);
  return out.slice(0, 2);
}
function autoKeys(nm) { const t = norm(nm).split(' '); return t.length >= 3 ? [t[0] + ' ' + t[t.length - 1]] : []; }
const ytxt = ms => new Date(ms).getUTCFullYear();
const fmtYears = (a, b) => a === b ? `${a}` : `${a} to ${b}`;
function jackNote(p, kind) {
  const nm = dispName(p);
  if (p.m && p.m.current) return null;
  if (kind.startsWith('gov') && p.gov.length === 1 && p.gov[0].to) return `${nm} was governor of ${STATE_NAME[p.gov[0].place]} from ${p.gov[0].from} to ${p.gov[0].to}.`;
  if (kind.startsWith('mayor') && p.mayor.length === 1 && p.mayor[0].from && p.mayor[0].to) return `${nm} was mayor of ${p.mayor[0].place} from ${p.mayor[0].from} to ${p.mayor[0].to}.`;
  if (kind === 'cabinet' && p.cab.length === 1 && p.cab[0].to) return `${nm} was U.S. ${p.cab[0].office} from ${p.cab[0].from} to ${p.cab[0].to}.`;
  if (p.terms.length) {
    const chs = [...new Set(p.terms.map(t => t.ch))], sts = [...new Set(p.terms.map(t => t.st))];
    if (chs.length === 1 && sts.length === 1 && STATE_NAME[sts[0]]) return `${nm} represented ${STATE_NAME[sts[0]]} in the U.S. ${chs[0] === 'S' ? 'Senate' : 'House'} from ${fmtYears(ytxt(p.terms[0].a), ytxt(p.terms[p.terms.length - 1].b))}.`;
  }
  return null;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// alias safety (audit): a first+last alias, or the game automatic first+last key of a 3-word name, must not equal the full name of a DIFFERENT person who is not
// in the answer list and is very well known (weight 1-2), e.g. John Quincy Adams must not accept John Adams, nor Senator William B. McKinley accept William McKinley
let UKEY = null;
function keyIndex() {
  if (UKEY) return UKEY; UKEY = new Map();
  const put = (k, p) => { if (!k) return; let st = UKEY.get(k); if (!st) UKEY.set(k, st = new Set()); st.add(p); };
  people.forEach(p => { put(norm(dispName(p)), p); put(norm(p.name), p); if (p.leg && p.leg.name.first) put(norm(p.leg.name.first + ' ' + p.leg.name.last), p); (p.p.aliases || []).forEach(x => { if (/\s/.test(x.trim())) put(norm(x), p); }); });
  return UKEY;
}
function buildAnswers(list) {
  const listSet = new Set(list), kidx = keyIndex();
  const blocked = (k, it) => [...(kidx.get(k) || [])].some(p2 => !it.ps.includes(p2) && !listSet.has(p2) && p2.w <= 2);
  const byKey = new Map();
  list.forEach(p => {
    const nm = dispName(p), k = norm(nm), cur = byKey.get(k);
    if (!cur) byKey.set(k, { p, nm, ps: [p] }); else { cur.ps.push(p); if (p.fame > cur.p.fame) cur.p = p; }
  });
  const items = [...byKey.values()].sort((a, b) => b.p.fame - a.p.fame || (a.nm < b.nm ? -1 : 1));
  const autoOwner = new Map(); items.forEach((it, i) => autoKeys(it.nm).forEach(k => { if (!autoOwner.has(k)) autoOwner.set(k, i); }));
  const used = new Set(items.map(it => norm(it.nm)));
  return items.map((it, i) => {
    const a = { name: it.nm };
    const als = aliasesFor(it.p, it.nm).filter(x => { const k = norm(x); if (used.has(k)) return false; if (autoOwner.has(k) && autoOwner.get(k) !== i) return false; if (blocked(k, it)) return false; used.add(k); return true; });
    if (als.length) a.aliases = als;
    const tk = norm(it.nm).split(" "); if (tk.length >= 3 && blocked(tk[0] + " " + tk[tk.length - 1], it)) a.surname = false;
    a.weight = it.p.w;
    Object.defineProperty(a, '_it', { value: it, enumerable: false });
    return a;
  });
}
// a Dark Horse must qualify with room to spare: it is re-tested with every term shortened by 60 days at each end (so a member who left on March 3 of a boundary year,
// or whose dates are slightly off, is never the jackpot)
const SHRINK = 60 * DAY;
function robust(p, filter) {
  const terms = p.terms.map(t => Object.assign({}, t, { a: t.a + SHRINK, b: t.b - SHRINK })).filter(t => t.b > t.a);
  if (p.terms.length && !terms.length) return false;
  return filter(Object.assign({}, p, { terms }));
}
function pickJackpot(answers, qid, kind, filter) {
  const ok = answers.filter(a => a.weight === 5 && a._it.ps.length === 1 && (!filter || robust(a._it.p, filter))).map(a => ({ a, note: jackNote(a._it.p, kind) })).filter(x => x.note);
  if (!ok.length) return;
  ok.sort((x, y) => hashStr(qid + x.a.name) - hashStr(qid + y.a.name));
  ok[0].a.jackpot = true; ok[0].a.note = ok[0].note;
}

// ================================================================ ROUND 2: new question families (see audit/dh-derived2-log.md)
// Every question here is new: the candidate answer sets are compared with ALL existing banks (prompt text and answer set) and dropped when they overlap by more than 80%.


// admission dates of the states after the original thirteen: a term counts as a state seat when it runs past the day the state was admitted (round 1 used the start year, which left out
// the first members of Tennessee, Michigan and others whose first term is dated before admission; a territorial delegate's term always ends before admission)
const ADMIT = { VT: '1791-03-04', KY: '1792-06-01', TN: '1796-06-01', OH: '1803-03-01', LA: '1812-04-30', IN: '1816-12-11', MS: '1817-12-10', IL: '1818-12-03', AL: '1819-12-14', ME: '1820-03-15', MO: '1821-08-10', AR: '1836-06-15', MI: '1837-01-26', FL: '1845-03-03', TX: '1845-12-29', IA: '1846-12-28', WI: '1848-05-29', CA: '1850-09-09', MN: '1858-05-11', OR: '1859-02-14', KS: '1861-01-29', WV: '1863-06-20', NV: '1864-10-31', NE: '1867-03-01', CO: '1876-08-01', ND: '1889-11-02', SD: '1889-11-02', MT: '1889-11-08', WA: '1889-11-11', ID: '1890-07-03', WY: '1890-07-10', UT: '1896-01-04', OK: '1907-11-16', NM: '1912-01-06', AZ: '1912-02-14', AK: '1959-01-03', HI: '1959-08-21' };
let REAL_CHANGED = 0;
people.forEach(p => p.terms.forEach(t => {
  const was = t.real; const ad = ADMIT[t.st];
  if (STATEHOOD[t.st] && STATEHOOD[t.st] <= 1790) t.real = true; else t.real = !!ad && t.b > Date.parse(ad) + DAY;
  if (was !== t.real) REAL_CHANGED++;
}));
// audit corrections of a nominal term end found by the Wikipedia check (a House member re-elected and then resigned): person id -> [chamber, real last day]
const AUDIT_END = { U000002: ['H', '1961-01-18'] };   // Stewart Udall resigned January 18, 1961 to become Secretary of the Interior (listed to 1963)
people.forEach(p => { const x = AUDIT_END[p.id]; if (!x) return; const last = p.terms.filter(t => t.ch === x[0]).pop(); if (last) last.b = Math.min(last.b, Date.parse(x[1])); });
// Senate seats (state + class): a senator's listed term often runs to the nominal end of the six years even when he resigned or was replaced. When the next holder of the same seat
// starts (with a real date, not a January 1 placeholder) before the listed end, the earlier senator's term is cut there (round 2 audit; the Congress-number questions need it)
let SEAT_CLIPS = 0;
{
  const seatsM = {};
  people.forEach(p => p.terms.forEach(t => { if (t.ch === 'S' && t.cls) (seatsM[t.st + '|' + t.cls] = seatsM[t.st + '|' + t.cls] || []).push({ p, t }); }));
  Object.values(seatsM).forEach(a => {
    a.sort((x, y) => x.t.a - y.t.a);
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1], nx = a[i], d = new Date(nx.t.a), jan1 = d.getUTCMonth() === 0 && d.getUTCDate() === 1;
      if (!jan1 && nx.p !== prev.p && nx.t.a < prev.t.b - 3 * DAY && nx.t.a > prev.t.a) { prev.t.b = nx.t.a; SEAT_CLIPS++; }
    }
  });
}
const DAY2 = DAY;
const specs = [];
// cls: A = anyone who knows the person can say whether they qualify (name, party, state, chamber); B = needs the era or the career; C = needs exact dates (birth year, death decade, Congress number)
function add(cat, fam, prompt, filter, universe, cls) {
  if (cat === 'governors' && !/acting governors/.test(prompt)) prompt = prompt.includes('(past or present') ? prompt.replace('(past or present', '(past or present, acting governors included') : prompt + ' (acting governors included)';
  specs.push({ cat, fam, prompt, filter, universe: universe || congress, cls: cls || 'B' });
}
const D = partyT('Democrat'), R = partyT('Republican');
const PN = { Democrat: 'Democratic', Republican: 'Republican' };
const NOW = Date.UTC(2026, 10, 12);
const yrs = p => p.terms.reduce((s, t) => s + (Math.min(t.b, NOW) - t.a) / DAY / 365.25, 0);
const chYrs = (p, ch) => p.terms.filter(t => t.ch === ch).reduce((s, t) => s + (Math.min(t.b, NOW) - t.a) / DAY / 365.25, 0);
const both = p => hasCh('S')(p) && hasCh('H')(p);
const isFemale = p => !!(p.leg && p.leg.bio && p.leg.bio.gender === 'F');
const diedYear = p => (p.m && p.m.died) ? +p.m.died : null;
const surnameOf = p => {
  if (p.leg && p.leg.name.last) return p.leg.name.last;
  const t = dispName(p).replace(/,.*$/, '').split(/\s+/); return t[t.length - 1];
};
const firstOf = p => (p.leg && p.leg.name.first) ? p.leg.name.first : dispName(p).split(/\s+/)[0];
const cleanFirst = p => norm(dispName(p)).split(' ')[0] === norm(firstOf(p));   // the name shown starts with the first name (Jack Reed is not a "John")

// ---- Congress numbers
const congStart = n => n <= 73 ? Date.UTC(1789 + 2 * (n - 1), 2, 4) : Date.UTC(1935 + 2 * (n - 74), 0, 3);
const congEnd = n => congStart(n + 1) - DAY;
const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
const cyr = ms => new Date(ms).getUTCFullYear();

// ---- region groups with explicit state lists (named in the prompt, so a player knows what is meant)
const GROUPS = [
  ['New England', 'a New England state (Connecticut, Maine, Massachusetts, New Hampshire, Rhode Island or Vermont)', 'CT ME MA NH RI VT'],
  ['Mid-Atlantic', 'a Mid-Atlantic state (New York, New Jersey, Pennsylvania, Delaware or Maryland)', 'NY NJ PA DE MD'],
  ['Deep South', 'a Deep South state (South Carolina, Georgia, Alabama, Mississippi or Louisiana)', 'SC GA AL MS LA'],
  ['Gulf', 'a Gulf Coast state (Texas, Louisiana, Mississippi, Alabama or Florida)', 'TX LA MS AL FL'],
  ['Great Lakes', 'a Great Lakes state (Illinois, Indiana, Michigan, Minnesota, New York, Ohio, Pennsylvania or Wisconsin)', 'IL IN MI MN NY OH PA WI'],
  ['Plains', 'a Great Plains state (North Dakota, South Dakota, Nebraska, Kansas or Oklahoma)', 'ND SD NE KS OK'],
  ['Mountain', 'a Mountain West state (Arizona, Colorado, Idaho, Montana, Nevada, New Mexico, Utah or Wyoming)', 'AZ CO ID MT NV NM UT WY'],
  ['West Coast', 'a West Coast state (California, Oregon or Washington)', 'CA OR WA'],
  ['Border', 'a border state (Delaware, Maryland, Kentucky or Missouri)', 'DE MD KY MO'],
  ['Old Northwest', 'a state carved from the Old Northwest Territory (Ohio, Indiana, Illinois, Michigan or Wisconsin)', 'OH IN IL MI WI'],
  ['Original 13', 'one of the original thirteen states (Delaware, Pennsylvania, New Jersey, Georgia, Connecticut, Massachusetts, Maryland, South Carolina, New Hampshire, Virginia, New York, North Carolina or Rhode Island)', 'DE PA NJ GA CT MA MD SC NH VA NY NC RI'],
  ['Upper South', 'an Upper South state (Virginia, North Carolina, Tennessee, Kentucky or Arkansas)', 'VA NC TN KY AR'],
  ['Pacific/Hawaii', 'a state in the Pacific (California, Oregon, Washington, Alaska or Hawaii)', 'CA OR WA AK HI']
];
GROUPS.forEach(([k, lab, ss]) => {
  const set = new Set(ss.split(' '));
  add('states', 'grp', `Name a member of Congress who represented ${lab}`, stateT(set), congress, 'A');
  add('senators', 'grp-s', `Name a U.S. senator who represented ${lab}`, stateT(set, 'S'), congress, 'A');
  add('representatives', 'grp-h', `Name a member of the U.S. House who represented ${lab}`, stateT(set, 'H'), congress, 'A');
  for (const pt of ['Democrat', 'Republican']) add('states', 'grp-party', `Name a ${PN[pt]} member of Congress who represented ${lab}`, p => p.terms.some(t => t.real && set.has(t.st) && t.party === pt), congress, 'A');
  add('governors', 'grp-gov', `Name a governor of ${lab} (past or present)`, p => p.gov.some(g => set.has(g.place)), people, 'A');
  for (const [a, b] of [[1789, 1860], [1861, 1932], [1933, 2026]]) add('states', 'grp-era', `Name a member of Congress who represented ${lab} at some point ${b === 2026 ? 'since ' + a : 'between ' + a + ' and ' + b}`, p => p.terms.some(t => t.real && set.has(t.st) && overlap(t, a, b) >= 31), congress, 'B');
});
// ---- single states (every state with enough members)
for (const s of STATES) {
  const set = new Set([s]);
  add('states', 'state', `Name a member of Congress who represented ${STATE_NAME[s]} (past or present)`, stateT(set), congress, 'A');
  add('representatives', 'state-h', `Name a member of the U.S. House who represented ${STATE_NAME[s]} (past or present)`, stateT(set, 'H'), congress, 'A');
  for (const pt of ['Democrat', 'Republican']) add('states', 'state-party', `Name a ${PN[pt]} member of Congress who represented ${STATE_NAME[s]} (past or present)`, p => p.terms.some(t => t.real && t.st === s && t.party === pt), congress, 'A');
  for (const [a, b] of [[1789, 1860], [1861, 1932], [1933, 2026]]) add('states', 'state-era', `Name a member of Congress who represented ${STATE_NAME[s]} at some point ${b === 2026 ? 'since ' + a : 'between ' + a + ' and ' + b}`, p => p.terms.some(t => t.real && t.st === s && overlap(t, a, b) >= 31), congress, 'B');
}
// ---- Congress numbers
for (let n = 10; n <= 119; n++) {
  const a = congStart(n), b = congEnd(n);
  add('congress-history', 'cong', `Name a member of Congress who served in the ${ord(n)} Congress (${cyr(a)} to ${cyr(b + DAY)})`, serveWin(a, b), congress, 'C');
}
// ---- decades: served, first term, last-term-by-death, born, died
for (let d = 1780; d <= 2020; d += 10) {
  add('congress-history', 'first', `Name a member of Congress whose first term began in the ${d}s (${d} to ${d + 9})`, p => { const f = firstYear(p); return f >= d && f <= d + 9; }, congress, 'C');
  add('political-figures', 'born', `Name a member of Congress who was born in the ${d}s (${d} to ${d + 9})`, p => { const b = bornYear(p); return b >= d && b <= d + 9; }, congress, 'C');
  add('political-figures', 'died', `Name a member of Congress who died in the ${d}s (${d} to ${d + 9})`, p => { const q = diedYear(p); return q >= d && q <= d + 9; }, congress, 'C');
  add('congress-history', 'decade', `Name a member of Congress who served at some point in the ${d}s (${d} to ${d + 9})`, served(d, d + 9), congress, 'B');
  add('senators', 'decade-s', `Name a U.S. senator who served at some point in the ${d}s (${d} to ${d + 9})`, served(d, d + 9, t => t.ch === 'S'), congress, 'B');
  add('representatives', 'decade-h', `Name a member of the U.S. House who served at some point in the ${d}s (${d} to ${d + 9})`, served(d, d + 9, t => t.ch === 'H'), congress, 'B');
  add('governors', 'gov-born', `Name a governor of a U.S. state who was born in the ${d}s (${d} to ${d + 9})`, p => { const b = bornYear(p); return isGov(p) && b >= d && b <= d + 9; }, people, 'C');
  add('governors', 'gov-decade', `Name a governor of a U.S. state who served at some point in the ${d}s (${d} to ${d + 9})`, p => p.gov.some(g => +g.from <= d + 9 && (g.to ? +g.to : 2026) >= d), people, 'B');
}
// ---- eras for senators and the House
const ERAS = [[1789, 1828], [1829, 1860], [1861, 1900], [1901, 1932], [1933, 1960], [1961, 1980], [1981, 2000], [2001, 2026]];
for (const [a, b] of ERAS) {
  const lab = b === 2026 ? `since ${a}` : `between ${a} and ${b}`;
  add('senators', 'era-s', `Name a U.S. senator who served at some point ${lab}`, served(a, b, t => t.ch === 'S'), congress, 'B');
  for (const pt of ['Democrat', 'Republican']) {
    add('senators', 'era-party-s', `Name a ${PN[pt]} U.S. senator who served at some point ${lab}`, served(a, b, t => t.party === pt && t.ch === 'S'), congress, 'B');
    add('representatives', 'era-party-h', `Name a ${PN[pt]} member of the U.S. House who served at some point ${lab}`, served(a, b, t => t.party === pt && t.ch === 'H'), congress, 'B');
    add('congress-history', 'era-party', `Name a ${PN[pt]} member of Congress who served at some point ${lab}`, served(a, b, t => t.party === pt), congress, 'B');
  }
  add('representatives', 'era-h', `Name a member of the U.S. House who served at some point ${lab}`, served(a, b, t => t.ch === 'H'), congress, 'B');
  add('congress-demographics', 'women-era', `Name a woman who served in Congress at some point ${lab}`, p => isFemale(p) && served(a, b)(p), congress, 'B');
}
// ---- presidencies (senators; and members for presidents round 1 did not use)
// presidencies with their real start and end days (round 1's list left out Harrison, Tyler, Taylor, Fillmore, A. Johnson, Garfield and Arthur, so its "Polk (1845 to 1853)", "Lincoln (1861 to 1869)" and
// "Hayes (1877 to 1885)" windows ran over the next presidents; the one-month and six-month presidencies of Harrison and Garfield are left out of the questions)
const PRES2 = [['George Washington', '1789-04-30', '1797-03-03'], ['John Adams', '1797-03-04', '1801-03-03'], ['Thomas Jefferson', '1801-03-04', '1809-03-03'], ['James Madison', '1809-03-04', '1817-03-03'], ['James Monroe', '1817-03-04', '1825-03-03'], ['John Quincy Adams', '1825-03-04', '1829-03-03'], ['Andrew Jackson', '1829-03-04', '1837-03-03'], ['Martin Van Buren', '1837-03-04', '1841-03-03'], ['John Tyler', '1841-04-04', '1845-03-03'], ['James K. Polk', '1845-03-04', '1849-03-04'], ['Zachary Taylor', '1849-03-05', '1850-07-09'], ['Millard Fillmore', '1850-07-10', '1853-03-03'], ['Franklin Pierce', '1853-03-04', '1857-03-03'], ['James Buchanan', '1857-03-04', '1861-03-03'], ['Abraham Lincoln', '1861-03-04', '1865-04-15'], ['Andrew Johnson', '1865-04-15', '1869-03-03'], ['Ulysses S. Grant', '1869-03-04', '1877-03-03'], ['Rutherford B. Hayes', '1877-03-04', '1881-03-03'], ['Chester A. Arthur', '1881-09-19', '1885-03-03'], ['Grover Cleveland (first term)', '1885-03-04', '1889-03-03'], ['Benjamin Harrison', '1889-03-04', '1893-03-03'], ['Grover Cleveland (second term)', '1893-03-04', '1897-03-03'], ['William McKinley', '1897-03-04', '1901-09-14'], ['Theodore Roosevelt', '1901-09-14', '1909-03-03'], ['William Howard Taft', '1909-03-04', '1913-03-03'], ['Woodrow Wilson', '1913-03-04', '1921-03-03'], ['Warren G. Harding', '1921-03-04', '1923-08-02'], ['Calvin Coolidge', '1923-08-03', '1929-03-03'], ['Herbert Hoover', '1929-03-04', '1933-03-03'], ['Franklin D. Roosevelt', '1933-03-04', '1945-04-12'], ['Harry S. Truman', '1945-04-12', '1953-01-19'], ['Dwight D. Eisenhower', '1953-01-20', '1961-01-19'], ['John F. Kennedy', '1961-01-20', '1963-11-22'], ['Lyndon B. Johnson', '1963-11-22', '1969-01-19'], ['Richard Nixon', '1969-01-20', '1974-08-09'], ['Gerald Ford', '1974-08-09', '1977-01-19'], ['Jimmy Carter', '1977-01-20', '1981-01-19'], ['Ronald Reagan', '1981-01-20', '1989-01-19'], ['George H. W. Bush', '1989-01-20', '1993-01-19'], ['Bill Clinton', '1993-01-20', '2001-01-19'], ['George W. Bush', '2001-01-20', '2009-01-19'], ['Barack Obama', '2009-01-20', '2017-01-19'], ['Donald Trump (first term)', '2017-01-20', '2021-01-19'], ['Joe Biden', '2021-01-20', '2025-01-19']];
PRES2.forEach(([nm, d0, d1]) => {
  const a = Date.parse(d0), b = Date.parse(d1) + DAY - 1;
  const y0 = cyr(a), y1 = cyr(Date.parse(d1));
  const nm2 = nm.replace(/ \((first|second) term\)/, ''), tag = / \(first term\)/.test(nm) ? ' (first term)' : / \(second term\)/.test(nm) ? ' (second term)' : '';
  const span = y0 === y1 ? '' + y0 : y0 + ' to ' + y1;
  add('senators', 'pres-s', 'Name a U.S. senator who served during ' + nm2 + "'s presidency" + tag + ' (' + span + ')', serveWin(a, b, t => t.ch === 'S'), congress, 'B');
  add('congress-history', 'pres', 'Name a member of Congress who served during ' + nm2 + "'s presidency" + tag + ' (' + span + ')', serveWin(a, b), congress, 'B');
  add('representatives', 'pres-h', 'Name a member of the U.S. House who served during ' + nm2 + "'s presidency" + tag + ' (' + span + ')', serveWin(a, b, t => t.ch === 'H'), congress, 'B');
});
// ---- parties of history (raw labels of the source; the first modern Republican label is 1854)
const FEDR = p => p.terms.some(t => t.pr === 'Federalist');
const DEMREP = p => p.terms.some(t => /^(Republican|Democratic Republican)$/.test(t.pr) && t.a < Date.UTC(1825, 2, 5));
const WHIGS = p => p.terms.some(t => t.party === 'Whig');
add('congress-history', 'party-hist', 'Name a Federalist who served in Congress', FEDR, congress, 'B');
add('congress-history', 'party-hist', 'Name a Democratic-Republican (Jeffersonian Republican) who served in Congress before 1825', DEMREP, congress, 'B');
add('senators', 'party-hist', 'Name a Federalist who served in the U.S. Senate', p => p.terms.some(t => t.pr === 'Federalist' && t.ch === 'S'), congress, 'B');
add('representatives', 'party-hist', 'Name a Federalist who served in the U.S. House', p => p.terms.some(t => t.pr === 'Federalist' && t.ch === 'H'), congress, 'B');
add('representatives', 'party-hist', 'Name a Democratic-Republican who served in the U.S. House before 1825', p => p.terms.some(t => /^(Republican|Democratic Republican)$/.test(t.pr) && t.a < Date.UTC(1825, 2, 5) && t.ch === 'H'), congress, 'B');
add('senators', 'party-hist', 'Name a Whig who served in the U.S. Senate', p => p.terms.some(t => t.party === 'Whig' && t.ch === 'S'), congress, 'B');
add('representatives', 'party-hist', 'Name a Whig who served in the U.S. House', p => p.terms.some(t => t.party === 'Whig' && t.ch === 'H'), congress, 'B');
add('congress-history', 'party-hist', 'Name a member of Congress who served as a Republican between 1854 and 1876', p => p.terms.some(t => t.party === 'Republican' && overlap(t, 1854, 1876) >= 31), congress, 'B');
add('congress-history', 'party-hist', 'Name a member of Congress who served as a Democrat between 1829 and 1876', p => p.terms.some(t => t.party === 'Democrat' && overlap(t, 1829, 1876) >= 31), congress, 'B');

// ---- women
add('congress-demographics', 'women', 'Name a woman who has served in Congress (House or Senate, through 2026)', isFemale, congress, 'A');
for (const pt of ['Democrat', 'Republican']) add('congress-demographics', 'women-party', `Name a ${PN[pt]} woman who has served in Congress`, p => isFemale(p) && partyT(pt)(p), congress, 'A');
add('congress-demographics', 'women', 'Name a woman who has served in the U.S. Senate', p => isFemale(p) && hasCh('S')(p), congress, 'A');

// ---- first names, initials, surname patterns
const countBy = (fn, list) => { const m = {}; list.forEach(p => { const k = fn(p); if (k) m[k] = (m[k] || 0) + 1; }); return m; };
const fnCount = countBy(p => p.leg && cleanFirst(p) ? norm(firstOf(p)) : null, congress);
Object.entries(fnCount).filter(([, n]) => n >= 120).forEach(([k]) => {
  const label = congress.find(p => p.leg && cleanFirst(p) && norm(firstOf(p)) === k).leg.name.first;
  add('political-names', 'first-name', `Name a member of Congress whose first name is ${label}`, p => p.leg && cleanFirst(p) && norm(firstOf(p)) === k, congress, 'A');
  add('political-names', 'first-name-s', `Name a U.S. senator whose first name is ${label}`, p => p.leg && cleanFirst(p) && norm(firstOf(p)) === k && hasCh('S')(p), congress, 'A');
});
const gfn = countBy(p => isGov(p) && cleanFirst(p) ? norm(firstOf(p)) : null, people);
Object.entries(gfn).filter(([, n]) => n >= 100).forEach(([k]) => {
  const label = people.find(p => isGov(p) && cleanFirst(p) && norm(firstOf(p)) === k);
  add('governors', 'gov-first', `Name a governor of a U.S. state whose first name is ${firstOf(label)}`, p => isGov(p) && cleanFirst(p) && norm(firstOf(p)) === k, people, 'A');
});
const NOPRE = /^(van|von|de|del|di|du|la|le|st\.?|ten|ter|der|den)\s/i;
for (const L of 'ABCDEFGHIJKLMNOPRSTUVWY'.split('')) {
  add('political-names', 'initial', `Name a member of Congress whose last name starts with ${L}`, p => { const l = p.leg && p.leg.name.last; return l && l[0].toUpperCase() === L && !NOPRE.test(l); }, congress, 'A');
  add('governors', 'gov-initial', `Name a governor of a U.S. state whose last name starts with ${L}`, p => isGov(p) && surnameOf(p)[0].toUpperCase() === L && !NOPRE.test(surnameOf(p)), people, 'A');
  add('senators', 'initial-s', `Name a U.S. senator whose last name starts with ${L}`, p => { const l = p.leg && p.leg.name.last; return l && l[0].toUpperCase() === L && !NOPRE.test(l) && hasCh('S')(p); }, congress, 'A');
}
const SURN = [['starts with Mc or Mac (McCarthy, MacArthur and similar)', /^(Mc|Mac(?=[A-Z]))/], ['ends in -son (Johnson, Wilson, Anderson and similar)', /son$/i], ['ends in -man (Hartman, Coleman and similar)', /man$/i], ['ends in -ton (Hamilton, Clinton and similar)', /ton$/i], ['ends in -ey or -y (Kelley, Hardy and similar)', /(ey|y)$/i], ['ends in -er (Miller, Baker and similar)', /er$/i], ['starts with Mc', /^Mc/], ['has a hyphen or two words in it (a double-barreled last name)', /[- ]/]];
SURN.forEach(([lab, re]) => add('political-names', 'surname', `Name a member of Congress whose last name ${lab}`, p => { const l = p.leg && p.leg.name.last; return l && re.test(l); }, congress, 'A'));
// ---- length of service
for (const k of [24]) add('congress-demographics', 'length', `Name a member of Congress who served ${k} or more years in total`, p => yrs(p) >= k, congress, 'B');
for (const k of [12, 18]) add('senators', 'length-s', `Name a U.S. senator who served ${k} or more years in the Senate`, p => chYrs(p, 'S') >= k, congress, 'B');
for (const k of [20, 28]) add('representatives', 'length-h', `Name a member of the U.S. House who served ${k} or more years in the House`, p => chYrs(p, 'H') >= k, congress, 'B');
// ---- other careers (confirmed from Wikidata labels, see STRICT2 below)
// ---- delegates and states
const isDelegate = p => p.leg && p.terms.some(t => t.ch === 'H' && !t.real);
add('congress-history', 'delegate', 'Name someone who served in the U.S. House as a non-voting delegate or resident commissioner (from a territory, the District of Columbia or Puerto Rico)', isDelegate, congress, 'B');
add('congress-history', 'delegate', 'Name someone who served in Congress as a delegate from a territory before it became a state', p => p.terms.some(t => t.ch === 'H' && !t.real && STATEHOOD[t.st] && cyr(t.a) < STATEHOOD[t.st]), congress, 'B');
add('congress-demographics', 'multi-state', 'Name a member of Congress who represented two or more different states', p => new Set(p.terms.filter(t => t.real).map(t => t.st)).size >= 2, congress, 'B');
add('congress-demographics', 'house-then-senate', 'Name a U.S. senator who earlier served in the U.S. House', p => { const s = p.terms.find(t => t.ch === 'S'), h = p.terms.find(t => t.ch === 'H'); return !!(s && h && h.a < s.a); }, congress, 'B');
add('congress-demographics', 'house-then-senate', 'Name a member of Congress who served in the Senate first and the House later', p => { const s = p.terms.find(t => t.ch === 'S'), h = p.terms.filter(t => t.ch === 'H').pop(); return !!(s && h && h.a > s.b); }, congress, 'B');
add('congress-demographics', 'died-in', 'Name a member of Congress who died while in office, 1789 to 1900', p => p.m && p.m.tags.includes('diedinoffice') && p.terms.length && cyr(p.terms[p.terms.length - 1].b) <= 1900 && cyr(p.terms[p.terms.length - 1].b) === +p.m.died, congress, 'B');

// ---- governors
add('governors', 'gov', 'Name a governor of a U.S. state who also served in the U.S. House', p => isGov(p) && hasCh('H')(p), people, 'B');
add('governors', 'gov', 'Name a governor of a U.S. state who also served in the U.S. Senate', p => isGov(p) && hasCh('S')(p), people, 'B');
add('governors', 'gov', 'Name a governor of a U.S. state who served in the U.S. House but never in the Senate', p => isGov(p) && hasCh('H')(p) && !hasCh('S')(p), people, 'B');
add('governors', 'gov', 'Name a governor of a U.S. state who served as governor before any seat in Congress', p => isGov(p) && p.terms.length > 0 && Math.min(...p.gov.map(g => +g.from)) < cyr(p.terms[0].a), people, 'B');
add('governors', 'gov', 'Name a governor of a U.S. state who served in Congress before becoming governor', p => isGov(p) && p.terms.length > 0 && cyr(p.terms[0].a) < Math.min(...p.gov.map(g => +g.from)), people, 'B');
for (const r of ['West']) for (const pt of ['Democratic', 'Republican', null]) add('governors', 'gov-region', `Name ${pt ? 'a ' + pt : 'a'} governor of a Western state (past or present; Census Bureau regions)`, p => p.gov.some(g => REGION[g.place] === r && (!pt || g.party === pt)), people, 'A');
for (const [a, b] of [[1776, 1825], [1826, 1875], [1876, 1925], [1926, 1975], [1976, 2026]]) for (const pt of ['Democratic', 'Republican']) add('governors', 'gov-era-party', `Name a ${pt} governor of a U.S. state who served at some point between ${a} and ${b}`, p => p.gov.some(g => g.party === pt && +g.from <= b && (g.to ? +g.to : 2026) >= a), people, 'B');
for (const [a, b] of [[1776, 1825], [1826, 1875], [1876, 1925], [1926, 1975], [1976, 2026]]) add('governors', 'gov-era', `Name a governor of a U.S. state who served at some point between ${a} and ${b}`, p => p.gov.some(g => +g.from <= b && (g.to ? +g.to : 2026) >= a), people, 'B');
add('governors', 'gov', 'Name a Democratic governor of a U.S. state who also served in Congress', p => isGov(p) && p.terms.length > 0 && p.gov.some(g => g.party === 'Democratic'), people, 'B');
add('governors', 'gov', 'Name a Republican governor of a U.S. state who also served in Congress', p => isGov(p) && p.terms.length > 0 && p.gov.some(g => g.party === 'Republican'), people, 'B');
add('governors', 'gov', 'Name a governor of a U.S. state who also served as a Cabinet department head', p => isGov(p) && isCab(p), people, 'B');

// ---- Cabinet by president's party and by era
const ADMIN_PARTY = { 'Trump': 'R', 'Biden': 'D', 'Clinton': 'D', 'G.H.W. Bush': 'R', 'G.W. Bush': 'R', 'Reagan': 'R', 'Obama': 'D', 'Nixon': 'R', 'Carter': 'D', 'Kennedy': 'D', 'Truman': 'D', 'Ford': 'R', 'L. Johnson': 'D', 'Eisenhower': 'R', 'Wilson': 'D', 'Harding': 'R', 'F. Roosevelt': 'D', 'Hoover': 'R', 'Coolidge': 'R', 'T. Roosevelt': 'R', 'McKinley': 'R', 'Taft': 'R', 'Cleveland': 'D', 'Garfield': 'R', 'B. Harrison': 'R', 'Arthur': 'R', 'Hayes': 'R', 'Grant': 'R', 'Lincoln': 'R', 'Buchanan': 'D', 'Pierce': 'D', 'Polk': 'D', 'Jackson': 'D', 'Van Buren': 'D' };
const cabParty = (p, pt) => p.cab.some(r => ADMIN_PARTY[r.admin] === pt);
add('cabinet', 'cab-party', 'Name a head of a Cabinet department under a Republican president (1861 to 2026)', p => isCab(p) && cabParty(p, 'R'), people, 'B');
add('cabinet', 'cab-party', 'Name a head of a Cabinet department under a Democratic president (1829 to 2026)', p => isCab(p) && cabParty(p, 'D'), people, 'B');
for (const [a, b] of [[1789, 1860], [1861, 1912], [1913, 1960], [1961, 1992], [1993, 2026]]) add('cabinet', 'cab-era', `Name a head of a U.S. Cabinet department whose service began between ${a} and ${b}`, p => isCab(p) && p.cab.some(r => +r.from >= a && +r.from <= b), people, 'B');
add('cabinet', 'cab-big', 'Name a U.S. Secretary of State, Secretary of the Treasury, Secretary of War or Defense, or Attorney General', p => p.cab.some(r => /^(Secretary of (State|the Treasury|War|Defense)|Attorney General)$/.test(r.office)) && isCab(p), people, 'B');
add('cabinet', 'cab-big', 'Name a U.S. Secretary of the Interior, Agriculture, Commerce, Labor, the Navy or Postmaster General', p => p.cab.some(r => /^(Secretary of (the Interior|Agriculture|Commerce|Labor|the Navy)|Postmaster General)$/.test(r.office)) && isCab(p), people, 'B');
add('cabinet', 'cab-sen', 'Name a Cabinet department head who had served in the U.S. Senate', p => isCab(p) && hasCh('S')(p), people, 'B');
add('cabinet', 'cab-sen', 'Name a Cabinet department head who had served in the U.S. House', p => isCab(p) && hasCh('H')(p), people, 'B');
add('cabinet', 'cab-sen', 'Name a Cabinet department head who had served as a governor', p => isCab(p) && isGov(p), people, 'B');
const WH = /^(White House Chief of Staff|White House Press Secretary|White House Communications Director|National Security Advisor|White House Counsel)$/;
add('political-staff', 'wh-staff', 'Name a White House Chief of Staff, Press Secretary, Communications Director, National Security Advisor or White House Counsel (any administration)', p => p.roles.some(r => WH.test(r.office)), people, 'B');
const MAYSETS = [
  ['New York City, Los Angeles, Chicago, Philadelphia or Boston', ['New York City', 'Los Angeles', 'Chicago', 'Philadelphia', 'Boston']],
  ['San Francisco, Los Angeles, San Diego, San Jose, Oakland, Seattle or Portland', ['San Francisco', 'Los Angeles', 'San Diego', 'San Jose', 'Oakland', 'Seattle', 'Portland']],
  ['Chicago, Detroit, Cleveland, Milwaukee, Cincinnati, St. Louis, Minneapolis, Indianapolis, Columbus or Kansas City', ['Chicago', 'Detroit', 'Cleveland', 'Milwaukee', 'Cincinnati', 'St. Louis', 'Minneapolis', 'Indianapolis', 'Columbus', 'Kansas City']],
  ['Atlanta, Houston, Dallas, Miami, New Orleans, Nashville, Charlotte, Jacksonville, Louisville, Memphis or San Antonio', ['Atlanta', 'Houston', 'Dallas', 'Miami', 'New Orleans', 'Nashville', 'Charlotte', 'Jacksonville', 'Louisville', 'Memphis', 'San Antonio']],
  ['Houston, Dallas, San Antonio, Austin, Fort Worth or El Paso', ['Houston', 'Dallas', 'San Antonio', 'Austin', 'Fort Worth', 'El Paso']],
  ['Baltimore, Pittsburgh, Buffalo, Newark, Washington, D.C., Boston or Philadelphia', ['Baltimore', 'Pittsburgh', 'Buffalo', 'Newark', 'Washington, D.C.', 'Boston', 'Philadelphia']]
];
MAYSETS.forEach(([lab, cities]) => add('mayors', 'mayor-grp', `Name a mayor of ${lab}`, p => p.mayor.some(r => cities.includes(r.place) && r.from), people, 'B'));
add('mayors', 'mayor-grp', 'Name a mayor of New York City', p => p.mayor.some(r => r.place === 'New York City' && r.from), people, 'B');

// ---- education, military service and careers, re-confirmed from the raw Wikidata labels (anchored patterns so look-alikes do not match)
const EDU = {
  columbia: ['Columbia University', l => /^(Columbia University|Columbia Law School|Columbia College$|Columbia Business School|Columbia Graduate School)/.test(l) && !/Columbia Union|Columbia Basin|Columbia College (Chicago|Hollywood|Missouri)/.test(l)],
  penn: ['the University of Pennsylvania (including the Wharton School)', l => /^(University of Pennsylvania|The Wharton School|Wharton School|Perelman School of Medicine)/.test(l) && !/Pennsylvania State/.test(l)],
  michigan: ['the University of Michigan', l => /^University of Michigan( Law School| Medical School| Law| Ross)?$/.test(l) || /^University of Michigan (Law School|Medical School)/.test(l)],
  uva: ['the University of Virginia', l => /^University of Virginia( School of Law| School of Medicine)?$/.test(l)],
  georgetown: ['Georgetown University', l => /^Georgetown University/.test(l) || /^Georgetown Law/.test(l)],
  dartmouth: ['Dartmouth College', l => /^(Dartmouth College|Tuck School of Business|Thayer School of Engineering|Geisel School of Medicine)/.test(l)],
  gwu: ['George Washington University', l => /^(George Washington University|Columbian College|Columbian University)/.test(l)],
  unc: ['the University of North Carolina at Chapel Hill', l => /^(University of North Carolina at Chapel Hill|University of North Carolina School of Law|University of North Carolina$)/.test(l)],
  hls: ['Harvard Law School', l => /^Harvard Law School$/.test(l)],
  wm: ['the College of William & Mary', l => /^(College of William (&|and) Mary|William & Mary Law School)/.test(l)],
  stanford: ['Stanford University', l => /^Stanford (University|Law School)/.test(l)],
  academy: ['a U.S. service academy (West Point, the Naval Academy, the Air Force Academy or the Coast Guard Academy)', l => /^(United States Military Academy|United States Naval Academy|United States Air Force Academy|United States Coast Guard Academy)$/.test(l)]
};
Object.entries(EDU).forEach(([k, [lab, re]]) => add('congress-education', 'edu', `Name a member of Congress who attended ${lab}`, p => labs(p, 'P69').some(re), congress, 'B'));
const bY = p => (p.m && p.m.born) ? +p.m.born : null;   // birth year (a conflict tag is believed only if the person was old enough)
const MILS = {
  ww2: ['served in World War II', p => bY(p) >= 1885 && bY(p) <= 1927 && labs(p, 'P607').some(l => /^World War II$/.test(l))],
  ww1: ['served in World War I', p => bY(p) >= 1860 && bY(p) <= 1900 && labs(p, 'P607').some(l => /^World War I$/.test(l))],
  cw: ['served in the Union or Confederate army during the Civil War', p => bY(p) >= 1790 && bY(p) <= 1850 && (labs(p, 'P607').some(l => /^American Civil War$/.test(l)) || labs(p, 'P241').some(l => /^(Union Army|Confederate States Army|Provisional Army of the Confederate States)$/.test(l)))],
  navy: ['served in the U.S. Navy or U.S. Navy Reserve', p => labs(p, 'P241').some(l => /^(United States Navy|United States Navy Reserve|Continental Navy)$/.test(l))],
  early: ['fought in the War of 1812, the Mexican-American War or the Spanish-American War', p => bY(p) >= 1760 && bY(p) <= 1882 && labs(p, 'P607').some(l => /^(War of 1812|Mexican.American War|Spanish.American War)$/.test(l))]
};
Object.entries(MILS).forEach(([k, [lab, f]]) => add('congress-military', 'mil', `Name a member of Congress who ${lab}`, f, congress, 'B'));
const OCC = {
  journalist: ['worked as a journalist, reporter or newspaper editor', /^(journalist|newspaper editor|editor-in-chief|columnist|reporter|newspaper publisher|war correspondent|news presenter|broadcast journalist|correspondent|foreign correspondent)$/i],
  diplomat: ['served as a U.S. ambassador', /^ambassador$/i],
};
Object.entries(OCC).forEach(([k, [lab, re]]) => add('congress-careers', 'occ', `Name a member of Congress who ${lab}`, k === 'diplomat' ? (p => labs(p, 'P39').some(l => /^(United States |U.S. )Ambassador to|^ambassador of the United States|^United States Ambassador/i.test(l)) || p.roles.some(r => /Ambassador/.test(r.office))) : (p => labs(p, 'P106').some(l => re.test(l))), congress, 'B'));   // an ambassador = a Wikidata "ambassador of the United States to X" position or an Ambassador role (the generic occupation label also sits on non-ambassadors)
add('congress-careers', 'occ', 'Name a member of Congress who had served as a mayor', p => (p.m && p.m.tags.includes('mayor')) || isMayor(p) || labs(p, 'P106').some(l => /^mayor$/i.test(l)), congress, 'B');

// ---- careers that span two periods
add('congress-history', 'span', 'Name a member of Congress who served in both the 1800s (1800 to 1899) and the 1900s (1900 to 1999)', p => served(1800, 1899)(p) && served(1900, 1999)(p), congress, 'B');
add('congress-history', 'span', 'Name a member of Congress who served in both the 1900s (1900 to 1999) and the 2000s (2000 to 2099)', p => served(1900, 1999)(p) && served(2000, 2099)(p), congress, 'B');

// ---- state of birth (Wikidata place of birth followed up to a U.S. state; people-db/cache/dh2-birthstate.json, made by tools/fetch-dh2-birthstates.js)
const BSF = path.join(ROOT, 'people-db', 'cache', 'dh2-birthstate.json');
if (fs.existsSync(BSF)) {
  const BS = readJ(BSF), NAME2ABBR = {}; STATES.forEach(s => { NAME2ABBR[STATE_NAME[s]] = s; });
  const birthState = p => { const pl = BS.places[p.id]; const r = pl && BS.resolved[pl]; if (!r || r.length !== 1) return null; return NAME2ABBR[BS.states[r[0]]] || null; };
  congress.forEach(p => { p.bs = birthState(p); });
  const BS_FIX = { L000270: 'VT' };   // Abner Lewis: Wikidata's place of birth is a New York "Wells", Wikipedia says Wells, Vermont (found in the Wikipedia check)
  congress.forEach(p => { if (BS_FIX[p.id]) p.bs = BS_FIX[p.id]; });
  const bsCount = countBy(p => p.bs, congress);
  STATES.filter(s => (bsCount[s] || 0) >= 120).forEach(s => {
    add('political-figures', 'born-in', `Name a member of Congress who was born in ${STATE_NAME[s]} (the state it is today)`, p => p.bs === s, congress, 'B');
    add('political-figures', 'born-in-away', `Name a member of Congress who was born in ${STATE_NAME[s]} but represented a different state`, p => p.bs === s && p.terms.some(t => t.real && t.st !== s) && !p.terms.some(t => t.real && t.st === s), congress, 'B');
  });
  GROUPS.forEach(([k, lab, ss]) => { const set = new Set(ss.split(' ')); add('political-figures', 'born-in-grp', `Name a member of Congress who was born in ${lab}`, p => set.has(p.bs), congress, 'B'); });
  add('political-figures', 'born-in-away', 'Name a member of Congress who represented a different state from the one where they were born', p => !!p.bs && p.terms.some(t => t.real) && !p.terms.some(t => t.real && t.st === p.bs), congress, 'B');
}

// ---------------------------------------------------------------- evaluate, dedupe against every existing bank, select
const DATA_DIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const existing = [];   // {bank, prompt, names:Set}
fs.readdirSync(DATA_DIR).filter(f => /^bank-.+\.json$/.test(f) && !/^bank-derived2-/.test(f)).forEach(f => {
  readJ(path.join(DATA_DIR, f)).questions.forEach(q => existing.push({ bank: f, prompt: q.prompt, names: new Set(q.answers.map(a => norm(a.name))) }));
});
const jac = (A, B) => { let i = 0; for (const x of A) if (B.has(x)) i++; return { j: i / (A.size + B.size - i), c: i / Math.min(A.size, B.size), i }; };
const overlapsWith = (names, pool) => { for (const q of pool) { if (jac(names, q.names).j > 0.8) return q; } return null; };
const evald = specs.map(s => {
  const list = s.universe.filter(s.filter);
  const names = new Set(list.map(p => norm(dispName(p))));
  const n123 = [...new Set(list.filter(p => p.w <= 3).map(p => norm(dispName(p))))].length;
  return Object.assign({}, s, { list, n: names.size, names, n123 });
});
if (ARGS.includes('--probe')) {   // --probe <prompt substring> <name1;name2;...> : is each named person in the answer list of that question?
  const sub = ARGS[ARGS.indexOf('--probe') + 1], nm = ARGS[ARGS.indexOf('--probe') + 2].split(';');
  evald.filter(e => e.prompt.includes(sub)).forEach(e => { console.log(e.prompt.slice(0, 120), e.n); nm.forEach(x => { const t = norm(x).split(' '); const hit = [...e.names].find(n => { const u = n.split(' '); return u[0] === t[0] && u[u.length - 1] === t[t.length - 1]; }); const inAll = people.some(p => { const u = norm(dispName(p)).split(' '); return u[0] === t[0] && u[u.length - 1] === t[t.length - 1]; }); console.log('   ', x, hit ? 'IN' : (inAll ? 'OUT (person is in data)' : 'not in data')); }); });
  process.exit(0);
}
if (REPORT) {
  evald.forEach(e => {
    const dup = e.n >= MIN && e.n <= MAX ? overlapsWith(e.names, existing) : null;
    console.log((e.n >= MIN && e.n <= MAX ? (dup ? 'DUP ' : 'OK  ') : 'no  ') + String(e.n).padStart(6) + String(e.n123).padStart(5) + '  ' + e.cls + ' ' + e.fam.padEnd(14) + e.prompt.slice(0, 150) + (dup ? '   <= ' + dup.prompt.slice(0, 60) : ''));
  });
  process.exit(0);
}

// ---- selection: size window, playability, no overlap (Jaccard > 0.8) with an existing bank or an earlier pick, then family caps (evenly spaced picks)
const MIN_FAMOUS = 8;   // at least this many answers a well-read player can name (weight 1-3), or the question is unplayable
const CAPS2 = { grp: 9, 'grp-s': 7, 'grp-h': 2, 'grp-party': 6, 'grp-era': 6, 'grp-gov': 8, state: 30, 'state-h': 0, 'state-party': 8, 'state-era': 6, cong: 22, first: 8, born: 10, died: 14, decade: 4, 'decade-s': 5, 'decade-h': 2, 'gov-born': 5, 'gov-decade': 4,
  'era-s': 8, 'era-party-s': 8, 'era-party-h': 3, 'era-party': 3, 'era-h': 3, pres: 5, 'pres-h': 4, 'pres-s': 4, 'gov-initial': 6, 'initial-s': 6, initial: 9, 'first-name': 12, 'first-name-s': 3, surname: 7, 'women-era': 2, 'gov-era-party': 6, 'gov-era': 3, mil: 6, occ: 7, edu: 10, 'born-in': 24, 'born-in-away': 8, 'born-in-grp': 4, span: 3 };
const capOf2 = f => CAPS2[f] != null ? CAPS2[f] : 999;
const cand = [];
for (const e of evald) {
  if (e.n < MIN || e.n > MAX) { e.dropped = 'size ' + e.n; continue; }
  if (e.n123 < MIN_FAMOUS) { e.dropped = 'unplayable: only ' + e.n123 + ' well-known answers'; continue; }
  const dup = overlapsWith(e.names, existing); if (dup) { e.dropped = 'overlaps an existing question: ' + dup.prompt.slice(0, 80); continue; }
  const d2 = overlapsWith(e.names, cand); if (d2) { e.dropped = 'overlaps an earlier pick: ' + d2.prompt.slice(0, 80); continue; }
  cand.push(e);
}
const byFam2 = {}; cand.forEach(e => (byFam2[e.fam] = byFam2[e.fam] || []).push(e));
const chosen2 = new Set();
Object.entries(byFam2).forEach(([f, arr]) => {
  const k = capOf2(f);
  if (arr.length <= k) arr.forEach(e => chosen2.add(e));
  else for (let i = 0; i < k; i++) chosen2.add(arr[Math.floor((i + 0.5) * arr.length / k)]);
});
cand.forEach(e => { if (!chosen2.has(e)) e.dropped = 'thinned (family cap ' + capOf2(e.fam) + ')'; });
const final = cand.filter(e => chosen2.has(e));
if (ARGS.includes('--select')) {
  final.forEach(e => console.log(String(e.n).padStart(6) + String(e.n123).padStart(5) + ' ' + e.cls + ' ' + e.fam.padEnd(13) + e.prompt.slice(0, 140)));
  console.log('selected', final.length);
  const fc = {}; final.forEach(e => fc[e.fam] = (fc[e.fam] || 0) + 1); console.log(JSON.stringify(fc));
  process.exit(0);
}

// ---------------------------------------------------------------- build questions
// jackpot note (a true, neutral fact about the person, shown after the answer): office, state and years
function jackNote2(p, kind) {
  if (p.m && p.m.current) return null;
  const nm = dispName(p);
  if (kind === 'wh-staff') { const r = p.roles.filter(r => WH.test(r.office) && r.from && r.to); return r.length === 1 ? `${nm} held the post of ${r[0].office} from ${r[0].from} to ${r[0].to}.` : null; }
  if (kind.startsWith('cab')) { const c = p.cab; return c.length === 1 && c[0].to ? nm + ' was U.S. ' + c[0].office + ' from ' + c[0].from + ' to ' + c[0].to + '.' : null; }
  if (/gov/.test(kind)) { const g = p.gov; if (g.length === 1 && g[0].to && STATE_NAME[g[0].place]) return nm + ' was governor of ' + STATE_NAME[g[0].place] + ' from ' + g[0].from + ' to ' + g[0].to + '.'; return memberNote(p); }
  if (kind.startsWith('mayor')) { const r = p.mayor; return r.length === 1 ? nm + ' was mayor of ' + r[0].place + '.' : null; }   // mayor dates in the source are unreliable, so the note has no years
  return memberNote(p);
}
// jackpot (Dark Horse) rules, round 2: the question's date window must hold with every term shortened by 300 days at each end (nominal term ends in the source can be a year or more too late:
// J. Battin is listed to 1971, he left in 1969), the note names no years for members of Congress, and persons found wrong in the audit are excluded
const SHRINK2 = 300 * DAY;
function robust2(p, filter) {
  const terms = p.terms.map(t => Object.assign({}, t, { a: t.a + SHRINK2, b: t.b - SHRINK2 })).filter(t => t.b > t.a);
  if (p.terms.length && !terms.length) return false;
  return filter(Object.assign({}, p, { terms }));
}
const JACK_EXCLUDE = new Set([]);   // person ids whose jackpot note or qualification failed the Wikipedia check (filled from audit/dh-derived2-sources.csv findings)
function memberNote(p) {
  if (!p.terms.length || (p.m && p.m.current)) return null;
  const chs = [...new Set(p.terms.map(t => t.ch))], sts = [...new Set(p.terms.map(t => t.st))];
  if (sts.length !== 1 || !STATE_NAME[sts[0]]) return null;
  const nm = dispName(p), where = chs.length === 2 ? 'House and the Senate' : chs[0] === 'S' ? 'Senate' : 'House';
  return nm + ' represented ' + STATE_NAME[sts[0]] + ' in the U.S. ' + where + (p.terms.length === 1 ? ' for a single term' : '') + '.';
}
const questions = final.map((e, i) => {
  const id = 'derived2-' + String(i + 1).padStart(4, '0');
  const answers = buildAnswers(e.list);
  const ok = answers.filter(a => a.weight === 5 && a._it.ps.length === 1 && !JACK_EXCLUDE.has(a._it.p.id) && robust2(a._it.p, e.filter)).map(a => ({ a, note: jackNote2(a._it.p, e.fam) })).filter(x => x.note);
  if (ok.length) { ok.sort((x, y) => hashStr(id + x.a.name) - hashStr(id + y.a.name)); ok[0].a.jackpot = true; ok[0].a.note = ok[0].note; }
  const n123 = answers.filter(a => a.weight <= 3).length;
  const base = n123 >= 60 ? 1 : n123 >= 15 ? 2 : 3;
  const difficulty = e.cls === 'A' ? base : e.cls === 'B' ? Math.max(base, 2) : (n123 >= 100 ? 2 : 3);
  return { id, category: e.cat, prompt: e.prompt, difficulty, answers, _fam: e.fam, _n123: n123 };
});

// ---------------------------------------------------------------- write banks (split near 2.3 MB, limit 2.5 MB each)
const clean = q => ({ id: q.id, category: q.category, prompt: q.prompt, difficulty: q.difficulty, answers: q.answers });
const LIM = 2300000, files = [];
let cur = [], sz = 0;
questions.forEach(q => {
  const s = JSON.stringify(clean(q)).length;
  if (sz + s > LIM && cur.length) { files.push(cur); cur = []; sz = 0; }
  cur.push(q); sz += s;
});
if (cur.length) files.push(cur);
require('./dh-bank-guard')(OUT, /^bank-derived2-\d+\.json$/, 'build-dh-derived-2.js');
const written = [];
fs.mkdirSync(OUT, { recursive: true });
files.forEach((qs, i) => {
  const name = 'bank-derived2-' + (i + 1) + '.json';
  fs.writeFileSync(path.join(OUT, name), JSON.stringify({ bank: 'derived2-' + (i + 1), questions: qs.map(clean) }));
  written.push(name);
});
for (let i = files.length + 1; fs.existsSync(path.join(OUT, 'bank-derived2-' + i + '.json')); i++) fs.unlinkSync(path.join(OUT, 'bank-derived2-' + i + '.json'));
const AUD = ARGS.includes('--out') ? OUT : path.join(ROOT, 'audit');   // trial runs into --out keep their audit lists there (answer agent 2026-11-12)
fs.writeFileSync(path.join(AUD, 'dh-derived2-questions.tsv'), ['id\tcategory\tfamily\tdifficulty\tanswers\twell_known\tprompt'].concat(questions.map(q => [q.id, q.category, q._fam, q.difficulty, q.answers.length, q._n123, q.prompt].join('\t'))).join('\n') + '\n');
fs.writeFileSync(path.join(AUD, 'dh-derived2-dropped.tsv'), ['reason\tprompt'].concat(evald.filter(e => e.dropped).map(e => e.dropped + '\t' + e.prompt)).join('\n') + '\n');

// ---------------------------------------------------------------- stats
const dist = {}, wd = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, cats = {}, diff = { 1: 0, 2: 0, 3: 0 };
let jp = 0, tot = 0;
questions.forEach(q => {
  const b = q.answers.length < 200 ? '150-199' : q.answers.length < 300 ? '200-299' : q.answers.length < 500 ? '300-499' : q.answers.length < 1000 ? '500-999' : q.answers.length < 2000 ? '1000-1999' : '2000-5000';
  dist[b] = (dist[b] || 0) + 1; cats[q.category] = (cats[q.category] || 0) + 1; diff[q.difficulty]++;
  q.answers.forEach(a => { wd[a.weight]++; tot++; if (a.jackpot) jp++; });
});
const ns = questions.map(q => q.answers.length).sort((a, b) => a - b);
const fam2 = {}; questions.forEach(q => fam2[q._fam] = (fam2[q._fam] || 0) + 1);
console.log(JSON.stringify({ questions: questions.length, answers: tot, jackpots: jp, files: written, median: ns[ns.length >> 1], min: ns[0], max: ns[ns.length - 1], dist, cats, diff, weights: wd, families: fam2 }));

if (ARGS.includes('--sample')) {   // --sample N : deterministic stratified sample of answers (every question gets some) for manual verification; written to the scratch dir given by --sample-out
  const N = +ARGS[ARGS.indexOf('--sample') + 1] || 300, outf = ARGS.includes('--sample-out') ? ARGS[ARGS.indexOf('--sample-out') + 1] : path.join(AUD, 'dh-derived2-sample-candidates.tsv');
  let seed = 20261112; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const rows = ['id\tprompt\tanswer\tweight\twikipedia\twikidata\tfacts']; const seen = new Set();
  const addRow = (q, a) => {
    const p = a._it.p; const facts = [];
    if (p.terms.length) facts.push(p.terms.map(t => (t.ch === 'S' ? 'Sen ' : 'Rep ') + t.st + ' ' + t.party + ' ' + new Date(t.a).toISOString().slice(0, 10) + '..' + new Date(t.b).toISOString().slice(0, 10)).join('; '));
    if (p.gov.length) facts.push('Gov ' + p.gov.map(g => g.place + ' ' + g.from + '-' + g.to + ' ' + (g.party || '')).join('; '));
    if (p.mayor.length) facts.push('Mayor ' + p.mayor.map(g => g.place + ' ' + g.from + '-' + g.to).join('; '));
    if (p.cab.length) facts.push('Cabinet ' + p.cab.map(g => g.office + ' ' + g.from + '-' + g.to + ' ' + g.admin).join('; '));
    facts.push('born ' + p.p.born + ' died ' + (p.m ? p.m.died : '') + (a.jackpot ? ' JACKPOT: ' + a.note : ''));
    rows.push([q.id, q.prompt.slice(0, 160), a.name, a.weight, (p.leg && p.leg.id.wikipedia) || '', p.wd || '', facts.join(' | ')].join('\t'));
  };
  // round 1: every question gets 1 answer of each weight tier present (stratified by weight), then random fill
  for (const q of questions) for (const w of [5, 0]) { const pool = q.answers.filter(a => (w === 0 ? a.weight <= 4 : a.weight === w) && !seen.has(a._it.p.id)); if (!pool.length) continue; const a = pool[Math.floor(rnd() * pool.length)]; seen.add(a._it.p.id); addRow(q, a); }
  while (rows.length <= N) { const q = questions[Math.floor(rnd() * questions.length)], a = q.answers[Math.floor(rnd() * q.answers.length)]; if (seen.has(a._it.p.id)) continue; seen.add(a._it.p.id); addRow(q, a); }
  if (ARGS.includes('--extra-fams')) { const fams = ARGS[ARGS.indexOf('--extra-fams') + 1].split(','), per = +ARGS[ARGS.indexOf('--extra-n') + 1] || 10; questions.filter(q => fams.includes(q._fam)).forEach(q => { let k = 0, tries = 0; while (k < per && tries++ < 200) { const a = q.answers[Math.floor(rnd() * q.answers.length)]; if (seen.has(a._it.p.id)) continue; seen.add(a._it.p.id); addRow(q, a); k++; } }); }
  if (ARGS.includes('--all-jackpots')) questions.forEach(q => q.answers.filter(a => a.jackpot).forEach(a => { if (!seen.has('J' + a._it.p.id + q.id)) { seen.add('J' + a._it.p.id + q.id); addRow(q, a); } }));
  fs.writeFileSync(outf, rows.join('\n') + '\n');
}

if (ARGS.includes('--dump-fame')) {   // people in the final banks whose weight comes from the structural prior (no cached page views): used by the fame audit (measure 60-day Wikipedia views)
  const seenP = new Map();
  const PLAUS = /^(speaker|leader|ppt|vp|president|cabinet|governor|athlete|entertainer|astronaut|nobel|pulitzer|medalofhonor|medaloffreedom|scotus|framer|revwar|mayor|ltgov|diplomat|journalist)$/;
  people.forEach(p => { const plaus = isGov(p) || isMayor(p) || isCab(p) || p.roles.some(r => WH.test(r.office)) || (p.terms.length && (yrs(p) >= 10 || (hasCh('S')(p) && yrs(p) >= 6) || (p.m && p.m.tags.some(t => PLAUS.test(t))))); if (plaus && !seenP.has(p.id)) seenP.set(p.id, p); });
  const rowsF = [...seenP.values()].map(p => ({ id: p.id, name: dispName(p), w: p.w, fame: p.fame, cached: !!(p.wd && fame.views[p.wd] != null), title: (p.leg && p.leg.id.wikipedia) || '', qid: p.wd || '' }));
  fs.writeFileSync(ARGS[ARGS.indexOf('--dump-fame') + 1], JSON.stringify(rowsF));
  console.log('fame dump', rowsF.length, 'uncached', rowsF.filter(r => !r.cached).length);
}
