/* Daily Political Trivia - ad system (vanilla JS, no dependencies). Setup guide: ../../ADS-SETUP.md
   Loaded by ads-loader.js (which builds window.SIN_ADS_CFG / SIN_ADS_PLAN / SIN_ADS_PAGE first).
   window.SIN_ADS = { init, mountSlot, insertInContent, showPreroll, showPostroll, setConsent, isBlocked,
                      isActive, setGameplay, cancel, status, report, ready }
   Stacks: 'gpt' (Google Publisher Tag, optional Prebid header bidding), 'adsense', 'managed' (partner script).
   Rules: no real configuration = nothing visible, no requests. No ad request before consent is resolved where required.
   Video ads never trap the visitor. Diagnostics: ?adsdebug=1 prints what would be requested and draws nothing. */
(function(){
  'use strict';
  if (window.SIN_ADS) return;
  var cfg = window.SIN_ADS_CFG, PLAN = window.SIN_ADS_PLAN, PAGE = window.SIN_ADS_PAGE;
  if (!cfg || !PLAN) return;                                   // the loader must run first

  var qs = new URLSearchParams(location.search);
  var devHost = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname) || /\.localhost$/.test(location.hostname);
  var sim = devHost ? qs.get('adsim') : null;                  // dev-only: ?adsim=blocked pretends an ad blocker is on
  var DRY = PLAN.dry, DEBUG = PLAN.debug || PLAN.dry;
  var blocked = sim === 'blocked', detected = false, sdkFailed = false, gameplayActive = false, uid = 0;
  var stack = PLAN.stack;

  function log(){ if (DEBUG && window.console) { var a = ['[SIN ads]'].concat([].slice.call(arguments)); console.log.apply(console, a); } }
  function store(kind, op, k, v){ try { var s = kind === 'l' ? localStorage : sessionStorage; return op === 'get' ? s.getItem(k) : s.setItem(k, v); } catch(e){ return null; } }

  /* ================================================================== consent */
  var C = { provider: cfg.consent.provider, resolved: false, allowed: false, gdprApplies: null, tcString: '', limited: false, source: 'pending', gpp: null, usp: null };
  var consentCbs = [];
  var TZ = /^(Europe\/|Asia\/(Nicosia|Famagusta)$|Atlantic\/(Reykjavik|Canary|Madeira|Azores)$|America\/(Martinique|Guadeloupe|Cayenne|Marigot|St_Barthelemy)$|Indian\/(Reunion|Mayotte)$)/;
  var REGIONS = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' ');
  function europeLike(){                                       // over-inclusive guess, used ONLY when no consent tool answers
    try { if (TZ.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '')) return true; } catch(e){}
    try {
      var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < langs.length; i++){ var m = /[-_]([A-Za-z]{2})\b/.exec(langs[i] || ''); if (m && REGIONS.indexOf(m[1].toUpperCase()) > -1) return true; }
    } catch(e){}
    return false;
  }
  function settle(allowed, source){
    if (C.resolved) return;
    C.resolved = true; C.allowed = !!allowed; C.source = source;
    log('consent resolved:', JSON.stringify({ allowed: C.allowed, source: source, gdprApplies: C.gdprApplies, limited: C.limited }));
    schedule();
  }
  function waitFor(fn, ms){
    return new Promise(function(res){
      var t0 = Date.now();
      (function poll(){ var v = fn(); if (v) return res(v); if (Date.now() - t0 >= ms) return res(null); setTimeout(poll, 100); })();
    });
  }
  function normPub(p){ p = String(p || '').replace(/^ca-/, ''); return /^pub-\d{10,20}$/.test(p) ? p : ''; }

  function cmpFlow(){
    var pub = normPub(cfg.consent.fundingChoicesPubId);
    if (pub && !DRY) loadScript('fc', 'https://fundingchoicesmessages.google.com/i/' + pub + '?ers=1').catch(function(){});
    var probeMs = pub ? cfg.consent.waitMs : Math.min(1500, cfg.consent.waitMs);   // no Funding Choices id: only a short look for a CMP added some other way
    return waitFor(function(){ return typeof window.__tcfapi === 'function' ? window.__tcfapi : null; }, probeMs).then(function(api){
      if (!api){ settle(!europeLike(), 'no-cmp-found'); return; }
      var heard = false, ranOut = setTimeout(function(){ if (!heard) settle(!europeLike(), 'cmp-silent'); }, cfg.consent.waitMs);
      api('addEventListener', 2, function(tc, ok){
        if (!ok || !tc) return;
        heard = true; C.gdprApplies = tc.gdprApplies; C.tcString = tc.tcString || '';
        if (tc.gdprApplies === false){ clearTimeout(ranOut); settle(true, 'gdpr-not-applicable'); return; }
        if (tc.eventStatus === 'tcloaded' || tc.eventStatus === 'useractioncomplete'){
          clearTimeout(ranOut);
          var p1 = !!(tc.purpose && tc.purpose.consents && tc.purpose.consents[1]);
          var okNow = cfg.consent.strictAccept ? p1 : true;      // Google and Prebid enforce purposes themselves; strictAccept is optional extra caution
          if (C.resolved && C.allowed && !okNow){ location.reload(); return; }
          settle(okNow, 'tcf:' + tc.eventStatus);
        }
      });
    });
  }
  function uspFlow(){
    if (typeof window.__uspapi !== 'function') return Promise.resolve();
    return new Promise(function(res){
      var t = setTimeout(res, 500);
      try { window.__uspapi('getUSPData', 1, function(d, ok){ clearTimeout(t); if (ok && d && typeof d.uspString === 'string'){ C.usp = d.uspString; if (d.uspString.charAt(2) === 'Y') C.limited = true; } res(); }); } catch(e){ clearTimeout(t); res(); }
    });
  }
  function gppFlow(){
    if (typeof window.__gpp !== 'function') return Promise.resolve();
    return new Promise(function(res){
      var t = setTimeout(res, 500);
      try { window.__gpp('ping', function(p){ clearTimeout(t); if (p) C.gpp = { cmpStatus: p.cmpStatus, applicableSections: p.applicableSections }; res(); }); } catch(e){ clearTimeout(t); res(); }
    });
  }
  function builtinFlow(){
    return waitFor(function(){ return window.SIN_CONSENT || null; }, 3000).then(function(sc){
      if (!sc){ settle(!europeLike(), 'no-builtin'); return; }
      var s = sc.get(); C.limited = !!s.limited;
      if (!s.required) settle(true, 'builtin-not-required');
      else if (s.status === 'granted') settle(true, 'builtin-granted');
      else if (s.status === 'denied') settle(false, 'builtin-denied');
      else log('built-in banner is waiting for the visitor');
    });
  }
  function resolveConsent(){
    if (navigator.globalPrivacyControl === true) C.limited = true;      // Global Privacy Control counts as opting out of sale/sharing
    var main;
    if (C.provider === 'none'){ settle(true, 'none'); main = Promise.resolve(); }
    else main = C.provider === 'builtin' ? builtinFlow() : cmpFlow();
    return Promise.all([main, uspFlow(), gppFlow()]);
  }
  function consentAllowed(){ return C.resolved && C.allowed; }

  /* ================================================================== blocker detection and script loading */
  function detectBlocker(){
    return new Promise(function(res){
      if (blocked) return res();
      var b = document.createElement('div');
      b.className = 'adsbox ad-banner pub_300x250 textAd text-ad ad-placement';
      b.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px';
      b.innerHTML = '&nbsp;';
      document.body.appendChild(b);
      setTimeout(function(){
        try { var cs = getComputedStyle(b); if (b.offsetHeight === 0 || cs.display === 'none' || cs.visibility === 'hidden') blocked = true; } catch(e){}
        b.remove(); res();
      }, 120);
    });
  }
  var scriptP = {}, scriptState = {};
  function loadScript(key, src, extra, timeoutMs){
    if (scriptP[key]) return scriptP[key];
    scriptState[key] = 'loading';
    log('loading script', key, src);
    scriptP[key] = new Promise(function(res, rej){
      var s = document.createElement('script');
      s.async = true; s.src = src;
      if (extra) for (var k in extra) s.setAttribute(k, extra[k]);
      var to = timeoutMs ? setTimeout(function(){ scriptState[key] = 'timeout'; rej(new Error('timeout')); }, timeoutMs) : 0;
      s.onload = function(){ clearTimeout(to); scriptState[key] = 'loaded'; res(); };
      s.onerror = function(){ clearTimeout(to); scriptState[key] = 'blocked-or-failed'; if (key !== 'prebid' && key !== 'fc') blocked = true; rej(new Error('failed')); };
      document.head.appendChild(s);
    });
    scriptP[key].catch(function(){});
    return scriptP[key];
  }

  /* ================================================================== units and slots */
  var units = [], slots = [], io = null, raf = 0, ready = false;
  function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function inViewport(e){ var r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; }
  function visibleCount(){
    var n = 0;
    for (var i = 0; i < units.length; i++){ var u = units[i]; if ((u.state === 'loading' || u.state === 'filled') && inViewport(u.el)) n++; }
    return n;
  }

  function slotCheck(u){
    var s = u.slot, alive = false;
    for (var i = 0; i < s.units.length; i++) if (s.units[i].state !== 'collapsed') alive = true;
    if (!alive){
      s.el.hidden = true; s.el.setAttribute('data-collapsed', '');
      if (s.type === 'side-rail'){ var m = s.el.closest('main'); if (m) m.classList.remove('sin-has-rail'); }
    }
  }
  function collapse(u, why){
    if (u.state === 'collapsed') return;
    clearTimeout(u.timer);
    if (u.stop) { try { u.stop(); } catch(e){} }
    log('collapse', u.name, why || '');
    u.state = 'collapsed'; u.el.setAttribute('data-state', 'collapsed');
    u.box.innerHTML = '';
    slotCheck(u);
  }
  function fill(u){ if (u.state === 'collapsed') return; clearTimeout(u.timer); u.state = 'filled'; u.el.setAttribute('data-state', 'filled'); }

  /* sizes per unit, chosen by screen width (the same table feeds the GPT size mapping) */
  function sizesFor(name, w){
    if (name === 'top-banner') return w >= 1002 ? [[970, 90], [728, 90]] : w >= 760 ? [[728, 90]] : [[320, 50], [300, 50]];
    if (name === 'rail-1') return [[300, 250]];
    if (name === 'rail-2') return [[300, 600]];
    return w >= 760 ? [[728, 90]] : [[300, 250]];
  }
  function gptPath(key){
    if (PLAN.testMode) return PLAN.demoUnit;
    var code = cfg.gpt.adUnits[key] || '';
    return code.charAt(0) === '/' ? code : '/' + cfg.gpt.networkCode + '/' + code;
  }
  function biddersFor(key){ return (cfg.prebid.bidders && cfg.prebid.bidders[key]) || []; }
  function prebidOn(){ return stack === 'gpt' && cfg.prebid.enabled === true && !PLAN.testMode && !!(cfg.prebid.localBuild || cfg.prebid.scriptUrl); }

  /* ---------- Prebid.js header bidding ---------- */
  var pbConfigured = false, pbLoadP = null, pbUnits = {};
  function prebidLoad(){
    if (pbLoadP) return pbLoadP;
    window.pbjs = window.pbjs || {}; window.pbjs.que = window.pbjs.que || [];
    var src = cfg.prebid.localBuild ? new URL(cfg.prebid.localBuild, ADS_BASE).href : cfg.prebid.scriptUrl;
    pbLoadP = loadScript('prebid', src, null, cfg.prebid.loadTimeoutMs).then(function(){ return true; }, function(){ return false; });
    return pbLoadP;
  }
  function prebidConfigure(){
    if (pbConfigured) return; pbConfigured = true;
    var p = cfg.prebid, c = { bidderTimeout: p.timeoutMs, priceGranularity: p.priceGranularity, userSync: p.userSync, enableSendAllBids: true };
    if (p.consentManagement) c.consentManagement = p.consentManagement;
    if (p.s2sConfig) c.s2sConfig = p.s2sConfig;
    if (DEBUG) c.debug = true;
    for (var k in (p.extraConfig || {})) c[k] = p.extraConfig[k];
    window.pbjs.setConfig(c);
  }
  /* runs an auction for these units; resolves when bids are back (GPT targeting set) or on timeout. Never rejects. */
  function auction(list){
    return new Promise(function(res){
      var withBids = list.filter(function(u){ return biddersFor(u.key).length; });
      if (!prebidOn() || !withBids.length) return res();
      var done = false, fail = 0;
      function fin(why){ if (done) return; done = true; clearTimeout(fail); log('auction done:', why, withBids.map(function(u){ return u.box.id; }).join(',')); res(); }
      fail = setTimeout(function(){ fin('failsafe-timeout'); }, cfg.prebid.timeoutMs + cfg.prebid.loadTimeoutMs);   // lives OUTSIDE pbjs.que on purpose
      prebidLoad().then(function(ok){
        if (!ok || done) return fin(ok ? 'late' : 'prebid-not-loaded');
        window.pbjs.que.push(function(){
          try {
            prebidConfigure();
            var codes = withBids.map(function(u){ return u.box.id; });
            withBids.forEach(function(u){
              if (pbUnits[u.box.id]) return;
              pbUnits[u.box.id] = true;
              window.pbjs.addAdUnits([{ code: u.box.id, mediaTypes: { banner: { sizes: u.sizes } }, bids: biddersFor(u.key) }]);
            });
            window.pbjs.requestBids({ adUnitCodes: codes, timeout: cfg.prebid.timeoutMs, bidsBackHandler: function(){
              try { window.pbjs.setTargetingForGPTAsync(codes); } catch(e){}
              fin('bids-back');
            } });
          } catch(e){ fin('error'); }
        });
      });
    });
  }

  /* ---------- Google Publisher Tag ---------- */
  var gptStarted = false, gptById = {}, gptRefreshes = {};
  function gptSetup(){
    window.googletag = window.googletag || { cmd: [] };
    window.googletag.cmd = window.googletag.cmd || [];
    loadScript('gpt', 'https://securepubads.g.doubleclick.net/tag/js/gpt.js').catch(function(){});
    googletag.cmd.push(function(){
      if (gptStarted) return; gptStarted = true;
      var pa = googletag.pubads();
      pa.disableInitialLoad();                                  // we decide when to request: consent first, Prebid bids first
      if (cfg.gpt.singleRequest) pa.enableSingleRequest();
      if (cfg.gpt.collapseEmpty) pa.collapseEmptyDivs(true);
      if (C.limited){ try { pa.setPrivacySettings({ restrictDataProcessing: true }); } catch(e){} }
      var kv = cfg.gpt.keyValues || {}; for (var k in kv) { try { pa.setTargeting(k, kv[k]); } catch(e){} }
      pa.addEventListener('slotRenderEnded', function(ev){
        var uu = gptById[ev.slot.getSlotElementId()]; if (!uu) return;
        log('slotRenderEnded', uu.name, 'empty=' + ev.isEmpty, ev.size ? ev.size.join('x') : '');
        if (ev.isEmpty) collapse(uu, 'no fill'); else fill(uu);
      });
      googletag.enableServices();
      if (PLAN.debugConsole){ try { googletag.openConsole(); } catch(e){} }   // Google's publisher console (diagnostics only)
    });
  }
  function gptRequest(list){
    gptSetup();
    list.forEach(function(u){
      u.timer = setTimeout(function(){ if (u.state === 'loading') collapse(u, 'timeout'); }, 12000 + cfg.prebid.timeoutMs);
    });
    googletag.cmd.push(function(){
      list.forEach(function(u){
        try {
          if (u.gslot || u.state === 'collapsed') return;
          var s = googletag.defineSlot(gptPath(u.key), u.allSizes, u.box.id);
          if (!s){ collapse(u, 'defineSlot failed'); return; }
          var m = googletag.sizeMapping();
          [[1002, 0], [760, 0], [0, 0]].forEach(function(vp){ m.addSize(vp, sizesFor(u.name, vp[0])); });
          s.defineSizeMapping(m.build());
          s.addService(googletag.pubads());
          u.gslot = s; gptById[u.box.id] = u;
          googletag.display(u.box.id);                          // registers the div; with initial load disabled nothing is fetched yet
        } catch(e){ collapse(u, 'gpt error'); }
      });
    });
    auction(list).then(function(){
      googletag.cmd.push(function(){
        var gs = list.filter(function(u){ return u.gslot && u.state === 'loading'; }).map(function(u){ return u.gslot; });
        if (!gs.length) return;
        log('GPT request:', gs.map(function(s){ return s.getAdUnitPath(); }).join(', '));
        googletag.pubads().refresh(gs);                        // one batch = one request when singleRequest is on
      });
    });
  }
  function gptRefreshTick(){
    if (!cfg.gpt.refresh.enabled || document.hidden) return;
    units.filter(function(u){ return u.gslot && u.state === 'filled' && inViewport(u.el) && (gptRefreshes[u.box.id] || 0) < cfg.gpt.refresh.maxPerSlot; })
      .forEach(function(u){
        gptRefreshes[u.box.id] = (gptRefreshes[u.box.id] || 0) + 1;
        auction([u]).then(function(){ googletag.cmd.push(function(){ log('refresh', u.name); googletag.pubads().refresh([u.gslot]); }); });
      });
  }

  /* ---------- AdSense ---------- */
  function adsenseRequest(u){
    var arr = window.adsbygoogle = window.adsbygoogle || [];
    try { arr.requestNonPersonalizedAds = C.limited ? 1 : 0; } catch(e){}
    loadScript('adsense', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsense.client), { crossorigin: 'anonymous' })
      .then(function(){
        if (u.state === 'collapsed') return;
        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.cssText = 'display:inline-block;width:' + u.w + 'px;height:' + u.h + 'px';
        ins.setAttribute('data-ad-client', cfg.adsense.client);
        ins.setAttribute('data-ad-slot', String(cfg.adsense.slots[u.key]));
        u.box.appendChild(ins);
        new MutationObserver(function(){
          var st = ins.getAttribute('data-ad-status');
          if (st === 'filled') fill(u); else if (st === 'unfilled') collapse(u, 'unfilled');
        }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
        try { arr.push({}); } catch(e){ collapse(u, 'push failed'); }
        u.timer = setTimeout(function(){ if (u.state === 'loading') collapse(u, 'timeout'); }, 12000);
      }).catch(function(){ collapse(u, 'script blocked'); });
  }

  /* ---------- managed partner ---------- */
  var managedStarted = false;
  function managedRequest(u){
    var c = cfg.managed.containers[u.key] || {};
    if (c.id) u.box.id = c.id;
    if (c.className) c.className.split(/\s+/).forEach(function(n){ if (n) u.box.classList.add(n); });
    for (var a in (c.attrs || {})) u.box.setAttribute(a, c.attrs[a]);
    if (!managedStarted){
      managedStarted = true;
      loadScript('managed', cfg.managed.scriptUrl).catch(function(){ units.forEach(function(x){ if (x.mode === 'managed') collapse(x, 'partner script blocked'); }); });
    }
    u.timer = setTimeout(function(){
      var has = u.box.querySelector('iframe,ins,img,video,canvas,div[id*="google_ads"]') || u.box.textContent.trim();
      if (has) fill(u); else collapse(u, 'partner left it empty');
    }, cfg.managed.collapseAfterMs);
  }

  /* ---------- video via Google IMA SDK ---------- */
  function decorate(tag){
    var t = tag;
    if (/correlator=$/.test(t)) t += Date.now();
    else if (!/[?&]correlator=/.test(t)) t += (t.indexOf('?') > -1 ? '&' : '?') + 'correlator=' + Date.now();
    if (!/[?&]description_url=/.test(t)) t += '&description_url=' + encodeURIComponent(location.origin + location.pathname);
    if (C.limited) t += '&npa=1&rdp=1';
    if (C.gdprApplies === true && C.tcString) t += '&gdpr=1&gdpr_consent=' + encodeURIComponent(C.tcString);
    else if (C.gdprApplies === false) t += '&gdpr=0';
    return t;
  }
  function loadSDK(){
    if (window.google && window.google.ima) return Promise.resolve();
    if (sdkFailed) return Promise.reject(new Error('sdk'));
    var src = sim === 'blocked' ? 'https://imasdk-blocked.invalid/ima3.js' : cfg.video.sdkUrl;
    return loadScript('ima', src, null, cfg.loadTimeoutMs).then(function(){ if (!(window.google && window.google.ima)) throw new Error('sdk'); })
      .catch(function(e){ sdkFailed = true; throw e; });
  }
  /* o: {tag, container, video, muted, timeoutMs, getSize(), onReady(), onStart(), onDone(reason)}  returns handle */
  function runIma(o){
    var h = { ended: false, mgr: null }, loader = null, adDC = null, t;
    function end(reason){
      if (h.ended) return; h.ended = true; clearTimeout(t);
      log('video ad ended:', reason);
      try { if (h.mgr) h.mgr.destroy(); } catch(e){}
      try { if (loader) loader.destroy(); } catch(e){}
      try { o.onDone(reason); } catch(e){}
    }
    h.stop = function(){ end('stopped'); };
    t = setTimeout(function(){ end('timeout'); }, o.timeoutMs);
    loadSDK().then(function(){
      if (h.ended) return;
      var ima = window.google.ima;
      try { ima.settings.setVpaidMode(ima.ImaSdkSettings.VpaidMode.DISABLED); } catch(e){}
      adDC = new ima.AdDisplayContainer(o.container, o.video);
      adDC.initialize();
      loader = new ima.AdsLoader(adDC);
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, function(){ end('no-fill-or-error'); }, false);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, function(ev){
        if (h.ended) return;
        try {
          var rs = new ima.AdsRenderingSettings();
          rs.restoreCustomPlaybackStateOnAdBreakComplete = true;
          var mgr = ev.getAdsManager(o.video, rs);
          h.mgr = mgr;
          var T = ima.AdEvent.Type;
          mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, function(){ end('error'); });
          mgr.addEventListener(T.STARTED, function(){ clearTimeout(t); try { o.onStart(); } catch(e){} });
          mgr.addEventListener(T.COMPLETE, function(){ end('complete'); });
          mgr.addEventListener(T.ALL_ADS_COMPLETED, function(){ end('complete'); });
          mgr.addEventListener(T.SKIPPED, function(){ end('skipped'); });
          mgr.addEventListener(T.USER_CLOSE, function(){ end('closed'); });
          o.onReady();
          var sz = o.getSize();
          mgr.init(sz.w, sz.h, ima.ViewMode.NORMAL);
          mgr.setVolume(o.muted ? 0 : 1);
          mgr.start();
        } catch(e){ end('error'); }
      }, false);
      var req = new ima.AdsRequest();
      req.adTagUrl = decorate(o.tag);
      req.linearAdSlotWidth = 640; req.linearAdSlotHeight = 360;
      req.nonLinearAdSlotWidth = 640; req.nonLinearAdSlotHeight = 90;
      try { req.setAdWillAutoPlay(true); req.setAdWillPlayMuted(!!o.muted); } catch(e){}
      loader.requestAds(req);
    }).catch(function(){ end('sdk-unavailable'); });
    return h;
  }
  function outstreamRequest(u){
    var tag = PLAN.videoTags.outstream;
    if (!tag || blocked || sdkFailed){ collapse(u, 'no outstream tag or blocked'); return; }
    u.box.innerHTML = '<div class="sin-os"><div class="sin-os__ad"></div><video class="sin-os__v" playsinline muted></video></div>' +
      '<button type="button" class="sin-os__x" aria-label="Close this video ad">×</button>';
    var h = runIma({
      tag: tag, container: u.box.querySelector('.sin-os__ad'), video: u.box.querySelector('video'), muted: true,
      timeoutMs: cfg.loadTimeoutMs,
      getSize: function(){ var r = u.box.getBoundingClientRect(); return { w: Math.max(200, r.width), h: Math.max(112, r.height) }; },
      onReady: function(){}, onStart: function(){ fill(u); }, onDone: function(){ collapse(u, 'outstream ended'); }
    });
    u.stop = h.stop;
    u.box.querySelector('.sin-os__x').addEventListener('click', function(){ collapse(u, 'closed'); });
  }

  /* ---------- scheduling: lazy, at most N visible, consent first ---------- */
  function applyBlocked(){
    if (!detected || !blocked) return;
    units.slice().forEach(function(u){ collapse(u, 'ad blocker'); });
  }
  function closeBy(e){ var r = e.getBoundingClientRect(), m = cfg.gpt.lazyMarginPx; return r.width > 0 && r.bottom > -m && r.top < innerHeight + m; }   // backup for IntersectionObserver
  function pump(){
    raf = 0;
    if (!ready || !detected || !consentAllowed()) return;
    var vis = visibleCount(), batch = [];
    for (var i = 0; i < units.length; i++){
      var u = units[i];
      if (u.state === 'idle' && (u.near || closeBy(u.el)) && !u.slot.el.hidden && vis < cfg.maxVisibleUnits){
        u.state = 'loading'; u.el.setAttribute('data-state', 'loading');
        if (inViewport(u.el)) vis++;
        if (u.kind === 'outstream') outstreamRequest(u);
        else if (u.mode === 'gpt') batch.push(u);
        else if (u.mode === 'adsense') adsenseRequest(u);
        else if (u.mode === 'managed') managedRequest(u);
      }
    }
    if (batch.length) gptRequest(batch);                       // everything due now goes out together (single request architecture)
  }
  function schedule(){                                          // next frame, or 120 ms at the latest (some embedded views pause animation frames)
    if (raf) return; raf = 1;
    var run = function(){ if (!raf) return; pump(); };
    requestAnimationFrame(run); setTimeout(run, 120);
  }

  function makeUnit(slot, d){
    var id = 'sin-ad-' + (++uid);
    var ue = el('div', 'sin-ad__unit', '<span class="sin-ad__label">Advertisement</span><div class="sin-ad__box" id="' + id + '"></div>');
    ue.style.setProperty('--w', d.w + 'px'); ue.style.setProperty('--h', d.h + 'px');
    ue.setAttribute('data-state', 'idle'); ue.setAttribute('data-unit', d.name);
    if (d.tall) ue.setAttribute('data-tall', '');
    slot.el.appendChild(ue);
    var u = { el: ue, box: ue.querySelector('.sin-ad__box'), slot: slot, state: 'idle', near: false, timer: 0, name: d.name, w: d.w, h: d.h,
      key: d.key, kind: d.kind, mode: d.mode, sizes: d.sizes, allSizes: d.allSizes, gslot: null };
    slot.units.push(u); units.push(u);
    if (io) io.observe(ue); else u.near = true;
    return u;
  }

  function planFor(type, host){
    var p = [], w = host.clientWidth || innerWidth;
    function add(name, key, kind, extra){
      if (!PLAN.slots[key]) return;
      var sz = sizesFor(name, w), all = [];
      [1002, 760, 0].forEach(function(vp){ sizesFor(name, vp).forEach(function(s){ if (!all.some(function(a){ return a[0] === s[0] && a[1] === s[1]; })) all.push(s); }); });
      var o = { name: name, key: key, kind: kind, mode: stack, w: sz[0][0], h: sz[0][1], sizes: sz, allSizes: all };
      for (var k in (extra || {})) o[k] = extra[k];
      p.push(o);
    }
    if (type === 'top-banner') add('top-banner', 'topBanner', 'display');
    else if (type === 'side-rail'){
      if (cfg.rail.unit === 'outstream' && PLAN.video.outstream) p.push({ name: 'rail-1', key: 'sideRail', kind: 'outstream', mode: 'video', w: 300, h: 169, sizes: [[300, 169]], allSizes: [[300, 169]] });
      else add('rail-1', 'sideRail', 'display');
      if (p.length && cfg.rail.tall) add('rail-2', 'sideRailTall', 'display', { tall: true });
    } else if (type === 'in-content' && cfg.inContent.enabled) add('inline', 'inContent', 'display');
    return p;
  }
  function describe(d){
    var key = d.key, o = { slot: d.name, stack: d.mode, sizes: d.sizes.map(function(s){ return s.join('x'); }).join(' | ') };
    if (d.kind === 'outstream'){ o.video = 'outstream VAST tag'; return o; }
    if (d.mode === 'gpt'){ o.adUnitPath = gptPath(key); o.bidders = prebidOn() ? (biddersFor(key).map(function(b){ return b.bidder; }).join(', ') || '(none for this slot)') : '(prebid off)'; o.lazy = 'within ' + cfg.gpt.lazyMarginPx + 'px'; }
    else if (d.mode === 'adsense'){ o.client = cfg.adsense.client; o.adSlot = cfg.adsense.slots[key]; }
    else { var c = cfg.managed.containers[key] || {}; o.container = ((c.id ? '#' + c.id : '') + ' ' + (c.className ? '.' + c.className : '')).trim(); o.partnerScript = cfg.managed.scriptUrl; }
    return o;
  }

  function dropSlot(e, type){
    if (type === 'side-rail'){ var m = e.closest('main'); if (m) m.classList.remove('sin-has-rail'); }
    e.remove();
  }
  var dryRows = [];
  function mountSlot(target, type){
    if (DRY){ if (type) planFor(type, { clientWidth: innerWidth }).forEach(function(d){ dryRows.push(describe(d)); }); return null; }
    var e = typeof target === 'string' ? document.querySelector(target) : target;
    if (!e || !ready) return null;
    if (e.__sinAd) return e.__sinAd;
    type = type || e.getAttribute('data-ad-slot');
    if (!PAGE.allowed || PAGE.game) { dropSlot(e, type); return null; }
    var plan = planFor(type, e);
    if (!plan.length){ dropSlot(e, type); return null; }
    var slot = { el: e, type: type, units: [] };
    e.__sinAd = slot;
    e.className = (e.className.replace(/\bsin-ad--\S+/g, '') + ' sin-ad sin-ad--' + type).trim();
    if (type === 'side-rail') e.setAttribute('data-narrow', cfg.rail.narrow === 'inline' ? 'inline' : 'hide');
    e.setAttribute('data-ad-slot', type);
    e.removeAttribute('data-reserved');
    plan.forEach(function(d){ makeUnit(slot, d); });
    if (type === 'top-banner') e.style.height = innerWidth >= 760 ? '124px' : '84px';
    slots.push(slot);
    applyBlocked();
    schedule();
    return slot;
  }

  function insertInContent(container, itemSelector, every){
    if (!container || !itemSelector) return 0;
    if (!PLAN.slots.inContent || !cfg.inContent.enabled || PAGE.game || !PAGE.allowed) return 0;
    var n = every || cfg.inContent.everyN, max = cfg.inContent.max;
    var have = DRY ? dryRows.filter(function(r){ return r.slot === 'inline'; }).length : document.querySelectorAll('[data-ad-slot="in-content"]').length;
    var items = container.querySelectorAll(itemSelector), added = 0;
    for (var i = n - 1; i < items.length - 1 && have + added < max; i += n){
      if (DRY){ mountSlot(null, 'in-content'); added++; continue; }
      var nx = items[i].nextElementSibling;
      if (nx && nx.hasAttribute && nx.hasAttribute('data-ad-slot')) continue;
      var s = el('div', 'sin-ad sin-ad--in-content sin-ad--span');
      s.setAttribute('data-ad-slot', 'in-content');
      items[i].insertAdjacentElement('afterend', s);
      if (mountSlot(s, 'in-content')) added++;
    }
    return added;
  }

  /* ================================================================== video interstitials (pre-roll / post-roll) */
  var active = null, pendingPost = null;
  function today(){ var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function recentVideo(){ try { return JSON.parse(store('l', 'get', 'sin-ads-vid') || '[]').filter(function(t){ return Date.now() - t < 3600000; }); } catch(e){ return []; } }
  function frequencyOK(kind, gameId){
    var f = cfg.frequency, id = String(gameId || 'game');
    if (recentVideo().length >= f.maxVideoPerHour) return false;
    if (kind === 'preroll'){
      var r; try { r = JSON.parse(store('l', 'get', 'sin-ads-pre:' + id) || 'null'); } catch(e){}
      if (r && r.d === today() && r.n >= f.prerollPerGamePerDay) return false;
    } else if (parseInt(store('s', 'get', 'sin-ads-post:' + id) || '0', 10) >= f.postrollPerGamePerSession) return false;
    return true;
  }
  function recordShown(kind, gameId){
    var id = String(gameId || 'game'), v = recentVideo(); v.push(Date.now());
    store('l', 'set', 'sin-ads-vid', JSON.stringify(v));
    if (kind === 'preroll'){
      var r; try { r = JSON.parse(store('l', 'get', 'sin-ads-pre:' + id) || 'null'); } catch(e){}
      store('l', 'set', 'sin-ads-pre:' + id, JSON.stringify({ d: today(), n: r && r.d === today() ? r.n + 1 : 1 }));
    } else store('s', 'set', 'sin-ads-post:' + id, String(parseInt(store('s', 'get', 'sin-ads-post:' + id) || '0', 10) + 1));
  }
  function eligible(kind, gameId, opts){
    if (DRY){ log('dry run: would request a ' + kind + ' for game "' + gameId + '" with tag ' + (PLAN.videoTags[kind] || '(none)')); return false; }
    if (!PLAN.video[kind] || active || gameplayActive || !PAGE.allowed || !ready) return false;
    if (!consentAllowed() || blocked || sdkFailed) return false;
    try { if (navigator.connection && navigator.connection.saveData) return false; } catch(e){}
    var force = !!(opts && opts.force) && (devHost || PLAN.testMode);
    return force || frequencyOK(kind, gameId);
  }
  function fmt(s){ s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function showInterstitial(kind, gameId, opts){
    opts = opts || {};
    return new Promise(function(resolve){
      var finished = false, cleanup = null;
      function done(){ if (finished) return; finished = true; try { if (cleanup) cleanup(); } catch(e){} active = null; resolve(); }
      try {
        if (!eligible(kind, gameId, opts)) return resolve();
        var id = 'sin-vad-' + (++uid), prev = document.activeElement;
        var dlg = el(typeof HTMLDialogElement === 'function' ? 'dialog' : 'div', 'sin-vad');
        dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', id + '-t');
        dlg.innerHTML =
          '<div class="sin-vad__panel" tabindex="-1">' +
            '<div class="sin-vad__bar"><span class="sin-vad__label" id="' + id + '-t">Advertisement</span>' +
            '<span class="sin-vad__ctx">' + (kind === 'preroll' ? 'Your game starts right after' : 'Thanks for playing') + '</span>' +
            '<span class="sin-vad__count" data-count></span></div>' +
            '<div class="sin-vad__stage"><div class="sin-vad__ima"></div><video class="sin-vad__video" playsinline muted></video></div>' +
            '<div class="sin-vad__ctl">' +
              '<button type="button" class="sin-vad__btn" data-act="play">Pause</button>' +
              '<button type="button" class="sin-vad__btn" data-act="mute">Unmute</button>' +
              '<button type="button" class="sin-vad__btn sin-vad__skip" data-act="skip" disabled aria-disabled="true">Skip ad</button>' +
            '</div>' +
            '<span class="sr-only" role="status" aria-live="polite" data-live></span>' +
          '</div>';
        var panel = dlg.querySelector('.sin-vad__panel'), count = dlg.querySelector('[data-count]'),
            bPlay = dlg.querySelector('[data-act=play]'), bMute = dlg.querySelector('[data-act=mute]'), bSkip = dlg.querySelector('[data-act=skip]'),
            live = dlg.querySelector('[data-live]');
        var native = typeof dlg.showModal === 'function';
        var st = { elapsed: 0, paused: false, muted: true, canSkip: false, shown: false, ima: null, ticker: 0, max: 0 };

        function paint(){
          var left = Math.max(0, cfg.skipAfterSeconds - st.elapsed);
          if (!st.canSkip && st.elapsed >= cfg.skipAfterSeconds){
            st.canSkip = true; bSkip.disabled = false; bSkip.setAttribute('aria-disabled', 'false'); live.textContent = 'You can now skip this ad.';
          }
          var rem = st.ima && st.ima.mgr ? st.ima.mgr.getRemainingTime() : -1;
          bSkip.textContent = st.canSkip ? 'Skip ad' : 'Skip in ' + Math.ceil(left);
          count.textContent = rem > 0 ? 'Ad ends in ' + fmt(rem) : '';
        }
        function finish(){
          if (finished) return;
          clearInterval(st.ticker); clearTimeout(st.max);
          if (st.ima) { try { st.ima.stop(); } catch(e){} }
          try { if (native && dlg.open) dlg.close(); } catch(e){}
          dlg.remove();
          document.removeEventListener('keydown', onKey, true);
          if (prev && document.contains(prev) && prev.focus){ try { prev.focus({ preventScroll: true }); } catch(e){} }
          done();
        }
        function skip(){ if (st.canSkip) finish(); }
        function onKey(e){
          if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); skip(); return; }
          if (!native && e.key === 'Tab'){                      // basic focus trap for browsers without <dialog>
            var f = [].filter.call(dlg.querySelectorAll('button'), function(b){ return !b.disabled; });
            if (!f.length){ e.preventDefault(); panel.focus(); return; }
            var i = f.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0){ e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && i === f.length - 1){ e.preventDefault(); f[0].focus(); }
          }
        }
        function open(){
          if (st.shown || finished) return;
          st.shown = true;
          dlg.classList.remove('sin-vad--prep'); dlg.removeAttribute('aria-hidden'); dlg.inert = false;
          if (!native) dlg.classList.add('sin-vad--fallback');
          if (native) dlg.showModal(); else dlg.setAttribute('open', '');
          dlg.addEventListener('cancel', function(e){ e.preventDefault(); skip(); });
          dlg.addEventListener('close', function(){ finish(); });
          document.addEventListener('keydown', onKey, true);
          panel.focus();
          recordShown(kind, gameId);
          st.max = setTimeout(finish, cfg.maxAdSeconds * 1000);
          paint();
          st.ticker = setInterval(function(){ if (!st.paused) st.elapsed += 0.25; paint(); }, 250);
        }
        dlg.addEventListener('click', function(e){
          var b = e.target.closest && e.target.closest('button[data-act]'); if (!b) return;
          var a = b.getAttribute('data-act');
          if (a === 'skip') skip();
          else if (a === 'play'){
            st.paused = !st.paused; bPlay.textContent = st.paused ? 'Play' : 'Pause';
            if (st.ima && st.ima.mgr){ try { st.paused ? st.ima.mgr.pause() : st.ima.mgr.resume(); } catch(x){} }
          } else if (a === 'mute'){
            st.muted = !st.muted; bMute.textContent = st.muted ? 'Unmute' : 'Mute';
            if (st.ima && st.ima.mgr){ try { st.ima.mgr.setVolume(st.muted ? 0 : 1); } catch(x){} }
          }
        });
        cleanup = function(){ clearInterval(st.ticker); clearTimeout(st.max); };
        // Park the dialog off-screen, inert and hidden while the ad loads (IMA needs a rendered container).
        // It only appears once an ad is really ready; any failure ends silently so the game carries on at once.
        dlg.classList.add('sin-vad--prep'); dlg.setAttribute('aria-hidden', 'true'); dlg.inert = true;
        document.body.appendChild(dlg);
        st.ima = runIma({
          tag: PLAN.videoTags[kind], container: dlg.querySelector('.sin-vad__ima'), video: dlg.querySelector('video'), muted: true,
          timeoutMs: cfg.loadTimeoutMs,
          getSize: function(){ var r = dlg.querySelector('.sin-vad__stage').getBoundingClientRect(); return { w: Math.max(240, r.width), h: Math.max(135, r.height) }; },
          onReady: open,
          onStart: function(){ st.elapsed = 0; },
          onDone: function(){ st.ima = null; finish(); }
        });
        active = { cancel: function(){ if (st.ima) st.ima.stop(); finish(); } };
      } catch(e){ done(); }
    });
  }
  function showPreroll(gameId, opts){ return showInterstitial('preroll', gameId, opts); }
  function showPostroll(gameId, opts){
    return new Promise(function(resolve){
      try {
        if (!eligible('postroll', gameId, opts)) return resolve();
        var delay = opts && opts.delayMs != null ? opts.delayMs : cfg.frequency.postrollDelayMs;
        pendingPost = { r: resolve, t: setTimeout(function(){ pendingPost = null; showInterstitial('postroll', gameId, opts).then(resolve); }, delay) };
      } catch(e){ resolve(); }
    });
  }
  function cancel(){
    if (pendingPost){ clearTimeout(pendingPost.t); var r = pendingPost.r; pendingPost = null; if (r) r(); }
    if (active && active.cancel) active.cancel();
  }
  function setGameplay(on){ gameplayActive = !!on; if (on) cancel(); }

  /* ================================================================== consent change (the built-in banner pushes here) */
  function setConsent(s){
    if (C.provider !== 'builtin' || !s) return;
    var was = consentAllowed();
    C.limited = !!s.limited || navigator.globalPrivacyControl === true;
    if (!s.required || s.status === 'granted'){ C.resolved = false; settle(true, 'builtin'); }
    else if (s.status === 'denied'){ C.resolved = false; settle(false, 'builtin-denied'); }
    if (was && !consentAllowed()){
      var live = units.some(function(u){ return u.state === 'filled' || u.state === 'loading'; });
      cancel();
      if (live) location.reload();                             // ad scripts cannot be un-loaded; a fresh page load is the clean way
    }
  }

  /* ================================================================== diagnostics and init */
  function report(){
    if (!window.console) return;
    var g = console.groupCollapsed ? 'groupCollapsed' : 'log';
    console[g]('[SIN ads] diagnostics (this report draws nothing)');
    console.log('enabled:', PLAN.enabled, '| stack:', PLAN.stack, '| testMode:', PLAN.testMode, '| active:', PLAN.active, '| dry run:', DRY);
    console.log('page:', JSON.stringify(PAGE), '| path:', location.pathname);
    if (PLAN.problems.length) console.log('Problems / reasons nothing loads:\n - ' + PLAN.problems.join('\n - '));
    if (PLAN.notes.length) console.log('Notes:\n - ' + PLAN.notes.join('\n - '));
    var rows = DRY ? dryRows : units.map(function(u){ return describe(u); });
    if (rows.length){ console.log('Slots that ' + (DRY ? 'would request' : 'request') + ' ads on this page (' + rows.length + '):'); if (console.table) console.table(rows); else console.log(JSON.stringify(rows, null, 1)); }
    else console.log('No ad slots are configured for this page.');
    console.log('video:', JSON.stringify({ preroll: PLAN.video.preroll && PLAN.videoTags.preroll, postroll: PLAN.video.postroll && PLAN.videoTags.postroll, outstream: PLAN.video.outstream && PLAN.videoTags.outstream }));
    console.log('consent:', JSON.stringify({ provider: C.provider, resolved: C.resolved, allowed: C.allowed, source: C.source, gdprApplies: C.gdprApplies, tcString: C.tcString ? C.tcString.slice(0, 12) + '...' : '', limited: C.limited, usp: C.usp, gpp: C.gpp,
      cmpPresent: { tcf: typeof window.__tcfapi === 'function', usp: typeof window.__uspapi === 'function', gpp: typeof window.__gpp === 'function' } }));
    console.log('libraries:', JSON.stringify({ gpt: DRY ? 'not loaded (dry run)' : (scriptState.gpt || 'not requested'), prebid: DRY ? 'not loaded (dry run)' : (scriptState.prebid || (prebidOn() ? 'not requested yet' : 'off')),
      adsense: scriptState.adsense || 'not requested', managed: scriptState.managed || 'not requested', ima: scriptState.ima || (window.google && window.google.ima ? 'loaded' : 'not requested'), blockerDetected: blocked }));
    if (prebidOn()) console.log('prebid:', JSON.stringify({ timeoutMs: cfg.prebid.timeoutMs, priceGranularity: cfg.prebid.priceGranularity, build: cfg.prebid.localBuild || cfg.prebid.scriptUrl, consentModules: Object.keys(cfg.prebid.consentManagement || {}) }));
    console.log('Tip: ?adsdebug=console runs the real ads with Google\'s publisher console open. Any debug run turns Prebid debug on.');
    if (console.groupEnd && g === 'groupCollapsed') console.groupEnd();
  }

  function drain(){ (window.SIN_ADS_QUEUE || []).splice(0).forEach(function(f){ try { f(API); } catch(e){} }); }

  function init(){
    if (ready) return API;
    if (!PAGE.allowed && !DRY) return API;
    ready = true; API.ready = true;
    if (DRY){
      if (document.querySelector('body > header') && !PAGE.game && PAGE.allowed && document.body.getAttribute('data-ads-banner') !== 'off') mountSlot(null, 'top-banner');
      if (document.querySelector('main[data-ads-rail]') && !PAGE.game && PAGE.allowed) mountSlot(null, 'side-rail');
      drain();
      resolveConsent().then(function(){ setTimeout(report, 50); });
      return API;
    }
    if ('IntersectionObserver' in window){
      io = new IntersectionObserver(function(es){
        es.forEach(function(en){ for (var i = 0; i < units.length; i++) if (units[i].el === en.target) units[i].near = en.isIntersecting; });
        schedule();
      }, { rootMargin: cfg.gpt.lazyMarginPx + 'px 0px' });
    }
    if (C.provider === 'builtin' && window.SIN_CONSENT && window.SIN_CONSENT.start){ try { window.SIN_CONSENT.start(); } catch(e){} }
    if (C.provider === 'cmp'){                              // footer "Privacy choices" link re-opens the CMP's own dialog
      [].forEach.call(document.querySelectorAll('[data-sin-ads-only],[data-sin-privacy-choices]'), function(n){ n.hidden = false; });
      document.addEventListener('click', function(e){
        var a = e.target.closest && e.target.closest('[data-sin-privacy-choices]'); if (!a) return;
        e.preventDefault();
        try { if (typeof window.__tcfapi === 'function') window.__tcfapi('displayConsentUi', 2, function(){}); } catch(x){}
        try { if (window.googlefc && window.googlefc.callbackQueue) window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage); } catch(x){}
      });
    }
    var nodes = document.querySelectorAll('[data-ad-slot]');
    for (var i = 0; i < nodes.length; i++) mountSlot(nodes[i]);
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', function(){
      var tb = document.querySelector('.sin-ad--top-banner'); if (tb && tb.__sinAd) tb.style.height = innerWidth >= 760 ? '124px' : '84px';
      schedule();
    });
    if (cfg.gpt.refresh.enabled && stack === 'gpt') setInterval(gptRefreshTick, cfg.gpt.refresh.seconds * 1000);
    detectBlocker().then(function(){ detected = true; applyBlocked(); schedule(); });
    resolveConsent().then(function(){
      if (consentAllowed() && stack === 'adsense' && cfg.adsense.autoAds && !blocked)
        loadScript('adsense', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsense.client), { crossorigin: 'anonymous' });
      if (DEBUG) setTimeout(report, 1500);
    });
    drain();
    return API;
  }

  function status(){
    return { plan: PLAN, consent: C, blocked: blocked, sdkFailed: sdkFailed, scripts: scriptState, page: PAGE,
      units: units.map(function(u){ return { slot: u.name, state: u.state, stack: u.mode, path: u.mode === 'gpt' ? gptPath(u.key) : '' }; }) };
  }

  var ADS_BASE = document.currentScript ? new URL('./', document.currentScript.src).href : location.href;
  var API = {
    version: '2.0', ready: false,
    init: init, mountSlot: mountSlot, insertInContent: insertInContent,
    showPreroll: showPreroll, showPostroll: showPostroll,
    setConsent: setConsent, isBlocked: function(){ return blocked; },
    isActive: function(){ return PLAN.active; }, setGameplay: setGameplay, cancel: cancel, status: status, report: report
  };
  window.SIN_ADS = API;

  function boot(){ try { init(); } catch(e){ log('init error', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
