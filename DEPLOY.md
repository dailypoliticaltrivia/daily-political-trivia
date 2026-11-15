# Putting Daily Political Trivia online (owner's guide)

Written for a non-technical owner. Every step says what to click. Do them in order. Prices and limits
were checked against the providers' own pages in **November 2026**; sources are listed at the bottom.
Plans change, so look at a provider's pricing page before you pay for anything.

> **Launching now? Use `LAUNCH-CHECKLIST.md` (same folder).** It is the click-by-click path for the ad-free, no-paperwork launch (Phase 0).
> This file is the reference behind it. For that launch **skip sections 11 and 12 (Opinions, Supabase, keep-alive) and 13 (Ads)**: they are only
> for when Opinions or ads come back. The site is four daily political games; there is no timer: the "Deploy site" workflow runs only when you push or click **Run workflow**.

## 0. The Opinions switch (read this once)

The Opinions section (accounts, posts, comments) is **OFF** for the ad-free launch. One setting controls it: **`opinions/config.js`, the word `enabled`.**

| `enabled` | Supabase keys | What gets published |
|---|---|---|
| `false` (launch setting) | any | **Nothing about Opinions.** The `opinions` folder, its pages (account, write, admin, guidelines), the Opinions menu items, the home-page module, the sign-in link, the web-app shortcut and the sitemap entries are all left out. Visiting `/opinions/` shows the normal "We could not find that page" page (a real 404, no redirect). The `supabase` folder is never published in either state. |
| `'auto'` | empty | Same as `false` (a public site never shows a half-working section). |
| `'auto'` | filled in | Opinions is live with real accounts. |
| `true` | any | Forced demo mode with fake posts. Private previews only; `predeploy-check.js` warns. |

How it works: `tools/make-deploy-folder.js` builds the folder that is published (the "Deploy site" workflow runs it every time). When Opinions is off it
leaves out the folder, removes every element marked `data-op` from the pages, and sets `OPINIONS_BUILD` to `'off'` in `assets/site.js`. Your source files are
never changed. `node tools/predeploy-check.js` has a check named "Opinions switch" that fails if anything about Opinions would still be published while it is off, and that
works in both states.

### Bring Opinions back (when you are ready, after Phase 1)

Do these in order. Do not skip the first two.
1. **Do Phase 1 of `legal/README.md`** (LLC, DMCA agent registration: $6) and have the pages reviewed by a lawyer. Opinions means user content, accounts and moderation.
2. **Restore the Phase 1 legal pages.** The accounts-and-user-content versions of the Privacy, Terms, Copyright and Corrections pages and the Credits "community" section are saved in `legal/archive-phase1-pages/`. Copy them over the files in `site/`, then fill the placeholders again (`tools/fill-placeholders.js`). The Opinions menu items, home module, About text, Credits section and web-app shortcut are still in the source (marked `data-op`), so they come back by themselves. The page descriptions (home, About, manifest) no longer mention opinion; add the word back if you like.
3. Set up Supabase and email: follow `supabase/SETUP.md` and sections 11 and 12 below (section 12 says how to restore the keep-alive workflow). Paste the project address and public key into `opinions/config.js`.
4. In `opinions/config.js` change `enabled: false` to `enabled: 'auto'`.
5. Run `node tools/predeploy-check.js` (it will complain if the legal pages are still the Phase 0 ones, or if keys are missing), test on your phone, then push. The "Deploy site" workflow publishes Opinions on its next run.

To turn Opinions off again, change `'auto'` back to `false` and push.

---

## 1. The plan in one minute

| Piece | Service | Why |
|---|---|---|
| Hosting the website | **GitHub Pages** (free, public repository) | Free and reliable; the "Deploy site" workflow publishes it every time you push. |
| Building and publishing the site | **GitHub Actions** (free for public repositories) | No computer of yours has to stay on. |
| Your own address (www.yourname.com) | **Cloudflare Registrar** (sold at cost) | Cheapest honest price, free privacy of your name and address. |
| Speed and security headers | **Cloudflare** in front (free, optional) | Free CDN, free security headers. |
| Opinions (accounts, posts, comments) | **Supabase** free plan | Free database and sign-in. |
| Sign-up emails | **Resend** or **Brevo** free plan | Supabase's built-in email sender only sends 2 emails an hour. |
| Ads | Your ad accounts (Google AdSense etc.) | Ads cost nothing to host. |

### What it costs

| Item | One-time | Per month | Notes |
|---|---|---|---|
| GitHub account, repository, Pages hosting | 0 | 0 | Public repository. Soft limits: 1 GB site, 100 GB traffic a month. |
| GitHub Actions (publishing) | 0 | 0 | Free standard runners on public repositories. |
| **Domain name (.com)** | about 10 to 12 USD | **about 1 USD** (billed once a year) | Cloudflare Registrar sells at cost; the .com wholesale price is rising in late 2026, so check the price on the day you buy. |
| Cloudflare (DNS, CDN, security headers) | 0 | 0 | Free plan. |
| Supabase (database, sign-in) | 0 | 0 | Free plan: 500 MB database, 50,000 monthly users, 1 GB files. |
| Sign-up email (Resend or Brevo) | 0 | 0 | Free: Resend 3,000 a month (100 a day); Brevo 300 a day. |
| Ads | 0 | 0 | Ad companies pay you; you pay nothing. |
| **Total** | **about 10 to 12 USD** | **about 1 USD (domain only)** | Everything else is free as long as you stay inside the limits above. |

When would you start paying? Only if you outgrow a free plan (for example more than 50,000 monthly users or
a 500 MB database on Supabase, or far more than 100 GB of traffic a month on GitHub Pages). Those are good
problems to have and you will get a warning first.

You can skip buying a domain while you test: the site works at `https://YOURNAME.github.io/REPO-NAME/`.
**But buy the domain before applying for ads**: ad networks look for `ads.txt` at the root of a domain, and a
`github.io/repo-name/` address does not have a root of its own.

---

## 2. Before you start (on this PC)

1. Open PowerShell in the `site` folder (open the folder in File Explorer, click the address bar, type `powershell`, press Enter).
2. Run: `node tools/predeploy-check.js`
3. Read the last line. **PASS** (warnings are fine) means go ahead. **FAIL** means stop and show the list to your helper.
4. Optional: run `powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-deploy-folder.ps1`. It creates a folder
   `deploy-site` next to `site` containing exactly what will be published. Look inside: there should be no backups,
   no `.ps1` files, no guides, and no folders named `tools`, `audit` or `shots`.

Test it on your phone first: see `PHONE-TEST.md` in this same folder, and `phone-test.ps1` in the project folder.

## 3. Create a GitHub account (with two-factor sign-in)

1. Go to https://github.com and click **Sign up**. Use an email address only you can read. Pick a username (it shows in the free address).
2. Verify your email.
3. **Turn on two-factor authentication now.** Click your picture (top right) > **Settings** > **Password and authentication**
   > **Enable two-factor authentication**. Use an authenticator app on your phone. Save the **recovery codes** somewhere safe (not on this PC only).
   If someone takes over this account they can change your website.

## 4. Install GitHub Desktop

1. Go to https://desktop.github.com and download **GitHub Desktop** for Windows. Run the installer.
2. Open it and click **Sign in to GitHub.com**. Sign in in the browser window that opens.

## 5. Make the repository from the `site` folder

The `site` folder (not the whole project folder) becomes the repository.

1. In GitHub Desktop: **File** > **Add local repository...** > **Choose...** > select the `site` folder.
2. It says "This directory does not appear to be a Git repository". Click **create a repository**.
3. Name: something short with no spaces, for example `daily-political-trivia`. Leave "Git ignore" on **None** (the `site` folder already has a `.gitignore`). Click **Create repository**.
4. The left list now shows the changed files, roughly 11,000 of them (most are the politician photos).
   **Check:** scroll the list. If you see anything starting with `.taste-skill`, `.design-backup`, `shots`, `audit` or `people-db`, stop; the `.gitignore` is not working. Ask your helper.
5. Bottom left, type a summary such as `First version` and click **Commit to main**. This takes a minute or two.

## 6. Publish (upload) it

1. Click **Publish repository** (top bar).
2. **Untick "Keep this code private".** The repository must be **public**: public repositories get free hosting
   and free automatic jobs; private ones do not (a private repository on the free plan gets only a limited monthly allowance).
   Everything in the `site` folder becomes visible to anyone: that is fine, it holds no passwords. The Supabase "anon" key
   you add later is designed to be public.
3. Click **Publish repository**.
4. **The upload takes a while.** About 11,000 files, roughly 150 MB. On a normal home connection expect a few minutes up to about
   20 minutes; GitHub Desktop shows a progress bar. Keep the PC awake and online. If it stops, click **Push origin** again;
   it continues where it left off. This big upload happens only once: later changes are small.

## 7. Turn on GitHub Pages

1. On https://github.com open your repository (GitHub Desktop: **Repository** > **View on GitHub**).
2. **Settings** (top row, right) > **Pages** (left list).
3. Under **Build and deployment**, set **Source** to **GitHub Actions**. (Do not pick "Deploy from a branch": the workflow builds a clean copy, adds the security policy and checks it before publishing.)
4. Click the **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.
5. Click **Deploy site** (left) > **Run workflow** (right) > **Run workflow**. Wait 2 to 5 minutes for a green tick.
   (The upload in step 6 may already have started one that failed because Pages was not on yet: that is fine, run it again.)
6. Back in **Settings** > **Pages** you now see "Your site is live at https://YOURNAME.github.io/REPO-NAME/". Open it.

From now on the **Deploy site** job runs every time you push a change, and by hand (**Run workflow**). It does not run on a timer. If a run ever shows a red cross, open it and read the red line; the previous version stays online.

## 8. Tell the site its real address (once)

1. Open `tools/site-config.json` (Notepad is fine) and set `"baseUrl"` to your address with no slash at the end:
   `https://YOURNAME.github.io/REPO-NAME` for now, or `https://www.yourdomain.com` after step 9.
2. In GitHub Desktop, commit ("Set site address") and click **Push origin**. The sitemap and `robots.txt` pick the address up on the next publish.
3. Ask your helper to apply `deploy/HEAD-PATCH.md` to the pages (phone icon, share previews, search tags). That is a one-time code change.

## 9. Your own domain (about 10 to 12 USD a year)

1. Make a free account at https://dash.cloudflare.com, then **Domain registration** > **Register domains**. Search a name, buy a `.com`.
   (Any registrar works; Cloudflare sells at cost and hides your personal details for free.) Turn on two-factor sign-in there too.
2. **First tell GitHub about the domain** (this prevents someone else claiming it): repository **Settings** > **Pages** > **Custom domain**
   > type `www.yourdomain.com` > **Save**. (Use `www` as the main address; the bare `yourdomain.com` can redirect to it.)
3. In Cloudflare open your domain > **DNS** > **Records** > **Add record**. Make these, and set the cloud to **grey ("DNS only")** for now:

   | Type | Name | Content |
   |---|---|---|
   | CNAME | `www` | `YOURNAME.github.io` (just the username part; no repository name) |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |

   Do not create a wildcard (`*`) record: it is a takeover risk.
4. Wait. GitHub checks the DNS (minutes, sometimes up to 24 hours). In **Settings** > **Pages** wait for "DNS check successful".
5. Tick **Enforce HTTPS** (it can take up to 24 hours to appear). Now `https://www.yourdomain.com` works with the padlock.
6. Update `baseUrl` in `tools/site-config.json` to the new address (step 8), commit and push.
7. Because you publish with GitHub Actions, a `CNAME` file is not needed (GitHub ignores it). `CNAME.template` is only a note.

## 10. Optional: Cloudflare in front (free speed and security headers)

Only after step 9 works and shows the padlock.

1. Cloudflare > your domain > **SSL/TLS** > **Overview** > set encryption mode to **Full (strict)**.
2. **DNS** > click the grey cloud next to each record you made so it turns **orange (Proxied)**. Open your site again to confirm it still loads.
3. **SSL/TLS** > **Edge Certificates** > turn on **Always Use HTTPS**. Turn on **HTTP Strict Transport Security (HSTS)** only once you are sure
   HTTPS works everywhere, because it is hard to undo; start with a short duration.
4. **Rules** > **Transform Rules** > **Modify Response Header** > **Create rule**, for all incoming requests, add (Set static) these headers:
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
   `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: SAMEORIGIN`.
   (GitHub Pages cannot set headers itself, so this is the free way. Do **not** add a `Content-Security-Policy` yet: ads and Supabase need exact
   addresses listed; the security pass will write it.)
5. **Caching**: nothing special is needed. Photos, CSS and JavaScript are cached by Cloudflare's default settings. (After you publish a change, if an old version shows, use **Caching** > **Configuration** > **Purge Everything**.)
6. If anything breaks: turn the clouds back to grey and the site works again straight away.

## 11. The Opinions section (Supabase)

Follow `supabase/SETUP.md` (it has its own click-by-click steps; they are not repeated here). When you finish, the page `opinions/config.js` holds your project address and public key.
After you have a domain, in Supabase set **Authentication** > **URL Configuration** > **Site URL** to your real address, so sign-in links return to the right place.

### Sign-up emails (do this before inviting anyone)

Supabase's built-in email sender is only for testing: it sends **2 emails per hour** and only to members of your own Supabase organisation,
so real visitors would never receive their confirmation email. Use free custom SMTP:

1. **Resend** (resend.com): free plan 3,000 emails a month and **100 a day**; you must own a domain and add the DNS records Resend shows (do it in Cloudflare DNS, set to DNS only).
   Or **Brevo** (brevo.com): free plan 300 emails a day; sending may need a short account approval.
2. In the provider create an **SMTP** login (Resend: **API Keys** gives the password; Brevo: **SMTP & API**).
3. Supabase > **Authentication** > **Emails** (or **Project Settings** > **Authentication** > **SMTP Settings**) > turn on **Custom SMTP** and paste host, port, username, password and a sender such as `no-reply@yourdomain.com`.
4. Supabase then allows 30 emails an hour by default (you can raise it on its Rate Limits page). On Resend's free plan the real ceiling is 100 new sign-ups a day.
5. Keep the SMTP password out of this repository: it goes only into the Supabase dashboard.

## 12. Keep the free database awake

Supabase **pauses free projects after one week without activity** (you can restore from the dashboard, but visitors would see errors meanwhile).
**It is not installed while Opinions is off.** The workflow is saved as `supabase/keepalive.yml.example` (outside the published site). To restore it when Opinions comes back: copy that file to `.github/workflows/keepalive.yml` in the repository and push. It pings the database every Monday and Thursday, and once a month it saves one tiny line to the repository (GitHub switches off scheduled jobs in public repositories after 60 days with no repository activity, which would stop the pings too).

Set it up once:
1. Repository **Settings** > **Secrets and variables** > **Actions** > **Variables** tab > **New repository variable**: Name `SUPABASE_URL`, value = your Project URL (`https://xxxx.supabase.co`).
2. **Secrets** tab > **New repository secret**: Name `SUPABASE_ANON_KEY`, value = the public anon (or publishable) key. This is the same public key that is in `opinions/config.js`. **Never** paste the `service_role` or secret key anywhere.
3. **Actions** tab > **Keep alive** > **Run workflow**. Open the run: "OK: database is awake." If it shows a red cross, the project may already be paused: open Supabase and click **Restore**.

## 13. Ads (later)

All ad settings live in one file, `assets/ads/ads-config.js`. Follow `ADS-SETUP.md` (same folder as this guide). The `ads.txt` file must be reachable at
`https://www.yourdomain.com/ads.txt` (it is, once you use your own domain). Run the check in step 2 again after changing ad files.

## 14. After every deployment: check the live site

1. Open the address on your **phone** and on the PC. Go through `deploy/PHONE-TEST.md` (the short version: Home, each game, About, Credits).
2. Play one round of each game and check Home shows "Done today" for it.
3. Open `https://YOURADDRESS/robots.txt` and `/sitemap.xml`: your real domain, not `example.com`.
4. Open `https://YOURADDRESS/this-page-does-not-exist`: you should see the friendly "We could not find that page".
5. Repository **Actions** tab: the latest **Deploy site** run has a green tick.
6. Optional free tests: https://pagespeed.web.dev and https://securityheaders.com with your address.

## 15. If something goes wrong: roll back

- **A bad change you pushed:** GitHub Desktop > **History** tab > right-click the bad commit > **Revert changes in commit** > **Push origin**. The site republishes the old version within minutes.
- **A bad publish with nothing pushed:** run **Deploy site** by hand to republish the current files.
- **Emergency "take it offline":** repository **Settings** > **Pages** > **Unpublish site** (at the bottom of the page).
- **A change does not show on the live site:** Actions tab > **Deploy site**: is the last run red? Open it, read the red line. Fix it and push again.

## 16. Go-live checklist

Money and accounts
- [ ] GitHub, Cloudflare and Supabase accounts each have two-factor sign-in on; recovery codes saved.
- [ ] Domain bought, auto-renew on, in your own name.

Site
- [ ] `node tools/predeploy-check.js` says PASS.
- [ ] `tools/site-config.json` has the real address; `robots.txt` and `sitemap.xml` show it.
- [ ] `deploy/HEAD-PATCH.md` applied (manifest link, canonical, share tags, `noindex` on account/admin/write pages).
- [ ] Phone checklist (`deploy/PHONE-TEST.md`) done on a real phone, including "Add to Home Screen".
- [ ] HTTPS enforced; the address starts with `https://` and shows a padlock.

Security
- [ ] No passwords or secret keys in the repository (`node tools/check-secrets.js` passes). Only the Supabase **anon/publishable** key and URL appear on the site.
- [ ] Supabase: Row Level Security is on for every table (`supabase/schema.sql` does this; `supabase/rls-tests.sql` tests it).
- [ ] Custom SMTP set up and a real test sign-up email received on an outside address.
- [ ] Supabase **Site URL** and redirect URLs set to the real domain only.
- [ ] Security headers visible at https://securityheaders.com (step 10) and a Content-Security-Policy added by the security pass.
- [ ] `keepalive.yml` copied from `supabase/keepalive.yml.example` into `.github/workflows/`, its variable and secret set; "Keep alive" run is green.
- [ ] Admin: you know which account is the admin (see `supabase/SETUP.md`) and it has a long unique password.
- [ ] Privacy page and About page are filled in; ads (if on) show the consent banner for EU/UK visitors.

---

## Facts and limits behind this plan (sources, checked November 2026)

- **GitHub Pages**: published sites may be no larger than **1 GB**; repository recommended limit **1 GB**; soft bandwidth limit **100 GB/month**;
  soft limit of **10 builds per hour**, which does *not* apply when publishing with a custom GitHub Actions workflow (as here); deployments time out after **10 minutes**.
  https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- **Custom domain DNS records, "Enforce HTTPS", CNAME file ignored with Actions**:
  https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- **Publishing source "GitHub Actions"**:
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- **GitHub Actions cost**: standard GitHub-hosted runners are free for public repositories; private repositories on the Free plan get a monthly dollar allowance instead (about 2,000 Linux minutes by the page's rates).
  https://docs.github.com/en/billing/concepts/product-billing/github-actions
- **Scheduled workflows**: shortest interval 5 minutes, may be delayed at busy times (the start of every hour); **disabled after 60 days with no repository activity** in public repositories;
  events created by the built-in `GITHUB_TOKEN` do not start other workflow runs. (The deploy workflow itself has no schedule.)
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- **Cloudflare Pages (the alternative, not chosen)**: Free plan **500 builds a month**, **20,000 files per site**, **25 MiB per file**, 100 header rules. Our site is about 11,000 files so it fits,
  and builds only happen when you push, far below the 500-build limit. https://developers.cloudflare.com/pages/platform/limits/
- **Supabase free plan**: 500 MB database, 50,000 monthly active users, 1 GB file storage, 5 GB egress, 2 active projects; **free projects are paused after 1 week of inactivity**.
  https://supabase.com/pricing and https://supabase.com/docs/guides/deployment/going-into-prod
- **Supabase built-in email**: only to pre-authorised team addresses, **2 emails per hour**, no guarantee; with custom SMTP the default becomes **30 per hour**.
  https://supabase.com/docs/guides/auth/auth-smtp
- **Resend free**: 3,000 emails a month, 100 a day, 3 domains, SMTP included. https://resend.com/pricing
- **Brevo free**: SMTP relay, 300 emails a day. https://www.brevo.com/free-smtp-server (Brevo's pricing page itself does not state the daily number; a third-party review also mentions account approval and a shared marketing/transactional cap: confirm when you sign up.)
- **Cloudflare Registrar**: sells at cost with no markup, free WHOIS redaction; the page lists no prices. https://www.cloudflare.com/products/registrar/
  Price roughly **10.46 USD/year for .com** per third-party trackers; one tracker says the registry raises its wholesale price on **1 Nov 2026**, which would make it about 11 USD. Check Cloudflare's price at checkout.
- **Cloudflare quick tunnel / ngrok** (phone testing from anywhere): see `deploy/PHONE-TEST.md`.
- **Still to check when the time comes**: GitHub Pages' browser cache time for files (check with `curl -I` after deploy; around 10 minutes is commonly seen).
