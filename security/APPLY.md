# Applying the security tags (nothing here is live yet)

Plain-language summary: a Content-Security-Policy (CSP) is a rule list the browser enforces: "only run scripts that come from this
site". If someone ever manages to slip a script into a page, the browser refuses to run it. GitHub Pages cannot send HTTP
headers, so the rules travel inside each page as a `<meta>` tag. Because the pages contain inline `<script>` blocks, each page
needs its own list of script fingerprints (hashes). A tool does that for you.

## Step 0: two small code changes first (otherwise a strict CSP breaks the site)

1. `assets/site.js` builds picture tags with `onerror=` / `onload=` attributes. A strict CSP blocks those.
   Apply the ready patch: `audit/security-patches/site.js.patched` (it also fixes the `javascript:` link problem and adds
   frame-busting). To re-create it from the current `site.js` at any time:
   `node audit/security-patches/make-site-js-patch.js --apply` (only when nobody else is editing site.js).
2. (Not applicable now.)
3. Optional but recommended: `audit/security-patches/md.js.patched` (stops a slow-down attack on post pages) and
   `audit/security-patches/db-js-sri.md` (integrity check for the Supabase library).

Check: `node tools/check-security.js` must report **0 failures**.

## Step 1: the referrer tag (safe today, by hand)

Add `<meta name="referrer" content="strict-origin-when-cross-origin">` inside `<head>` of every page (see `csp-snippet.html`).

## Step 2: the CSP (recommended way: automatic, on the built copy)

The CSP is generated from the built copy of the site, never typed by hand:

```
node tools/make-deploy-folder.js "%TEMP%\deploy"          (already part of pages.yml)
node tools/build-csp.js "%TEMP%\deploy"                    (add --ads once ads are on)
```

To switch it on for the real deploy, add this step to `.github/workflows/pages.yml` right after
"Build the clean copy that gets published" and before "Safety check":

```yaml
      - name: Add the Content-Security-Policy tags
        run: node tools/build-csp.js "$RUNNER_TEMP/deploy"
```

(With ads on: `node tools/build-csp.js "$RUNNER_TEMP/deploy" --ads`.) The tool reads `opinions/config.js` and allows
exactly your Supabase address, and nothing when the site is in demo mode.

## Step 3: test it in the browser, with violations reported

1. Build and serve the copy, for example: `node tools/make-deploy-folder.js C:\temp\deploy`, `node tools/build-csp.js C:\temp\deploy`,
   then open that folder with any static server (the project's own `serve.ps1` serves the project root; `npx serve C:\temp\deploy` also works).
2. Open each page with the browser's developer tools open (F12 > Console). A blocked item prints
   "Refused to load/execute ... because it violates the following Content Security Policy directive ...".
   There must be none on: Home, Games hub, the three games, Opinions list, a post, Account,
   Write (type something, use Preview), Admin, About, Privacy, 404.
3. To see violations as data: paste in the console `document.addEventListener('securitypolicyviolation', e => console.log(e.violatedDirective, e.blockedURI))`
   and then use the page.
4. Automated: `node tools/test-xss.js` (attack strings through the real renderers: the Markdown renderer, `SIN.esc` / `SIN.safeHttp` and the games hub).
5. A meta CSP cannot be "report only". If something breaks and you need to roll back quickly, re-run the deploy without the build-csp step.

Already tested during the audit (demo mode, patched site.js): Home, Opinions list, Caucus Sort and Congressional Grid
load and work with the generated policy and print no violations.

## Things that cannot be done on GitHub Pages, and what to do instead

| Header | Why it matters | Option |
|---|---|---|
| `frame-ancestors`, `X-Frame-Options` | stops other sites framing the site (clickjacking) | the frame-busting code in `site.js`; for real protection put Cloudflare in front |
| `Strict-Transport-Security` | forces https | tick "Enforce HTTPS" in Pages settings; Cloudflare "Always Use HTTPS" + HSTS |
| `Permissions-Policy` | switches off camera, microphone, location, payment | Cloudflare response header: `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `X-Content-Type-Options: nosniff` | stops type guessing | Cloudflare response header |
| `Cross-Origin-Opener-Policy: same-origin-allow-popups` | isolates the window | Cloudflare response header (check Google sign-in popups, if ever used) |

Cloudflare free plan: add the domain, then Rules > Transform Rules > Modify Response Header and add the five headers above.
If ads are on, do NOT add `Cross-Origin-Embedder-Policy` (it breaks ads).

## Updating the policy

`tools/build-csp.js` is the single place. Add a new third-party domain only there, and only if you can say what it does.

## Status after the integration pass (Nov 2026)

- Steps 0 and 1 are applied in the site files: patched `site.js`, `md.js`, the Supabase integrity hash, and the referrer tag on every page (also written into every built page by `build-csp.js`).
- Step 2 (the CSP) is now part of `.github/workflows/pages.yml` ("Add the Content-Security-Policy tags", right after the deploy folder is built). Nothing in the editing folder carries a CSP; only the built copy does.
- **Ads and the CSP.** The default policy has no ad vendors. Turning ads on (`assets/ads/ads-config.js` `enabled: true`) requires changing that workflow line to `node tools/build-csp.js "$RUNNER_TEMP/deploy" --ads`, and the policy is looser then (Google Ad Manager, AdSense, the video SDK and Funding Choices may run scripts and frames). Details: `ADS-SETUP.md` section 13. The predeploy check fails if ads are enabled but the pages were not built with `--ads`.
- `ads-status.html` and the `security/` folder are not published (see `tools/deploy-lib.js`).
- `security.txt`: edit `.well-known/security.txt` (replace every `YOUR-...` value). Once no placeholder is left, the deploy publishes it at `/.well-known/security.txt` and at `/security.txt`. GitHub's Pages upload step skips dot-folders, so the root copy is the one that arrives; both are written by `deploy-lib.js`. Until then neither is published.
