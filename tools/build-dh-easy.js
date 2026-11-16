#!/usr/bin/env node
'use strict';
/* Easy, broad Dark Horse questions (2026-11-16 request: "too hard"; casual players should name something within 30 seconds).
   Writes site/games/dark-horse/data/bank-easy-1.json (ids easy-0001...). Most questions are unions of small, already fact-checked
   answer lists from the people/civics banks (presidents, vice presidents, First Ladies, justices, Cabinet posts, current Congress and
   governors, state capitals); three use new data: tools/dh-easy-countries.json (UN members and capitals) and the Census Bureau
   Vintage 2023 place estimates (audit/dh-curated-data/us-places-10k.json, cities of 100,000+).
   Answers keep their source weights (lowest wins when merged) and aliases; the Dark Horse answer reuses a source question's checked
   jackpot and note where possible. Every question is compared with every question of every other bank (Jaccard of normalised
   answer names must be <= 0.80). Usage: node site/tools/build-dh-easy.js [--dry]                                                    */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const DATA = path.join(ROOT, 'site', 'games', 'dark-horse', 'data');
const DRY = process.argv.includes('--dry');
function norm(s) { s = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); s = s.replace(/&/g, ' and ').replace(/['’ʻ`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); const t = s.split(' ').filter(w => w && w !== 'jr' && w !== 'sr'); if (t.length > 1 && t[0] === 'the') t.shift(); return t.join(' '); }
const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const SRC = {}; for (const f of fs.readdirSync(DATA).filter(f => /^bank-.+\.json$/.test(f) && f !== 'bank-easy-1.json' && f !== 'bank-sample.json')) for (const q of JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')).questions) SRC[q.id] = q;
const src = id => { const q = SRC[id]; if (!q) throw new Error('missing source ' + id); return q.answers.map(a => Object.assign({}, a)); };

/* ---- new data ---- */
const STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const BIG10 = new Set(['California', 'Texas', 'Florida', 'New York', 'Pennsylvania', 'Illinois', 'Ohio', 'Georgia', 'North Carolina', 'Michigan', 'New Jersey', 'Virginia', 'Washington', 'Arizona', 'Massachusetts', 'Tennessee', 'Indiana', 'Maryland', 'Missouri', 'Wisconsin', 'Colorado', 'Minnesota', 'Alaska', 'Hawaii', 'Louisiana']);
const states = () => STATES.map(s => ({ name: s, aliases: s === 'Washington' ? ['Washington State'] : [], weight: BIG10.has(s) ? 1 : 2, surname: false }));
const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'dh-easy-countries.json'), 'utf8')).countries;
const rankW = (n, i, cuts) => i < cuts[0] ? 1 : i < cuts[1] ? 2 : i < cuts[2] ? 3 : i < cuts[3] ? 4 : 5;
const countries = () => C.slice().sort((a, b) => b.sitelinks - a.sitelinks).map((c, i, arr) => ({ name: c.name, aliases: c.aliases.slice(), weight: rankW(arr.length, i, [45, 95, 140, 175]), surname: false }));
const natCapitals = () => { const out = []; C.slice().sort((a, b) => b.sitelinks - a.sitelinks).forEach((c, i) => c.capitals.forEach(k => out.push({ name: k.name, aliases: k.aliases.slice(), weight: rankW(0, i, [40, 90, 140, 175]), surname: false }))); return out; };
const PLACE_FIX = { 'Urban Honolulu CDP': 'Honolulu', 'Nashville-Davidson metropolitan government (balance)': 'Nashville', 'Louisville/Jefferson County metro government (balance)': 'Louisville', 'Lexington-Fayette urban county': 'Lexington', 'Athens-Clarke County unified government (balance)': 'Athens', 'Augusta-Richmond County consolidated government (balance)': 'Augusta', 'Macon-Bibb County': 'Macon', 'Indianapolis city (balance)': 'Indianapolis', 'Anchorage municipality': 'Anchorage' };
const ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
function cities() {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit', 'dh-curated-data', 'us-places-10k.json'), 'utf8')).filter(r => r.pop >= 100000);
  const base = r => PLACE_FIX[r.n] || r.n.replace(/\s*\((balance|part)\)\s*$/i, '').replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|metro government|municipality|city|town|village|borough|CDP)$/i, '').trim();
  const seenBS = new Set(); const list = rows.map(r => ({ b: base(r), st: r.st, pop: r.pop, n: r.n })).sort((a, b) => b.pop - a.pop).filter(x => { const k = norm(x.b) + '|' + x.st; if (seenBS.has(k)) return false; seenBS.add(k); return true; }); // New England towns repeat their city
  const dup = {}; list.forEach(x => dup[norm(x.b)] = (dup[norm(x.b)] || 0) + 1); const firstOf = new Set();
  return list.map((x, i) => { const two = dup[norm(x.b)] > 1; const largest = two && !firstOf.has(norm(x.b)); if (two) firstOf.add(norm(x.b)); return { name: two ? `${x.b}, ${x.st}` : x.b, aliases: two ? [`${x.b}, ${ABBR[x.st]}`].concat(largest ? [x.b] : []) : [`${x.b}, ${x.st}`, `${x.b}, ${ABBR[x.st]}`], weight: rankW(0, i, [25, 60, 130, 230]), surname: false, _pop: x.pop, _st: x.st, _full: x.n }; });
}

/* ---- the questions ---- */
const CUR = 'Current officeholders as listed in November 2026 (119th Congress; governors before the winners of the November 3, 2026 elections take office).';
const Q = [
  { key: 'pres-vp-fl', parts: ['people-0001', 'people-0030', 'people-0040'], jp: ['people-0040', 'people-0030'], cat: 'presidents', prompt: 'Name a U.S. president, vice president or First Lady', note: 'Anyone who has been president, vice president or First Lady of the United States counts.' },
  { key: 'pres-vp-loser', parts: ['people-0001', 'people-0030', 'people-0121'], jp: ['people-0121', 'people-0030'], cat: 'presidents', prompt: 'Name a U.S. president, a vice president, or a major-party presidential nominee who lost', note: 'Presidents, vice presidents and every Democratic, Republican, Whig or other major-party presidential nominee who lost the general election count.' },
  { key: 'pres-justice', parts: ['people-0001', 'people-0045'], jp: ['people-0045'], cat: 'supreme-court', prompt: 'Name a U.S. president or a Supreme Court justice (past or present)', note: 'Any president and any justice who has served on the U.S. Supreme Court counts.' },
  { key: 'pres-sos', parts: ['people-0001', 'people-0058'], jp: ['people-0058'], cat: 'cabinet', prompt: 'Name a U.S. president or a U.S. Secretary of State', note: 'Any president and anyone confirmed as Secretary of State counts.' },
  { key: 'pres-treasury', parts: ['people-0001', 'people-0059'], jp: ['people-0059'], cat: 'cabinet', prompt: 'Name a U.S. president or a U.S. Secretary of the Treasury', note: 'Any president and anyone confirmed as Secretary of the Treasury counts.' },
  { key: 'pres-speaker', parts: ['people-0001', 'people-0086'], jp: ['people-0086'], cat: 'congress-leadership', prompt: 'Name a U.S. president or a Speaker of the House', note: 'Any president and anyone who has been Speaker of the U.S. House of Representatives counts.' },
  { key: 'vp-speaker', parts: ['people-0030', 'people-0086'], jp: ['people-0030', 'people-0086'], cat: 'vice-presidents', prompt: 'Name a U.S. vice president or a Speaker of the House', note: 'Anyone who has been vice president or Speaker of the U.S. House of Representatives counts.' },
  { key: 'pres-fl-founder', parts: ['people-0001', 'people-0040', 'people-0108'], jp: ['people-0108', 'people-0040'], cat: 'first-ladies', prompt: 'Name a U.S. president, a First Lady or a Founding Father', note: 'Presidents, First Ladies and the Founding Fathers (signers of the Declaration of Independence or Constitution and other leaders usually counted among them) count.' },
  { key: 'vp-ticket-loser', parts: ['people-0030', 'people-0121', 'people-0122'], jp: ['people-0122', 'people-0121'], cat: 'campaigns', prompt: 'Name a U.S. vice president or anyone who ran on a losing major-party presidential ticket', note: 'Vice presidents, and every losing major-party nominee for president or vice president, count.' },
  { key: 'cabinet-big3', parts: ['people-0058', 'people-0059', 'people-0060'], jp: ['people-0060', 'people-0059'], cat: 'executive-branch', prompt: 'Name a U.S. Secretary of State, Secretary of the Treasury or Secretary of Defense', note: 'Anyone confirmed to lead the State Department, the Treasury or the Defense Department counts.' },
  { key: 'senator-governor-ran', parts: ['people-0125', 'people-0144'], jp: ['people-0144', 'people-0125'], cat: 'campaigns', prompt: 'Name a U.S. senator or state governor (current or former) who ran for president', note: 'Anyone who served as a U.S. senator or a state governor and sought the presidency, as a nominee or in the primaries, counts.' },
  { key: 'women-senate-gov', parts: ['people-0317', 'people-0098'], jp: ['people-0098', 'people-0317'], cat: 'political-firsts', prompt: 'Name a woman who has served in the U.S. Senate or as governor of a state', note: 'Any woman who has served as a U.S. senator or as a state governor counts.' },
  { key: 'cur-senate-gov', parts: ['people-0333', 'people-0094'], jp: ['people-0333'], cat: 'current-congress', prompt: 'Name a current U.S. senator or a current state governor', note: CUR },
  { key: 'cur-congress-gov', parts: ['people-0337', 'people-0333', 'people-0094'], jp: ['people-0337'], cat: 'current-congress', prompt: 'Name a current member of Congress (House or Senate) or a current state governor', note: CUR },
  { key: 'gov-big4', parts: ['people-0100', 'people-0099', 'people-0101', 'people-0102'], jp: ['people-0100', 'people-0099', 'people-0101', 'people-0102'], cat: 'governors', prompt: 'Name a governor (past or present) of New York, California, Texas or Florida', note: 'Anyone who has served as governor of New York, California, Texas or Florida counts, including acting governors listed by the state.' },
  { key: 'sen-ca-ny-tx', parts: ['people-0149', 'people-0152', 'people-0150'], jp: ['people-0149', 'people-0152', 'people-0150'], cat: 'senators', prompt: 'Name someone who has served as a U.S. senator from California, New York or Texas', note: 'Anyone who has represented California, New York or Texas in the U.S. Senate, at any time, counts.' },
  { key: 'sen-il-ma-az', parts: ['people-0154', 'people-0164', 'people-0162'], jp: ['people-0154', 'people-0164', 'people-0162'], cat: 'senators', prompt: 'Name someone who has served as a U.S. senator from Illinois, Massachusetts or Arizona', note: 'Anyone who has represented Illinois, Massachusetts or Arizona in the U.S. Senate, at any time, counts.' },
  { key: 'sen-fl-ga-oh', parts: ['people-0151', 'people-0156', 'people-0155'], jp: ['people-0151', 'people-0156', 'people-0155'], cat: 'senators', prompt: 'Name someone who has served as a U.S. senator from Florida, Georgia or Ohio', note: 'Anyone who has represented Florida, Georgia or Ohio in the U.S. Senate, at any time, counts.' },
  { key: 'primaries-2000-2024', parts: ['people-0116', 'people-0117', 'people-0118', 'people-0119', 'people-0120', '@primaries'], jp: ['people-0117', 'people-0118', 'people-0119', 'people-0120', 'people-0116'], cat: 'campaigns', prompt: 'Name someone who ran for the Democratic or Republican presidential nomination between 2000 and 2024', note: 'Major candidates in the Democratic and Republican presidential nomination contests from 2000 through 2024 count, including those who withdrew before the first votes; Kamala Harris counts as the 2024 Democratic nominee.' },
  { key: 'state-or-capital', parts: ['@states', 'civics-0209'], jp: ['civics-0209'], cat: 'states', prompt: 'Name a U.S. state or a state capital', note: 'Any of the 50 states and any of their 50 capital cities count.' },
  { key: 'capitals', parts: ['civics-0209', '@natcapitals'], jp: ['@palau'], cat: 'geography', prompt: 'Name a U.S. state capital or the capital city of a country', note: 'Any of the 50 state capitals, and the capital of any of the 193 United Nations member countries (as designated by that country; where a country names more than one, each counts), count.' },
  { key: 'un-members', parts: ['@countries'], jp: ['@tuvalu'], cat: 'geography', prompt: 'Name a country that is a member of the United Nations', note: 'All 193 UN member states count. Observers (the Holy See and Palestine) and places that are not members (such as Taiwan and Kosovo) do not.' },
  { key: 'big-cities', parts: ['@cities'], jp: ['@city'], cat: 'states', prompt: 'Name a U.S. city with at least 100,000 residents', note: 'Every incorporated place with 100,000 or more residents in the Census Bureau 2023 estimates counts (consolidated city-counties such as Nashville and Louisville included).' },
];
const PRIM = JSON.parse(fs.readFileSync(path.join(__dirname, 'dh-easy-primaries.json'), 'utf8'));
const primaries = () => { const seen = new Set(); const out = []; for (const list of Object.values(PRIM.cycles)) for (const n of list) if (!seen.has(n)) { seen.add(n); out.push({ name: n, aliases: (PRIM.aliases[n] || []).slice(), weight: 3 }); } return out; };
const SPECIAL = { '@primaries': primaries, '@states': states, '@countries': countries, '@natcapitals': natCapitals, '@cities': cities };
const CUSTOM_JP = {
  '@palau': { name: 'Ngerulmud', note: 'Palau’s seat of government since 2006, in Melekeok State on the island of Babeldaob.' },
  '@tuvalu': { name: 'Tuvalu', note: 'A Pacific island nation of about 11,000 people, it joined the United Nations in 2000.' },
};

const existing = []; for (const q of Object.values(SRC)) existing.push({ id: q.id, set: new Set(q.answers.map(a => norm(a.name))) });
const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
const out = [], report = [];
Q.forEach((c, n) => {
  const by = new Map(); const keyOf = new Map(); const full = new Map(); // by: norm name -> merged answer; full: norm multi-word alias -> merged answer
  for (const p of c.parts) for (const a of (SPECIAL[p] ? SPECIAL[p]() : src(p))) {
    // merge only on full names (the answer's name, or a multi-word alias equal to another answer's name), never on short aliases like a bare surname
    const keys = [a.name, ...(a.aliases || []).filter(x => /s/.test(x.trim()))].map(norm);
    let hit = null; for (const k of keys) { const h = by.get(k) || full.get(k); if (h) { hit = h; break; } }
    if (!hit) { hit = { name: a.name, aliases: [], weight: a.weight || 3, surname: a.surname, _pop: a._pop, _st: a._st, _full: a._full }; by.set(norm(a.name), hit); }
    else hit.weight = Math.min(hit.weight, a.weight || 3);
    for (const al of [a.name, ...(a.aliases || [])]) { const k = norm(al); if (/s/.test(al.trim()) && !full.has(k)) full.set(k, hit); if (!keyOf.has(k)) { keyOf.set(k, hit); if (k !== norm(hit.name) && !hit.aliases.includes(al)) hit.aliases.push(al); } }
  }
  const ans = [...by.values()];
  // Dark Horse answer
  let jp = null;
  for (const j of c.jp) {
    if (j === '@city') { const cands = ans.filter(a => a._pop && a._pop < 110000).sort((a, b) => a.name.localeCompare(b.name)); const x = cands[Math.floor(cands.length / 2)]; if (x) { jp = x; x.note = `A city of about ${Math.round(x._pop / 1000)},000 people in ${x._st} (Census Bureau 2023 estimate).`; } break; }
    if (CUSTOM_JP[j]) { const x = ans.find(a => norm(a.name) === norm(CUSTOM_JP[j].name)); if (x) { jp = x; x.note = CUSTOM_JP[j].note; } break; }
    const sj = (SRC[j].answers || []).find(a => a.jackpot); if (!sj) continue;
    const x = ans.find(a => norm(a.name) === norm(sj.name)); if (x && x.weight >= 3) { jp = x; x.note = sj.note; break; }
  }
  if (jp) { jp.weight = 5; jp.jackpot = true; }
  const answers = ans.map(a => { const o = { name: a.name }; if (a.aliases.length) o.aliases = a.aliases; o.weight = a.weight; if (a.surname === false) o.surname = false; if (a.jackpot) { o.jackpot = true; o.note = a.note; } return o; });
  const id = 'easy-' + String(n + 1).padStart(4, '0');
  const set = new Set(answers.map(a => norm(a.name)));
  let worst = { j: 0, id: '' }; for (const e of existing) { const j = jac(set, e.set); if (j > worst.j) worst = { j, id: e.id }; }
  for (const o of out) { const j = jac(set, new Set(o.answers.map(a => norm(a.name)))); if (j > worst.j) worst = { j, id: o.id }; }
  out.push({ id, category: c.cat, prompt: c.prompt, difficulty: 1, note: c.note, answers });
  const h = [0, 0, 0, 0, 0]; answers.forEach(a => h[a.weight - 1]++);
  report.push(`${id} ${c.key.padEnd(22)} ${String(answers.length).padStart(4)} tiers ${h.join('/')} overlap ${worst.j.toFixed(2)} ${worst.id} JP: ${jp ? jp.name + ' | ' + jp.note : 'NONE'}`);
});
console.log(report.join('\n'));
const bad = report.filter(r => / overlap 0\.(8[1-9]|9)/.test(r) || /JP: NONE/.test(r) || /^\S+ \S+\s+(\d{1,2}|[0-9]{1,2}) /.test(r));
if (bad.length) console.log('PROBLEMS:\n' + bad.join('\n'));
if (!DRY) { fs.writeFileSync(path.join(DATA, 'bank-easy-1.json'), JSON.stringify({ bank: 'easy-1', questions: out })); console.log('wrote bank-easy-1.json', out.length); }
