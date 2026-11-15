// Recheck helper: downloads the names of all Oyez (oyez.org) Supreme Court cases, term by term (1789-2025; Oyez is complete from 1955), into audit/dh-curated-data/_oyez-index.json.
// Used to confirm Supreme Court answers independently of Wikidata. Usage: node site/tools/fetch-oyez-index.js
const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const out=[];
for(let t=1789;t<=2025;t++){
 for(let k=0;k<4;k++){try{const r=await fetch('https://api.oyez.org/cases?per_page=2000&filter=term:'+t,{headers:{'User-Agent':'StayInformedNewsTriviaBot/1.0 (educational trivia research)'}});const j=await r.json();for(const c of j)out.push([t,c.name,c.docket_number]);break}catch(e){await sleep(2000)}}
 await sleep(250);
}
fs.writeFileSync(require('path').join(__dirname,'..','..','audit','dh-curated-data','_oyez-index.json'),JSON.stringify(out));console.log(out.length)})();
