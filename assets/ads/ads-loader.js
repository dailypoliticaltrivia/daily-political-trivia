/* Daily Political Trivia - ad loader. Tiny and synchronous. Load it right AFTER ads-config.js.
   It reads the owner's settings and works out a PLAN: which ad slots are really configured.
   - Nothing configured (or enabled is false): it does nothing at all. No files are loaded, nothing is drawn.
   - Something configured: it reserves the banner/rail space before first paint (so the page never jumps) and loads ads.js.
   - ?adsdebug=1 : "dry run". Loads ads.js only to PRINT, in the browser console, what each slot would request. Draws nothing.
   Exposes window.SIN_ADS_CFG (settings with defaults), window.SIN_ADS_PLAN, window.SIN_ADS_PAGE and
   window.SIN_ADS_ready(fn) (runs fn(SIN_ADS) once the ad system is up; never runs when ads are off). */
(function(){
  var me = document.currentScript;
  var queue = [];
  window.SIN_ADS_QUEUE = queue;
  window.SIN_ADS_ready = function(fn){
    if (window.SIN_ADS && window.SIN_ADS.ready) { try { fn(window.SIN_ADS); } catch(e){} } else queue.push(fn);
  };
  if (!me) return;

  /* ---- defaults, so an owner can delete lines from ads-config.js without breaking anything ---- */
  var DEFAULTS = {
    enabled: false, stack: 'gpt', testMode: false, debug: false,
    gpt: { networkCode: '', adUnits: { topBanner: '', sideRail: '', sideRailTall: '', inContent: '' }, singleRequest: true, collapseEmpty: true,
           lazyMarginPx: 300, refresh: { enabled: false, seconds: 60, maxPerSlot: 5 }, keyValues: {} },
    prebid: { enabled: false, scriptUrl: '', localBuild: '', timeoutMs: 1200, loadTimeoutMs: 1500, priceGranularity: 'medium',
              bidders: { topBanner: [], sideRail: [], sideRailTall: [], inContent: [] },
              userSync: { syncEnabled: true, syncsPerBidder: 5, filterSettings: { iframe: { bidders: '*', filter: 'include' } }, auctionDelay: 0 },
              s2sConfig: null,
              consentManagement: { gdpr: { cmpApi: 'iab', timeout: 8000, defaultGdprScope: false }, usp: { cmpApi: 'iab', timeout: 100 }, gpp: { cmpApi: 'iab', timeout: 3000 } },
              extraConfig: {} },
    adsense: { client: '', slots: { topBanner: '', sideRail: '', sideRailTall: '', inContent: '' }, autoAds: false },
    managed: { scriptUrl: '', waitForConsent: false, collapseAfterMs: 8000, allowSiteVideo: false,
               containers: { topBanner: { id: '', className: '', attrs: {} }, sideRail: { id: '', className: '', attrs: {} }, sideRailTall: { id: '', className: '', attrs: {} }, inContent: { id: '', className: '', attrs: {} } } },
    video: { tag: '', tags: { preroll: '', postroll: '', outstream: '' }, sdkUrl: 'https://imasdk.googleapis.com/js/sdkloader/ima3.js' },
    rail: { unit: 'display', tall: true, narrow: 'hide' },
    inContent: { enabled: true, max: 2, everyN: 6 },
    frequency: { prerollPerGamePerDay: 1, postrollPerGamePerSession: 1, maxVideoPerHour: 2, postrollDelayMs: 2500 },
    skipAfterSeconds: 5, loadTimeoutMs: 8000, maxAdSeconds: 60, maxVisibleUnits: 3,
    consent: { provider: 'cmp', fundingChoicesPubId: '', waitMs: 5000, strictAccept: false, storageKey: 'sin-consent-v1', policyUrl: 'privacy.html', mode: 'auto' }
  };
  function merge(a, b){
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in (b || {})){
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) o[k] = merge(a[k], b[k]);
      else o[k] = b[k];
    }
    return o;
  }
  var cfg = merge(DEFAULTS, window.SIN_ADS_CONFIG || {});
  window.SIN_ADS_CFG = cfg;

  /* Google's published demo ad unit and sample VAST tags. Used ONLY when testMode is true (documented as test traffic). */
  var DEMO_UNIT = '/6355419/Travel/Europe/France/Paris';
  var SAMPLE = {
    skippable: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&correlator=',
    linear: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&correlator='
  };

  var qs = new URLSearchParams(location.search);
  var dbgParam = qs.get('adsdebug');
  var dry = dbgParam === '1' || dbgParam === 'dry';
  var debugConsole = dbgParam === 'console';
  var debug = !!(cfg.debug || dbgParam);

  /* ---- what is really configured? ---- */
  var KEYS = ['topBanner', 'sideRail', 'sideRailTall', 'inContent'];
  var problems = [], notes = [];
  var stack = cfg.stack;
  if (['gpt', 'adsense', 'managed'].indexOf(stack) < 0){ problems.push('stack must be "gpt", "adsense" or "managed" (it is "' + stack + '").'); stack = 'gpt'; }
  var slots = {};
  function validNet(x){ return /^\d{4,}$/.test(String(x || '')); }
  function validClient(x){ return /^ca-pub-\d{10,20}$/.test(String(x || '')); }
  function httpsUrl(x){ return /^https:\/\/[^\s]+$/.test(String(x || '')); }
  KEYS.forEach(function(k){
    var ok = false;
    if (stack === 'gpt'){
      var code = cfg.gpt.adUnits[k];
      ok = cfg.testMode || (validNet(cfg.gpt.networkCode) && !!code);
      if (!cfg.testMode && !ok && code && !validNet(cfg.gpt.networkCode)) problems.push('gpt.networkCode is empty or not a number (needed for ' + k + ').');
    } else if (stack === 'adsense'){
      ok = validClient(cfg.adsense.client) && /^\d{5,}$/.test(String(cfg.adsense.slots[k] || ''));
    } else {
      var c = cfg.managed.containers[k] || {};
      ok = httpsUrl(cfg.managed.scriptUrl) && !!(c.id || c.className);
    }
    slots[k] = !!cfg.enabled && ok;
  });
  if (stack === 'gpt' && cfg.testMode) notes.push('testMode is ON: display slots request Google\'s demo ad unit (test traffic, not real advertisers).');
  if (stack !== 'gpt' && cfg.testMode) notes.push('testMode only affects the "gpt" stack (display) and video tags.');
  if (stack === 'gpt' && !validNet(cfg.gpt.networkCode) && !cfg.testMode) problems.push('gpt.networkCode is empty.');
  if (stack === 'adsense' && !validClient(cfg.adsense.client)) problems.push('adsense.client is empty or not in the form ca-pub-0000000000000000.');
  if (stack === 'managed' && !httpsUrl(cfg.managed.scriptUrl)) problems.push('managed.scriptUrl is empty (paste the https script URL your partner gave you).');
  if (!cfg.enabled) problems.push('enabled is false: the site will not request any ads.');

  var vtags = {};
  ['preroll', 'postroll', 'outstream'].forEach(function(k){
    var t = (cfg.video.tags && cfg.video.tags[k]) || cfg.video.tag || '';
    if (!t && cfg.testMode) t = k === 'outstream' ? SAMPLE.linear : SAMPLE.skippable;
    vtags[k] = httpsUrl(t) ? t : '';
  });
  var videoAllowed = !!cfg.enabled && (stack !== 'managed' || cfg.managed.allowSiteVideo === true);
  var video = { preroll: videoAllowed && !!vtags.preroll, postroll: videoAllowed && !!vtags.postroll, outstream: videoAllowed && !!vtags.outstream };
  if (cfg.enabled && stack === 'managed' && !cfg.managed.allowSiteVideo) notes.push('Managed-partner mode: site video ads are off (set managed.allowSiteVideo to true only if your partner allows other video ads).');
  if (cfg.prebid.enabled && stack !== 'gpt') notes.push('Prebid only works with the "gpt" stack; it is ignored here.');

  var anySlot = KEYS.some(function(k){ return slots[k]; });
  var anyVideo = video.preroll || video.postroll || video.outstream;
  var plan = { enabled: !!cfg.enabled, stack: stack, testMode: !!cfg.testMode, slots: slots, video: video, videoTags: vtags,
    active: anySlot || anyVideo, dry: dry, debug: debug, debugConsole: debugConsole, demoUnit: DEMO_UNIT, problems: problems, notes: notes };
  window.SIN_ADS_PLAN = plan;

  /* ---- which pages may carry ads ---- */
  var path = location.pathname.toLowerCase();
  var body = document.body;
  var allowed = !(body && body.getAttribute('data-ads') === 'off')
    && !/\/opinions\/(write|new|edit|compose|account|admin|login|signin|signup|reset|settings)[^/]*$/.test(path)
    && !/\/(404|error|offline)\.html$/.test(path);
  var game = /\/games\/[^/]+\/[^/]*$/.test(path) || (body && body.getAttribute('data-ads') === 'game');
  window.SIN_ADS_PAGE = { allowed: allowed, game: !!game };

  if (!plan.active && !dry) return;                   // nothing configured: do nothing at all

  if (!dry && allowed && !game && body && body.getAttribute('data-ads-banner') !== 'off'){
    var hdr = document.querySelector('body > header');
    if (hdr && slots.topBanner && !document.querySelector('[data-ad-slot="top-banner"]')){
      var band = document.createElement('div');
      band.className = 'sin-ad sin-ad--top-banner';
      band.setAttribute('data-ad-slot', 'top-banner');
      band.setAttribute('data-reserved', '');
      band.style.height = (innerWidth >= 760 ? 124 : 84) + 'px';      // box height + 34px chrome; same numbers as ads.css
      hdr.insertAdjacentElement('afterend', band);
    }
    var main = document.querySelector('main[data-ads-rail]');
    var wrap = main && main.querySelector(':scope > .wrap');
    if (wrap && slots.sideRail && !wrap.querySelector('[data-ad-slot="side-rail"]')){
      main.classList.add('sin-has-rail');
      var aside = document.createElement('aside');
      aside.className = 'sin-ad sin-ad--side-rail sin-rail';
      aside.setAttribute('data-ad-slot', 'side-rail');
      aside.setAttribute('aria-label', 'Advertisements');
      wrap.appendChild(aside);
    }
  }

  var base = new URL('./', me.src).href;
  function css(h){ var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + h; document.head.appendChild(l); }
  function js(h){ var s = document.createElement('script'); s.src = base + h; s.async = false; document.head.appendChild(s); }
  var builtin = cfg.consent.provider === 'builtin' && !dry;
  if (!dry) css('ads.css');
  if (builtin){ css('consent.css'); js('consent.js'); }
  js('ads.js');                                       // dynamic scripts with async=false run in this order
})();
