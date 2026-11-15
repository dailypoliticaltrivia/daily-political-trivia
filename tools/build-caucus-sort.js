#!/usr/bin/env node
/*
 * Caucus Sort: puzzle generator.
 *
 *   node site/tools/build-caucus-sort.js            (from the project root; paths are resolved relative to this file)
 *   options: --count 450   number of puzzles (default 450, minimum 400)
 *            --site-only   only use photos already in site/games/congressional-grid/photos/ (old behaviour). By default the
 *                          root photos/ folder (the master copy) is used and every face a puzzle uses is copied into the
 *                          site folder after the build, so no image can be missing online.
 *            --keep-through YYYY-MM-DD   keep the puzzles that the game shows up to and including this date exactly as they
 *                          are in the current puzzles.json (default: today + 14 days); only later puzzles are regenerated.
 *                          The game picks puzzle (days since 2026-11-11) mod count, so puzzle k (0-based) is shown on day k.
 *                          --keep-through none regenerates everything.
 *            --list        also print the full rule report to the console
 *
 * Inputs : data/members.js, data/presidents.js (always)
 *          people-db/people.json (optional, used automatically when present)
 * Outputs: site/games/caucus-sort/data/puzzles.json
 *          site/tools/caucus-sort-rules-report.txt   (every rule with its member count and the most famous members)
 *
 * Deterministic and idempotent: the same inputs always give the same puzzles.
 *
 * Every puzzle = 4 groups of 4 (difficulty 1 yellow, 2 green, 3 blue, 4 purple). The generator VERIFIES that each of the
 * 16 people satisfies exactly one of the puzzle's 4 rules, that no person or name repeats, and that every photo file exists.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOOLS = __dirname;
const SITE = path.resolve(TOOLS, '..');
const ROOT = path.resolve(SITE, '..');
const GAME = path.join(SITE, 'games', 'caucus-sort');
const PHOTOS_SITE = path.join(SITE, 'games', 'congressional-grid', 'photos');
const PHOTOS_ROOT = path.join(ROOT, 'photos');
const ARGS = process.argv.slice(2);
const argVal = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const COUNT = Math.max(400, parseInt(argVal('--count', '450'), 10) || 600);
const ALLOW_ROOT = !ARGS.includes('--site-only');
const DRY = ARGS.includes('--dry');   // --dry: build and print the stats, write nothing (no puzzles.json, no report, no photo copies)

const STATES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'the District of Columbia',PR:'Puerto Rico',GU:'Guam',VI:'the U.S. Virgin Islands' };
const STATE_BY_NAME = {};
Object.keys(STATES).forEach(k => { STATE_BY_NAME[STATES[k].toLowerCase().replace(/^the /, '')] = k; });
const stateCode = s => {
  if (!s) return null; s = String(s).trim();
  if (STATES[s.toUpperCase()] && s.length === 2) return s.toUpperCase();
  return STATE_BY_NAME[s.toLowerCase().replace(/^the /, '')] || null;
};

// ---------------------------------------------------------------- load sources
function loadWindowFile(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.window;
}
const W = Object.assign({}, loadWindowFile(path.join(ROOT, 'data', 'members.js')), loadWindowFile(path.join(ROOT, 'data', 'presidents.js')));
const MEMBERS = W.MEMBERS, PRESIDENTS = W.PRESIDENTS;
const DB_FILE = path.join(ROOT, 'people-db', 'people.json');
const DB = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : null;

const siteHas = new Set(fs.readdirSync(PHOTOS_SITE));
const rootHas = fs.existsSync(PHOTOS_ROOT) ? new Set(fs.readdirSync(PHOTOS_ROOT)) : new Set();
let pendingPhotos = 0;
const photoOk = file => {
  if (!file) return false;
  if (siteHas.has(file)) return true;
  if (rootHas.has(file)) { pendingPhotos++; return ALLOW_ROOT; }
  return false;
};

// ---------------------------------------------------------------- unify people
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const strip = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function nameParts(name) {
  const t = String(name).trim().split(/\s+/);
  let last = t.length - 1;
  while (last > 0 && SUFFIX.test(t[last])) last--;
  const first = t[0];
  return { first: /^[A-Za-zÀ-ɏ'’-]{3,}$/.test(first) ? first : null,
           last: last > 0 && /^[A-Za-zÀ-ɏ'’-]{3,}$/.test(t[last]) ? t[last] : null };
}
const dedupeKey = (name, born) => {
  const t = strip(name).toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(x => x && x.length > 1 && !SUFFIX.test(x));
  return t[0] + '|' + t[t.length - 1] + '|' + (born || '');
};
const displayName = (name, isPres) => {
  if (isPres) return name;
  return String(name).replace(/\s+[A-Z]\.(?=\s)/g, '').replace(/\s+/g, ' ').trim();
};
const normParty = s => {
  s = String(s || '');
  if (/^democrat/i.test(s) && !/republican/i.test(s)) return 'Democrat';
  if (/^republican/i.test(s)) return 'Republican';
  return s.trim();
};
const FAME_TAG = { president: 400, vp: 150, scotus: 120, speaker: 100, leader: 70, ppt: 50, cabinet: 60, governor: 20, nobel: 20, medalofhonor: 15, astronaut: 30, athlete: 12, entertainer: 12, diplomat: 8, mayor: 8, ltgov: 5 };

const people = [];   // unified list (only people with a usable photo)
const byKey = new Map();
function addPerson(p) { people.push(p); byKey.set(dedupeKey(p.name, p.born), p); }
const blank = () => ({ id: '', name: '', photo: '', first: null, last: null, born: null, died: null, parties: [], states: [], chambers: [],
  gender: null, firstYear: null, lastYear: null, years: null, current: false, tags: new Set(), roles: [], f: new Set(),
  senStates: [], repStates: [], pres: null, fame: 1, src: '', dbTags: new Set(), serving: false });

// legacy members
const memberById = new Map();
MEMBERS.forEach(m => {
  const file = m.id + '.jpg';
  if (!photoOk(file)) return;
  const p = blank();
  p.id = m.id; p.name = displayName(m.name); p.fullName = m.name; p.photo = file; p.src = 'members';
  Object.assign(p, nameParts(p.name));
  p.born = m.born; p.died = m.died; p.parties = (m.parties || [m.party]).map(normParty); p.states = m.states || [m.state];
  p.chambers = m.chambers || [m.chamber]; p.gender = m.gender; p.firstYear = m.firstYear; p.lastYear = m.lastYear; p.years = m.years; p.current = !!m.current;
  p.congLast = m.lastYear;   // last year IN CONGRESS (p.lastYear later also counts non-congressional offices from people-db roles)
  (m.tags || []).forEach(t => p.tags.add(t));
  const sen = p.chambers.includes('Senate'), hou = p.chambers.includes('House');
  if (p.states.length === 1) { if (sen) p.senStates = p.states.slice(); if (hou) p.repStates = p.states.slice(); }
  else if (p.chambers.length === 1) { if (sen) p.senStates = p.states.slice(); if (hou) p.repStates = p.states.slice(); }
  if (sen) p.f.add('senator'); if (hou) p.f.add('rep');
  p.f.add('congress');
  addPerson(p); memberById.set(m.id, p);
});
// presidents (merge into the member record when they have a bioguide id, else stand-alone)
PRESIDENTS.forEach(r => {
  const m = r.bio && memberById.get(r.bio);
  let p = m;
  if (!p) {
    const file = path.basename(r.photo || '');
    if (!photoOk(file)) return;
    p = blank(); p.id = r.id; p.name = r.name; p.photo = file; p.src = 'presidents';
    Object.assign(p, nameParts(p.name));
    p.born = r.born; p.died = r.died; p.parties = (r.parties || [r.party]).map(normParty); p.states = [r.state]; p.gender = r.gender;
    addPerson(p);
  }
  p.name = r.name; Object.assign(p, nameParts(p.name));  // presidents keep their full formal names
  p.pres = r; p.f.add('president'); p.tags.add('president');
  (r.tags || []).forEach(t => p.tags.add(t));
  if (p.tags.has('vp')) p.f.add('vp');
  if (p.tags.has('governor')) p.f.add('governor');
  if (r.tags.includes('senate')) p.f.add('senator');
  if (r.tags.includes('house')) p.f.add('rep');
  if (r.tags.includes('congress')) p.f.add('congress');
});
// legacy flags from tags
people.forEach(p => {
  if (p.tags.has('vp')) p.f.add('vp');
  if (p.tags.has('scotus')) p.f.add('justice');
  if (p.tags.has('cabinet')) p.f.add('cabinet');
  if (p.tags.has('speaker')) p.f.add('speaker');
  if (p.tags.has('governor')) p.f.add('governor');
  if (p.tags.has('mayor')) p.f.add('mayor');
  if (p.tags.has('president')) p.f.add('president');
});

// people-db
const officeVocab = new Map();
const unmappedTags = new Map();
let dbTotal = 0, dbUsed = 0, dbMerged = 0, dbNoPhoto = 0;
const baseOffice = o => String(o || '').trim().replace(/^(the\s+)?(United States|U\.S\.|US)\s+/i, '');
const OFFICE_FLAGS = [
  ['president', /^President(\s+of the United States)?$/i], ['vp', /^Vice[ -]President(\s+of the United States)?$/i],
  ['justice', /^(Associate Justice|Chief Justice)(\s+of the (United States|Supreme Court.*))?$|^Justice of the Supreme Court/i],
  ['cabinet', /^(Secretary of|Attorney General|Postmaster General)/i], ['speaker', /^Speaker of the (U\.?S\.? )?House/i],
  ['governor', /^Governor/i], ['ltgov', /^Lieutenant Governor/i], ['mayor', /^Mayor/i], ['senator', /Senator/i],
  ['rep', /Representative|Congress(man|woman)|Delegate|Resident Commissioner/i], ['firstlady', /^First (Lady|Gentleman)/i],
];
if (DB && Array.isArray(DB.people)) {
  dbTotal = DB.people.length;
  DB.people.forEach(d => {
    if (!d || !d.name) return;
    const file = d.photo ? path.basename(d.photo) : null;
    if (!photoOk(file)) { dbNoPhoto++; return; }
    const e26 = (d.tags || []).includes('elect-2026');
    const born = d.born ? parseInt(String(d.born).slice(0, 4), 10) || null : null;
    const died = d.died ? parseInt(String(d.died).slice(0, 4), 10) || null : null;
    let p = byKey.get(dedupeKey(d.name, born));
    if (!p && e26) { dbNoPhoto++; return; }   // elect-2026: not yet in office, never used
    if (p) { dbMerged++; } else { p = blank(); p.id = 'db:' + d.id; p.name = displayName(d.name); p.fullName = d.name; p.src = 'db'; p.born = born; p.died = died; addPerson(p); dbUsed++; }
    p.photo = file; p.dbid = d.id; p.wikidata = d.wikidata || null;
    if (p.src === 'db') Object.assign(p, nameParts(p.name));
    if (d.party) { const pp = normParty(d.party); if (pp && !p.parties.includes(pp)) p.parties.push(pp); }
    if (p.src === 'db' || !p.states.length) (d.states || []).forEach(s => { const c = stateCode(s); if (c && !p.states.includes(c)) p.states.push(c); });   // members.js states are authoritative (db 'states' can include a birth state)
    (d.tags || []).forEach(t => p.tags.add(t));
    (d.roles || []).forEach(r => {
      const office = baseOffice(r.office); if (!office) return;
      if ((parseInt(r.from, 10) || 0) > 2026) { (p.elect = p.elect || []).push({ office, place: r.place || null, from: r.from || null, to: null, party: r.party || null }); return; }   // incoming 2027 offices: not in office yet (kept in p.elect: such people are 'arguable' for groups they are about to join)
      const role = { office, place: r.place || null, from: r.from || null, to: r.to || null, admin: r.admin || null, result: r.result || null, party: r.party || null };
      p.roles.push(role);
      officeVocab.set(office, (officeVocab.get(office) || 0) + 1);
      OFFICE_FLAGS.forEach(([f, re]) => { if (re.test(office)) p.f.add(f); });
      const sc = stateCode(r.place);
      if (/Senator/i.test(office) && sc && !p.senStates.includes(sc)) p.senStates.push(sc);
      if (/Representative|Congress(man|woman)/i.test(office) && sc && !p.repStates.includes(sc)) p.repStates.push(sc);
    });
    if (p.f.has('senator') || p.f.has('rep')) p.f.add('congress');
    if (p.f.has('senator') && !p.chambers.includes('Senate')) p.chambers.push('Senate');
    if (p.f.has('rep') && !p.chambers.includes('House')) p.chambers.push('House');
    p.roleCount = p.roles.length;
    // office years from roles (people who are not legacy members have no firstYear/lastYear)
    p.roles.forEach(r => {
      if (/Candidate/i.test(r.office)) return;
      const a = parseInt(r.from, 10), b = r.to ? parseInt(r.to, 10) : (r.to === null ? 2026 : NaN);
      if (a && (p.firstYear == null || a < p.firstYear)) p.firstYear = a;
      const e = b || a; if (e && (p.lastYear == null || e > p.lastYear)) p.lastYear = e;
      if (!r.to && a && a >= 2019 && !/Candidate/i.test(r.office)) p.serving = true;
    });
    (d.tags || []).forEach(t => p.dbTags.add(t));
  });
}
// last year in each chamber (people-db roles; members with one chamber fall back to their last year in Congress)
people.forEach(p => {
  const last = re => p.roles.filter(r => re.test(r.office) && !/Candidate/i.test(r.office)).reduce((a, r) => Math.max(a, (r.to ? parseInt(r.to, 10) : 2026) || 0), 0) || null;
  p.senLast = last(/Senator/i) || (p.chambers.length === 1 && p.chambers[0] === 'Senate' ? p.congLast : null) || (p.chambers.includes('Senate') ? p.congLast : null);
  p.congLast = p.congLast || last(/Senator|Representative|Congress(man|woman)|Delegate|Resident Commissioner/i);
});
// 2026 races not yet called when the data was fetched: the candidate is treated as a possible winner (arguable only). Recheck after certification.
const PENDING_ELECT = { 'Mary Peltola': { office: 'U.S. Senator', place: 'AK', from: '2027', to: null } };   // Alaska Senate ranked-choice count pending (fact-check 2026-11-13)
people.forEach(p => { if (PENDING_ELECT[p.name]) (p.elect = p.elect || []).push(Object.assign({}, PENDING_ELECT[p.name])); });
// p.future: the same person once their 2027 office starts (2026 winners: Letlow and Brown to the Senate, Donalds governor...). Rules treat it as arguable.
people.forEach(p => {
  if (!p.elect || !p.elect.length) return;
  const q = Object.assign({}, p, { roles: p.roles.concat(p.elect), f: new Set(p.f), chambers: p.chambers.slice(), senStates: p.senStates.slice(), repStates: p.repStates.slice(), future: null });
  p.elect.forEach(r => { OFFICE_FLAGS.forEach(([f, re]) => { if (re.test(r.office)) q.f.add(f); }); const sc = stateCode(r.place);
    if (/Senator/i.test(r.office)) { if (!q.chambers.includes('Senate')) q.chambers.push('Senate'); if (sc && !q.senStates.includes(sc)) q.senStates.push(sc); q.senLast = 2027; q.f.add('congress'); }
    if (/Representative/i.test(r.office)) { if (!q.chambers.includes('House')) q.chambers.push('House'); if (sc && !q.repStates.includes(sc)) q.repStates.push(sc); q.f.add('congress'); } });
  p.future = q;
});
// fame proxy
people.forEach(p => {
  let f = 1 + (p.years || 0) * 1.5 + (p.current ? 15 : 0) + (p.roleCount || p.roles.length || 0) * 6;
  p.tags.forEach(t => { f += FAME_TAG[t] || 0; });
  ['president', 'vp', 'justice', 'cabinet', 'speaker', 'governor', 'mayor'].forEach(k => { if (p.f.has(k) && !p.tags.has(k === 'justice' ? 'scotus' : k)) f += (FAME_TAG[k === 'justice' ? 'scotus' : k] || 0); });
  if (p.pres) f += 100;
  p.fame = f;
});
people.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const N = people.length;
// ---------------------------------------------------------------- fame (Wikipedia page views) + eligibility
// Pool = who is worth looking up: anyone in office/serving since 1985, plus all presidents/VPs/justices/speakers/leaders/cabinet/governors of the modern era.
const CACHE_DIR = path.join(ROOT, 'people-db', 'cache');
const FAME_FILE = path.join(CACHE_DIR, 'fame.json');
let FAMECACHE = { titles: {}, views: {} };
try { FAMECACHE = JSON.parse(fs.readFileSync(FAME_FILE, 'utf8')); } catch (e) {}
// Pool = who is worth looking up: modern-era office holders and anyone iconic (presidents, VPs, justices, first ladies, founders).
const POOL_TAGS = ['cabinet', 'cabinet-level', 'whstaff', 'candidate', 'partychair', 'nsa', 'cia', 'un', 'fed', 'doj', 'jcs', 'solgen', 'governor', 'mayor', 'lieutenant-governor'];
const inPool = p => p.wikidata && (p.current || p.pres || p.f.has('vp') || p.f.has('justice') || p.f.has('speaker') || p.tags.has('leader') || p.tags.has('ppt') ||
  p.f.has('firstlady') || p.dbTags.has('founder') || p.dbTags.has('scotus') ||
  ((p.f.has('cabinet') || p.f.has('governor') || p.f.has('mayor') || p.tags.has('nobel') || p.tags.has('astronaut') || p.tags.has('athlete') || p.tags.has('entertainer')) && (p.lastYear || 0) >= 1975) ||
  (POOL_TAGS.some(t => p.dbTags.has(t)) && (p.died == null && (p.born == null || p.born >= 1925) || (p.lastYear || 0) >= 1985)) ||
  ((p.lastYear || 0) >= 1993 && (p.chambers.includes('Senate') || (p.years || 0) >= 16)) ||
  ((p.lastYear || 0) >= 2001 && (p.f.has('congress') || p.f.has('ltgov'))) ||   // added 2026-11-12: recent House members and lieutenant governors (fame still decides)
  (p.died == null && (p.born == null ? (p.lastYear || 0) >= 1975 : p.born >= 1925)));   // round 2, 2026-11-12: every living person with a photo (fame still decides)
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchFame() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const UA = 'DailyPoliticalTrivia-fame/1.0 (static civics site; one request at a time)';
  const pool = people.filter(inPool);
  const now = new Date(), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)), start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const ymd = d => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + '01';
  console.log('fame pool: ' + pool.length + ' people; window ' + ymd(start) + '..' + ymd(end));
  const save = () => fs.writeFileSync(FAME_FILE, JSON.stringify(FAMECACHE));
  const need = pool.filter(p => !(p.wikidata in FAMECACHE.titles));
  for (let i = 0; i < need.length; i += 50) {
    const ids = need.slice(i, i + 50).map(p => p.wikidata);
    for (let tries = 0; tries < 12; tries++) {
      const r = await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=enwiki&format=json&ids=' + ids.join('|'), { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { await sleep(Math.max(10000, 1000 * (parseInt(r.headers.get('retry-after'), 10) || 30)) * (1 + tries / 2)); continue; }
      const j = await r.json();
      ids.forEach(id => { const s = j.entities && j.entities[id] && j.entities[id].sitelinks; FAMECACHE.titles[id] = s && s.enwiki ? s.enwiki.title : null; });
      break;
    }
    await sleep(2000);
    if ((i / 50) % 5 === 0) { save(); console.log('titles ' + Math.min(i + 50, need.length) + '/' + need.length); }
  }
  save();
  const todo = pool.filter(p => FAMECACHE.titles[p.wikidata] && !(p.wikidata in FAMECACHE.views));
  console.log('page views to fetch: ' + todo.length + ' (batched: 50 titles per request, last 60 days, scaled to a 30-day month)');
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50), titles = batch.map(p => FAMECACHE.titles[p.wikidata]);
    let done = false;
    for (let tries = 0; tries < 12 && !done; tries++) {
      const map = {}, byTitle = {}; let cont = '', bad = false;
      for (let guard = 0; guard < 20; guard++) {
        const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&prop=pageviews&pvipdays=60&redirects=1&formatversion=2&format=json&titles=' + encodeURIComponent(titles.join('|')) + cont, { headers: { 'User-Agent': UA } });
        if (r.status === 429 || r.status >= 500) { await sleep(Math.max(15000, 1000 * (parseInt(r.headers.get('retry-after'), 10) || 30)) * (1 + tries / 2)); bad = true; break; }
        const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch (e) { await sleep(15000); bad = true; break; }
        const q = j.query || {};
        (q.normalized || []).forEach(x => { map[x.from] = x.to; });
        (q.redirects || []).forEach(x => { map[x.from] = x.to; });
        (q.pages || []).forEach(pg => { if (!byTitle[pg.title] || (pg.pageviews && !byTitle[pg.title].pageviews)) byTitle[pg.title] = pg; });
        if (j.continue) { cont = Object.keys(j.continue).map(k => '&' + k + '=' + encodeURIComponent(j.continue[k])).join(''); await sleep(1500); } else break;
      }
      if (bad) continue;
      batch.forEach(p => {
        let t = FAMECACHE.titles[p.wikidata]; let hop = 0; while (map[t] && hop++ < 3) t = map[t];
        const pg = byTitle[t]; const d = pg && pg.pageviews ? Object.values(pg.pageviews).filter(v => v != null) : [];
        FAMECACHE.views[p.wikidata] = d.length ? Math.round(d.reduce((x, y) => x + y, 0) / d.length * 30.4) : 0;
      });
      done = true;
    }
    await sleep(3000);
    save(); console.log('views ' + Math.min(i + 50, todo.length) + '/' + todo.length + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
    if (Date.now() - t0 > 540000) { console.log('time slice used up; run the same command again to continue (cached)'); return; }
  }
  save(); console.log('fame cache complete: ' + Object.keys(FAMECACHE.views).length + ' articles');
}
// Second stage: 12-month monthly views (REST API, one request per article, politely paced) for everyone above 12000 in the 60-day pass.
// Used to damp news spikes: views = min(60-day rate, 1.5 x 12-month average).
async function fetchFame12() {
  const UA = 'DailyPoliticalTrivia-fame/1.0 (static civics site; one request at a time)';
  FAMECACHE.views12 = FAMECACHE.views12 || {};
  const save = () => fs.writeFileSync(FAME_FILE, JSON.stringify(FAMECACHE));
  const todo = people.filter(p => inPool(p) && FAMECACHE.views[p.wikidata] >= 12000 && FAMECACHE.titles[p.wikidata] && !(p.wikidata in FAMECACHE.views12));
  console.log('12-month views to fetch: ' + todo.length);
  const now = new Date(); const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)), b = new Date(Date.UTC(e.getUTCFullYear() - 1, e.getUTCMonth() + 1, 1));
  const ymd = d => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + '01';
  const t0 = Date.now(); let n = 0;
  for (const p of todo) {
    const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + encodeURIComponent(FAMECACHE.titles[p.wikidata].replace(/ /g, '_')) + '/monthly/' + ymd(b) + '/' + ymd(e);
    for (let tries = 0; tries < 8; tries++) {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { await sleep(10000 * (1 + tries)); continue; }
      if (r.status === 404) { FAMECACHE.views12[p.wikidata] = 0; break; }
      const j = await r.json(); const it = (j.items || []).map(x => x.views);
      FAMECACHE.views12[p.wikidata] = it.length ? Math.round(it.reduce((x, y) => x + y, 0) / it.length) : 0; break;
    }
    await sleep(350);
    if (++n % 50 === 0) { save(); console.log('views12 ' + n + '/' + todo.length + ' (' + Math.round((Date.now() - t0) / 1000) + 's)'); }
    if (Date.now() - t0 > 540000) { save(); console.log('time slice used up; run again to continue'); return; }
  }
  save(); console.log('12-month cache complete: ' + Object.keys(FAMECACHE.views12).length);
}
const FETCH = ARGS.includes('--fetch-fame');
if (ARGS.includes('--fetch-fame12')) fetchFame12().then(() => process.exit(0)); else
if (FETCH) fetchFame().then(() => process.exit(0));
else {
// photos must be exactly 225x275 (the game's tile ratio); legacy photos of other sizes are not used for faces
function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let o = 2;
  while (o < buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const m = buf[o + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)];
    o += 2 + buf.readUInt16BE(o + 2);
  }
  return null;
}
const sizeOk = new Map();
const photoSizeOk = f => { if (!sizeOk.has(f)) { let ok = false; try { const sz = jpegSize(fs.readFileSync(path.join(rootHas.has(f) ? PHOTOS_ROOT : PHOTOS_SITE, f))); ok = !!sz && sz[0] === 225 && sz[1] === 275; } catch (e) {} sizeOk.set(f, ok); } return sizeOk.get(f); };
let wrongSize = 0, wrongSizeFamous = [];
people.forEach(p => {
  p.views60 = p.wikidata && FAMECACHE.views[p.wikidata] != null ? FAMECACHE.views[p.wikidata] : null;
  p.views12 = p.wikidata && FAMECACHE.views12 && FAMECACHE.views12[p.wikidata] != null ? FAMECACHE.views12[p.wikidata] : null;
  p.views = p.views60 != null && p.views12 != null && p.views12 > 0 ? Math.min(p.views60, Math.round(1.5 * p.views12)) : p.views60;   // spike damping
});
// hand-kept exceptions for obvious page-view artifacts (people in the news for one week, or a name clash); see caucus-sort-fame-overrides.json
let OVERRIDES = { exclude: new Set() };
try { const o = JSON.parse(fs.readFileSync(path.join(TOOLS, 'caucus-sort-fame-overrides.json'), 'utf8')); OVERRIDES = { exclude: new Set(o.exclude || []) }; } catch (e) {}
const FAME_MIN = parseInt(argVal('--fame-min', '18000'), 10);      // avg monthly Wikipedia views (x office weight) for a living person to be on a board at all ("top fame tier")
const ICONIC_MIN = parseInt(argVal('--iconic-min', '90000'), 10);  // same, for historical (dead) people
const PRES_HIST_MIN = parseInt(argVal('--pres-hist-min', '60000'), 10); // historical presidents (always instantly recognisable portraits only)
const TOP_MIN = parseInt(argVal('--top-min', '32000'), 10);         // "top fame tier": at least 12 of the 16 faces must be living AND at or above this
const EASY_MIN = parseInt(argVal('--easy-min', '50000'), 10);      // living faces allowed in the yellow (easy) group
const AVG_MIN = parseInt(argVal('--avg-min', '40000'), 10);        // minimum average fame of the 16 faces (each capped at 300k)
const MAX_HIST = 4;                                                 // at most 4 historical people per puzzle
people.forEach(p => {
  let m = 1;
  if (p.current) m *= 1.2;
  if (p.f.has('president') || p.f.has('vp')) m *= 2.5;
  if (p.f.has('speaker') || p.tags.has('leader') || p.tags.has('ppt') || p.f.has('justice')) m *= 1.8;
  if (p.f.has('cabinet') || p.f.has('governor')) m *= 1.3;
  if (p.f.has('senator')) m *= 1.2;
  // a seat in the House alone is not enough to be a household name; neither is a lieutenant-governorship
  if (p.f.has('rep') && !p.f.has('senator') && !p.f.has('president') && !p.f.has('vp') && !p.f.has('speaker') && !p.tags.has('leader') && !p.f.has('cabinet') && !p.f.has('governor') && !p.f.has('mayor') && !p.f.has('justice')) m *= 0.6;
  if (p.f.has('ltgov') && !p.f.has('governor') && !p.f.has('senator') && !p.f.has('cabinet') && !p.f.has('rep')) m *= 0.5;
  if (OVERRIDES.exclude.has(p.name)) m = 0;
  p.eff = (p.views || 0) * m;
  p.alive = p.died == null && (p.born == null || p.born >= 1905);
  p.sizeOk = !!p.photo && photoSizeOk(p.photo);
  // must have actually held office (a candidate who never held office, e.g. a celebrity or third-party nominee, is not used)
  p.holder = p.src !== 'db' || p.roles.some(r => !/Candidate/i.test(r.office)) || !!p.pres;
  p.elig = p.views != null && p.sizeOk && p.holder && (p.alive ? p.eff >= FAME_MIN : (!!p.pres ? p.eff >= PRES_HIST_MIN : p.eff >= ICONIC_MIN));
  p.easyOk = p.elig && (p.alive ? p.eff >= EASY_MIN : true);
  p.top = p.elig && p.alive && p.eff >= TOP_MIN;
  p.fame = p.eff;
});
// two eligible people with the same short display name (John H. Sununu, the governor and chief of staff, and his son John E. Sununu, the senator) keep their middle initial
{ const cnt = new Map(); people.forEach(p => { if (p.elig) cnt.set(p.name, (cnt.get(p.name) || 0) + 1); }); people.forEach(p => { if (p.elig && cnt.get(p.name) > 1 && p.fullName && p.fullName !== p.name) p.name = p.fullName; }); }
// a face whose first and last name are a president's (Senator John Kennedy of Louisiana / JFK) gets the state too
{ const presNames = new Set(PRESIDENTS.map(r => { const t = strip(r.name).replace(/[A-Z].s*/g, '').replace(/s+(Jr|Sr).?$/, '').trim().split(/s+/); return (t[0] + ' ' + t[t.length - 1]).toLowerCase(); }));
  people.forEach(p => { const st = p.states.slice(-1)[0]; if (p.elig && !p.pres && st && presNames.has(strip(p.name).toLowerCase()) ) p.name = p.name + ' (' + st + ')'; }); }
// an eligible face whose name is shared by another well-known politician (Mike Rogers of Michigan / of Alabama) gets the state: 'Mike Rogers (MI)'
{ const known = new Map(); people.forEach(p => { if ((p.views || 0) >= 5000 || p.elig) known.set(p.name, (known.get(p.name) || 0) + 1); });
  people.forEach(p => { const st = p.states.slice(-1)[0]; if (p.elig && known.get(p.name) > 1 && st && !p.pres) p.name = p.name + ' (' + st + ')'; }); }

if (ARGS.includes('--why-not')) {   // famous people (by page views) who are NOT eligible, with the reason
  const r = people.filter(p => p.views != null && !p.elig && (p.views >= 15000)).sort((a, b) => b.views - a.views).slice(0, 80);
  r.forEach(p => console.log(String(p.views).padStart(8), String(Math.round(p.eff)).padStart(8), p.name, '|', !p.sizeOk ? 'photo size' : !p.holder ? 'never held office' : OVERRIDES.exclude.has(p.name) ? 'excluded by hand' : p.alive ? 'below living floor after office weight' : 'historical, below iconic floor', '|', [...p.f].join(',')));
  process.exit(0);
}
if (ARGS.includes('--fame-list')) {
  const fmt = (p, k) => String(k + 1).padStart(4) + '  ' + String(Math.round(p.eff)).padStart(8) + '  ' + (p.alive ? 'live' : 'hist') + '  ' + (p.elig ? 'ELIG' : '    ') + '  ' + p.name + '  [' + [...p.f].filter(x => x !== 'congress').join(',') + '|' + p.src + ']';
  const ranked = people.filter(p => p.views != null).sort((a, b) => b.eff - a.eff);
  const out = ['FAME ORDERING CHECK (eff = avg monthly page views x office weight)', 'Famous floor (living) ' + FAME_MIN + ', iconic floor ' + ICONIC_MIN + ', historical presidents ' + PRES_HIST_MIN + ', easy ' + EASY_MIN, 'people with views: ' + ranked.length, '', 'TOP 100'];
  out.splice(3, 0, 'Living at or above a floor: ' + [20000, 30000, 40000, 50000, 60000, 80000, 100000].map(f => f + ': ' + ranked.filter(p => p.alive && p.eff >= f).length).join(', '), 'Historical at or above: ' + [60000, 90000, 150000].map(f => f + ': ' + ranked.filter(p => !p.alive && p.eff >= f).length).join(', '));
  { const bad = ranked.filter(p => !p.sizeOk && p.eff >= FAME_MIN); out.splice(5, 0, 'Famous people left out because their photo is not 225x275: ' + bad.length + ' (' + bad.slice(0, 40).map(p => p.name).join(', ') + ')'); }
  ranked.slice(0, 100).forEach((p, k) => out.push(fmt(p, k)));
  const fl = ranked.findIndex(p => p.eff < FAME_MIN);
  out.push('', '100 AROUND THE LIVING FLOOR (' + FAME_MIN + ')');
  ranked.slice(Math.max(0, fl - 50), fl + 50).forEach((p, k) => out.push(fmt(p, Math.max(0, fl - 50) + k)));
  const il = ranked.findIndex(p => p.eff < ICONIC_MIN);
  out.push('', 'AROUND THE ICONIC FLOOR (' + ICONIC_MIN + ')');
  ranked.slice(Math.max(0, il - 25), il + 25).forEach((p, k) => out.push(fmt(p, Math.max(0, il - 25) + k)));
  fs.writeFileSync(path.join(ROOT, 'audit', 'caucus-sort-fame-check.txt'), out.join(String.fromCharCode(10)));
  console.log(out.slice(0, 3).join(String.fromCharCode(10)) + String.fromCharCode(10) + 'written audit/caucus-sort-fame-check.txt'); process.exit(0);
}
// ---------------------------------------------------------------- rule library (casual-player edition)
// Principles: every category must be something a casual news follower can reason about from famous faces.
// Removed on purpose (see audit/caucus-sort-tightening.md): veteran-branch groups, school/alumni groups, occupation and tiny groups,
// "served N years", era/exact-date groups, ethnicity-based groups, minor parties, trivia honors.
// Fame comes from eligibility (page views), so a rule only ever shows famous members.
// opts: lean 'D' or 'R' when the category is one party's people (used by the balance gate); easy = suitable for the yellow group.
const rules = [];
const addRule = (id, family, title, d, test, min, opts) => rules.push(Object.assign({ id, family, title, d, test, min: Math.min(min || 5, 5), lean: null }, opts || {}));
const T = t => p => p.tags.has(t);
const partyIs = x => p => p.parties.includes(x);
const ry = r => parseInt(r.from, 10) || 0;
const rend = r => (r.to ? parseInt(r.to, 10) : 2026) || 2026;
const roleMatch = (p, re, fn) => p.roles.some(r => re.test(r.office) && ry(r) <= 2026 && (!fn || fn(r)));
const CAB = /^(Secretary of (State|the Treasury|Defense|War|the Interior|Agriculture|Commerce|Labor|Health and Human Services|Health, Education, and Welfare|Education|Housing and Urban Development|Transportation|Energy|Veterans Affairs|Homeland Security)|Attorney General)$/i;
const isCab = p => roleMatch(p, CAB);
// cabinet-level posts (members of 'the cabinet' in many administrations): arguable for cabinet groups (fact-check: Gabbard as DNI)
const CABLEVEL = /^(Director of National Intelligence|(U.S. )?Ambassador to the United Nations|White House Chief of Staff|Director of the Office of Management and Budget|Administrator of the Environmental Protection Agency|United States Trade Representative|Director of the Central Intelligence Agency|Administrator of the Small Business Administration)$/i;
const isJustice = p => roleMatch(p, /^(Associate Justice|Chief Justice)/i);
const admOf = r => String(r.admin || '').replace(/\s+administration$/i, '').replace(/^the\s+/i, '').trim();

// -- presidents (facts from presidents.js tags)
addRule('pres-all', 'pres', 'U.S. Presidents', 1, p => !!p.pres, 4, { easy: true });
// (answer agent 2026-11-13, caucus audit) every rule's test must match its title for EVERY person; where a title can fairly be read more widely
// than the data rule, opts.amb lists the people who arguably fit, and such people are never placed in another group of the same puzzle.
addRule('pres-modern', 'pres', 'Presidents since 1980', 1, p => !!p.pres && (p.pres.lastYear || 9999) >= 1980, 4, { easy: true });   // Carter was president in 1980
const PRES_AMB = { governor: /^(William Henry Harrison|Andrew Jackson)$/, general: /^Chester A(lan|\.)? Arthur$/ };   // territorial governors; Arthur was a militia quartermaster general
[['general', 'Presidents who were generals', 2], ['governor', 'Presidents who were governors', 1], ['diedoffice', 'Presidents who died in office', 2],
 ['assassinated', 'Assassinated presidents', 2], ['lostpv', 'Presidents who won the White House but lost the popular vote', 3], ['elected2', 'Presidents elected to two terms', 2],
 ['senate', 'Presidents who were once U.S. senators', 2], ['house', 'Presidents who once served in the House', 3], ['succeeded', 'Presidents who took over after a death or resignation', 3],
].forEach(([t, title, d]) => addRule('pres-' + t, 'pres', title, d, p => !!p.pres && p.pres.tags.includes(t), 4, PRES_AMB[t] ? { amb: p => !!p.pres && (p.pres.tags.includes(t) || PRES_AMB[t].test(p.name)) } : {}));
addRule('pres-party-Democrat', 'pres', 'Democratic presidents', 1, p => !!p.pres && p.pres.party === 'Democrat', 4, { lean: 'D', easy: true, amb: p => !!p.pres && (p.pres.party === 'Democrat' || /^Andrew Johnson$/.test(p.name)) });
addRule('pres-party-Republican', 'pres', 'Republican presidents', 1, p => !!p.pres && p.pres.party === 'Republican', 4, { lean: 'R', easy: true });
const presState = {}; PRESIDENTS.forEach(r => { presState[r.state] = (presState[r.state] || 0) + 1; });
Object.keys(presState).filter(s => presState[s] >= 4).forEach(s => addRule('pres-born-' + s, 'pres', 'Presidents born in ' + STATES[s], 2, p => !!p.pres && p.pres.state === s, 4));
function inaugYear(p) { return p.pres && parseInt(String(p.pres.inaug).slice(0, 4), 10); }
// "the 1900s" can be read as the decade 1900-09, so the titles name the century / the years (rule ids unchanged)
[[1901, 2000, 'the1900s', 'Presidents first inaugurated in the 20th century'], [2001, 2100, 'the2000s', 'Presidents first inaugurated in 2001 or later']].forEach(([a, b, k, title]) =>
  addRule('pres-' + k, 'pres', title, 2, p => !!p.pres && inaugYear(p) >= a && inaugYear(p) <= b, 4));
addRule('db-gov-pres', 'pres', 'Governors who became president', 1, p => p.f.has('governor') && p.f.has('president'), 4, { amb: p => p.f.has('governor') && p.f.has('president') || !!p.pres && (p.pres.tags.includes('governor') || PRES_AMB.governor.test(p.name)) });
addRule('db-vp-pres', 'pres', 'Vice presidents who became president', 2, p => p.f.has('vp') && p.f.has('president'), 4);
addRule('sen-became-pres', 'pres', 'Presidents who served in the U.S. Congress', 2, p => !!p.pres && p.tags.has('congress'), 4);   // not the Continental Congress

// -- vice presidents, first ladies, running mates, nominees
addRule('vp-all', 'lead', 'Vice presidents of the United States', 1, p => p.f.has('vp'), 4, { easy: true });
addRule('vp-modern', 'lead', 'Vice presidents since 1974', 2, p => p.f.has('vp') && p.roles.some(r => /^Vice[ -]President/i.test(r.office) && rend(r) >= 1974), 4);
addRule('firstlady-all', 'exec', 'First ladies', 2, p => p.f.has('firstlady'), 4);
addRule('firstlady-modern', 'exec', 'First ladies since 1980', 2, p => p.f.has('firstlady') && p.roles.some(r => /^First (Lady|Gentleman)/i.test(r.office) && rend(r) >= 1981), 4);
const LOST_NOMINEE = /^(Hillary (Rodham )?Clinton|Kamala (D\. )?Harris|John (S\. )?McCain|Mitt Romney|John (F\. )?Kerry|Al(bert)? Gore|Bob Dole|Robert (J\. )?Dole|Michael Dukakis|Walter Mondale|George McGovern|Barry Goldwater|Hubert Humphrey|Adlai Stevenson|Thomas E\. Dewey)/i;
// a president who lost a general election (Trump 2020, Carter 1980, Bush 1992...) is also a "nominee who lost": the test includes them now
const lostAs = (p, re) => p.roles.some(r => re.test(r.office) && r.result === 'lost');
addRule('nominee-lost', 'exec', 'Presidential nominees who lost the general election', 2, p => (LOST_NOMINEE.test(p.name) || !!p.pres) && lostAs(p, /^Presidential Candidate$/i), 5, { amb: p => lostAs(p, /^Presidential Candidate$/i) });
addRule('vpnominee-lost', 'exec', 'Running mates who lost the general election', 4, p => p.roles.some(r => /^Vice Presidential Candidate$/i.test(r.office) && r.result === 'lost' && /^(Democrat|Republican)/i.test(r.party || '') && ry(r) >= 1960), 5, { amb: p => lostAs(p, /^Vice Presidential Candidate$/i) });

// -- congress leadership (members.js tags)
addRule('speaker', 'lead', 'Speakers of the House', 1, p => p.f.has('speaker'), 5, { easy: true });
// The members.js 'leader' tag does not say in which chamber the person led. Members of one chamber are clear; for those who sat in both,
// LEADER_CH says where they were a floor leader or whip (Wikipedia party-leader tables; senate.gov). '?' = unsure: in neither group, never beside one.
const LEADER_CH = { S000148: 'S', T000250: 'S', D000563: 'S', B000575: 'H', K000352: 'S', R000146: 'S', B001210: 'S', L000447: 'SH', D000064: 'S', D000401: 'S',
  S000701: 'H', G000465: 'S', S000174: 'S', M000113: 'S', D000360: 'S', H000598: 'S', J000160: 'S', B000145: 'S', C000506: 'S', M001127: 'S', W000012: '?',
  L000493: 'S', W000396: 'S', G000141: 'S', S000337: 'S', L000284: 'S', R000347: 'S', F000096: 'S', W000203: 'SH', J000257: 'S', C001008: 'S', U000013: 'SH',
  L000393: 'S', W000521: 'H', G000023: 'S', M000854: 'S', B000508: 'S', J000231: 'S' };
// conference chairs, secretaries and similar officers are not 'leaders or whips' in the data but fairly read as party leaders: arguable only
const LEADER_ARG = { F000450: 'H', C001109: 'H', S001196: 'H', M001159: 'H', A000371: 'H', B000287: 'H', C001038: 'H', C001095: 'S', A000360: 'S', E000295: 'S', C001047: 'S', M001111: 'S' };
const leaderCh = p => !p.tags.has('leader') ? '' : LEADER_CH[p.id] || (p.chambers.length === 1 ? (p.chambers[0] === 'Senate' ? 'S' : 'H') : '?');
addRule('leader-sen', 'lead', 'Senate party leaders and whips', 4, p => leaderCh(p).includes('S'), 5, { amb: p => /S|\?/.test(leaderCh(p)) || p.tags.has('ppt') || LEADER_ARG[p.id] === 'S' });   // presidents pro tempore (e.g. Patty Murray, also a conference officer) are arguable
addRule('leader-hou', 'lead', 'House party leaders and whips', 3, p => leaderCh(p).includes('H'), 5, { amb: p => /H|\?/.test(leaderCh(p)) || LEADER_ARG[p.id] === 'H' });
addRule('women-leaders', 'lead', 'Women who led a party or chamber in Congress', 2, p => p.gender === 'Woman' && (p.tags.has('speaker') || p.tags.has('leader') || p.tags.has('ppt')), 4);
addRule('women', 'demo', 'Women in Congress', 1, p => p.gender === 'Woman' && p.f.has('congress'), 8, { easy: true });   // (a first lady who later served, e.g. Hillary Clinton, is a woman in Congress too)
addRule('women-sen', 'demo', 'Women who served in the Senate', 1, p => p.gender === 'Woman' && p.chambers.includes('Senate'));
['Democrat', 'Republican'].forEach(x => {
  const adj = x === 'Democrat' ? 'Democratic' : 'Republican', lean = x === 'Democrat' ? 'D' : 'R';
  // tests need a one-party career (clean answers); anyone who ever served under the party also "fits", so party switchers are never placed beside these
  addRule('women-' + x, 'party', adj + ' women in Congress', 3, p => p.gender === 'Woman' && p.f.has('congress') && p.parties.length === 1 && p.parties[0] === x, 5, { lean, amb: p => p.gender === 'Woman' && p.f.has('congress') && p.parties.includes(x) });
  addRule('sen-' + x, 'party', adj + ' senators', 2, p => p.chambers.includes('Senate') && p.parties.length === 1 && p.parties[0] === x, 5, { lean, amb: p => p.chambers.includes('Senate') && (p.parties.includes(x) || x === 'Democrat' && /^(Bernie Sanders|Bernard Sanders|Angus King)$/.test(p.name)) });
  addRule('hou-' + x, 'party', adj + ' members of the House', 3, p => p.chambers.includes('House') && p.parties.length === 1 && p.parties[0] === x, 5, { lean, amb: p => p.chambers.includes('House') && (p.parties.includes(x) || x === 'Democrat' && /^(Bernie Sanders|Bernard Sanders)$/.test(p.name)) });   // includes House members who later went to the Senate
});
addRule('both-chambers', 'life', 'Members who served in both the House and the Senate', 3, p => p.chambers.includes('House') && p.chambers.includes('Senate'));
// a party's administration officials, its presidential candidates, its national chairs and the independents who caucus with it also fairly read as
// "Democrats" / "Republicans" (fact-check 2026-11-13: Bessent, Lutnick, Carson, Podesta, Gruters, Whatley, Sanders)
const ADM_PARTY = a => /^(Trump|G\.W\. Bush|G\.H\.W\. Bush|Reagan|Ford|Nixon|Eisenhower|Hoover|Coolidge|Harding)$/.test(a) ? 'Republican' : /^(Biden|Obama|Clinton|Carter|Johnson|L\.B\. Johnson|Kennedy|Truman|F\.D\. Roosevelt|Roosevelt)$/.test(a) ? 'Democrat' : null;
const CAUCUS_D = /^(Bernie Sanders|Bernard Sanders|Angus King)$/;
// parties a person belonged to outside the offices in the data (fact-check 2026-11-13): arguable for that party's groups
const OTHER_PARTY = { 'David Jolly': 'Democrat', 'Tulsi Gabbard': 'Republican', 'Rick Perry': 'Democrat', 'Charlie Crist': 'Republican', 'Joe Manchin': 'Independent', 'Kyrsten Sinema': 'Independent', 'Robert F. Kennedy Jr.': 'Independent', 'Robert Kennedy Jr.': 'Independent', 'Michael Bloomberg': 'Republican', 'Lincoln Chafee': 'Republican', 'Arlen Specter': 'Republican', 'Elizabeth Warren': 'Republican', 'Ronald Reagan': 'Democrat', 'Donald Trump': 'Democrat' };
const partyAmb = x => p => partyIs(x)(p) || OTHER_PARTY[p.name] === x || (x === 'Democrat' && CAUCUS_D.test(p.name)) || p.roles.some(r => ADM_PARTY(admOf(r)) === x ||
  /Candidate$/i.test(r.office) && normParty(r.party) === x || new RegExp('^Chair of the ' + (x === 'Democrat' ? 'Democratic' : 'Republican') + ' National Committee$', 'i').test(r.office));
const partyClean = (x, y) => p => partyIs(x)(p) && !partyIs(y)(p) && !p.roles.some(r => ADM_PARTY(admOf(r)) === y);   // RFK Jr. (a Democrat until 2023, now in Trump's cabinet) is only arguable
addRule('party-Dem', 'party', 'Democrats', 1, partyClean('Democrat', 'Republican'), 5, { lean: 'D', amb: partyAmb('Democrat') });
addRule('party-Rep', 'party', 'Republicans', 1, partyClean('Republican', 'Democrat'), 5, { lean: 'R', amb: partyAmb('Republican') });

// -- current members of Congress (neutral facts: party, chamber, sex, state)
// "current" = in office in the congress-legislators data; these rules are never used for puzzles shown on or after 2027-01-03 (CURRENT_UNTIL below),
// when the 120th Congress takes office. Independents who caucus with a party (Sanders, King) are arguable members of that party's group.
const curSen = p => p.current && p.chambers.includes('Senate');   // (no current House member has sat in the Senate before)
const curHou = p => p.current && !p.chambers.includes('Senate');
const lastP = p => p.parties.slice(-1)[0];
addRule('cur-sen-Dem', 'party', 'Current Democratic senators', 1, p => curSen(p) && lastP(p) === 'Democrat', 8, { lean: 'D', easy: true, amb: p => curSen(p) && /^(Democrat|Independent)$/.test(lastP(p)) });
addRule('cur-sen-Rep', 'party', 'Current Republican senators', 1, p => curSen(p) && lastP(p) === 'Republican', 8, { lean: 'R', easy: true });
addRule('cur-hou-Dem', 'party', 'Current House Democrats', 1, p => curHou(p) && lastP(p) === 'Democrat', 8, { lean: 'D', easy: true, amb: p => curHou(p) && /^(Democrat|Independent)$/.test(lastP(p)) });
addRule('cur-hou-Rep', 'party', 'Current House Republicans', 1, p => curHou(p) && lastP(p) === 'Republican', 8, { lean: 'R', easy: true });
addRule('cur-women-sen', 'demo', 'Current women senators', 2, p => curSen(p) && p.gender === 'Woman', 6);
addRule('cur-women-hou', 'demo', 'Current women in the House', 2, p => curHou(p) && p.gender === 'Woman', 6);
addRule('cur-sen', 'lead', 'Current U.S. senators', 1, p => curSen(p), 10, { easy: true });
addRule('cur-hou', 'lead', 'Current members of the House', 1, p => curHou(p), 10, { easy: true });
addRule('cur-all', 'era', 'Current members of Congress', 2, p => p.current, 10);
Object.keys(STATES).filter(s => !['DC', 'PR', 'GU', 'VI'].includes(s)).forEach(s => {
  const big = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'MA', 'GA', 'MI', 'NC', 'AZ', 'VA', 'NJ', 'WA'].includes(s);
  addRule('cur-state-' + s, 'state', 'Current members of Congress from ' + STATES[s], big ? 2 : 3, p => p.current && p.states.slice(-1)[0] === s, 6);
  // "since 1990" = served in the Senate in 1990 or later (Senate years, not later offices); presidents count too (Obama: Illinois)
  addRule('sen-' + s, 'state', 'Senators from ' + STATES[s] + ' since 1990', big ? 2 : 3, p => p.senStates.includes(s) && (p.senLast || 0) >= 1990, 5);
  if (big) {
    const fromS = (p, x) => p.f.has('congress') && (p.congLast || 0) >= 1990 && p.states.length === 1 && p.states[0] === s && p.parties.length === 1 && p.parties[0] === x;
    const ambS = (p, x) => p.f.has('congress') && (p.congLast || 0) >= 1990 && p.states.includes(s) && (p.parties.includes(x) || OTHER_PARTY[p.name] === x);
    addRule('dem-' + s, 'state', 'Democrats from ' + STATES[s] + ' in Congress since 1990', 3, p => fromS(p, 'Democrat'), 5, { lean: 'D', amb: p => ambS(p, 'Democrat') });
    addRule('rep-party-' + s, 'state', 'Republicans from ' + STATES[s] + ' in Congress since 1990', 3, p => fromS(p, 'Republican'), 5, { lean: 'R', amb: p => ambS(p, 'Republican') });
  }
});

// -- the 119th Congress (2025-27): permanent, dated versions of the "current" groups, used for puzzles shown once the 120th Congress has
// taken office (2027-01-03). Membership comes from the congress-legislators terms that overlap 2025-01-03 .. 2027-01-03, so people who left
// during the Congress (Vance, Rubio, Waltz...) count too.
const C119 = new Map();
{
  const legs = [].concat(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'legislators-current.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'legislators-historical.json'), 'utf8')));
  legs.forEach(l => {
    const ts = (l.terms || []).filter(t => t.end > '2025-01-03' && t.start < '2027-01-03');
    if (!ts.length) return;
    const last = ts[ts.length - 1];
    C119.set(l.id.bioguide, { sen: ts.some(t => t.type === 'sen'), rep: ts.some(t => t.type === 'rep'), state: last.state, party: normParty(last.party === 'Independent' ? 'Independent' : last.party), parties: [...new Set(ts.map(t => normParty(t.party)))] });
  });
}
C119.set('B000944', { sen: true, rep: false, state: 'OH', party: 'Democrat', parties: ['Democrat'] });   // Sherrod Brown: won the Nov 2026 Ohio special election, takes the seat on 2026-12-15 (fact-check 2026-11-13)
const c119 = p => C119.get(p.id);
const c119Sen = p => !!c119(p) && c119(p).sen, c119Hou = p => !!c119(p) && c119(p).rep && !c119(p).sen;
const C119T = ' of the 119th Congress (2025-27)';
addRule('c119-sen-Dem', 'party', 'Democratic senators' + C119T, 1, p => c119Sen(p) && c119(p).party === 'Democrat', 8, { lean: 'D', easy: true, amb: p => c119Sen(p) && c119(p).parties.some(x => /^(Democrat|Independent)$/.test(x)) });
addRule('c119-sen-Rep', 'party', 'Republican senators' + C119T, 1, p => c119Sen(p) && c119(p).party === 'Republican', 8, { lean: 'R', easy: true, amb: p => c119Sen(p) && c119(p).parties.includes('Republican') });
addRule('c119-hou-Dem', 'party', 'House Democrats' + C119T, 1, p => c119Hou(p) && c119(p).party === 'Democrat', 8, { lean: 'D', easy: true, amb: p => c119Hou(p) && c119(p).parties.some(x => /^(Democrat|Independent)$/.test(x)) });
addRule('c119-hou-Rep', 'party', 'House Republicans' + C119T, 1, p => c119Hou(p) && c119(p).party === 'Republican', 8, { lean: 'R', easy: true, amb: p => c119Hou(p) && c119(p).parties.includes('Republican') });
addRule('c119-women-sen', 'demo', 'Women senators' + C119T, 2, p => c119Sen(p) && p.gender === 'Woman', 6);
addRule('c119-women-hou', 'demo', 'Women in the House in the 119th Congress (2025-27)', 2, p => c119Hou(p) && p.gender === 'Woman', 6);
addRule('c119-sen', 'lead', 'Senators' + C119T, 1, c119Sen, 10, { easy: true });
addRule('c119-hou', 'lead', 'House members' + C119T, 1, c119Hou, 10, { easy: true });
addRule('c119-all', 'era', 'Members' + C119T, 2, p => !!c119(p), 10);
Object.keys(STATES).filter(s => !['DC', 'PR', 'GU', 'VI'].includes(s)).forEach(s => {
  const big = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'MA', 'GA', 'MI', 'NC', 'AZ', 'VA', 'NJ', 'WA'].includes(s);
  addRule('c119-state-' + s, 'state', 'Members of the 119th Congress (2025-27) from ' + STATES[s], big ? 2 : 3, p => !!c119(p) && c119(p).state === s, 6);
});

// -- executive branch: cabinet, courts, White House staff
// "recent" is vague, so anyone who ever held the post is an arguable member (never placed beside the group)
const everHeld = re => p => roleMatch(p, re);
addRule('cabinet', 'exec', 'Cabinet secretaries', 2, p => isCab(p) && !p.pres && roleMatch(p, CAB, r => rend(r) >= 1977), 5, { amb: isCab });   // 'secretaries' = department heads; cabinet-level posts (UN ambassador, DNI) are not arguable here
addRule('cab-state', 'exec', 'Recent Secretaries of State', 2, p => roleMatch(p, /^Secretary of State$/i, r => rend(r) >= 1993), 5, { easy: true, amb: everHeld(/^Secretary of State$/i) });
addRule('cab-treasury', 'exec', 'Recent Treasury secretaries', 2, p => roleMatch(p, /^Secretary of the Treasury$/i, r => rend(r) >= 1989), 5, { amb: everHeld(/^Secretary of the Treasury$/i) });
addRule('cab-defense', 'exec', 'Recent Defense secretaries', 2, p => roleMatch(p, /^Secretary of Defense$/i, r => rend(r) >= 1993), 5, { amb: everHeld(/^Secretary of (Defense|War)$/i) });
addRule('cab-ag', 'exec', 'Recent U.S. attorneys general', 2, p => roleMatch(p, /^Attorney General$/i, r => rend(r) >= 1993), 5, { amb: everHeld(/^Attorney General$/i) });
addRule('cab-homeland', 'exec', 'Homeland Security and Energy secretaries', 4, p => roleMatch(p, /^Secretary of (Homeland Security|Energy)$/i), 5);
addRule('cabinet-congress', 'exec', 'Cabinet members who once served in Congress', 4, p => isCab(p) && !p.pres && p.f.has('congress') && roleMatch(p, CAB, r => rend(r) >= 1977), 5, { amb: p => (isCab(p) || p.f.has('vp') || roleMatch(p, CABLEVEL)) && p.f.has('congress') });
// "the X cabinet" also holds the vice president and cabinet-level officials (UN ambassador, chief of staff, OMB, EPA, USTR...): all arguable
[['Trump', 'Trump', 'R'], ['Biden', 'Biden', 'D'], ['Obama', 'Obama', 'D'], ['G.W. Bush', 'George W. Bush', 'R'], ['Clinton', 'Clinton', 'D'], ['Reagan', 'Reagan', 'R']].forEach(([a, nm, lean]) =>
  addRule('cab-adm-' + a.replace(/\W+/g, ''), 'exec', 'Members of the ' + nm + ' cabinet', 3, p => !p.pres && roleMatch(p, CAB, r => admOf(r) === a), 5, { lean, amb: p => !p.pres && p.roles.some(r => admOf(r) === a && !/^(President|First Lady|First Gentleman)$/i.test(r.office) && !/Justice/i.test(r.office)) }));
addRule('scotus-all', 'exec', 'Supreme Court justices', 1, p => isJustice(p), 5, { easy: true });
addRule('scotus-current', 'exec', 'Current Supreme Court justices', 1, p => roleMatch(p, /^(Associate Justice|Chief Justice)/i, r => !r.to && ry(r) >= 1991), 5, { easy: true });
addRule('scotus-recent', 'exec', 'Supreme Court justices since 1990', 2, p => roleMatch(p, /^(Associate Justice|Chief Justice)/i, r => rend(r) >= 1990), 5);
addRule('scotus-chief', 'exec', 'Chief justices of the United States', 3, p => roleMatch(p, /^Chief Justice/i), 4);
addRule('scotus-women', 'exec', 'Women on the Supreme Court', 2, p => p.gender === 'Woman' && isJustice(p), 4);
[['Reagan', 'Reagan', 'R'], ['G.H.W. Bush', 'George H.W. Bush', 'R'], ['Clinton', 'Clinton', 'D'], ['G.W. Bush', 'George W. Bush', 'R'], ['Obama', 'Obama', 'D'], ['Trump', 'Trump', 'R'], ['Nixon', 'Nixon', 'R'], ['Biden', 'Biden', 'D']].forEach(([a, nm, lean]) =>
  addRule('just-adm-' + a.replace(/\W+/g, ''), 'exec', 'Supreme Court justices appointed by ' + nm, 3, p => roleMatch(p, /^(Associate Justice|Chief Justice)/i, r => admOf(r) === a), 4, { lean }));
addRule('wh-cos', 'exec', 'White House chiefs of staff', 4, p => roleMatch(p, /^White House Chief of Staff$/i), 5);
addRule('wh-press', 'exec', 'White House press secretaries', 2, p => roleMatch(p, /^White House Press Secretary$/i) && p.name !== 'George Stephanopoulos', 5, { amb: everHeld(/^White House Press Secretary$/i) });   // Stephanopoulos only briefed for weeks in 1993; not a clean fit, so never beside the group either
addRule('fed-chair', 'exec', 'Federal Reserve chairs', 3, p => roleMatch(p, /^Chair of the Federal Reserve$/i), 4);
addRule('nsa', 'exec', 'National security advisors', 4, p => roleMatch(p, /^National Security Advisor$/i), 5);
addRule('fbi-cia', 'exec', 'Directors of the FBI and CIA', 4, p => roleMatch(p, /^Director of the (FBI|Central Intelligence Agency)$/i), 5);
addRule('un-amb', 'exec', 'U.S. ambassadors to the United Nations', 4, p => roleMatch(p, /^(U\.S\. )?Ambassador to the United Nations$/i), 5);
addRule('partychair', 'exec', 'National party chairs', 4, p => roleMatch(p, /^Chair of the (Republican|Democratic) National Committee$/i, r => rend(r) >= 1990), 5);

// -- governors, mayors
const BIGCITY = new Set(['New York City', 'Los Angeles', 'Chicago', 'Houston', 'Philadelphia', 'Phoenix', 'San Antonio', 'San Diego', 'Dallas', 'San Francisco', 'Boston', 'Washington, D.C.', 'Washington, DC', 'Seattle', 'Atlanta', 'Miami', 'Detroit', 'Denver', 'Las Vegas', 'Baltimore', 'Nashville', 'Charlotte', 'Austin', 'Minneapolis', 'New Orleans', 'San Jose']);
addRule('gov-2026', 'gov', 'Governors in office during 2026', 2, p => roleMatch(p, /^Governor$/i, r => ry(r) <= 2026 && (!r.to || parseInt(r.to, 10) >= 2026) && stateCode(r.place) && !['PR', 'GU', 'VI', 'AS', 'MP'].includes(stateCode(r.place))), 8, { easy: true, amb: p => roleMatch(p, /^Governor$/i, r => ry(r) <= 2026 && (!r.to || parseInt(r.to, 10) >= 2026)) });   // territorial governors (Gonzalez-Colon, Puerto Rico) are arguable   // dated twin of gov-current for 2027 puzzles
const GOV_LEAVING = /Dunleavy/;   // Alaska's governor changed on 2026-12-07 (fact-check 2026-11-13): never shown as current, never beside the group
addRule('gov-current', 'gov', 'Current governors', 2, p => !GOV_LEAVING.test(p.name) && roleMatch(p, /^Governor$/i, r => !r.to && ry(r) >= 2015 && ry(r) <= 2026 && stateCode(r.place) && !['PR', 'GU', 'VI', 'AS', 'MP'].includes(stateCode(r.place))), 8, { easy: true, amb: p => roleMatch(p, /^Governor$/i, r => !r.to && ry(r) >= 2015 && ry(r) <= 2026 && stateCode(r.place) && !['PR', 'GU', 'VI', 'AS', 'MP'].includes(stateCode(r.place))) });
// presidents who were governors (Reagan, Clinton, Carter, Bush...) are governors too: the old !p.pres exclusions made those puzzles unfair
const isGov = p => p.f.has('governor') || !!p.pres && p.pres.tags.includes('governor');
const EARLY_GOV = /^(Benjamin Franklin)$/;   // President of Pennsylvania's Supreme Executive Council 1785-88, listed among Pennsylvania's governors
addRule('gov-all', 'gov', 'Current or former governors', 2, p => isGov(p) && (!!p.pres || roleMatch(p, /^Governor$/i, r => !!stateCode(r.place))), 8, { amb: p => isGov(p) || !!p.pres && PRES_AMB.governor.test(p.name) || EARLY_GOV.test(p.name) });
// 'became' / 'former X who': the later office must start after the earlier one began (fact-check 2026-11-13: Brownback and Braun were senators first,
// Elizabeth Dole and Andrew Cuomo were cabinet secretaries first); holding both in any order stays arguable
const GOV = /^Governor$/i, SEN = /Senator$/i;
const before = (p, reA, reB) => p.roles.some(a => reA.test(a.office) && p.roles.some(b => reB.test(b.office) && ry(b) > ry(a)));
addRule('gov-sen', 'gov', 'Former governors who became senators', 4, p => before(p, GOV, SEN), 6, { amb: p => p.f.has('governor') && p.f.has('senator') || !!p.pres && PRES_AMB.governor.test(p.name) });   // Jackson, W.H. Harrison: territorial governors, later senators
addRule('mayor-big', 'gov', 'Mayors of big American cities', 2, p => !p.pres && roleMatch(p, /^Mayor$/i, r => BIGCITY.has(r.place) && ry(r) >= 1975), 5, { amb: p => p.f.has('mayor') });   // "big" is vague: any mayor is arguable
addRule('mayor-nyc', 'gov', 'Mayors of New York City', 2, p => roleMatch(p, /^Mayor$/i, r => r.place === 'New York City'), 4);
Object.keys(STATES).filter(s => !['DC', 'PR', 'GU', 'VI'].includes(s)).forEach(s => {
  const big = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'MA', 'GA', 'MI', 'NC', 'AZ', 'VA', 'NJ', 'WA', 'AR'].includes(s);
  addRule('gov-of-' + s, 'state', 'Governors of ' + STATES[s], big ? 2 : 3, p => roleMatch(p, /^Governor$/i, r => stateCode(r.place) === s), 5);   // any era (FDR was governor of New York)
});

// -- the founding generation (iconic faces only: eligibility enforces it)
addRule('founders', 'era', 'Founding Fathers', 4, p => (p.dbTags.has('founder') && !/^Aaron Burr$/.test(p.name)) || (!!p.pres && p.pres.state && inaugYear(p) <= 1801), 5, { amb: p => p.dbTags.has('founder') || (!!p.pres && inaugYear(p) <= 1817) });   // Burr is not on the standard lists (fact-check 2026-11-13): never in or beside the group
addRule('founders-pres', 'era', 'Founding Fathers who became president', 4, p => !!p.pres && inaugYear(p) <= 1817, 4);   // Washington to Monroe (John Quincy Adams and Jackson are not Founding Fathers)

// -- more tricky-but-fair categories for the blue and purple groups (famous faces only; the category itself is the puzzle)
addRule('gov-cabinet', 'exec', 'Former governors who joined a cabinet', 3, p => before(p, GOV, CAB), 5, { amb: p => p.f.has('governor') && isCab(p) });
addRule('sen-cabinet', 'exec', 'Senators who became cabinet secretaries', 3, p => before(p, SEN, CAB), 5, { amb: p => p.f.has('senator') && isCab(p) });
addRule('vp-senate', 'lead', 'Vice presidents who served in the Senate', 3, p => p.f.has('vp') && p.f.has('senator'), 5);
// "went on to": a higher office that began after the mayoralty began, and the mayoralty is over (Karen Bass was in Congress BEFORE becoming mayor)
const HIGHER = /^(Governor|U\.S\. Senator|Senator|U\.S\. Representative|Representative|Vice President|President|Secretary of .+|Attorney General)$/i;
addRule('mayor-higher', 'gov', 'Former mayors who went on to higher office', 4, p => p.roles.some(m => /^Mayor$/i.test(m.office) && m.to && p.roles.some(h => HIGHER.test(h.office) && ry(h) > ry(m))), 5,
  { amb: p => p.f.has('mayor') && (p.f.has('governor') || p.f.has('senator') || p.f.has('cabinet') || p.f.has('vp') || p.f.has('rep') || p.f.has('president')) });
addRule('lost-then-won', 'exec', 'Presidents who lost a general election before winning one', 4, p => { if (!p.pres) return false; const c = p.roles.filter(r => /^Presidential Candidate$/i.test(r.office)); const firstLoss = Math.min(...c.filter(r => r.result === 'lost').map(ry), 9999), firstWin = Math.min(...c.filter(r => r.result === 'won').map(ry), 9999); return firstLoss < firstWin && firstWin < 9999; }, 4);
addRule('pres-nonpol', 'pres', 'Presidents since 1900 who never served in Congress', 3, p => !!p.pres && !p.tags.has('congress') && inaugYear(p) >= 1900, 4);

// members still listed as serving but leaving before the 120th Congress (special-election losers etc.; exact last day unclear): never shown in a
// "Current ..." group, and never placed beside one either (fact-check 2026-11-13: Jon Husted lost the Nov 2026 Ohio special election to Sherrod Brown)
const LEAVING = new Set(['H001104']);
rules.filter(r => /^cur-/.test(r.id)).forEach(r => { const t = r.test, a = r.amb; r.test = p => !LEAVING.has(p.id) && t(p); r.amb = p => (a ? a(p) : false) || t(p); });
const FUTURE_FROM = Date.UTC(2027, 0, 1) / 864e5;
const INCOMING_CUR = new Set(['B000944']);   // Sherrod Brown joins the Senate on 2026-12-15: arguable for every 'Current ...' group before the cut-over
rules.filter(r => /^cur-/.test(r.id)).forEach(r => { const a = r.amb; r.amb = p => a(p) || (INCOMING_CUR.has(p.id) && r.test(Object.assign({}, p, { current: true, id: '' }))); });
const mappedTags = new Set();
const rulesBeforeFilter = rules.length;
// plain-English title gate
rules.forEach(r => { if (r.title.length > 66 || !/^[\x20-\x7E]+$/.test(r.title) || /\b(null|undefined|nullifier|know nothing)\b/i.test(r.title)) throw new Error('bad rule title: ' + r.title); });
// ---------------------------------------------------------------- evaluate rules
const kept = [];
const dropped = [];
rules.forEach(r => {
  const idx = [];
  const bits = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (!people[i].elig) continue; let ok = false; try { ok = !!r.test(people[i]); } catch (e) { ok = false; } if (ok) { idx.push(i); bits[i] = 1; } }
  r.idx = idx; r.bits = bits;
  // arguable members (opts.amb, else the test itself): never placed in ANOTHER group of a puzzle that uses this rule
  const fit1 = p => { try { return !!(r.amb ? r.amb(p) || r.test(p) : r.test(p)); } catch (e) { return false; } };
  r.fits = (p, day) => fit1(p) || (!!p.future && (day == null || day >= FUTURE_FROM) && fit1(p.future));   // 2027 offices count from 2027 (unknown day = cautious)
  const ab = new Uint8Array(N); for (let i = 0; i < N; i++) if (people[i].elig && r.fits(people[i])) ab[i] = 1; r.ambBits = ab;
  r.famousAlive = idx.filter(i => people[i].alive).length;
  // a rule needs enough well-known members; "easy" rules need enough VERY well-known ones
  const need = r.d === 1 ? Math.max(r.min, 6) : r.min;
  const enough = idx.length >= need && (r.d !== 1 || idx.filter(i => people[i].easyOk).length >= need);
  (enough ? kept : dropped).push(r);
});
const seenIds = new Set();
kept.forEach(r => { if (seenIds.has(r.id)) throw new Error('duplicate rule id ' + r.id); seenIds.add(r.id); });
const pools = { 1: [], 2: [], 3: [], 4: [] };
kept.forEach(r => { r.cap = Math.max(12, Math.min(Math.round(COUNT / 7), Math.round(r.idx.length * 2.5))); });   // a small category may not dominate the calendar
kept.forEach(r => pools[r.d].push(r));
const COLOR = { 1: 'yellow (easy)', 2: 'green', 3: 'blue', 4: 'purple (hard)' };

// ---------------------------------------------------------------- report
const topNames = (r, k) => r.idx.slice().sort((a, b) => people[b].fame - people[a].fame).slice(0, k).map(i => people[i].name + (people[i].alive ? '' : ' (hist.)'));
function report() {
  const out = [];
  out.push('Caucus Sort: rule library report');
  out.push('People with usable photos: ' + N + ' (members ' + people.filter(p => p.src === 'members').length + ', presidents-only ' + people.filter(p => p.src === 'presidents').length + ', people-db only ' + people.filter(p => p.src === 'db').length + ')');
  out.push('Fame tiers (Wikipedia avg monthly page views x office weight): famous floor (living) ' + FAME_MIN + ', iconic floor (historical) ' + ICONIC_MIN + ', historical presidents ' + PRES_HIST_MIN + ', easy-group floor (yellow) ' + EASY_MIN);
  out.push('Eligible faces: ' + people.filter(p => p.elig).length + ' (living ' + people.filter(p => p.elig && p.alive).length + ', historical ' + people.filter(p => p.elig && !p.alive).length + ', easy-tier ' + people.filter(p => p.elig && p.easyOk).length + ')');
  out.push('Rules defined: ' + rules.length + '   kept: ' + kept.length + '   dropped (not enough famous members): ' + dropped.length);
  out.push('Kept by colour pool: ' + [1, 2, 3, 4].map(d => COLOR[d] + ' ' + pools[d].length).join(', '));
  out.push('Dropped by colour pool: ' + [1, 2, 3, 4].map(d => COLOR[d] + ' ' + dropped.filter(r => r.d === d).length).join(', '));
  if (DB) out.push('people-db: ' + dbTotal + ' records, ' + dbUsed + ' new people used, ' + dbMerged + ' merged into existing members, ' + dbNoPhoto + ' skipped (no usable photo, or elect-2026 not yet in office)');
  if (pendingPhotos) out.push('Photos found only in the root photos/ folder (not yet published to site/games/congressional-grid/photos/): ' + pendingPhotos + (ALLOW_ROOT ? ' (included; copied into the site folder when a puzzle uses them)' : ' (skipped: --site-only)'));
  out.push('');
  kept.slice().sort((a, b) => a.d - b.d || (a.family < b.family ? -1 : a.family > b.family ? 1 : 0) || (a.id < b.id ? -1 : 1)).forEach(r => {
    out.push('[d' + r.d + ' ' + COLOR[r.d].split(' ')[0] + '] ' + r.id + '  (' + r.family + ', ' + r.idx.length + ' famous members, ' + r.famousAlive + ' living' + (r.lean ? ', lean ' + r.lean : '') + ')  ' + r.title + '\n      top 8: ' + topNames(r, 8).join(', '));
  });
  if (dropped.length) { out.push('', 'DROPPED (too few famous members; count/needed):'); dropped.forEach(r => out.push('  [d' + r.d + '] ' + r.id + ' (' + r.idx.length + '/' + r.min + ') ' + r.title + (r.idx.length ? ' -> ' + topNames(r, 5).join(', ') : ''))); }
  return out.join('\n');
}
const reportText = report();
if (!DRY) fs.writeFileSync(path.join(TOOLS, 'caucus-sort-rules-report.txt'), reportText);
if (ARGS.includes('--list')) console.log(reportText);

// ---------------------------------------------------------------- generate puzzles
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261111);
let MAX_USE = parseInt(argVal('--max-use', String(Math.max(4, Math.floor(COUNT / 25)))), 10);          // no face in more than ~1 puzzle in 25
const use = new Float64Array(N), ruleUse = new Map();
const rejects = {};
const reject = why => { rejects[why] = (rejects[why] || 0) + 1; return false; };
const overlapCache = new Map();
function overlap(a, b) {
  const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
  let v = overlapCache.get(k);
  if (v === undefined) {
    const [s, l] = a.idx.length <= b.idx.length ? [a, b] : [b, a];
    let c = 0; for (const i of s.idx) if (l.bits[i]) c++;
    v = c / s.idx.length; overlapCache.set(k, v);
  }
  return v;
}
const titleTokens = t => new Set(t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'who', 'and', 'since', 'from', 'were', 'was', 'once'].includes(w)));
const jacc = (a, b) => { let i = 0; a.forEach(x => { if (b.has(x)) i++; }); return i / (a.size + b.size - i); };
function weightedPick(items, weightFn) {
  let tot = 0; const w = items.map(x => { const v = Math.max(1e-9, weightFn(x)); tot += v; return v; });
  let r = rand() * tot;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return items.length - 1;
}
function pickPeople(rule, others, taken, names, histLeft, lowLeft, easy) {
  const cand = [];
  for (const i of rule.idx) {
    const pi = people[i];
    if (taken.has(i) || use[i] >= MAX_USE) continue;
    if (easy && !pi.easyOk) continue;
    let ok = true; for (const o of others) if (o.ambBits[i]) { ok = false; break; }
    if (!ok || names.has(pi.name)) continue;
    cand.push(i);
  }
  if (cand.length < 4) return null;
  const chosen = [], nm = new Set();
  const pool = cand.slice();
  while (chosen.length < 4 && pool.length) {
    for (let q = pool.length - 1; q >= 0; q--) { const pq = people[pool[q]]; if ((!histLeft && !pq.alive) || (!lowLeft && !pq.top)) pool.splice(q, 1); }
    if (!pool.length) break;
    const k = weightedPick(pool, i => (people[i].pres && rule.family !== 'pres' ? 0.3 : 1) * (people[i].alive ? 1 : 0.05) * (people[i].top ? 1 : 0.25) * Math.pow(Math.min(people[i].eff, 400000) / 1000, 0.35) / Math.pow(1 + use[i], 4));
    const i = pool.splice(k, 1)[0];
    if (nm.has(people[i].name)) continue;
    nm.add(people[i].name); chosen.push(i); if (!people[i].alive) histLeft--; if (!people[i].top) lowLeft--;
  }
  return chosen.length === 4 ? chosen : null;
}
const majorParty = p => { for (let k = p.parties.length - 1; k >= 0; k--) if (p.parties[k] === 'Democrat' || p.parties[k] === 'Republican') return p.parties[k]; return null; };
// quality gates on a finished puzzle; returns null if fine, else the reason
function gate(groups, rs) {
  const all = groups.flatMap(g => g.people);
  const hist = all.filter(i => !people[i].alive).length;
  if (hist > MAX_HIST) return 'more than 4 historical';
  if (all.length - hist < 12) return 'fewer than 12 living';
  if (all.some(i => !people[i].elig)) return 'ineligible face';
  if (all.filter(i => people[i].top).length < 12) return 'fewer than 12 living in the top fame tier';
  const easyG = groups.find(g => g.slot === 1);
  if (!easyG || !easyG.rule.easy && easyG.rule.d !== 1 || easyG.people.some(i => !people[i].easyOk)) return 'no easy group';
  const avg = all.reduce((a, i) => a + Math.min(people[i].eff, 300000), 0) / 16;
  if (avg < AVG_MIN) return 'average fame too low';
  const pc = { Democrat: 0, Republican: 0 }; all.forEach(i => { const m = majorParty(people[i]); if (m) pc[m]++; });
  const pt = pc.Democrat + pc.Republican;
  if (pt >= 8 && Math.max(pc.Democrat, pc.Republican) / pt > 0.75) return 'party imbalance among faces';
  const lean = { D: 0, R: 0 }; rs.forEach(r => { if (r.lean) lean[r.lean]++; });
  if ((lean.D >= 2 && lean.R === 0) || (lean.R >= 2 && lean.D === 0)) return 'one-sided category set';
  const tk = rs.map(r => titleTokens(r.title));
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (jacc(tk[a], tk[b]) >= 0.5) return 'near-duplicate titles';
  return null;
}
// 2026-11-12: prefer rules whose available faces have been shown least (mean use of the 6 least-used eligible members),
// so the generator spreads appearances instead of leaning on the same busy rules (fewer repeated faces).
const FRESH_POW = parseFloat(argVal('--fresh-pow', '4')), FRESH_SCALE = parseFloat(argVal('--fresh-scale', '3'));
function ruleFreshness(r) {
  const u = []; for (const i of r.idx) if (people[i].elig && use[i] < MAX_USE) u.push(use[i]);
  if (u.length < 4) return 99;
  u.sort((a, b) => a - b); const k = Math.min(6, u.length); let t = 0; for (let j = 0; j < k; j++) t += u[j]; return t / k;
}
// "current" rules describe the data as fetched (November 2026). The 120th Congress takes office on 2027-01-03 and most new governors in January 2027,
// so puzzles shown from those dates on never use them (a rebuild with fresh data can bring them back).
const EPOCH_DAY0 = Date.UTC(2026, 10, 11) / 864e5;
const CURRENT_UNTIL = { cong: Date.UTC(2027, 0, 3) / 864e5, gov: Date.UTC(2027, 0, 1) / 864e5 };
const ruleAllowedOn = (r, day) => !(/^cur-/.test(r.id) && day >= CURRENT_UNTIL.cong) && !(r.id === 'gov-current' && day >= CURRENT_UNTIL.gov) &&
  !(/^c119-/.test(r.id) && day < CURRENT_UNTIL.cong) && !(r.id === 'gov-2026' && day < CURRENT_UNTIL.gov);
// a kept puzzle shown after the cut-over: its "current" group becomes the dated twin (same people, permanent title) and is then re-checked
const ruleForDay = (id, day) => day >= CURRENT_UNTIL.cong && /^cur-/.test(id) ? id.replace(/^cur-/, 'c119-') : day >= CURRENT_UNTIL.gov && id === 'gov-current' ? 'gov-2026' : id;
const RULE_BY_ID = new Map(rules.map(r => [r.id, r]));
// fairness check used for new AND kept puzzles: each face passes its own group's test and no other group's test or arguable set
function puzzleFair(groups, day) {   // groups: [{ rule, people: [person objects] }]
  for (const g of groups) {
    if (!g.rule || !ruleAllowedOn(g.rule, day)) return 'rule ' + (g.rule ? g.rule.id : '?') + ' not usable on this date';
    for (const p of g.people) {
      if (!g.rule.test(p)) return p.name + ' does not pass "' + g.rule.title + '"';
      for (const o of groups) if (o !== g && o.rule.fits(p, day)) return p.name + ' also fits "' + o.rule.title + '"';
    }
  }
  return null;
}
function makePuzzle(day) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const order = [4, 3, 2, 1];
    const sel = {};
    let ok = true;
    for (const d of order) {
      const chosen = Object.values(sel);
      const adj = d === 1 ? [[1, 1]] : [[d, 1]].concat([[d - 1, 0.3]], d < 4 && d > 1 ? [[d + 1, 0.3]] : []);
      const options = [];
      adj.forEach(([dd, wt]) => pools[dd].forEach(r => { if ((ruleUse.get(r.id) || 0) >= r.cap || !ruleAllowedOn(r, day)) return; if (!chosen.some(c => c.family === r.family || overlap(c, r) > 0.6 || overlap(r, c) > 0.6)) options.push({ r, wt }); }));
      if (!options.length) { ok = false; break; }
      sel[d] = options[weightedPick(options, o => o.wt * ((o.r.family === 'pres' ? 0.1 : o.r.family === 'era' ? 0.5 : 1)) / Math.pow(1 + (ruleUse.get(o.r.id) || 0), 1.6) / Math.pow(1 + ruleFreshness(o.r) / FRESH_SCALE, FRESH_POW))].r;
    }
    if (!ok) { reject('no compatible rule'); continue; }
    const rs = [1, 2, 3, 4].map(d => sel[d]);
    if (new Set(rs.map(r => r.id)).size < 4) continue;
    const taken = new Set(), names = new Set(), groups = []; let histLeft = MAX_HIST, lowLeft = MAX_HIST;
    // fill the groups most constrained first: purple, blue, green, then yellow
    for (const r of rs.slice().reverse()) {
      const others = rs.filter(o => o !== r);
      const slot = rs.indexOf(r) + 1;
      const ch = pickPeople(r, others, taken, names, histLeft, lowLeft, slot === 1);
      if (!ch) { groups.length = 0; break; }
      ch.forEach(i => { taken.add(i); names.add(people[i].name); if (!people[i].alive) histLeft--; if (!people[i].top) lowLeft--; });
      groups.push({ rule: r, people: ch, slot });
    }
    if (groups.length !== 4) { reject('could not fill a group'); continue; }
    groups.sort((a, b) => a.slot - b.slot);
    const why = gate(groups, rs);
    if (why) { reject(why); continue; }
    // verification: each of the 16 people satisfies exactly ONE of the 4 rules (using the raw test functions)
    for (const g of groups) for (const i of g.people) {
      const hits = rs.filter(r => r.test(people[i]));
      if (hits.length !== 1 || hits[0] !== g.rule) { reject('face fits two rules'); groups.length = 0; break; }
      if (!photoOk(people[i].photo) || !siteHas.has(people[i].photo) && !ALLOW_ROOT) throw new Error('missing photo ' + people[i].photo);
    }
    if (groups.length !== 4) continue;
    if (puzzleFair(groups.map(g => ({ rule: g.rule, people: g.people.map(i => people[i]) })), day)) { reject('face arguably fits two groups'); continue; }
    return groups;
  }
  throw new Error('could not build a puzzle (library too small? raise --max-use or lower --top-min)');
}
const keptFaces = new Set();
const TARGET_USE = MAX_USE; let capRaised = 0;
const puzzles = [];
// ---- keep the puzzles players will see in the next days unchanged (see --keep-through)
const EPOCH_DAY = Date.UTC(2026, 10, 11) / 864e5;   // must match EPOCH in games/caucus-sort/caucus-sort.js
let keepN = 0;
const REPAIR = ARGS.includes('--repair');   // keep EVERY old puzzle that still passes puzzleFair (titles refreshed), regenerate only the failing ones in place
const repairSlots = new Set(), repairLog = [];
{
  const kt = argVal('--keep-through', ''); let day = null;
  if (kt !== 'none') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(kt)) day = Date.UTC(+kt.slice(0, 4), +kt.slice(5, 7) - 1, +kt.slice(8, 10)) / 864e5;   // (fixed 2026-11-13: the pattern lacked its backslashes, so a given date was ignored)
    else { const t = new Date(); day = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 864e5 + 14; }
    let old = null; try { old = JSON.parse(fs.readFileSync(path.join(GAME, 'data', 'puzzles.json'), 'utf8')); } catch (e) {}
    if (old && old.puzzles && day >= EPOCH_DAY) {
      keepN = Math.min(old.puzzles.length, COUNT, day - EPOCH_DAY + 1);
      if (day - EPOCH_DAY + 1 > old.puzzles.length) console.log('note: --keep-through goes past the old puzzle count; days wrap, so only the first ' + keepN + ' are kept');
      const byFile = new Map(); people.forEach((p, i) => byFile.set(p.photo, i));
      for (let k = 0; k < keepN; k++) {
        const pz = old.puzzles[k]; puzzles.push(pz);
        pz.g.forEach(g => { ruleUse.set(g.r, (ruleUse.get(g.r) || 0) + 1); g.p.forEach(x => { const i = byFile.get(x[1]); if (i != null) use[i]++; keptFaces.add(x[1]); }); });
      }
      console.log('kept puzzles 1..' + keepN + ' unchanged (shown ' + new Date(EPOCH_DAY * 864e5).toISOString().slice(0, 10) + ' .. ' + new Date((EPOCH_DAY + keepN - 1) * 864e5).toISOString().slice(0, 10) + ')');
      if (REPAIR) {   // later puzzles: keep the fair ones at their dates, mark the rest for regeneration
        const byPhotoAll = new Map(); people.forEach(p => byPhotoAll.set(p.photo, p));
        for (let k = keepN; k < Math.min(old.puzzles.length, COUNT); k++) {
          const pz = old.puzzles[k], day = EPOCH_DAY + k;
          const groups = pz.g.map(g => ({ rule: RULE_BY_ID.get(ruleForDay(g.r, day)), people: g.p.map(x => byPhotoAll.get(x[1])) }));
          const why = groups.some(g => g.people.some(p => !p)) ? 'a face is no longer in the people list' : puzzleFair(groups, day);
          if (why) { repairSlots.add(k); repairLog.push(pz.id + ' (' + new Date(day * 864e5).toISOString().slice(0, 10) + '): ' + why); puzzles.push(null); continue; }
          pz.g.forEach(g => { g.p.forEach(x => { const pp = byPhotoAll.get(x[1]); if (pp) x[0] = pp.name; }); g.r = ruleForDay(g.r, day); g.t = RULE_BY_ID.get(g.r).title; ruleUse.set(g.r, (ruleUse.get(g.r) || 0) + 1); g.p.forEach(x => { const i = byFile.get(x[1]); if (i != null) use[i]++; keptFaces.add(x[1]); }); });
          puzzles.push(pz);
        }
        keepN = puzzles.length;
        console.log('repair: ' + (keepN - repairSlots.size) + ' puzzles kept, ' + repairSlots.size + ' to regenerate in place');
      }
    }
  }
}
for (let n = 0; n < COUNT; n++) {
  if (n < keepN && !repairSlots.has(n)) continue;
  let groups = null;
  for (let relax = 0; relax < 60 && !groups; relax++) { try { groups = makePuzzle(EPOCH_DAY + n); } catch (e) { if (!/could not build/.test(e.message)) throw e; MAX_USE++; capRaised++; } }   // the cap is only raised when the library cannot fill a puzzle without it
  if (!groups) throw new Error('could not build puzzle ' + (n + 1));
  groups.forEach(g => { ruleUse.set(g.rule.id, (ruleUse.get(g.rule.id) || 0) + 1); g.people.forEach(i => { use[i]++; }); });
  const pz = { id: 'c' + String(n + 1).padStart(4, '0'), g: groups.map(g => ({ d: g.slot, t: g.rule.title, r: g.rule.id, p: g.people.map(i => [people[i].name, people[i].photo]) })) };
  if (n < puzzles.length) puzzles[n] = pz; else puzzles.push(pz);
}
if (repairLog.length && ARGS.includes('--why')) console.log(repairLog.join('\n'));
if (repairLog.length && !DRY) fs.writeFileSync(path.join(ROOT, 'audit', 'answers-caucus-repair.txt'), 'Caucus Sort --repair: puzzles regenerated in place (reason found in the old puzzle)\n' + repairLog.join('\n') + '\n');

const byPhoto = new Map(); people.forEach(p => { if (p.elig || keptFaces.has(p.photo)) byPhoto.set(p.photo, p); });
// ---------------------------------------------------------------- write
fs.mkdirSync(path.join(GAME, 'data'), { recursive: true });
const outJson = JSON.stringify({ v: 1, generated: new Date().toISOString().slice(0, 10), count: puzzles.length, puzzles });
if (!DRY) fs.writeFileSync(path.join(GAME, 'data', 'puzzles.json'), outJson);
// copy every face used by a puzzle from the root photos/ master into the site folder (new, or changed since)
{
  let copied = 0;
  const faces = new Set(puzzles.flatMap(pz => pz.g.flatMap(g => g.p.map(x => x[1]))));
  for (const f of faces) {
    const src = path.join(PHOTOS_ROOT, f), dst = path.join(PHOTOS_SITE, f);
    if (!fs.existsSync(src)) { if (!fs.existsSync(dst)) throw new Error('photo missing everywhere: ' + f); continue; }
    if (DRY) continue;
    if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size || !fs.readFileSync(dst).equals(fs.readFileSync(src))) { fs.copyFileSync(src, dst); copied++; }
  }
  console.log('faces used: ' + faces.size + ' | copied into the site photo folder: ' + copied);
}
// people.json is NOT published to the site (the game never reads it; 6 MB); remove an old copy if present
try { fs.unlinkSync(path.join(GAME, 'data', 'people.json')); } catch (e) {}
const maxUse = Math.max(...use), faces = [...use].filter(x => x > 0).length;
const rulesUsed = ruleUse.size;
const med = a => a[Math.floor(a.length / 2)];
const statsFor = fn => puzzles.map(fn).sort((a, b) => a - b);
const pf = pz => pz.g.flatMap(g => g.p.map(x => byPhoto.get(x[1])));
const aliveCounts = statsFor(pz => pf(pz).filter(p => p.alive).length);
const topCounts = statsFor(pz => pf(pz).filter(p => p.top).length);
const minFame = statsFor(pz => Math.min(...pf(pz).map(p => p.eff)));
const avgFame = statsFor(pz => pf(pz).reduce((a, p) => a + Math.min(p.eff, 300000), 0) / 16);
const easyMin = statsFor(pz => Math.min(...pz.g[0].p.map(x => byPhoto.get(x[1]).eff)));
const lines = [];
lines.push('eligible faces: ' + people.filter(p => p.elig).length + ' (living top tier ' + people.filter(p => p.top).length + ', living below top ' + people.filter(p => p.elig && p.alive && !p.top).length + ', historical ' + people.filter(p => p.elig && !p.alive).length + ') | top-tier faces used more than ' + TARGET_USE + 'x: ' + people.filter((p, i) => p.top && use[i] > TARGET_USE).length + ', other faces used more than ' + TARGET_USE + 'x: ' + people.filter((p, i) => !p.top && use[i] > TARGET_USE).length);
lines.push('people with photos: ' + N + ' | rules kept: ' + kept.length + ' of ' + rules.length + ' (yellow/green/blue/purple: ' + [1, 2, 3, 4].map(d => pools[d].length).join('/') + ') | dropped: ' + dropped.length);
lines.push('puzzles: ' + puzzles.length + ' | distinct faces used: ' + faces + ' | most-repeated face shown ' + maxUse + 'x (target ' + TARGET_USE + ' = 1 in 25; the cap was raised ' + capRaised + ' times to ' + MAX_USE + '; faces used more than ' + TARGET_USE + ' times: ' + [...use].filter(x => x > TARGET_USE).length + ', mean uses per face ' + (puzzles.length * 16 / faces).toFixed(1) + ')');
{ const u = [...use].filter(x => x > 0), m = u.reduce((a, b) => a + b, 0) / u.length; lines.push('face use spread: std dev ' + Math.sqrt(u.reduce((a, b) => a + (b - m) * (b - m), 0) / u.length).toFixed(1) + ' | faces used 23x or more: ' + u.filter(x => x >= 23).length + ' | 26x or more: ' + u.filter(x => x >= 26).length); }
lines.push('distinct rules used: ' + rulesUsed + ' | duplicate puzzles: ' + (puzzles.length - new Set(puzzles.map(p => p.g.map(g => g.p.map(x => x[1]).sort().join(',')).sort().join('|'))).size));
lines.push('living per puzzle (of 16): min ' + aliveCounts[0] + ', median ' + med(aliveCounts) + ', max ' + aliveCounts[aliveCounts.length - 1] + ' | living faces in top tier (eff >= ' + TOP_MIN + '): min ' + topCounts[0] + ', median ' + med(topCounts) + ' (living floor ' + FAME_MIN + ')');
lines.push('lowest-fame face per puzzle: min ' + Math.round(minFame[0]) + ', median ' + Math.round(med(minFame)) + ' | average fame per puzzle: min ' + Math.round(avgFame[0]) + ', median ' + Math.round(med(avgFame)) + ' | easiest (yellow) group lowest face: min ' + Math.round(easyMin[0]) + ', median ' + Math.round(med(easyMin)));
lines.push('puzzle gate rejections while generating: ' + Object.entries(rejects).sort((a, b) => b[1] - a[1]).map(e => e[0] + ' ' + e[1]).join(', '));
lines.push('json size: ' + outJson.length + ' bytes');
lines.forEach(l => console.log(l));
if (!DRY) fs.appendFileSync(path.join(TOOLS, 'caucus-sort-rules-report.txt'), '\n\nPUZZLE STATS (' + puzzles.length + ' puzzles)\n' + lines.join('\n') + '\n');
// 12 distinct rules used the most / least
console.log('rules used most: ' + [...ruleUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0] + ' ' + e[1]).join(', '));
if (pendingPhotos && !ALLOW_ROOT) console.log('note: ' + pendingPhotos + ' people-db photos are not yet published to the site (run publish-game.ps1, then regenerate)');
console.log('report: site/tools/caucus-sort-rules-report.txt');

}
