/* Smarter Business Book — encrypted local storage (IndexedDB + Web Crypto)
 * Records and photos are encrypted with AES-GCM using a key derived from the PIN
 * (PBKDF2-SHA256, random salt). Only the section name and timestamps stay in clear. */
(function () {
  'use strict';
  const DB_NAME = 'smarter-business-book';
  const DB_VERSION = 1;
  const ITER = 210000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let db = null;
  let aesKey = null;
  const cache = new Map(); // id -> record (decrypted)

  function req2p(r) {
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  function tx2p(t) {
    return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); });
  }
  async function open() {
    if (db) return db;
    db = await new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('records')) {
          const s = d.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('section', 'section');
        }
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('Database blocked — close other copies of the app.'));
    });
    db.onversionchange = () => { db.close(); db = null; };
    return db;
  }
  async function metaGet(key) {
    const d = await open();
    const v = await req2p(d.transaction('meta').objectStore('meta').get(key));
    return v ? v.value : undefined;
  }
  async function metaSet(key, value) {
    const d = await open();
    const t = d.transaction('meta', 'readwrite');
    t.objectStore('meta').put({ key, value });
    return tx2p(t);
  }
  const b64 = {
    from(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); },
    to(str) { const s = atob(str); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  };
  async function derive(pin, saltB64, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64.to(saltB64), iterations: iter, hash: 'SHA-256' }, base, 512);
    const all = new Uint8Array(bits);
    const verifier = await crypto.subtle.digest('SHA-256', all.slice(0, 32));
    const key = await crypto.subtle.importKey('raw', all.slice(32, 64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    return { verifier: b64.from(verifier), key };
  }
  function timingSafeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
  async function encryptBytes(bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, bytes);
    return { iv, ct };
  }
  async function decryptBytes(iv, ct, key) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key || aesKey, ct);
  }
  async function hasPin() { return !!(await metaGet('auth')); }

  async function setupPin(pin) {
    if (await hasPin()) throw new Error('A PIN already exists.');
    const salt = b64.from(crypto.getRandomValues(new Uint8Array(16)));
    const d = await derive(pin, salt, ITER);
    await metaSet('auth', { salt, iter: ITER, verifier: d.verifier, created: new Date().toISOString() });
    aesKey = d.key;
    cache.clear();
    return true;
  }
  async function unlock(pin) {
    const auth = await metaGet('auth');
    if (!auth) throw new Error('No PIN set');
    const d = await derive(pin, auth.salt, auth.iter);
    if (!timingSafeEq(d.verifier, auth.verifier)) return false;
    aesKey = d.key;
    await loadAll();
    return true;
  }
  function lock() { aesKey = null; cache.clear(); }
  function isUnlocked() { return !!aesKey; }

  async function loadAll() {
    const d = await open();
    const rows = await req2p(d.transaction('records').objectStore('records').getAll());
    cache.clear();
    let bad = 0;
    for (const row of rows) {
      try {
        const pt = await decryptBytes(row.iv, row.ct);
        cache.set(row.id, JSON.parse(dec.decode(pt)));
      } catch (e) { bad++; }
    }
    if (bad) console.warn(bad + ' records could not be decrypted');
    return cache.size;
  }
  function uid() {
    const a = crypto.getRandomValues(new Uint8Array(9));
    return Date.now().toString(36) + '-' + Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
  }
  async function rowFor(rec) {
    const { iv, ct } = await encryptBytes(enc.encode(JSON.stringify(rec)));
    return { id: rec.id, section: rec.section, updatedAt: rec.updatedAt, iv, ct };
  }
  async function put(rec) {
    if (!aesKey) throw new Error('Book is locked');
    const now = new Date().toISOString();
    rec = Object.assign({}, rec);
    if (!rec.id) rec.id = uid();
    if (!rec.createdAt) rec.createdAt = now;
    rec.updatedAt = now;
    const row = await rowFor(rec);
    const d = await open();
    const t = d.transaction('records', 'readwrite');
    t.objectStore('records').put(row);
    await tx2p(t);
    cache.set(rec.id, rec);
    return rec;
  }
  async function putMany(recs) {
    if (!aesKey) throw new Error('Book is locked');
    const rows = [];
    for (const r of recs) rows.push(await rowFor(r));
    const d = await open();
    const t = d.transaction('records', 'readwrite');
    for (const row of rows) t.objectStore('records').put(row);
    await tx2p(t);
    for (const r of recs) cache.set(r.id, r);
  }
  async function del(id) {
    const d = await open();
    const t = d.transaction('records', 'readwrite');
    t.objectStore('records').delete(id);
    await tx2p(t);
    cache.delete(id);
  }
  function get(id) { return cache.get(id) || null; }
  function list(section) {
    const out = [];
    for (const r of cache.values()) if (!section || r.section === section) out.push(r);
    return out;
  }
  // Photos: stored as encrypted JPEG bytes
  async function putPhoto(blob, id) {
    if (!aesKey) throw new Error('Book is locked');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { iv, ct } = await encryptBytes(bytes);
    id = id || 'ph-' + uid();
    const d = await open();
    const t = d.transaction('photos', 'readwrite');
    t.objectStore('photos').put({ id, type: blob.type || 'image/jpeg', iv, ct, size: bytes.length });
    await tx2p(t);
    return id;
  }
  async function getPhoto(id) {
    const d = await open();
    const row = await req2p(d.transaction('photos').objectStore('photos').get(id));
    if (!row) return null;
    const pt = await decryptBytes(row.iv, row.ct);
    return new Blob([pt], { type: row.type });
  }
  async function delPhoto(id) {
    const d = await open();
    const t = d.transaction('photos', 'readwrite');
    t.objectStore('photos').delete(id);
    await tx2p(t);
  }
  async function allPhotoIds() {
    const d = await open();
    return req2p(d.transaction('photos').objectStore('photos').getAllKeys());
  }
  async function changePin(oldPin, newPin) {
    const auth = await metaGet('auth');
    const o = await derive(oldPin, auth.salt, auth.iter);
    if (!timingSafeEq(o.verifier, auth.verifier)) return false;
    const salt = b64.from(crypto.getRandomValues(new Uint8Array(16)));
    const n = await derive(newPin, salt, ITER);
    const d = await open();
    // Decrypt everything with old key
    const rows = await req2p(d.transaction('records').objectStore('records').getAll());
    const photos = await req2p(d.transaction('photos').objectStore('photos').getAll());
    const plainRows = [];
    for (const r of rows) plainRows.push({ r, pt: await decryptBytes(r.iv, r.ct, o.key) });
    const plainPhotos = [];
    for (const p of photos) plainPhotos.push({ p, pt: await decryptBytes(p.iv, p.ct, o.key) });
    // Re-encrypt with new key
    const newRows = [], newPhotos = [];
    for (const { r, pt } of plainRows) { const iv = crypto.getRandomValues(new Uint8Array(12)); newRows.push(Object.assign({}, r, { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, n.key, pt) })); }
    for (const { p, pt } of plainPhotos) { const iv = crypto.getRandomValues(new Uint8Array(12)); newPhotos.push(Object.assign({}, p, { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, n.key, pt) })); }
    const t = d.transaction(['records', 'photos', 'meta'], 'readwrite');
    for (const r of newRows) t.objectStore('records').put(r);
    for (const p of newPhotos) t.objectStore('photos').put(p);
    t.objectStore('meta').put({ key: 'auth', value: { salt, iter: ITER, verifier: n.verifier, created: auth.created, changed: new Date().toISOString() } });
    await tx2p(t);
    aesKey = n.key;
    return true;
  }
  async function eraseAll() {
    lock();
    if (db) { db.close(); db = null; }
    await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = res; });
  }
  async function clearRecords() {
    const d = await open();
    const t = d.transaction(['records', 'photos'], 'readwrite');
    t.objectStore('records').clear();
    t.objectStore('photos').clear();
    await tx2p(t);
    cache.clear();
  }
  window.Store = { open, hasPin, setupPin, unlock, lock, isUnlocked, put, putMany, del, get, list, putPhoto, getPhoto, delPhoto, allPhotoIds, changePin, eraseAll, clearRecords, uid, metaGet, metaSet, loadAll };
})();
