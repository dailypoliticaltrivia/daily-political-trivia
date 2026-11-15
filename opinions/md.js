/* Stay Informed News — safe Markdown renderer for community writing.
   window.SINMd = { render(markdown) -> html, inline(text) -> html, comment(text) -> html }
   Safety model: every piece of user text is HTML-escaped FIRST; the renderer then only ever emits
   its own fixed tags (p, h2-h4, strong, em, a, blockquote, ul, ol, li, pre, code, hr, br).
   Links are allowed only for http:// and https:// URLs and always get rel="nofollow ugc noopener".
   No raw user HTML is ever passed through, and no attributes other than href/rel/target are produced. */
(function(){
  'use strict';
  const MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => MAP[c]);
  const unesc = s => s.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp:'&', lt:'<', gt:'>', quot:'"', '#39':"'" }[e]));
  const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

  function link(url, text){
    return '<a href="' + esc(url) + '" rel="nofollow ugc noopener" target="_blank">' + text + '</a>';
  }
  function emph(s){
    return s
      .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/__(?=\S)([^_\n]*?\S)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, '$1<em>$2</em>');
  }
  // input: raw user text (one block). output: safe HTML.
  function inline(raw){
    let s = esc(String(raw == null ? '' : raw).replace(/\u0000/g, ''));
    const slots = [];
    const hold = html => '\u0000' + (slots.push(html) - 1) + '\u0000';
    s = s.replace(/`([^`\n]+)`/g, (m, c) => hold('<code>' + c + '</code>'));
    // SECURITY: bounded lengths. An unbounded [^\]\n]+ is quadratic on "[[[[[[..." (50,000 characters froze a browser for seconds).
    s = s.replace(/\[([^\]\n[]{1,300})\]\(([^)\s]{1,2000})\)/g, (m, text, url) => {
      const u = unesc(url);
      return SAFE_URL.test(u) ? hold(link(u, emph(text))) : m;        // unsafe scheme: left as plain text
    });
    s = s.replace(/https?:\/\/[^\s\u0000<]+/gi, m => {                  // bare links
      let url = m, tail = '';
      for (;;){
        const t = url.match(/(&quot;|&#39;|&gt;|&lt;|[.,;:!?)\]])$/);
        if (!t) break;
        tail = t[0] + tail; url = url.slice(0, -t[0].length);
      }
      const u = unesc(url);
      return SAFE_URL.test(u) ? hold(link(u, url)) + tail : m;
    });
    s = emph(s);
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => slots[+i]);
  }

  const RE = {
    blank: /^\s*$/, fence: /^\s{0,3}```/, head: /^\s{0,3}(#{1,6})\s+(.*)$/, hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
    quote: /^\s{0,3}>/, ul: /^\s{0,3}[-*+]\s+(.*)$/, ol: /^\s{0,3}\d{1,9}[.)]\s+(.*)$/
  };
  const startsBlock = l => RE.fence.test(l) || RE.head.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.ul.test(l) || RE.ol.test(l);

  function render(src, depth){
    depth = depth || 0;
    const lines = String(src == null ? '' : src).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0, m;
    while (i < lines.length){
      const line = lines[i];
      if (RE.blank.test(line)){ i++; continue; }
      if (RE.fence.test(line)){
        const buf = []; i++;
        while (i < lines.length && !RE.fence.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if ((m = line.match(RE.head))){
        const lvl = Math.min(Math.max(m[1].length, 2), 4);     // # and ## -> h2, ### -> h3, #### and deeper -> h4 (h1 is the page title)
        out.push('<h' + lvl + '>' + inline(m[2].replace(/\s+#+\s*$/, '')) + '</h' + lvl + '>');
        i++; continue;
      }
      if (RE.hr.test(line)){ out.push('<hr>'); i++; continue; }
      if (RE.quote.test(line)){
        const buf = [];
        while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        out.push('<blockquote>' + (depth < 3 ? render(buf.join('\n'), depth + 1) : '<p>' + inline(buf.join(' ')) + '</p>') + '</blockquote>');
        continue;
      }
      const lt = RE.ul.test(line) ? 'ul' : RE.ol.test(line) ? 'ol' : null;
      if (lt){
        const re = RE[lt], items = [];
        while (i < lines.length){
          const l = lines[i];
          if ((m = l.match(re)) && !RE.hr.test(l)){ items.push(m[1]); i++; continue; }
          if (!RE.blank.test(l) && /^\s+\S/.test(l) && items.length && !startsBlock(l)){ items[items.length - 1] += ' ' + l.trim(); i++; continue; }
          break;
        }
        out.push('<' + lt + '>' + items.map(t => '<li>' + inline(t) + '</li>').join('') + '</' + lt + '>');
        continue;
      }
      const buf = [];
      while (i < lines.length && !RE.blank.test(lines[i]) && !(buf.length && startsBlock(lines[i]))){ buf.push(lines[i].trim()); i++; }
      out.push('<p>' + inline(buf.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  // comments: paragraphs + line breaks + inline formatting only
  function comment(src){
    return String(src == null ? '' : src).replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)
      .map(p => '<p>' + p.split('\n').map(inline).join('<br>') + '</p>').join('');
  }

  window.SINMd = { render: s => render(s, 0), inline, comment, esc };
})();
