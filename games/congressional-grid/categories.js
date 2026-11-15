// Category definitions for Congressional Grid (all-time roster: every member of Congress since 1789).
// window.CATEGORIES(members) returns [{group, key, label, test(member) -> bool}, ...]
// Owned by the category agent. The game engine (index.html) only calls this function.
// Categories with fewer than MIN qualifying members are dropped automatically.
window.CATEGORIES = function(M){
  const MIN = 15;
  const cats = [];
  const add = (group,key,label,test)=>cats.push({group,key,label,test});
  const has = t => m => !!(m.tags && m.tags.indexOf(t) >= 0);
  const served = (a,b) => m => m.firstYear <= b && m.lastYear >= a; // served at some point in [a,b]

  // ---- party (any party the member ever served under)
  const P = p => m => (m.parties||[m.party]).indexOf(p) >= 0;
  add('party','dem','Democrat',P('Democrat'));
  add('party','rep','Republican',P('Republican'));
  add('party','whig','Whig',P('Whig'));
  add('party','fed','Federalist',P('Federalist'));
  add('party','dr','Democratic-Republican',P('Democratic-Republican'));
  add('party','nr','National Republican',P('National Republican'));
  add('party','ind','Independent',P('Independent'));
  add('party','knownothing','Know Nothing (American)',has('knownothing'));
  add('party','populist','Populist',has('populist'));
  add('party','progressive','Progressive (Bull Moose)',has('progressive'));
  add('party','antimason','Anti-Masonic',has('antimason'));
  add('party','freesoil','Free Soil',has('freesoil'));
  add('party','unionist','Unionist',has('unionist'));
  add('party','farmerlabor','Farmer-Labor',has('farmerlabor'));
  add('party','nullifier','Nullifier',has('nullifier'));
  add('party','greenback','Greenback',has('greenback'));

  // ---- chamber
  const C = c => m => (m.chambers||[m.chamber]).indexOf(c) >= 0;
  add('chamber','sen','Served in the Senate',C('Senate'));
  // 'Served in the House' removed in the 2026-11 audit: 90% of all members, so it distinguishes nothing
  add('chamber','both','Served in both chambers',m=>(m.chambers||[]).length>1);

  // ---- gender
  add('gender','w','Woman',m=>m.gender==='Woman');

  // ---- race / ethnicity (official House History lists; Native American from Wikipedia list)
  add('race','black','Black American',has('black'));
  add('race','hispanic','Hispanic American',has('hispanic'));
  add('race','asianpi','Asian/Pacific Islander',has('asianpi'));
  add('race','native','Native American',has('native'));

  // ---- region (most recent state)
  ['Northeast','Midwest','South','West'].forEach(r=>add('region','r'+r,r,m=>m.region===r));
  add('region','rTerritory','Territory or D.C. delegate',m=>(m.states||[m.state]).some(s=>['PR','GU','VI','AS','MP','PI','DC'].indexOf(s)>=0));

  // ---- state (any state represented)
  const names = {};
  M.forEach(m=>{ names[m.state] = m.stateName; });
  Object.assign(names,{DK:'Dakota Territory',OL:'Territory of Orleans',PI:'Philippines'});
  const sc = {};
  M.forEach(m=>(m.states||[m.state]).forEach(s=>sc[s]=(sc[s]||0)+1));
  Object.keys(sc).sort().forEach(s=>{ if(names[s]) add('state','s'+s,names[s],m=>(m.states||[m.state]).indexOf(s)>=0); });

  // ---- era
  add('era','e1700','Served in the 1700s',m=>m.firstYear<=1799);
  add('era','e1800','Served in the 1800s (19th century)',served(1800,1899));
  add('era','e1900','Served in the 1900s (20th century)',served(1900,1999));
  add('era','e2000','Served since 2000',m=>m.lastYear>=2000);
  add('era','cw','In Congress during the Civil War (1861-65)',has('svcw'));
  add('era','recon','In Congress during Reconstruction (1865-77)',has('svrecon'));
  add('era','depr','Served in the 1930s',has('svdepr'));
  add('era','ww2','In Congress during WWII (1941-45)',has('svww2'));
  add('era','e60s','Served in the 1960s',has('sv60s'));
  add('era','cur','Currently serving',m=>m.current);

  // ---- length of service
  add('service','y2','Served 2 years or less',m=>m.years<=2.1);
  add('service','y10','10+ years in Congress',m=>m.years>=10);
  add('service','y20','20+ years in Congress',m=>m.years>=20);
  add('service','y30','30+ years in Congress',m=>m.years>=30);
  add('service','multi','Represented 2+ states',m=>(m.states||[]).length>1);
  add('service','switch','Switched parties',has('switcher'));
  add('service','died','Died in office',has('diedinoffice'));

  // ---- life
  add('life','abroad','Born outside the U.S.',has('bornabroad'));
  add('life','ireland','Born in Ireland',has('bornireland'));
  add('life','uk','Born in England, Scotland or Wales',has('bornuk'));
  add('life','germany','Born in Germany',has('borngermany'));
  add('life','canada','Born in Canada',has('borncanada'));
  add('life','pre1776','Born before 1776',has('bornpre1776'));
  add('life','b1900','Born 1900-1999',m=>m.born>=1900&&m.born<=1999);
  add('life','lived90','Lived to 90+',has('lived90'));

  // ---- military
  add('military','mil','Military veteran',has('military'));
  add('military','army','Served in the Army',has('army'));
  add('military','navy','Served in the Navy',has('navy'));
  add('military','marines','Marine Corps veteran',has('marines'));
  add('military','airforce','Air Force veteran',has('airforce'));
  add('military','confed','Confederate veteran',has('confederate'));
  add('military','war1812','War of 1812 veteran',has('war1812'));
  add('military','mexwar','Mexican-American War vet',has('mexwar'));
  add('military','civilwar','Civil War veteran (Union or Confederate)',m=>has('civilwar')(m)||has('confederate')(m));
  add('military','spanam','Spanish-American War vet',has('spanam'));
  add('military','ww1','World War I veteran',has('ww1'));
  add('military','ww2v','World War II veteran',has('ww2'));
  add('military','korea','Korean War veteran',has('korea'));
  add('military','iraq','Iraq/Afghanistan vet',has('iraqafghan'));
  add('military','moh','Medal of Honor recipient',has('medalofhonor'));
  add('military','purple','Purple Heart recipient',has('purpleheart'));

  // ---- occupation (Wikidata)
  add('job','lawyer','Lawyer',has('lawyer'));
  add('job','doc','Physician',has('physician'));
  add('job','farmer','Farmer or planter',has('farmer'));
  add('job','biz','Businessperson',has('business'));
  add('job','edu','Teacher or professor',has('educator'));
  add('job','journo','Journalist or editor',has('journalist'));
  add('job','eng','Engineer',has('engineer'));
  add('job','athlete','Athlete or coach',has('athlete'));
  add('job','clergy','Clergy',has('clergy'));
  add('job','ent','Entertainer',has('entertainer'));
  add('job','survey','Surveyor',has('surveyor'));
  add('job','cpa','Accountant',has('accountant'));
  add('job','police','Law enforcement',has('police'));
  add('job','pilot','Pilot or aviator',has('aviator'));
  add('job','econ','Economist',has('economist'));

  // ---- other offices held (before or after Congress)
  add('office','pres','U.S. President',has('president'));
  add('office','vp','U.S. Vice President',has('vp'));
  add('office','speaker','Speaker of the House',has('speaker'));
  add('office','gov','Governor',has('governor'));
  add('office','ltgov','Lieutenant Governor',has('ltgov'));
  add('office','cabinet','Cabinet secretary',has('cabinet'));
  add('office','judge','Judge or justice',has('judge'));
  add('office','scotus','Supreme Court justice',has('scotus'));
  add('office','mayor','Mayor',has('mayor'));
  add('office','diplomat','Ambassador or diplomat',has('diplomat'));
  add('office','ppt','President pro tempore',has('ppt'));
  add('office','leader','Party leader or whip',has('leader'));
  add('office','usatty','U.S. Attorney',has('usattorney'));

  // ---- education (Wikidata "educated at")
  add('school','ivy','Ivy League',has('ivy'));
  [['harvard','Harvard'],['yale','Yale'],['princeton','Princeton'],['columbia','Columbia'],['penn','Penn'],['brown','Brown'],
   ['dartmouth','Dartmouth'],['cornell','Cornell'],['georgetown','Georgetown'],['stanford','Stanford'],['uva','UVA'],
   ['umich','U. of Michigan'],['wm','William & Mary'],['oxford','Oxford'],['utexas','U. of Texas'],['ualabama','U. of Alabama'],
   ['unc','UNC Chapel Hill'],['vanderbilt','Vanderbilt'],['notredame','Notre Dame'],['berkeley','UC Berkeley'],['wlu','Washington & Lee'],
   ['hsc','Hampden-Sydney'],['bowdoin','Bowdoin'],['williams','Williams College'],['amherst','Amherst'],['unioncollege','Union College'],
   ['ugeorgia','U. of Georgia'],['dickinson','Dickinson'],['transylvania','Transylvania'],['uwisc','U. of Wisconsin'],
   ['howard','Howard'],['gwu','GWU'],['wj','Wash. & Jeff.'],['usc','South Carolina'],['mizzou','U. of Missouri'],
   ['osu','Ohio State'],['phillips','Phillips Academy']
  ].forEach(([t,n])=>add('school',t,'Attended '+n,has(t)));
  add('school','westpoint','West Point grad',has('westpoint'));
  add('school','annapolis','Naval Academy grad',has('annapolis'));

  // ---- first name
  ['John','William','James','Thomas','George','Charles','Samuel','Joseph','Henry','Robert'].forEach(n=>
    add('name','n'+n,'First name '+n,m=>m.first===n));

  // ---- current committees (current members only)
  const cc={}; M.forEach(m=>(m.committees||[]).forEach(c=>cc[c]=(cc[c]||0)+1));
  // long names are shortened to their first subject ("Senate Banking, Housing, and Urban Affairs" -> "Senate Banking")
  const shortC = c => c.length<=25 ? c : c.split(/,| and /)[0];
  Object.keys(cc).forEach(c=>add('committee','c'+c,shortC(c),m=>(m.committees||[]).indexOf(c)>=0));

  // drop anything too small to be playable
  return cats.filter(c=>{ let n=0; for(let i=0;i<M.length;i++){ if(c.test(M[i])&&++n>=MIN) return true; } return false; });
};
