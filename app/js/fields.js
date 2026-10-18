/* Form engine: renders fields with big controls, reads values back. */
(function () {
  'use strict';
  const { $, $$, esc, icon, micButton } = UI;
  const { n, r2, D, money } = Calc;
  let seq = 0;
  const fid = () => 'f' + (++seq);

  function refName(id) {
    const r = id && Store.get(id);
    if (!r) return '';
    return r.name || r.title || r.number || r.description || '';
  }
  function refOptions(target, current, filter) {
    let list = Store.list(target);
    if (filter) list = list.filter(filter);
    if (target === 'workers') list = list.filter(w => w.active !== false || w.id === current);
    list.sort((a, b) => refLabel(a).localeCompare(refLabel(b)));
    return list;
  }
  function refLabel(r) {
    if (r.section === 'jobs') { const c = Store.get(r.customerId); return (r.title || 'Job') + (c ? ' — ' + c.name : ''); }
    if (r.section === 'invoices') { return (r.number || 'Invoice') + ' — ' + money(Calc.itemsTotal(r.items, r.taxRate).total); }
    return r.name || r.title || r.number || '(no name)';
  }
  function chipsHTML(f, id) {
    if (!f.chips || !f.chips.length) return '';
    return '<div class="chips" role="group" aria-label="Quick picks for ' + esc(f.label) + '">' + f.chips.map(c => '<button type="button" class="chip" data-for="' + id + '" data-val="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>';
  }
  function help(f) { return f.help ? '<p class="help">' + esc(f.help) + '</p>' : ''; }
  function wrap(f, id, inner) {
    return '<div class="field" data-key="' + f.key + '" data-type="' + f.type + '"><label for="' + id + '">' + esc(f.label) + (f.required ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' + inner + help(f) + '</div>';
  }
  function render(f, val, rec) {
    const id = fid();
    const v = val == null ? '' : val;
    switch (f.type) {
      case 'text': case 'tel': case 'email':
        return wrap(f, id, '<div class="input-row"><input id="' + id + '" name="' + f.key + '" type="' + f.type + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '" ' + (f.type === 'tel' ? 'inputmode="tel" autocomplete="tel"' : 'autocomplete="off"') + (f.required ? ' required' : '') + '>' + (f.type === 'text' ? micButton(id) : '') + '</div>' + chipsHTML(f, id));
      case 'textarea':
        return wrap(f, id, '<div class="input-row"><textarea id="' + id + '" name="' + f.key + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>' + micButton(id) + '</div>' + chipsHTML(f, id));
      case 'money':
        return wrap(f, id, '<div class="money-input"><span aria-hidden="true">$</span><input id="' + id + '" name="' + f.key + '" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(v === '' ? '' : v) + '" placeholder="0.00"></div>' + chipsHTML(f, id));
      case 'number':
        return wrap(f, id, '<div class="stepper"><button type="button" class="step" data-step="-1" data-for="' + id + '" aria-label="Less">' + icon('minus') + '</button><input id="' + id + '" name="' + f.key + '" type="number" inputmode="decimal" step="' + (f.step || 1) + '" min="' + (f.min != null ? f.min : 0) + '" value="' + esc(v === '' ? (f.default != null ? (typeof f.default === 'function' ? f.default() : f.default) : '') : v) + '"><button type="button" class="step" data-step="1" data-for="' + id + '" aria-label="More">' + icon('plus') + '</button>' + (f.unit ? '<span class="unit">' + esc(f.unit) + '</span>' : '') + '</div>' + chipsHTML(f, id));
      case 'date': {
        const chips = f.dateChips || ['Today', 'Tomorrow'];
        return wrap(f, id, '<input id="' + id + '" name="' + f.key + '" type="date" value="' + esc(v) + '"><div class="chips">' + chips.map(c => '<button type="button" class="chip" data-date="' + c + '" data-for="' + id + '">' + c + '</button>').join('') + (f.clearable !== false && !f.required ? '<button type="button" class="chip" data-date="Clear" data-for="' + id + '">Clear</button>' : '') + '</div>');
      }
      case 'time':
        return wrap(f, id, '<input id="' + id + '" name="' + f.key + '" type="time" value="' + esc(v) + '">' + '<div class="chips">' + ['08:00', '10:00', '13:00', '15:00'].map(t => '<button type="button" class="chip" data-for="' + id + '" data-val="' + t + '">' + fmtTime(t) + '</button>').join('') + '</div>');
      case 'select':
        return wrap(f, id, '<select id="' + id + '" name="' + f.key + '">' + (f.blank ? '<option value="">' + esc(f.blank) + '</option>' : '') + f.options.map(o => '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>');
      case 'segmented':
        return '<div class="field" data-key="' + f.key + '" data-type="segmented"><span class="label" id="' + id + '-l">' + esc(f.label) + '</span><div class="segmented" role="radiogroup" aria-labelledby="' + id + '-l">' + f.options.map(o => '<button type="button" role="radio" class="seg' + (o === (v || f.default) ? ' on' : '') + '" aria-checked="' + (o === (v || f.default)) + '" data-val="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div>' + help(f) + '</div>';
      case 'ref': {
        const opts = refOptions(f.target, v, f.filter && (r => f.filter(r, rec)));
        return wrap(f, id, '<div class="input-row"><select id="' + id + '" name="' + f.key + '" data-target="' + f.target + '"><option value="">' + esc(f.blank || '— none —') + '</option>' + opts.map(o => '<option value="' + o.id + '"' + (o.id === v ? ' selected' : '') + '>' + esc(refLabel(o)) + '</option>').join('') + '</select>' + (f.quickAdd ? '<button type="button" class="btn small ghost add-ref" data-target="' + f.target + '" data-for="' + id + '">' + icon('plus') + '<span>New</span></button>' : '') + '</div>');
      }
      case 'multiref': {
        const sel = Array.isArray(v) ? v : [];
        const opts = refOptions(f.target, null).concat(sel.filter(x => Store.get(x) && Store.get(x).active === false).map(x => Store.get(x)));
        const uniq = [...new Map(opts.map(o => [o.id, o])).values()];
        return '<div class="field" data-key="' + f.key + '" data-type="multiref"><span class="label">' + esc(f.label) + '</span>' + (uniq.length ? '<div class="check-chips">' + uniq.map(o => '<label class="check-chip"><input type="checkbox" value="' + o.id + '"' + (sel.includes(o.id) ? ' checked' : '') + '><span>' + esc(refLabel(o)) + '</span></label>').join('') + '</div>' : '<p class="help">No ' + esc(f.target) + ' yet. Add them in the ' + esc(f.targetLabel || f.target) + ' tab first.</p>') + help(f) + '</div>';
      }
      case 'toggle':
        return '<div class="field" data-key="' + f.key + '" data-type="toggle"><label class="toggle"><input type="checkbox" id="' + id + '"' + (v === true || (v === '' && f.default) ? ' checked' : '') + '><span class="track" aria-hidden="true"></span><span class="tlabel">' + esc(f.label) + '</span></label>' + help(f) + '</div>';
      case 'items': return renderItems(f, v);
      case 'photos': return renderPhotos(f, v);
      case 'contributions': return renderContrib(f, v);
      case 'note': return '<div class="note-box">' + icon('info') + '<p>' + esc(f.text) + '</p></div>';
      case 'calc': return '<div class="calc-box" data-calc="' + f.key + '"></div>';
    }
    return '';
  }
  function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap; }

  // Line items
  function itemRow(it, chips) {
    const id = fid();
    return '<div class="item-row"><div class="input-row"><input class="it-desc" id="' + id + '" type="text" placeholder="What is the work or item?" value="' + esc(it.desc || '') + '" aria-label="Description">' + micButton(id) + '</div>' +
      '<div class="item-nums"><label>Qty<div class="stepper sm"><button type="button" class="step" data-step="-1" aria-label="Less">' + icon('minus') + '</button><input class="it-qty" type="number" inputmode="decimal" step="1" min="0" value="' + esc(it.qty == null ? 1 : it.qty) + '"><button type="button" class="step" data-step="1" aria-label="More">' + icon('plus') + '</button></div></label>' +
      '<label>Price each<div class="money-input"><span>$</span><input class="it-price" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(it.price == null ? '' : it.price) + '" placeholder="0.00"></div></label>' +
      '<div class="it-amt" aria-live="polite"></div><button type="button" class="icon-btn it-del" aria-label="Remove line">' + icon('trash') + '</button></div></div>';
  }
  function renderItems(f, v) {
    const items = Array.isArray(v) && v.length ? v : [{ desc: '', qty: 1, price: '' }];
    return '<div class="field" data-key="' + f.key + '" data-type="items"><span class="label">' + esc(f.label) + '</span><div class="chips" aria-label="Tap a service to add a line">' + (f.chips || []).map(c => '<button type="button" class="chip add-item" data-val="' + esc(c) + '">+ ' + esc(c) + '</button>').join('') + '</div><div class="items">' + items.map(it => itemRow(it)).join('') + '</div><button type="button" class="btn ghost add-line">' + icon('plus') + '<span>Add a line</span></button><div class="items-total"></div></div>';
  }
  function renderPhotos(f, v) {
    const ids = Array.isArray(v) ? v : [];
    const id1 = fid(), id2 = fid();
    return '<div class="field" data-key="' + f.key + '" data-type="photos"><span class="label">' + esc(f.label) + '</span><div class="thumbs" data-ids="' + esc(JSON.stringify(ids)) + '"></div><div class="photo-btns"><label class="btn ghost" for="' + id1 + '">' + icon('camera') + '<span>Take Photo</span></label><input id="' + id1 + '" class="vh photo-in" type="file" accept="image/*" capture="environment"><label class="btn ghost" for="' + id2 + '">' + icon('image') + '<span>Choose Photos</span></label><input id="' + id2 + '" class="vh photo-in" type="file" accept="image/*" multiple></div>' + help(f) + '</div>';
  }
  const PARTIES = ['Smarter Home Improvements (Lynn)', 'Ed Robinson'];
  const CTYPES = ['Money', 'Labor', 'Materials', 'Equipment', 'Other'];
  function contribRow(c) {
    const id = fid();
    return '<div class="contrib-row"><div class="two"><label>Who<select class="c-party">' + PARTIES.map(p => '<option' + (p === c.party ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label><label>Type<select class="c-type">' + CTYPES.map(p => '<option' + (p === c.type ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label></div>' +
      '<div class="input-row"><input class="c-desc" id="' + id + '" type="text" placeholder="What was put in (e.g. 2 days labor, trailer)" value="' + esc(c.desc || '') + '" aria-label="Contribution description">' + micButton(id) + '</div>' +
      '<div class="two"><label>Dollar value<div class="money-input"><span>$</span><input class="c-value" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(c.value == null ? '' : c.value) + '"></div></label><label>Date<input class="c-date" type="date" value="' + esc(c.date || D.today()) + '"></label></div><button type="button" class="btn small ghost c-del">' + icon('trash') + '<span>Remove</span></button></div>';
  }
  function renderContrib(f, v) {
    const list = Array.isArray(v) ? v : [];
    return '<div class="field" data-key="' + f.key + '" data-type="contributions"><span class="label">' + esc(f.label) + '</span><div class="contribs">' + list.map(contribRow).join('') + '</div><button type="button" class="btn ghost add-contrib">' + icon('plus') + '<span>Add a contribution</span></button><div class="contrib-total"></div></div>';
  }

  // Photo compression
  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Could not read that picture')); i.src = url; });
      const max = 1400;
      let { width: w, height: h } = img;
      const s = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.8));
    } finally { URL.revokeObjectURL(url); }
  }
  const urlCache = new Map();
  async function photoURL(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const b = await Store.getPhoto(id);
    if (!b) return null;
    const u = URL.createObjectURL(b); urlCache.set(id, u); return u;
  }
  function clearPhotoURLs() { for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear(); }
  async function fillThumbs(box, ids, removable) {
    box.innerHTML = ids.map(id => '<div class="thumb" data-id="' + id + '"><button type="button" class="thumb-open" aria-label="View photo"><img alt="Job photo"></button>' + (removable ? '<button type="button" class="thumb-del" aria-label="Remove photo">' + icon('x') + '</button>' : '') + '</div>').join('');
    for (const el of $$('.thumb', box)) {
      const u = await photoURL(el.dataset.id).catch(() => null);
      const img = $('img', el);
      if (u) img.src = u; else { img.alt = 'Photo missing'; el.classList.add('missing'); }
      $('.thumb-open', el).onclick = () => { if (u) UI.modal('<h2 id="mdl-title" class="vh">Photo</h2><img class="photo-full" src="' + u + '" alt="Photo"><div class="modal-actions"><button type="button" class="btn primary" data-close="cancel">Close</button></div>'); };
    }
  }

  function wire(root, ctx) {
    ctx = ctx || {};
    ctx.newPhotos = ctx.newPhotos || [];
    ctx.removedPhotos = ctx.removedPhotos || [];
    const changed = () => { ctx.dirty = true; if (ctx.onChange) ctx.onChange(); };
    root.addEventListener('input', changed);
    root.addEventListener('change', changed);
    root.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.classList.contains('chip') && b.dataset.for) {
        const inp = document.getElementById(b.dataset.for);
        if (b.dataset.date) {
          const map = { Today: D.today(), Tomorrow: D.add(D.today(), 1), 'In 7 days': D.add(D.today(), 7), 'In 14 days': D.add(D.today(), 14), 'In 30 days': D.add(D.today(), 30), 'This Friday': D.payFriday(), Clear: '' };
          inp.value = map[b.dataset.date] != null ? map[b.dataset.date] : '';
        } else if (inp.tagName === 'TEXTAREA') inp.value = inp.value ? inp.value.replace(/\s*$/, '\n') + b.dataset.val : b.dataset.val;
        else if (b.closest('.field').dataset.type !== 'time' && /[,\s]$/.test(inp.value)) inp.value = inp.value.replace(/\s*$/, ' ') + b.dataset.val;
        else inp.value = b.dataset.val;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        $$('.chip[data-for="' + b.dataset.for + '"]', root).forEach(c => c.classList.toggle('on', c === b));
      } else if (b.classList.contains('step')) {
        const inp = b.dataset.for ? document.getElementById(b.dataset.for) : b.parentElement.querySelector('input');
        const st = parseFloat(inp.step) || 1;
        const min = inp.min !== '' ? parseFloat(inp.min) : -Infinity;
        inp.value = Math.max(min, r2((parseFloat(inp.value) || 0) + st * Number(b.dataset.step)));
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (b.classList.contains('seg')) {
        $$('.seg', b.parentElement).forEach(s => { s.classList.toggle('on', s === b); s.setAttribute('aria-checked', s === b); });
        changed();
        b.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (b.classList.contains('add-line') || b.classList.contains('add-item')) {
        const box = $('.items', b.closest('.field'));
        const rows = $$('.item-row', box);
        const last = rows[rows.length - 1];
        if (b.classList.contains('add-item') && last && !$('.it-desc', last).value.trim()) $('.it-desc', last).value = b.dataset.val;
        else { box.insertAdjacentHTML('beforeend', itemRow({ desc: b.dataset.val || '', qty: 1, price: '' })); UI.wireMics(box.lastElementChild); }
        changed();
        if (!b.dataset.val) { const r = box.lastElementChild; $('.it-desc', r).focus(); }
      } else if (b.classList.contains('it-del')) {
        const box = b.closest('.items'); b.closest('.item-row').remove();
        if (!$('.item-row', box)) box.insertAdjacentHTML('beforeend', itemRow({ qty: 1 }));
        changed();
      } else if (b.classList.contains('add-contrib')) {
        const box = $('.contribs', b.closest('.field'));
        box.insertAdjacentHTML('beforeend', contribRow({ party: PARTIES[0], type: 'Money' })); UI.wireMics(box.lastElementChild); changed();
      } else if (b.classList.contains('c-del')) { b.closest('.contrib-row').remove(); changed(); }
      else if (b.classList.contains('thumb-del')) {
        const t = b.closest('.thumb'); const box = t.parentElement; const ids = JSON.parse(box.dataset.ids).filter(x => x !== t.dataset.id);
        ctx.removedPhotos.push(t.dataset.id); box.dataset.ids = JSON.stringify(ids); t.remove(); changed();
      } else if (b.classList.contains('add-ref')) {
        const sel = document.getElementById(b.dataset.for);
        const rec = await quickAdd(b.dataset.target);
        if (rec) { sel.insertAdjacentHTML('beforeend', '<option value="' + rec.id + '">' + esc(refLabel(rec)) + '</option>'); sel.value = rec.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });
    $$('.photo-in', root).forEach(inp => inp.addEventListener('change', async () => {
      const box = $('.thumbs', inp.closest('.field'));
      const files = Array.from(inp.files || []);
      if (!files.length) return;
      UI.toast('Saving photo' + (files.length > 1 ? 's' : '') + '…');
      const ids = JSON.parse(box.dataset.ids);
      for (const file of files) {
        try { const blob = await compress(file); const id = await Store.putPhoto(blob); ids.push(id); ctx.newPhotos.push(id); }
        catch (err) { UI.toast(err.message || 'Could not add that photo', { kind: 'bad' }); }
      }
      box.dataset.ids = JSON.stringify(ids);
      await fillThumbs(box, ids, true);
      inp.value = '';
      changed();
      UI.toast('Photo added. Press Save to keep it with this record.');
    }));
    $$('.thumbs', root).forEach(box => fillThumbs(box, JSON.parse(box.dataset.ids), true));
    UI.wireMics(root);
  }
  async function quickAdd(target) {
    if (target !== 'customers') return null;
    const res = await UI.modal('<h2 id="mdl-title">New customer</h2><div class="field"><label for="qa-name">Name</label><input id="qa-name" type="text" autofocus></div><div class="field"><label for="qa-phone">Phone</label><input id="qa-phone" type="tel" inputmode="tel"></div><div class="field"><label for="qa-addr">Address</label><input id="qa-addr" type="text"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close="cancel">Cancel</button><button type="button" class="btn primary" data-close="ok">Save customer</button></div>', { collect: w => ({ name: $('#qa-name', w).value.trim(), phone: $('#qa-phone', w).value.trim(), address: $('#qa-addr', w).value.trim() }) });
    if (!res || !res.name) { if (res) UI.toast('A name is needed to add a customer.'); return null; }
    const rec = await Store.put({ section: 'customers', name: res.name, phone: res.phone, address: res.address });
    UI.toast('Customer saved');
    return rec;
  }
  function read(fields, root) {
    const out = {};
    for (const f of fields) {
      const el = $('.field[data-key="' + f.key + '"]', root);
      if (!el) continue;
      switch (f.type) {
        case 'text': case 'tel': case 'email': case 'textarea': case 'date': case 'time': case 'select': case 'ref':
          out[f.key] = $('input,textarea,select', el).value.trim(); break;
        case 'money': case 'number': { const s = $('input', el).value; out[f.key] = s === '' ? '' : r2(parseFloat(s)); break; }
        case 'segmented': { const on = $('.seg.on', el); out[f.key] = on ? on.dataset.val : (f.default || ''); break; }
        case 'multiref': out[f.key] = $$('input:checked', el).map(i => i.value); break;
        case 'toggle': out[f.key] = $('input', el).checked; break;
        case 'items': out[f.key] = $$('.item-row', el).map(r => ({ desc: $('.it-desc', r).value.trim(), qty: n($('.it-qty', r).value), price: n($('.it-price', r).value) })).filter(it => it.desc || it.price); break;
        case 'photos': out[f.key] = JSON.parse($('.thumbs', el).dataset.ids); break;
        case 'contributions': out[f.key] = $$('.contrib-row', el).map(r => ({ party: $('.c-party', r).value, type: $('.c-type', r).value, desc: $('.c-desc', r).value.trim(), value: n($('.c-value', r).value), date: $('.c-date', r).value })).filter(c => c.desc || c.value); break;
      }
    }
    return out;
  }
  window.Fields = { render, wire, read, refName, refLabel, fillThumbs, photoURL, clearPhotoURLs, fmtTime, compress, PARTIES };
})();
