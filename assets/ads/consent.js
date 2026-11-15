/* Daily Political Trivia - lightweight consent banner and "Privacy choices" panel.
   STAND-IN for local testing and for visitors outside Europe. Google requires a Google-certified IAB TCF v2.2
   consent tool for ads served in the EEA, UK and Switzerland: see ADS-SETUP.md ("Consent").
   Loaded by ads-loader.js before ads.js; ads.js calls SIN_CONSENT.start() when ads are active.
   Exposes window.SIN_CONSENT = { required(), get(), set(ads, limited), open(focusLimit), reset(), simulate(v) }. */
(function(){
  if (window.SIN_CONSENT) return;
  var cfg = (window.SIN_ADS_CONFIG && window.SIN_ADS_CONFIG.consent) || {};
  var KEY = cfg.storageKey || 'sin-consent-v1';
  var SIMKEY = 'sin-consent-sim';
  var policy = cfg.policyUrl || 'privacy.html';
  var isDev = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname) || /\.localhost$/.test(location.hostname) || location.protocol === 'file:';

  function ls(op, k, v){ try { return op === 'get' ? localStorage.getItem(k) : op === 'set' ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch(e){ return null; } }
  function ss(op, k, v){ try { return op === 'get' ? sessionStorage.getItem(k) : op === 'set' ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch(e){ return null; } }

  /* ---- Is consent required here? A heuristic. Limits are documented in ADS-SETUP.md. ----
     Over-inclusive on purpose: any Europe/* timezone (also includes non-EU places such as Moscow or Istanbul),
     Cyprus, Iceland, Canary/Madeira/Azores, EU outermost regions, plus language tags with an EEA/UK/CH country. */
  var TZ = /^(Europe\/|Asia\/(Nicosia|Famagusta)$|Atlantic\/(Reykjavik|Canary|Madeira|Azores)$|America\/(Martinique|Guadeloupe|Cayenne|Marigot|St_Barthelemy)$|Indian\/(Reunion|Mayotte)$)/;
  var REGIONS = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' ');
  function guessRegion(){
    try { if (TZ.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '')) return true; } catch(e){}
    try {
      var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < langs.length; i++){ var m = /[-_]([A-Za-z]{2})\b/.exec(langs[i] || ''); if (m && REGIONS.indexOf(m[1].toUpperCase()) > -1) return true; }
    } catch(e){}
    return false;
  }
  function required(){
    var mode = cfg.mode || 'auto';
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    if (isDev && ss('get', SIMKEY) === 'eu') return true;
    return guessRegion();
  }

  function read(){ try { var r = JSON.parse(ls('get', KEY) || 'null'); return r && (r.ads === 'granted' || r.ads === 'denied') ? r : null; } catch(e){ return null; } }
  function gpc(){ return navigator.globalPrivacyControl === true; }      // browser "Global Privacy Control" counts as opting out of sale/sharing
  var listeners = [];
  function get(){
    var r = read();
    return { required: required(), status: r ? r.ads : 'unknown', limited: !!(r && r.limited) || gpc(), ts: r ? r.ts : 0 };
  }
  function notify(){ var s = get(); listeners.forEach(function(f){ try { f(s); } catch(e){} }); try { window.SIN_ADS && window.SIN_ADS.setConsent(s); } catch(e){} }
  function set(ads, limited){
    if (ads !== 'granted' && ads !== 'denied') ads = 'denied';
    ls('set', KEY, JSON.stringify({ ads: ads, limited: !!limited, ts: Date.now() }));
    notify();
  }

  /* ---- UI ---- */
  var banner = null, panel = null, started = false, lastFocus = null;
  function el(tag, attrs, html){ var e = document.createElement(tag); for (var k in (attrs||{})) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function polUrl(hash){ try { var b = (window.SIN && window.SIN.base) || new URL('../../', document.currentScript ? document.currentScript.src : location.href).href; return new URL(policy, b).href + (hash || ''); } catch(e){ return policy; } }
  function toMain(){ var m = document.getElementById('main'); if (m){ m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); } }

  function showBanner(){
    if (banner || panel) return;
    banner = el('div', { 'class': 'sin-consent', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'sinCsT', 'aria-describedby': 'sinCsD' },
      '<div class="sin-consent__txt"><p class="sin-consent__t" id="sinCsT">Ads keep this site free</p>' +
      '<p class="sin-consent__d" id="sinCsD">We would like to show advertising, which uses cookies and similar technology from our ad partners. Everything on the site stays free whichever you choose. <a href="' + polUrl('#ads') + '">Privacy policy</a></p></div>' +
      '<div class="sin-consent__btns"><button type="button" class="sin-consent__btn" data-v="denied">Reject</button><button type="button" class="sin-consent__btn" data-v="granted">Accept</button></div>');
    banner.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('button[data-v]'); if (!b) return;
      var wasFocus = banner.contains(document.activeElement);
      set(b.getAttribute('data-v'), get().limited);
      banner.remove(); banner = null;
      if (wasFocus) toMain();
    });
    document.body.insertBefore(banner, document.body.firstChild);   // first in tab order, so keyboard users meet it immediately
  }

  function open(focusLimit){
    if (panel) return;
    if (banner){ banner.remove(); banner = null; }
    var s = get();
    lastFocus = document.activeElement;
    panel = el('dialog', { 'class': 'sin-consent-panel', 'aria-labelledby': 'sinCpT' });
    panel.innerHTML =
      '<form method="dialog" class="sin-consent-panel__in">' +
      '<h2 id="sinCpT">Privacy choices</h2>' +
      '<p>Advertising pays for this site, so it stays free. You decide whether advertising cookies and similar technology may be used. Your choice is saved in this browser and you can change it here at any time.</p>' +
      '<fieldset><legend>Advertising cookies</legend>' +
      '<label class="sin-consent-panel__opt"><input type="radio" name="sinAds" value="granted"' + (s.status === 'granted' ? ' checked' : '') + '> Allow advertising cookies</label>' +
      '<label class="sin-consent-panel__opt"><input type="radio" name="sinAds" value="denied"' + (s.status !== 'granted' ? ' checked' : '') + '> Reject advertising cookies</label></fieldset>' +
      '<label class="sin-consent-panel__opt sin-consent-panel__lim"><input type="checkbox" name="sinLim"' + (s.limited ? ' checked' : '') + '> Do not sell or share my personal information (limited data processing, for US visitors)</label>' +
      (gpc() ? '<p class="sin-consent-panel__note">Your browser sends a Global Privacy Control signal, which we treat as this choice.</p>' : '') +
      '<p class="sin-consent-panel__note"><a href="' + polUrl('#ads') + '">Read the privacy policy</a></p>' +
      '<div class="sin-consent__btns"><button type="button" class="sin-consent__btn" data-x="cancel">Cancel</button><button type="submit" class="sin-consent__btn sin-consent__btn--save" data-x="save">Save choices</button></div>' +
      '</form>';
    document.body.appendChild(panel);
    function close(){
      if (!panel) return; var p = panel; panel = null;
      try { p.close(); } catch(e){}
      p.remove();
      if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch(e){} } else toMain();
    }
    panel.addEventListener('close', function(){ if (panel === this) { panel.remove(); panel = null; } });
    panel.querySelector('[data-x=cancel]').addEventListener('click', close);
    panel.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault();
      var f = this, v = f.elements.sinAds.value, lim = f.elements.sinLim.checked;
      set(v, lim);
      if (window.SIN && SIN.toast) SIN.toast('Privacy choices saved');
      close();
    });
    if (typeof panel.showModal === 'function') panel.showModal(); else panel.setAttribute('open', '');
    (focusLimit ? panel.querySelector('[name=sinLim]') : panel.querySelector('input[name=sinAds]:checked')).focus();
  }

  function wireLinks(){
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('[data-sin-privacy-choices],[data-sin-limit-data]');
      if (!a) return;
      e.preventDefault();
      open(a.hasAttribute('data-sin-limit-data'));
    });
    var nodes = document.querySelectorAll('[data-sin-ads-only]');
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = false;
    var links = document.querySelectorAll('[data-sin-privacy-choices],[data-sin-limit-data]');
    for (var j = 0; j < links.length; j++) links[j].hidden = false;
  }

  /* Called by ads.js once it knows ads are active on this page. Without ads there is nothing to ask about. */
  function start(){
    if (started) return; started = true;
    wireLinks();
    var qs = new URLSearchParams(location.search);
    if (isDev && qs.get('consent') === 'show') { showBanner(); return; }
    var s = get();
    if (s.required && s.status === 'unknown') showBanner();
  }

  window.SIN_CONSENT = {
    required: required, get: get, set: set, open: open, start: start,
    onChange: function(f){ listeners.push(f); },
    showBanner: showBanner,
    reset: function(){ ls('remove', KEY); if (banner){ banner.remove(); banner = null; } notify(); if (get().required && started) showBanner(); },
    simulate: function(v){ if (!isDev) return; if (v) ss('set', SIMKEY, v); else ss('remove', SIMKEY); }
  };
})();
