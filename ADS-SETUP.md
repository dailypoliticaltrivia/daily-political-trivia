# Ads: how Daily Political Trivia earns money (owner's guide)

The site is free for everyone and earns from advertising. This guide is written for a non-technical owner.
Nothing here needs you to write code. You only edit one file, `assets/ads/ads-config.js`, when your ad accounts are ready.

**Today everything is switched off.** The site shows no ads, no empty boxes and no labels, anywhere (also not on your own PC),
and it downloads no ad code. Ads start only when you set `enabled: true` AND fill in real ids from your own accounts.

---

## 1. The honest picture first

- **Ad approval is not guaranteed.** Google and the other companies decide, and their rules change. Nobody can promise you an approval date or an income.
- **A site with only a few pages can look "thin" to ad companies.** Google asks for original, high-quality content that you own. The Opinions section, the games and written pages (About, Privacy, a contact page) are what carry you. Build those up before you apply.
- **More ads is not better.** Ad-heavy pages hurt readers (they leave) and hurt approval. The layout here is deliberately light: one banner under the menu, a side column only on wide screens, and a video ad only before or after a game (at most once per game per day before, once per visit after, never more than twice an hour, skippable after 5 seconds, never during play).
- I am not stating any revenue figures: they depend on your traffic, audience country and content, and I have no reliable source for a number that applies to you.

## 2. What the files do

| File | What it does |
|---|---|
| `assets/ads/ads-config.js` | **The only file you edit.** Switch, stack choice, ids, video tags, limits. Comments explain every line. |
| `assets/ads/ads-loader.js` | Reads your settings. If nothing is configured it does nothing at all. If something is, it reserves the space so the page does not jump, then loads the ad code. |
| `assets/ads/ads.js` | The ad engine: Google Ad Manager tags (with optional Prebid header bidding), AdSense, managed-partner containers, video ads, consent waiting, the `?adsdebug=1` report. |
| `assets/ads/ads.css` | How the slots look (small "Advertisement" label, thin lines, light and dark). |
| `assets/ads/consent.js` + `consent.css` | An optional simple privacy banner. A stand-in only (see section 8). Not loaded unless you choose it. |
| `assets/ads/vendor/` | Where you put your Prebid.js build file, if you use header bidding. Empty for now. |
| `ads.txt` | A template list of companies allowed to sell your ad space. Every line is a comment until you put real lines in. |
| `privacy.html` | A **draft** privacy policy. You must fill in the real details and have it checked by a lawyer. |
| `ads-status.html` | A read-only status page: what is configured, what is missing, whether `ads.txt` is reachable. Draws no ads. |
| `assets/ads/INTEGRATION.md` | For the developer: where each snippet goes in the pages. |

## 3. The realistic path to being connected to the ad marketplace

1. **Get the site live on your own domain** (for example `dailypoliticaltrivia.example`), over https. A `github.io` address is fine for testing but ad companies and `ads.txt` expect your own domain. GitHub Pages supports custom domains.
2. **Make enough original content.** Real Opinions posts, the games, About, Privacy, a working contact address. Publish regularly. There is no official fixed number of pages or visitors for Google AdSense; community advice varies a lot, so treat any number you read as a rule of thumb.
3. **Finish the privacy policy** (`privacy.html`) and have it reviewed.
4. **Choose one path** (you can move up later):
   - **A. AdSense (easiest start).** Apply at Google AdSense. Eligibility, from Google: original high-quality content you own, access to the site's HTML, compliance with the AdSense policies, and you must be 18 or older. Set `stack: 'adsense'`.
   - **B. Google Ad Manager (more control, needed for video and header bidding).** Create an Ad Manager network, create the ad units and, for video, a VAST ad tag. Set `stack: 'gpt'`. Ad Manager itself is where advertisers and exchanges bid on your space. You can also add Prebid (section 6) to bring more bidders in.
   - **C. A managed monetisation partner** (Mediavine, Raptive, Ezoic, Freestar, Publift and others). They run the ad stack for you for a revenue share and give you one script to paste. Set `stack: 'managed'`. See section 7 for what they ask of a site.
5. **Set up consent** (section 8) before turning ads on, especially if you have visitors in Europe.
6. **Fill in `ads-config.js`**, replace the `ads.txt` template with the real lines (section 9), set `enabled: true`.
7. **Check it works** (section 10), then watch your reports. A new account may take a while to fill well.

## 4. Where every id goes in `ads-config.js`

| You have | Put it here |
|---|---|
| Ad Manager network code (digits) | `gpt.networkCode` |
| Ad Manager ad unit codes you created | `gpt.adUnits.topBanner`, `sideRail` (300x250), `sideRailTall` (300x600), `inContent` |
| AdSense publisher id `ca-pub-...` | `adsense.client` |
| AdSense ad unit numbers | `adsense.slots.topBanner`, `sideRail`, `sideRailTall`, `inContent` |
| Video ad tag (VAST/VMAP URL) | `video.tag`, or `video.tags.preroll`, `postroll`, `outstream` |
| Managed partner script URL | `managed.scriptUrl`, and their container ids or class names in `managed.containers` |
| Prebid build file / bidders and their ids | `prebid.localBuild` or `prebid.scriptUrl`, `prebid.bidders` |
| Funding Choices publisher id `pub-...` | `consent.fundingChoicesPubId` |

Never type an id you do not have. Leave it `''`. A slot with no valid id is simply not shown.

**Ad sizes used** (and nothing else): top banner 970x90 or 728x90 on desktop, 320x50 or 300x50 on phones; side rail 300x250 and 300x600 (screens 1200px wide and up only); in-content 728x90 on desktop and 300x250 on phones. Slots reserve their size so the page does not jump, load only when near the screen, are labelled "Advertisement", and disappear completely if no ad comes.

**Ad Manager notes.** Slots are requested together as one request for what is on screen at load (single request), and later ones one by one as you scroll. Auto-refresh is OFF (`gpt.refresh.enabled`); only turn it on if you understand Google's refresh rules.

## 5. Video ads

Pre-roll (before a game starts) and post-roll (after the results screen) use the Google IMA SDK with the VAST tag you paste. They appear only after a player action (Start button), never during play. If there is no tag, no ad is available, an ad blocker is on, or nothing starts within 8 seconds, the game simply carries on without any message. The ad window is an accessible dialog: "Advertisement" label, countdown, pause and mute buttons, muted by default, Skip (and Esc) after 5 seconds. Rules you can change in `frequency`: once per game per day before, once per game per visit after, at most 2 video ads per hour.

## 6. Prebid header bidding (optional, advanced)

Header bidding lets several bidders compete for the same ad slot before Google picks the winner. It is switched off (`prebid.enabled: false`).

1. Sign up with the bidders (SSPs) you want and note the ids each gives you.
2. Go to <https://docs.prebid.org/download.html>, pick **your bidders' adapters** and the consent modules (`consentManagementTcf`, `consentManagementUsp`, `consentManagementGpp`), build, and save the file as `assets/ads/vendor/prebid.js`. (Or host it and use `prebid.scriptUrl`.)
3. In `ads-config.js` set `prebid.enabled: true`, `prebid.localBuild: 'vendor/prebid.js'` and fill `prebid.bidders` for each slot with the parameters from each bidder.
4. **In Ad Manager you must create the matching Prebid line items** (price priority, using the same price granularity as `prebid.priceGranularity`). Without them bids are collected but never shown. This step is outside the website; Prebid's documentation covers it.
5. How the site uses it: Google ad requests are held until bids return or the timeout (`prebid.timeoutMs`, default 1200 ms) passes; if the Prebid file is slow or missing, ads go ahead without it. Consent, US privacy and GPP signals are passed through (`prebid.consentManagement`). Server-to-server bidding settings go in `prebid.s2sConfig`.
6. Add each SSP's line to `ads.txt`.
Prebid video (instream) is not wired in this version; video ads use the IMA tag.

## 7. Managed partner mode

Set `stack: 'managed'`, paste the partner's script URL in `managed.scriptUrl`, and enter the container ids/class names they tell you in `managed.containers` (each can also carry attributes). The site then only reserves the layout slots (sized, labelled, collapsed if the partner leaves one empty) and loads the partner script. It does **not** load Google Publisher Tag or Prebid itself, and site video ads stay off (`managed.allowSiteVideo`).

What I could find about eligibility (all from third-party summaries unless stated; these numbers change, so **confirm on each company's own apply page**):

- **Raptive:** reported (Search Engine Journal, Oct 2025) to accept sites from about 25,000 monthly pageviews, with a minimum share of traffic from the US, UK, Canada, Australia and New Zealand, and original high-quality content.
- **Mediavine:** reports disagree (a revenue-based bar of roughly $5,000 a year, or about 50,000 monthly sessions; a lower-traffic "Journey" programme was reported from January 2026).
- **Ezoic:** reported to need about 250,000 monthly visitors for new publishers since early 2026, with a separate entry programme with no traffic requirement.
- **Freestar:** reported to look for around 1 million monthly pageviews and some months of traffic history.
- **Publift:** reported to be revenue-based (about $2,000 a month in existing ad revenue); sources disagree.

At this site's size, AdSense is the realistic first step; partners come after real traffic exists. Partners usually bring their own consent tool and ads.txt lines and often forbid mixing in other ad sources: follow their instructions over this guide.

## 8. Consent (privacy choices): important

- **Google requires a Google-certified consent tool (a CMP that supports the IAB TCF v2.2 standard) for ads shown in the EEA, the UK and (per vendors) Switzerland.** This applies to AdSense, Ad Manager and AdMob. Google offers a free option, **Funding Choices**, inside AdSense / Ad Manager (Privacy & messaging) once your account is approved. Any Google-certified CMP also works.
- **How the site cooperates (default `consent.provider: 'cmp'`).** It waits for the standard browser interface `__tcfapi` (plus `__uspapi` for US Privacy and `__gpp` for the newer Global Privacy Platform). **No ad is requested before the visitor's choice is known** where the law applies. If you enter your Funding Choices publisher id in `consent.fundingChoicesPubId`, the site loads that tool for you. The footer "Privacy choices" link re-opens it. Where a visitor is in a US state with an opt-out signal (US Privacy string or browser Global Privacy Control), the site asks Google for limited data processing.
- **If no consent tool answers**, visitors who look European (timezone or language guess) get no ads; others are treated as outside the rules. That is a safety net, not a legal solution.
- **The built-in banner** (`consent.provider: 'builtin'`, files `consent.js` and `consent.css`) is only a simple stand-in for local testing and for visitors outside the EEA/UK. It is **not** a certified TCF CMP. It guesses Europe from timezone and language, which can be wrong (VPNs, travellers, odd settings), so do not use it for European visitors.
- This is not legal advice. Have your privacy policy and consent setup reviewed.

## 9. `ads.txt`

`ads.txt` is a public list of who may sell your ad space. Buyers skip sellers that are not listed, so it directly affects earnings.

1. When an account is approved, the company shows the exact line(s) to publish (for Google: `google.com, pub-<your id>, DIRECT, f08c47fec0942fa0`).
2. Open `ads.txt`, replace the matching example with the real line, remove the leading `#`, and delete example lines you do not use. Every `YOUR-...` token is a reminder: no line should keep one.
3. It must be served at the **root of your domain**: `https://your-domain.example/ads.txt`. The `site/` folder is the repository root, so a file at `site/ads.txt` is the right place once the site uses your own domain.
4. **Deploy check.** After each deploy open that address in a browser: you should see plain text with your real lines. A simple automatic check in your deployment: fetch `https://your-domain.example/ads.txt`, fail if the request is not successful or the text still contains `YOUR-`. The page `ads-status.html` also checks this.
5. Google says it can take a few days for ads.txt changes to be picked up. Google's AdSense documentation treats ads.txt as strongly recommended; some other partners require it.
6. `app-ads.txt` is a different file only for mobile apps. You do not need it.

## 10. How to test and verify

1. **See what the site would request, without drawing anything.** Add `?adsdebug=1` to any page address and open the browser console (F12). A report lists each slot (ad unit path, sizes, bidders), the consent state, the video tags, which libraries are loaded and any problems ("enabled is false", "networkCode is empty"...).
2. **Open `ads-status.html`** for a plain checklist.
3. **Test mode.** After deployment, set `enabled: true` and `testMode: true`. Display slots then ask Google's public demo ad unit and video uses Google's sample ad tags, so you can see that the wiring works without any account. This is test traffic, not real advertisers. **Turn `testMode` off again before launch.** (It needs `stack: 'gpt'` for display.)
4. **Live diagnostics.** `?adsdebug=console` runs the real ads with Google's publisher console open and Prebid debug on.
5. After going live, in Ad Manager or AdSense check that requests and impressions appear, and in the browser check the Network tab for calls to `securepubads.g.doubleclick.net` (Ad Manager) or `pagead2.googlesyndication.com` (AdSense).
6. **Ad blockers.** With a blocker on, slots disappear completely, video ads are skipped silently and games start at once. To rehearse it on your own PC add `?adsim=blocked` (works only on localhost).

## 11. Policies to respect

- Never click your own ads and never ask others to. Never encourage clicks.
- Ads must be clearly labelled (the site does this) and must not be placed where they can be clicked by accident, over game boards, inside gameplay, or on pages with no real content (account, writing, admin, error and empty pages carry none).
- No ads on prohibited content. Opinions are user-written: moderate them (the report and admin tools exist), because ad companies hold you responsible for content on pages that carry their ads.
- No more than three ad units on one screen; no pop-ups; no ads that trap the visitor.
- Keep the privacy policy true and current. Respect consent and opt-out choices.
- Read the current Google publisher policies and, for partners, their own rules. Policy changes can affect your account.

## 12. Sources I used

- Google AdSense eligibility requirements: <https://support.google.com/adsense/answer/9724>
- Google AdSense program policies (affiliate / value to users): <https://support.google.com/adsense/answer/81904>
- ads.txt in AdSense: <https://support.google.com/adsense/answer/12171244> and <https://developers.google.com/adsense/platforms/direct/ads-txt>
- Google EU User Consent Policy and certified CMPs (Ad Manager help): <https://support.google.com/admanager/answer/9031024> and <https://support.google.com/admanager/answer/13554116>; vendor summaries of the January 16, 2024 deadline (EEA/UK) and Switzerland: <https://www.cookieyes.com/blog/google-certified-cmp-for-tcf/>, <https://usercentrics.com/us/knowledge-hub/google-eu-user-consent-policy/>
- Google Publisher Tag (lazy loading, collapse empty divs, setConfig migration): <https://developers.google.com/publisher-tag/guides/config-migration>, <https://developers.google.com/publisher-tag/samples/collapse-empty-ad-slots>
- Google IMA SDK sample VAST tags: <https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/tags>
- Prebid with GPT (disableInitialLoad, requestBids, setTargetingForGPTAsync, refresh): <https://docs.prebid.org/dev-docs/examples/adunit-refresh.html>
- Prebid consent modules: <https://docs.prebid.org/dev-docs/modules/consentManagementTcf.html>, <https://docs.prebid.org/dev-docs/modules/consentManagementUsp.html>, <https://docs.prebid.org/dev-docs/modules/consentManagementGpp.html>
- Raptive requirements: <https://www.searchenginejournal.com/raptive-drops-traffic-requirement-by-75-to-25000-views/558780/>
- Managed-partner comparisons (third party, figures conflict): <https://newormedia.com/blog/?p=1434>, <https://newormedia.com/blog/?p=1430>, <https://ppc.land/is-your-site-finally-ready-the-new-math-behind-premium-ad-network-approvals/>, <https://www.publift.com/blog/best-freestar-alternatives>
- General AdSense approval guidance (third party, no official page numbers): <https://dev.to/toolbox_starnomina/google-adsense-approval-the-complete-website-checklist-for-2026-2550>

Not independently verified here: AdSense's exact "restricted data processing" mechanics for US states (set the US state regulations messaging inside your AdSense or Ad Manager account), Funding Choices' exact snippet (use the one your account shows if it differs), and the live behaviour of the AdSense and managed-partner paths, which need your real accounts.

## 13. Switching ads on also means rebuilding the security policy (important)

The published site carries a strict Content-Security-Policy (CSP): a rule list in every page that says which other websites the page may load code from. It is written by `tools/build-csp.js` during each deploy (a step in `.github/workflows/pages.yml`). **By default the policy allows no ad companies at all**, which is exactly right while ads are off. If you set `enabled: true` and leave the policy as it is, the browser will silently block Google's ad code and **no ad will appear**, even though everything else looks correct.

To enable ads, do both:

1. In `assets/ads/ads-config.js` set `enabled: true` (and your ids).
2. In `.github/workflows/pages.yml` change the step "Add the Content-Security-Policy tags" to
   `run: node tools/build-csp.js "$RUNNER_TEMP/deploy" --ads`
   (to try it by hand: `node tools/build-csp.js <built folder> --ads`). `tools/predeploy-check.js` fails the deploy when ads are enabled but the built pages were not built with `--ads`, so you cannot forget.

Honest consequence: with `--ads` the policy is **looser**. It then lists about ten Google domains that may run scripts and load frames (Ad Manager, AdSense, the video SDK, Funding Choices), allows images, video and connections to broader sets of addresses, and allows `blob:` workers. Google itself says a fixed allow-list can stop working without notice, and a static site cannot use the stricter per-request "nonce" method. So the protection against a script slipped into a page is weaker whenever ads are on. Keep the Opinions section moderated, keep ads off the writing/account/admin pages (already so), and after switching ads on open each page type with the browser console open (F12): any "Refused to load ..." line names a domain the policy still needs. If an ad network (Prebid bidders, a managed partner) needs more domains, add them only in `tools/build-csp.js`, and only if you can say what each one does.
