/* Stay Informed News — Opinions backend settings.
   Leave url and anonKey empty and Opinions runs in DEMO MODE on localhost only (a public site shows "coming soon", see "enabled" below).
   To go live, paste your Supabase "Project URL" and "anon public" key here (see supabase/SETUP.md).

   ONLY these two public values belong in this file. The anon key is designed to be public; the database
   rules in schema.sql protect the data. NEVER paste a "service_role" or "secret" key, a database password or
   any other secret here or anywhere in this website folder (run  node tools/check-secrets.js  to check).

   Optional: set google: true to show a "Continue with Google" button, after you have switched Google on in
   Supabase (Authentication > Providers > Google). Leave it false if you did not.

   Optional: enabled controls whether Opinions is shown at all:
     'auto' (default)  Supabase keys set -> real mode. No keys + page on localhost/127.0.0.1 -> demo mode (testing).
                       No keys + any other host (the public site) -> "Opinions are coming soon" page; no demo content,
                       the Opinions nav, home module and sign-in link are hidden, nothing is saved in the browser.
     true              force demo mode even on a public host (only for a private preview).
     false             switch Opinions off everywhere, even when keys are set. The ad-free launch (Phase 0) uses false:
                       the published site then contains no opinions folder and no link to it. To bring Opinions back set
                       enabled to 'auto' (and fill in url and anonKey); steps in DEPLOY.md, section "Bring Opinions back". */
window.SIN_SUPABASE = { url: '', anonKey: '', google: false, enabled: false };
