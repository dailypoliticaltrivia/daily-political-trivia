/* Daily Political Trivia — XSS test for the Markdown renderer used on community writing.
   Run:  node tools/test-md.js      (from the site folder)
   Feeds a long list of attack strings through opinions/md.js and checks that the HTML it produces
   contains ONLY the fixed, safe tags (and links only to http/https), no event handlers, no script,
   no javascript: URLs, and no raw "<" or ">" in text. Exits with a non-zero code if anything fails. */
'use strict';
const fs = require('fs');
const path = require('path');
global.window = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'opinions', 'md.js'), 'utf8'))(global.window);
const M = global.window.SINMd;

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<a href="javascript:alert(1)">click</a>',
  '[click](javascript:alert(1))',
  '[click](JaVaScRiPt:alert(1))',
  '[click](  javascript:alert(1))',
  '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[click](vbscript:msgbox(1))',
  '[click](//evil.example/x)',
  '[click](https://example.com/"onmouseover="alert(1))',
  '[click](https://example.com/\' onmouseover=\'alert(1))',
  '[x](https://example.com/a&quot;onmouseover=&quot;alert(1))',
  '[<img src=x onerror=alert(1)>](https://example.com)',
  '[a](https://example.com)<script>alert(1)</script>',
  '![img](https://example.com/x.png" onerror="alert(1))',
  '![x](javascript:alert(1))',
  'https://example.com/"><script>alert(1)</script>',
  'https://example.com/<script>alert(1)</script>',
  'http://a.b/?q="onfocus="alert(1)"autofocus="',
  '`<script>alert(1)</script>`',
  '```\n<script>alert(1)</script>\n```',
  '```html\n</code></pre><script>alert(1)</script>\n```',
  '# <script>alert(1)</script>',
  '## <img src=x onerror=alert(1)>',
  '> <script>alert(1)</script>',
  '- <script>alert(1)</script>',
  '1. <img src=x onerror=alert(1)>',
  '**<script>alert(1)</script>**',
  '*<b onmouseover=alert(1)>x</b>*',
  '__<img src=x onerror=alert(1)>__',
  '<<script>script>alert(1)<</script>/script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<IMG SRC=javascript:alert(&quot;XSS&quot;)>',
  '<body onload=alert(1)>',
  '<style>@import "javascript:alert(1)";</style>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<details open ontoggle=alert(1)>',
  '<form action="javascript:alert(1)"><button>go</button></form>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;alert(1)&#60;/script&#62;',
  '&#x3C;script&#x3E;alert(1)',
  '\u0000<script>alert(1)</script>',
  '\u0000' + '0' + '\u0000',
  '<a href=\'x\' onclick=\'alert(1)\'>x</a>',
  '[a](https://example.com)(javascript:alert(1))',
  '[a]( https://example.com )',
  '[a](https://example.com/)[b](javascript:alert(1))',
  '\\<script>alert(1)\\</script>',
  'Click <a href="https://example.com">here</a>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<input autofocus onfocus=alert(1)>',
  '<video><source onerror="alert(1)"></video>',
  '<base href="javascript:alert(1)//">',
  '"><script>alert(1)</script>',
  '\'><script>alert(1)</script>',
  '`` ` <script>alert(1)</script> ` ``',
  '- [x](javascript:alert(1))',
  '> [x](javascript:alert(1))',
  '[x](https://example.com/a)b](javascript:alert(1))',
  'a'.repeat(5000) + '<script>alert(1)</script>',
  '['.repeat(500) + '](javascript:alert(1))',
  '*'.repeat(500) + '<script>',
  '> '.repeat(50) + '<script>alert(1)</script>',
];

const ALLOWED_PLAIN = /^<\/?(p|h2|h3|h4|strong|em|blockquote|ul|ol|li|pre|code|hr|br|a)>$/;
const ALLOWED_A = /^<a href="https?:\/\/[^"<>'\s]*" rel="nofollow ugc noopener" target="_blank">$/i;

function problems(html){
  const out = [];
  const tags = html.match(/<[^>]*>/g) || [];
  tags.forEach(t => { if (!ALLOWED_PLAIN.test(t) && !ALLOWED_A.test(t)) out.push('unexpected tag: ' + t.slice(0, 80)); });
  const text = html.replace(/<[^>]*>/g, '');
  if (/[<>]/.test(text)) out.push('raw angle bracket in text');
  const hrefs = html.match(/href="[^"]*"/g) || [];
  hrefs.forEach(h => { if (!/^href="https?:\/\//i.test(h)) out.push('bad href: ' + h.slice(0, 60)); });
  if (/\u0000/.test(html)) out.push('NUL leaked into output');
  // no attribute other than the three we generate, on any tag
  tags.forEach(t => { if (/\son\w+\s*=/i.test(t)) out.push('event handler attribute: ' + t.slice(0, 60)); });
  return out;
}

let failed = 0, checks = 0;
function check(name, html){
  checks++;
  const p = problems(html);
  if (p.length){ failed++; console.error('FAIL  ' + name + '\n      ' + p.join('\n      ') + '\n      output: ' + html.slice(0, 200)); }
}
PAYLOADS.forEach((p, i) => {
  const label = JSON.stringify(p.slice(0, 50));
  check('render ' + label, M.render(p));
  check('inline ' + label, M.inline(p));
  check('comment ' + label, M.comment(p));
  check('embedded in a paragraph ' + label, M.render('Some text before.\n\n' + p + '\n\nSome text after.'));
});

// sanity: normal writing still renders as expected (so the tests above are not passing because everything is stripped)
function expect(name, got, wantSubstr){
  checks++;
  if (!got.includes(wantSubstr)){ failed++; console.error('FAIL  ' + name + ': expected ' + JSON.stringify(wantSubstr) + ' in ' + JSON.stringify(got)); }
}
expect('bold', M.render('a **b** c'), '<strong>b</strong>');
expect('italic', M.render('a *b* c'), '<em>b</em>');
expect('heading', M.render('## Title'), '<h2>Title</h2>');
expect('list', M.render('- one\n- two'), '<li>two</li>');
expect('safe link', M.render('[ok](https://example.com/a?b=1&c=2)'), '<a href="https://example.com/a?b=1&amp;c=2" rel="nofollow ugc noopener" target="_blank">ok</a>');
expect('bare link', M.render('see https://example.com now'), 'href="https://example.com"');
expect('script shown as text', M.render('<script>alert(1)</script>'), '&lt;script&gt;');
expect('javascript link not linked', M.render('[x](javascript:alert(1))'), '[x](javascript:alert(1))');

console.log(checks + ' checks, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
