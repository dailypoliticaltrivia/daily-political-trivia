/* Daily Political Trivia - ad settings. THIS IS THE ONLY FILE THE OWNER EDITS.
   Plain-language guide: ../../ADS-SETUP.md      Page wiring (for the developer): INTEGRATION.md

   Today everything is OFF: the site shows no ads, no boxes, no labels and loads no ad code, on every address
   (including your own PC). Ads start only when you (1) set enabled to true AND (2) fill in the real ids from
   your own ad accounts for the stack you chose. Never type ids you do not have; leave '' to leave a field unused.

   To see in the browser console what the site WOULD request, open any page with  ?adsdebug=1  on the end of the
   address. That prints a report and draws nothing. */
window.SIN_ADS_CONFIG = {

  /* MASTER SWITCH. false = no ads anywhere. */
  enabled: false,

  /* WHICH ADVERTISING STACK TO USE (choose one):
       'gpt'      Google Ad Manager (Google Publisher Tag), optionally with Prebid header bidding. Most control.
       'adsense'  Google AdSense. The simplest way to start without Ad Manager.
       'managed'  A managed monetisation partner (Mediavine, Raptive, Ezoic, Freestar, Publift ...). The site only
                  reserves containers and loads the one script your partner gives you. */
  stack: 'gpt',

  /* TEST MODE (default false). true = display slots ask Google's own public DEMO ad unit and video uses Google's SAMPLE
     VAST tags. It exists only so you can confirm after deployment that the wiring works. It is test traffic: turn it
     off again before real launch. Also needs enabled: true. */
  testMode: false,

  /* Print what is happening to the browser console while the page runs (diagnostics always work with ?adsdebug=1). */
  debug: false,

  /* ---------------------------------------------------------------- stack 'gpt': Google Ad Manager */
  gpt: {
    networkCode: '',                 // your Ad Manager network code, digits only, e.g. '12345678' (Admin > Global settings)
    adUnits: {                       // ad unit CODES you created in Ad Manager (the part after the network code).
      topBanner:    '',              //   e.g. 'sin_top_banner'  (becomes /12345678/sin_top_banner)
      sideRail:     '',              //   300x250
      sideRailTall: '',              //   300x600
      inContent:    ''               //   728x90 desktop, 300x250 phone
    },                               //   A value starting with '/' is used as the full path as written.
    singleRequest: true,             // ask for all slots visible at page load in ONE request (single request architecture)
    collapseEmpty: true,             // slots that get no ad disappear completely
    lazyMarginPx: 300,               // a slot below the fold is requested when it is this close to the screen
    refresh: { enabled: false, seconds: 60, maxPerSlot: 5 },   // auto-refresh. OFF on purpose: it can breach ad policies if misused
    keyValues: {}                    // extra targeting, e.g. { section: 'games' }
  },

  /* ---------------------------------------------------------------- Prebid.js header bidding (stack 'gpt' only) */
  prebid: {
    enabled: false,                  // OFF until you have a Prebid build and bidder accounts
    localBuild: '',                  // file you downloaded from prebid.org/download and put in site/assets/ads/vendor/, e.g. 'vendor/prebid.js'
    scriptUrl: '',                   // OR a full https URL to a Prebid build (used if localBuild is empty)
    timeoutMs: 1200,                 // how long ad requests wait for bids (1000 to 1500 is typical)
    loadTimeoutMs: 1500,             // if the Prebid file itself is slow or missing, ads go ahead without it
    priceGranularity: 'medium',      // 'low' | 'medium' | 'high' | 'auto' | 'dense' or a custom granularity object. Must match your Ad Manager line items.
    bidders: {                       // per slot: a list like [{ bidder: 'rubicon', params: { accountId: 0, siteId: 0, zoneId: 0 } }]
      topBanner: [], sideRail: [], sideRailTall: [], inContent: []       // fill with the params each partner gives you
    },
    userSync: { syncEnabled: true, syncsPerBidder: 5, filterSettings: { iframe: { bidders: '*', filter: 'include' } }, auctionDelay: 0 },
    s2sConfig: null,                 // server-to-server bidding: paste a Prebid Server config object here, or leave null
    consentManagement: {             // passes the visitor's consent to the bidders (your build needs the matching modules)
      gdpr: { cmpApi: 'iab', timeout: 8000, defaultGdprScope: false },   // needs module consentManagementTcf
      usp:  { cmpApi: 'iab', timeout: 100 },                             // needs module consentManagementUsp
      gpp:  { cmpApi: 'iab', timeout: 3000 }                             // needs module consentManagementGpp
    },
    extraConfig: {}                  // anything else you want passed to pbjs.setConfig(), e.g. userSync.userIds
  },

  /* ---------------------------------------------------------------- stack 'adsense': Google AdSense */
  adsense: {
    client: '',                      // 'ca-pub-' followed by 16 digits (AdSense > Account > Settings)
    slots: { topBanner: '', sideRail: '', sideRailTall: '', inContent: '' },   // numeric ad unit ids from AdSense > Ads > By ad unit
    autoAds: false                   // true = also load AdSense on every page so Google's Auto ads (set up inside AdSense) can run.
  },                                 // Careful: Auto ads can add ads wherever Google decides. Use AdSense's page exclusions for pages that must stay clear.

  /* ---------------------------------------------------------------- stack 'managed': managed partner */
  managed: {
    scriptUrl: '',                   // the single https script URL your partner gives you
    waitForConsent: false,           // most partners run their own consent tool; set true to hold their script until the site's consent is resolved
    collapseAfterMs: 8000,           // a container the partner leaves empty after this long is collapsed (no blank boxes)
    allowSiteVideo: false,           // keep false: partners normally forbid other video ad sources
    containers: {                    // the element ids / class names your partner tells you to use for each slot
      topBanner:    { id: '', className: '', attrs: {} },    // attrs example: { 'data-slot-type': 'header' }
      sideRail:     { id: '', className: '', attrs: {} },
      sideRailTall: { id: '', className: '', attrs: {} },
      inContent:    { id: '', className: '', attrs: {} }
    }
  },

  /* ---------------------------------------------------------------- video ads (Google IMA SDK; stack 'gpt' or 'adsense') */
  video: {
    tag: '',                         // a VAST or VMAP tag URL from Ad Manager or a video ad partner, used for everything below if specific ones are empty
    tags: { preroll: '', postroll: '', outstream: '' },
    sdkUrl: 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'
  },
  rail: { unit: 'display', tall: true, narrow: 'hide' },   // unit: 'display' or 'outstream' (small 16:9 video in the rail); narrow: 'hide' or 'inline' below 1200px
  inContent: { enabled: true, max: 2, everyN: 6 },

  /* Conservative on purpose: too many video ads make people leave. */
  frequency: {
    prerollPerGamePerDay: 1,         // before a game
    postrollPerGamePerSession: 1,    // after the results screen
    maxVideoPerHour: 2,              // any kind
    postrollDelayMs: 2500            // wait after the results appear so people see their score first
  },
  skipAfterSeconds: 5,               // Skip button (and Esc) works after this long
  loadTimeoutMs: 8000,               // no ad started after this long: carry on with the game silently
  maxAdSeconds: 60,                  // hard stop for any video ad
  maxVisibleUnits: 3,                // never more than this many ad units in one screenful

  /* ---------------------------------------------------------------- consent */
  consent: {
    /* 'cmp'     (recommended) a certified Consent Management Platform loaded on the page, such as Google Funding Choices.
                 The site waits for it (standard __tcfapi, __uspapi, __gpp) and requests no ads before the visitor's choice is known.
       'builtin' the simple banner in consent.js. A stand-in for testing and for visitors outside Europe ONLY. Not valid for ads in the EEA/UK.
       'none'    you handle consent some other way. */
    provider: 'cmp',
    fundingChoicesPubId: '',         // e.g. 'pub-0000000000000000' (your AdSense publisher id). When set, the site loads Funding Choices for you.
    waitMs: 5000,                    // how long to wait for the CMP to appear. Without one, Europe-like visitors get no ads.
    strictAccept: false,             // true = only request ads when the visitor accepted storing/accessing information (TCF purpose 1)
    storageKey: 'sin-consent-v1',    // (builtin only)
    policyUrl: 'privacy.html',       // (builtin only) relative to the site root
    mode: 'auto'                     // (builtin only) 'auto' | 'always' | 'never'
  }
};
