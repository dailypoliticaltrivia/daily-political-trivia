// Recheck helper: confirms every U.S. place/county answer exists in the Census Bureau 2023 Gazetteer (https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/ : place, cousubs, counties zips unzipped next to this script run in a scratch folder).
// Usage: copy to the folder holding the three unzipped Gazetteer .txt files and run with node; edit D (data folder path) if needed.
const fs=require("fs");const D=require("path").join(__dirname,"..","..","audit","dh-curated-data")+"/";
const AB={Alabama:"AL",Alaska:"AK",Arizona:"AZ",Arkansas:"AR",California:"CA",Colorado:"CO",Connecticut:"CT",Delaware:"DE","District of Columbia":"DC",Florida:"FL",Georgia:"GA",Hawaii:"HI",Idaho:"ID",Illinois:"IL",Indiana:"IN",Iowa:"IA",Kansas:"KS",Kentucky:"KY",Louisiana:"LA",Maine:"ME",Maryland:"MD",Massachusetts:"MA",Michigan:"MI",Minnesota:"MN",Mississippi:"MS",Missouri:"MO",Montana:"MT",Nebraska:"NE",Nevada:"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",Ohio:"OH",Oklahoma:"OK",Oregon:"OR",Pennsylvania:"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",Tennessee:"TN",Texas:"TX",Utah:"UT",Vermont:"VT",Virginia:"VA",Washington:"WA","West Virginia":"WV",Wisconsin:"WI",Wyoming:"WY"};
const rd=f=>fs.readFileSync(f,"latin1").split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split("\t").map(x=>x.trim()));
const P=new Map();for(const r of rd("2023_Gaz_place_national.txt"))P.set(r[0]+"|"+r[3],r[5]);
const CS=new Map();for(const r of rd("2023_Gaz_cousubs_national.txt"))CS.set(r[0]+"|"+r[3],"A");
const CO=new Map();for(const r of rd("2023_Gaz_counties_national.txt"))CO.set(r[0]+"|"+r[3],1);
let ok=0;
for(const f of ["us-places-10k","us-places-small"]){const a=JSON.parse(fs.readFileSync(D+f+".json","utf8")).map(r=>Object.assign(r,{n:Buffer.from(r.n,"utf8").toString("latin1")}));const lo=f=="us-places-10k"?10000:1000,hi=f=="us-places-10k"?1e9:4999;let k=0,b=[];
 for(const r of a){if(r.pop<lo||r.pop>hi)continue;k++;const key=AB[r.st]+"|"+r.n;const st=P.get(key)||CS.get(key);if(st==="A")ok++;else b.push(r.n+", "+r.st+" "+r.pop+" ["+(st||"no match")+"]")}
 console.log(f,k,"not-active-or-unmatched",b.length);console.log(b.slice(0,25).join("\n"));}
const cn=JSON.parse(fs.readFileSync(D+"us-counties.json","utf8"));let cb=[];for(const r of cn){if(!CO.has(AB[r.st]+"|"+r.n))cb.push(r.n+", "+r.st)}
console.log("counties",cn.length,"unmatched in 2023 gazetteer",cb.length,cb.join("; "));
