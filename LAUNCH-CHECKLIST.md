# Launch checklist: Daily Political Trivia, ad-free, no-paperwork launch (Phase 0)

For one non-technical owner. Plain steps, in order. Tick each box as you go. Nothing here costs more than the domain (about $11 to $12 a year).

**What this is:** a site of four daily political games (Congressional Grid, Dark Horse, Caucus Sort, Capitol Climb). There is no news section and nothing on the site is refreshed on a timer: each game picks the day's puzzle in the visitor's browser from their local date. **What "Phase 0" means:** the site launches **ad-free** (no ads, donations, affiliate links or sponsors), with the **Opinions section off**, no LLC and no EIN yet. You run it as an individual in Maryland "doing business as Daily Political Trivia". Background and the reasons are in `legal\README.md`. The longer reference guide behind this checklist is `DEPLOY.md` (same folder).

**Important note about the host:** GitHub's Pages terms discourage using Pages to run an online business. This site is **non-commercial** in Phase 0 (no income of any kind), which is the best fit for Pages. The host can be swapped later (for example to Cloudflare Pages) **without changing the site**, because the site is plain files. Moving to ads means moving to Phase 1 first (section H).

**Words used here:** "the site folder" = the folder named `site` inside your Daily Political Trivia project folder. "PowerShell in the site folder" = open the site folder in File Explorer, click the address bar, type `powershell`, press Enter.

---

## A. Answer and fill in your details (about 15 minutes)

You need one answer: the **domain** you will buy (section B tells you which). **No personal name or county is needed.** The public pages will say the site is run by "an individual in Maryland, doing business as Daily Political Trivia", and the only contact details are the forwarding email addresses from section C. (To publish your name anyway, fill in `ownerName`; see the privacy notes at the end of this section.) You can do this part before or after buying the domain.

- [ ] Open the site folder, then the `tools` folder. Copy `launch-answers.example.json` and rename the copy to **`launch-answers.json`** (same folder).
- [ ] Open it in Notepad. Replace the example values between the quote marks:
  - `ownerName` and `county`: **leave both empty** to stay unnamed (recommended if you do not want to be identifiable).
  - `domain`: the domain, without `https://` and without `www`, for example `dailypoiticaltrivia.com`.
  - `emails`: leave the empty quote marks as they are. The script uses `legal@yourdomain`, `privacy@yourdomain` and so on. Put an address in a line only if you want a different one (for example `"dmca": "copyright@yourdomain.com"`).
  - Leave `date`, `operatorText` and `baseUrl` empty.
- [ ] Save. This file stays on your PC only (it is excluded from the repository).
- [ ] **Do a trial run.** In PowerShell in the site folder, type:
  `node tools/fill-placeholders.js tools/launch-answers.json --dry-run`
  and press Enter. It lists every file and what would change, and changes nothing. Read the list: the domain should be right and the operator line should read "an individual in Maryland, doing business as Daily Political Trivia".
- [ ] If you do not have the domain yet, wait: the script needs it. Run it after section B.

**Staying anonymous: what stays private and what does not**
- **Public pages:** no name, no address, no county. Contact is only the forwarding emails (`legal@` and so on).
- **Domain registration:** the registrar must hold your real details, but **WHOIS privacy / redaction** (on by default at Cloudflare) hides them from the public lookup. Do not turn it off.
- **GitHub:** pick a username that is not your name, keep "Keep my email addresses private" on, and use the **noreply** email in GitHub Desktop (section D). The repository is public, so everything in it and the account name are visible.
- **Still known to the companies you sign up with** (registrar, GitHub, Cloudflare, your email provider) and available to courts through legal process. Being unnamed on the site is not the same as being untraceable.
- **Not covered by this:** a Maryland trade-name registration (if you ever file one), the U.S. Copyright Office DMCA agent registration, and an LLC filing are public records. They are Phase 1 items. A business entity such as an LLC is the usual way to run a public site without putting your personal name on it (using a commercial registered-agent service for the address); see `legal\README.md`.
- This is general information, not legal advice. A one-hour lawyer review (section F step 4) can confirm what applies to you.
- [ ] Later (section F) you run the final version with `--launch`.

## B. Buy the domain, in your own name (about 30 minutes, about $11 to $12 a year)

The suggestions and what was checked are in `legal\domain\DOMAIN-SHORTLIST.md`. Top pick: **`dailypoiticaltrivia.com`**. If it is taken or priced above about $20 a year, check with whoever is helping you before choosing another name (the brand and its legal text assume `dailypoiticaltrivia.com`; `.net` and `.org` of the same name are the closest alternatives, see that file). Check it is still free by typing it into the registrar's search box. **Searching does not buy anything.**

- [ ] Go to **https://www.cloudflare.com/products/registrar/** (Cloudflare Registrar sells at cost). Alternative: **https://porkbun.com**.
- [ ] Create the account with the **dedicated mailbox** from section C (do C step 1 first). Use a long unique password from a password manager.
- [ ] **Turn on two-factor sign-in (2FA) now** with an authenticator app (not text messages). Save the recovery codes somewhere safe that is not only this PC.
- [ ] Search the name and buy it. Registrant = **you**, with your real legal name (it must be accurate), your real email, address and phone. Do **not** buy extras (SSL, "protection", email hosting).
- [ ] Make sure these are on: **WHOIS privacy / redaction** (free, usually on by default; it hides your address from the public lookup), **auto-renew**, **registrar lock**, and **DNSSEC** (Cloudflare: your domain, DNS, DNSSEC, Enable).
- [ ] Within about 15 days **click the verification link** the registrar emails you, or the domain can be suspended.
- [ ] If you bought at Porkbun: add the domain to a free Cloudflare account (dash.cloudflare.com, Add a site, Free plan) and change the nameservers at Porkbun to the two Cloudflare gives you. (Cloudflare Email Routing in section C needs Cloudflare to run the domain's DNS.)
- [ ] Write the registrar name, the date it renews and where the recovery codes are in your notes.
- [ ] Before you buy: read the registrar's "change registrant" help page; in Phase 1 you will move the domain to the LLC.

## C. Email: a mailbox, then free forwarding addresses (about 30 minutes)

1. [ ] **Dedicated mailbox first (before the domain):** make a new free Gmail or Proton account used **only** for this project (registrar, GitHub, Cloudflare, legal mail). Turn on 2FA. Do not use your personal inbox.
2. [ ] **After the domain exists:** in Cloudflare open the domain, then **Email**, then **Email Routing**, then **Get started**. Click to add the records it offers (one click when DNS is at Cloudflare).
3. [ ] Add your dedicated mailbox as the **destination address** and click the verification link Cloudflare emails to it.
4. [ ] Create these **custom addresses**, each forwarding to that destination (the site pages use these names):
   - [ ] `legal@yourdomain`
   - [ ] `privacy@yourdomain`
   - [ ] `dmca@yourdomain` (also add `copyright@yourdomain` if you like; people guess it. If you use it on the site, put it in the `dmca` line of `launch-answers.json`)
   - [ ] `corrections@yourdomain`
   - [ ] `accessibility@yourdomain`
   - [ ] `security@yourdomain`
5. [ ] **Test each one:** send a message from another account to each address and confirm it arrives. (Cloudflare forwards mail in; to reply from the alias you need a sending service, which you can skip at first: reply from the mailbox.)

## D. GitHub: account, repository, publishing (about 1 to 2 hours, mostly waiting for the upload)

Full detail is in `DEPLOY.md` sections 3 to 7. The short version:

- [ ] **Account:** https://github.com, Sign up, with the dedicated mailbox. Verify the email.
- [ ] **2FA:** click your picture, Settings, Password and authentication, Enable two-factor authentication (authenticator app). Save the recovery codes.
- [ ] **Keep your email private (the repository is public):** Settings, Emails, tick **Keep my email addresses private** and **Block command line pushes that expose my email**.
- [ ] **GitHub Desktop:** download from https://desktop.github.com, install, **Sign in to GitHub.com**. In Desktop: File, Options, Git: set **Name** to your GitHub username (not your real name) and **Email** to the **noreply** address GitHub shows you. Every uploaded change carries this name and email publicly, forever, so check both before the first commit. Also run `node tools/check-secrets.js` from the site folder before each upload: it reads `private-terms.txt` in the project folder (never uploaded) and stops you if any word on that list appears in a site file.
- [ ] **Run the fill-in** (section F, steps 1 to 4) **before the first upload**, so the pages go up with your real details. Then continue here.
- [ ] **Make the repository from the site folder:** GitHub Desktop, File, Add local repository, Choose, pick the `site` folder (**the site folder, not the whole project**), click "create a repository", name it with no spaces (for example `daily-political-trivia`), leave Git ignore on **None**.
- [ ] **Check the file list before committing:** if you see anything starting with `.taste-skill`, `.design-backup`, `shots`, `audit`, `people-db`, `news-archive` or a folder named `news`, **stop** and ask your helper. You should **not** see `tools\launch-answers.json`.
- [ ] Commit ("First version"), then **Publish repository**. **Untick "Keep this code private"** (it must be public for free hosting and free automatic jobs). The upload is large (roughly 15,000 files, 200 MB, mostly the portrait photos); expect up to 20 minutes. If it stops, click **Push origin** again.
- [ ] **Check the repository is correct (your helper or you):**
  - Folder `.github/workflows` has one file, `pages.yml` ("Deploy site"). It runs when you push and when you click Run workflow; there is no timer.
  - Every `uses:` line in them ends with a long code and a version comment (they are "pinned" so nobody can swap the action). Do not change them.
  - `.nojekyll` is in the site folder (it is).
  - The deploy step writes a `CNAME` file from the address in `tools/site-config.json` automatically. Nothing for you to type. (GitHub ignores it when you publish with Actions; the custom domain is set in Settings.)
- [ ] **Turn on Pages:** on github.com open the repository, **Settings**, **Pages**, **Build and deployment**, **Source = GitHub Actions**.
- [ ] **Actions tab:** if asked, click **I understand my workflows, go ahead and enable them**. Click **Deploy site**, **Run workflow**, **Run workflow**. Wait 2 to 5 minutes for a green tick. (A first run that failed because Pages was not on yet is fine; run it again.)
- [ ] If the run is **red**, open it and read the red line. The most common reason is a leftover `[PLACEHOLDER]` (the launch gate is doing its job): go back to section A and F.
- [ ] Open the address GitHub shows under Settings, Pages. The site should load.
- [ ] **No "Keep alive" workflow is needed.** It existed to keep the news timer and the Supabase database awake. With no timer and Opinions off there is nothing to keep alive. (To bring it back with Opinions, see `DEPLOY.md` section 0: the file is saved as `supabase/keepalive.yml.example`.)

## E. Point the domain at GitHub (about 20 minutes, then waiting up to a day)

- [ ] **Verify the domain with GitHub first** (stops anyone else claiming it): on github.com click your picture, **Settings**, **Pages**, **Add a domain**, type the domain, then add the **TXT record** it shows in Cloudflare (DNS, Records, Add record, Type TXT) and click Verify.
- [ ] Repository **Settings**, **Pages**, **Custom domain**: type your **bare domain** (for example `dailypoiticaltrivia.com`, no `www`) and **Save**.
- [ ] In Cloudflare, domain, **DNS**, **Records**, **Add record**. Add these, each with the **grey cloud ("DNS only")**:

  | Type | Name | Content |
  |---|---|---|
  | A | `@` | `185.199.108.153` |
  | A | `@` | `185.199.109.153` |
  | A | `@` | `185.199.110.153` |
  | A | `@` | `185.199.111.153` |
  | AAAA | `@` | `2606:50c0:8000::153` |
  | AAAA | `@` | `2606:50c0:8001::153` |
  | AAAA | `@` | `2606:50c0:8002::153` |
  | AAAA | `@` | `2606:50c0:8003::153` |
  | CNAME | `www` | `YOURGITHUBNAME.github.io` (just your username, no repository name) |

  (Those are GitHub's published addresses; check them at the page listed in `legal\domain\DOMAIN-GUIDE.md` section 7A if a year has passed.) **Do not add a `*` wildcard record.** Leave the email records Cloudflare added in section C alone.
- [ ] Wait. In Settings, Pages, wait for **DNS check successful** (minutes to 24 hours).
- [ ] Tick **Enforce HTTPS** (it may take up to 24 hours to appear). `https://yourdomain` now shows a padlock, and `www.yourdomain` forwards to it.

## F. Make the site know its address (about 15 minutes)

Run this **before the first upload if you can**, otherwise now and push again.

1. [ ] Make sure `launch-answers.json` has all three answers (section A).
2. [ ] Final run: in PowerShell in the site folder:
   `node tools/fill-placeholders.js tools/launch-answers.json --launch`
   It fills every `[OPERATOR]`, `[DOMAIN]`, `[COUNTY]`, `[DATE]` and email address, fills `security.txt`, sets `baseUrl` in `tools/site-config.json`, writes the sitemap and share/search tags (`build-sitemap.js` and `apply-head-patch.js` run for you), and stops with **LAUNCH BLOCKED** if any `[BRACKETED]` item is left on a public page. Fix what it lists and run again.
   (If you prefer the manual way: edit `baseUrl` in `tools/site-config.json`, then run `node tools/build-sitemap.js` and `node tools/apply-head-patch.js`, and replace the `YOUR-DOMAIN.example` and `YOUR-` values in `.well-known/security.txt`.)
3. [ ] Run `node tools/predeploy-check.js --launch`. The last line must say **PASS** (warnings about photos or the missing CSP in a source check are fine). Run `node tools/check-secrets.js` too: it must say OK.
4. [ ] Optional: **ask a lawyer for a one-hour review** of the public pages (Privacy, Terms, Copyright, Corrections and data) and of the use of public-figure portraits and the Credits page. Estimated $300 to $800 (see `legal\README.md`). Not required to launch, but advised.
5. [ ] In GitHub Desktop: commit ("Launch details") and **Push origin**. The site republishes in a few minutes.

## G. First-day checks (about 30 minutes)

On the real address, on your **phone** and on the PC:
- [ ] Home, Games, each game, About: they load, scroll, and the **theme button** works. There is **no Opinions menu item and no Sign in link** anywhere, and no News page.
- [ ] The footer links all open: Terms, Privacy, DMCA (Copyright), Credits, Accessibility, Corrections and data. Read the Terms and Privacy pages: your name appears and **no `[square brackets]` are left**.
- [ ] In GitHub, **Actions**, **Deploy site**: the latest run has a green tick.
- [ ] `https://yourdomain/opinions/`: shows the friendly "We could not find that page".
- [ ] `https://yourdomain/robots.txt` and `/sitemap.xml` show your domain, not `example.com`, and the sitemap has no `opinions` lines. `https://yourdomain/.well-known/security.txt` (or `/security.txt`) shows your security email.
- [ ] Share preview: paste the address into a message to yourself (or a free preview checker); a title, description and image appear.
- [ ] Email: send a test to `legal@yourdomain` and `dmca@yourdomain`; both arrive.
- [ ] **Each game on a phone:** open Congressional Grid, Dark Horse, Caucus Sort and Capitol Climb on a real phone (portrait, then sideways). The board fits, buttons are easy to tap, the keyboard does not hide the search box, and a round can be finished.
- [ ] **Progress saves:** play a few moves, reload: the game continues. Home shows "Continue" or "Done today" on that game's card.
- [ ] **The daily puzzle changes at local midnight:** after midnight on your phone's clock (or by setting the phone's date forward one day, then back), reload each game: a new puzzle appears and Home shows "Play today's puzzle" again. The puzzle is picked from the phone's own date, so two people in different time zones can see different days around midnight; that is by design.
- [ ] **Share text:** finish a round in each game and tap Share: the pasted text names the game and the date, has no personal details, and the link in it opens the site.
- [ ] **Dark mode:** use the theme button, then switch the phone itself to dark mode and open a fresh tab: both games and Home are readable (no white boxes, no unreadable text).
- [ ] **404:** `https://yourdomain/this-page-does-not-exist` shows the friendly "We could not find that page" with links to Home and Games.
- [ ] Optional free checks: https://pagespeed.web.dev and https://securityheaders.com.

## H. What NOT to do, and when to move to Phase 1

**Do not, while you are in Phase 0:**
- [ ] No **ads** (leave `enabled: false` in `assets/ads/ads-config.js`), no ad-network application, no `ads.txt`.
- [ ] No **donation, tip, "buy me a coffee", subscription or membership** buttons.
- [ ] No **affiliate links**, **sponsored posts**, free products for coverage, or selling data or email lists.
- [ ] Do **not turn Opinions on** (`opinions/config.js` stays `enabled: false`). It means user content, accounts and moderation.
- [ ] Do not add a newsletter, analytics or any tracking without updating the Privacy page first.
- [ ] Do not accept any money tied to the site. If a payment ever arrives, treat it as income and ask a tax professional.

Why: the first dollar changes your tax position, makes the site commercial (which GitHub Pages' terms discourage), and means Phase 1 should already be done.

**Move to Phase 1 before any of these:** applying to an ad network, switching ads on, any affiliate link, any donation, any sponsorship, or turning Opinions on. Phase 1 = the Maryland LLC, EIN, bank account, registrant change, lawyer hour, DMCA agent registration. Steps and costs are in `legal\README.md`; start about two months ahead (formation can take 6 to 8 weeks). To bring Opinions back see `DEPLOY.md` section 0.

## I. If something goes wrong: rollback plan

- [ ] **A bad change you pushed:** GitHub Desktop, **History** tab, right-click the bad commit, **Revert changes in commit**, **Push origin**. The old version republishes within minutes.
- [ ] **The fill-in script wrote something wrong:** it saved the originals in `scratch\placeholder-backup-...` inside the site folder. Copy them back, fix `launch-answers.json`, and run again.
- [ ] **A red "Deploy site" run:** open it and read the red line. While it is red, the **previous version stays online**.
- [ ] **A complaint about a photo or a fact (copyright, a wrong answer):** remove that photo or fix that entry in the game data, push, and reply from the matching address. The Credits page and the Corrections and data page explain this to visitors.
- [ ] **Emergency "take it offline":** repository **Settings**, **Pages**, **Unpublish site** (bottom of the page). Bring it back by running **Deploy site** again.
- [ ] **Locked out of an account:** use the saved 2FA recovery codes (that is what they are for). Keep them in two places.
- [ ] **Move to another host** (if GitHub ever objects): the published copy is plain files. Cloudflare Pages can serve the same folder; only the DNS records change. Ask your helper; no site changes are needed.

## J. After launch: the routine

- [ ] **Nothing refreshes by itself.** New daily puzzles come from the game data already in the site (each game rolls to the next puzzle at the visitor's local midnight). Look at how many future days of puzzles are left in each game once a month, and add more before they run out.
- [ ] **See if it failed:** github.com, your repository, **Actions** tab. A **green tick** on the latest "Deploy site" run = fine; a **red cross** = open it and read the red line. Turn on GitHub's failure emails: your picture, Settings, Notifications, Actions, tick "Send notifications for failed workflows only". Look at the Actions tab once a week anyway.
- [ ] **Check your legal inbox** (`legal@`, `dmca@`, `privacy@`, `corrections@`) at least weekly and reply within a few days.
- [ ] **Renew the domain:** auto-renew should be on; put the renewal date in your calendar one month early, and keep a card on file that is not about to expire. Never let it lapse.
- [ ] Once a year: read the Privacy and Terms pages again, update the date, and re-check the free-plan limits in `DEPLOY.md`.
- [ ] Every time before you upload changes: `node tools/predeploy-check.js` and `node tools/check-secrets.js`.
