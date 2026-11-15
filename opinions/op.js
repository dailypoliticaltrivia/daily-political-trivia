/* Stay Informed News — small helpers shared by the Opinions pages. window.OP
   Load order on every Opinions page: ../assets/site.js, config.js, db.js, md.js, op.js, then the page script. */
(function(){
  'use strict';
  const esc = SIN.esc;
  const ICON = {
    heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    heartFill: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    comment: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 20l1.1-4.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    flag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>'
  };
  const COLORS = ['#0a2a5c','#b22234','#17643f','#8a5d0b','#5b3a8c','#1f6f8b','#7a2e46','#3d5a1f'];
  function avatar(p, size){
    p = p || {};
    const name = String(p.display_name || p.username || '?').trim();
    const ini = name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?';
    let h = 0; const k = String(p.id || p.username || name); for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return '<span class="op-av' + (size ? ' ' + size : '') + '" style="background:' + COLORS[h % COLORS.length] + '" aria-hidden="true">' + esc(ini) + '</span>';
  }
  const param = n => new URLSearchParams(location.search).get(n);
  const fmtDate = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const when = d => { const t = (Date.now() - new Date(d)) / 864e5; return t < 7 ? SIN.timeAgo(d) : fmtDate(d); };
  const authorUrl = a => a && a.username ? 'author.html?u=' + encodeURIComponent(a.username) : '#';
  const postUrl = id => 'post.html?id=' + encodeURIComponent(id);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function byline(a){
    return a && a.username ? '<a href="' + authorUrl(a) + '">' + esc(a.display_name) + '</a>' : '<span>' + esc((a && a.display_name) || 'Former member') + '</span>';
  }
  function feedItem(p){
    return '<li class="op-item">' +
      (p.tags && p.tags.length ? '<div class="op-tagrow">' + p.tags.slice(0, 3).map(t => '<a class="pill" href="index.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>').join('') + '</div>' : '') +
      '<h2 class="t"><a href="' + postUrl(p.id) + '">' + esc(p.title) + '</a></h2>' +
      (p.excerpt ? '<p class="s">' + esc(p.excerpt) + '</p>' : '') +
      '<div class="op-by">' + avatar(p.author) + byline(p.author) + '<span aria-hidden="true">·</span><time datetime="' + esc(p.published_at) + '">' + esc(when(p.published_at)) + '</time><span aria-hidden="true">·</span><span>' + p.reading_minutes + ' min read</span></div>' +
      '<div class="op-stats"><span title="Likes">' + ICON.heart + p.like_count + '<span class="sr-only"> likes</span></span><span title="Comments">' + ICON.comment + p.comment_count + '<span class="sr-only"> comments</span></span></div>' +
    '</li>';
  }

  function demoBanner(target){
    if (SINDb.mode !== 'demo') return;
    const el = document.createElement('div');
    el.className = 'notice warn op-demo';
    el.setAttribute('role', 'note');
    el.innerHTML = ICON.warn + '<div><b>Demo mode: accounts live only in this browser.</b> Pieces, comments and sign-ups are saved on this device only. Sample content is fictional. Nothing is shared with other visitors until the site owner connects Supabase.</div>';
    (target || document.querySelector('#main .wrap') || document.getElementById('main')).prepend(el);
  }

  // Report dialog (posts and comments). Returns a promise that resolves true when sent.
  function report(type, id){
    return SINDb.getUser().then(u => {
      if (!u){ SIN.toast('Please sign in to report.'); location.href = 'account.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return false; }
      return new Promise(resolve => {
        const d = document.createElement('dialog');
        d.className = 'op-dialog';
        d.innerHTML = '<form method="dialog"><h2>Report this ' + (type === 'post' ? 'piece' : 'comment') + '</h2>' +
          '<p class="meta" style="margin:0">Reports go to the site moderators. Tell us what is wrong.</p>' +
          '<div class="opts">' + ['Spam or advertising','Harassment or hate','Threats or violence','False or misleading','Personal information','Something else']
            .map((r, i) => '<label><input type="radio" name="why" value="' + r + '"' + (i ? '' : ' checked') + '> ' + r + '</label>').join('') + '</div>' +
          '<label for="opRepNote">Details (optional)</label><textarea id="opRepNote" maxlength="800" style="min-height:70px"></textarea>' +
          '<div class="row"><button class="btn ghost" value="cancel" type="submit">Cancel</button><button class="btn red" value="send" type="submit">Send report</button></div></form>';
        document.body.appendChild(d);
        d.addEventListener('close', async () => {
          const ok = d.returnValue === 'send';
          const why = (d.querySelector('input[name=why]:checked') || {}).value || 'Other';
          const note = d.querySelector('textarea').value.trim();
          d.remove();
          if (!ok) return resolve(false);
          try { await SINDb.report({ target_type: type, target_id: id, reason: why + (note ? ': ' + note : '') }); SIN.toast('Thanks. The moderators will review it.'); resolve(true); }
          catch (e){ SIN.toast(e.message); resolve(false); }
        });
        d.showModal();
      });
    });
  }

  function counter(input, out, max){
    const upd = () => { const n = input.value.length; out.textContent = n.toLocaleString() + ' / ' + max.toLocaleString(); out.classList.toggle('over', n > max); };
    input.addEventListener('input', upd); upd();
  }
  // only allow returning to a page inside this folder (prevents open redirects via ?next=)
  function safeNext(n){ return n && /^[a-z]+\.html(\?[\w=&%.\-]*)?$/i.test(n) ? n : null; }

  // The "you need an account" panel shown instead of the editor (and reused for unconfirmed emails).
  // u = current user or null. Returns an HTML string; the caller puts it on the page.
  function writeGate(u, next){
    const n = encodeURIComponent(next || 'write.html');
    if (!u) return '<div class="notice op-gate" style="max-width:560px"><h2 style="font-family:var(--serif);margin:0 0 6px">Create an account to write</h2>' +
      '<p style="margin:0 0 12px">Anyone can read and share pieces here. To publish your own, you need a free account with a confirmed email address. It takes a minute, and anything you have already typed is kept safe.</p>' +
      '<a class="btn red" href="account.html?mode=signup&next=' + n + '">Create account</a> <a class="btn ghost" href="account.html?next=' + n + '">Sign in</a></div>';
    if (u.verified === false) return '<div class="notice warn op-gate" style="max-width:560px"><h2 style="font-family:var(--serif);margin:0 0 6px">Confirm your email to write</h2>' +
      '<p style="margin:0 0 12px">You are signed in as <b>' + esc(u.email || u.display_name) + '</b>, but that email address has not been confirmed yet. Open the confirmation message we sent you, then come back to this page.</p>' +
      '<a class="btn" href="account.html?next=' + n + '">Go to my account</a></div>';
    if (u.is_banned) return '<div class="notice warn">Your account has been suspended, so you cannot publish. Contact the site owner if you think this is a mistake.</div>';
    return '';
  }

  /* Opinions switched off (public site without Supabase keys, or enabled:false in config.js): show a clean
     "coming soon" page instead of the page's own content, and tell the page script to do nothing. */
  if (window.SINDb && SINDb.mode === 'off'){
    window.OP_OFF = true;
    document.title = 'Opinions are coming soon · Stay Informed News';
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
    const wrap = document.querySelector('#main .wrap') || document.getElementById('main');
    if (wrap) wrap.innerHTML =
      '<h1 class="ptitle">Opinions are coming soon</h1>' +
      '<p class="lede">We are building a place for readers to share opinion pieces and discuss them. It is not open yet.</p>' +
      '<div class="op-soon"><p>In the meantime, the latest headlines and the daily games are ready.</p>' +
      '<div class="row"><a class="btn red" href="../news/">Read the news</a><a class="btn ghost" href="../games/">Play a game</a></div></div>';
  }

  window.OP = { writeGate, ICON, esc, avatar, param, fmtDate, when, authorUrl, postUrl, plural, byline, feedItem, demoBanner, report, counter, safeNext };
})();
