#!/usr/bin/env node
'use strict';
/* Makes the link-preview pictures (1200x630) that iMessage, WhatsApp, Slack and social sites show when someone shares a link:
   one for the site and one per game, in each game's colour with its logo. Output: assets/icons/og-image.png and og-<slug>.png.
     node tools/build-og-images.js
   Needs Chrome or Edge installed (it renders a small HTML page headlessly). Re-run after a logo, colour or name change. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const SITE = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(SITE, 'tools', 'site-config.json'), 'utf8'));
const SITE_NAME = cfg.siteName || 'Daily Political Trivia';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const BROWSER = BROWSERS.find(p => fs.existsSync(p));
if (!BROWSER) { console.error('No Chrome or Edge found.'); process.exit(1); }

/* the same game colours as assets/site.css (deep shades, white text) */
const CARDS = [
  { out: 'og-image.png', title: SITE_NAME, kicker: 'Four daily games', line: 'Congress, politics and American history. A new puzzle every day, free, no account.', color: '#1c1e4a', accent: '#ff7a85', logos: ['grid', 'trivia', 'caucus-sort', 'dc-journey'] },
  { out: 'og-congressional-grid.png', title: 'Congressional Grid', kicker: 'Daily puzzle', line: 'Fill nine squares with members of Congress. Rarer picks score better.', color: '#b22234', accent: '#9ec3ff', logos: ['grid'] },
  { out: 'og-dark-horse.png', title: 'Dark Horse', kicker: 'Daily rarity quiz', line: 'Seven questions, 30 seconds each. The rarer your right answer, the more it scores.', color: '#2c2f6b', accent: '#ff7a85', logos: ['trivia'] },
  { out: 'og-caucus-sort.png', title: 'Caucus Sort', kicker: 'Daily puzzle', line: 'Sort 16 politicians into four hidden groups. Four mistakes allowed.', color: '#1f4fa3', accent: '#ff7a85', logos: ['caucus-sort'] },
  { out: 'og-capitol-climb.png', title: 'Capitol Climb', kicker: 'Daily history journey', line: '20 stops across Washington, 3 hearts. All of U.S. history, four choices each.', color: '#7a1f2b', accent: '#9ec3ff', logos: ['dc-journey'] },
];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function logo(id) {
  return fs.readFileSync(path.join(SITE, 'assets', 'logos', id + '.svg'), 'utf8')
    .replace(/<\?xml[^>]*>/, '').replace(/ role="img"| aria-label="[^"]*"/g, '').replace(/<svg /, '<svg aria-hidden="true" ');
}
function page(c) {
  const many = c.logos.length > 1;
  const art = many
    ? '<div class="quad">' + c.logos.map((l, i) => '<span style="background:' + ['#b22234', '#2c2f6b', '#1f4fa3', '#7a1f2b'][i] + '">' + logo(l) + '</span>').join('') + '</div>'
    : '<div class="one">' + logo(c.logos[0]) + '</div>';
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Public+Sans:wght@500;600;700&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:"Public Sans",system-ui,sans-serif;color:#fff;
  background:radial-gradient(90% 120% at 0% 0%,rgba(255,255,255,.16),rgba(255,255,255,0) 55%),repeating-linear-gradient(0deg,rgba(255,255,255,.06) 0 14px,transparent 14px 34px),${c.color};
  display:grid;grid-template-columns:1fr 430px;align-items:center;padding:0 72px 0 80px;gap:40px;--logo-accent:${c.accent}}
.k{font-weight:700;font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:${c.accent};margin-bottom:22px}
h1{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:${c.title.length > 18 ? 84 : 100}px;line-height:.98;letter-spacing:-.02em}
p{font-size:29px;line-height:1.35;margin-top:26px;color:rgba(255,255,255,.88);max-width:20em}
.stars{position:absolute;right:72px;top:44px;font-size:22px;letter-spacing:10px;color:rgba(255,255,255,.55)}
.site{position:absolute;left:80px;bottom:46px;font-weight:600;font-size:22px;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:12px}
.site i{width:28px;height:6px;border-radius:3px;background:${c.accent}}
.one{width:400px;height:400px;border-radius:40px;background:rgba(0,0,0,.18);box-shadow:inset 0 0 0 2px rgba(255,255,255,.14);display:grid;place-items:center;color:#fff}
.one svg{width:250px;height:250px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.3))}
.quad{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.quad span{width:195px;height:195px;border-radius:28px;display:grid;place-items:center;color:#fff;box-shadow:0 10px 30px -12px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.12)}
.quad span:nth-child(1),.quad span:nth-child(4){--logo-accent:#9ec3ff}.quad span:nth-child(2),.quad span:nth-child(3){--logo-accent:#ff7a85}
.quad svg{width:120px;height:120px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.3))}
</style></head><body>
<div><div class="k">${esc(c.kicker)}</div><h1>${esc(c.title)}</h1><p>${esc(c.line)}</p></div>${art}
${c.logos.length > 1 ? '' : '<div class="site"><i></i>' + esc(SITE_NAME) + '</div>'}
<div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
</body></html>`;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
for (const c of CARDS) {
  const html = path.join(tmp, c.out.replace('.png', '.html'));
  fs.writeFileSync(html, page(c));
  const out = path.join(SITE, 'assets', 'icons', c.out);
  execFileSync(BROWSER, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630',
    '--virtual-time-budget=6000', '--user-data-dir=' + path.join(tmp, 'prof'), '--screenshot=' + out, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log('wrote assets/icons/' + c.out + '  ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}
fs.rmSync(tmp, { recursive: true, force: true });
