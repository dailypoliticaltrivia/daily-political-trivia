// U.S. Presidents for the "Presidents" mode of the grid game. Hand-written (no build script); edit this file directly.
// window.PRESIDENTS: one record per PERSON (45 people, 47 presidencies: Cleveland was #22 and #24, Trump is #45 and #47).
// Fields follow the member fields the game engine uses (id, name, aka for search, first = given first name, party, state = birth state,
// region, pct = rarity, tags) plus: ord, service, bd/inaug/dd (ISO birth, first-inauguration and death dates), bio (bioguide id: the game
// reuses photos/<bio>.jpg when the Congress data says that photo exists; everyone else has photo = photos/pres-<slug>.jpg; initials only if a file fails to load).
// pct (rarity 1-100) = birth-state population on a log scale (Wyoming = 1, California = 100); Jackson uses South Carolina.
// To update: after any change in office or death, edit service/lastYear/current/dd/died and re-check data with the category printout.
window.PRESIDENTS_UPDATED='2026-11-11';
window.PRESIDENTS_RARITY_NOTE='Rarity is based on the population of the president’s birth state: smaller state, lower (rarer) number. Jackson counts as South Carolina.';
window.PRESIDENTS=[
{"id":"pres-washington","photo":"photos/pres-washington.jpg","name":"George Washington","first":"George","party":"Independent","parties":["Independent"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#1","service":"1789–1797","firstYear":1789,"lastYear":1797,"current":false,"bd":"1732-02-22","inaug":"1789-04-30","dd":"1799-12-14","born":1732,"died":1799,"pct":64,"tags":["general","elected2","long8"]},
{"id":"pres-adams","photo":"photos/pres-adams.jpg","name":"John Adams","first":"John","party":"Federalist","parties":["Federalist"],"state":"MA","stateName":"Massachusetts","region":"Northeast","gender":"Man","ord":"#2","service":"1797–1801","firstYear":1797,"lastYear":1801,"current":false,"bd":"1735-10-30","inaug":"1797-03-04","dd":"1826-07-04","born":1735,"died":1826,"pct":60,"tags":["vp","short","harvard","family","ivy"]},
{"id":"pres-jefferson","photo":"photos/pres-jefferson.jpg","name":"Thomas Jefferson","first":"Thomas","party":"Democratic-Republican","parties":["Democratic-Republican"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#3","service":"1801–1809","firstYear":1801,"lastYear":1809,"current":false,"bd":"1743-04-13","inaug":"1801-03-04","dd":"1826-07-04","born":1743,"died":1826,"pct":64,"tags":["governor","vp","sos","elected2","long8"]},
{"id":"pres-madison","name":"James Madison","first":"James","party":"Democratic-Republican","parties":["Democratic-Republican"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#4","service":"1809–1817","firstYear":1809,"lastYear":1817,"current":false,"bd":"1751-03-16","inaug":"1809-03-04","dd":"1836-06-28","born":1751,"died":1836,"pct":64,"tags":["house","sos","elected2","long8","otherivy","congress","ivy"],"bio":"M000043"},
{"id":"pres-monroe","name":"James Monroe","first":"James","party":"Democratic-Republican","parties":["Democratic-Republican"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#5","service":"1817–1825","firstYear":1817,"lastYear":1825,"current":false,"bd":"1758-04-28","inaug":"1817-03-04","dd":"1831-07-04","born":1758,"died":1831,"pct":64,"tags":["senate","governor","sos","elected2","long8","congress"],"bio":"M000858"},
{"id":"pres-jqa","name":"John Quincy Adams","aka":"J Q Adams","first":"John","party":"Democratic-Republican","parties":["Democratic-Republican"],"state":"MA","stateName":"Massachusetts","region":"Northeast","gender":"Man","ord":"#6","service":"1825–1829","firstYear":1825,"lastYear":1829,"current":false,"bd":"1767-07-11","inaug":"1825-03-04","dd":"1848-02-23","born":1767,"died":1848,"pct":60,"tags":["senate","house","sos","lostpv","short","harvard","family","congress","ivy"],"bio":"A000041"},
{"id":"pres-jackson","name":"Andrew Jackson","aka":"Old Hickory","first":"Andrew","party":"Democrat","parties":["Democrat"],"state":"","stateName":"Waxhaws (NC/SC border)","region":"South","gender":"Man","ord":"#7","service":"1829–1837","firstYear":1829,"lastYear":1837,"current":false,"bd":"1767-03-15","inaug":"1829-03-04","dd":"1845-06-08","born":1767,"died":1845,"pct":52,"tags":["senate","house","general","elected2","long8","congress"],"bio":"J000005"},
{"id":"pres-vanburen","name":"Martin Van Buren","first":"Martin","party":"Democrat","parties":["Democrat"],"state":"NY","stateName":"New York","region":"Northeast","gender":"Man","ord":"#8","service":"1837–1841","firstYear":1837,"lastYear":1841,"current":false,"bd":"1782-12-05","inaug":"1837-03-04","dd":"1862-07-24","born":1782,"died":1862,"pct":84,"tags":["senate","governor","vp","sos","short","congress"],"bio":"V000009"},
{"id":"pres-whharrison","name":"William Henry Harrison","aka":"Tippecanoe","first":"William","party":"Whig","parties":["Whig"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#9","service":"1841","firstYear":1841,"lastYear":1841,"current":false,"bd":"1773-02-09","inaug":"1841-03-04","dd":"1841-04-04","born":1773,"died":1841,"pct":64,"tags":["senate","house","general","diedoffice","short","family","congress","ivy"],"bio":"H000279"},
{"id":"pres-tyler","name":"John Tyler","first":"John","party":"Whig","parties":["Whig"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#10","service":"1841–1845","firstYear":1841,"lastYear":1845,"current":false,"bd":"1790-03-29","inaug":"1841-04-04","dd":"1862-01-18","born":1790,"died":1862,"pct":64,"tags":["senate","house","governor","vp","succeeded","neverwon","short","congress"],"bio":"T000450"},
{"id":"pres-polk","name":"James K. Polk","first":"James","party":"Democrat","parties":["Democrat"],"state":"NC","stateName":"North Carolina","region":"South","gender":"Man","ord":"#11","service":"1845–1849","firstYear":1845,"lastYear":1849,"current":false,"bd":"1795-11-02","inaug":"1845-03-04","dd":"1849-06-15","born":1795,"died":1849,"pct":69,"tags":["house","governor","short","congress"],"bio":"P000409"},
{"id":"pres-taylor","photo":"photos/pres-taylor.jpg","name":"Zachary Taylor","aka":"Old Rough and Ready","first":"Zachary","party":"Whig","parties":["Whig"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#12","service":"1849–1850","firstYear":1849,"lastYear":1850,"current":false,"bd":"1784-11-24","inaug":"1849-03-05","dd":"1850-07-09","born":1784,"died":1850,"pct":64,"tags":["general","diedoffice","short","noelect"]},
{"id":"pres-fillmore","name":"Millard Fillmore","first":"Millard","party":"Whig","parties":["Whig"],"state":"NY","stateName":"New York","region":"Northeast","gender":"Man","ord":"#13","service":"1850–1853","firstYear":1850,"lastYear":1853,"current":false,"bd":"1800-01-07","inaug":"1850-07-10","dd":"1874-03-08","born":1800,"died":1874,"pct":84,"tags":["house","vp","succeeded","neverwon","short","congress"],"bio":"F000115"},
{"id":"pres-pierce","name":"Franklin Pierce","first":"Franklin","party":"Democrat","parties":["Democrat"],"state":"NH","stateName":"New Hampshire","region":"Northeast","gender":"Man","ord":"#14","service":"1853–1857","firstYear":1853,"lastYear":1857,"current":false,"bd":"1804-11-23","inaug":"1853-03-04","dd":"1869-10-08","born":1804,"died":1869,"pct":21,"tags":["senate","house","general","short","congress"],"bio":"P000333"},
{"id":"pres-buchanan","name":"James Buchanan","first":"James","party":"Democrat","parties":["Democrat"],"state":"PA","stateName":"Pennsylvania","region":"Northeast","gender":"Man","ord":"#15","service":"1857–1861","firstYear":1857,"lastYear":1861,"current":false,"bd":"1791-04-23","inaug":"1857-03-04","dd":"1868-06-01","born":1791,"died":1868,"pct":74,"tags":["senate","house","sos","short","congress"],"bio":"B001005"},
{"id":"pres-lincoln","name":"Abraham Lincoln","aka":"Abe Lincoln","first":"Abraham","party":"Republican","parties":["Republican"],"state":"KY","stateName":"Kentucky","region":"South","gender":"Man","ord":"#16","service":"1861–1865","firstYear":1861,"lastYear":1865,"current":false,"bd":"1809-02-12","inaug":"1861-03-04","dd":"1865-04-15","born":1809,"died":1865,"pct":49,"tags":["house","diedoffice","assassinated","elected2","congress"],"bio":"L000313"},
{"id":"pres-ajohnson","name":"Andrew Johnson","first":"Andrew","party":"Democrat","parties":["Democrat"],"state":"NC","stateName":"North Carolina","region":"South","gender":"Man","ord":"#17","service":"1865–1869","firstYear":1865,"lastYear":1869,"current":false,"bd":"1808-12-29","inaug":"1865-04-15","dd":"1875-07-31","born":1808,"died":1875,"pct":69,"tags":["senate","house","governor","vp","succeeded","general","neverwon","short","congress"],"bio":"J000116"},
{"id":"pres-grant","photo":"photos/pres-grant.jpg","name":"Ulysses S. Grant","aka":"U S Grant","first":"Ulysses","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#18","service":"1869–1877","firstYear":1869,"lastYear":1877,"current":false,"bd":"1822-04-27","inaug":"1869-03-04","dd":"1885-07-23","born":1822,"died":1885,"pct":72,"tags":["general","union","elected2","long8","noelect"]},
{"id":"pres-hayes","name":"Rutherford B. Hayes","first":"Rutherford","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#19","service":"1877–1881","firstYear":1877,"lastYear":1881,"current":false,"bd":"1822-10-04","inaug":"1877-03-05","dd":"1893-01-17","born":1822,"died":1893,"pct":72,"tags":["house","governor","general","union","lostpv","short","lawdeg","harvard","congress","ivy"],"bio":"H000393"},
{"id":"pres-garfield","name":"James A. Garfield","first":"James","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#20","service":"1881","firstYear":1881,"lastYear":1881,"current":false,"bd":"1831-11-19","inaug":"1881-03-04","dd":"1881-09-19","born":1831,"died":1881,"pct":72,"tags":["house","general","union","diedoffice","assassinated","short","congress"],"bio":"G000063"},
{"id":"pres-arthur","photo":"photos/pres-arthur.jpg","name":"Chester A. Arthur","first":"Chester","party":"Republican","parties":["Republican"],"state":"VT","stateName":"Vermont","region":"Northeast","gender":"Man","ord":"#21","service":"1881–1885","firstYear":1881,"lastYear":1885,"current":false,"bd":"1829-10-05","inaug":"1881-09-19","dd":"1886-11-18","born":1829,"died":1886,"pct":4,"tags":["vp","succeeded","neverwon","short"]},
{"id":"pres-cleveland","photo":"photos/pres-cleveland.jpg","name":"Grover Cleveland","first":"Stephen","party":"Democrat","parties":["Democrat"],"state":"NJ","stateName":"New Jersey","region":"Northeast","gender":"Man","ord":"#22/#24","service":"1885–1889, 1893–1897","firstYear":1885,"lastYear":1897,"current":false,"bd":"1837-03-18","inaug":"1885-03-04","dd":"1908-06-24","born":1837,"died":1908,"pct":66,"tags":["governor","elected2","long8"]},
{"id":"pres-bharrison","name":"Benjamin Harrison","first":"Benjamin","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#23","service":"1889–1893","firstYear":1889,"lastYear":1893,"current":false,"bd":"1833-08-20","inaug":"1889-03-04","dd":"1901-03-13","born":1833,"died":1901,"pct":72,"tags":["senate","general","union","lostpv","short","family","congress"],"bio":"H000263"},
{"id":"pres-mckinley","name":"William McKinley","first":"William","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#25","service":"1897–1901","firstYear":1897,"lastYear":1901,"current":false,"bd":"1843-01-29","inaug":"1897-03-04","dd":"1901-09-14","born":1843,"died":1901,"pct":72,"tags":["house","governor","union","diedoffice","assassinated","elected2","congress"],"bio":"M000522"},
{"id":"pres-troosevelt","photo":"photos/pres-troosevelt.jpg","name":"Theodore Roosevelt","aka":"Teddy Roosevelt TR","first":"Theodore","party":"Republican","parties":["Republican"],"state":"NY","stateName":"New York","region":"Northeast","gender":"Man","ord":"#26","service":"1901–1909","firstYear":1901,"lastYear":1909,"current":false,"bd":"1858-10-27","inaug":"1901-09-14","dd":"1919-01-06","born":1858,"died":1919,"pct":84,"tags":["governor","vp","succeeded","harvard","nobel","ivy"]},
{"id":"pres-taft","photo":"photos/pres-taft.jpg","name":"William Howard Taft","first":"William","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#27","service":"1909–1913","firstYear":1909,"lastYear":1913,"current":false,"bd":"1857-09-15","inaug":"1909-03-04","dd":"1930-03-08","born":1857,"died":1930,"pct":72,"tags":["short","noelect","lawdeg","yale","ivy"]},
{"id":"pres-wilson","photo":"photos/pres-wilson.jpg","name":"Woodrow Wilson","first":"Woodrow","party":"Democrat","parties":["Democrat"],"state":"VA","stateName":"Virginia","region":"South","gender":"Man","ord":"#28","service":"1913–1921","firstYear":1913,"lastYear":1921,"current":false,"bd":"1856-12-28","inaug":"1913-03-04","dd":"1924-02-03","born":1856,"died":1924,"pct":64,"tags":["governor","elected2","long8","otherivy","nobel","ivy"]},
{"id":"pres-harding","name":"Warren G. Harding","first":"Warren","party":"Republican","parties":["Republican"],"state":"OH","stateName":"Ohio","region":"Midwest","gender":"Man","ord":"#29","service":"1921–1923","firstYear":1921,"lastYear":1923,"current":false,"bd":"1865-11-02","inaug":"1921-03-04","dd":"1923-08-02","born":1865,"died":1923,"pct":72,"tags":["senate","diedoffice","short","congress"],"bio":"H000192"},
{"id":"pres-coolidge","photo":"photos/pres-coolidge.jpg","name":"Calvin Coolidge","first":"John","party":"Republican","parties":["Republican"],"state":"VT","stateName":"Vermont","region":"Northeast","gender":"Man","ord":"#30","service":"1923–1929","firstYear":1923,"lastYear":1929,"current":false,"bd":"1872-07-04","inaug":"1923-08-02","dd":"1933-01-05","born":1872,"died":1933,"pct":4,"tags":["governor","vp","succeeded"]},
{"id":"pres-hoover","photo":"photos/pres-hoover.jpg","name":"Herbert Hoover","first":"Herbert","party":"Republican","parties":["Republican"],"state":"IA","stateName":"Iowa","region":"Midwest","gender":"Man","ord":"#31","service":"1929–1933","firstYear":1929,"lastYear":1933,"current":false,"bd":"1874-08-10","inaug":"1929-03-04","dd":"1964-10-20","born":1874,"died":1964,"pct":41,"tags":["short","noelect"]},
{"id":"pres-fdr","photo":"photos/pres-fdr.jpg","name":"Franklin D. Roosevelt","aka":"FDR","first":"Franklin","party":"Democrat","parties":["Democrat"],"state":"NY","stateName":"New York","region":"Northeast","gender":"Man","ord":"#32","service":"1933–1945","firstYear":1933,"lastYear":1945,"current":false,"bd":"1882-01-30","inaug":"1933-03-04","dd":"1945-04-12","born":1882,"died":1945,"pct":84,"tags":["governor","diedoffice","elected2","long8","harvard","ivy"]},
{"id":"pres-truman","name":"Harry S. Truman","first":"Harry","party":"Democrat","parties":["Democrat"],"state":"MO","stateName":"Missouri","region":"Midwest","gender":"Man","ord":"#33","service":"1945–1953","firstYear":1945,"lastYear":1953,"current":false,"bd":"1884-05-08","inaug":"1945-04-12","dd":"1972-12-26","born":1884,"died":1972,"pct":56,"tags":["senate","vp","succeeded","congress"],"bio":"T000387"},
{"id":"pres-eisenhower","photo":"photos/pres-eisenhower.jpg","name":"Dwight D. Eisenhower","aka":"Ike","first":"Dwight","party":"Republican","parties":["Republican"],"state":"TX","stateName":"Texas","region":"South","gender":"Man","ord":"#34","service":"1953–1961","firstYear":1953,"lastYear":1961,"current":false,"bd":"1890-10-14","inaug":"1953-01-20","dd":"1969-03-28","born":1890,"died":1969,"pct":93,"tags":["general","ww2","elected2","long8","noelect"]},
{"id":"pres-jfk","name":"John F. Kennedy","aka":"JFK Jack Kennedy","first":"John","party":"Democrat","parties":["Democrat"],"state":"MA","stateName":"Massachusetts","region":"Northeast","gender":"Man","ord":"#35","service":"1961–1963","firstYear":1961,"lastYear":1963,"current":false,"bd":"1917-05-29","inaug":"1961-01-20","dd":"1963-11-22","born":1917,"died":1963,"pct":60,"tags":["senate","house","navy","ww2","diedoffice","assassinated","short","harvard","congress","ivy"],"bio":"K000107"},
{"id":"pres-lbj","name":"Lyndon B. Johnson","aka":"LBJ","first":"Lyndon","party":"Democrat","parties":["Democrat"],"state":"TX","stateName":"Texas","region":"South","gender":"Man","ord":"#36","service":"1963–1969","firstYear":1963,"lastYear":1969,"current":false,"bd":"1908-08-27","inaug":"1963-11-22","dd":"1973-01-22","born":1908,"died":1973,"pct":93,"tags":["senate","house","vp","succeeded","navy","ww2","congress"],"bio":"J000160"},
{"id":"pres-nixon","name":"Richard Nixon","aka":"Richard M. Nixon","first":"Richard","party":"Republican","parties":["Republican"],"state":"CA","stateName":"California","region":"West","gender":"Man","ord":"#37","service":"1969–1974","firstYear":1969,"lastYear":1974,"current":false,"bd":"1913-01-09","inaug":"1969-01-20","dd":"1994-04-22","born":1913,"died":1994,"pct":100,"tags":["senate","house","vp","navy","ww2","elected2","lawdeg","congress"],"bio":"N000116"},
{"id":"pres-ford","name":"Gerald Ford","aka":"Gerald R. Ford","first":"Gerald","party":"Republican","parties":["Republican"],"state":"NE","stateName":"Nebraska","region":"Midwest","gender":"Man","ord":"#38","service":"1974–1977","firstYear":1974,"lastYear":1977,"current":false,"bd":"1913-07-14","inaug":"1974-08-09","dd":"2006-12-26","born":1913,"died":2006,"pct":30,"tags":["house","vp","succeeded","navy","ww2","neverwon","short","lawdeg","yale","congress","ivy"],"bio":"F000260"},
{"id":"pres-carter","photo":"photos/pres-carter.jpg","name":"Jimmy Carter","aka":"James Earl Carter","first":"James","party":"Democrat","parties":["Democrat"],"state":"GA","stateName":"Georgia","region":"South","gender":"Man","ord":"#39","service":"1977–1981","firstYear":1977,"lastYear":1981,"current":false,"bd":"1924-10-01","inaug":"1977-01-20","dd":"2024-12-29","born":1924,"died":2024,"pct":69,"tags":["governor","navy","short","nobel"]},
{"id":"pres-reagan","photo":"photos/pres-reagan.jpg","name":"Ronald Reagan","first":"Ronald","party":"Republican","parties":["Republican"],"state":"IL","stateName":"Illinois","region":"Midwest","gender":"Man","ord":"#40","service":"1981–1989","firstYear":1981,"lastYear":1989,"current":false,"bd":"1911-02-06","inaug":"1981-01-20","dd":"2004-06-05","born":1911,"died":2004,"pct":74,"tags":["governor","ww2","elected2","long8"]},
{"id":"pres-ghwbush","name":"George H. W. Bush","aka":"Bush 41 George Bush","first":"George","party":"Republican","parties":["Republican"],"state":"MA","stateName":"Massachusetts","region":"Northeast","gender":"Man","ord":"#41","service":"1989–1993","firstYear":1989,"lastYear":1993,"current":false,"bd":"1924-06-12","inaug":"1989-01-20","dd":"2018-11-30","born":1924,"died":2018,"pct":60,"tags":["house","vp","navy","ww2","short","yale","family","congress","ivy"],"bio":"B001166"},
{"id":"pres-clinton","photo":"photos/pres-clinton.jpg","name":"Bill Clinton","aka":"William J. Clinton","first":"William","party":"Democrat","parties":["Democrat"],"state":"AR","stateName":"Arkansas","region":"South","gender":"Man","ord":"#42","service":"1993–2001","firstYear":1993,"lastYear":2001,"current":false,"bd":"1946-08-19","inaug":"1993-01-20","dd":null,"born":1946,"died":null,"pct":40,"tags":["governor","elected2","long8","lawdeg","yale","ivy"]},
{"id":"pres-gwbush","photo":"photos/pres-gwbush.jpg","name":"George W. Bush","aka":"Bush 43 W George Bush","first":"George","party":"Republican","parties":["Republican"],"state":"CT","stateName":"Connecticut","region":"Northeast","gender":"Man","ord":"#43","service":"2001–2009","firstYear":2001,"lastYear":2009,"current":false,"bd":"1946-07-06","inaug":"2001-01-20","dd":null,"born":1946,"died":null,"pct":44,"tags":["governor","elected2","lostpv","long8","harvard","yale","family","ivy"]},
{"id":"pres-obama","name":"Barack Obama","aka":"Barack Hussein Obama","first":"Barack","party":"Democrat","parties":["Democrat"],"state":"HI","stateName":"Hawaii","region":"West","gender":"Man","ord":"#44","service":"2009–2017","firstYear":2009,"lastYear":2017,"current":false,"bd":"1961-08-04","inaug":"2009-01-20","dd":null,"born":1961,"died":null,"pct":23,"tags":["senate","elected2","long8","lawdeg","harvard","otherivy","nobel","congress","ivy"],"bio":"O000167"},
{"id":"pres-trump","photo":"photos/pres-trump.jpg","name":"Donald Trump","aka":"Donald J. Trump","first":"Donald","party":"Republican","parties":["Republican"],"state":"NY","stateName":"New York","region":"Northeast","gender":"Man","ord":"#45/#47","service":"2017–2021, 2025–present","firstYear":2017,"lastYear":null,"current":true,"bd":"1946-06-14","inaug":"2017-01-20","dd":null,"born":1946,"died":null,"pct":84,"tags":["elected2","lostpv","noelect","otherivy","ivy"]},
{"id":"pres-biden","name":"Joe Biden","aka":"Joseph R. Biden Jr.","first":"Joseph","party":"Democrat","parties":["Democrat"],"state":"PA","stateName":"Pennsylvania","region":"Northeast","gender":"Man","ord":"#46","service":"2021–2025","firstYear":2021,"lastYear":2025,"current":false,"bd":"1942-11-20","inaug":"2021-01-20","dd":null,"born":1942,"died":null,"pct":74,"tags":["senate","vp","short","lawdeg","congress"],"bio":"B000444"}
];

// window.PRESIDENT_CATEGORIES(members) -> [{group,key,label,test}], same shape as categories.js. Categories with < MIN presidents are dropped.
window.PRESIDENT_CATEGORIES = function(M){
  const MIN = 6; // casual-friendly: every category has at least 6 presidents (audit 2026-11)
  const cats = [];
  const add = (group,key,label,test)=>cats.push({group,key,label,test});
  const has = t => m => m.tags.indexOf(t) >= 0;
  // whole years between two ISO dates (yyyy-mm-dd)
  const yrs = (a,b)=>{ const A=a.split('-').map(Number), B=b.split('-').map(Number);
    let y=B[0]-A[0]; if(B[1]<A[1] || (B[1]===A[1] && B[2]<A[2])) y--; return y; };
  const ageIn = m => yrs(m.bd,m.inaug);
  const lived = m => m.dd ? yrs(m.bd,m.dd) : null;

  // ---- party (party the president was elected under / identified with)
  add('party','dem','Democrat',m=>m.party==='Democrat');
  add('party','rep','Republican',m=>m.party==='Republican');

  // ---- when they first took office
  add('era','e1','Took office before 1830',m=>m.inaug<'1830');
  add('era','e2','Took office 1830–1860',m=>m.inaug>='1830'&&m.inaug<'1861');
  add('era','e3','Took office 1861–1900',m=>m.inaug>='1861'&&m.inaug<'1901');
  add('era','e4','Took office 1901–1944',m=>m.inaug>='1901'&&m.inaug<'1945');
  add('era','e5','Took office 1945–1988',m=>m.inaug>='1945'&&m.inaug<'1989');
  add('era','e6','Took office since 1989',m=>m.inaug>='1989');

  // ---- age at (first) inauguration
  add('age','a1','Under 50 when first inaugurated',m=>ageIn(m)<50);

  // ---- born
  add('state','sVA','Born in Virginia',m=>m.state==='VA');
  add('state','sOH','Born in Ohio',m=>m.state==='OH');
  ['South','Northeast','Midwest'].forEach(r=>add('region','r'+r,'Born in the '+r,m=>m.region===r));
  add('life','b1700','Born in the 1700s',m=>m.born<=1799);
  add('life','b1800','Born in the 1800s',m=>m.born>=1800&&m.born<=1899);
  add('life','b1900','Born in the 1900s',m=>m.born>=1900&&m.born<=1999);

  // ---- life and death
  add('life','lived90','Lived to 90 or older',m=>lived(m)!==null&&lived(m)>=90);
  add('life','young','Died before age 60',m=>lived(m)!==null&&lived(m)<60);
  add('life','died','Died in office',has('diedoffice'));
  add('life','family','Father, son or grandson of a president',has('family'));

  // ---- career before the presidency
  add('office','congress','Served in Congress',has('congress'));
  add('office','senate','U.S. Senator',has('senate'));
  add('office','house','U.S. House member',has('house'));
  add('office','gov','Governor',has('governor'));
  add('office','vp','Vice President',has('vp'));
  add('office','sos','Secretary of State',has('sos'));
  add('office','succ','Took office after a death or resignation',has('succeeded'));

  // ---- military
  add('military','general','Army general',has('general'));
  add('military','navy','Served in the Navy',has('navy'));
  add('military','ww2','World War II veteran',has('ww2'));

  // ---- elections and time in office
  add('election','twice','Won two presidential elections',has('elected2'));
  add('service','short','Served 4 years or less',has('short'));
  add('service','long','Served 8 or more years',has('long8'));

  // ---- education
  add('school','harvard','Attended Harvard',has('harvard'));
  add('school','ivy','Attended an Ivy League school',has('ivy'));

  // ---- name and honors
  add('name','nJames','First name James',m=>m.first==='James');

  return cats.filter(c=>M.filter(c.test).length>=MIN);
};
