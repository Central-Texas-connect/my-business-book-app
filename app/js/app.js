/* Smarter Home Improvements — My Business Book: app controller */
(function () {
  'use strict';
  const { $, $$, esc, icon, toast, modal, confirmDialog } = UI;
  const { n, r2, D, money } = Calc;
  const SEC = Sections.map;
  const TABS = Sections.list.filter(s => !s.hiddenTab);
  const VERSION = '1.0.0';
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let depth = 0;
  let formCtx = null;
  let pendingPush = null;
  let leaving = false;
  let deferredInstall = null;
  let lastActivity = Date.now();
  let hiddenAt = 0;
  let keptForm = false;
  let pendingGo = new URLSearchParams(location.search).get('go');

  /* ---------------- Routing (History API: Back steps through views) ---------------- */
  function parse(hash) {
    const h = (hash || '').replace(/^#/, '');
    const [path, qs] = h.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const p = path.split('/').filter(Boolean);
    if (!p.length || p[0] === 'cover') return { name: 'cover', q };
    if (p[0] === 'index') return { name: 'index', q };
    if (p[0] === 's' && SEC[p[1]]) {
      if (!p[2]) return { name: 'list', sec: p[1], q };
      if (p[2] === 'new') return { name: 'form', sec: p[1], q };
      if (p[3] === 'edit') return { name: 'form', sec: p[1], id: p[2], q };
      return { name: 'detail', sec: p[1], id: p[2], q };
    }
    if (p[0] === 'tool') return { name: 'tool', tool: p[1], q };
    return { name: 'index', q };
  }
  function go(hash, opts) {
    opts = opts || {};
    if (formCtx && formCtx.dirty && !opts.force && formCtx.hash === location.hash) {
      confirmDialog({ title: 'Leave without saving?', text: 'Your changes on this page have not been saved yet.', ok: 'Leave without saving', cancel: 'Keep editing', danger: true })
        .then(async ok => { if (ok) { await discardForm(); go(hash, Object.assign({}, opts, { force: true })); } });
      return;
    }
    if (formCtx) discardForm();
    // Browsers keep at most ~50 history entries. When the trail gets long, fold it back to the front page first
    // so Back always leads to the front page (depth 1) and then the cover (depth 0).
    if (!opts.replace && depth >= 30 && parse(hash).name !== 'form' && history.length > 30) { pendingPush = hash; history.go(-(depth - 1)); return; }
    if (opts.replace) history.replaceState({ depth }, '', hash);
    else { depth++; history.pushState({ depth }, '', hash); }
    render();
  }
  function home() {
    const d = (history.state && history.state.depth) || 0;
    if (d > 1) history.go(-(d - 1)); else if (d === 0) go('#index'); else render();
  }
  window.addEventListener('popstate', async e => {
    const nd = (e.state && e.state.depth) || 0;
    if (formCtx && formCtx.dirty && !leaving) {
      depth = nd + 1;
      history.pushState({ depth }, '', formCtx.hash);
      const ok = await confirmDialog({ title: 'Leave without saving?', text: 'Your changes on this page have not been saved yet.', ok: 'Leave without saving', cancel: 'Keep editing', danger: true });
      if (ok) { await discardForm(); leaving = true; history.back(); }
      return;
    }
    leaving = false;
    if (formCtx) await discardForm();
    depth = nd;
    if (pendingPush) { const h = pendingPush; pendingPush = null; depth++; history.pushState({ depth }, '', h); }
    render();
  });
  async function discardForm() {
    if (formCtx && formCtx.newPhotos) for (const id of formCtx.newPhotos) { try { await Store.delPhoto(id); } catch (e) { } }
    formCtx = null;
  }

  /* ---------------- Render ---------------- */
  function render() {
    const r = parse(location.hash);
    if (formCtx && formCtx.hash !== location.hash) discardForm();
    if (r.name === 'cover' || !Store.isUnlocked()) { showCover(); return; }
    showBook();
    $$('.tab').forEach(t => { const on = (r.sec && t.dataset.sec === r.sec) || (r.name === 'index' && t.dataset.sec === 'index'); t.classList.toggle('active', on); if (on) { t.setAttribute('aria-current', 'page'); t.scrollIntoView({ block: 'nearest', inline: 'center' }); } else t.removeAttribute('aria-current'); });
    const sec = r.sec && SEC[r.sec];
    $('#book').style.setProperty('--tab', sec ? sec.color : '#c9972b');
    $('#tb-title').textContent = r.name === 'index' ? 'My Business Book' : (sec ? sec.label : ({ search: 'Search', backup: 'Backup & Export', settings: 'Settings' }[r.tool] || ''));
    $('#btn-back').hidden = r.name === 'index';
    const v = $('#view');
    v.className = 'view view-' + r.name;
    try {
      if (r.name === 'index') v.innerHTML = indexView();
      else if (r.name === 'list') renderList(r);
      else if (r.name === 'detail') renderDetail(r);
      else if (r.name === 'form') renderForm(r);
      else if (r.name === 'tool') renderTool(r);
    } catch (err) {
      console.error(err);
      v.innerHTML = '<div class="empty"><h2>Something went wrong</h2><p>' + esc(err.message) + '</p><button class="btn primary" data-home>Go to front of book</button></div>';
    }
    updateBadge();
    $('#page').scrollTop = 0; window.scrollTo(0, 0);
    if (r.name !== 'form') { const h = $('h1', v); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  }
  function showCover() {
    $('#cover-screen').hidden = false;
    $('#book').hidden = true;
    if (!(formCtx && formCtx.dirty)) $('#view').innerHTML = '';
    const b3 = $('.book3d');
    if (b3.classList.contains('opening')) { b3.classList.add('no-anim'); b3.classList.remove('opening', 'opened'); void b3.offsetWidth; requestAnimationFrame(() => requestAnimationFrame(() => b3.classList.remove('no-anim'))); }
    document.title = 'Smarter Home Improvements — My Business Book';
  }
  function showBook() {
    $('#cover-screen').hidden = true;
    $('#book').hidden = false;
  }

  /* ---------------- Cover, PIN & opening ---------------- */
  async function openBook() {
    if (!Store.isUnlocked()) { const ok = await showLock(); if (!ok) return; }
    await animateOpen();
    if (parse(location.hash).name === 'cover') {
      go('#index');
      if (pendingGo && SEC[pendingGo]) go('#s/' + pendingGo);
      pendingGo = null;
    } else render();
  }
  function animateOpen() {
    return new Promise(res => {
      if (reduceMotion()) return res();
      const b = $('.book3d');
      b.classList.add('opening');
      setTimeout(() => { b.classList.add('opened'); res(); }, 1250);
    });
  }
  async function showLock(reason) {
    const has = await Store.hasPin();
    const L = $('#lock');
    L.hidden = false;
    L.dataset.mode = has ? 'unlock' : 'setup';
    let step = has ? 'unlock' : 'create';
    let first = '';
    let pin = '';
    let fails = 0, waitUntil = 0;
    const title = $('#lock-title'), msg = $('#lock-msg'), dots = $('#pin-dots');
    const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => '<span class="dot' + (i < pin.length ? ' on' : '') + '"></span>').join(''); dots.setAttribute('aria-label', pin.length + ' digits entered'); };
    const setStep = s => {
      step = s; pin = ''; draw();
      title.textContent = { unlock: 'Enter your PIN', create: 'Create a PIN to protect your book', confirm: 'Type the same PIN again' }[s];
      msg.textContent = { unlock: reason || 'Your book is locked to keep your records private.', create: 'Choose 4 to 8 numbers you will remember. You will need it every time the book locks.', confirm: 'Just to be sure you typed it right.' }[s];
      $('#lock-forgot').hidden = s !== 'unlock';
    };
    setStep(step);
    return new Promise(resolve => {
      const shake = () => { const c = $('.lock-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); };
      const press = k => {
        if (Date.now() < waitUntil) { msg.textContent = 'Too many tries. Please wait ' + Math.ceil((waitUntil - Date.now()) / 1000) + ' seconds.'; return; }
        if (k === 'del') pin = pin.slice(0, -1);
        else if (k === 'clear') pin = '';
        else if (k === 'ok') return submit();
        else if (/^\d$/.test(k) && pin.length < 8) pin += k;
        draw();
      };
      const submit = async () => {
        if (pin.length < 4) { msg.textContent = 'A PIN needs at least 4 numbers.'; shake(); return; }
        if (step === 'create') { first = pin; setStep('confirm'); return; }
        if (step === 'confirm') {
          if (pin !== first) { setStep('create'); msg.textContent = 'Those did not match. Please create your PIN again.'; shake(); return; }
          msg.textContent = 'Setting up your book…';
          await Store.setupPin(pin);
          await firstRun();
          done(true); toast('Your PIN is set. Your book is ready.');
          return;
        }
        msg.textContent = 'Checking…';
        const ok = await Store.unlock(pin);
        if (ok) { done(true); return; }
        fails++; pin = ''; draw(); shake();
        if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; msg.textContent = 'Too many wrong tries. Wait 30 seconds and try again.'; }
        else msg.textContent = 'That PIN is not right. Please try again.';
      };
      const done = ok => {
        L.hidden = true; cleanup();
        if (ok) afterUnlock();
        resolve(ok);
      };
      const onKey = e => { if (L.hidden || $('.modal-wrap')) return; if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { press('del'); e.preventDefault(); } else if (e.key === 'Enter') { press('ok'); e.preventDefault(); } };
      const onPad = e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
      const onCancel = () => { done(false); };
      const onForgot = async () => {
        const ok = await modal('<h2 id="mdl-title">Forgot your PIN?</h2><p>For your privacy, records are locked with your PIN and cannot be opened without it. The only way forward is to erase this book and start fresh — then restore from a backup file if you saved one.</p><div class="field"><label for="erase-word">Type ERASE to erase this book</label><input id="erase-word" type="text" autocomplete="off" autocapitalize="characters"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Keep trying</button><button type="button" class="btn danger" data-close="ok">Erase and start over</button></div>', { collect: w => $('#erase-word', w).value.trim().toUpperCase() === 'ERASE' });
        if (ok) { await Store.eraseAll(); toast('Book erased. Create a new PIN.'); L.dataset.mode = 'setup'; setStep('create'); }
        else if (ok === false) toast('Type ERASE exactly to erase.');
      };
      const cleanup = () => { document.removeEventListener('keydown', onKey); $('#keypad').removeEventListener('click', onPad); $('#lock-cancel').removeEventListener('click', onCancel); $('#lock-forgot').removeEventListener('click', onForgot); };
      document.addEventListener('keydown', onKey);
      $('#keypad').addEventListener('click', onPad);
      $('#lock-cancel').addEventListener('click', onCancel);
      $('#lock-forgot').addEventListener('click', onForgot);
      setTimeout(() => { const k = $('#keypad [data-k="1"]'); if (k) k.focus(); }, 60);
    });
  }
  async function firstRun() {
    if (!Store.get('settings')) await Store.put({ id: 'settings', section: '_settings', sharePct: 25, shareBase: 'price', autoLockMin: 5, handbookSeeded: true });
    if (!Store.list('handbook').length) {
      const now = new Date().toISOString();
      await Store.putMany(Sections.HANDBOOK.map(([title, body], i) => ({ id: 'hb-' + (i + 1) + '-' + Store.uid(), section: 'handbook', title, body, order: i + 1, starter: true, createdAt: now, updatedAt: now })));
    }
  }
  async function afterUnlock() {
    lastActivity = Date.now();
    if (!Store.get('settings')) await firstRun();
    if (navigator.storage && navigator.storage.persist) { try { const p = await navigator.storage.persisted(); if (!p) await navigator.storage.persist(); } catch (e) { } }
    if (keptForm) { keptForm = false; $('#book').classList.remove('hide-locked'); }
    else if (parse(location.hash).name !== 'cover') render();
    checkReminders();
  }
  function lockNow(reason) {
    if (!Store.isUnlocked()) return;
    keptForm = !!(formCtx && formCtx.dirty);
    if (keptForm) $('#book').classList.add('hide-locked');
    else $('#view').innerHTML = '';
    Store.lock();
    Fields.clearPhotoURLs();
    $$('.modal-wrap').forEach(m => m.remove());
    showLock(reason || 'Locked to protect your records.').then(ok => { if (!ok) { keptForm = false; $('#book').classList.remove('hide-locked'); formCtx = null; showCover(); } });
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    if (!Store.isUnlocked()) return;
    const mins = n(Calc.settings().autoLockMin) || 5;
    if (Date.now() - lastActivity > mins * 60000) lockNow('Locked after ' + mins + ' minute' + (mins > 1 ? 's' : '') + ' without use.');
  }, 10000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Store.isUnlocked()) {
      const mins = n(Calc.settings().autoLockMin) || 5;
      if (Date.now() - hiddenAt > mins * 60000) lockNow('Locked while the app was in the background.');
      hiddenAt = 0;
    }
  });

  /* ---------------- Index / dashboard ---------------- */
  function indexView() {
    const today = D.today();
    const todays = Store.list('planner').filter(p => p.date === today).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const openJobs = Store.list('jobs').filter(j => ['Scheduled', 'In Progress'].includes(j.status || 'Scheduled'));
    const owed = Calc.moneyOwed();
    const fri = D.payFriday();
    const pr = Calc.payroll(fri);
    const due = Store.list('reminders').filter(Sections.isDue);
    const sh = Calc.shareSummary();
    const tile = (go, ic, label, value, sub, cls) => '<button type="button" class="tile ' + (cls || '') + '" data-go="' + go + '" data-testid="tile-' + ic + '">' + icon(ic) + '<span class="tile-label">' + label + '</span><span class="tile-value">' + value + '</span><span class="tile-sub">' + sub + '</span></button>';
    const counts = Object.fromEntries(TABS.map(s => [s.key, Store.list(s.key).length]));
    return '<section class="welcome" aria-label="Welcome"><div class="welcome-ornament" aria-hidden="true"><span></span>✦<span></span></div><p class="welcome-title">Welcome back, Lynn.</p><p class="welcome-sub">One job, one plan, one day at a time.</p><p class="welcome-date">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</p></section>' +
      '<h1 class="vh">My Business Book — front page</h1>' +
      '<section class="dash" aria-label="Today at a glance">' +
      tile('#s/planner', 'planner', "Today's plan", todays.filter(t => !t.done).length + ' to do', todays.length ? esc(todays.slice(0, 2).map(t => (t.done ? '✓ ' : '') + t.title).join(' · ')) : 'Nothing planned yet') +
      tile('#s/jobs?filter=open', 'jobs', 'Open jobs', String(openJobs.length), openJobs.length ? 'Scheduled or in progress' : 'No open jobs') +
      tile('#s/jobs?filter=owed', 'money', 'Money owed to you', money(owed), 'From recorded payments', owed > 0 ? 'warn' : '') +
      tile('#s/payroll', 'payroll', "This Friday's payroll", money(pr.total), 'Week ending ' + D.short(fri) + ' · ' + pr.totalHours + ' hrs') +
      tile('#s/reminders', 'bell', 'Reminders due', String(due.length), due.length ? esc(due[0].title) : 'All caught up', due.length ? 'bad' : '') +
      tile('#s/share', 'share', 'Company share left', money(sh.remaining), money(sh.due) + ' due · ' + money(sh.recorded) + ' recorded') +
      '</section>' +
      '<h2 class="contents-h">Contents</h2><ol class="toc">' + TABS.map((s, i) => '<li><button type="button" class="toc-item" data-go="#s/' + s.key + '" style="--tab:' + s.color + '"><span class="toc-num">' + (i + 1) + '</span>' + icon(s.icon) + '<span class="toc-label">' + esc(s.label) + '</span><span class="toc-count" aria-label="' + counts[s.key] + ' records">' + counts[s.key] + '</span>' + icon('chev', 'chev') + '</button></li>').join('') + '</ol>' +
      '<h2 class="contents-h">Tools</h2><div class="tools">' +
      '<button type="button" class="tool" data-go="#tool/search">' + icon('search') + '<span>Search everything</span></button>' +
      '<button type="button" class="tool" data-go="#s/reminders">' + icon('bell') + '<span>Reminders</span></button>' +
      '<button type="button" class="tool" data-go="#tool/backup">' + icon('backup') + '<span>Backup &amp; Export</span></button>' +
      '<button type="button" class="tool" data-go="#tool/settings">' + icon('settings') + '<span>Settings &amp; PIN</span></button>' +
      '</div>' + backupNudge();
  }
  function backupNudge() {
    const s = Calc.settings();
    const count = Store.list().filter(r => r.section !== '_settings' && !r.starter).length;
    if (!count) return '';
    const last = s.lastBackup ? D.parse(s.lastBackup.slice(0, 10)) : null;
    const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
    if (days !== null && days < 7) return '<p class="hint ok">' + icon('check') + ' Last backup ' + D.short(s.lastBackup.slice(0, 10)) + '.</p>';
    return '<button type="button" class="hint warn" data-go="#tool/backup">' + icon('info') + '<span>' + (last ? 'Last backup was ' + days + ' days ago.' : 'You have not saved a backup yet.') + ' Tap to back up now.</span></button>';
  }

  /* ---------------- Lists ---------------- */
  function secHead(sec, title) {
    return '<header class="sec-head" style="--tab:' + sec.color + '"><span class="sec-ic">' + icon(sec.icon) + '</span><h1>' + esc(title || sec.label) + '</h1></header>';
  }
  function card(sec, r) {
    const b = sec.badge ? sec.badge(r) : null;
    const amt = sec.amount ? sec.amount(r) : '';
    const quick = (sec.key === 'planner' || sec.key === 'reminders' || sec.key === 'goals');
    return '<div class="card-row' + (quick ? ' has-quick' : '') + (r.done ? ' is-done' : '') + '"><button type="button" class="card" data-go="#s/' + sec.key + '/' + r.id + '" style="--tab:' + sec.color + '"><span class="card-main"><span class="card-title">' + esc(sec.title(r) || '(untitled)') + '</span><span class="card-sub">' + esc(sec.sub ? sec.sub(r) : '') + '</span></span><span class="card-right">' + (b ? '<span class="badge ' + b.c + '">' + esc(b.t) + '</span>' : '') + (amt ? '<span class="amt">' + esc(amt) + '</span>' : '') + '</span></button>' +
      (quick ? '<label class="quick-done"><input type="checkbox" data-done="' + r.id + '"' + (r.done ? ' checked' : '') + ' aria-label="Done: ' + esc(sec.title(r)) + '"><span>' + icon('check') + '</span></label>' : '') + '</div>';
  }
  function emptyState(sec) {
    return '<div class="empty">' + icon(sec.icon) + '<h2>No ' + esc(sec.label.toLowerCase()) + ' yet</h2><p>Tap the big button above to add your first ' + esc(sec.noun) + '. Nothing here is made up — everything you see will be what you entered.</p></div>';
  }
  function listActions() {
    return '<div class="list-actions"><button type="button" class="btn ghost" data-act="print-list">' + icon('print') + '<span>Print list</span></button><button type="button" class="btn ghost" data-act="share-list">' + icon('shareout') + '<span>Share list (PDF)</span></button><button type="button" class="btn ghost" data-act="csv">' + icon('download') + '<span>Export CSV</span></button></div>';
  }
  function renderList(r) {
    const sec = SEC[r.sec];
    if (sec.key === 'payroll') return renderPayroll(r);
    if (sec.key === 'share') return renderShare(r);
    let recs = Store.list(sec.key).sort(sec.sort || (() => 0));
    let top = '';
    if (sec.key === 'planner') {
      const day = r.q.date || D.today();
      top = '<div class="day-nav"><button type="button" class="icon-btn" data-go-replace="#s/planner?date=' + D.add(day, -1) + '" aria-label="Previous day">' + icon('chevl') + '</button><label class="day-pick"><span class="vh">Pick a day</span><input type="date" id="day-pick" value="' + day + '"></label><button type="button" class="icon-btn" data-go-replace="#s/planner?date=' + D.add(day, 1) + '" aria-label="Next day">' + icon('chev') + '</button>' + (day !== D.today() ? '<button type="button" class="btn small ghost" data-go-replace="#s/planner">Today</button>' : '') + '</div><h2 class="day-title">' + esc(D.pretty(day)) + (day === D.today() ? ' — Today' : '') + '</h2>';
      const dayRecs = recs.filter(p => p.date === day).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      const upcoming = recs.filter(p => p.date > day && p.date <= D.add(day, 14) && !p.done).sort((a, b) => a.date.localeCompare(b.date));
      const overdue = day === D.today() ? recs.filter(p => p.date < day && !p.done) : [];
      $('#view').innerHTML = secHead(sec) + '<p class="intro">' + esc(sec.intro) + '</p>' + top +
        '<button type="button" class="btn primary big" data-go="#s/planner/new?date=' + day + '" data-testid="add">' + icon('plus') + '<span>Add to this day</span></button>' +
        (dayRecs.length ? '<div class="cards">' + dayRecs.map(x => card(sec, x)).join('') + '</div>' : '<div class="empty small"><p>Nothing planned for this day yet.</p></div>') +
        (overdue.length ? '<h2 class="sub-h bad">Not done from earlier days</h2><div class="cards">' + overdue.map(x => card(sec, x)).join('') + '</div>' : '') +
        (upcoming.length ? '<h2 class="sub-h">Coming up (next 2 weeks)</h2><div class="cards">' + upcoming.map(x => card(sec, x)).join('') + '</div>' : '') +
        listActions();
      $('#day-pick').addEventListener('change', e => { if (e.target.value) go('#s/planner?date=' + e.target.value, { replace: true }); });
      return;
    }
    if (sec.key === 'jobs') {
      const f = r.q.filter || 'all';
      const filters = { all: 'All', open: 'Open', owed: 'Owed money', Completed: 'Completed', Paid: 'Paid', Canceled: 'Canceled' };
      if (f === 'open') recs = recs.filter(j => ['Scheduled', 'In Progress'].includes(j.status || 'Scheduled'));
      else if (f === 'owed') recs = recs.filter(j => j.status !== 'Canceled' && Calc.jobMoney(j).balance > 0.004);
      else if (f !== 'all') recs = recs.filter(j => j.status === f);
      top = '<div class="chips filter-chips" role="group" aria-label="Show jobs">' + Object.entries(filters).map(([k, l]) => '<button type="button" class="chip' + (k === f ? ' on' : '') + '" data-go-replace="#s/jobs' + (k === 'all' ? '' : '?filter=' + k) + '">' + l + '</button>').join('') + '</div>';
      if (f === 'owed') top += '<p class="sum-line">Total owed: <strong>' + money(recs.reduce((a, j) => a + Calc.jobMoney(j).balance, 0)) + '</strong></p>';
    }
    if (sec.key === 'reminders') top = notifyPanel();
    if (sec.key === 'expenses' || sec.key === 'materials') {
      const month = D.today().slice(0, 7);
      const tot = recs.filter(x => (x.date || '').startsWith(month)).reduce((a, x) => a + (sec.key === 'expenses' ? n(x.amount) : n(x.qty) * n(x.unitCost)), 0);
      top = '<p class="sum-line">This month: <strong>' + money(tot) + '</strong></p>';
    }
    if (sec.key === 'hours') {
      const wk = Calc.weekRange(D.payFriday());
      const wkHrs = recs.filter(h => h.date >= wk.start && h.date <= wk.end).reduce((a, h) => a + n(h.hours), 0);
      top = '<p class="sum-line">This pay week (' + D.short(wk.start) + ' – ' + D.short(wk.end) + '): <strong>' + r2(wkHrs) + ' hrs</strong></p>';
    }
    $('#view').innerHTML = secHead(sec) + (sec.banner ? '<div class="note-box">' + icon('info') + '<p>' + esc(sec.banner) + '</p></div>' : '') + '<p class="intro">' + esc(sec.intro) + '</p>' + top +
      '<button type="button" class="btn primary big" data-go="#s/' + sec.key + '/new" data-testid="add">' + icon('plus') + '<span>Add ' + esc(sec.noun) + '</span></button>' +
      (Store.list(sec.key).length > 4 ? '<div class="filter"><label class="vh" for="list-filter">Find in ' + esc(sec.label) + '</label>' + icon('search') + '<input id="list-filter" type="search" placeholder="Find in ' + esc(sec.label) + '…"></div>' : '') +
      (recs.length ? '<div class="cards" id="cards">' + recs.map(x => card(sec, x)).join('') + '</div>' : (Store.list(sec.key).length ? '<div class="empty small"><p>No matches.</p></div>' : emptyState(sec))) +
      listActions();
    const lf = $('#list-filter');
    if (lf) lf.addEventListener('input', () => { const q = lf.value.toLowerCase(); $$('#cards .card-row').forEach(c => { c.hidden = !!q && !c.textContent.toLowerCase().includes(q); }); });
  }
  function notifyPanel() {
    if (UI.NATIVE) return '<div class="note-box">' + icon('bell') + '<div><p>Due reminders show a red number on the bell at the top of every page. Reminders with a date in the future also pop up as phone notifications at that time (8:00 AM if no time is set), even when the app is closed.</p><p class="small">The phone must allow notifications for My Business Book. Notifications show the reminder title on the screen.</p><button type="button" class="btn small" data-act="enable-notify">' + icon('bell') + '<span>Allow / check phone notifications</span></button></div></div>';
    const sup = 'Notification' in window;
    const perm = sup ? Notification.permission : 'unsupported';
    return '<div class="note-box">' + icon('bell') + '<div><p>Due reminders show a red number on the bell at the top of every page' + (perm === 'granted' ? ' and pop up as phone notifications while the book is open.' : '.') + '</p><p class="small">Honest note: Android only lets a web app show notifications while it is open or recently used. Check this list each morning.</p>' + (sup && perm === 'default' ? '<button type="button" class="btn small" data-act="enable-notify">' + icon('bell') + '<span>Allow phone notifications</span></button>' : '') + (perm === 'denied' ? '<p class="small">Notifications are blocked for this app in your phone settings.</p>' : '') + '</div></div>';
  }

  /* ---------------- Payroll ---------------- */
  function rateText(entries) { const rates = [...new Set(entries.map(e => n(e.rate)))]; return rates.map(x => money(x) + '/hr').join(', '); }
  function renderPayroll(r) {
    const sec = SEC.payroll;
    let fri = r.q.week || D.payFriday();
    if (D.parse(fri).getDay() !== 5) fri = D.payFriday(fri);
    const pr = Calc.payroll(fri);
    const hist = Store.list('payroll').sort(sec.sort);
    $('#view').innerHTML = secHead(sec) + '<p class="intro">' + esc(sec.intro) + '</p>' +
      '<div class="day-nav"><button type="button" class="icon-btn" data-go-replace="#s/payroll?week=' + D.add(fri, -7) + '" aria-label="Previous week">' + icon('chevl') + '</button><label class="day-pick"><span class="vh">Week ending</span><input type="date" id="week-pick" value="' + fri + '"></label><button type="button" class="icon-btn" data-go-replace="#s/payroll?week=' + D.add(fri, 7) + '" aria-label="Next week">' + icon('chev') + '</button>' + (fri !== D.payFriday() ? '<button type="button" class="btn small ghost" data-go-replace="#s/payroll">This week</button>' : '') + '</div>' +
      '<h2 class="day-title">Week ending Friday, ' + esc(D.short(fri)) + '</h2><p class="small center">Hours from ' + D.pretty(pr.start) + ' through ' + D.pretty(pr.end) + '</p>' +
      '<div class="money-grid" data-testid="payroll-summary"><div><span>Total hours</span><strong data-testid="payroll-hours">' + pr.totalHours + '</strong></div><div><span>Total pay</span><strong data-testid="payroll-total">' + money(pr.total) + '</strong></div><div><span>Marked paid</span><strong data-testid="payroll-paid">' + money(pr.paidTotal) + '</strong></div><div><span>Still to pay</span><strong class="' + (pr.unpaidTotal > 0 ? 'bad' : '') + '" data-testid="payroll-unpaid">' + money(pr.unpaidTotal) + '</strong></div></div>' +
      (pr.rows.length ? '<div class="pay-rows">' + pr.rows.map(row => '<div class="pay-row" data-worker="' + row.workerId + '"><div class="pay-main"><strong>' + esc(row.name) + '</strong><span>' + row.hours + ' hrs · ' + esc(rateText(row.entries)) + '</span>' + (row.paid ? '<span class="badge ok">Paid ' + D.short(row.paid.paidDate) + (row.paid.method ? ' · ' + esc(row.paid.method) : '') + '</span>' : '<span class="badge warn">Not paid yet</span>') + (row.changedSincePaid ? '<span class="badge bad">Hours changed after it was marked paid (' + money(row.paid.amount) + ' paid)</span>' : '') + '</div><div class="pay-amt">' + money(row.pay) + '</div><div class="pay-act">' + (row.paid ? '<button type="button" class="btn small ghost" data-go="#s/payroll/' + row.paid.id + '">View</button>' : '<button type="button" class="btn small primary" data-act="mark-paid" data-worker="' + row.workerId + '" data-week="' + fri + '">' + icon('check') + '<span>Mark paid</span></button>') + '</div></div>').join('') + '</div>'
        : '<div class="empty small"><p>No hours logged for this week. Log hours in the <button type="button" class="linkish" data-go="#s/hours">Hours tab</button> and they show up here.</p></div>') +
      '<div class="list-actions"><button type="button" class="btn ghost" data-act="print-payroll" data-week="' + fri + '">' + icon('print') + '<span>Print payroll sheet</span></button><button type="button" class="btn ghost" data-act="share-payroll" data-week="' + fri + '">' + icon('shareout') + '<span>Share payroll (PDF)</span></button><button type="button" class="btn ghost" data-act="csv-payroll" data-week="' + fri + '">' + icon('download') + '<span>Export CSV</span></button></div>' +
      '<h2 class="sub-h">Payroll payment history</h2>' + (hist.length ? '<div class="cards">' + hist.map(x => card(sec, x)).join('') + '</div>' : '<p class="small center">No payroll payments recorded yet.</p>');
    $('#week-pick').addEventListener('change', e => { if (e.target.value) go('#s/payroll?week=' + D.payFriday(e.target.value), { replace: true }); });
  }
  function payrollSpec(fri) {
    const pr = Calc.payroll(fri);
    const blocks = [{ kv: [['Week', D.pretty(pr.start) + ' to ' + D.pretty(pr.end)], ['Pay day', D.pretty(fri)]] },
    { heading: 'Pay by worker', table: { cols: [{ label: 'Worker', w: 0.3 }, { label: 'Hours', w: 0.12, align: 'right' }, { label: 'Rate', w: 0.18, align: 'right' }, { label: 'Pay', w: 0.17, align: 'right' }, { label: 'Paid', w: 0.23 }], rows: pr.rows.map(rw => [rw.name, String(rw.hours), rateText(rw.entries), money(rw.pay), rw.paid ? 'Paid ' + D.short(rw.paid.paidDate) + (rw.paid.method ? ' (' + rw.paid.method + ')' : '') : 'Not paid yet']) } },
    { totals: [['Total hours', String(pr.totalHours)], ['Marked paid', money(pr.paidTotal)], ['Total payroll', money(pr.total), true]] }];
    for (const rw of pr.rows) blocks.push({ heading: rw.name + ' — daily hours', table: { cols: [{ label: 'Date', w: 0.22 }, { label: 'Job', w: 0.38 }, { label: 'Hours', w: 0.12, align: 'right' }, { label: 'Rate', w: 0.13, align: 'right' }, { label: 'Pay', w: 0.15, align: 'right' }], rows: rw.entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => [D.short(e.date), e.jobId ? Fields.refName(e.jobId) : 'No job', String(n(e.hours)), money(e.rate), money(Calc.laborCost(e))]) } });
    return { title: 'Friday Payroll', number: 'Week ending ' + D.short(fri), business: Sections.biz(), blocks, filename: 'Smarter-payroll-week-ending-' + fri + '.pdf' };
  }
  async function markPaid(workerId, fri) {
    const pr = Calc.payroll(fri);
    const row = pr.rows.find(x => x.workerId === workerId); if (!row) return;
    const res = await modal('<h2 id="mdl-title">Mark ' + esc(row.name) + ' as paid?</h2><p>Only do this after you have actually paid them.</p><div class="money-grid"><div><span>Hours</span><strong>' + row.hours + '</strong></div><div><span>Pay</span><strong>' + money(row.pay) + '</strong></div></div><div class="field"><label for="pd-date">Date paid</label><input id="pd-date" type="date" value="' + D.today() + '"></div><div class="field"><label for="pd-method">Paid by</label><input id="pd-method" type="text" value="Cash"><div class="chips">' + Sections.METHODS.map(m => '<button type="button" class="chip" data-m="' + m + '">' + m + '</button>').join('') + '</div></div><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Not yet</button><button type="button" class="btn primary" data-close="ok" data-testid="confirm-ok">Yes, I paid ' + money(row.pay) + '</button></div>', { collect: w => ({ date: $('#pd-date', w).value || D.today(), method: $('#pd-method', w).value.trim() }), wire: w => $$('[data-m]', w).forEach(b => b.onclick = () => { $('#pd-method', w).value = b.dataset.m; }) });
    if (!res) return;
    await Store.put({ section: 'payroll', weekEnding: fri, workerId, hours: row.hours, amount: row.pay, paidDate: res.date, method: res.method });
    toast(row.name + ' marked paid ' + money(row.pay));
    render();
  }

  /* ---------------- 25% share ---------------- */
  function renderShare() {
    const sec = SEC.share; const s = Calc.settings(); const sum = Calc.shareSummary();
    const notApplied = Store.list('jobs').filter(j => !j.shareApplies && j.status !== 'Canceled').length;
    const recs = Store.list('share').sort(sec.sort);
    $('#view').innerHTML = secHead(sec) + '<p class="intro">' + esc(sec.intro) + '</p>' +
      '<div class="note-box">' + icon('info') + '<div><p><strong>How it is figured:</strong> ' + n(s.sharePct) + '% of each job\'s <strong>' + Sections.shareBaseLabel(s.shareBase) + '</strong>' + (s.shareBase === 'price' ? ' (the invoice totals if the job has invoices, otherwise the agreed job price)' : s.shareBase === 'received' ? ' (only money actually recorded as received)' : ' (amount billed minus materials, expenses and labor; never below $0)') + ', only on jobs where "company share applies" is turned on.</p><button type="button" class="btn small ghost" data-go="#tool/settings">' + icon('settings') + '<span>Change percent or base</span></button></div></div>' +
      '<div class="money-grid"><div><span>Share due</span><strong data-testid="share-due">' + money(sum.due) + '</strong></div><div><span>Recorded set aside / paid</span><strong data-testid="share-recorded">' + money(sum.recorded) + '</strong></div><div><span>Remaining</span><strong class="' + (sum.remaining > 0 ? 'bad' : '') + '" data-testid="share-remaining">' + money(sum.remaining) + '</strong></div></div>' +
      (sum.rows.length ? '<h2 class="sub-h">Jobs where it applies</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Job</th><th class="r">Base</th><th class="r">Share</th></tr></thead><tbody>' + sum.rows.map(x => '<tr><td><button type="button" class="linkish" data-go="#s/jobs/' + x.job.id + '">' + esc(Fields.refLabel(x.job)) + '</button></td><td class="r">' + money(x.m.shareBaseAmount) + '</td><td class="r">' + money(x.m.share) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty small"><p>No jobs with the company share turned on yet.</p></div>') +
      (notApplied ? '<p class="small">' + notApplied + ' job' + (notApplied > 1 ? 's have' : ' has') + ' the company share turned off.</p>' : '') +
      '<button type="button" class="btn primary big" data-go="#s/share/new" data-testid="add">' + icon('plus') + '<span>Record share set aside / paid</span></button>' +
      (recs.length ? '<div class="cards">' + recs.map(x => card(sec, x)).join('') + '</div>' : '') +
      '<div class="list-actions"><button type="button" class="btn ghost" data-act="print-sharesum">' + icon('print') + '<span>Print share summary</span></button><button type="button" class="btn ghost" data-act="share-sharesum">' + icon('shareout') + '<span>Share summary (PDF)</span></button><button type="button" class="btn ghost" data-act="csv">' + icon('download') + '<span>Export CSV</span></button></div>';
  }
  function shareSumSpec() {
    const s = Calc.settings(); const sum = Calc.shareSummary();
    return { title: 'Company Share Summary', number: n(s.sharePct) + '%', business: Sections.biz(), filename: 'Smarter-company-share-' + D.today() + '.pdf', blocks: [{ kv: [['Figured as', n(s.sharePct) + '% of ' + Sections.shareBaseLabel(s.shareBase)], ['Date', D.pretty(D.today())]] }, { heading: 'Jobs where the share applies', table: { cols: [{ label: 'Job', w: 0.5 }, { label: 'Base', w: 0.25, align: 'right' }, { label: 'Share', w: 0.25, align: 'right' }], rows: sum.rows.map(x => [Fields.refLabel(x.job), money(x.m.shareBaseAmount), money(x.m.share)]) } }, { heading: 'Recorded set aside / paid', table: { cols: [{ label: 'Date', w: 0.25 }, { label: 'Job', w: 0.5 }, { label: 'Amount', w: 0.25, align: 'right' }], rows: Store.list('share').map(x => [D.short(x.date), x.jobId ? Fields.refName(x.jobId) : '-', money(x.amount)]) } }, { totals: [['Share due', money(sum.due)], ['Recorded', money(sum.recorded)], ['Remaining', money(sum.remaining), true]] }] };
  }

  /* ---------------- Detail ---------------- */
  function moneyPanel(m) {
    const row = (l, v, cls, tid) => '<div class="' + (cls || '') + '"><span>' + l + '</span><strong' + (tid ? ' data-testid="' + tid + '"' : '') + '>' + v + '</strong></div>';
    return '<section class="money-card" aria-label="Money summary"><h2>Money for this job</h2><p class="small">Worked out only from what is recorded in this book.</p><div class="money-list">' +
      row('Job price', money(m.price), '', 'm-price') +
      (m.billedFrom === 'invoices' ? row('Amount billed (invoices)', money(m.billed), '', 'm-billed') : '') +
      row('Materials', money(m.materials), 'cost', 'm-materials') + row('Expenses', money(m.expenses), 'cost', 'm-expenses') + row('Labor (' + m.laborHours + ' hrs)', money(m.labor), 'cost', 'm-labor') +
      row('Total costs', money(m.costs), 'sumrow', 'm-costs') +
      row('Payments received', money(m.received), 'good', 'm-received') +
      row('Outstanding balance', money(m.balance), m.balance > 0 ? 'bad sumrow' : 'sumrow', 'm-balance') +
      row('Profit (billed − costs)', money(m.profit), m.profit < 0 ? 'bad' : '', 'm-profit') +
      (m.applies ? row('Company share (' + m.sharePct + '% of ' + Sections.shareBaseLabel(m.shareBase) + ')', money(m.share), '', 'm-share') + row('Profit after company share', money(m.afterShare), 'sumrow', 'm-after') : row('Company share', 'Does not apply', 'muted', 'm-share')) +
      '</div><p class="pay-status ' + (m.payStatus === 'Paid in full' ? 'ok' : m.payStatus === 'Partly paid' ? 'warn' : '') + '" data-testid="m-status">Payment status: <strong>' + m.payStatus + '</strong></p></section>';
  }
  function related(title, secKey, recs, addHash) {
    const sec = SEC[secKey];
    return '<section class="related"><div class="related-h"><h2>' + esc(title) + ' <span class="count">' + recs.length + '</span></h2>' + (addHash ? '<button type="button" class="btn small ghost" data-go="' + addHash + '">' + icon('plus') + '<span>Add</span></button>' : '') + '</div>' + (recs.length ? '<div class="cards compact">' + recs.sort(sec.sort || (() => 0)).map(x => card(sec, x)).join('') + '</div>' : '') + '</section>';
  }
  function itemsHTML(rec, t) {
    return '<div class="table-wrap"><table class="tbl items-tbl"><thead><tr><th>Work / item</th><th class="r">Qty</th><th class="r">Each</th><th class="r">Amount</th></tr></thead><tbody>' + (rec.items || []).map(it => '<tr><td>' + esc(it.desc) + '</td><td class="r">' + n(it.qty) + '</td><td class="r">' + money(it.price) + '</td><td class="r">' + money(n(it.qty) * n(it.price)) + '</td></tr>').join('') + '</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="r">' + money(t.subtotal) + '</td></tr>' + (n(rec.taxRate) ? '<tr><td colspan="3">Tax (' + rec.taxRate + '%)</td><td class="r">' + money(t.tax) + '</td></tr>' : '') + '<tr class="grand"><td colspan="3">Total</td><td class="r" data-testid="doc-total">' + money(t.total) + '</td></tr></tfoot></table></div>';
  }
  const telHref = p => esc(String(p).replace(/[^0-9+]/g, ''));
  function renderDetail(r) {
    const sec = SEC[r.sec];
    const rec = Store.get(r.id);
    if (!rec) { $('#view').innerHTML = secHead(sec) + '<div class="empty"><h2>This record is not here</h2><p>It may have been deleted.</p><button type="button" class="btn primary" data-back>Go back</button></div>'; return; }
    let top = '', extra = '';
    const acts = [];
    const fieldsHTML = sec.fields.filter(f => !['note', 'calc', 'photos', 'items', 'contributions'].includes(f.type)).map(f => {
      const v = rec[f.key]; const d = Sections.display(f, v);
      if (d === '' || d == null) return '';
      let val = esc(d);
      if (f.type === 'ref' && v && Store.get(v)) val = '<button type="button" class="linkish" data-go="#s/' + f.target + '/' + v + '">' + esc(d) + '</button>';
      if (f.type === 'tel' && v) val = '<a href="tel:' + telHref(v) + '">' + esc(v) + '</a>';
      if (f.type === 'textarea') val = '<span class="pre">' + esc(d) + '</span>';
      return '<div class="kv-row"><dt>' + esc(f.label) + '</dt><dd>' + val + '</dd></div>';
    }).join('');
    if (sec.key === 'jobs') {
      top = moneyPanel(Calc.jobMoney(rec));
      acts.push(['record-payment', 'money', 'Record payment', 'primary']);
      const q = 'jobId=' + rec.id;
      extra = related('Payments (receipts)', 'receipts', Store.list('receipts').filter(x => x.jobId === rec.id)) +
        related('Hours worked', 'hours', Store.list('hours').filter(x => x.jobId === rec.id), '#s/hours/new?' + q) +
        related('Materials bought', 'materials', Store.list('materials').filter(x => x.jobId === rec.id), '#s/materials/new?' + q) +
        related('Expenses', 'expenses', Store.list('expenses').filter(x => x.jobId === rec.id), '#s/expenses/new?' + q) +
        related('Estimates', 'estimates', Store.list('estimates').filter(x => x.jobId === rec.id), '#s/estimates/new?' + q + '&customerId=' + (rec.customerId || '')) +
        related('Invoices', 'invoices', Store.list('invoices').filter(x => x.jobId === rec.id), '#s/invoices/new?' + q + '&customerId=' + (rec.customerId || ''));
    }
    if (sec.key === 'customers') {
      const jobs = Store.list('jobs').filter(j => j.customerId === rec.id);
      const owed = jobs.filter(j => j.status !== 'Canceled').reduce((a, j) => a + Math.max(Calc.jobMoney(j).balance, 0), 0);
      top = '<div class="money-grid"><div><span>Jobs</span><strong>' + jobs.length + '</strong></div><div><span>Owes (recorded)</span><strong class="' + (owed > 0 ? 'bad' : '') + '">' + money(owed) + '</strong></div></div>' + (rec.phone ? '<div class="call-row"><a class="btn primary" href="tel:' + telHref(rec.phone) + '">' + icon('phone') + '<span>Call</span></a><a class="btn ghost" href="sms:' + telHref(rec.phone) + '">' + icon('sms') + '<span>Text</span></a></div>' : '');
      extra = related('Jobs', 'jobs', jobs, '#s/jobs/new?customerId=' + rec.id) + related('Estimates', 'estimates', Store.list('estimates').filter(x => x.customerId === rec.id), '#s/estimates/new?customerId=' + rec.id) + related('Invoices', 'invoices', Store.list('invoices').filter(x => x.customerId === rec.id));
    }
    if (sec.key === 'workers') {
      const jobs = Store.list('jobs').filter(j => (j.workerIds || []).includes(rec.id));
      const pr = Calc.payroll(D.payFriday()).rows.find(x => x.workerId === rec.id);
      top = '<div class="money-grid"><div><span>Hours this pay week</span><strong>' + (pr ? pr.hours : 0) + '</strong></div><div><span>Pay this week</span><strong>' + money(pr ? pr.pay : 0) + '</strong></div></div>' + (rec.phone ? '<div class="call-row"><a class="btn ghost" href="tel:' + telHref(rec.phone) + '">' + icon('phone') + '<span>Call</span></a></div>' : '');
      acts.push(['assign', 'jobs', 'Assign to a job', '']);
      extra = '<section class="related"><div class="related-h"><h2>Assigned jobs <span class="count">' + jobs.length + '</span></h2></div>' + (jobs.length ? '<div class="cards compact">' + jobs.map(j => card(SEC.jobs, j)).join('') + '</div>' : '<p class="small">Not assigned to any job yet.</p>') + '</section>' + related('Hours logged', 'hours', Store.list('hours').filter(h => h.workerId === rec.id).sort(SEC.hours.sort).slice(0, 30), '#s/hours/new?workerId=' + rec.id);
    }
    if (sec.key === 'estimates') {
      top = itemsHTML(rec, Calc.itemsTotal(rec.items, rec.taxRate));
      acts.push(['to-invoice', 'convert', rec.invoiceId && Store.get(rec.invoiceId) ? 'Open its invoice' : 'Make invoice', 'primary']);
    }
    if (sec.key === 'invoices') {
      const st = Calc.invoiceStatus(rec);
      top = itemsHTML(rec, Calc.itemsTotal(rec.items, rec.taxRate)) + '<div class="money-grid"><div><span>Payments received</span><strong data-testid="inv-paid">' + money(st.paid) + '</strong></div><div><span>Balance due</span><strong class="' + (st.balance > 0 ? 'bad' : '') + '" data-testid="inv-balance">' + money(st.balance) + '</strong></div></div><p class="pay-status ' + ({ paid: 'ok', partial: 'warn' }[st.key] || '') + '" data-testid="inv-status">Payment status: <strong>' + st.status + '</strong></p>';
      acts.push(['record-payment', 'money', 'Record payment', 'primary']);
      extra = related('Payments (receipts)', 'receipts', Store.list('receipts').filter(x => x.invoiceId === rec.id));
    }
    if (sec.key === 'receipts') top = '<div class="money-grid"><div><span>Amount received</span><strong>' + money(rec.amount) + '</strong></div></div>';
    if (sec.key === 'hours') top = '<div class="money-grid"><div><span>Hours</span><strong>' + n(rec.hours) + '</strong></div><div><span>Pay</span><strong data-testid="hours-pay">' + money(Calc.laborCost(rec)) + '</strong></div></div>';
    if (sec.key === 'materials') top = '<div class="money-grid"><div><span>Total cost</span><strong>' + money(n(rec.qty) * n(rec.unitCost)) + '</strong></div></div>';
    if (sec.key === 'trades') { const d = Calc.tradeDiff(rec); top = '<div class="money-grid"><div><span>We give</span><strong>' + money(rec.giveValue) + '</strong></div><div><span>We get</span><strong>' + money(rec.getValue) + '</strong></div><div><span>Difference</span><strong class="' + (d < 0 ? 'bad' : '') + '" data-testid="trade-diff">' + money(d) + '</strong></div></div><p class="small center">' + (d > 0 ? 'We come out ' + money(d) + ' ahead in value.' : d < 0 ? 'We give ' + money(-d) + ' more in value than we get.' : 'Both sides are equal in value.') + '</p>'; }
    if (sec.key === 'ed') {
      const t = Calc.edTotals(rec);
      top = '<div class="note-box">' + icon('info') + '<p>' + esc(sec.banner) + '</p></div><div class="money-grid"><div><span>Smarter Home Improvements put in</span><strong data-testid="ed-lynn">' + money(t.lynn) + '</strong></div><div><span>Ed Robinson put in</span><strong data-testid="ed-ed">' + money(t.ed) + '</strong></div><div><span>Total</span><strong>' + money(t.total) + '</strong></div></div>' +
        ((rec.contributions || []).length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Who</th><th>Type</th><th>What</th><th class="r">Value</th></tr></thead><tbody>' + rec.contributions.map(c => '<tr><td>' + esc(c.party === 'Ed Robinson' ? 'Ed' : 'Lynn') + '</td><td>' + esc(c.type) + '</td><td>' + esc(c.desc) + (c.date ? '<br><span class="small">' + D.short(c.date) + '</span>' : '') + '</td><td class="r">' + money(c.value) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="small">No contributions recorded yet.</p>') +
        '<section class="agreement"><h2>Negotiated compensation</h2>' + (rec.agreement ? '<p class="pre">' + esc(rec.agreement) + '</p>' : '<p class="muted">No agreement recorded yet.</p>') + '</section>';
    }
    if (sec.key === 'sidejobs') top = '<p class="pay-status ' + ({ Approved: 'ok', Declined: 'bad' }[rec.approval] || 'warn') + '">Owner approval: <strong>' + esc(rec.approval || 'Pending') + '</strong>' + (rec.approvalDate ? ' on ' + D.short(rec.approvalDate) : '') + '</p>';
    if (sec.key === 'handbook' || sec.key === 'policies') top = '<div class="prose">' + esc(rec.body || '').split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('') + '</div>';
    const prose = ['handbook', 'policies'].includes(sec.key);
    const photos = sec.fields.find(f => f.type === 'photos') && (rec.photos || []).length ? '<section class="related"><h2>Photos <span class="count">' + rec.photos.length + '</span></h2><div class="thumbs view" data-ids="' + esc(JSON.stringify(rec.photos)) + '"></div></section>' : '';
    const sub = sec.sub ? sec.sub(rec) : '';
    const b = sec.badge ? sec.badge(rec) : null;
    $('#view').innerHTML = secHead(sec) + '<article class="record"><div class="rec-title"><h1>' + esc(sec.title(rec) || '(untitled)') + '</h1>' + (b ? '<span class="badge ' + b.c + '">' + esc(b.t) + '</span>' : '') + '</div>' + (sub && !prose ? '<p class="rec-sub">' + esc(sub) + '</p>' : '') +
      '<div class="actions" role="toolbar" aria-label="Record actions">' +
      acts.map(([a, ic, l, c]) => '<button type="button" class="btn ' + (c || 'ghost') + '" data-act="' + a + '">' + icon(ic) + '<span>' + esc(l) + '</span></button>').join('') +
      '<button type="button" class="btn ghost" data-act="edit" data-testid="edit">' + icon('edit') + '<span>Edit</span></button>' +
      '<button type="button" class="btn ghost" data-act="print" data-testid="print">' + icon('print') + '<span>Print</span></button>' +
      '<button type="button" class="btn ghost" data-act="share" data-testid="share">' + icon('shareout') + '<span>Share PDF</span></button>' +
      (sec.key !== 'reminders' ? '<button type="button" class="btn ghost" data-act="remind">' + icon('bell') + '<span>Remind me</span></button>' : '') +
      '<button type="button" class="btn ghost danger-text" data-act="delete" data-testid="delete">' + icon('trash') + '<span>Delete</span></button></div>' +
      top + (!prose && fieldsHTML ? '<dl class="kv">' + fieldsHTML + '</dl>' : (sec.key === 'policies' && rec.effective ? '<p class="small">Starts on ' + D.pretty(rec.effective) + '</p>' : '')) + photos + extra + '</article>';
    const tb = $('.thumbs.view'); if (tb) Fields.fillThumbs(tb, JSON.parse(tb.dataset.ids), false);
    document.title = (sec.title(rec) || sec.label) + ' — My Business Book';
  }

  /* ---------------- Form ---------------- */
  function renderForm(r) {
    const sec = SEC[r.sec];
    const existing = r.id ? Store.get(r.id) : null;
    if (r.id && !existing) { $('#view').innerHTML = '<div class="empty"><h2>This record is not here</h2><button type="button" class="btn primary" data-back>Go back</button></div>'; return; }
    const rec = existing ? Object.assign({}, existing) : { section: sec.key };
    if (!existing) {
      for (const f of sec.fields) { if (f.default != null && rec[f.key] == null) rec[f.key] = typeof f.default === 'function' ? f.default() : f.default; }
      for (const [k, v] of Object.entries(r.q || {})) if (sec.fields.find(f => f.key === k)) rec[k] = v;
      if (sec.key === 'jobs' && rec.customerId) { const c = Store.get(rec.customerId); if (c && !rec.address) rec.address = c.address || ''; }
      if (sec.key === 'hours' && rec.workerId) { const w = Store.get(rec.workerId); if (w) rec.rate = w.rate; }
      if (sec.key === 'reminders' && r.q.link) { rec.link = r.q.link; const [ls, li] = r.q.link.split(':'); const lr = Store.get(li); if (lr && SEC[ls]) { rec.linkLabel = SEC[ls].title(lr); rec.title = rec.title || ('Follow up: ' + SEC[ls].title(lr)); } }
    }
    const v = $('#view');
    v.innerHTML = secHead(sec, (existing ? 'Edit ' : 'New ') + sec.noun) + (existing ? '' : '<p class="intro">' + esc(sec.intro) + '</p>') +
      '<form class="rec-form" novalidate autocomplete="off">' + sec.fields.map(f => Fields.render(f, f.type === 'toggle' && rec[f.key] == null ? '' : rec[f.key], rec)).join('') +
      '<p class="small req-note"><span class="req">*</span> needed. Everything else is optional.</p>' +
      '<div class="form-actions"><button type="button" class="btn ghost" data-back>' + icon('x') + '<span>Cancel</span></button><button type="submit" class="btn primary" data-testid="save">' + icon('check') + '<span>Save</span></button></div></form>';
    const form = $('form', v);
    formCtx = { hash: location.hash, dirty: false, newPhotos: [], removedPhotos: [], sec: sec.key, id: r.id };
    formCtx.onChange = () => liveCalc(sec, form);
    Fields.wire(form, formCtx);
    if (sec.key === 'jobs') {
      const cust = $('.field[data-key="customerId"] select', form), addr = $('.field[data-key="address"] input', form);
      cust.addEventListener('change', () => { const c = Store.get(cust.value); if (c && c.address && !addr.value) addr.value = c.address; });
      $('.field[data-key="status"] .segmented', form).addEventListener('change', () => {
        const on = $('.field[data-key="status"] .seg.on', form);
        if (on && on.dataset.val === 'Paid') { const tmp = Object.assign({}, rec, Fields.read(sec.fields, form)); const m = Calc.jobMoney(tmp); if (m.received <= 0 || m.balance > 0.004) toast('Payments recorded so far: ' + money(m.received) + ' of ' + money(m.billed) + '. Record the payment first.', { kind: 'bad', ms: 6000 }); }
      });
    }
    if (sec.key === 'hours') {
      const w = $('.field[data-key="workerId"] select', form), rate = $('.field[data-key="rate"] input', form);
      w.addEventListener('change', () => { const wr = Store.get(w.value); if (wr && wr.rate !== '' && wr.rate != null) rate.value = wr.rate; liveCalc(sec, form); });
    }
    if (sec.key === 'receipts') {
      const inv = $('.field[data-key="invoiceId"] select', form), amt = $('.field[data-key="amount"] input', form);
      inv.addEventListener('change', () => { const i = Store.get(inv.value); if (!i) return; const st = Calc.invoiceStatus(i); if (!amt.value && st.balance > 0) amt.value = st.balance; const cs = $('.field[data-key="customerId"] select', form), js = $('.field[data-key="jobId"] select', form); if (i.customerId && !cs.value) cs.value = i.customerId; if (i.jobId && !js.value) js.value = i.jobId; });
    }
    form.addEventListener('submit', e => { e.preventDefault(); saveForm(sec, existing, rec, form); });
    liveCalc(sec, form);
  }
  function liveCalc(sec, form) {
    const box = $('.calc-box', form);
    const vals = Fields.read(sec.fields, form);
    if (sec.key === 'hours' && box) box.innerHTML = n(vals.hours) + ' hrs × ' + money(vals.rate) + ' = <strong>' + money(n(vals.hours) * n(vals.rate)) + '</strong>';
    if (sec.key === 'materials' && box) box.innerHTML = n(vals.qty) + ' × ' + money(vals.unitCost) + ' = <strong>' + money(n(vals.qty) * n(vals.unitCost)) + '</strong>';
    if (sec.key === 'trades' && box) { const d = n(vals.getValue) - n(vals.giveValue); box.innerHTML = 'Difference (what we get − what we give): <strong class="' + (d < 0 ? 'bad' : '') + '">' + money(d) + '</strong>'; }
    const it = $('.field[data-type="items"]', form);
    if (it) {
      $$('.item-row', it).forEach(rw => { $('.it-amt', rw).textContent = money(n($('.it-qty', rw).value) * n($('.it-price', rw).value)); });
      const t = Calc.itemsTotal(vals.items, vals.taxRate);
      $('.items-total', it).innerHTML = '<span>Subtotal ' + money(t.subtotal) + '</span>' + (t.tax ? '<span>Tax ' + money(t.tax) + '</span>' : '') + '<strong>Total ' + money(t.total) + '</strong>';
    }
    const ct = $('.field[data-type="contributions"]', form);
    if (ct) { const t = Calc.edTotals({ contributions: vals.contributions }); $('.contrib-total', ct).innerHTML = 'Lynn / company: <strong>' + money(t.lynn) + '</strong> · Ed Robinson: <strong>' + money(t.ed) + '</strong>'; }
  }
  async function saveForm(sec, existing, base, form) {
    const vals = Fields.read(sec.fields, form);
    for (const f of sec.fields) {
      if (!f.required) continue;
      const val = vals[f.key];
      if (val === '' || val == null || (Array.isArray(val) && !val.length)) {
        toast('Please fill in "' + f.label + '".', { kind: 'bad' });
        const el = $('.field[data-key="' + f.key + '"]', form); el.classList.add('invalid'); const i = $('input,select,textarea', el); if (i) i.focus(); el.scrollIntoView({ block: 'center' });
        return;
      }
    }
    let rec = Object.assign({}, base, vals);
    if (sec.beforeSave) rec = sec.beforeSave(rec);
    if (sec.key === 'jobs' && rec.customerId && !rec.address) { const c = Store.get(rec.customerId); if (c) rec.address = c.address || ''; }
    const err = sec.validate ? sec.validate(rec) : null;
    if (err) { toast(err, { kind: 'bad', ms: 7000 }); return; }
    const btn = $('[data-testid="save"]', form); btn.disabled = true;
    try {
      const saved = await Store.put(rec);
      for (const id of (formCtx.removedPhotos || [])) { if (!(saved.photos || []).includes(id)) await Store.delPhoto(id).catch(() => { }); }
      if (sec.key === 'planner') await syncPlannerReminder(saved);
      formCtx = null;
      toast('Saved ✓');
      if (existing) history.back();
      else go('#s/' + sec.key + '/' + saved.id, { replace: true });
    } catch (e) {
      btn.disabled = false;
      toast('Could not save: ' + e.message, { kind: 'bad' });
    }
  }
  async function syncPlannerReminder(p) {
    const ex = Store.list('reminders').find(x => x.link === 'planner:' + p.id);
    if (p.remind && !p.done) {
      await Store.put(Object.assign({}, ex || { section: 'reminders' }, { title: p.title, dueDate: p.date, dueTime: p.time || '', link: 'planner:' + p.id, linkLabel: 'Daily Planner', done: false, notified: ex && ex.dueDate === p.date && ex.dueTime === (p.time || '') ? ex.notified : false }));
    } else if (ex) {
      if (p.done) await Store.put(Object.assign({}, ex, { done: true })); else await Store.del(ex.id);
    }
  }

  /* ---------------- Record actions ---------------- */
  async function deleteRecord(secKey, id) {
    const sec = SEC[secKey]; const rec = Store.get(id); if (!rec) return;
    let warn = 'This cannot be undone.';
    if (secKey === 'jobs') { const linked = ['hours', 'materials', 'expenses', 'receipts', 'invoices', 'estimates'].reduce((a, s) => a + Store.list(s).filter(x => x.jobId === id).length, 0); if (linked) warn = linked + ' linked record(s) such as hours, materials or payments will stay in the book but will no longer be linked to a job. This cannot be undone.'; }
    if (secKey === 'customers') { const linked = Store.list('jobs').filter(j => j.customerId === id).length; if (linked) warn = 'This customer has ' + linked + ' job(s). The jobs stay but will no longer show a customer. This cannot be undone.'; }
    if (secKey === 'receipts') warn = 'Deleting this receipt removes the payment of ' + money(rec.amount) + ' from the book, so balances will go back up. This cannot be undone.';
    const ok = await confirmDialog({ title: 'Delete this ' + sec.noun + '?', text: '"' + (sec.title(rec) || '') + '" — ' + warn, ok: 'Yes, delete', danger: true });
    if (!ok) return;
    for (const pid of (rec.photos || [])) await Store.delPhoto(pid).catch(() => { });
    for (const rm of Store.list('reminders').filter(x => x.link === secKey + ':' + id)) await Store.del(rm.id);
    if (secKey === 'workers') for (const j of Store.list('jobs').filter(j => (j.workerIds || []).includes(id))) await Store.put(Object.assign({}, j, { workerIds: j.workerIds.filter(x => x !== id) }));
    await Store.del(id);
    toast('Deleted');
    history.back();
  }
  async function recordPayment(rec, secKey) {
    const isInv = secKey === 'invoices';
    const job = isInv ? Store.get(rec.jobId) : rec;
    const suggested = isInv ? Math.max(Calc.invoiceStatus(rec).balance, 0) : Math.max(Calc.jobMoney(rec).balance, 0);
    const invs = isInv ? [rec] : Store.list('invoices').filter(i => i.jobId === rec.id && Calc.invoiceStatus(i).balance > 0.004);
    const res = await modal('<h2 id="mdl-title">Record a payment</h2><p>Only record money you have actually received.</p>' +
      '<div class="field"><label for="rp-amt">Amount received</label><div class="money-input"><span>$</span><input id="rp-amt" type="number" inputmode="decimal" step="0.01" min="0" value="' + (suggested ? suggested.toFixed(2) : '') + '" autofocus></div>' + (suggested ? '<p class="help">Balance due is ' + money(suggested) + '.</p>' : '') + '</div>' +
      '<div class="field"><label for="rp-date">Date received</label><input id="rp-date" type="date" value="' + D.today() + '"></div>' +
      '<div class="field"><label for="rp-method">Paid by</label><input id="rp-method" type="text" value="Cash"><div class="chips">' + Sections.METHODS.map(m => '<button type="button" class="chip" data-m="' + m + '">' + m + '</button>').join('') + '</div></div>' +
      (!isInv && invs.length ? '<div class="field"><label for="rp-inv">Apply to invoice</label><select id="rp-inv"><option value="">— no specific invoice —</option>' + invs.map(i => '<option value="' + i.id + '"' + (invs.length === 1 ? ' selected' : '') + '>' + esc(Fields.refLabel(i)) + '</option>').join('') + '</select></div>' : '') +
      '<div class="field"><label for="rp-note">Note</label><input id="rp-note" type="text"><div class="chips">' + ['Deposit', 'Partial payment', 'Final payment'].map(m => '<button type="button" class="chip" data-nt="' + m + '">' + m + '</button>').join('') + '</div></div>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Cancel</button><button type="button" class="btn primary" data-close="ok" data-testid="confirm-ok">Save payment</button></div>',
      { collect: w => ({ amount: r2(parseFloat($('#rp-amt', w).value)), date: $('#rp-date', w).value || D.today(), method: $('#rp-method', w).value.trim(), invoiceId: isInv ? rec.id : ($('#rp-inv', w) ? $('#rp-inv', w).value : ''), notes: $('#rp-note', w).value.trim() }), wire: w => { $$('[data-m]', w).forEach(b => b.onclick = () => { $('#rp-method', w).value = b.dataset.m; }); $$('[data-nt]', w).forEach(b => b.onclick = () => { $('#rp-note', w).value = b.dataset.nt; }); } });
    if (!res) return;
    if (!(res.amount > 0)) { toast('Enter the amount you received.', { kind: 'bad' }); return; }
    const receipt = await Store.put({ section: 'receipts', number: Sections.nextNumber('receipts', 'RCT'), date: res.date, customerId: rec.customerId || (job && job.customerId) || '', jobId: isInv ? (rec.jobId || '') : rec.id, invoiceId: res.invoiceId || '', amount: res.amount, method: res.method, notes: res.notes });
    render();
    toast('Payment of ' + money(res.amount) + ' saved. Receipt ' + receipt.number + ' made.', { action: 'Open receipt', onAction: () => go('#s/receipts/' + receipt.id), ms: 7000 });
  }
  async function toInvoice(est) {
    if (est.invoiceId && Store.get(est.invoiceId)) return go('#s/invoices/' + est.invoiceId);
    const ok = await confirmDialog({ title: 'Make an invoice?', text: 'This copies the customer, job and every line from ' + (est.number || 'this estimate') + ' into a new invoice and marks the estimate Accepted.', ok: 'Make invoice' });
    if (!ok) return;
    const inv = await Store.put({ section: 'invoices', number: Sections.nextNumber('invoices', 'INV'), date: D.today(), dueDate: D.add(D.today(), 7), customerId: est.customerId || '', jobId: est.jobId || '', estimateId: est.id, items: JSON.parse(JSON.stringify(est.items || [])), taxRate: est.taxRate || 0, notes: '' });
    await Store.put(Object.assign({}, est, { invoiceId: inv.id, status: 'Accepted' }));
    toast('Invoice ' + inv.number + ' made from ' + (est.number || 'estimate'));
    go('#s/invoices/' + inv.id);
  }
  async function assignWorker(w) {
    const jobs = Store.list('jobs').filter(j => !['Paid', 'Canceled'].includes(j.status) && !(j.workerIds || []).includes(w.id));
    if (!jobs.length) { toast('No open jobs to assign. Add a job first.'); return; }
    const id = await modal('<h2 id="mdl-title">Assign ' + esc(w.name) + ' to a job</h2><div class="field"><label for="as-job">Job</label><select id="as-job">' + jobs.map(j => '<option value="' + j.id + '">' + esc(Fields.refLabel(j)) + '</option>').join('') + '</select></div><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Cancel</button><button type="button" class="btn primary" data-close="ok" data-testid="confirm-ok">Assign</button></div>', { collect: wr => $('#as-job', wr).value });
    if (!id) return;
    const j = Store.get(id);
    await Store.put(Object.assign({}, j, { workerIds: (j.workerIds || []).concat(w.id) }));
    toast(w.name + ' assigned to ' + j.title); render();
  }
  async function doShare(spec) {
    try {
      toast('Making PDF…');
      const blob = await PDF.blob(spec);
      window.__lastPdf = { name: spec.filename, size: blob.size };
      const res = await UI.shareFile(blob, spec.filename, spec.title + (spec.number ? ' ' + spec.number : ''));
      toast(res === 'downloaded' ? 'PDF saved: ' + spec.filename : res === 'shared' ? 'Shared ✓' : 'Share cancelled');
    } catch (e) { console.error(e); toast('Could not make the PDF: ' + e.message, { kind: 'bad' }); }
  }
  function specToHTML(spec) {
    const b = spec.business;
    let h = '<div class="pr-doc"><header class="pr-head"><img src="assets/logo.png" alt="Smarter Home Improvements logo"><div class="pr-biz"><strong>' + esc(b.name) + '</strong><span>' + esc(b.owner) + ', Owner</span><span>' + esc(b.phone) + '</span><span>' + esc(b.city) + '</span><em>' + esc(b.slogan) + '</em></div></header><div class="pr-title"><span>' + esc(spec.title) + '</span><span>' + esc(spec.number || '') + '</span></div>';
    for (const bl of spec.blocks) {
      if (bl.heading) h += '<h2>' + esc(bl.heading) + '</h2>';
      if (bl.kv) h += '<dl>' + bl.kv.filter(([, v]) => v !== '' && v != null).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>';
      if (bl.table) h += '<table><thead><tr>' + bl.table.cols.map(c => '<th class="' + (c.align === 'right' ? 'r' : '') + '">' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' + (bl.table.rows.length ? bl.table.rows.map(rw => '<tr>' + rw.map((c, i) => '<td class="' + (bl.table.cols[i].align === 'right' ? 'r' : '') + '">' + esc(c) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + bl.table.cols.length + '">No entries.</td></tr>') + '</tbody></table>';
      if (bl.totals) h += '<table class="pr-tot">' + bl.totals.map(([k, v, bold]) => '<tr class="' + (bold ? 'bold' : '') + '"><td>' + esc(k) + '</td><td class="r">' + esc(v) + '</td></tr>').join('') + '</table>';
      if (bl.text) h += '<p class="pre">' + esc(bl.text) + '</p>';
      if (bl.signature) h += '<div class="pr-sign"><div>' + esc(bl.signature[0]) + '</div><div>' + esc(bl.signature[1] || 'Date') + '</div></div>';
    }
    return h + '<footer>' + esc(b.name + ' · ' + b.phone + ' · ' + b.city + ' · ' + b.slogan) + '</footer></div>';
  }
  async function doPrint(spec) {
    if (UI.NATIVE) {
      try { toast('Opening the print screen…'); const blob = await PDF.blob(spec); await Native.printPdf(blob, spec.filename || 'document.pdf'); }
      catch (e) { console.error(e); toast('Printing is not available on this phone. Use Share PDF and pick a print app instead.', { kind: 'bad', ms: 7000 }); }
      return;
    }
    const pa = $('#print-area');
    pa.innerHTML = specToHTML(spec);
    window.__lastPrint = { title: spec.title, html: pa.innerHTML.length };
    const img = $('img', pa);
    const fire = () => { try { window.print(); } catch (e) { toast('Printing is not available here. Use Share PDF instead.'); } };
    if (img && !img.complete) { img.onload = fire; img.onerror = fire; } else setTimeout(fire, 50);
  }
  window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; });
  function listSpec(secKey) {
    const sec = SEC[secKey];
    const recs = Store.list(secKey).sort(sec.sort || (() => 0));
    return { title: sec.label, number: recs.length + ' record' + (recs.length === 1 ? '' : 's'), business: Sections.biz(), filename: 'Smarter-' + secKey + '-list-' + D.today() + '.pdf', blocks: [{ table: { cols: [{ label: 'Record', w: 0.42 }, { label: 'Details', w: 0.33 }, { label: 'Status / Amount', w: 0.25, align: 'right' }], rows: recs.map(x => { const b = sec.badge ? sec.badge(x) : null; return [sec.title(x) || '', sec.sub ? sec.sub(x) : '', [b ? b.t : '', sec.amount ? sec.amount(x) : ''].filter(Boolean).join(' · ')]; }) } }] };
  }

  /* ---------------- CSV / Backup ---------------- */
  function csvEscape(v) { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csvFor(secKey) {
    const sec = SEC[secKey];
    const cols = sec.fields.filter(f => !['note', 'calc'].includes(f.type));
    const extra = [];
    if (secKey === 'jobs') extra.push(['Costs', r => Calc.jobMoney(r).costs], ['Payments received', r => Calc.jobMoney(r).received], ['Balance', r => Calc.jobMoney(r).balance], ['Profit', r => Calc.jobMoney(r).profit], ['Company share', r => Calc.jobMoney(r).share], ['Payment status', r => Calc.jobMoney(r).payStatus]);
    if (secKey === 'invoices' || secKey === 'estimates') extra.push(['Total', r => Calc.itemsTotal(r.items, r.taxRate).total]);
    if (secKey === 'invoices') extra.push(['Paid', r => Calc.invoiceStatus(r).paid], ['Balance', r => Calc.invoiceStatus(r).balance], ['Payment status', r => Calc.invoiceStatus(r).status]);
    if (secKey === 'hours') extra.push(['Pay', r => Calc.laborCost(r)]);
    if (secKey === 'materials') extra.push(['Total cost', r => r2(n(r.qty) * n(r.unitCost))]);
    if (secKey === 'trades') extra.push(['Difference', r => Calc.tradeDiff(r)]);
    if (secKey === 'ed') extra.push(['Lynn contributed', r => Calc.edTotals(r).lynn], ['Ed contributed', r => Calc.edTotals(r).ed]);
    const head = cols.map(f => f.label).concat(extra.map(e => e[0])).concat(['Created', 'Updated']);
    const rows = Store.list(secKey).sort(sec.sort || (() => 0)).map(r => cols.map(f => {
      const v = r[f.key];
      if (f.type === 'items') return (v || []).map(it => it.desc + ' x' + it.qty + ' @ ' + it.price).join('; ');
      if (f.type === 'contributions') return (v || []).map(c => c.party + ' / ' + c.type + ' / ' + c.desc + ' / ' + c.value).join('; ');
      if (f.type === 'photos') return (v || []).length + ' photo(s)';
      if (f.type === 'ref') return Fields.refName(v);
      if (f.type === 'multiref') return (v || []).map(Fields.refName).join(', ');
      if (f.type === 'toggle') return v ? 'Yes' : 'No';
      return v == null ? '' : v;
    }).concat(extra.map(e => e[1](r))).concat([r.createdAt || '', r.updatedAt || '']));
    return '\ufeff' + [head].concat(rows).map(rw => rw.map(csvEscape).join(',')).join('\r\n');
  }
  function payrollCSV(fri) {
    const pr = Calc.payroll(fri);
    const rows = [['Week ending', 'Worker', 'Date', 'Job', 'Hours', 'Rate', 'Pay', 'Paid date']];
    for (const rw of pr.rows) for (const e of rw.entries) rows.push([fri, rw.name, e.date, e.jobId ? Fields.refName(e.jobId) : '', n(e.hours), n(e.rate), Calc.laborCost(e), rw.paid ? rw.paid.paidDate : '']);
    rows.push([fri, 'TOTAL', '', '', pr.totalHours, '', pr.total, '']);
    return '\ufeff' + rows.map(rw => rw.map(csvEscape).join(',')).join('\r\n');
  }
  function exportCSV(name, text) {
    const blob = new Blob([text], { type: 'text/csv' });
    window.__lastCsv = { name, size: blob.size };
    UI.download(blob, name).then(msg => toast(UI.NATIVE ? msg : 'CSV saved: ' + name), e => toast('Could not save: ' + e.message, { kind: 'bad' }));
  }
  async function buildBackup() {
    const records = Store.list();
    const photos = [];
    for (const id of await Store.allPhotoIds()) {
      const b = await Store.getPhoto(id).catch(() => null);
      if (!b) continue;
      const data = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
      photos.push({ id, data });
    }
    return { app: 'smarter-business-book', format: 1, version: VERSION, exportedAt: new Date().toISOString(), business: Sections.biz().name, counts: Object.fromEntries(Sections.list.map(s => [s.key, Store.list(s.key).length])), records, photos };
  }
  function validateBackup(obj) {
    if (!obj || typeof obj !== 'object') return 'That file is not a backup.';
    if (obj.app !== 'smarter-business-book') return 'That file is not a Smarter Business Book backup.';
    if (obj.format !== 1) return 'This backup was made by a different version of the app.';
    if (!Array.isArray(obj.records)) return 'The backup has no records list.';
    const okSec = new Set(Sections.list.map(s => s.key).concat(['_settings']));
    for (const r of obj.records) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 100) return 'A record in the backup is damaged (missing id).';
      if (!okSec.has(r.section)) return 'A record in the backup has an unknown section: ' + String(r.section).slice(0, 30);
    }
    if (obj.photos && !Array.isArray(obj.photos)) return 'The photos in the backup are damaged.';
    for (const p of obj.photos || []) if (!p || typeof p.id !== 'string' || typeof p.data !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(p.data)) return 'A photo in the backup is damaged.';
    return null;
  }
  async function restoreBackup(obj, mode) {
    const bad = validateBackup(obj); if (bad) throw new Error(bad);
    if (mode === 'replace') await Store.clearRecords();
    const toPut = [];
    for (const r of obj.records) {
      const ex = Store.get(r.id);
      if (mode === 'merge' && ex && (ex.updatedAt || '') >= (r.updatedAt || '')) continue;
      toPut.push(r);
    }
    await Store.putMany(toPut);
    for (const p of obj.photos || []) { const b = await (await fetch(p.data)).blob(); await Store.putPhoto(b, p.id); }
    return toPut.length;
  }

  /* ---------------- Search ---------------- */
  function searchResults(q) {
    if (!q) return '<p class="small center">Start typing to search.</p>';
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = {};
    for (const r of Store.list()) {
      const sec = SEC[r.section]; if (!sec) continue;
      const parts = [];
      for (const f of sec.fields) {
        const v = r[f.key]; if (v == null || v === '') continue;
        if (f.type === 'ref') parts.push(Fields.refName(v));
        else if (f.type === 'multiref') parts.push((v || []).map(Fields.refName).join(' '));
        else if (f.type === 'items') parts.push((v || []).map(i => i.desc + ' ' + i.price).join(' '));
        else if (f.type === 'contributions') parts.push((v || []).map(c => c.party + ' ' + c.type + ' ' + c.desc + ' ' + c.value).join(' '));
        else if (f.type !== 'photos' && f.type !== 'toggle') parts.push(String(v));
        if (f.type === 'money') parts.push(money(v));
      }
      const hay = parts.join(' ').toLowerCase();
      if (words.every(w => hay.includes(w))) (groups[sec.key] = groups[sec.key] || []).push(r);
    }
    const keys = Object.keys(groups);
    if (!keys.length) return '<div class="empty small"><p>Nothing found for "' + esc(q) + '".</p></div>';
    return keys.map(k => '<h2 class="sub-h">' + esc(SEC[k].label) + ' <span class="count">' + groups[k].length + '</span></h2><div class="cards">' + groups[k].sort(SEC[k].sort || (() => 0)).map(x => card(SEC[k], x)).join('') + '</div>').join('');
  }

  /* ---------------- Tools ---------------- */
  function renderTool(r) {
    const v = $('#view');
    if (r.tool === 'search') {
      v.innerHTML = '<header class="sec-head" style="--tab:#c9972b"><span class="sec-ic">' + icon('search') + '</span><h1>Search everything</h1></header><p class="intro">Type a name, phone, address, job, amount or word. Searches every tab.</p><div class="filter big"><label class="vh" for="q">Search</label>' + icon('search') + '<input id="q" type="search" placeholder="e.g. Johnson, drywall, 254…" value="' + esc(r.q.q || '') + '">' + UI.micButton('q') + '</div><div id="results"></div>';
      const q = $('#q'); UI.wireMics(v);
      const run = () => { const t = q.value.trim(); history.replaceState(history.state, '', '#tool/search' + (t ? '?q=' + encodeURIComponent(t) : '')); $('#results').innerHTML = searchResults(t); };
      q.addEventListener('input', run); run(); setTimeout(() => q.focus(), 50);
      return;
    }
    if (r.tool === 'backup') {
      const s = Calc.settings();
      v.innerHTML = '<header class="sec-head" style="--tab:#4a5a70"><span class="sec-ic">' + icon('backup') + '</span><h1>Backup &amp; Export</h1></header>' +
        '<div class="note-box">' + icon('info') + '<p>Your records live only on this phone. A backup file is your safety copy if the phone is lost, broken or reset. Save one every week and keep it somewhere safe (email it to yourself or put it in Google Drive). <strong>Backup files are not locked with your PIN</strong> — keep them private.</p></div>' +
        '<p class="small">' + (s.lastBackup ? 'Last backup: ' + D.pretty(s.lastBackup.slice(0, 10)) : 'No backup saved yet.') + '</p>' +
        '<button type="button" class="btn primary big" data-act="backup" data-testid="backup">' + icon('download') + '<span>Save a full backup (records and photos)</span></button>' +
        '<label class="btn ghost big" for="restore-file">' + icon('upload') + '<span>Restore from a backup file</span></label><input id="restore-file" class="vh" type="file" accept=".json,application/json">' +
        '<h2 class="sub-h">Export a spreadsheet (CSV) for one tab</h2><div class="csv-grid">' + Sections.list.map(x => '<button type="button" class="btn ghost" data-act="csv-sec" data-sec="' + x.key + '" style="--tab:' + x.color + '"><span class="dotc" aria-hidden="true"></span><span>' + esc(x.label) + '</span></button>').join('') + '</div>';
      $('#restore-file').addEventListener('change', async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        let obj; try { obj = JSON.parse(await f.text()); } catch (err) { toast('That file could not be read as a backup.', { kind: 'bad' }); return; }
        const bad = validateBackup(obj); if (bad) { toast(bad, { kind: 'bad', ms: 6000 }); return; }
        const mode = await modal('<h2 id="mdl-title">Restore this backup?</h2><p>Backup from ' + esc(new Date(obj.exportedAt).toLocaleString('en-US')) + ' with ' + obj.records.length + ' records and ' + (obj.photos || []).length + ' photos.</p><div class="modal-actions col"><button type="button" class="btn primary" data-mode="merge">Add to what is here (keep newer copies)</button><button type="button" class="btn danger" data-mode="replace">Replace everything with the backup</button><button type="button" class="btn ghost" data-close="cancel">Cancel</button></div>', { wire: (w, close) => $$('[data-mode]', w).forEach(b => b.onclick = () => close(b.dataset.mode)) });
        if (!mode) return;
        if (mode === 'replace' && !(await confirmDialog({ title: 'Replace everything?', text: 'Everything now in the book will be removed and replaced with the backup.', ok: 'Yes, replace', danger: true }))) return;
        try { const cnt = await restoreBackup(obj, mode); toast('Restored ' + cnt + ' records ✓'); render(); } catch (err) { toast('Restore failed: ' + err.message, { kind: 'bad' }); }
      });
      return;
    }
    if (r.tool === 'settings') {
      const s = Calc.settings(); const b = Sections.biz();
      v.innerHTML = '<header class="sec-head" style="--tab:#4a5a70"><span class="sec-ic">' + icon('settings') + '</span><h1>Settings</h1></header>' +
        '<form id="set-form" class="rec-form" novalidate><h2 class="sub-h">25% company share</h2>' +
        '<div class="field"><label for="s-pct">Company share percent</label><div class="stepper"><button type="button" class="step" data-step="-1" data-for="s-pct" aria-label="Less">' + icon('minus') + '</button><input id="s-pct" type="number" step="1" min="0" max="100" value="' + n(s.sharePct) + '"><button type="button" class="step" data-step="1" data-for="s-pct" aria-label="More">' + icon('plus') + '</button><span class="unit">%</span></div></div>' +
        '<div class="field" data-key="shareBase"><span class="label">Figure the share from</span><div class="segmented col" role="radiogroup">' + [['price', 'Job price', 'The full amount the customer is charged (invoice totals if invoiced). Simplest.'], ['received', 'Payments received', 'Only money actually collected. The share grows as payments come in.'], ['profit', 'Profit', 'What is left after materials, expenses and labor. Never below $0.']].map(([k, l, d]) => '<button type="button" role="radio" class="seg' + (s.shareBase === k ? ' on' : '') + '" aria-checked="' + (s.shareBase === k) + '" data-val="' + k + '"><strong>' + l + '</strong><span>' + d + '</span></button>').join('') + '</div></div>' +
        '<h2 class="sub-h">Business details on PDFs</h2>' +
        '<div class="field"><label for="s-owner">Owner</label><input id="s-owner" type="text" value="' + esc(b.owner) + '"></div><div class="field"><label for="s-phone">Phone</label><input id="s-phone" type="tel" value="' + esc(b.phone) + '"></div><div class="field"><label for="s-city">City</label><input id="s-city" type="text" value="' + esc(b.city) + '"></div><div class="field"><label for="s-slogan">Slogan</label><input id="s-slogan" type="text" value="' + esc(b.slogan) + '"></div>' +
        '<h2 class="sub-h">Lock</h2><div class="field"><label for="s-lock">Lock the book after this long without use</label><select id="s-lock">' + [1, 2, 5, 10, 15, 30].map(m => '<option value="' + m + '"' + (n(s.autoLockMin) === m ? ' selected' : '') + '>' + m + ' minute' + (m > 1 ? 's' : '') + '</option>').join('') + '</select></div>' +
        '<div class="form-actions"><button type="submit" class="btn primary" data-testid="save-settings">' + icon('check') + '<span>Save settings</span></button></div></form>' +
        '<h2 class="sub-h">PIN and privacy</h2><div class="note-box">' + icon('lock') + '<p>Your PIN protects the book on this phone. Records and photos are stored encrypted (AES-GCM) with a key made from your PIN, and nothing is sent to any server. If you forget the PIN the records cannot be opened — keep a backup.</p></div>' +
        '<div class="btn-col"><button type="button" class="btn ghost big" data-act="change-pin">' + icon('lock') + '<span>Change my PIN</span></button><button type="button" class="btn ghost big" data-act="lock">' + icon('lock') + '<span>Lock the book now</span></button>' +
        (UI.NATIVE ? '<button type="button" class="btn ghost big" data-act="enable-notify">' + icon('bell') + '<span>Allow reminder notifications</span></button>' : '') +
        (!UI.NATIVE && 'Notification' in window && Notification.permission === 'default' ? '<button type="button" class="btn ghost big" data-act="enable-notify">' + icon('bell') + '<span>Allow reminder notifications</span></button>' : '') +
        '<button type="button" class="btn ghost big" data-act="install" id="install-btn"' + (deferredInstall ? '' : ' hidden') + '>' + icon('install') + '<span>Install on home screen</span></button></div>' +
        '<h2 class="sub-h">Storage</h2><p class="small" id="storage-info">Checking…</p>' +
        '<h2 class="sub-h">Erase</h2><button type="button" class="btn danger big" data-act="erase">' + icon('trash') + '<span>Erase the whole book from this phone</span></button>' +
        '<p class="small center">My Business Book v' + VERSION + ' · works offline · ' + (UI.NATIVE ? 'Android app' : (UI.voiceSupported ? 'voice typing available' : 'voice typing not supported in this browser')) + '</p>';
      storageInfo();
      const form = $('#set-form'); Fields.wire(form, {});
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const pct = n($('#s-pct').value);
        if (pct < 0 || pct > 100) { toast('Percent must be between 0 and 100.', { kind: 'bad' }); return; }
        const on = $('.field[data-key="shareBase"] .seg.on', form);
        await Store.put(Object.assign({}, Store.get('settings') || { id: 'settings', section: '_settings' }, { sharePct: pct, shareBase: on ? on.dataset.val : 'price', owner: $('#s-owner').value.trim(), phone: $('#s-phone').value.trim(), city: $('#s-city').value.trim(), slogan: $('#s-slogan').value.trim(), autoLockMin: n($('#s-lock').value) }));
        toast('Settings saved ✓');
      });
      return;
    }
    home();
  }
  async function storageInfo() {
    const el = $('#storage-info'); if (!el) return;
    let txt = '';
    try {
      const p = UI.NATIVE ? true : (navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false);
      if (UI.NATIVE) txt += 'Records are kept in the app\'s private storage on this phone. They stay until you erase the book or uninstall the app (uninstalling deletes them — keep backups). ';
      else txt += p ? 'Storage is "persistent" — the phone will not clear it to save space. ' : 'The phone has not granted "persistent" storage yet (Chrome usually grants it once the app is installed). Keep backups. ';
      if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); txt += 'Using about ' + (e.usage / 1048576).toFixed(1) + ' MB.'; }
    } catch (e) { }
    txt += ' ' + Store.list().filter(r => r.section !== '_settings').length + ' records saved.';
    el.textContent = txt;
  }

  /* ---------------- Reminders & notifications ---------------- */
  function updateBadge() {
    if (!Store.isUnlocked()) return;
    const due = Store.list('reminders').filter(Sections.isDue).length;
    const b = $('#bell-badge');
    b.textContent = due > 9 ? '9+' : String(due);
    b.hidden = !due;
    $('#btn-bell').setAttribute('aria-label', 'Reminders' + (due ? ', ' + due + ' due' : ''));
    scheduleNative();
  }
  let schedTimer = null;
  function scheduleNative(now) {
    if (!UI.NATIVE || !Store.isUnlocked()) return;
    clearTimeout(schedTimer);
    schedTimer = setTimeout(() => Native.scheduleReminders(Store.list('reminders'), x => D.pretty(x.dueDate) + (x.dueTime ? ' ' + Fields.fmtTime(x.dueTime) : '')), now ? 0 : 1200);
  }
  async function checkReminders() {
    if (!Store.isUnlocked()) return;
    const due = Store.list('reminders').filter(x => Sections.isDue(x) && !x.notified);
    for (const x of due) {
      if (!UI.NATIVE && 'Notification' in window && Notification.permission === 'granted') {
        try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification('Reminder: ' + x.title, { body: D.pretty(x.dueDate) + (x.dueTime ? ' ' + Fields.fmtTime(x.dueTime) : ''), icon: 'icons/icon-192.png', badge: 'icons/favicon-64.png', tag: x.id }); else new Notification('Reminder: ' + x.title); } catch (e) { }
      }
      await Store.put(Object.assign({}, x, { notified: true }));
    }
    if (due.length) toast(due.length === 1 ? 'Reminder: ' + due[0].title : due.length + ' reminders are due', { action: 'View', onAction: () => go('#s/reminders'), ms: 6000 });
    updateBadge();
  }
  setInterval(checkReminders, 30000);

  /* ---------------- Global events ---------------- */
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-go],[data-go-replace],[data-back],[data-home],[data-act],.tab');
    if (!t || t.closest('.modal-wrap') && !t.dataset.act) return;
    if (t.classList.contains('tab')) {
      const sec = t.dataset.sec; const cur = parse(location.hash);
      if (sec === 'index') return home();
      go('#s/' + sec, { replace: cur.name === 'list' });
      return;
    }
    if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); return; }
    if (t.dataset.goReplace) { e.preventDefault(); go(t.dataset.goReplace, { replace: true }); return; }
    if (t.hasAttribute('data-back')) { history.back(); return; }
    if (t.hasAttribute('data-home')) { home(); return; }
    const act = t.dataset.act; const r = parse(location.hash);
    const rec = r.id ? Store.get(r.id) : null;
    switch (act) {
      case 'edit': go('#s/' + r.sec + '/' + r.id + '/edit'); break;
      case 'delete': deleteRecord(r.sec, r.id); break;
      case 'print': doPrint(Sections.docFor(r.sec, rec)); break;
      case 'share': doShare(Sections.docFor(r.sec, rec)); break;
      case 'remind': go('#s/reminders/new?link=' + r.sec + ':' + r.id); break;
      case 'record-payment': recordPayment(rec, r.sec); break;
      case 'to-invoice': toInvoice(rec); break;
      case 'assign': assignWorker(rec); break;
      case 'mark-paid': markPaid(t.dataset.worker, t.dataset.week); break;
      case 'print-payroll': doPrint(payrollSpec(t.dataset.week)); break;
      case 'share-payroll': doShare(payrollSpec(t.dataset.week)); break;
      case 'csv-payroll': exportCSV('Smarter-payroll-' + t.dataset.week + '.csv', payrollCSV(t.dataset.week)); break;
      case 'print-sharesum': doPrint(shareSumSpec()); break;
      case 'share-sharesum': doShare(shareSumSpec()); break;
      case 'print-list': doPrint(listSpec(r.sec)); break;
      case 'share-list': doShare(listSpec(r.sec)); break;
      case 'csv': exportCSV('Smarter-' + r.sec + '-' + D.today() + '.csv', csvFor(r.sec)); break;
      case 'csv-sec': exportCSV('Smarter-' + t.dataset.sec + '-' + D.today() + '.csv', csvFor(t.dataset.sec)); break;
      case 'backup': {
        t.disabled = true;
        try {
          const data = await buildBackup();
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          const name = 'smarter-business-book-backup-' + D.today() + '.json';
          window.__lastBackup = { name, size: blob.size };
          let savedMsg = '';
          if (UI.NATIVE) { const sv = await Native.save(blob, name); if (sv.where) savedMsg = 'Backup saved to ' + sv.where + '. '; }
          const res = await UI.shareFile(blob, name, 'Business Book backup');
          if (UI.NATIVE && savedMsg) { await Store.put(Object.assign({}, Store.get('settings'), { lastBackup: new Date().toISOString() })); toast(savedMsg + (res === 'shared' ? 'Also sent ✓' : 'Keep a copy off the phone too (Drive or email).'), { ms: 8000 }); render(); t.disabled = false; break; }
          if (res !== 'cancelled') { await Store.put(Object.assign({}, Store.get('settings'), { lastBackup: new Date().toISOString() })); toast(res === 'downloaded' ? 'Backup saved: ' + name : 'Backup shared ✓'); render(); }
        } catch (err) { toast('Backup failed: ' + err.message, { kind: 'bad' }); }
        t.disabled = false; break;
      }
      case 'change-pin': changePin(); break;
      case 'lock': lockNow('Locked. Enter your PIN to open the book.'); break;
      case 'enable-notify': if (UI.NATIVE) { const p = await Native.notifyPermission(true); toast(p === 'granted' ? 'Notifications allowed ✓' : 'Notifications are off. Turn them on in the phone Settings › Apps › My Business Book › Notifications.', { ms: 7000 }); scheduleNative(true); break; } if ('Notification' in window) { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifications allowed ✓' : 'Notifications not allowed'); render(); } break;
      case 'install': if (deferredInstall) { deferredInstall.prompt(); const c = await deferredInstall.userChoice; deferredInstall = null; toast(c.outcome === 'accepted' ? 'Installing…' : 'Install cancelled'); } break;
      case 'erase': {
        const ok = await modal('<h2 id="mdl-title">Erase the whole book?</h2><p>Every record, photo and your PIN will be removed from this phone. Save a backup first if you want to keep anything.</p><div class="field"><label for="erase2">Type ERASE to confirm</label><input id="erase2" type="text" autocomplete="off"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Cancel</button><button type="button" class="btn danger" data-close="ok">Erase everything</button></div>', { collect: w => $('#erase2', w).value.trim().toUpperCase() === 'ERASE' });
        if (ok) { await Store.eraseAll(); formCtx = null; toast('The book was erased.'); depth = 0; history.replaceState({ depth: 0 }, '', location.pathname); showCover(); }
        else if (ok === false) toast('Type ERASE exactly to erase.');
        break;
      }
    }
  });
  document.addEventListener('change', async e => {
    const cb = e.target.closest('[data-done]'); if (!cb) return;
    const rec = Store.get(cb.dataset.done); if (!rec) return;
    let upd = Object.assign({}, rec, { done: cb.checked });
    const sec = SEC[rec.section]; if (sec.beforeSave) upd = sec.beforeSave(upd);
    await Store.put(upd);
    if (rec.section === 'planner') await syncPlannerReminder(upd);
    cb.closest('.card-row').classList.toggle('is-done', cb.checked);
    toast(cb.checked ? 'Marked done ✓' : 'Marked not done');
    updateBadge();
  });
  async function changePin() {
    const res = await modal('<h2 id="mdl-title">Change my PIN</h2><div class="field"><label for="cp-old">Current PIN</label><input id="cp-old" type="password" inputmode="numeric" autocomplete="off" maxlength="8"></div><div class="field"><label for="cp-new">New PIN (4–8 numbers)</label><input id="cp-new" type="password" inputmode="numeric" autocomplete="off" maxlength="8"></div><div class="field"><label for="cp-new2">New PIN again</label><input id="cp-new2" type="password" inputmode="numeric" autocomplete="off" maxlength="8"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Cancel</button><button type="button" class="btn primary" data-close="ok" data-testid="confirm-ok">Change PIN</button></div>', { collect: w => ({ o: $('#cp-old', w).value, a: $('#cp-new', w).value, b: $('#cp-new2', w).value }) });
    if (!res) return;
    if (!/^\d{4,8}$/.test(res.a)) return toast('The new PIN must be 4 to 8 numbers.', { kind: 'bad' });
    if (res.a !== res.b) return toast('The new PINs did not match.', { kind: 'bad' });
    toast('Changing PIN…');
    const ok = await Store.changePin(res.o, res.a);
    toast(ok ? 'PIN changed ✓' : 'The current PIN was not right.', { kind: ok ? '' : 'bad' });
  }

  /* ---------------- Online / install / SW ---------------- */
  function netStatus() {
    const on = navigator.onLine;
    const el = $('#net');
    el.className = 'net ' + (on ? 'on' : 'off');
    el.innerHTML = icon(on ? 'wifi' : 'cloudoff') + '<span>' + (on ? 'Online' : 'Offline') + '</span>';
    el.title = on ? 'Online' : 'Offline — everything still saves on this phone';
    $('#offline-note').hidden = on;
  }
  window.addEventListener('online', netStatus);
  window.addEventListener('offline', () => { netStatus(); toast('You are offline. Everything still works and saves on this phone.'); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); if (UI.NATIVE) return; deferredInstall = e; $$('#install-btn, #cover-install').forEach(b => b.hidden = false); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; $$('#install-btn, #cover-install').forEach(b => b.hidden = true); toast('Installed on your home screen ✓'); });
  if ('serviceWorker' in navigator && !UI.NATIVE) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => { const nw = reg.installing; if (!nw) return; nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('An update is ready. Close and reopen the app to use it.', { ms: 8000 }); }); });
      }).catch(err => console.warn('SW registration failed', err));
    });
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    $('#tabs').innerHTML = '<button type="button" class="tab" data-sec="index" style="--tab:#c9972b" aria-label="Front page">' + icon('home') + '<span>Front</span></button>' + TABS.map(s => '<button type="button" class="tab" data-sec="' + s.key + '" style="--tab:' + s.color + '">' + icon(s.icon) + '<span>' + esc(s.tab) + '</span></button>').join('');
    $('#btn-back').addEventListener('click', () => history.back());
    $('#btn-home').addEventListener('click', home);
    $('#btn-search').addEventListener('click', () => go('#tool/search'));
    $('#btn-bell').addEventListener('click', () => go('#s/reminders'));
    $('#btn-lock').addEventListener('click', () => lockNow('Locked. Enter your PIN to open the book.'));
    $('#open-book').addEventListener('click', openBook);
    if (UI.NATIVE) {
      // Android hardware/gesture Back: close a dialog, step back through pages, and only leave the app from the cover.
      Native.onBack(() => {
        const m = $$('.modal-wrap').pop();
        if (m) { const c = $('[data-close="cancel"]', m) || $('[data-close]', m); if (c) c.click(); return; }
        if (!$('#lock').hidden) { const cancel = $('#lock-cancel'); if (!$('#cover-screen').hidden && cancel && !cancel.hidden) cancel.click(); else Native.exit(); return; }
        if (!$('#cover-screen').hidden) { Native.exit(); return; }
        history.back();
      });
      Native.onNotificationTap(() => { if (Store.isUnlocked()) go('#s/reminders'); else pendingGo = 'reminders'; });
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => { });
    }
    $('#cover-install').addEventListener('click', async () => { if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#cover-install').hidden = true; } });
    netStatus();
    try { await Store.open(); } catch (e) { toast('Storage is not available: ' + e.message, { kind: 'bad', ms: 10000 }); }
    depth = 0;
    history.replaceState({ depth: 0 }, '', location.pathname + location.search);
    showCover();
    window.SBB = { Store, Calc, PDF, Sections, buildBackup, validateBackup, restoreBackup, csvFor, payrollSpec, shareSumSpec, listSpec, go, home, version: VERSION, lockNow, specToHTML, native: UI.NATIVE };
    document.documentElement.classList.add('ready');
  }
  boot();
})();
