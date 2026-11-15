#!/usr/bin/env node
'use strict';
/* Builds site/games/dark-horse/data/bank-curated2-N.json from the listings in audit/dh-curated2-data (see fetch-dh-curated-2.js and dh-curated2-config.js).
   Usage: node site/tools/build-dh-curated-2.js [--preview]    (--preview also writes audit/dh-curated2-data/_preview.txt: top/tail of every question for review)
   Weights: answers are ranked by English Wikipedia page views (12 months, human users); per-question cut-offs (counts or fractions, config.cuts) give tiers 1-5.
   For Census-based questions (places, counties) the rank is by population. */
const fs = require('fs');
const path = require('path');
const { QUESTIONS, EXTRA } = require('./dh-curated2-config.js');
const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'audit', 'dh-curated2-data');
const OLD = path.join(ROOT, 'audit', 'dh-curated-data');
const OUTDIR = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const FILE_LIMIT = 2.4 * 1024 * 1024;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

function norm(s) { // must match norm() in trivia.js / validate-trivia.js
  s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁđĐðÐøØıæÆœŒßþÞ]/g, function(c){ return {"ł":"l","Ł":"l","đ":"d","Đ":"d","ð":"d","Ð":"d","ø":"o","Ø":"o","ı":"i","æ":"ae","Æ":"ae","œ":"oe","Œ":"oe","ß":"ss","þ":"th","Þ":"th"}[c]; }).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr');
  if (t.length > 1 && t[0] === 'the') t.shift();
  return t.join(' ');
}
const INTROS = Object.assign({}, readJson(path.join(OLD, '_intros.json'), {}), readJson(path.join(DATA, '_intros.json'), {}));
const VIEWS = readJson(path.join(DATA, '_pageviews.json'), {});
const JACK = readJson(path.join(DATA, '_jackpots2.json'), {});
const DROP = readJson(path.join(DATA, '_drop2.json'), {});
const IDS = readJson(path.join(DATA, '_ids2.json'), {});
const MALIAS = readJson(path.join(__dirname, 'dh-curated2-aliases.json'), {}); // hand-added extra spellings: { questionKey: { answer name: [aliases] } }
const BAD_TITLE = /^(List|Lists|Timeline|Outline|Index|Glossary|Category|Template|Portal|Draft|Wikipedia|Book):|^(List|Lists|Timeline|Outline) of |\(disambiguation\)/i;
const stripParen = t => t.replace(/\s+\([^()]*\)\s*$/, '').trim();
const STATE_ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const ALIAS_BLOCK = new Set('britain france germany italy spain russia japan china england scotland ireland poland ukraine korea vietnam iraq syria israel egypt greece turkey cuba panama grenada kosovo bosnia serbia croatia belgium holland netherlands denmark norway sweden finland berlin paris london rome vienna moscow madrid washington jerusalem baghdad kabul saigon tokyo beijing warsaw athens cairo istanbul constantinople damascus mecca medina boston philadelphia atlanta richmond charleston savannah baltimore chicago manila lisbon prague budapest belgrade kiev kyiv minsk riga tallinn helsinki oslo stockholm copenhagen dublin edinburgh amsterdam brussels geneva zurich milan naples venice florence turin hanoi seoul pyongyang tehran tripoli tunis algiers rabat nanjing shanghai canton singapore bangkok delhi calcutta mumbai bombay lahore karachi'.split(' ').concat(['new york', 'hong kong']));

/* year of a row: the Wikidata year, else a year found in the title, else (optionally) the Wikipedia lead */
function titleYear(t) { const m = t.match(/(?:^|[^0-9])(1[5-9]\d\d|20[0-2]\d)(?![0-9])/); return m ? +m[1] : null; }

/* ---------- alias generators (extra accepted spellings); each returns candidates, the caller enforces uniqueness ---------- */
function aliasesFor(kind, name) {
  const out = []; const m = re => name.match(re);
  switch (kind) {
    case 'case': {
      const p = name.split(/\s+v\.?\s+/);
      if (p.length === 2) { const first = p[0].replace(/,?\s+(Inc|LLC|Co|Corp|Ltd)\.?$/i, '').trim(); if (first.length >= 4 && !/^(united states|people|commonwealth|state|in re|ex parte|city of|county of|board of|town of|the state|state of)$/i.test(first) && !(first in STATE_ABBR)) out.push(first); }
      break;
    }
    case 'battle': { const o = m(/^(First|Second|Third|Fourth) (?:Battle|Siege|Battles) (?:of|for|at) (?:the )?(.+)$/i); if (o) out.push(o[1] + ' ' + o[2]); const r = m(/^(?:Battle|Siege|Battles|Sieges|Capture|Fall|Raid|Skirmish|Action|Assault|Defence|Defense|Bombardment|Sack) (?:of|for|at|off) (?:the )?(.+)$/i); if (r) out.push(r[1]); break; }
    case 'act': {
      const r = m(/^(.+?)(?: of (?:1[7-9]\d\d|20\d\d))$/); if (r && (r[1].split(" ").length >= 2 || r[1].length >= 7)) out.push(r[1]);
      const r2 = m(/^(.+?) Acts?$/); if (r2 && (r2[1].split(" ").length >= 2 || r2[1].length >= 7)) out.push(r2[1]);
      break;
    }
    case 'ship': { const r = m(/^(?:USS|USNS|USCGC|USRC|CSS|USAT|SS) (.+)$/); if (r) { out.push(r[1]); if (/^USS /.test(name)) out.push('U.S.S. ' + r[1]); } break; }
    case 'coup': {
      let n2 = name.replace(/^(?:c\. )?\d{3,4}\s+/, '').replace(/\s*,?\s*\d{4}$/, '');
      if (n2 !== name) out.push(n2);
      const n3 = n2.replace(/coup d['’]état/i, 'coup'); if (n3 !== n2) { out.push(n3); }
      const n4 = name.replace(/coup d['’]état/i, 'coup'); if (n4 !== name) out.push(n4);
      break;
    }
    case 'nps': { const r = m(/^(.+?) (?:National (?:Park and Preserve|Parks?|Monument and Preserve|Monuments?|Historic Site|Historical Park|Historic Park|Battlefield Park|Battlefield|Military Park|Memorial|Seashore|Recreation Area|Preserve|Lakeshore|Scenic Trail|Historic Trail|River and Recreation Area|River|Scenic Riverway|Scenic River|Parkway|Heritage Area|Mall)(?: and Preserve)?|Memorial|Historic Site|National Cemetery|Monument)$/); if (r && r[1].length >= 4) out.push(r[1]); break; }
    case 'scandal': { const r = m(/^(.+?) (?:scandal|scandals|affair|controversy|incident|case|crisis|conspiracy)$/i); if (r && r[1].length >= 4) out.push(r[1].replace(/^The /, '')); break; }
    case 'person': {
      const t = name.split(' ');
      const PART = new Set(['de', 'da', 'di', 'del', 'della', 'dos', 'van', 'von', 'der', 'den', 'ten', 'ter', 'le', 'la', 'el', 'al', 'ben', 'bin', 'ibn', 'abu', 'mac', 'st.']);
      for (let i = 1; i < t.length - 1; i++) if (PART.has(t[i].toLowerCase()) && t.length - i >= 2) { out.push(t.slice(i).join(' ')); break; }
      const EA = new Set(['Mao', 'Xi', 'Deng', 'Zhou', 'Jiang', 'Hu', 'Wen', 'Zhu', 'Sun', 'Chiang', 'Hua', 'Zhao', 'Li', 'Yuan', 'Pol']);
      if (t.length === 2 && EA.has(t[0])) out.push(t[0]);
      break;
    }
    case 'place': case 'county': break;
    default:
  }
  return out;
}
const SURNAME_KINDS = new Set(['case', 'battle', 'ship', 'person']);

/* ---------- fame from the hand-made civics banks ----------
   The Wikidata sitelink count ranks the top of a list only roughly (a Hollywood antitrust case outranks Gideon v. Wainwright). The owner's own civics banks list the
   answers a typical American player knows (the 65 landmark Supreme Court cases, the major federal laws, the Civil War battles ...). An answer that appears in
   2 or more matching questions of those banks is tier 1, in one such question tier 2 (never worse than its rank tier). config.fame = { category?, prompt? (RegExp), single (tier for one mention) }. */
let CIVICS = null;
function civicsQuestions() {
  if (CIVICS) return CIVICS;
  CIVICS = [];
  for (const f of ['bank-civics.json', 'bank-civics-2.json']) { const d = readJson(path.join(OUTDIR, f), { questions: [] }); for (const q of d.questions) CIVICS.push(q); }
  return CIVICS;
}
function fameMap(spec) {
  const m = new Map(); // key -> number of matching questions that list it
  for (const q of civicsQuestions()) {
    if (spec.category && q.category !== spec.category) continue;
    if (spec.prompt && !spec.prompt.test(q.prompt)) continue;
    const seen = new Set();
    for (const a of q.answers) for (const k of [a.name, ...(a.aliases || [])]) { const nk = norm(k); if (nk && !seen.has(nk)) { seen.add(nk); m.set(nk, (m.get(nk) || 0) + 1); } }
  }
  return m;
}

/* ---------- row loading ---------- */
const CTX = { DATA, OLD, readJson, INTROS, VIEWS, stripParen, norm };
function loadRows(c) {
  if (c.rows) return c.rows(CTX);   // custom loader (Census places/counties, world leaders): returns [{name, full, score, views, y, q, aliases?, states?}]
  const keys = Array.isArray(c.source) ? c.source : [c.source];
  const out = [];
  for (const key of keys) {
    const S = require('./dh-curated2-config.js').SOURCES.find(s => s.key === key);
    const raw = S.inlineFile ? readJson(path.join(__dirname, S.inlineFile), { cases: [] }).cases.map(([t, y, al]) => ({ t, y, s: 0, st: 0, q: '', aliases: al, manual: true })) : S.reuse ? readJson(path.join(OLD, S.reuse), []) : readJson(path.join(DATA, key + '.json'), []);
    for (const r of raw) {
      if (BAD_TITLE.test(r.t)) continue;
      const intro = INTROS[r.t] || '';
      const v = VIEWS[r.t] > 0 ? VIEWS[r.t] : 0;
      let y = r.y;
      if (c.yearFrom) { const yy = c.yearFrom(r, intro); if (yy != null) y = yy; }
      const useYears = !c.yearSources || c.yearSources.includes(key);
      if (useYears && (c.lo != null || c.hi != null)) { if (y == null) continue; if (c.lo != null && y < c.lo) continue; if (c.hi != null && y > c.hi) continue; }
      if (c.where && !c.where(r, intro, y, key)) continue;
      const base = c.keepParen ? r.t : stripParen(r.n || r.t);
      if (!base || base.length > 90) continue;
      out.push({ name: base, full: r.t[0] === '~' ? base : r.t, score: (r.s || 0) * 1000 + Math.min(r.st || 0, 999), views: v, y, q: r.q, intro, aliases: (r.n && stripParen(r.t) !== base && r.t[0] !== '~' ? [stripParen(r.t)] : []).concat(r.aliases || []) });
    }
  }
  return out;
}

function tierCuts(c, n) {
  const d = c.cuts || [0.01, 0.04, 0.12, 0.3];
  return d.map((v, i) => v < 1 ? Math.max(i === 0 ? 5 : 0, Math.round(n * v)) : v);
}

const TITLES = {}, PREVIEW = [];
function buildQuestion(c, id) {
  let items = loadRows(c);
  if (c.mergeByTitle) { const seen = new Map(); items = items.filter(it => { const k = it.full; if (seen.has(k)) { seen.get(k).aliases.push(it.name); return false; } seen.set(k, it); return true; }); }
  const byKey = new Map();
  for (const it of items) {
    const k = norm(it.name); if (!k) continue;
    const e = byKey.get(k);
    if (!e) { byKey.set(k, Object.assign({ alt: new Set(it.aliases || []) }, it)); continue; }
    (it.aliases || []).forEach(a => e.alt.add(a));
    if (it.score > e.score) Object.assign(e, { score: it.score, views: it.views, y: it.y, q: it.q, full: it.full, intro: it.intro });
  }
  const ents = [...byKey.values()].sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  const n = ents.length;
  const min = c.min || 150;
  if (n < min) return { skip: `only ${n} distinct answers (minimum ${min})` };
  if (n > 5000) return { skip: `${n} distinct answers (over 5000)` };
  const cut = tierCuts(c, n);
  ents.forEach((e, i) => { e.weight = i < cut[0] ? 1 : i < cut[1] ? 2 : i < cut[2] ? 3 : i < cut[3] ? 4 : 5; });
  let fameHits = 0;
  if (c.fame && c.kind === 'case') {
    const fm0 = fameMap(c.fame), have = new Set(); for (const e of ents) { have.add(norm(e.name)); for (const a of e.alt || []) have.add(norm(a)); }
    for (const [k] of fm0) {
      if (have.has(k) || k.length < 8) continue;
      const hits = ents.filter(e => norm(e.name).startsWith(k + ' '));
      if (hits.length === 1) { hits[0].alt = hits[0].alt || new Set(); hits[0].alt.add(k); have.add(k); }
    }
  }
  if (c.fame) {
    const fm = fameMap(c.fame);
    for (const e of ents) {
      const keys = new Set([norm(e.name), ...[...(e.alt || [])].map(norm), ...((c.kind === 'case' || c.kind === 'battle') ? [] : aliasesFor(c.kind, e.name)).map(norm), ...(((MALIAS[c.key] || {})[e.name]) || []).map(norm)]);
      let cnt = 0; for (const k of keys) if (k && fm.get(k) > cnt) cnt = fm.get(k);
      const F = c.fame, t1 = F.t1 || 99, t2 = F.t2 || 99, mention = F.mention || 3, floor = F.floor || 1;
      const before = e.weight;
      if (cnt) e.weight = cnt >= t1 ? 1 : cnt >= t2 ? 2 : Math.min(e.weight, mention);
      else e.weight = Math.max(e.weight, floor);
      if (e.weight !== before) fameHits++;
    }
  }
  if (c.manualTiers) { // hand-set tiers for answers every civics student knows (the list has no usable fame proxy for most terms)
    const mt = new Map(); for (const [t, list] of Object.entries(c.manualTiers)) for (const n of list) mt.set(norm(n), +t);
    for (const e of ents) { const t = mt.get(norm(e.name)); if (t) e.weight = t; }
  }
  // aliases
  const owner = new Map(); ents.forEach((e, i) => owner.set(norm(e.name), i));
  const genCount = new Map();
  ents.forEach(e => { for (const a of aliasesFor(c.kind, e.name)) genCount.set(norm(a), (genCount.get(norm(a)) || 0) + 1); });
  ents.forEach((e, i) => {
    let gen = aliasesFor(c.kind, e.name);
    if (c.kind === 'battle' || c.kind === 'case') gen = e.weight <= 2 ? gen.filter(a => genCount.get(norm(a)) === 1 && !owner.has(norm(a)) && !ALIAS_BLOCK.has(norm(a))) : [];
    else if (c.kind === 'act' || c.kind === 'ship' || c.kind === 'coup' || c.kind === 'nps' || c.kind === 'scandal' || c.kind === 'person') gen = gen.filter(a => genCount.get(norm(a)) <= 1 && !owner.has(norm(a)) && !ALIAS_BLOCK.has(norm(a)));
    const cand = [...e.alt, ...gen, ...((MALIAS[c.key] || {})[e.name] || [])];
    if (c.kind === 'place') for (const st of (e.states || [])) { cand.push(e.name + ', ' + st); if (STATE_ABBR[st]) cand.push(e.name + ', ' + STATE_ABBR[st]); }
    e.aliases = []; const mine = new Set([norm(e.name)]);
    for (const a of cand) { const k = norm(a); if (!k || mine.has(k) || owner.has(k) || k.length < 3) continue; owner.set(k, i); mine.add(k); e.aliases.push(a); }
  });
  const jp = JACK[c.key]; let jpEnt = null;
  if (jp) { jpEnt = ents.find(e => e.full === jp.title || e.name === jp.title); if (jpEnt) { jpEnt.weight = 5; jpEnt.jackpot = true; jpEnt.jnote = jp.note; } else console.log('JACKPOT NOT FOUND', c.key, jp.title); }
  const answers = ents.map(e => {
    const a = { name: e.name };
    if (e.aliases.length) a.aliases = e.aliases;
    a.weight = e.weight;
    if (!SURNAME_KINDS.has(c.kind) || (c.kind === 'person' && /\s(?:[IVX]+|\d+)$/.test(e.name))) a.surname = false;
    if (e.jackpot) { a.jackpot = true; a.note = e.jnote; }
    return a;
  });
  const hist = [0, 0, 0, 0, 0]; ents.forEach(e => hist[e.weight - 1]++);
  TITLES[id] = Object.fromEntries(ents.filter(e => e.full).map((e, i) => [e.name, [e.full, e.q, e.y, e.views, e.weight]]));
  PREVIEW.push(`\n=== ${c.key} (${id}) n=${n} cuts=${cut} hist=${hist}\nTOP: ${ents.slice(0, 45).map(e => e.name + ' [' + (e.views || e.score) + ']').join('; ')}\nTIER2 sample: ${ents.slice(cut[0], cut[1]).filter((_, i) => i % Math.max(1, Math.floor((cut[1] - cut[0]) / 12)) === 0).map(e => e.name).join('; ')}\nTIER3 sample: ${ents.slice(cut[1], cut[2]).filter((_, i) => i % Math.max(1, Math.floor((cut[2] - cut[1]) / 10)) === 0).map(e => e.name).join('; ')}\nTIER5 sample: ${ents.slice(cut[3]).filter((_, i) => i % Math.max(1, Math.floor((n - cut[3]) / 12)) === 0).map(e => e.name).join('; ')}`);
  return { q: { id, category: c.cat, prompt: c.prompt, difficulty: c.diff, note: c.note, answers }, n, cut, hist, jackpot: jpEnt ? jpEnt.name : null, fameHits };
}

// ---- main ----
const questions = [], report = [], dropped = [];
for (const c of QUESTIONS) {
  if (DROP[c.key]) { dropped.push([c.key, 'dropped: ' + DROP[c.key]]); continue; }
  const id = IDS[c.key] || 'curated2-' + String(Math.max(0, ...Object.values(IDS).map(v => +v.slice(9))) + 1).padStart(4, '0');
  const r = buildQuestion(c, id);
  if (r.skip) { dropped.push([c.key, r.skip]); continue; }
  IDS[c.key] = id;
  questions.push(r.q);
  report.push({ key: c.key, id, cat: c.cat, diff: c.diff, n: r.n, hist: r.hist, cut: r.cut, jackpot: r.jackpot, fameHits: r.fameHits, src: c.src, prompt: c.prompt, source: c.source });
}
const files = []; let cur = [], size = 0;
for (const q of questions) { const s = JSON.stringify(q).length; if (cur.length && size + s > FILE_LIMIT) { files.push(cur); cur = []; size = 0; } cur.push(q); size += s; }
if (cur.length) files.push(cur);
require('./dh-bank-guard')(OUTDIR, /^bank-curated2-\d+\.json$/, 'build-dh-curated-2.js');
for (const f of fs.readdirSync(OUTDIR)) if (/^bank-curated2-\d+\.json$/.test(f)) fs.unlinkSync(path.join(OUTDIR, f));
files.forEach((qs, i) => fs.writeFileSync(path.join(OUTDIR, `bank-curated2-${i + 1}.json`), JSON.stringify({ bank: 'curated2-' + (i + 1), questions: qs })));
fs.writeFileSync(path.join(DATA, '_titles.json'), JSON.stringify(TITLES));
fs.writeFileSync(path.join(DATA, '_ids2.json'), JSON.stringify(IDS, null, 1));
fs.writeFileSync(path.join(DATA, '_report.json'), JSON.stringify({ report, dropped, files: files.length }, null, 1));
if (process.argv.includes('--preview')) fs.writeFileSync(path.join(DATA, '_preview.txt'), PREVIEW.join('\n'));
console.log(`${questions.length} questions in ${files.length} file(s); dropped ${dropped.length}; answers ${report.reduce((a, r) => a + r.n, 0)}`);
for (const r of report) console.log(`${r.id} ${r.key.padEnd(30)} ${String(r.n).padStart(5)} answers  tiers ${r.hist.join('/')}${r.jackpot ? '  jackpot: ' + r.jackpot : ''}`);
for (const d of dropped) console.log('DROPPED', d[0], '-', d[1]);
