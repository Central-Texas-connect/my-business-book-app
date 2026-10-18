/* Core UI helpers: icons, dialogs, toast, voice, share/download, print */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = {
    planner: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 18h6"/>',
    customers: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    jobs: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    estimates: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/>',
    workers: '<path d="M2 18h20M4 18v-3a8 8 0 0 1 16 0v3M10 7.5V4h4v3.5"/>',
    hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    payroll: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 9.5h.01M18 15.5h.01"/>',
    materials: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    expenses: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    invoices: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
    receipts: '<path d="M5 2v20l2.5-1.5L10 22l2-1.5 2 1.5 2.5-1.5L19 22V2l-2.5 1.5L14 2l-2 1.5L10 2 7.5 3.5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    share: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    sidejobs: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    trades: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    ed: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    policies: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    handbook: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    reminders: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 17v5M8 22h8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    print: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><rect x="6" y="14" width="12" height="8"/>',
    shareout: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    backup: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
    money: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    chevl: '<path d="m15 18-6-6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    convert: '<circle cx="12" cy="12" r="10"/><path d="m12 16 4-4-4-4M8 12h8"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    cloudoff: '<path d="M22.6 17.6A5 5 0 0 0 18 10h-1.3A8 8 0 0 0 9 4.3M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3M1 1l22 22"/>',
    wifi: '<path d="M5 12.6a10 10 0 0 1 14 0M1.4 9a16 16 0 0 1 21.2 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01"/>',
    install: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 7v8M9 12l3 3 3-3"/>'
  };
  const icon = (name, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (P[name] || P.info) + '</svg>';

  // Toast
  let toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    const t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.action ? '<button type="button" class="toast-btn">' + esc(opts.action) + '</button>' : '');
    t.className = 'toast show ' + (opts.kind || '') + (opts.action ? ' has-action' : '');
    if (opts.action) $('.toast-btn', t).onclick = () => { t.className = 'toast'; opts.onAction && opts.onAction(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, opts.ms || (opts.action ? 6000 : 2600));
  }
  // Modal
  function modal(html, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const root = $('#modal-root');
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mdl-title">' + html + '</div>';
      root.appendChild(wrap);
      const prevFocus = document.activeElement;
      const close = v => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { } resolve(v); };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => { if (e.target === wrap && !opts.sticky) close(null); });
      $$('[data-close]', wrap).forEach(b => b.addEventListener('click', () => close(b.dataset.close === 'ok' ? (opts.collect ? opts.collect(wrap) : true) : null)));
      if (opts.wire) opts.wire(wrap, close);
      const f = $('[autofocus]', wrap) || $('input,select,textarea,button', wrap);
      setTimeout(() => f && f.focus(), 30);
    });
  }
  function confirmDialog(o) {
    return modal('<h2 id="mdl-title">' + esc(o.title) + '</h2><p>' + esc(o.text || '') + '</p><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">' + esc(o.cancel || 'Cancel') + '</button><button type="button" class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-close="ok" data-testid="confirm-ok">' + esc(o.ok || 'OK') + '</button></div>').then(v => !!v);
  }
  // Voice to text
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const NATIVE = !!(window.Native && window.Native.on);
  const voiceSupported = !!SR || NATIVE;
  function micButton(forId) { return voiceSupported ? '<button type="button" class="mic" data-mic="' + forId + '" aria-label="Speak instead of typing">' + icon('mic') + '</button>' : ''; }
  let activeRec = null;
  function putText(input, text) {
    if (input.tagName === 'TEXTAREA' && input.value) input.value = input.value.replace(/\s*$/, ' ') + text;
    else if (input.type === 'number') { const v = parseFloat(text.replace(/[^0-9.]/g, '')); if (isFinite(v)) input.value = v; }
    else input.value = (input.value ? input.value + ' ' : '') + text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function wireMics(root) {
    if (!voiceSupported) return;
    $$('[data-mic]', root).forEach(b => b.addEventListener('click', () => {
      const input = document.getElementById(b.dataset.mic);
      if (NATIVE) {
        if (b.classList.contains('listening')) return;
        b.classList.add('listening');
        Native.listen().then(text => { if (text) putText(input, text); })
          .catch(e => toast(e.message === 'not-allowed' ? 'Microphone permission was not allowed.' : (e.message === 'unavailable' ? 'Voice typing is not available on this phone. Tap the microphone on your keyboard instead.' : 'Voice typing stopped.')))
          .finally(() => b.classList.remove('listening'));
        return;
      }
      if (activeRec) { try { activeRec.stop(); } catch (e) { } activeRec = null; return; }
      const rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      b.classList.add('listening'); activeRec = rec;
      rec.onresult = e => {
        const text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
        if (!text) return;
        putText(input, text);
      };
      rec.onerror = e => { toast(e.error === 'network' ? 'Voice typing needs an internet connection on most phones.' : (e.error === 'not-allowed' ? 'Microphone permission was not allowed.' : 'Voice typing stopped.')); };
      rec.onend = () => { b.classList.remove('listening'); activeRec = null; };
      try { rec.start(); toast('Listening… speak now'); } catch (e) { b.classList.remove('listening'); activeRec = null; }
    }));
  }
  // Returns a short message describing where the file went.
  async function download(blob, filename) {
    if (NATIVE) {
      const r = await Native.save(blob, filename);
      if (r.where) return 'Saved to ' + r.where;
      const sr = await Native.share(blob, filename, filename);
      return sr === 'cancelled' ? 'Not saved' : 'Sent ' + filename;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    return 'Saved: ' + filename;
  }
  async function shareFile(blob, filename, title) {
    if (NATIVE) return Native.share(blob, filename, title);
    const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
    if (navigator.canShare && navigator.share) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title, text: title });
          return 'shared';
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    await download(blob, filename);
    return 'downloaded';
  }
  window.UI = { NATIVE, $, $$, esc, icon, toast, modal, confirmDialog, voiceSupported, micButton, wireMics, download, shareFile };
})();
