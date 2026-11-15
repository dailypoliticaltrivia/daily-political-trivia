/* Stay Informed News — Opinions data layer.
   window.SINDb: one async API with two backends.
     - "demo":     localStorage, seeded sample content. Used while opinions/config.js is empty.
     - "supabase": Supabase Auth + Postgres (Row Level Security does the real enforcement).
   Any page can include just this file; it loads opinions/config.js itself when needed and,
   in Supabase mode only, the pinned supabase-js build from jsDelivr.
   It also updates the shared header's account link (SIN.setAccount) on every page that loads it. */
(function(){
  'use strict';
  const SCRIPT = document.currentScript;
  const DIR = new URL('./', SCRIPT && SCRIPT.src ? SCRIPT.src : location.href).href;   // .../opinions/
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const LIMITS = { title:150, subtitle:250, body:50000, comment:5000, bio:500, display_name:60, reason:1000, tags:5, tag:30 };
  const RECOVERY = /type=recovery/.test(location.hash);   // captured before supabase-js strips the hash

  const fail = m => { throw new Error(m); };
  const str = v => (v == null ? '' : String(v));
  const nowISO = () => new Date().toISOString();
  const nl = s => str(s).replace(/\r\n?/g, '\n');

  /* ---------- shared helpers & validation (both backends) ---------- */
  function plainText(md){
    return str(md)
      .replace(/```[\s\S]*?(```|$)/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function excerpt(md, n){
    n = n || 200;
    const t = plainText(md);
    if (t.length <= n) return t;
    return t.slice(0, n).replace(/\s+\S*$/, '') + '…';
  }
  function readingMinutes(md){ const w = (str(md).match(/\S+/g) || []).length; return Math.max(1, Math.ceil(w / 230)); }

  function cleanTags(t){
    let a = Array.isArray(t) ? t : str(t).split(',');
    a = a.map(x => str(x).toLowerCase().replace(/[^a-z0-9 \-]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    a = Array.from(new Set(a));
    if (a.length > LIMITS.tags) fail('Use at most ' + LIMITS.tags + ' tags.');
    if (a.some(x => x.length > LIMITS.tag)) fail('Each tag must be ' + LIMITS.tag + ' characters or fewer.');
    return a;
  }
  function checkPost(p){
    p = p || {};
    const title = str(p.title).replace(/\s+/g, ' ').trim();
    const subtitle = str(p.subtitle).replace(/\s+/g, ' ').trim();
    const body = nl(p.body).replace(/\s+$/, '');
    if (!title) fail('Please add a title.');
    if (title.length > LIMITS.title) fail('Titles can be at most ' + LIMITS.title + ' characters.');
    if (subtitle.length > LIMITS.subtitle) fail('Subtitles can be at most ' + LIMITS.subtitle + ' characters.');
    if (!body.trim()) fail('Your piece needs some text.');
    if (body.length > LIMITS.body) fail('Pieces can be at most 50,000 characters.');
    return { title, subtitle, body, tags: cleanTags(p.tags) };
  }
  function checkComment(b){
    b = nl(b).trim();
    if (!b) fail('Write something first.');
    if (b.length > LIMITS.comment) fail('Comments can be at most 5,000 characters.');
    return b;
  }
  function checkUsername(u){
    u = str(u).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(u)) fail('Usernames are 3 to 24 characters: lowercase letters, numbers and underscores.');
    return u;
  }
  function checkDisplayName(n){
    n = str(n).replace(/\s+/g, ' ').trim();
    if (!n) fail('Please enter a display name.');
    if (n.length > LIMITS.display_name) fail('Display names can be at most ' + LIMITS.display_name + ' characters.');
    return n;
  }
  function checkBio(b){ b = nl(b).trim(); if (b.length > LIMITS.bio) fail('Bios can be at most ' + LIMITS.bio + ' characters.'); return b; }
  function checkEmail(e){ e = str(e).trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('Please enter a valid email address.'); return e; }
  /* Passwords: length is what matters (no "needs a symbol" tricks). 10 to 72 characters, not a well-known password.
     Set the same minimum length in Supabase too (Authentication > Providers > Email); this is the friendly check. */
  const COMMON = ('password,passw0rd,1234567890,0123456789,12345678910,qwertyuiop,qwerty1234,qwertyuiop1,asdfghjkl1,1q2w3e4r5t,iloveyou12,' +
    'letmein123,welcome123,admin12345,administrator,changeme123,password12,password123,password1234,abcdefghij,abcd123456,trustno1234,' +
    'football123,baseball123,superman123,monkey12345,dragon12345,master12345,sunshine123,princess123,whatever123,0000000000,1111111111,' +
    'aaaaaaaaaa,stayinformed,opinions123,demo-admin').split(',');
  function passwordIssue(p, ctx){
    p = str(p); ctx = ctx || {};
    if (p.length < 10) return 'Use at least 10 characters. A few random words strung together works well.';
    if (p.length > 72) return 'Passwords can be at most 72 characters.';
    const low = p.toLowerCase();
    if (COMMON.indexOf(low) >= 0 || /^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij)/.test(low)) return 'That password is too common. Please choose something less guessable.';
    const parts = [ctx.email && str(ctx.email).split('@')[0], ctx.username].filter(x => x && String(x).length >= 4).map(x => String(x).toLowerCase());
    if (parts.some(x => low.indexOf(x) >= 0)) return 'Your password should not contain your email name or username.';
    return '';
  }
  // 0 to 4 for the strength hint under the password box (length first; no character-type rules)
  function passwordStrength(p){
    p = str(p);
    if (!p) return { score: 0, label: '' };
    if (passwordIssue(p)) return { score: 1, label: p.length < 10 ? 'Too short' : 'Too easy to guess' };
    const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(r => r.test(p)).length;
    const words = p.split(/[\s\-_.]+/).filter(Boolean).length;
    const pts = (p.length >= 14 ? 1 : 0) + (p.length >= 20 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (words >= 3 ? 1 : 0);
    const score = pts >= 3 ? 4 : pts >= 1 ? 3 : 2;
    return { score, label: ['', 'Too short', 'OK', 'Good', 'Strong'][score] };
  }
  function checkPassword(p, ctx){ const m = passwordIssue(p, ctx); if (m) fail(m); return str(p); }
  function checkReport(r){
    r = r || {};
    if (r.target_type !== 'post' && r.target_type !== 'comment') fail('Unknown report type.');
    if (!r.target_id) fail('Nothing to report.');
    const reason = str(r.reason).trim();
    if (!reason) fail('Please give a reason.');
    if (reason.length > LIMITS.reason) fail('Please keep the reason under 1,000 characters.');
    return { target_type: r.target_type, target_id: String(r.target_id), reason };
  }
  function shapePost(p, full){
    const o = Object.assign({}, p);
    o.subtitle = o.subtitle || '';
    o.tags = o.tags || [];
    o.excerpt = o.subtitle || excerpt(o.body);
    o.reading_minutes = readingMinutes(o.body);
    o.like_count = o.like_count || 0;
    o.comment_count = o.comment_count || 0;
    o.author = o.author || { id: o.author_id, username: null, display_name: 'Former member' };
    if (!full) delete o.body;
    return o;
  }
  function thread(rows){
    const top = [], byId = {};
    rows.forEach(c => { c.replies = []; byId[c.id] = c; });
    rows.forEach(c => { if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies.push(c); else if (!c.parent_id) top.push(c); });
    return top;
  }
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  function loadScript(src, integrity){
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      if (integrity){ s.integrity = integrity; s.crossOrigin = 'anonymous'; }
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------- client-side throttle for sign-in / sign-up / reset (a politeness and nuisance limit;
     the real brute-force protection is Supabase's own rate limits on its Auth endpoints) ---------- */
  const TKEY = 'sin-auth-throttle', TWIN = 10 * 60e3, TMAX = 5;
  const tmem = {};
  function tload(){ try { return JSON.parse(localStorage.getItem(TKEY) || '{}') || {}; } catch(e){ return Object.assign({}, tmem); } }
  function tsave(o){ try { localStorage.setItem(TKEY, JSON.stringify(o)); } catch(e){ Object.assign(tmem, o); } }
  function throttleCheck(k){
    const o = tload(), now = Date.now(), a = (o[k] || []).filter(t => now - t < TWIN);
    if (a.length >= TMAX){ const wait = Math.max(1, Math.ceil((TWIN - (now - a[0])) / 60e3)); fail('Too many attempts. Please wait about ' + wait + ' minute' + (wait === 1 ? '' : 's') + ' and try again.'); }
  }
  function throttleHit(k){ const o = tload(), now = Date.now(); o[k] = (o[k] || []).filter(t => now - t < TWIN).concat(now); tsave(o); }
  function throttleClear(k){ const o = tload(); delete o[k]; tsave(o); }
  // every call counts as an attempt; a success (when clearOnOk) wipes the counter
  async function throttled(k, clearOnOk, fn){
    throttleCheck(k); throttleHit(k);
    const r = await fn();
    if (clearOnOk) throttleClear(k);
    return r;
  }

  /* =====================================================================
     DEMO BACKEND (localStorage)
     ===================================================================== */
  function demoBackend(){
    const KEY = 'sin-opinions-demo-v1', SESSION = 'sin-opinions-demo-session';
    const mem = {};
    const ls = (() => { try { const t = '__sin_t'; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; } catch(e){ return null; } })();
    const get = k => ls ? ls.getItem(k) : (k in mem ? mem[k] : null);
    const set = (k, v) => { if (ls) { try { ls.setItem(k, v); return; } catch(e){ fail('Browser storage is full or blocked.'); } } mem[k] = v; };
    const del = k => { if (ls) ls.removeItem(k); delete mem[k]; };
    const listeners = new Set();

    function read(){ try { return JSON.parse(get(KEY)); } catch(e){ return null; } }
    function write(d){ set(KEY, JSON.stringify(d)); }
    function sessionUser(d){ const id = get(SESSION); return id ? d.users.find(u => u.id === id) || null : null; }
    function emit(event){ const d = read(); const u = d && sessionUser(d); listeners.forEach(cb => { try { cb(u ? pubUser(u) : null, event); } catch(e){ console.error(e); } }); }

    async function hash(pw, salt){
      const input = 'sin-demo:' + salt + ':' + pw;
      if (window.crypto && crypto.subtle && window.TextEncoder){
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      let h = 2166136261; for (let i = 0; i < input.length; i++){ h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); } // fallback, demo only
      return 'f' + (h >>> 0).toString(16);
    }
    const pubUser = u => ({ id: u.id, email: u.email, username: u.username, display_name: u.display_name, bio: u.bio || '', is_admin: !!u.is_admin, role: u.is_admin ? 'admin' : null, is_banned: !!u.is_banned, verified: u.verified !== false, created_at: u.created_at });
    const profileOf = (d, id) => { const u = d.users.find(x => x.id === id); return u ? { id: u.id, username: u.username, display_name: u.display_name } : null; };

    async function seed(){
      const H = 3600e3, D = 24 * H, t = Date.now();
      const at = ms => new Date(t - ms).toISOString();
      const salt = uid();
      const users = [
        { id:'u-editor',  username:'editor',       display_name:'The Editors',        bio:'Moderators of the Stay Informed community. (Demo admin account.)', is_admin:true },
        { id:'u-okafor',  username:'margaret_ok',  display_name:'Margaret Okafor',    bio:'Retired city clerk. Thirty years of counting ballots and taking minutes.' },
        { id:'u-reyes',   username:'dreyes',       display_name:'Daniel Reyes',       bio:'High school civics teacher and debate coach.' },
        { id:'u-natarajan',username:'priya_plans', display_name:'Priya Natarajan',    bio:'Urban planner. Writes about housing, transit and how towns grow.' },
        { id:'u-whitfield',username:'tomwhitfield',display_name:'Tom Whitfield',      bio:'Two-term member of a small-town council. Former hardware store owner.' },
        { id:'u-kowalski',username:'elena_k',      display_name:'Elena Kowalski',     bio:'Spent fifteen years at a county weekly until it closed.' }
      ].map((u, i) => Object.assign({ email: u.username + '@demo.local', is_admin:false, is_banned:false, verified:true, salt:null, pass_hash:null, created_at: at((200 - i*10) * D) }, u));
      users[0].salt = salt; users[0].pass_hash = await hash('demo-admin', salt);

      const posts = [
        { id:'p-onecycle', author_id:'u-okafor', published_at: at(5*H), tags:['elections','local government'],
          title:'Hold Local Elections in November. Turnout Depends on It.',
          subtitle:'Odd-year, off-cycle elections hand city hall to the few people who remember to vote.',
          body:
`For three decades I counted the ballots in our city's spring elections. Most years, fewer than one registered voter in six showed up. The following November, for a governor's race, the same precincts would be packed.

The people we elected in April controlled the police budget, the water rates and the zoning map. Those decisions arguably touch daily life more than anything a governor does. Yet they were decided by a small, older and unusually motivated slice of the city.

## What the research says

Studies of cities that moved their elections to coincide with state and federal races keep finding the same thing: turnout in local contests roughly **doubles**, and the electorate starts to look more like the community it governs. It also saves money, because the county is already running an election that day.

## The fair objection

Critics say local races get lost at the bottom of a long ballot, and that voters who came for the presidential race will skip the school board or guess. That concern is real. Ballot drop-off does happen.

But I would rather have a city council chosen by 60 percent of voters, some of them less informed, than by 15 percent who are mostly the people with the time and the strongest stake. The answer to drop-off is better voter guides and local coverage, not keeping turnout low.

> A small electorate is not a careful electorate. It is just a small one.

If your city still votes in odd years or in spring, ask your council why. You may find that nobody has a good answer.` },
        { id:'p-phones', author_id:'u-reyes', published_at: at(1*D + 3*H), tags:['education','technology'],
          title:'Before We Ban Phones in Schools, Ask the Teachers',
          subtitle:'A classroom view of a debate that is mostly being held outside the classroom.',
          body:
`Every few weeks another state proposes a ban on phones during the school day. As someone who teaches civics to sixteen-year-olds, I am sympathetic. I have watched a lively discussion die the moment one buzz travels around the room.

Still, the debate is missing the people who would actually enforce it.

## What a ban gets right

- Attention is a skill, and school is where it gets practiced.
- Lunch and hallways are more social when phones are put away.
- A clear rule is easier to enforce than a teacher-by-teacher patchwork.

## What it gets wrong

Enforcement falls on teachers. A policy without lockable pouches, office support, or a plan for parents who want to reach their kids in an emergency becomes one more thing to police instead of teach.

Phones are also tools. My students use them to look up a bill's text during a mock legislature, to photograph primary sources, and to register to vote on their eighteenth birthday, which we celebrate in class.

## A middle path

My school tried a "phones away, not phones gone" approach. Phones live in a pouch by the door during instruction and come out when a lesson calls for them. It isn't perfect, but attention improved and nobody had to confiscate anything.

Whatever your state decides, fund the enforcement and let the people in the room help design the rule. Policy written *for* teachers works better when it is written *with* them.` },
        { id:'p-zoning', author_id:'u-natarajan', published_at: at(2*D + 6*H), tags:['housing','zoning'],
          title:'Zoning Is the Housing Debate Nobody Wants to Have',
          subtitle:'Rents follow supply, and supply follows rules most residents have never read.',
          body:
`When people talk about housing costs, they usually talk about interest rates, investors or wages. Those all matter. But in most American towns, the single biggest lever sits in a document few residents have opened: the zoning code.

In many cities, the majority of residential land allows only one detached house per lot. Duplexes, small apartment buildings and backyard cottages are either banned or require a special hearing that can take a year.

## Why it matters

When demand rises and the rules prevent new homes, prices rise instead. It isn't ideological; it is arithmetic. More households competing for the same number of homes bid up the price.

## Why people resist

Neighbors' concerns are not silly. They worry about parking, traffic, school crowding, and losing the character of a street they love. Those concerns deserve answers, not dismissal.

Some of the answers are practical:

1. Allow modest density, such as duplexes and triplexes, everywhere rather than towers in a few places.
2. Pair new homes with transit and sidewalk investments.
3. Set clear design standards so approvals are predictable for builders and neighbors alike.

## A test for your town

Pull up your city's zoning map (most are online) and see how much land allows anything other than a single house. Then ask whether the rules match the town you want in twenty years. People on every side of this debate tend to find that question clarifying.` },
        { id:'p-townhall', author_id:'u-whitfield', published_at: at(4*D + 2*H), tags:['civic life','local government'],
          title:'In Defense of the Boring Town Hall Meeting',
          subtitle:'Three hours on culvert repair taught me more about democracy than any cable news segment.',
          body:
`Our council meets on the second Tuesday of the month in a room with fluorescent lights and folding chairs. Most nights, the audience is me, the clerk, a reporter if we're lucky, and one resident who has come about a specific pothole.

It is boring. It is also where the work happens.

## What actually gets decided

Last year we approved a new well pump, renegotiated the trash contract and spent forty minutes on whether to replace a culvert on Mill Road now or after the spring thaw. None of it made the news. All of it affected every household in town.

## Why showing up matters

When a dozen residents attend, the conversation changes. Members explain their reasoning more carefully. Staff bring better information. And occasionally someone in a folding chair points out something none of us had considered, like the school bus route that uses Mill Road.

## My ask

Go to one meeting this year. You do not need to speak. Read the agenda beforehand (it is posted online, I promise) and just listen. If something matters to you, there is a public comment period at the start.

National politics can feel like a sport you watch. Local government is a game you can still walk onto the field and play.` },
        { id:'p-newsdesert', author_id:'u-kowalski', published_at: at(7*D + 5*H), tags:['local news','media'],
          title:'What a Year Without a Local Paper Taught My County',
          subtitle:'When the weekly closed, nobody covered the school board. Then the rumors filled the gap.',
          body:
`Our county weekly published its last edition fourteen months ago. I was one of three people left on staff. Since then I have watched, from the outside, what happens when nobody's job is to sit through the meeting and write down what was said.

## The first thing that disappeared

Routine coverage went first: zoning hearings, budget votes, the sheriff's report. These stories never went viral. But they meant that when a decision was controversial, people could read what had actually happened.

## What replaced it

Community social media groups filled some of the gap, often with real energy and care. They also filled it with screenshots without context and arguments over facts nobody could check. Turnout in our last school board race fell, and two seats went uncontested.

## What might help

There is no single fix, and I'm wary of anyone who claims one. A few ideas are showing promise elsewhere:

- **Nonprofit newsrooms** funded by readers and local foundations.
- **Public notice reform** so legal notices still support local outlets.
- **Library and university partnerships** that train residents to document public meetings.

You don't have to love the press to see the value of someone writing down what your government did last Tuesday. Support whatever local reporting your community still has, and if it's gone, ask what could replace it.` }
      ];
      const comments = [
        { id:'c-1', post_id:'p-onecycle', parent_id:null, author_id:'u-whitfield', created_at: at(4*H),
          body:'Speaking as someone who has won a spring election with about 900 votes: you are right, and it is a little embarrassing. Our turnout last cycle was 14 percent.' },
        { id:'c-2', post_id:'p-onecycle', parent_id:'c-1', author_id:'u-okafor', created_at: at(3*H),
          body:'Thank you for saying it, Tom. Did your council ever discuss moving the date?' },
        { id:'c-3', post_id:'p-onecycle', parent_id:null, author_id:'u-natarajan', created_at: at(2*H),
          body:'The drop-off concern is worth taking seriously, though. Some states put nonpartisan local races on a separate page of the ballot, which seems to help.' },
        { id:'c-4', post_id:'p-phones', parent_id:null, author_id:'u-kowalski', created_at: at(20*H),
          body:'"Phones away, not phones gone" is a good phrase. How did parents react to the pouches?' },
        { id:'c-5', post_id:'p-phones', parent_id:'c-4', author_id:'u-reyes', created_at: at(18*H),
          body:'Mostly fine once we published the front office number for emergencies. A few were skeptical at first.' },
        { id:'c-6', post_id:'p-zoning', parent_id:null, author_id:'u-okafor', created_at: at(1*D + 20*H),
          body:'I appreciate that this takes the neighbors’ worries seriously instead of calling everyone NIMBYs. That is how you actually change minds at a hearing.' },
        { id:'c-7', post_id:'p-newsdesert', parent_id:null, author_id:'u-whitfield', created_at: at(6*D),
          body:'We felt this when our weekly cut back to monthly. Attendance at council meetings dropped too. Nobody knew what was on the agenda.' }
      ];
      const likes = [];
      const L = { 'p-onecycle':['u-whitfield','u-natarajan','u-reyes','u-kowalski'], 'p-phones':['u-okafor','u-kowalski','u-whitfield'], 'p-zoning':['u-okafor','u-reyes'], 'p-townhall':['u-okafor','u-kowalski','u-natarajan','u-reyes','u-editor'], 'p-newsdesert':['u-whitfield','u-reyes','u-okafor'] };
      Object.keys(L).forEach(pid => L[pid].forEach(u => likes.push({ post_id: pid, user_id: u, created_at: at(H) })));
      posts.forEach(p => { p.updated_at = p.published_at; });
      const d = { version: 1, seeded_at: nowISO(), users, posts, comments, likes, reports: [] };
      write(d);
      return d;
    }

    let seeding = null;
    async function db(){ const d = read(); if (d) return d; seeding = seeding || seed().finally(() => { seeding = null; }); return seeding; }
    async function me(d){ return sessionUser(d || await db()); }
    async function needUser(d){ const u = sessionUser(d); if (!u) fail('Please sign in first.'); return u; }
    async function needActive(d){ const u = await needUser(d); if (u.verified === false) fail('Please confirm your email address first, then try again.'); if (u.is_banned) fail('Your account has been suspended, so you cannot post, comment or like.'); return u; }
    async function needAdmin(d){ const u = await needUser(d); if (!u.is_admin) fail('Only admins can do that.'); return u; }
    const counts = (d, p) => Object.assign({}, p, {
      author: profileOf(d, p.author_id),
      like_count: d.likes.filter(l => l.post_id === p.id).length,
      comment_count: d.comments.filter(c => c.post_id === p.id).length
    });

    return {
      mode: 'demo',
      async start(){ await db(); window.addEventListener('storage', e => { if (e.key === SESSION || e.key === KEY) emit('STORAGE'); }); },
      async getUser(){ const u = await me(); return u ? pubUser(u) : null; },
      onAuthChange(cb){ listeners.add(cb); return () => listeners.delete(cb); },
      async signUp(o){
        o = o || {};
        const email = checkEmail(o.email), username = checkUsername(o.username), display_name = checkDisplayName(o.display_name);
        const password = checkPassword(o.password, { email, username });
        const d = await db();
        // same answer whether or not the email is already registered (like the real service), so sign-up cannot reveal who has an account
        if (d.users.some(u => u.email === email)) return { user: null, needsConfirmation: true, demo: true };
        if (d.users.some(u => u.username === username)) fail('That username is taken.');
        if (d.users.some(u => u.display_name.toLowerCase() === display_name.toLowerCase())) fail('That display name is taken. Please choose another.');
        const salt = uid();
        const u = { id: 'u-' + uid(), email, username, display_name, bio:'', is_admin:false, is_banned:false, verified:false, salt, pass_hash: await hash(password, salt), created_at: nowISO() };
        d.users.push(u); write(d);
        return { user: null, needsConfirmation: true, demo: true };
      },
      /* demo only: stands in for clicking the link in the confirmation email */
      async demoVerify(email){
        email = checkEmail(email);
        const d = await db(); const u = d.users.find(x => x.email === email);
        if (!u) fail('No demo account uses that email in this browser.');
        u.verified = true; write(d); return true;
      },
      async resendConfirmation(email){ checkEmail(email); return { sent: true, demo: true }; },
      async signInWithGoogle(){ fail('Google sign-in is not available in demo mode.'); },
      async signIn(o){
        o = o || {};
        const login = str(o.email).trim().toLowerCase();
        const d = await db();
        const u = d.users.find(x => x.email === login || x.username === login);
        if (!u || !u.pass_hash || u.pass_hash !== await hash(str(o.password), u.salt)) fail('That email and password do not match.');
        if (u.verified === false){ const e = new Error('Please confirm your email address first. Check your inbox for the link.'); e.code = 'unverified'; throw e; }
        set(SESSION, u.id); emit('SIGNED_IN');
        return { user: pubUser(u) };
      },
      async signOut(){ del(SESSION); emit('SIGNED_OUT'); },
      async resetPassword(email){
        // Demo: no email can be sent. Accounts live in this browser only, so we start a "recovery" session
        // for that account and the page asks for a new password (mirrors the real email-link flow).
        email = checkEmail(email);
        const d = await db();
        const u = d.users.find(x => x.email === email);
        if (!u || u.verified === false) return { sent: true };   // same answer as for a real account: no hint whether the email exists
        set(SESSION, u.id); emit('PASSWORD_RECOVERY');
        return { demo: true };
      },
      async updatePassword(pw){
        pw = checkPassword(pw);
        const d = await db(); const u = await needUser(d);
        u.salt = uid(); u.pass_hash = await hash(pw, u.salt); write(d);
        return true;
      },

      async listPosts(o){
        o = o || {};
        const d = await db();
        let rows = d.posts.slice();
        if (o.author){ const a = d.users.find(u => u.username === o.author || u.id === o.author); rows = a ? rows.filter(p => p.author_id === a.id) : []; }
        if (o.tag) rows = rows.filter(p => (p.tags || []).includes(String(o.tag).toLowerCase()));
        rows = rows.map(p => counts(d, p));
        rows.sort(o.sort === 'top'
          ? (a, b) => (b.like_count - a.like_count) || (b.published_at < a.published_at ? -1 : 1)
          : (a, b) => (b.published_at < a.published_at ? -1 : 1));
        const off = Math.max(0, o.offset | 0), lim = Math.min(100, Math.max(1, o.limit || 20));
        return rows.slice(off, off + lim).map(p => shapePost(p, false));
      },
      async getPost(id){
        const d = await db();
        const p = d.posts.find(x => x.id === id);
        if (!p) return null;
        const u = sessionUser(d);
        const o = shapePost(counts(d, p), true);
        o.liked_by_me = !!(u && d.likes.some(l => l.post_id === id && l.user_id === u.id));
        return o;
      },
      async createPost(p){
        const d = await db(); const u = await needActive(d);
        const v = checkPost(p);
        const hourAgo = new Date(Date.now() - 3600e3).toISOString();
        if (d.posts.filter(x => x.author_id === u.id && x.published_at > hourAgo).length >= 5) fail('Rate limit: you can publish up to 5 pieces per hour. Please try again later.');
        const post = Object.assign({ id: 'p-' + uid(), author_id: u.id, published_at: nowISO(), updated_at: nowISO() }, v);
        d.posts.push(post); write(d);
        return { id: post.id };
      },
      async updatePost(id, p){
        const d = await db(); const u = await needActive(d);
        const post = d.posts.find(x => x.id === id);
        if (!post) fail('That piece no longer exists.');
        if (post.author_id !== u.id) fail('Only the author can edit this piece.');
        Object.assign(post, checkPost(p), { updated_at: nowISO() }); write(d);
        return { id };
      },
      async deletePost(id){
        const d = await db(); const u = await needUser(d);
        if (u.verified === false) fail('Please confirm your email address first.');
        const post = d.posts.find(x => x.id === id);
        if (!post) fail('That piece no longer exists.');
        if (post.author_id !== u.id && !u.is_admin) fail('You can only delete your own pieces.');
        d.posts = d.posts.filter(x => x.id !== id);
        d.comments = d.comments.filter(c => c.post_id !== id);
        d.likes = d.likes.filter(l => l.post_id !== id);
        write(d); return true;
      },

      async listComments(postId){
        const d = await db();
        const rows = d.comments.filter(c => c.post_id === postId)
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
          .map(c => Object.assign({}, c, { author: profileOf(d, c.author_id) || { id: c.author_id, username: null, display_name: 'Former member' } }));
        return thread(rows);
      },
      async addComment(o){
        o = o || {};
        const d = await db(); const u = await needActive(d);
        const body = checkComment(o.body);
        if (!d.posts.some(p => p.id === o.post_id)) fail('That piece no longer exists.');
        let parent_id = o.parent_id || null;
        if (parent_id){
          const par = d.comments.find(c => c.id === parent_id && c.post_id === o.post_id);
          if (!par) fail('The comment you are replying to was removed.');
          if (par.parent_id) parent_id = par.parent_id;            // threads are one level deep
        }
        const minAgo = new Date(Date.now() - 60e3).toISOString();
        if (d.comments.filter(c => c.author_id === u.id && c.created_at > minAgo).length >= 5) fail('Rate limit: please wait a minute before commenting again.');
        const c = { id: 'c-' + uid(), post_id: o.post_id, parent_id, author_id: u.id, body, created_at: nowISO() };
        d.comments.push(c); write(d);
        return Object.assign({}, c, { author: profileOf(d, u.id), replies: [] });
      },
      async deleteComment(id){
        const d = await db(); const u = await needUser(d);
        if (u.verified === false) fail('Please confirm your email address first.');
        const c = d.comments.find(x => x.id === id);
        if (!c) fail('That comment no longer exists.');
        if (c.author_id !== u.id && !u.is_admin) fail('You can only delete your own comments.');
        d.comments = d.comments.filter(x => x.id !== id && x.parent_id !== id);
        write(d); return true;
      },
      async toggleLike(postId){
        const d = await db(); const u = await needActive(d);
        if (!d.posts.some(p => p.id === postId)) fail('That piece no longer exists.');
        const i = d.likes.findIndex(l => l.post_id === postId && l.user_id === u.id);
        if (i >= 0) d.likes.splice(i, 1); else d.likes.push({ post_id: postId, user_id: u.id, created_at: nowISO() });
        write(d);
        return { liked: i < 0, like_count: d.likes.filter(l => l.post_id === postId).length };
      },
      async report(r){
        const d = await db(); const u = await needActive(d);
        const v = checkReport(r);
        const hourAgo = new Date(Date.now() - 3600e3).toISOString();
        if (d.reports.filter(x => x.reporter_id === u.id && x.created_at > hourAgo).length >= 20) fail('Rate limit: too many reports this hour.');
        d.reports.push(Object.assign({ id: 'r-' + uid(), reporter_id: u.id, status: 'open', created_at: nowISO() }, v));
        write(d); return true;
      },
      async getProfile(username){
        const d = await db();
        const u = d.users.find(x => x.username === str(username).toLowerCase() || x.id === username);
        if (!u) return null;
        return { id: u.id, username: u.username, display_name: u.display_name, bio: u.bio || '', is_admin: !!u.is_admin, is_banned: !!u.is_banned, created_at: u.created_at,
          post_count: d.posts.filter(p => p.author_id === u.id).length };
      },
      async updateProfile(o){
        o = o || {};
        const d = await db(); const u = await needActive(d);
        if ('display_name' in o){
          const dn = checkDisplayName(o.display_name);
          if (d.users.some(x => x.id !== u.id && x.display_name.toLowerCase() === dn.toLowerCase())) fail('That display name is taken. Please choose another.');
          u.display_name = dn;
        }
        if ('bio' in o) u.bio = checkBio(o.bio);
        write(d); emit('USER_UPDATED');
        return pubUser(u);
      },

      async listReports(o){
        o = o || {};
        const d = await db(); await needAdmin(d);
        const status = o.status || 'open';
        return d.reports.filter(r => status === 'all' || r.status === status)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map(r => {
            let target = null;
            if (r.target_type === 'post'){ const p = d.posts.find(x => x.id === r.target_id); if (p) target = { id: p.id, post_id: p.id, title: p.title, text: excerpt(p.body, 240), author: profileOf(d, p.author_id) }; }
            else { const c = d.comments.find(x => x.id === r.target_id); if (c){ const p = d.posts.find(x => x.id === c.post_id); target = { id: c.id, post_id: c.post_id, title: p ? p.title : '', text: c.body.slice(0, 400), author: profileOf(d, c.author_id) }; } }
            if (target && target.author){ const au = d.users.find(x => x.id === target.author.id); target.author.is_banned = !!(au && au.is_banned); }
            return Object.assign({}, r, { reporter: profileOf(d, r.reporter_id), target });
          });
      },
      async banUser(userId, banned){
        const d = await db(); const a = await needAdmin(d);
        if (userId === a.id) fail('You cannot ban yourself.');
        const u = d.users.find(x => x.id === userId);
        if (!u) fail('That user no longer exists.');
        u.is_banned = banned !== false; write(d);
        return true;
      },
      async resolveReport(id){
        const d = await db(); const a = await needAdmin(d);
        const r = d.reports.find(x => x.id === id);
        if (!r) fail('That report no longer exists.');
        r.status = 'resolved'; r.resolved_at = nowISO(); r.resolved_by = a.id; write(d);
        return true;
      },
      /* demo only: wipe everything and re-seed */
      async resetDemo(){ del(KEY); del(SESSION); await seed(); emit('SIGNED_OUT'); }
    };
  }

  /* =====================================================================
     SUPABASE BACKEND
     ===================================================================== */
  function supabaseBackend(cfg){
    if (!window.supabase || !window.supabase.createClient) fail('Supabase library failed to load.');
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const PROFILE = 'id,username,display_name,bio,is_banned,created_at';
    const AUTHOR = 'author:profiles(id,username,display_name)';
    const POST_COLS = 'id,author_id,title,subtitle,body,tags,published_at,updated_at,like_count,comment_count,' + AUTHOR;
    let cache = null;   // { uid, user }
    const GOOGLE = cfg.google === true;

    function check(res){
      if (res && res.error){
        let m = res.error.message || 'Something went wrong.';
        if (/row-level security|permission denied|violates.*policy/i.test(m)) m = 'You cannot do that. Make sure you are signed in with a confirmed email address and only changing your own content. If your account was suspended, contact the site owner.';
        else if (/duplicate key.*display_name/i.test(m)) m = 'That display name is taken. Please choose another.';
        else if (/duplicate key.*username/i.test(m)) m = 'That username is taken.';
        else if (/^Rate limit:/.test(m)) { /* our own database message: show as is */ }
        else if (/rate limit|too many requests|For security purposes/i.test(m)) m = 'Too many attempts. Please wait a few minutes and try again.';
        else if (/Invalid login credentials/i.test(m)) m = 'That email and password do not match.';
        else if (/Email not confirmed/i.test(m)) m = 'Please confirm your email first. Check your inbox for the link.';
        fail(m);
      }
      return res ? res.data : null;
    }
    async function session(){ const r = await sb.auth.getSession(); return r.data && r.data.session; }
    async function getUser(){
      const s = await session();
      if (!s) { cache = null; return null; }
      if (cache && cache.uid === s.user.id) return cache.user;
      const p = check(await sb.from('profiles').select(PROFILE).eq('id', s.user.id).maybeSingle());
      let role = null;
      try { const r = await sb.rpc('my_role'); role = r && !r.error ? r.data : null; } catch(e){}
      const user = Object.assign({ id: s.user.id, username: null, display_name: s.user.email, bio: '', is_banned: false }, p || {},
        { email: s.user.email, role, is_admin: !!role, verified: !!s.user.email_confirmed_at });
      cache = { uid: s.user.id, user };
      return user;
    }
    async function needUser(){ const u = await getUser(); if (!u) fail('Please sign in first.'); return u; }
    async function needActive(){ const u = await needUser(); if (!u.verified) fail('Please confirm your email address first. Check your inbox for the link.'); if (u.is_banned) fail('Your account has been suspended, so you cannot post, comment or like.'); return u; }
    async function authorId(a){
      if (/^[0-9a-f-]{36}$/i.test(a)) return a;
      const p = check(await sb.from('profiles').select('id').eq('username', String(a).toLowerCase()).maybeSingle());
      return p ? p.id : null;
    }

    return {
      mode: 'supabase',
      client: sb,
      async start(){},
      getUser,
      onAuthChange(cb){
        const { data } = sb.auth.onAuthStateChange((event) => {
          cache = null;
          // defer: calling supabase inside this callback can deadlock in supabase-js v2
          setTimeout(() => getUser().then(u => cb(u, event)).catch(() => cb(null, event)), 0);
        });
        return () => data.subscription.unsubscribe();
      },
      async signUp(o){
        o = o || {};
        const email = checkEmail(o.email), username = checkUsername(o.username), display_name = checkDisplayName(o.display_name);
        const password = checkPassword(o.password, { email, username });
        const taken = check(await sb.from('profiles').select('id').eq('username', username).maybeSingle());
        if (taken) fail('That username is taken.');
        const dn = check(await sb.from('profiles').select('id').ilike('display_name', display_name.replace(/[%_\\]/g, '\\$&')).limit(1));
        if (dn && dn.length) fail('That display name is taken. Please choose another.');
        const data = check(await sb.auth.signUp({ email, password, options: { data: { username, display_name }, emailRedirectTo: DIR + 'account.html' } }));
        cache = null;
        // Even if the project were set to skip email confirmation, the database still refuses writes until the email is confirmed.
        if (data.session){ await sb.auth.signOut(); cache = null; }
        return { user: null, needsConfirmation: true };
      },
      async signIn(o){
        o = o || {};
        const res = await sb.auth.signInWithPassword({ email: checkEmail(o.email), password: str(o.password) });
        if (res.error && /Email not confirmed/i.test(res.error.message || '')){ const e = new Error('Please confirm your email address first. Check your inbox for the link.'); e.code = 'unverified'; throw e; }
        check(res);
        cache = null;
        return { user: await getUser() };
      },
      async signOut(){ check(await sb.auth.signOut()); cache = null; },
      async resetPassword(email){
        email = checkEmail(email);
        const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: DIR + 'account.html' });
        if (r.error && /rate limit|too many|security purposes/i.test(r.error.message || '')) check(r);   // only rate limits are shown; anything else looks like success
        return { sent: true };
      },
      async resendConfirmation(email){
        email = checkEmail(email);
        const r = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: DIR + 'account.html' } });
        if (r.error && /rate limit|too many|security purposes/i.test(r.error.message || '')) check(r);
        return { sent: true };
      },
      async demoVerify(){ fail('Only available in demo mode.'); },
      async signInWithGoogle(){
        if (!GOOGLE) fail('Google sign-in is not turned on for this site.');
        check(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: DIR + 'account.html' } }));
        return true;
      },
      async updatePassword(pw){ const u = await getUser(); check(await sb.auth.updateUser({ password: checkPassword(pw, { email: u && u.email, username: u && u.username }) })); return true; },

      async listPosts(o){
        o = o || {};
        const off = Math.max(0, o.offset | 0), lim = Math.min(100, Math.max(1, o.limit || 20));
        let q = sb.from('posts').select(POST_COLS);
        if (o.author){ const id = await authorId(o.author); if (!id) return []; q = q.eq('author_id', id); }
        if (o.tag) q = q.contains('tags', [String(o.tag).toLowerCase()]);
        q = o.sort === 'top' ? q.order('like_count', { ascending: false }).order('published_at', { ascending: false }) : q.order('published_at', { ascending: false });
        const rows = check(await q.range(off, off + lim - 1)) || [];
        return rows.map(p => shapePost(p, false));
      },
      async getPost(id){
        const p = check(await sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle());
        if (!p) return null;
        const o = shapePost(p, true);
        const s = await session();
        o.liked_by_me = false;
        if (s){ const l = check(await sb.from('likes').select('post_id').eq('post_id', id).eq('user_id', s.user.id).maybeSingle()); o.liked_by_me = !!l; }
        return o;
      },
      async createPost(p){
        await needActive();
        const row = check(await sb.from('posts').insert(checkPost(p)).select('id').single());
        return { id: row.id };
      },
      async updatePost(id, p){
        await needActive();
        const rows = check(await sb.from('posts').update(checkPost(p)).eq('id', id).select('id'));
        if (!rows || !rows.length) fail('You can only edit your own pieces.');
        return { id };
      },
      async deletePost(id){
        await needUser();
        const rows = check(await sb.from('posts').delete().eq('id', id).select('id'));
        if (!rows || !rows.length) fail('You can only delete your own pieces.');
        return true;
      },

      async listComments(postId){
        const rows = check(await sb.from('comments').select('id,post_id,parent_id,author_id,body,created_at,' + AUTHOR).eq('post_id', postId).order('created_at', { ascending: true })) || [];
        rows.forEach(c => { if (!c.author) c.author = { id: c.author_id, username: null, display_name: 'Former member' }; });
        return thread(rows);
      },
      async addComment(o){
        o = o || {};
        await needActive();
        const row = check(await sb.from('comments').insert({ post_id: o.post_id, parent_id: o.parent_id || null, body: checkComment(o.body) }).select('id,post_id,parent_id,author_id,body,created_at,' + AUTHOR).single());
        row.replies = [];
        return row;
      },
      async deleteComment(id){
        await needUser();
        const rows = check(await sb.from('comments').delete().eq('id', id).select('id'));
        if (!rows || !rows.length) fail('You can only delete your own comments.');
        return true;
      },
      async toggleLike(postId){
        const u = await needActive();
        const has = check(await sb.from('likes').select('post_id').eq('post_id', postId).eq('user_id', u.id).maybeSingle());
        if (has) check(await sb.from('likes').delete().eq('post_id', postId).eq('user_id', u.id));
        else check(await sb.from('likes').insert({ post_id: postId }));
        const p = check(await sb.from('posts').select('like_count').eq('id', postId).maybeSingle());
        return { liked: !has, like_count: p ? p.like_count : 0 };
      },
      async report(r){ await needActive(); check(await sb.from('reports').insert(checkReport(r))); return true; },
      async getProfile(username){
        const p = check(await sb.from('profiles').select(PROFILE).eq('username', str(username).toLowerCase()).maybeSingle());
        if (!p) return null;
        const c = await sb.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', p.id);
        try { const r = await sb.rpc('is_staff', { uid: p.id }); p.is_admin = !!(r && !r.error && r.data); } catch(e){ p.is_admin = false; }
        p.bio = p.bio || '';
        p.post_count = c.count || 0;
        return p;
      },
      async updateProfile(o){
        o = o || {};
        const u = await needActive();
        const patch = {};
        if ('display_name' in o) patch.display_name = checkDisplayName(o.display_name);
        if ('bio' in o) patch.bio = checkBio(o.bio);
        check(await sb.from('profiles').update(patch).eq('id', u.id));
        cache = null;
        return getUser();
      },

      async listReports(o){
        o = o || {};
        const u = await needUser(); if (!u.is_admin) fail('Only admins can do that.');
        let q = sb.from('reports').select('id,reporter_id,target_type,target_id,reason,status,created_at,resolved_at,reporter:profiles!reports_reporter_id_fkey(id,username,display_name)').order('created_at', { ascending: false }).limit(200);
        if ((o.status || 'open') !== 'all') q = q.eq('status', o.status || 'open');
        const reps = check(await q) || [];
        const pIds = reps.filter(r => r.target_type === 'post').map(r => r.target_id);
        const cIds = reps.filter(r => r.target_type === 'comment').map(r => r.target_id);
        const AUTH_B = 'author:profiles(id,username,display_name,is_banned)';
        const posts = pIds.length ? check(await sb.from('posts').select('id,title,body,' + AUTH_B).in('id', pIds)) : [];
        const coms = cIds.length ? check(await sb.from('comments').select('id,post_id,body,' + AUTH_B + ',post:posts(title)').in('id', cIds)) : [];
        return reps.map(r => {
          let target = null;
          if (r.target_type === 'post'){ const p = posts.find(x => x.id === r.target_id); if (p) target = { id: p.id, post_id: p.id, title: p.title, text: excerpt(p.body, 240), author: p.author }; }
          else { const c = coms.find(x => x.id === r.target_id); if (c) target = { id: c.id, post_id: c.post_id, title: c.post ? c.post.title : '', text: c.body.slice(0, 400), author: c.author }; }
          return Object.assign({}, r, { target });
        });
      },
      async banUser(userId, banned){ check(await sb.rpc('admin_set_ban', { target: userId, banned: banned !== false })); return true; },
      async resolveReport(id){
        const u = await needUser();
        const rows = check(await sb.from('reports').update({ status: 'resolved' }).eq('id', id).select('id'));
        if (!rows || !rows.length) fail('Only admins can do that.');
        return true;
      }
    };
  }

  /* =====================================================================
     PUBLIC API
     ===================================================================== */
  /* Which mode is Opinions in? ONE rule, used by every page (see opinions/config.js "enabled" and supabase/SETUP.md):
       'supabase'  url and anonKey are set (and enabled is not false)
       'demo'      no Supabase keys, AND the page is on localhost / 127.0.0.1 / [::1] (or enabled: true forces it)
       'off'       everything else: Opinions pages show "coming soon", no demo content, nothing written to localStorage */
  const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;
  function resolveMode(c){
    c = c || {};
    const en = c.enabled === undefined ? 'auto' : c.enabled;
    if (en === false || en === 'false') return 'off';
    if (c.url && c.anonKey) return 'supabase';
    if (en === true || en === 'true') return 'demo';
    return LOCAL_HOST.test(location.hostname) ? 'demo' : 'off';
  }
  /* Backend used when Opinions is switched off: reads return nothing, writes are refused, nothing is stored. */
  function offBackend(){
    const closed = () => fail('Opinions are coming soon.');
    const own = { mode: 'off', async start(){}, onAuthChange(){ return () => {}; }, async getUser(){ return null; },
      async listPosts(){ return []; }, async listComments(){ return []; }, async listReports(){ return []; } };
    return new Proxy(own, { get(t, k){ return k in t ? t[k] : (typeof k === 'string' && k !== 'then' ? closed : undefined); } });
  }
  const cfgNow = window.SIN_SUPABASE;
  let backend = null, ready = null;
  function init(){
    if (!ready) ready = (async () => {
      if (!window.SIN_SUPABASE){ try { await loadScript(DIR + 'config.js'); } catch(e){ /* no config: demo */ } }
      const c = window.SIN_SUPABASE || {};
      const m = resolveMode(c);
      if (m === 'off') backend = offBackend();
      else if (m === 'supabase'){
        if (!window.supabase) await loadScript(SUPABASE_JS, 'sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug');
        backend = supabaseBackend(c);
      } else backend = demoBackend();
      await backend.start();
      api.mode = backend.mode;
      return backend;
    })();
    return ready;
  }
  const call = name => async function(){ const b = await init(); return b[name].apply(b, arguments); };
  const api = {
    mode: window.SIN_SUPABASE ? resolveMode(window.SIN_SUPABASE) : 'pending',   // 'pending' only until config.js has loaded (home page)
    limits: LIMITS,
    resolveMode,
    ready: () => init().then(() => api.mode),
    isRecovery: () => RECOVERY,
    excerpt, readingMinutes, plainText,
    onAuthChange(cb){ let off = null, dead = false; init().then(b => { if (!dead) off = b.onAuthChange(cb); }); return () => { dead = true; if (off) off(); }; },
    resetDemo: async () => { const b = await init(); if (b.resetDemo) return b.resetDemo(); fail('Only available in demo mode.'); }
  };
  ['getUser','signOut','updatePassword','demoVerify','signInWithGoogle',
   'listPosts','getPost','createPost','updatePost','deletePost',
   'listComments','addComment','deleteComment','toggleLike','report',
   'getProfile','updateProfile','listReports','banUser','resolveReport'].forEach(n => { api[n] = call(n); });
  api.likePost = api.toggleLike;
  // attempts at the front door are throttled in this browser (see above)
  const signInRaw = call('signIn'), signUpRaw = call('signUp'), resetRaw = call('resetPassword'), resendRaw = call('resendConfirmation');
  api.signIn = o => throttled('signin', true, () => signInRaw(o));
  api.signUp = o => throttled('signup', false, () => signUpRaw(o));
  api.resetPassword = e => throttled('reset', false, () => resetRaw(e));
  api.resendConfirmation = e => throttled('resend', false, () => resendRaw(e));
  api.passwordIssue = passwordIssue;
  api.passwordStrength = passwordStrength;
  api.googleEnabled = () => !!(window.SIN_SUPABASE && window.SIN_SUPABASE.google === true && window.SIN_SUPABASE.url);
  window.SINDb = api;

  // keep the shared header's account link in sync on every page that loads this file
  function paint(u){
    if (!window.SIN || !SIN.setAccount) return;
    const name = u ? str(u.display_name || u.username || 'Account') : 'Sign in';
    SIN.setAccount({ label: name.length > 22 ? name.slice(0, 21) + '…' : name, href: SIN.url('opinions/account.html') });
  }
  init().then(() => { api.getUser().then(paint).catch(() => {}); api.onAuthChange(paint); }).catch(e => console.warn('[SINDb]', e.message));
})();
