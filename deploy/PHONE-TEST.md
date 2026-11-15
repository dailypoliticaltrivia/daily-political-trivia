# Test the whole website on your phone

Two ways. **Way A** (same Wi-Fi) is the easy one and needs nothing new installed. **Way B** (a free
https tunnel) works from anywhere and is needed for camera or "Install app" tests and for showing friends.

---

## Way A: same Wi-Fi (about 3 minutes)

1. Phone and PC on the **same Wi-Fi network** (not a "Guest" network; phone Wi-Fi switched on, mobile data does not matter).
2. On the PC open PowerShell in the project folder (the one that holds `START-HERE.md`) and run:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\phone-test.ps1`

3. The window shows a big address like `http://192.168.1.20:8090/` and a **QR code**. A page called `phone-test.html` also opens on the PC with the same code.
4. On the phone open the **Camera**, point it at the QR code, tap the link. (No QR scanning on your phone? Type the address into the phone's browser by hand.)
5. Keep the PC window open while testing. Press **Ctrl+C** in it to stop. Edits to the site appear after a reload on the phone.

### If the phone cannot open the page (the usual cause is the Windows Firewall)
Do this **once**. You run it yourself; the scripts never change Windows settings.

1. Start menu > type `PowerShell` > right-click **Windows PowerShell** > **Run as administrator** > Yes.
2. Paste this line and press Enter:

   `New-NetFirewallRule -DisplayName "Daily Political phone test" -Direction Inbound -Protocol TCP -LocalPort 8090 -Profile Private -RemoteAddress LocalSubnet -Action Allow`

   It lets only devices on your own Wi-Fi reach port 8090, and only when Windows calls the network "Private".
3. If Windows calls your Wi-Fi "Public": Settings > Network and internet > Wi-Fi > your network > **Network profile type: Private**.
4. **When you are done testing, remove the rule** (same Administrator window):

   `Remove-NetFirewallRule -DisplayName "Daily Political phone test"`

If a Windows pop-up asks whether to allow "Node.js" or "PowerShell" on networks, tick **Private networks only**.

### Still blocked?
- **Guest Wi-Fi, hotel or office Wi-Fi, some mesh routers**: they stop devices from talking to each other ("client isolation"). Use the main Wi-Fi, switch off "AP isolation" in the router, or use Way B.
- A **VPN** on the phone or PC can block it: pause the VPN.
- The PC has several addresses (VPN, virtual adapters)? The window lists the others; try one, or run `.\phone-test.ps1 -Ip 192.168.1.20` with the right address.
- "Port in use": a previous window is still open. Close it or run `.\phone-test.ps1 -Port 8091` (then use 8091 in the firewall line too).

### What this test server is (and is not)
It shows only the `site` folder, exactly as it will be published (guides, scripts, backups and developer tools are not served). It cannot change anything, has no developer buttons
and answers only to your own network.
The ordinary `serve.ps1` (port 8080) is separate and stays on your PC only.

---

## Way B: https from anywhere (free tunnel)

Needed for: camera or microphone features, "Install app" prompts (browsers require https), or letting a friend test.
**Nothing is downloaded for you; download only if you decide to.** While a tunnel is open, **anyone who has the link can see your test site**, so close it when you finish.
Start the Way A server first (`phone-test.ps1`), keep its window open, then in a **second** PowerShell window start one of these:

### Cloudflare quick tunnel (no account)
1. Download `cloudflared` for Windows (64-bit) from the official page https://developers.cloudflare.com/tunnel/downloads/ (the file is `cloudflared-windows-amd64.exe`, from https://github.com/cloudflare/cloudflared/releases/latest). Put it in a folder, for example `C:\tools`.
2. In the second PowerShell window: `C:\tools\cloudflared-windows-amd64.exe tunnel --url http://localhost:8090`
3. After a few seconds it prints an address ending in `.trycloudflare.com`. Open it on the phone (or text it to a friend). Press Ctrl+C to close the tunnel.
- Limits (Cloudflare docs): no account or domain needed; each quick tunnel handles up to 200 requests at once; server-sent events are not supported (this site does not use them).
  Docs: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- The address changes every time you start it. It does not update itself on Windows; download again for a new version.

### ngrok (free account needed)
1. Make a free account at https://ngrok.com and download the Windows agent from https://ngrok.com/download.
2. Once: `ngrok config add-authtoken YOUR_TOKEN` (the token is on your ngrok dashboard; keep it private).
3. `ngrok http 8090` then open the `https://...ngrok-free.app` address it shows.
- Free plan limits (ngrok docs): 1 GB data transfer a month, 20,000 requests a month, one automatically assigned address, and a "Visit site" warning page the first time a browser opens it.
  This site loads many small photos, so the 20,000-request limit can run out in a few test sessions; prefer the Cloudflare tunnel.
  Docs: https://ngrok.com/docs/pricing-limits/free-plan-limits and https://ngrok.com/docs/getting-started/

Both tunnels forward only to port 8090 (the read-only test server). The developer refresh endpoint does not exist there and stays reachable only on `localhost:8080` on your PC.

---

## The phone checklist

Do each line. Tick it when the result matches. A short note after each shows what you should see.

How to report a problem: take a **screenshot** (Android: power + volume down; iPhone: side button + volume up), then write: the **page**, what you **tapped**, what you **expected**, what **happened**, the phone model and browser (Chrome, Safari...). Send the screenshot with those lines.

### Before you start
- [ ] Open the address. The Home page loads in a few seconds with no big blank areas.
- [ ] Hold the phone upright. Nothing runs off the right edge; you never have to slide the page sideways.

### Home
- [ ] The bottom tab bar shows Home and Games (Opinions only when it is switched on). Each tab works with a thumb.
- [ ] The four game cards show: Congressional Grid, Dark Horse, Caucus Sort, Capitol Climb, each with "Play today's puzzle", "Continue" or "See results". Tap one: it opens that game. Go back: Home shows the right state.
- [ ] Today's date and the "played today" count are shown. Tap targets are easy to hit with a thumb (nothing tiny).

### Games hub
- [ ] Tap **Games**. Four live games: Congressional Grid, Dark Horse, Caucus Sort, Capitol Climb, and a "coming soon" card. Each card opens its game.

### Congressional Grid
- [ ] Opens with a grid, a score, and today's daily puzzle. The grid fits the screen; rotate the phone and it still fits.
- [ ] Tap an empty cell: a search box appears and the keyboard opens without hiding the box. Type "Smith": names with small photos appear; tap one: the cell fills (or shows that it does not fit the row and column).
- [ ] Photos load as you scroll (small round or square faces). Members without a photo show initials.
- [ ] Switch to the **Presidents** version with the toggle: a different set of rows and columns; presidents' photos appear.
- [ ] Open the **state picker**: choose a state; the puzzle/list updates for that state. Choose another, then back.
- [ ] Finish or give up: a result screen shows. Reload the page: your progress for today is remembered.

### Dark Horse
- [ ] Opens with an intro and a Start button. Seven questions with a 30-second timer. Type an answer: a keyboard shows, the answer box stays visible above it.
- [ ] Submit: you see points based on how common the answer is. After question 7 a final score appears. Reload: it shows you already played today (or your result).

### Caucus Sort
- [ ] A 4 by 4 board of 16 faces. Tap 4 faces to select (they highlight), tap Submit. A right group locks with its title; a wrong one costs a try (four mistakes allowed).
- [ ] Face photos load. Selected tiles are clear in both light and dark mode. At the end a result/share panel shows.

### Opinions
- [ ] Tap **Opinions**. The list of posts (or the empty-state message). If a yellow "Demo mode" note shows, that is expected until Supabase is connected.
- [ ] Open a post: title, author, text, comments and like button show. Text is easy to read without zooming.
- [ ] **Sign up**: tap Sign in (top right) > create account. Enter an email and password. Expected with Supabase and custom email set up: a confirmation email arrives within a minute and the link signs you in. In demo mode: the account is created at once.
- [ ] **Write gate**: signed OUT, open **Write**: you must be asked to sign in first (you cannot write while signed out). Signed IN: the writing page opens, you can type with the keyboard, preview, publish.
- [ ] Add a comment, like a post. Report button shows a confirmation. (Delete your test posts afterwards.)

### About and Privacy
- [ ] **About** (footer link): what the site is and the four games. Links to the four games work.
- [ ] **Privacy** page loads and is readable.
- [ ] Wrong address (for example add `/oops` to the end): the friendly "We could not find that page" appears with links back to Home and Games.

### Phone features
- [ ] **Light and dark mode**: use the half-circle button at the top. The page flips and stays that way after a reload. Also switch the phone itself to dark mode (phone Settings > Display): a fresh page follows it.
- [ ] **Rotate** the phone sideways on Home, a game, and a post: no text cut off, header and footer not hidden behind the camera notch.
- [ ] **Slow network**: walk to the edge of your Wi-Fi range (or switch the phone to mobile data on the live site, in a weak-signal spot). Open a game: it should still appear (portraits may arrive later), nothing should freeze, and a failed load should show a calm message rather than a blank screen.
- [ ] **Add to Home Screen** (works fully after the deployment patch in `deploy/HEAD-PATCH.md` is applied):
  - Android Chrome: menu (three dots) > **Add to Home screen** or **Install app**. Expect the black "DP" icon with a red line and the name "Daily Political". Opening it shows the site with no browser bar. (Over plain `http://` on the Wi-Fi test, Chrome offers only a shortcut; the real "Install app" needs https: use Way B or the live site.)
  - iPhone Safari: **Share** button > **Add to Home Screen**. Same icon and name.
- [ ] **Share preview** (live site only): paste the address into a message to yourself: a card with the "Daily Political Trivia" picture and description appears (after the patch).

### Quick pass/fail summary to send back
Home ___  Games hub ___  Grid ___  Trivia ___  Caucus Sort ___  Opinions read ___  Sign-up ___  Write gate ___  About/Privacy ___  Dark mode ___  Rotate ___  Slow network ___  Home screen ___
