#!/usr/bin/env node
'use strict';
/* Builds site/games/dark-horse/data/bank-curated-N.json from the listings in audit/dh-curated-data (see fetch-dh-curated.js, dh-curated-config.js).
   Usage: node site/tools/build-dh-curated.js
   Reads audit/dh-curated-data/_drop.json (list of question keys to leave out, with reasons) and _jackpots.json (keys -> verified jackpot titles, optional). */
const fs = require('fs');
const path = require('path');
const { Q, FILTERS, FILTERS_RECHECK } = require('./dh-curated-config.js');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated-data');
const OUTDIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const MIN = 350, MAX = 5000, FILE_LIMIT = 2.4 * 1024 * 1024;

// Must match norm() in trivia.js / validate-trivia.js
function norm(s) {
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr');
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const TYPES = readJson(path.join(DATA, '_types.json'), {}); // Wikidata instance-of labels (fetch-dh-types.js)
const INTROS = readJson(path.join(__dirname, '..', '..', 'audit', 'dh-curated-data', '_intros.json'), {});
const filterStats = {};
const drop = readJson(path.join(DATA, '_drop.json'), {});
const IDS = readJson(path.join(DATA, '_ids.json'), {}); // stable question ids (recheck: ids no longer shift when a question is removed)
const REPLACE_OLD_FILTER = /^(parties-|us-parties|milops)/; // these keys use the stricter recheck filter instead of the old description regex
const jackpots = readJson(path.join(DATA, '_jackpots.json'), {});
const BAD_TITLE = /^(List|Lists|Timeline|Outline|Index|Glossary|Category|Template|Portal|Draft|Wikipedia|Book):|^(List|Lists|Timeline|Outline) of |\(disambiguation\)/i;
// recheck: a year in the title must agree with the year used for the era split (guards against wrong dates, e.g. a treaty dated by publication year)
function titleYearOk(kind, title, y) {
  if (y == null || /\bBC\b|\bBCE\b/.test(title)) return true;
  if (kind === 'state') {
    const m = title.match(/\((?:c\. ?)?(\d{3,4}) ?[–-] ?(\d{3,4})\)/);
    return !m || Math.abs(+m[2] - y) <= 1;
  }
  if (!['battle', 'treaty', 'war', 'milop'].includes(kind)) return true;
  const nums = [];
  const re = /(?:^|[^0-9])(\d{3,4})(?:\s*[–-]\s*(\d{3,4}))?(?![0-9])/g; let m;
  while ((m = re.exec(title))) { const a = +m[1], b = m[2] ? +m[2] : a; if (a >= 400 && a <= 2100 && b >= a) nums.push([a, b]); }
  if (!nums.length) return true;
  return nums.some(([a, b]) => y >= a - 1 && y <= b + 1);
}
const stripParen = t => t.replace(/\s+\([^()]*\)\s*$/, '').trim();
const PARTY_CUTS = [0.01, 0.03, 0.08, 0.2], BATTLE_CUTS = [0.007, 0.03, 0.07, 0.15];
const CUTS = {
  'sc-cases': [0.01, 0.03, 0.07, 0.15],
  'parties-asia': PARTY_CUTS, 'parties-africa': PARTY_CUTS, 'parties-europe-old': PARTY_CUTS, 'parties-europe-new': PARTY_CUTS, 'parties-s-america': PARTY_CUTS, 'parties-n-america': PARTY_CUTS, 'parties-africa-americas': PARTY_CUTS, 'us-parties': [0.02, 0.06, 0.15, 0.4],
  'battles-pre1500': BATTLE_CUTS, 'battles-1500-1799': BATTLE_CUTS, 'battles-1800-1913': BATTLE_CUTS, 'battles-ww1': BATTLE_CUTS, 'battles-ww2': [0.02, 0.06, 0.15, 0.3], 'battles-1946': BATTLE_CUTS, 'battles-us-soil': [0.02, 0.06, 0.15, 0.3],
  'wars-pre1800': BATTLE_CUTS, 'wars-1800-1945': BATTLE_CUTS, 'milops': BATTLE_CUTS,
  'former-states-pre1800': [0.015, 0.06, 0.2, 0.5], 'former-states-1800-1945': [0.015, 0.06, 0.2, 0.5], 'former-states-1946': [0.02, 0.08, 0.22, 0.5],
  'treaties-pre1800': [0.01, 0.04, 0.12, 0.35], 'treaties-1800-1945': [0.01, 0.04, 0.12, 0.35], 'treaties-1946': [0.01, 0.04, 0.12, 0.35],
  'us-prisons': [0.01, 0.04, 0.12, 0.4], 'us-military-sites': [0.02, 0.06, 0.15, 0.4], 'think-tanks': [0.02, 0.06, 0.2, 0.5], 'ministries': [0.01, 0.04, 0.12, 0.4], 'legislatures': [0.02, 0.06, 0.2, 0.5],
  'capitals-ever': [0.02, 0.08, 0.2, 0.5], 'county-seats': [0.02, 0.08, 0.22, 0.5],
  'us-places-small': [0, 0, 0, 0.3], // nobody can name small towns: tier 4 for the larger ones, tier 5 for the rest
};
const STATE_ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };

// ---- alias generators: return extra spellings for an answer name ----
const CASE_SKIP = /^(united states|united states of america|us|u\.s\.|people|the people|commonwealth|state|in re|ex parte|matter of|estate of|city of|county of|board of|town of|the state|state of|re|hawaii|[a-z ]+ (county|city|state))$/i;
const STATES = Object.keys(STATE_ABBR);
const SEAT_NOSTATE_OK = new Set(['Los Angeles', 'Chicago', 'San Francisco', 'Boston', 'Atlanta', 'Philadelphia', 'Miami', 'Las Vegas', 'Houston', 'Honolulu', 'Seattle', 'Denver', 'Dallas', 'Detroit', 'New Orleans', 'Indianapolis', 'San Diego', 'Salt Lake City', 'Oklahoma City', 'San Antonio', 'Pittsburgh', 'Minneapolis', 'Milwaukee', 'Cleveland', 'Cincinnati', 'Key West']);
function aliasesFor(kind, name) {
  const out = [];
  const m = (re) => { const r = name.match(re); return r ? r : null; };
  switch (kind) {
    case 'case': {
      const p = name.split(/\s+v\.?\s+/);
      if (p.length === 2) {
        const first = p[0].replace(/,?\s+(Inc|LLC|Co|Corp|Ltd)\.?$/i, '').trim();
        if (first.length >= 4 && !CASE_SKIP.test(first) && !STATES.includes(first)) out.push(first);
      }
      break;
    }
    case 'battle': {
      const r = m(/^(?:Battle|Siege|Battles|Sieges|Capture|Fall|Raid|Skirmish|Action|Assault|Naval battle|Defence|Defense|Bombardment|Sack) (?:of|for|at|off) (?:the )?(.+)$/i);
      if (r) out.push(r[1]);
      break;
    }
    case 'state': {
      let r = m(/^(?:Kingdom|Empire|Republic|Duchy|Principality|Grand Duchy|County|Emirate|Sultanate|Khanate|Caliphate|Free State|Democratic Republic|Margraviate|Archduchy|Landgraviate|Electorate|Bishopric|Prince-Bishopric|Lordship|Barony|Despotate) of (?:the )?(.+)$/i);
      if (r) out.push(r[1]);
      r = m(/^(.+?) (?:Empire|Kingdom|Republic|Dynasty|Caliphate|Sultanate|Khanate|Duchy|Principality|Confederation|Federation)$/i);
      if (r && r[1].length >= 4) out.push(r[1]);
      break;
    }
    case 'party': {
      const r = m(/^(.+?) Party$/i);
      if (r && r[1].length >= 5) out.push(r[1]);
      break;
    }
    case 'ship': {
      const r = m(/^(?:USS|USNS|USCGC|USRC|CSS|USAT|SS) (.+)$/);
      if (r) { out.push(r[1]); if (name.startsWith('USS ')) out.push('U.S.S. ' + r[1]); }
      break;
    }
    case 'census-county': {
      const r = m(/^(.+?) (County|Parish|Borough|Census Area|Municipality|city)$/);
      if (r) out.push(r[1]);
      break;
    }
    default:
  }
  return out;
}

const PLACE_FIX = { 'Urban Honolulu CDP': 'Honolulu', 'Lynchburg, Moore County metropolitan government': 'Lynchburg', 'Nashville-Davidson metropolitan government (balance)': 'Nashville', 'Louisville/Jefferson County metro government (balance)': 'Louisville', 'Lexington-Fayette urban county': 'Lexington', 'Athens-Clarke County unified government (balance)': 'Athens', 'Augusta-Richmond County consolidated government (balance)': 'Augusta', 'Macon-Bibb County': 'Macon', 'Butte-Silver Bow (balance)': 'Butte', 'Anaconda-Deer Lodge County': 'Anaconda', 'Hartsville/Trousdale County': 'Hartsville', 'Cusseta-Chattahoochee County unified government': 'Cusseta', 'Georgetown-Quitman County unified government': 'Georgetown' };
function censusPlaceBase(n) {
  if (PLACE_FIX[n]) return PLACE_FIX[n];
  let b = n.replace(/\s*\((balance|part)\)\s*$/i, '');
  b = b.replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|metro government|city|town|village|borough|municipality|plantation|corporation|county)\s*$/i, '');
  return b.trim();
}

function loadItems(c) {
  let raw = readJson(path.join(DATA, c.key + '.json'), null);
  if (!raw) return null;
  if (c.key === 'battles-us-soil') {
    // recheck: the location-chain query misses battles whose Wikidata item has no location statement; add the older country=US list ONLY where the Wikipedia lead names a U.S. state or territory
    const have = new Set(raw.map(r => r.t));
    const US = new RegExp('\b(' + 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|Puerto Rico|Guam|Midway|Wake Island|Mariana|American Samoa|Virgin Islands|Indian Territory|Dakota Territory|Oregon Country|Louisiana Purchase|Florida' + ')\b');
    for (const r of (readJson(path.join(DATA, 'battles-us-soil-p17.json'), []) || [])) if (!have.has(r.t) && US.test((INTROS[r.t] || '').slice(0, 500))) raw.push(r);
  }
  const items = [];
  if (c.kind === 'census-county') {
    for (const r of raw) {
      const name = r.n.replace(/ city$/, ' city');
      items.push({ name, score: r.pop, titles: [], st: r.st, y: null });
    }
  } else if (c.kind === 'census-place') {
    const bigNames = new Set();
    if (c.maxPop) for (const r of raw) if (r.pop > c.maxPop) bigNames.add(censusPlaceBase(r.n).toLowerCase());
    for (const r of raw) {
      if (c.minPop && r.pop < c.minPop) continue;
      if (c.maxPop && r.pop > c.maxPop) continue;
      if (c.maxPop && bigNames.has(censusPlaceBase(r.n).toLowerCase())) continue; // recheck: namesake of a bigger place (Memphis, Rome, El Paso ...)
      if (/^(Echols|Webster) County (consolidated|unified) government$/.test(r.n)) continue; // county governments, not towns
      const base = censusPlaceBase(r.n);
      if (!base || /^(balance|remainder)/i.test(base)) continue;
      items.push({ name: base, score: r.pop, titles: [], st: r.st, y: null });
    }
  } else if (c.kind === 'seat') {
    for (const r of raw) {
      if (BAD_TITLE.test(r.t) || /barrio-pueblo|Puerto Rico$/.test(r.t)) continue;
      const m = r.t.match(/^(.+), ([A-Za-z. ]+)$/);
      let base = stripParen(r.t), st = null;
      if (m && STATES.includes(m[2])) { base = m[1]; st = m[2]; }
      // recheck: the FIPS-based query also returned seats of Palau, Micronesia, the Marshall Islands and N. Mariana Is. (no ", State" suffix); keep only the big U.S. cities that Wikipedia titles without a state
      else if (!SEAT_NOSTATE_OK.has(r.t)) continue;
      if (st === 'Connecticut' || st === 'Rhode Island') continue; // no county governments there
      if (/, [A-Za-z. ]+ (County|Parish|Borough)$/.test(base)) continue; // disambiguated former seats such as "Paris, Linn County"
      items.push({ name: base, score: r.s * 1000 + Math.min(r.st, 999), s: r.s, titles: [], st, y: r.y, q: r.q, full: r.t });
    }
  } else {
    for (const r of raw) {
      if (BAD_TITLE.test(r.t)) continue;
      if (c.minS && r.s < c.minS) continue; // recheck: Wikidata types some alliances/organisations as parties and only the article text shows it; very thin articles are the ones affected
      const FR = FILTERS_RECHECK[c.key];
      if (FR) {
        const fsr = filterStats[c.key + ' (recheck)'] = filterStats[c.key + ' (recheck)'] || { in: 0, out: 0 };
        fsr.in++;
        r.types = TYPES[r.q] || [];
        if (!FR(INTROS[r.t] || '', r.t, r)) continue;
        if (!titleYearOk(c.kind, r.t, r.y)) continue;
        fsr.out++;
      } else if (c.kind !== 'plain' && c.kind !== 'case' && !titleYearOk(c.kind, r.t, r.y)) continue;
      const F = REPLACE_OLD_FILTER.test(c.key) ? null : FILTERS[c.key];
      if (F) {
        const intro = r.ds || INTROS[r.t] || '';
        const fs_ = filterStats[c.key] = filterStats[c.key] || { in: 0, out: 0 };
        fs_.in++;
        if (F.title && !F.title.test(r.t)) continue;
        if (F.re && (!intro || !F.re.test(intro))) continue;
        if ((F.not && ((intro && F.not.test(intro)) || F.not.test(r.t))) || (F.notTitle && F.notTitle.test(r.t))) continue;
        fs_.out++;
      }
      const base = stripParen(r.t);
      if (!base || base.length > 90) continue;
      items.push({ name: base, score: r.s * 1000 + Math.min(r.st, 999), s: r.s, titles: base !== r.t ? [r.t] : [], y: r.y, q: r.q, full: r.t });
    }
  }
  return items;
}

function buildQuestion(c, id) {
  const items = loadItems(c);
  if (!items) return { skip: 'no data file' };
  // merge entries with the same normalised name (same title shared by several items or several states)
  const byKey = new Map();
  for (const it of items) {
    const k = norm(it.name);
    if (!k) continue;
    const e = byKey.get(k);
    if (!e) { byKey.set(k, Object.assign({ states: it.st ? [it.st] : [], alt: new Set(it.titles) }, it)); continue; }
    if (it.st && !e.states.includes(it.st)) e.states.push(it.st);
    it.titles.forEach(t => e.alt.add(t));
    if (it.score > e.score) { e.score = it.score; e.s = it.s; e.y = it.y; e.q = it.q; e.full = it.full; }
  }
  const ents = [...byKey.values()].sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  if (ents.length < MIN) return { skip: `only ${ents.length} distinct answers` };
  if (ents.length > MAX) return { skip: `${ents.length} distinct answers (over ${MAX})` };
  // weights by rank percentile of the popularity proxy
  const n = ents.length;
  // recheck: per-question tier cut-offs (share of answers in tiers 1-4; the rest are tier 5). The old uniform 2/8/25/55 percent split put far too many unknowns in tiers 3-4 (see audit log, weight audit)
  const cp = CUTS[c.key] || [0.02, 0.08, 0.25, 0.55];
  const cut = cp.map((v, i) => i === 0 && !CUTS[c.key] ? Math.max(5, Math.round(n * v)) : Math.round(n * v));
  ents.forEach((e, i) => { e.weight = i < cut[0] ? 1 : i < cut[1] ? 2 : i < cut[2] ? 3 : i < cut[3] ? 4 : 5; });
  // claim spellings: names first, then aliases in rank order
  const owner = new Map();
  ents.forEach((e, i) => owner.set(norm(e.name), i));
  // recheck alias policy: (1) no short-name aliases at all for parties ("Democratic Party" -> "Democratic", "Green") or former states ("Kingdom of Italy" -> "Italy" would accept a country that never ceased to exist);
  // (2) battle/case short names ("Verdun", "Brown") only for well-known answers (weight 1-2) whose short form belongs to exactly one entry of the question
  // bare place names that are countries or capitals would accept a wrong answer to "name a battle" ("France" for the Battle of France), so they are never accepted as short forms
  const ALIAS_BLOCK = new Set('britain france germany italy spain russia japan china england scotland ireland poland ukraine korea vietnam iraq syria israel egypt greece turkey cuba panama grenada kosovo bosnia serbia croatia belgium holland netherlands denmark norway sweden finland berlin paris london rome vienna moscow madrid washington jerusalem baghdad kabul saigon tokyo beijing warsaw athens cairo istanbul constantinople damascus mecca medina new york boston philadelphia atlanta richmond charleston savannah baltimore chicago manila lisbon prague budapest belgrade kiev kyiv minsk riga tallinn helsinki oslo stockholm copenhagen dublin edinburgh amsterdam brussels geneva zurich milan naples venice florence turin hanoi seoul pyongyang tehran tripoli tunis algiers rabat nanjing shanghai canton hong kong singapore bangkok delhi calcutta mumbai bombay lahore karachi'.split(' ').concat(['new york', 'hong kong']));
  const genCount = new Map();
  if (c.kind === 'battle' || c.kind === 'case') ents.forEach(e => { for (const a of aliasesFor(c.kind, e.name)) genCount.set(norm(a), (genCount.get(norm(a)) || 0) + 1); });
  ents.forEach((e, i) => {
    let gen = aliasesFor(c.kind, e.name);
    if (c.kind === 'party' || c.kind === 'state') gen = [];
    else if (c.kind === 'battle' || c.kind === 'case') gen = e.weight <= 2 ? gen.filter(a => genCount.get(norm(a)) === 1 && !owner.has(norm(a)) && !ALIAS_BLOCK.has(norm(a))) : [];
    const cand = [...e.alt, ...gen];
    if (c.kind === 'census-county' || c.kind === 'census-place' || c.kind === 'seat') {
      for (const st of e.states) { cand.push(e.name + ', ' + st); if (STATE_ABBR[st]) cand.push(e.name + ', ' + STATE_ABBR[st]); }
      if (c.kind === 'census-county') for (const st of e.states) { const r = e.name.match(/^(.+?) (County|Parish|Borough|Census Area|Municipality)$/); if (r) cand.push(r[1] + ', ' + st); }
    }
    e.aliases = [];
    const mine = new Set([norm(e.name)]);
    for (const a of cand) {
      const k = norm(a);
      if (!k || mine.has(k) || owner.has(k) || k.length < 3) continue;
      owner.set(k, i); mine.add(k); e.aliases.push(a);
    }
  });
  // jackpot: verified pick from _jackpots.json
  const jp = jackpots[c.key];
  let jpEnt = null;
  if (jp) {
    jpEnt = ents.find(e => e.full === jp.title || e.name === jp.title);
    if (jpEnt) { jpEnt.weight = 5; jpEnt.jackpot = true; jpEnt.jnote = jp.note; }
  }
  const answers = ents.map(e => {
    const a = { name: e.name };
    if (e.aliases.length) a.aliases = e.aliases;
    a.weight = e.weight;
    if (e.jackpot) { a.jackpot = true; a.note = e.jnote; }
    return a;
  });
  const hist = [0, 0, 0, 0, 0, 0];
  ents.forEach(e => hist[e.weight]++);
  TITLES[id] = Object.fromEntries(ents.filter(e => e.full).map(e => [e.name, [e.full, e.q, e.y, e.s]]));
  return { q: { id, category: c.cat, prompt: c.prompt, difficulty: c.diff, note: c.note, answers }, n, cut, hist: hist.slice(1), jackpot: jpEnt ? jpEnt.name : null };
}

// ---- main ----
const TITLES = {};
const questions = [], report = [], dropped = [];
let num = 0;
for (const c of Q) {
  if (drop[c.key]) { dropped.push([c.key, 'dropped after verification: ' + drop[c.key]]); continue; }
  const id = IDS[c.key] || 'curated-' + String(Math.max(0, ...Object.values(IDS).map(v => +v.slice(8))) + 1).padStart(4, '0');
  IDS[c.key] = id;
  const r = buildQuestion(c, id);
  if (r.skip) { dropped.push([c.key, r.skip]); continue; }
  num++;
  questions.push(r.q);
  report.push({ key: c.key, id: r.q.id, cat: c.cat, diff: c.diff, n: r.n, hist: r.hist, cut: r.cut, jackpot: r.jackpot, src: c.src, prompt: c.prompt });
}
// split into files
const files = []; let cur = [], size = 0;
for (const q of questions) {
  const s = JSON.stringify(q).length;
  if (cur.length && size + s > FILE_LIMIT) { files.push(cur); cur = []; size = 0; }
  cur.push(q); size += s;
}
if (cur.length) files.push(cur);
require('./dh-bank-guard')(OUTDIR, /^bank-curated-\d+\.json$/, 'build-dh-curated.js');
for (const f of fs.readdirSync(OUTDIR)) if (/^bank-curated-\d+\.json$/.test(f)) fs.unlinkSync(path.join(OUTDIR, f));
files.forEach((qs, i) => fs.writeFileSync(path.join(OUTDIR, `bank-curated-${i + 1}.json`), JSON.stringify({ bank: 'curated-' + (i + 1), questions: qs })));
fs.writeFileSync(path.join(DATA, '_titles.json'), JSON.stringify(TITLES));
fs.writeFileSync(path.join(DATA, '_ids.json'), JSON.stringify(IDS, null, 1));
fs.writeFileSync(path.join(DATA, '_report.json'), JSON.stringify({ report, dropped, files: files.length }, null, 1));

console.log(`${questions.length} questions in ${files.length} file(s); dropped ${dropped.length}`);
for (const r of report) console.log(`${r.id} ${r.key.padEnd(28)} ${String(r.n).padStart(5)} answers  w1-5 ${r.hist.join('/')}${r.jackpot ? '  jackpot: ' + r.jackpot : ''}`);
for (const d of dropped) console.log('DROPPED', d[0], '-', d[1]);
for (const [k, v] of Object.entries(filterStats)) console.log('FILTER', k, v.in, '->', v.out);
fs.writeFileSync(path.join(DATA, '_filterstats.json'), JSON.stringify(filterStats));
