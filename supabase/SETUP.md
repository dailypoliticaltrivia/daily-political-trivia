# Turning on the Opinions section (Supabase setup)

Until you finish these steps the Opinions section runs in **demo mode on your own computer (localhost) only**: on the public website it shows an "Opinions are coming soon" page instead (no sample posts, no sign-in; the Opinions menu item and the home page module are hidden). On your computer, demo mode means: accounts and everything people write are saved only in their own browser, and a yellow "Demo mode: accounts live only in this browser" note appears at the top of every Opinions page. Follow these steps once to connect a real, free database so that accounts, posts and comments are shared by everyone.

**The rule this setup enforces:** anyone can *read* Opinions. To *write* a piece, comment, like or report, a person must have an account **and must have confirmed their email address**. This is enforced inside the database itself, not just on the web pages, so it cannot be bypassed by editing the page.

It takes about 20 minutes. You do not need to write any code. You will copy and paste a few things.

---

## Step 1. Create a free Supabase account

1. Go to **https://supabase.com** and click **Start your project**.
2. Sign up (signing in with GitHub is easiest, since your site is already on GitHub).

## Step 2. Create a project

1. Click **New project**.
2. **Name:** anything, for example `stay-informed`.
3. **Database password:** click **Generate a password** and save it in your password manager. The website never needs it. **Never put it in the website files.**
4. **Region:** pick the one closest to most of your readers.
5. Leave the plan on **Free** and click **Create new project**. Wait a minute or two while it sets up.

## Step 3. Turn on email sign-up with confirmation (do this BEFORE the next step)

1. In the left sidebar click **Authentication**, then **Sign In / Providers** (on older dashboards: **Providers**).
2. Click **Email**. Make sure:
   - **Enable Email provider** is **on**.
   - **Confirm email** is **ON**. This is the setting that makes people prove their email address. (Even if you forgot, the database would still refuse to let an unconfirmed account write anything, but they would have no way to confirm, so turn it on.)
   - **Minimum password length** (under Authentication > Policies, or Sign In / Providers > Email, depending on the version): set it to **10**. Leave the "required characters" option at **No requirements**. Length is what matters; forcing symbols just makes people choose "Password1!".
   - If you see **Leaked password protection** (a paid-plan feature on some plans), turn it on.
3. Click **Save**.

## Step 4. Tell Supabase where your website lives (confirmation and reset links)

When someone signs up, Supabase emails them a link. That link must come back to your site.

1. Still under **Authentication**, click **URL Configuration**.
2. **Site URL:** your real website address, for example `https://YOUR-GITHUB-NAME.github.io/YOUR-REPO-NAME/` (or your own domain, such as `https://stayinformednews.com/`).
3. Under **Redirect URLs**, click **Add URL** and add each of these that applies:
   - `https://YOUR-GITHUB-NAME.github.io/YOUR-REPO-NAME/opinions/account.html`
   - If you use your own domain: `https://stayinformednews.com/opinions/account.html`
   - Optional, for testing on your own computer only: `http://localhost:8080/site/opinions/account.html`
   Only list addresses you own. Remove the localhost one when you are done testing.
4. Click **Save**.

*Tip:* Supabase's free built-in email service sends only a few emails per hour, and its messages often land in spam. That is fine to start. Before you launch for real, connect a proper sender under **Authentication > Emails > SMTP Settings** (a free plan from any transactional email service works). Otherwise people signing up may hit the limit and never get their confirmation email.

*Optional but nice:* under **Authentication > Emails**, edit the "Confirm sign up" and "Reset password" messages so they say "Stay Informed News". Leave the `{{ .ConfirmationURL }}` part exactly as it is.

## Step 5. Create the database tables and security rules

1. In the left sidebar, click **SQL Editor**, then **New query**.
2. Open the file `supabase/schema.sql` from your website folder, select everything, copy it, and paste it into the query box.
3. Click **Run**. You should see "Success. No rows returned."

This creates the tables (profiles, posts, comments, likes, reports, plus two private ones for moderator roles and rate limits) and switches on the security rules. **It is safe to run again** whenever the file is updated.

### Check the security rules (strongly recommended)

1. **SQL Editor > New query.** Open `supabase/rls-tests.sql`, copy everything, paste, **Run**.
2. At the bottom you get a results table. The first row must say **ALL ... TESTS PASSED**, and every row should start with PASS.
3. The test creates fake accounts, tries to break the rules (post while signed out, post with an unconfirmed email, edit someone else's piece, make itself an admin, post too fast...), checks that the database refuses, and then deletes the fake accounts. It does not touch your real data. If anything says FAIL, do not launch: send the table to your developer.

## Step 6. Copy your Project URL and public key into the website

1. In the left sidebar, click the **gear icon (Project Settings)**, then **API** (on some versions **Data API**, with keys under **API Keys**).
2. Find these two values:
   - **Project URL** (looks like `https://abcdefghijkl.supabase.co`)
   - **anon public** key (a long piece of text starting with `eyJ...`). Newer dashboards show a **publishable** key (starting `sb_publishable_`) first; if there is a **Legacy API keys** tab, use the **anon public** key from there, as that is the kind of key this site was built for.
3. Open `opinions/config.js` in your website folder and fill in the two values between the quotes:

   ```js
   window.SIN_SUPABASE = { url: 'https://abcdefghijkl.supabase.co', anonKey: 'eyJhbGciOi...the rest of the key...', google: false };
   ```

4. Save the file and upload it to GitHub.

**Only two things ever go in this file: the Project URL and the public anon key.** The anon key is designed to be public (every visitor's browser needs it); your data is protected by the database rules from Step 5, not by hiding the key.

**Never** put any of these in the website folder or on GitHub: the **service_role** key (also called the **secret** key), your **database password**, or any other key or token. The service_role key bypasses all security. If you ever paste one by accident, go to **Project Settings > API** and reset/rotate it immediately.

Before every upload you can run this safety check (double-click your terminal, or ask your developer):

```
node tools/check-secrets.js
```

It prints `OK: no secrets found` or lists exactly what it found.

## Step 7. Make yourself the admin

1. Go to your website's Opinions section, click **Sign in** (top right), then **Create account**. Use a long password.
2. Click the confirmation link in the email Supabase sends you. Sign in.
3. In Supabase open **SQL Editor > New query**, paste this, and replace `your_username` with the username you chose:

   ```sql
   insert into public.user_roles (user_id, role)
     select id, 'admin' from public.profiles where username = 'your_username'
     on conflict (user_id) do update set role = excluded.role;
   ```

4. Click **Run**. Reload your website. You will see a **Moderation queue** link on your account page, and **Remove** buttons on other people's pieces and comments.

Roles live in a private table that the website cannot read or change; the only way to make someone an admin or moderator is this step, in the Supabase dashboard. To add a **moderator** (can remove content and suspend normal users, but cannot suspend other moderators or admins) use `'moderator'` instead of `'admin'`. To remove someone's role: `delete from public.user_roles where user_id = (select id from public.profiles where username = 'their_username');`

## Optional: "Continue with Google"

You can skip this entirely. Email and password already work.

1. In Google Cloud Console create an OAuth client (type: Web application). Add the **Authorized redirect URI** shown in Supabase under **Authentication > Sign In / Providers > Google**.
2. Paste the Google client ID and client secret into that Supabase page (they stay in Supabase, **not** in the website) and switch Google on.
3. In `opinions/config.js` change `google: false` to `google: true` and upload it.

People who use Google are treated as email-confirmed by Google. They still must agree to the guidelines (the page says so next to the button).

## Step 8. What to test after you go live

Do these on the real website, using a private/incognito window for the signed-out checks:

1. **Signed out:** open `opinions/write.html`. You should see "Create an account to write" and no editor. You can still read pieces and comments.
2. **Sign up** with a throwaway email. A password under 10 characters or something like `password123` should be refused with a friendly message.
3. **Before confirming** the email, try to sign in: it should say to confirm your email. Try to publish: it must not work.
4. **Confirm** via the email link. You land on the account page. Click **Write a piece**, publish a short test piece, then edit it, then delete it.
5. **Draft safety:** start writing, sign out in another tab, then press Publish: you should get the gate, and after signing back in your text is still there.
6. **Forgot password:** use the link, check the email arrives, set a new password. Using an email that has no account should show the same "if an account exists..." message (no hint either way).
7. **Two accounts:** with a second account, check you cannot edit or delete the first account's piece (the buttons should not appear).
8. **Comments, likes and Report** work for a confirmed account and ask others to sign in.
9. **Try a hostile piece:** publish a test piece containing `<script>alert(1)</script>` and `[x](javascript:alert(1))`. It must show as plain text and never pop up anything. Delete it afterwards.
10. **Admin:** the Moderation queue appears for your account only. Run `rls-tests.sql` once more after any change to `schema.sql`.

---

## Everyday moderation

- **Reports:** readers can click **Report** on any piece or comment. Open **Account > Moderation queue** to see them. For each report you can **Remove** the content, **Suspend author**, or **Dismiss**.
- **Suspended users** can still read the site but can no longer publish, comment, like, report or edit their profile. You can lift a suspension from their profile page.
- **Built-in limits (enforced in the database):** each person can publish 5 pieces per hour (20 per day), 5 comments per minute (60 per hour), 120 likes per hour and 20 reports per hour. Deleting something does not reset the limit. Titles are limited to 150 characters, subtitles to 250, pieces to 50,000 and comments to 5,000.
- Display names and usernames must be unique.

## Going back to "coming soon" (or demo mode)

Empty the two values in `opinions/config.js` (`url: ''` and `anonKey: ''`) and upload the file again. The public site then shows "Opinions are coming soon"; your Supabase data stays where it is. Demo mode only appears on localhost.

### The `enabled` setting

`opinions/config.js` also has `enabled`: `'auto'` (default: real mode when the keys are set, demo on localhost only, otherwise "coming soon"), `true` (force demo mode even on a public address, for a private preview) or `false` (switch Opinions off everywhere, even with keys).

### Account age

Accounts are for people 18 or older (see the Terms). The sign-up form says so; do not change it without the lawyer.

## Free plan notes

Supabase's free plan **pauses a project after about a week with no activity**. If that happens the Opinions section will show "could not be loaded"; log in to supabase.com and click **Restore project**. Any regular traffic keeps it awake.
