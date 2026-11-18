/* Daily Political Trivia — shared header, nav and footer.
   Every page: <body data-section="games|opinions|home">, a <main id="main"> and
   <script src="(relative)/assets/site.js"></script> placed before </body>.
   Exposes window.SIN = { base, url(path), toast(msg), esc(str), timeAgo(date) }. */
(function(){
  // SECURITY: defence in depth against clickjacking (GitHub Pages cannot send X-Frame-Options).
  // If another site frames this page, hide it and try to take over the top window.
  if (window.top !== window.self){
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(window.self.location.href); } catch(e){}
  }
  const script = document.currentScript;
  const base = new URL('../', script.src);            // site root, works locally and on GitHub Pages
  const url = p => new URL(p, base).href;
  const section = document.body.dataset.section || '';
  // Opinions build switch. 'auto' = decided at run time by opinions/config.js (what you see on this PC).
  // tools/make-deploy-folder.js rewrites this ONE line to 'off' when Opinions is switched off, so the published site has no
  // Opinions links, no sign-in link and never asks for opinions/db.js (that folder is not published then). Do not edit by hand.
  const OPINIONS_BUILD = 'auto';
  const OP = OPINIONS_BUILD !== 'off';

  // SECURITY: only plain http(s) addresses may become a link. Anything else (javascript:, data:, vbscript:, //host,
  // addresses with quotes, spaces or angle brackets) becomes '#'.
  const safeHttp = u => (typeof u === 'string' && /^https?:\/\/[^\s"'<>`\\]+$/i.test(u)) ? u : '#';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function timeAgo(d){
    const t = (Date.now() - new Date(d).getTime())/1000;
    if (!isFinite(t)) return '';
    if (t < 60) return 'just now';
    if (t < 3600) return Math.floor(t/60) + 'm ago';
    if (t < 86400) return Math.floor(t/3600) + 'h ago';
    if (t < 86400*7) return Math.floor(t/86400) + 'd ago';
    return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  }
  let tt;
  function toast(msg){
    let el = document.getElementById('toast');
    if (!el){ el = document.createElement('div'); el.id='toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(()=>el.classList.remove('show'), 2600);
  }

  // theme: follows system unless the visitor picks one
  const THEME_KEY = 'sin-theme';
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch(e){}
  function toggleTheme(){
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch(e){}
  }

  // fonts + favicon (once per page)
  const head = document.head;
  if (!head.querySelector('link[data-sin-fonts]')){
    head.insertAdjacentHTML('beforeend',
      // self-hosted (assets/fonts.css): no request to any other site
      '<link rel="preload" href="'+url('assets/fonts/newsreader-latin.woff2')+'" as="font" type="font/woff2" crossorigin>'+
      '<link rel="preload" href="'+url('assets/fonts/public-sans-latin.woff2')+'" as="font" type="font/woff2" crossorigin>'+
      '<link data-sin-fonts rel="stylesheet" href="'+url('assets/fonts.css')+'">');
  }
  if (!head.querySelector('link[rel=icon]')) head.insertAdjacentHTML('beforeend','<link rel="icon" type="image/svg+xml" href="'+url('assets/favicon.svg')+'">');

  // The brand name lives in ONE place: tools/site-config.json ("siteName"); run  node tools/apply-brand.js  after changing it (it rewrites the next line).
  const BRAND = 'Daily Political Trivia'; // site-brand
  // The four daily games (label, address). Kept in step with games/games.json by tools/apply-game-names.js.
  const GAMES = [['climb','Capitol Climb','games/capitol-climb/','Climb'],['caucus','Caucus Sort','games/caucus-sort/','Caucus'],['trivia','Dark Horse','games/dark-horse/'],['grid','Grid','games/congressional-grid/']]; // games-line
  const NAV = [['home','Home','index.html']].concat(GAMES, [['map','Map','map/'],['about','About','about.html']]).concat(OP ? [['opinions','Opinions','opinions/']] : []);
  // which nav item is current: the page's own address decides (the games all share data-section="games")
  const curKey = (function(){
    const p = String((typeof location !== 'undefined' && location.pathname) || '').replace(/index\.html$/, '');
    const g = GAMES.find(x => p.indexOf('/' + x[2]) >= 0 && /\/games\/[^/]+\/$/.test(p));
    if (g) return g[0];
    if (/\/about\.html$/.test(p)) return 'about';
    if (/\/map\/$/.test(p)) return 'map';
    if (/\/opinions\//.test(p)) return 'opinions';
    if (/\/games\/$/.test(p)) return 'home';
    return section === 'home' ? 'home' : '';
  })();
  // Phone layer hooks (see design-notes/PHONE.md): game pages get a flag so the phone CSS can drop the site bar there,
  // and the visible viewport (soft keyboard, dynamic toolbar) is published as CSS variables --vvh and --kb.
  try { if (/\/games\/[^/]+\/(index\.html)?$/.test(location.pathname)) document.body.setAttribute('data-game-page', ''); } catch(e){}
  try {
    const vv = window.visualViewport, root = document.documentElement;
    if (vv) {
      let raf = 0;
      const upd = () => { raf = 0; root.style.setProperty('--vvh', Math.round(vv.height) + 'px'); root.style.setProperty('--kb', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px'); };
      const sched = () => { if (!raf) raf = requestAnimationFrame(upd); };
      vv.addEventListener('resize', sched); vv.addEventListener('scroll', sched); upd();
    }
  } catch(e){}
  const ic = d => '<svg class="ni" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + d + '</svg>';
  const NAV_ICON = {
    home: ic('<path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>'),
    grid: ic('<rect x="4" y="4" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="4" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="4" width="4.5" height="4.5" rx="1"/><rect x="4" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="4" y="15.5" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="15.5" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="15.5" width="4.5" height="4.5" rx="1"/>'),
    trivia: ic('<circle cx="12" cy="13" r="8"/><path d="M10 4h4M12 4v1"/><path d="M9.6 11.2a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5"/><circle cx="12" cy="17.2" r=".5" fill="currentColor"/>'),
    caucus: ic('<circle cx="7.5" cy="7.5" r="3.5"/><circle cx="16.5" cy="7.5" r="3.5"/><circle cx="7.5" cy="16.5" r="3.5"/><circle cx="16.5" cy="16.5" r="3.5"/>'),
    climb: ic('<path d="M9.6 20.5 10.5 8.5 12 3.8l1.5 4.7.9 12z"/><path d="M7.5 20.5h9"/><circle cx="18.6" cy="8.4" r="1.1" fill="currentColor"/>'),
    map: ic('<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    about: '',
    opinions: ic('<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>')
  };
  const today = new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});

  const header = document.createElement('header');
  header.innerHTML =
    '<a class="skip" href="#main">Skip to content</a>'+
    '<div class="topstrip"><div class="wrap"><span class="num">'+esc(today)+'</span><span class="tag">Learn it. Test it. Share it.</span></div></div>'+
    '<div class="masthead"><div class="wrap bar">'+
      '<a class="brand" href="'+url('index.html')+'" aria-label="'+esc(BRAND)+' home"><span class="name">'+esc(BRAND)+'</span></a>'+
      '<nav class="mainnav" aria-label="Sections"><ul>'+
        NAV.map(([k,l,h,s])=>'<li data-nav="'+k+'"'+(k==='opinions'?' data-op':'')+'><a href="'+url(h)+'"'+(s?' aria-label="'+esc(l)+'"':'')+(k===curKey?' aria-current="page"':'')+'>'+(NAV_ICON[k]||'')+'<span class="nl">'+(s?'<span class="nlf">'+esc(l)+'</span><span class="nls" aria-hidden="true">'+esc(s)+'</span>':esc(l))+'</span></a></li>').join('')+
      '</ul></nav>'+
      '<div class="actions">'+
        '<button class="iconbtn" id="sinTheme" type="button" aria-label="Switch light or dark theme"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg></button>'+
        (OP ? '<a class="acct" id="sinAcct" data-op href="'+url('opinions/account.html')+'">Sign in</a>' : '')+
      '</div>'+
    '</div></div>';
  document.body.prepend(header);
  if (document.querySelectorAll) document.querySelectorAll('[data-brand]').forEach(e => { e.textContent = BRAND; });
  document.getElementById('sinTheme').addEventListener('click', toggleTheme);

  const footer = document.createElement('footer');
  footer.className = 'sitefoot';
  footer.innerHTML = '<div class="wrap"><div><div class="fname">'+esc(BRAND)+'</div><div class="ftag">Build your political knowledge, test it daily, and compete with friends.</div></div>'+
    '<ul>'+NAV.slice(1).map(([k,l,h])=>'<li data-nav="'+k+'"'+(k==='opinions'?' data-op':'')+'><a href="'+url(h)+'">'+l+'</a></li>').join('')+'</ul>'+
    '<ul class="legal">'+
      '<li><a href="'+url('terms.html')+'">Terms</a></li>'+
      '<li><a href="'+url('privacy.html')+'">Privacy</a></li>'+
      '<li><a href="'+url('dmca.html')+'">DMCA</a></li>'+
      '<li><a href="'+url('credits.html')+'">Credits</a></li>'+
      '<li><a href="'+url('accessibility.html')+'">Accessibility</a></li>'+
      '<li><a href="'+url('corrections.html')+'">Corrections and data</a></li>'+
      '<li data-sin-ads-only hidden><a href="#" data-sin-privacy-choices>Privacy choices</a></li>'+
      '<li data-sin-ads-only hidden><a href="#" data-sin-limit-data>Do not sell or share my personal information</a></li>'+
      '<li data-sin-ads-only hidden><a href="'+url('privacy.html#ads')+'">Ads info</a></li>'+
    '</ul>'+
    '<p class="fine">Portraits of public officials come from U.S. government sources and Wikimedia Commons; licences and credits are on the <a href="'+url('credits.html')+'">Credits</a> page. '+(OP ? '<span data-op>Opinion pieces are the views of their authors. </span>' : '')+'Not affiliated with any government body, campaign or party.</p></div>';
  document.body.appendChild(footer);

  // Ads (see assets/ads/INTEGRATION.md). Does nothing visible unless ads-config.js is enabled and configured.
  // The settings and the tiny loader are loaded synchronously while the page is still being parsed, so the loader can
  // reserve the banner/rail space before first paint (no layout shift). Dynamically inserted copies (async) cannot use
  // document.write, so they fall back to ordinary script elements.
  // SECURITY WAIVER (reviewed): the document.write below writes two <script src> tags whose addresses are built from this
  // script's own address plus fixed file names. No visitor, URL or feed data is involved, and a CSP allows them as 'self'.
  (function(){
    var cfg = url('assets/ads/ads-config.js'), ld = url('assets/ads/ads-loader.js');
    if (document.readyState === 'loading' && script && script.async === false) document.write('<script src="'+cfg+'"></script><script src="'+ld+'"></script>'); // security-waiver
    else [cfg, ld].forEach(function(src){ var s = document.createElement('script'); s.src = src; s.async = false; document.head.appendChild(s); });
  })();

  // The Opinions module can call SIN.setAccount({label, href}) once it knows who is signed in.
  function setAccount(o){ const a=document.getElementById('sinAcct'); if(!a||!o) return; a.textContent=o.label; if(o.href) a.href=o.href; }

  window.SIN = { brand: BRAND, base: base.href, url, toast, esc, safeHttp, timeAgo, setAccount };


  // Load the Opinions data layer on every page so the header shows who is signed in.
  if (OP && !window.SINDb && ![...document.scripts].some(s => /opinions\/db\.js/.test(s.src))){
    const s = document.createElement('script'); s.src = url('opinions/db.js'); s.defer = true; document.body.appendChild(s);
  }

  // Opinions on/off (see opinions/db.js resolveMode and opinions/config.js "enabled"). Everything marked data-op (the Opinions
  // nav items, the Sign in link, the home "Latest opinions" module, footer text) is hidden while the mode is being worked out and
  // stays hidden when Opinions is switched off (a public site without Supabase keys). data-op-off shows the text-only alternative.
  (function(){
    const h = document.documentElement; if (!h || !h.classList) return;
    if (!OP) { h.classList.add('op-off'); return; }                              // published build with Opinions off: nothing to wait for
    h.classList.add('op-pending');
    const done = m => { h.classList.remove('op-pending'); h.classList.toggle('op-off', m === 'off'); };
    let tries = 0;
    (function wait(){
      if (window.SINDb) { window.SINDb.ready().then(done, () => done('off')); return; }
      if (++tries > 80) return done('off');                                   // db.js never loaded: treat as off
      setTimeout(wait, 100);
    })();
  })();
})();
