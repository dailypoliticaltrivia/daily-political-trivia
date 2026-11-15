'use strict';
/* Shared definitions for the Dark Horse "curated" banks: one entry per question.
   Each entry says WHERE the answer list comes from (a Wikidata query or a Census file) and how to word the question.
   fetch-dh-curated.js downloads the lists into audit/dh-curated-data/<key>.json; build-dh-curated.js turns them into bank-curated-N.json.
   Wikidata is queried only for items that have an English Wikipedia article (so every accepted answer has a public reference page). */
const Q = [];
const add = (o) => Q.push(Object.assign({ diff: 2, kind: 'plain', score: 'sitelinks' }, o));

/* ---------------- Law and courts ---------------- */
add({ key: 'sc-cases', cat: 'supreme-court', diff: 1, kind: 'case',
  prompt: 'Name a case decided by the U.S. Supreme Court',
  note: 'Any U.S. Supreme Court case that has its own English Wikipedia article counts (landmark or obscure, any era).',
  src: 'Wikidata items with court (P4884) = Supreme Court of the United States (Q11201) and an enwiki article',
  q: { pattern: '?x wdt:P4884 wd:Q11201.', date: 'wdt:P577|wdt:P585|wdt:P571' }, jackpotYear: 'Decided in {y}.' });
add({ key: 'us-prisons', cat: 'civics-basics',
  prompt: 'Name a prison, jail or detention facility in the United States',
  note: 'Federal, state, local or private prisons, jails and detention centers (current or closed) that have an English Wikipedia article count.',
  src: 'Wikidata instance of prison (Q40357, direct instances) located in the United States, with enwiki article',
  q: { pattern: '?x wdt:P31 wd:Q40357; wdt:P17 wd:Q30.', date: 'wdt:P571' }, jackpotYear: 'Opened in {y}.' });
add({ key: 'scandals', cat: 'political-terms',
  prompt: 'Name a political scandal or affair from anywhere in the world',
  note: 'Any political scandal, affair, or corruption case with its own English Wikipedia article counts (any country or era).',
  src: 'Wikidata instance of political scandal (Q934744, incl. subclasses) with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q934744.' } });

/* ---------------- Wars and battles ---------------- */
const battleEras = [
  ['battles-pre1500', 'Name a battle fought before the year 1500 (anywhere in the world)', null, 1499],
  ['battles-1500-1799', 'Name a battle fought between 1500 and 1799 (anywhere in the world)', 1500, 1799],
  ['battles-1800-1913', 'Name a battle fought between 1800 and 1913 (anywhere in the world)', 1800, 1913],
  ['battles-ww1', 'Name a battle fought between 1914 and 1918 (the years of World War I; anywhere in the world)', 1914, 1918],
  ['battles-ww2', 'Name a battle fought between 1939 and 1945 (the years of World War II; anywhere in the world)', 1939, 1945],
  ['battles-1946', 'Name a battle fought since 1946 (anywhere in the world)', 1946, null],
];
for (const [key, prompt, lo, hi] of battleEras) add({ key, cat: 'wars-foreign-policy', kind: 'battle', prompt, diff: key === 'battles-ww2' ? 1 : 2,
  note: 'Any battle, siege or engagement that has its own English Wikipedia article and a recorded start date in that period counts, whatever war it belonged to. Years are taken from the start date.',
  src: 'Wikidata instance of battle (Q178561 and subclasses) with a point-in-time/start date, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q178561.', date: 'wdt:P585|wdt:P580', lo, hi }, jackpotYear: 'Fought in {y}.' });
add({ key: 'battles-us-soil', cat: 'wars-foreign-policy', diff: 1, kind: 'battle',
  prompt: 'Name a battle or siege fought on what is now U.S. territory (any era)',
  note: 'Any battle, siege or engagement located in the present-day United States (colonial, Revolutionary, Indian Wars, Civil War, etc.) with an English Wikipedia article counts.',
  src: 'Wikidata battles whose location (P276/P131 chain) lies in a U.S. state, D.C. or a U.S. territory (Puerto Rico, Guam, USVI, N. Mariana Is., American Samoa), with enwiki article; the recheck replaced the earlier loose country (P17) test',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q178561. ?x wdt:P276|wdt:P131 ?loc. ?loc wdt:P131* ?usarea. { ?usarea wdt:P31 wd:Q35657 } UNION { VALUES ?usarea { wd:Q1183 wd:Q16635 wd:Q11703 wd:Q16644 wd:Q16641 wd:Q61 } }', date: 'wdt:P585|wdt:P580' }, jackpotYear: 'Fought in {y}.' });
const warEras = [
  ['wars-pre1800', 'Name a war, rebellion, uprising or civil war that began before 1800 (anywhere in the world)', null, 1799],
  ['wars-1800-1945', 'Name a war, rebellion, uprising or civil war that began between 1800 and 1945 (anywhere in the world)', 1800, 1945],
];
for (const [key, prompt, lo, hi] of warEras) add({ key, cat: 'history', kind: 'war', prompt,
  note: 'Wars, rebellions, revolts, uprisings and civil wars with their own English Wikipedia article and a recorded start date in that period count.',
  src: 'Wikidata instances of war (Q198), rebellion (Q124734) and civil war (Q8465) with a start date, with enwiki article',
  q: { pattern: 'VALUES ?c { wd:Q198 wd:Q124734 wd:Q8465 } ?x wdt:P31 ?c.', date: 'wdt:P580|wdt:P585', lo, hi }, jackpotYear: 'Began in {y}.' });
add({ key: 'milops', cat: 'wars-foreign-policy',
  prompt: 'Name a military operation, campaign or offensive that began in 1900 or later',
  note: 'Code-named operations, named campaigns, offensives and raids (e.g. Operation Overlord) with an English Wikipedia article and a start year of 1900 or later count.',
  src: 'Wikidata instance of military operation (Q645883) with date >= 1900, with enwiki article',
  q: { pattern: '?x wdt:P31 wd:Q645883.', date: 'wdt:P580|wdt:P585', lo: 1900, hi: null }, jackpotYear: 'Began in {y}.' });
const hist = [
  ['former-states-pre1800', 'Name a country, kingdom, empire or other state that ceased to exist before 1800', null, 1799],
  ['former-states-1800-1945', 'Name a country, kingdom, empire or other state that ceased to exist between 1800 and 1945', 1800, 1945],
  ['former-states-1946', 'Name a country or state that ceased to exist in 1946 or later (for example a dissolved federation or republic)', 1946, null],
];
for (const [key, prompt, lo, hi] of hist) add({ key, cat: 'history', kind: 'state', prompt,
  note: 'Historical states, kingdoms, empires, republics and similar entities with an English Wikipedia article and a recorded dissolution year in that period count.',
  src: 'Wikidata instance of historical country (Q3024240 and subclasses) with a dissolved date (P576), with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q3024240.', date: 'wdt:P576', lo, hi }, jackpotYear: 'Dissolved in {y}.' });
add({ key: 'dynasties', cat: 'history',
  prompt: 'Name a dynasty or ruling royal house from anywhere in history',
  note: 'Dynasties and ruling houses with an English Wikipedia article count (for example Habsburg, Ming, Romanov).',
  src: 'Wikidata instance of dynasty (Q164950) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q164950.' } });
const treaties = [
  ['treaties-pre1800', 'Name a treaty signed before 1800', null, 1799],
  ['treaties-1800-1945', 'Name a treaty signed between 1800 and 1945', 1800, 1945],
  ['treaties-1946', 'Name a treaty, convention or accord signed in 1946 or later', 1946, null],
];
for (const [key, prompt, lo, hi] of treaties) add({ key, cat: 'wars-foreign-policy', kind: 'treaty', prompt,
  note: 'Treaties, conventions, accords and peace agreements (including treaties between a government and an Indigenous nation, such as the numbered treaties of Canada or U.S. treaties with tribes) with an English Wikipedia article and a recorded year in that period count. Declarations, charters and edicts do not.',
  src: 'Wikidata instance of treaty (Q131569 and subclasses) with a date, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q131569.', date: 'wdt:P577|wdt:P585|wdt:P571', lo, hi }, jackpotYear: 'Dated {y}.' });

/* ---------------- Politics and organizations ---------------- */
add({ key: 'us-parties', cat: 'elections', kind: 'party',
  prompt: 'Name a political party that has existed in the United States (major, minor, historical or state-level)',
  note: 'Any U.S. political party with an English Wikipedia article counts, including defunct, third and state-level parties.',
  src: 'Wikidata instance of political party (Q7278) with country (P17) United States, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q7278; wdt:P17 wd:Q30.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
const regions = [['Q46', 'a European country, founded before 1990', 'europe-old', 1989, null], ['Q46', 'a European country, founded in 1990 or later', 'europe-new', null, 1990], ['Q48', 'an Asian country', 'asia'], ['Q15', 'an African country', 'africa'], ['Q18', 'a South American country', 's-america'], ['Q49', 'a North American country (including Canada, Mexico, Central America and the Caribbean)', 'n-america']];
for (const [qid, label, tag, hi, lo] of regions) add({ key: 'parties-' + tag, cat: 'political-parties', kind: 'party', minS: 6,
  prompt: tag === 'n-america' ? 'Name a political party from Canada, Mexico, Central America or the Caribbean (not the United States; current or historical)' : tag === 'europe-old' ? 'Name a European political party founded before 1990 (current or defunct)' : tag === 'europe-new' ? 'Name a European political party founded in 1990 or later (current or defunct)' : 'Name a political party from ' + label + ' (current or historical)',
  note: 'Any political party with an English Wikipedia article (and articles in at least six languages, so that the entry can be checked) whose home country is on that continent counts, including defunct and regional or state-level parties. Alliances, coalitions, movements and other non-party groups do not count. Countries that straddle two continents are counted on one side only: Turkey, Georgia, Armenia, Azerbaijan and Kazakhstan as Asia; Russia and Cyprus as Europe; Egypt as Africa.' + (tag.startsWith('europe') ? ' Only parties with a recorded founding year in the stated period count.' : ''),
  src: 'Wikidata instance of political party (Q7278) with country (P17) located on continent ' + qid + ', with enwiki article',
  q: { continent: qid, date: 'wdt:P571', hi: hi == null ? null : hi, lo: lo == null ? null : lo }, jackpotYear: 'Founded in {y}.' });
add({ key: 'parties-africa-americas', cat: 'political-parties', kind: 'party', minS: 6,
  prompt: 'Name a political party from Africa, Canada, Mexico, Central America, the Caribbean or South America (not the United States; current or historical)',
  note: 'Any political party with an English Wikipedia article (and articles in at least six languages, so that the entry can be checked) whose home country is in Africa or in the Americas outside the United States counts, including defunct and provincial or regional parties. Egypt counts as Africa. Alliances, coalitions, movements and other non-party groups do not count.',
  src: 'Union of the parties-africa, parties-s-america and parties-n-america listings (Wikidata instance of political party with country on those continents), keeping only items with at least 6 Wikipedia language editions',
  q: { merge: ['parties-africa', 'parties-s-america', 'parties-n-america'] }, jackpotYear: 'Founded in {y}.' });
add({ key: 'think-tanks', cat: 'organizations',
  prompt: 'Name a think tank or policy research institute anywhere in the world',
  note: 'Think tanks and policy institutes with an English Wikipedia article count.',
  src: 'Wikidata instance of think tank (Q155271) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q155271.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
add({ key: 'intl-orgs', cat: 'organizations',
  prompt: 'Name an international organization or federation (such as a UN body, regional bloc or global association)',
  note: 'International organizations, intergovernmental bodies and global or regional federations with an English Wikipedia article count.',
  src: 'Wikidata instance of international organization (Q484652) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q484652.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
add({ key: 'unions', cat: 'organizations',
  prompt: 'Name a trade union or labor union from any country',
  note: 'Trade unions, labor federations and workers unions with an English Wikipedia article count.',
  src: 'Wikidata instance of trade union (Q178790 and subclasses) with enwiki article', q: { pattern: '?x wdt:P31/wdt:P279* wd:Q178790.', date: 'wdt:P571', limit: 5000 }, jackpotYear: 'Founded in {y}.' });
add({ key: 'ideologies', cat: 'political-terms',
  prompt: 'Name a political ideology, movement or "-ism"',
  note: 'Political ideologies, doctrines and "-isms" with an English Wikipedia article count.',
  src: 'Wikidata instance of political ideology (Q12909644, direct instances) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q12909644.' } });
add({ key: 'us-agencies', cat: 'executive-branch', diff: 1,
  prompt: 'Name a U.S. federal agency, bureau, commission, administration or office (current or abolished)',
  note: 'Federal government agencies with an English Wikipedia article count, including independent agencies and defunct ones.',
  src: 'Wikidata instance of United States federal agency (Q20857065 and subclasses) with enwiki article', q: { pattern: '?x wdt:P31/wdt:P279* wd:Q20857065.', date: 'wdt:P571' }, jackpotYear: 'Established in {y}.' });
add({ key: 'us-military-sites', cat: 'wars-foreign-policy',
  prompt: 'Name a U.S. military base, fort, camp or installation (current or closed)',
  note: 'U.S. military bases, forts, camps, air fields and installations with an English Wikipedia article count.',
  src: 'Wikidata instance of military base (Q245016 and subclasses) located in the United States, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q245016; wdt:P17 wd:Q30.', date: 'wdt:P571' }, jackpotYear: 'Established in {y}.' });
add({ key: 'world-military-sites', cat: 'wars-foreign-policy',
  prompt: 'Name a military base or installation anywhere in the world (any country)',
  note: 'Military bases, naval bases, air bases and garrisons with an English Wikipedia article count.',
  src: 'Wikidata instance of military base (Q245016) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q245016.', date: 'wdt:P571', limit: 5000 }, jackpotYear: 'Established in {y}.' });
add({ key: 'us-colleges-pre1900', cat: 'history',
  prompt: 'Name a U.S. college or university founded before 1900',
  note: 'Degree-granting colleges and universities in the United States with an English Wikipedia article and a founding year before 1900 count (including ones since closed).',
  src: 'Wikidata instance of university (Q3918) or college (Q189004) (direct instances) in the United States with inception (P571) < 1900, with enwiki article',
  q: { pattern: 'VALUES ?c { wd:Q3918 wd:Q189004 } ?x wdt:P31 ?c; wdt:P17 wd:Q30.', date: 'wdt:P571', lo: null, hi: 1899 }, jackpotYear: 'Founded in {y}.' });
add({ key: 'world-universities-pre1900', cat: 'history',
  prompt: 'Name a university founded before 1900 anywhere in the world',
  note: 'Universities with an English Wikipedia article and a founding year before 1900 count.',
  src: 'Wikidata instance of university (Q3918) with inception < 1900, with enwiki article',
  q: { pattern: '?x wdt:P31 wd:Q3918.', date: 'wdt:P571', lo: null, hi: 1899, limit: 5000 }, jackpotYear: 'Founded in {y}.' });
add({ key: 'us-newspapers', cat: 'history',
  prompt: 'Name a newspaper published in the United States (current or defunct)',
  note: 'U.S. daily and weekly newspapers with an English Wikipedia article count.',
  src: 'Wikidata instance of newspaper (Q11032 and subclasses) with country United States, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q11032; wdt:P17 wd:Q30.', date: 'wdt:P571', limit: 5000 }, jackpotYear: 'Founded in {y}.' });

/* ---------------- Places and heritage ---------------- */
add({ key: 'world-subdivisions', cat: 'geography', diff: 1,
  prompt: 'Name a state, province, region, prefecture or similar top-level division of any country',
  note: 'First-level administrative divisions (those with an ISO 3166-2 code) that have an English Wikipedia article count, for example a Canadian province, Indian state, Japanese prefecture or French region.',
  src: 'Wikidata items with an ISO 3166-2 code (P300) that are first-level administrative divisions (Q10864048 and subclasses), with enwiki article',
  q: { pattern: '?x wdt:P300 ?code; wdt:P31/wdt:P279* wd:Q10864048.', limit: 5000 } });
add({ key: 'world-heritage', cat: 'symbols-landmarks', diff: 1,
  prompt: 'Name a UNESCO World Heritage Site',
  note: 'Any site on the UNESCO World Heritage List (cultural, natural or mixed) with an English Wikipedia article counts.',
  src: 'Wikidata items with heritage designation (P1435) World Heritage Site (Q9259); UNESCO list https://whc.unesco.org/en/list/',
  q: { pattern: '?x wdt:P1435 wd:Q9259.', date: 'wdt:P571' } });
add({ key: 'capitals-ever', cat: 'geography', diff: 1,
  prompt: 'Name a city that is or was the capital of a country, kingdom, empire or other historical state',
  note: 'Cities that were or are the capital of a sovereign state, kingdom, empire or historical state, with an English Wikipedia article, count.',
  src: 'Wikidata items with "capital of" (P1376) a sovereign state (Q3624078) or historical country (Q3024240), with enwiki article',
  q: { pattern: '?x wdt:P1376 ?c. { ?c wdt:P31 wd:Q3624078 } UNION { ?c wdt:P31/wdt:P279* wd:Q3024240 }' } });
add({ key: 'us-other-cases', cat: 'civics-basics', kind: 'case',
  prompt: 'Name a U.S. court case that was NOT decided by the Supreme Court (a trial, state-court or lower federal court case)',
  note: 'U.S. trials, state-court cases and lower federal court cases with an English Wikipedia article count (for example the Scopes trial or the Salem witch trials); Supreme Court decisions do not.',
  src: 'Wikidata instance of legal case (Q2334719 and subclasses) whose court (P4884) is located in the United States and is not the U.S. Supreme Court, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q2334719; wdt:P4884 ?ct. ?ct wdt:P17 wd:Q30. MINUS { ?x wdt:P4884 wd:Q11201 }', date: 'wdt:P577|wdt:P585|wdt:P571' }, jackpotYear: 'Dated {y}.' });
add({ key: 'uk-cases', cat: 'civics-basics', kind: 'case',
  prompt: 'Name a court case from the United Kingdom (England, Wales, Scotland or Northern Ireland)',
  note: 'Court cases decided in the United Kingdom (including House of Lords, Supreme Court and Privy Council appeals) with an English Wikipedia article count.',
  src: 'Wikidata instance of legal case (Q2334719 and subclasses) whose court (P4884) is located in the United Kingdom, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q2334719; wdt:P4884 ?ct. ?ct wdt:P17 wd:Q145.', date: 'wdt:P577|wdt:P585|wdt:P571' }, jackpotYear: 'Dated {y}.' });
add({ key: 'canada-cases', cat: 'civics-basics', kind: 'case',
  prompt: 'Name a court case from Canada',
  note: 'Canadian court cases (Supreme Court of Canada, Privy Council appeals from Canada and lower courts) with an English Wikipedia article count.',
  src: 'Wikidata instance of legal case (Q2334719 and subclasses) whose court (P4884) is located in Canada, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q2334719; wdt:P4884 ?ct. ?ct wdt:P17 wd:Q16.', date: 'wdt:P577|wdt:P585|wdt:P571' }, jackpotYear: 'Dated {y}.' });
add({ key: 'newspapers-pre1900', cat: 'history',
  prompt: 'Name a newspaper founded before 1900 anywhere in the world (current or defunct)',
  note: 'Newspapers with an English Wikipedia article and a founding year before 1900 count.',
  src: 'Wikidata instance of newspaper (Q11032 and subclasses) with inception < 1900, with enwiki article',
  q: { pattern: '?x wdt:P31/wdt:P279* wd:Q11032.', date: 'wdt:P571', lo: null, hi: 1899, limit: 5000 }, jackpotYear: 'Founded in {y}.' });
add({ key: 'uk-constituencies', cat: 'elections',
  prompt: 'Name a UK parliamentary constituency (House of Commons, current or abolished)',
  note: 'Constituencies of the UK House of Commons since 1801 with an English Wikipedia article count, whether still in use or abolished.',
  src: 'Wikidata instance of constituency of the House of Commons (Q27971968) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q27971968.', date: 'wdt:P571' } });
add({ key: 'canada-ridings', cat: 'elections',
  prompt: 'Name a Canadian federal electoral district (riding), current or abolished',
  note: 'Federal electoral districts for the Canadian House of Commons with an English Wikipedia article count, including abolished ridings.',
  src: 'Wikidata instance of federal electoral district of Canada (Q17202187) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q17202187.', date: 'wdt:P571' } });
add({ key: 'law-enforcement', cat: 'executive-branch',
  prompt: 'Name a law enforcement agency or police force from any country',
  note: 'Police forces, sheriff departments, marshals services and other law enforcement agencies with an English Wikipedia article count (current or defunct).',
  src: 'Wikidata instance of law enforcement agency (Q732717) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q732717.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
add({ key: 'ministries', cat: 'executive-branch',
  prompt: 'Name a government ministry or department of any country (such as a ministry of finance or defense)',
  note: 'National or regional government ministries with an English Wikipedia article count. Ministries of different countries with the same name are one answer.',
  src: 'Wikidata instance of ministry (Q192350) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q192350.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
add({ key: 'courts', cat: 'supreme-court',
  prompt: 'Name a court from any country (a supreme court, appeals court, tribunal or other court)',
  note: 'Courts and tribunals with an English Wikipedia article count (national, regional or international, current or former). Courts of different places with the same name are one answer.',
  src: 'Wikidata instance of court (Q41487) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q41487.', date: 'wdt:P571', limit: 5000 }, jackpotYear: 'Established in {y}.' });
add({ key: 'advocacy-groups', cat: 'organizations',
  prompt: 'Name a pressure group, lobby group or advocacy organization (any country)',
  note: 'Advocacy groups, lobbying groups and pressure groups with an English Wikipedia article count.',
  src: 'Wikidata instance of pressure group (Q1666019) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q1666019.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
add({ key: 'legislatures', cat: 'political-terms',
  prompt: 'Name a legislature, assembly or council (parliament, congress, city council or similar; current or historical)',
  note: 'Legislative bodies at any level of government (national parliaments, state or provincial assemblies, city and municipal councils) with an English Wikipedia article count, current or historical. Same-named bodies in different places are one answer.',
  src: 'Wikidata instance of legislature (Q11204) with enwiki article', q: { pattern: '?x wdt:P31 wd:Q11204.', date: 'wdt:P571' }, jackpotYear: 'Founded in {y}.' });
add({ key: 'tribes', cat: 'native-american-history',
  prompt: 'Name a Native American tribe, nation or people',
  note: 'Federally recognized tribes and historic Native American peoples of the United States with an English Wikipedia article count.',
  src: 'Wikidata instance of Native American tribe (Q12885585 and subclasses) with enwiki article', q: { pattern: '?x wdt:P31/wdt:P279* wd:Q12885585.' } });
add({ key: 'county-seats', cat: 'states', diff: 1, kind: 'seat',
  prompt: 'Name a U.S. county seat (the town or city where a county government sits; Connecticut and Rhode Island are not included)',
  note: 'Cities and towns that are the county seat (or parish seat, borough seat) of a county in the 50 states or D.C., with an English Wikipedia article, count. Connecticut and Rhode Island have no county governments and are left out.',
  src: 'Wikidata U.S. counties (FIPS code P882) with a CURRENT capital/seat (P36 statement without an end date; recheck fix: former seats such as Paris, Kansas were included before), enwiki article of the seat',
  q: { pattern: '?cty wdt:P882 ?fips; p:P36 ?stm. ?stm ps:P36 ?x. FILTER NOT EXISTS { ?stm pq:P582 ?endd } FILTER NOT EXISTS { ?stm wikibase:rank wikibase:DeprecatedRank }', limit: 5000 } });

/* ---------------- Census-based (counties, places) ---------------- */
Q.push({ key: 'us-counties', cat: 'states', diff: 1, kind: 'census-county', score: 'pop',
  prompt: 'Name a U.S. county (or parish, borough or census area) in the 50 states or D.C.',
  note: 'Counties and county-equivalents of the 50 states and the District of Columbia count (parishes in Louisiana, boroughs and census areas in Alaska, independent cities in Virginia, and the eight traditional Connecticut counties). The name may be given with or without "County".',
  src: 'U.S. Census Bureau Vintage 2023 county population estimates (co-est2023-alldata.csv)', file: 'co-est2023-alldata.csv', url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/counties/totals/co-est2023-alldata.csv' });
Q.push({ key: 'us-places-10k', cat: 'states', diff: 1, kind: 'census-place', score: 'pop', minPop: 10000,
  prompt: 'Name a U.S. city, town, village or borough with at least 10,000 residents (Census Bureau 2023 estimate)',
  note: 'Incorporated cities, towns, villages and boroughs (and consolidated city governments), plus the towns of the six New England states, with 10,000 or more residents in the Census Bureau 2023 estimates count; the state does not matter. Townships, unincorporated communities (census-designated places such as Arlington, Virginia) and New York or Wisconsin towns do not count. A name shared by several places counts if any one of them qualifies.',
  src: 'U.S. Census Bureau Vintage 2023 incorporated place estimates (sub-est2023.csv)', file: 'sub-est2023.csv', url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/cities/totals/sub-est2023.csv' });
Q.push({ key: 'us-places-small', cat: 'states', diff: 2, kind: 'census-place', score: 'pop', minPop: 1000, maxPop: 4999,
  prompt: 'Name a small U.S. city, town, village or borough with between 1,000 and 4,999 residents (Census Bureau 2023 estimate)',
  note: 'Incorporated places (plus New England towns) with 1,000 to 4,999 residents in the Census Bureau 2023 estimates count; the state does not matter. Names that are also the name of a larger place (for example Memphis or Rome) are left out, because a player naming the famous one would be wrong.',
  src: 'U.S. Census Bureau Vintage 2023 incorporated place estimates (sub-est2023.csv)', file: 'sub-est2023.csv', url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/cities/totals/sub-est2023.csv' });

/* Optional type filters: the answer's short English Wikidata description (for example "political party in Brazil"; if there is none, the first sentences of its Wikipedia article when cached) must match "re" (and not "not"),
   because Wikidata sometimes types an item loosely (a militia as a party, a castle as a base). Answers with no description are left out. Applied by build-dh-curated.js. */
const PARTY = { re: /\b(party|parties)\b/i, not: /\b(coalition|alliance|caucus|electoral|bloc|militia|insurgent|faction|paramilitary)\b/i };
const UNIV_NOT = /.\b(School|College|Faculty|Department|Institute|Academy)\b of\b|Graduate School|Law School|Medical School|\bSchool of\b/;
const MIL = { re: /\b(base|station|camp|fort|fortress|airfield|aerodrome|air field|installation|depot|arsenal|barracks|garrison|airbase|naval|air force|army|military|navy|airport|firebase|stronghold|marine corps|coast guard|training)\b/i, not: /^Airfields? of |^Military (history|installations)/i, notTitle: /^Quarters \d|^Lands of |Castle$/ };
const FILTERS = {
  'us-parties': { re: PARTY.re, not: /\b(militia|insurgent|paramilitary|faction)\b/i }, 'parties-europe-old': PARTY, 'parties-europe-new': PARTY, 'parties-asia': PARTY, 'parties-africa': PARTY, 'parties-s-america': PARTY, 'parties-n-america': PARTY,
  'us-military-sites': MIL, 'world-military-sites': MIL,
  'us-colleges-pre1900': { re: null, title: /\b(College|University|Institute of Technology|Polytechnic|Seminary)\b/, notTitle: UNIV_NOT }, 'world-universities-pre1900': { re: null, title: /(univers|Hochschule|Polytechnic|Politecnico|Akademie|Academy|Institute of Technology|College)/i, notTitle: new RegExp(UNIV_NOT.source + '|Institute in |Veterinary College') },
  'us-prisons': { re: null, notTitle: /Fire Station|Courthouse$|Post Office/ },
  'legislatures': { re: null, notTitle: /\bAct\b|Amendment|Bill$|election$/i },
  'unions': { re: /\b(union|unions|syndicate|federation|confederation|labou?r|workers|trade)\b/i, not: /\b(student|students|association of|political|party)\b/i },
  'law-enforcement': { re: /\b(police|law enforcement|sheriff|constabulary|gendarmerie|marshal|marshals|patrol|investigation|security|force|guard|bureau|agency|service|department|rangers)\b/i, not: /\b(ombudsman|anti-corruption|corruption|commission|vigilance)\b/i },
  'ideologies': { re: null, notTitle: /^(Criticism|Opposition|Critique|Attitudes|Views) (of|on|to|toward|towards) |^Anti-/i },
  'dynasties': { re: /\b(dynasty|dynasties|royal house|ruling house|house of|noble family|royal family|monarch|monarchs|house)\b/i, not: /\b(clan|caste|tribe)\b/i },
  'world-subdivisions': { re: /\b(province|provinces|state|region|county|prefecture|canton|district|governorate|oblast|department|municipality|republic|territory|emirate|division|voivodeship|parish|island|krai|atoll|commune|autonomous|subdivision|wilaya|regency|zone|okrug|principality|kingdom|dependency|city|capital|territories|states|entity|land)\b/i, not: /\burban area\b|\bagglomeration\b/i, notTitle: null },
  'milops': { re: /\b(operation|operations|campaign|offensive|raid|attack|assault|invasion|bombing|strike|mission|exercise|battle|war|military|expedition|intervention|blockade|landing|sweep|patrol|airlift|rescue|evacuation|conflict|insurgency|counter-insurgency|counterinsurgency|combat)\b/i, not: null, notTitle: /^(Death|Murder|Assassination|Killing|Execution) of /i },
};
/* Refinements added after the second fact-check round (items Wikidata describes loosely or wrongly). */
const MIL_NOT = /hospital|concentration camp|prison|cemetery|museum|internment/i;
for (const k of ['us-military-sites', 'world-military-sites']) FILTERS[k] = Object.assign({}, FILTERS[k], { not: new RegExp(MIL_NOT.source + '|' + FILTERS[k].not.source, 'i') });
FILTERS['legislatures'].notTitle = /\bAct\b|Amendment|Bill$|election$|Committee|Municipal Corporation|Municipality|Commission/i;
FILTERS['us-prisons'] = { notTitle: /Guantanamo|Camp Delta|Camp X-Ray|Abu Ghraib|Bagram|Camp Bucca/i, re: /(prison|jail|correctional|penitentiary|detention|lockup|reformatory|corrections|stockade|workhouse|house of correction)/i, not: /(museum|police station|courthouse|city hall|municipal building|fire station)/i };
FILTERS['ideologies'].notTitle = /^(Criticism|Opposition|Critique|Attitudes|Views) (of|on|to|toward|towards) |^Anti-|\bopposition\b|^Independent /i;
FILTERS['unions'].notTitle = /Theatre|Theater|Drama|Club$/;
FILTERS['law-enforcement'].notTitle = /Emergency|Fire |Civil Protection/;
FILTERS['dynasties'].notTitle = /chieftaincy|chiefdom|principality|Estate$|zamindari/i;
FILTERS['treaties-1946'] = { re: null, notTitle: /Interstate Compact|Compact$/ };
FILTERS['world-heritage'] = { re: null, notTitle: /Prefecture/ };
FILTERS['parties-europe-new'] = Object.assign({}, FILTERS['parties-europe-new'], { notTitle: /[Yy]outh/ });
const RECHECK = require('./dh-curated-recheck-filters.js');
module.exports = { Q, FILTERS, FILTERS_RECHECK: RECHECK.FILTERS_RECHECK, descriptor: RECHECK.descriptor };
