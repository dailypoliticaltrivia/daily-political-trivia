'use strict';
/* Recheck (independent fact-check) type filters for the Dark Horse curated banks.
   Each filter is fn(intro, title, row) -> boolean and tests the English Wikipedia lead sentence (cached by enrich-dh-curated.js in audit/dh-curated-data/_intros.json),
   falling back to the short Wikidata description (row.ds). If neither exists the answer is left out. Used by build-dh-curated.js. */

/* descriptor(): the part of the first sentence after "is/was a(n)/the":
   "X (French: Y) was a political alliance in Benin." -> "political alliance in Benin." */
function descriptor(text) {
  let t = String(text || '').replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i++) t = t.replace(/\([^()]*\)/g, ' ').replace(/\[[^\[\]]*\]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  const m = t.match(/\b(?:is|was|are|were)\s+(?:(?:one of|part of)\s+)?(?:an?|the)\s+(.{0,150})/i);
  return m ? m[1] : '';
}

/* ---- political parties: the descriptor must say "party" before any word such as alliance, movement, organisation, faction ---- */
const NEG_PARTY = /\b(alliance|coalition|bloc|front|movement|organi[sz]ation|association|faction|club|clubs|league|society|federation|cartel|group|grouping|network|wing|platform|electoral list|list|militia|army|council|committee|union|conglomerate|rally|coordination|current|tendency|caucus|alignment|cartel|cooperative)\b/i;
function partyOk(intro, title, r) {
  if (['SEN 21', 'Free Democratic Israel', 'DeVlag'].includes(title)) return false; // articles say movement / group, not party
  // title words that usually mark an alliance, movement or organisation that Wikidata also calls a party (cheap stand-in for reading every article; costs some real parties, which is accepted)
  if (/\b(Alliance|Coalition|Bloc|Block|Front|Movement|Movements|List|Platform|Alignment|Pact|Cartel|Association|League|Committee|Council|Group|Coordination|Initiative|Electoral|Federation|Forum|Clubs?|Society|Rally|Fusion|Union of|Joint|United Left|Together)\b/i.test(title)) return false;
  const ty = (r.types || []).join('|').toLowerCase();
  // Wikidata types every candidate as 'political party' (that was the query) but also lists extra types for non-parties (militia, coalition, political organization ...): any such extra type drops the item
  if (ty && /(alliance|coalition|movement|organi[sz]ation|armed|militia|terror|guerrilla|faction|parliamentary group|decoy list|electoral list|association|pressure group|youth|wing|trade union|front\b|club|group|network|caucus|insurgen|paramilitary|cartel|society|league of)/.test(ty.replace(/bloc party/g, ''))) return false;
  const text = intro || r.ds || '';
  const d = descriptor(text) || (r.ds || '');
  if (!d) return false;
  const p = d.search(/\bpart(?:y|ies)\b/i);
  if (p < 0) return false;
  const n = d.search(NEG_PARTY);
  return !(n >= 0 && n < p);
}

/* ---- historical states ---- */
const STATEWORD = /\b(state|kingdom|empire|republic|principality|principalities|duchy|sultanate|emirate|khanate|caliphate|confederation|confederacy|federation|polity|country|union|colony|territory|protectorate|city-state|realm|county|margraviate|bishopric|electorate|landgraviate|archduchy|lordship|barony|commonwealth|nation|taifa|domain|league|shogunate|khaganate|kaganate|chiefdom|banate|despotate|tsardom|dynasty|bantustan|mandate|dominion|governorate|vilayet|sovereignty|monarchy|city|voivodeship|autonomous|zemlja|province|region|sheikhdom|principate|junta|regime|government|republics|states|kingdoms|empires|duchies)\b/i;
function stateOk(intro, title, r) {
  if (/\bGovernment\b/.test(title) && !/\b(Republic|Kingdom|Empire|State|Dominion|Federation|Sultanate|Emirate|Duchy)\b/.test(title)) return false;
  if (/ government$|^Government of | administration$/i.test(title)) return false;
  if (/^Union \(|^Confederate States Army|^Confederacy \(/.test(title)) return false;
  const ty = (r.types || []).join('|').toLowerCase();
  if (ty && /(historical period|era\b|reign|archaeological|culture\b|ethnic group|tribe|geographical region|provisional government|government\b)/.test(ty) && !/(country|state|kingdom|empire|republic|principality|duchy|sultanate|emirate|khanate|caliphate|confederation|dynasty|polity|colony|protectorate|city-state|monarchy|bantustan|dominion|federation)/.test(ty)) return false;
  const text = intro || r.ds || '';
  if (/^(Reign|History|Government|Timeline|Period|Era|Rule) of /i.test(title) || /\b(Provisional Government|early period|late period|middle period|Territory of the)\b/i.test(title)) return false;
  if (!text) return /\b(Kingdom|Empire|Republic|Duchy|Principality|Sultanate|Emirate|Khanate|Caliphate|Confederation|Federation|Union|Dynasty|Taifa|Grand Duchy|Free City|Margraviate|Electorate|State|Bishopric)\b/.test(title);
  const d = descriptor(text) || '';
  if (/\b(reign|period|era|history|event|campaign|war|battle|treaty|list)\b/i.test(d.slice(0, 40))) return false;
  return STATEWORD.test(d) || (STATEWORD.test(title.replace(/\(.*\)/, '')) && !/\b(reign|period)\b/i.test(text.slice(0, 60)));
}

/* ---- battles ---- */
const BATTLE_POS = /\b(battle|battles|siege|engagement|action|skirmish|raid|raids|assault|assaults|offensive|campaign|operation|clash|clashes|fight|fighting|bombardment|encounter|combat|capture|attack|attacks|defen[sc]e|landing|invasion|conflict|ambush|incursion|sortie|counter-attack|counteroffensive|rout|confrontation|firefight|blockade|operations|standoff|naval|aerial|struggle|war|fought|took place|occurred)\b/i;
function battleOk(intro, title, r) {
  if (/^(Northern|Southern|Eastern|Western|Central) (front|theatre|theater),|^Operations (on|in) the /i.test(title)) return false;
  if (/(logistics|order of battle|strategy|tactics|historiography|legend of|in popular culture)/i.test(title)) return false;
  if (/(legendary battle|bible story|myth|folklore|literary)/i.test((r.types || []).join('|'))) return false;
  const ty = (r.types || []).join('|').toLowerCase();
  if (ty && /(massacre|genocide|war crime|atrocity|incident|assassination|riot|coup|disaster|terrorist attack|bombing|shooting|execution|mutiny|pogrom|expedition|voyage|evacuation|march\b)/.test(ty) && !/(battle|siege|skirmish|engagement|raid|assault|offensive|campaign|military operation|naval)/.test(ty)) return false;
  const text = intro || r.ds || '';
  if (!text) return /^(Battle|Battles|Siege|Sieges|Action|Skirmish|Raid|Assault|Capture|Fall|Sack|Bombardment|Defen[cs]e|Naval battle|Engagement|Combat|Ambush|Attack|Landing|Charge|Storming|Relief|Blockade|Fight)\b|\b(Battle|Siege|Skirmish)\b/.test(title) && !/\b(Cruise|Massacre|Genocide|Pogrom|Execution|Assassination|Death of|Murder|Trial|Evacuation|Mutiny|Wedge|Incident|Disaster)\b/i.test(title);
  if (/\b(Cruise|Massacre|Genocide|Pogrom|Execution|Assassination|Death of|Murder|Trial|Evacuation|Mutiny|Wedge|Incident|Disaster|Explosion|Crash|Shooting)\b/i.test(title)) return false;
  if (/^(Fights|Battles|Wars|Conflicts|Sieges|Raids|Operations) (of|in|during|between) /.test(title)) return false;
  const d = descriptor(text) || text.slice(0, 160);
  if (/^(list|timeline|series of lists|collection)\b/i.test(d) || /^This is a list/.test(text)) return false;
  return BATTLE_POS.test(d) || BATTLE_POS.test(text.slice(0, 160));
}

/* ---- wars, rebellions, uprisings ---- */
function warOk(intro, title, r) {
  if (/^(Conflict between|United Kingdom during|.* during the .*(War|Revolution|Rebellion)$|.* government$)/i.test(title)) return false;
  if (!/\b(war|wars|rebellion|revolt|revolts|uprising|uprisings|insurrection|revolution|campaign|conflict|insurgency|invasion|siege|crusade|feud|civil|resistance|jacquerie|mutiny|raids?|expedition|expeditions|incursion|secession|separatist|independence|liberation|sonderbund|troubles|intifada|revolts|disturbances|crisis|upheaval|strife|interregnum|conquest|conquests|fitna|riddah?|jihad)\b/i.test(title) && !/(war|rebellion|uprising|revolt|civil war|insurgency|revolution|conflict|campaign)/i.test((r.types || []).join('|'))) return false;
  if (/^(World War (I|II) in |Eastern Front|Western Front|.* theatre of |.* front of )/i.test(title)) return false;
  const ty = (r.types || []).join('|').toLowerCase();
  if (ty && /(coup|riot|massacre|strike\b|mutiny|assassination|protest|pogrom)/.test(ty) && !/(war|rebellion|uprising|revolt|civil war|insurgency|revolution)/.test(ty)) return false;
  const text = intro || r.ds || '';
  if (/\b(riots?|coup|mutiny|massacre|strikes?|protests?|crisis|assassination|plot|conspiracy|pogrom|incident|affair|famine|genocide)\b/i.test(title)) return false;
  if (!text) return true;
  const d = descriptor(text) || text.slice(0, 120);
  if (/^(list|timeline|collection)\b/i.test(d) || /^This is a list/.test(text)) return false;
  if (/\b(coup|riots?|mutiny|massacre|strike|protests?|crisis|assassination|plot|conspiracy|pogrom|incident|affair|famine|genocide)\b/i.test(d.slice(0, 70))) return false;
  return true;
}

/* ---- military operations: the title itself must name an operation/campaign/offensive/raid ---- */
function milopOk(intro, title, r) {
  if (/(massacre|assassination|terrorist attack|war crime|mass murder|coup|genocide|bombing|airstrike|execution)/i.test((r.types || []).join('|'))) return false;
  if (!/\b(operation|operations|campaign|campaigns|offensive|offensives|raid|raids|invasion|airlift|blockade|expedition|intervention|landing|landings|incursion|counteroffensive|counter-offensive|crackdown|sweep|bombing|mission|strike|strikes|conquest|liberation|occupation)\b/i.test(title)) return false;
  if (/^(Death|Murder|Assassination|Killing|Execution|Destruction|Attack|Massacre) of /i.test(title)) return false;
  return true;
}

/* ---- treaties ---- */
const TREATY_WORD = /\b(treaty|treaties|convention|agreement|accord|accords|pact|protocol|armistice|truce|concordat|peace|alliance|compact|capitulation|entente|covenant|exchange of notes|settlement|cession|ceasefire|cease-fire|memorandum|act)\b/i;
function treatyOk(intro, title, r) {
  if (/\b(National|Constitutional|Party|Republican|Democratic|Nominating|Nominating) Convention\b/i.test(title)) return false;
  if (/^(Fourteen Points|Union \(American Civil War\))/.test(title)) return false;
  if (/\b(Conference|Talks|Summit|Negotiations|Process|Initiative|Proposals?|Plan|System|Meeting|Congress)\b/i.test(title) && !/\b(Treaty|Convention|Agreement|Accord|Pact|Protocol|Peace of|Concordat)\b/.test(title)) return false;
  if (/\b(Conference|Talks)$/.test(title)) return false;
  const ty = (r.types || []).join('|').toLowerCase();
  if (/(inscription|clay tablet|cuneiform|triad|siege|interstate compact|real union|separation)/.test(ty)) return false;
  if (ty && /(edict|decree|declaration|charter|law\b|statute|constitution|resolution|proclamation|act of parliament|memorandum of understanding)/.test(ty) && !/(treaty|agreement|convention|accord|pact|protocol|armistice|truce|concordat)/.test(ty)) return false;
  if (/\b(Declaration|Charter|Communiqué|Communique|Statement|Edict|Decree|Constitution|Proclamation|Manifesto|Resolution|Code of|Principles|Guidelines|Recommendation|Roadmap)\b/i.test(title) && !/\b(treaty|convention|agreement|accord|pact|protocol)\b/i.test(title)) return false;
  const text = intro || r.ds || '';
  if (!text) return /\b(Treaty|Convention|Agreement|Accord|Accords|Pact|Protocol|Concordat|Armistice|Truce|Peace|Capitulation|Entente|Compact)\b/.test(title);
  const d = descriptor(text) || text.slice(0, 200);
  if (/^(statement|speech|declaration|proposal|plan|set of|list of|conference|meeting|series of talks)/i.test(d)) return false;
  if (!TREATY_WORD.test(d) && !TREATY_WORD.test(title)) return false;
  if (/\b(edict|decree|declaration|charter|ordinance|statute|law|constitution)\b/i.test(d.slice(0, 50)) && !/\b(treaty|agreement|convention|accord)\b/i.test(d.slice(0, 50))) return false;
  return true;
}

/* ---- think tanks ---- */
function thinkTankOk(intro, title, r) {
  if (/(publishing house|publisher|business|company|educational institution|university|party political foundation|newspaper|magazine)/i.test((r.types || []).join('|'))) return false;
  const text = intro || r.ds || '';
  if (!text) return /\b(Institute|Institution|Center|Centre|Foundation|Council|Policy|Research|Studies|Forum|Fund)\b/.test(title) && !/\b(Project|Initiative|Program|Programme|Campaign)\b/.test(title);
  const d = descriptor(text) || r.ds || text.slice(0, 200);
  if (/^(project|initiative|program|programme|campaign|publication|journal|magazine|company|fund|foundation of)\b/i.test(d) || /\b(publishing company|intelligence company|consulting)\b/i.test(d)) return false;
  if (/\b(medical|health|biolog|cancer|clinical|disease|genome|neuro|hospital|vaccine)\b/i.test(title)) return false;
  // organisation word in the title, or the description/lead itself says think tank
  return /think[- ]?tank/i.test(d + ' ' + (r.ds || '') + ' ' + (intro || '')) || /\b(Institute|Institution|Center|Centre|Foundation|Council|Forum|Association|Society|Trust|Group|Network|Academy|Club|Commission|Bureau|Office|Fund|Project|Initiative|Research|Studies|Policy|Affairs|Lab|Laboratory|Observatory|Alliance|League|Union|Society|Think|Review)\b/.test(title);
}

/* ---- U.S. agencies ---- */
function agencyOk(intro, title, r) {
  if (/(television|tv channel|news channel|radio network|broadcaster|newspaper)/i.test((intro || '') + ' ' + (r.ds || '')) || /^(Alhurra|Radio Free|Voice of America$)/.test(title)) return false;
  if (/^(Secure Communities)$/.test(title)) return false;
  if (/\b(Laborator(y|ies)|Observatory|Museum|Cemetery|Hospital|Medical Center|Indian Agency|Forensic|Field Office|Library$)\b/.test(title) && title !== 'Library of Congress') return false;
  const text = intro || r.ds || '';
  if (!text) return true;
  const d = descriptor(text) || r.ds || text.slice(0, 200);
  if (/^(laborator|facility|building|research facility|museum|cemetery|territory|reservation|program|fund|office building)/i.test(d) || /^[a-z -]{0,25}(program|initiative|database|system)\b/i.test(d)) return false;
  return true;
}

/* ---- law enforcement ---- */
function lawOk(intro, title, r) {
  const text = intro || r.ds || '';
  if (!text) return /\b(Police|Sheriff|Constabulary|Gendarmerie|Marshal|Marshals|Patrol|Investigation|Rangers|Carabinieri|Garda|Guard)\b/i.test(title);
  const d = descriptor(text) || r.ds || text.slice(0, 200);
  if (/\b(tactical unit|special unit|unit of|squad|team|battalion|brigade|division of|bureau of prisons|academy|college|union|association|museum|cemetery)\b/i.test(d.slice(0, 80))) return false;
  return /\b(police|law enforcement|sheriff|constabulary|gendarmerie|marshal|marshals|patrol|investigation|detective|security|guard|rangers|agency|force|service|bureau|department|office|command|authority|directorate|enforcement|carabinieri|garda|gardaí|militsiya|militia|customs|border)\b/i.test(d);
}

/* ---- ministries: the title must name a ministry/department ---- */
function ministryOk(intro, title, r) {
  if (/^Ministry of Popular Affairs$/.test(title)) return false;
  if (!/\b(Ministry|Ministries|Department|Secretariat|Ministerio|Ministère|Ministerium|Ministerie|Ministero|Office of the|Departamento|Dipartimento|Directorate|Board of)\b/i.test(title)) return false;
  return !!(intro || r.ds);
}

/* ---- legislatures: drop courts, numbered sessions and similar ---- */
function legislatureOk(intro, title, r) {
  if (/^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth|Twenty-[a-z]+|Thirty-[a-z]+|Forty-[a-z]+) (Legislature|Parliament|Congress|Assembly|Cortes|Dáil|Diet|Duma)\b/i.test(title) || /\bLegislature of the /.test(title) && /\b(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)\b/.test(title)) return false;
  if (/^(History|Timeline|Elections?) of /i.test(title)) return false;
  if (/Workers'? Council|Soldiers'? Council/i.test(title)) return false;
  if (/\bCourt\b|Tribunal|^\d+(st|nd|rd|th) |General Assembly of .*\b\d+(st|nd|rd|th)?\b|\d+(st|nd|rd|th) (General Assembly|Parliament|Congress|Legislature|Dáil|Seanad)|Elections? |Committee|Commission|Ministry|Department/i.test(title)) return false;
  if (/^(\d+(st|nd|rd|th))/.test(title)) return false;
  const text = intro || r.ds || '';
  if (!text) return /\b(Parliament|Assembly|Council|Congress|Senate|Diet|Duma|Cortes|Knesset|Legislature|Chamber|House of|Storting|Riksdag|Sejm|Majlis|Soviet|Landtag|Bundestag|Folketing|Althing|Dáil|Seanad|Rada|Estates)\b/i.test(title);
  const d = descriptor(text) || r.ds || text.slice(0, 200);
  if (/\b(court|tribunal|judicial|ministry|department|term of|session of|members of the)\b/i.test(d.slice(0, 60))) return false;
  return /\b(legislat|parliament|assembly|council|congress|senate|diet|duma|cortes|knesset|chamber|house|storting|riksdag|sejm|majlis|soviet|landtag|bundestag|folketing|althing|dáil|seanad|rada|parlament|parlamento|deputies|representatives|lawmaking|law-making|estates|sabor|skupština|curia|witan|tynwald|kurultai|shura|synod|lok sabha|rajya sabha|vidhan)\b/i.test(d + ' ' + title);
}

/* ---- capitals ---- */
function capitalOk(intro, title, r) {
  return !!(intro || r.ds);
}

/* ---- U.S. military sites ---- */
function milsiteOk(intro, title, r) {
  if (/AN\/[A-Z]{3}-|Meteorological|Data Station|Space Base Delta/i.test(title)) return false;
  if (/(Air Defense Sector|Air Defence Sector|Sector$| Wing$| Command$| Group$| Squadron$| Division$| Regiment$| Battalion$| Brigade$|Air Force$|^United States Army$)/.test(title)) return false;
  if (/(Airfields|Air Fields|Army Airfields|Bases|Camps|Forts|Installations|Air Force Bases|Air Force Stations|Air Stations|Naval Air Stations)$/.test(title) || /\b(Airfields|Army Airfields) (in|of)\b/.test(title) || /\bWorld War (I|II) .* (Airfields|Bases|Camps)\b/.test(title)) return false;
  const text = intro || r.ds || '';
  if (/^(During World War II, the United States Army Air Forces established numerous|This is a list|List of)/i.test(text)) return false;
  return true;
}

/* ---- Supreme Court cases: the title must look like a case name (the court statement in Wikidata also covers the Abrego Garcia deportation, an ICJ case and a border dispute) ---- */
let SC_EX = null;
function scEx() { if (!SC_EX) { try { SC_EX = new Set(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'audit', 'dh-curated-data', '_sc-exclude.json'), 'utf8'))); } catch (e) { SC_EX = new Set(); } } return SC_EX; }
function scOk(intro, title, r) {
  if (scEx().has(title)) return false;
  if (/Deportation of|LaGrand|border dispute|^Supreme Court cases|^List of|International Court/i.test(title)) return false;
  return / v.? |^(Ex parte|In re|Matter of) |\bCases?$|'s Case$|^The [A-Z]/.test(title);
}

const FILTERS_RECHECK = {
  'sc-cases': scOk,
  'battles-pre1500': battleOk, 'battles-1500-1799': battleOk, 'battles-1800-1913': battleOk, 'battles-ww1': battleOk, 'battles-ww2': battleOk, 'battles-1946': battleOk, 'battles-us-soil': battleOk,
  'us-parties': partyOk, 'parties-europe-old': partyOk, 'parties-europe-new': partyOk, 'parties-asia': partyOk, 'parties-africa': partyOk, 'parties-s-america': partyOk, 'parties-n-america': partyOk, 'parties-africa-americas': partyOk,
  'former-states-pre1800': stateOk, 'former-states-1800-1945': stateOk, 'former-states-1946': stateOk,
  'milops': milopOk, 'wars-pre1800': warOk, 'wars-1800-1945': warOk, 'treaties-pre1800': treatyOk, 'treaties-1800-1945': treatyOk, 'treaties-1946': treatyOk,
  'think-tanks': thinkTankOk, 'us-agencies': agencyOk, 'law-enforcement': lawOk, 'ministries': ministryOk, 'legislatures': legislatureOk,
  'capitals-ever': capitalOk, 'us-military-sites': milsiteOk,
};

/* Countries that straddle two continents are counted on one side only (see the notes of the party questions). Wikidata country ids:
   Turkey Q43, Georgia Q230, Azerbaijan Q227, Armenia Q399, Kazakhstan Q232 -> Asia only; Russia Q159, Cyprus Q229 -> Europe only; Egypt Q79 -> Africa only;
   United States Q30 and Greenland Q223 are left out of the Canada/Mexico/Central America/Caribbean question. */
const EXCLUDE = {
  "parties-europe-old": ["Q43", "Q230", "Q227", "Q399", "Q232", "Q12560"],
  "parties-europe-new": ["Q43", "Q230", "Q227", "Q399", "Q232", "Q12560"],
  "parties-asia": ["Q159", "Q79", "Q229", "Q15180", "Q2184", "Q34266", "Q12560"],
  "parties-n-america": ["Q30", "Q223"],
};
module.exports = { FILTERS_RECHECK, descriptor, EXCLUDE };
