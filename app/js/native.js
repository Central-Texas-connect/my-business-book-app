/* Native bridge: only active inside the Android app (Capacitor). In a normal browser this file does nothing. */
(function () {
  const C = window.Capacitor;
  const on = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  function P(name) { if (!on) return null; return (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null); }
  if (on) document.documentElement.classList.add('native-app');

  function blobToBase64(blob) {
    return new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => bad(fr.error); fr.readAsDataURL(blob); });
  }
  function safeName(n) { return String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '-'); }
  async function writeCache(blob, filename) {
    const fs = P('Filesystem');
    const res = await fs.writeFile({ path: 'out/' + safeName(filename), data: await blobToBase64(blob), directory: 'CACHE', recursive: true });
    return res.uri;
  }
  // Share sheet (send by text, email, WhatsApp, Drive, print apps…)
  async function share(blob, filename, title) {
    const uri = await writeCache(blob, filename);
    try {
      await P('Share').share({ title: title || filename, text: title || '', files: [uri], dialogTitle: title || 'Share' });
      return 'shared';
    } catch (e) {
      if (/cancel/i.test(String(e && (e.message || e.errorMessage || e)))) return 'cancelled';
      throw e;
    }
  }
  // Save a copy into the phone's Documents/SmarterBusinessBook folder (visible in the Files app).
  async function save(blob, filename) {
    const fs = P('Filesystem');
    try {
      try { const st = await fs.checkPermissions(); if (st.publicStorage !== 'granted') await fs.requestPermissions(); } catch (e) { }
      await fs.writeFile({ path: 'SmarterBusinessBook/' + safeName(filename), data: await blobToBase64(blob), directory: 'DOCUMENTS', recursive: true });
      return { where: 'Documents/SmarterBusinessBook/' + safeName(filename) };
    } catch (e) {
      return { error: e };
    }
  }
  async function printPdf(blob, filename) {
    const uri = await writeCache(blob, filename);
    await P('BookPrint').printPdf({ uri, name: filename });
  }
  // Voice typing via Android's speech recognizer
  async function voiceAvailable() { try { const r = await P('SpeechRecognition').available(); return !!(r && r.available); } catch (e) { return false; } }
  async function listen() {
    const sr = P('SpeechRecognition');
    if (!(await voiceAvailable())) throw new Error('unavailable');
    let perm = await sr.checkPermissions().catch(() => ({}));
    if (perm.speechRecognition !== 'granted') perm = await sr.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('not-allowed');
    const r = await sr.start({ language: 'en-US', maxResults: 1, partialResults: false, popup: true, prompt: 'Speak now' });
    return (r && r.matches && r.matches[0]) || '';
  }
  // Reminders as real scheduled phone notifications (they fire even when the app is closed).
  function numId(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 || 1; }
  let lastSig = '';
  async function notifyPermission(ask) {
    const ln = P('LocalNotifications'); if (!ln) return 'unsupported';
    let p = await ln.checkPermissions().catch(() => ({ display: 'prompt' }));
    if (p.display !== 'granted' && ask) p = await ln.requestPermissions().catch(() => ({ display: 'denied' }));
    return p.display === 'granted' ? 'granted' : (p.display === 'denied' ? 'denied' : 'default');
  }
  async function scheduleReminders(list, fmt) {
    const ln = P('LocalNotifications'); if (!ln) return 0;
    const now = Date.now();
    const items = list.filter(x => !x.done && x.dueDate).map(x => {
      const at = new Date(x.dueDate + 'T' + (x.dueTime || '08:00') + ':00');
      return { x, at };
    }).filter(o => !isNaN(o.at) && o.at.getTime() > now + 5000);
    const sig = items.map(o => o.x.id + '@' + o.at.getTime() + ':' + o.x.title).sort().join('|');
    if (sig === lastSig) return items.length;
    if ((await notifyPermission(false)) !== 'granted') return 0;
    try {
      const pend = await ln.getPending();
      if (pend.notifications && pend.notifications.length) await ln.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
      if (items.length) {
        try { await ln.createChannel({ id: 'reminders', name: 'Reminders', description: 'Business Book reminders', importance: 4, visibility: 0 }); } catch (e) { }
        await ln.schedule({ notifications: items.map(o => ({ id: numId(o.x.id), title: 'Reminder', body: o.x.title + (fmt ? ' — ' + fmt(o.x) : ''), schedule: { at: o.at, allowWhileIdle: true }, channelId: 'reminders', extra: { rid: o.x.id } })) });
      }
      lastSig = sig;
    } catch (e) { console.warn('schedule failed', e); }
    return items.length;
  }
  function onBack(fn) { const app = P('App'); if (app) app.addListener('backButton', fn); }
  function onNotificationTap(fn) { const ln = P('LocalNotifications'); if (ln) ln.addListener('localNotificationActionPerformed', a => fn(a && a.notification && a.notification.extra && a.notification.extra.rid)); }
  function exit() { const app = P('App'); if (app) app.exitApp(); }
  async function appInfo() { try { return await P('App').getInfo(); } catch (e) { return null; } }
  window.Native = { on, share, save, printPdf, voiceAvailable, listen, scheduleReminders, notifyPermission, onBack, onNotificationTap, exit, appInfo };
})();
