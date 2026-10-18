/* Money math — all numbers computed only from records the owner entered. */
(function () {
  'use strict';
  const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const D = {
    iso(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    parse(s) { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); },
    add(s, days) { const d = D.parse(s); d.setDate(d.getDate() + days); return D.iso(d); },
    today() { return D.iso(new Date()); },
    // Pay weeks run Saturday through Friday. Returns the Friday that ends the week containing the date.
    payFriday(s) { const d = D.parse(s || D.today()); const wd = d.getDay(); const diff = (5 - wd + 7) % 7; d.setDate(d.getDate() + diff); return D.iso(d); },
    pretty(s) { const d = D.parse(s); if (!d) return ''; return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); },
    short(s) { const d = D.parse(s); if (!d) return ''; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  };
  const money = v => (n(v) < 0 ? '-' : '') + '$' + Math.abs(n(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function itemsTotal(items, taxRate) {
    const subtotal = r2((items || []).reduce((s, it) => s + n(it.qty) * n(it.price), 0));
    const tax = r2(subtotal * n(taxRate) / 100);
    return { subtotal, tax, total: r2(subtotal + tax) };
  }
  function settings() {
    const s = Store.get('settings') || {};
    return Object.assign({ sharePct: 25, shareBase: 'price', autoLockMin: 5 }, s);
  }
  function receiptsFor(pred) { return Store.list('receipts').filter(pred).reduce((s, r) => s + n(r.amount), 0); }
  function invoiceStatus(inv) {
    const total = itemsTotal(inv.items, inv.taxRate).total;
    const paid = r2(receiptsFor(r => r.invoiceId === inv.id));
    const balance = r2(total - paid);
    let status = paid <= 0 ? 'Unpaid — no payments recorded' : (balance > 0.004 ? 'Partly paid' : 'Paid in full');
    return { total, paid, balance, status, key: paid <= 0 ? 'unpaid' : (balance > 0.004 ? 'partial' : 'paid') };
  }
  function laborCost(h) { return r2(n(h.hours) * n(h.rate)); }
  function jobMoney(job) {
    const s = settings();
    const id = job.id;
    const materials = r2(Store.list('materials').filter(m => m.jobId === id).reduce((a, m) => a + n(m.qty) * n(m.unitCost), 0));
    const expenses = r2(Store.list('expenses').filter(e => e.jobId === id).reduce((a, e) => a + n(e.amount), 0));
    const labor = r2(Store.list('hours').filter(h => h.jobId === id).reduce((a, h) => a + laborCost(h), 0));
    const laborHours = r2(Store.list('hours').filter(h => h.jobId === id).reduce((a, h) => a + n(h.hours), 0));
    const costs = r2(materials + expenses + labor);
    const invs = Store.list('invoices').filter(i => i.jobId === id);
    const invoiced = r2(invs.reduce((a, i) => a + itemsTotal(i.items, i.taxRate).total, 0));
    const price = r2(n(job.price));
    const billed = invs.length ? invoiced : price;
    const received = r2(receiptsFor(r => r.jobId === id));
    const balance = r2(billed - received);
    const profit = r2(billed - costs);
    const applies = !!job.shareApplies && job.status !== 'Canceled';
    let base = 0;
    if (s.shareBase === 'received') base = received; else if (s.shareBase === 'profit') base = Math.max(profit, 0); else base = billed;
    const share = applies ? r2(base * n(s.sharePct) / 100) : 0;
    const afterShare = r2(profit - share);
    const payStatus = received <= 0 ? 'No payments recorded' : (balance > 0.004 ? 'Partly paid' : (balance < -0.004 ? 'Overpaid' : 'Paid in full'));
    return { materials, expenses, labor, laborHours, costs, price, invoiced, billed, billedFrom: invs.length ? 'invoices' : 'price', received, balance, profit, applies, sharePct: n(s.sharePct), shareBase: s.shareBase, shareBaseAmount: r2(base), share, afterShare, payStatus };
  }
  function weekRange(friday) { return { start: D.add(friday, -6), end: friday }; }
  function payroll(friday) {
    const { start, end } = weekRange(friday);
    const hrs = Store.list('hours').filter(h => h.date >= start && h.date <= end);
    const byW = new Map();
    for (const h of hrs) {
      const k = h.workerId || '_unknown';
      const e = byW.get(k) || { workerId: k, hours: 0, pay: 0, entries: [] };
      e.hours = r2(e.hours + n(h.hours)); e.pay = r2(e.pay + laborCost(h)); e.entries.push(h);
      byW.set(k, e);
    }
    const paidRecs = Store.list('payroll').filter(p => p.weekEnding === friday);
    const rows = [...byW.values()].map(e => {
      const w = Store.get(e.workerId);
      const paid = paidRecs.find(p => p.workerId === e.workerId) || null;
      return Object.assign(e, { name: w ? w.name : 'Unknown worker', paid, changedSincePaid: paid ? (r2(n(paid.amount)) !== e.pay) : false });
    }).sort((a, b) => a.name.localeCompare(b.name));
    const total = r2(rows.reduce((a, r) => a + r.pay, 0));
    const totalHours = r2(rows.reduce((a, r) => a + r.hours, 0));
    const paidTotal = r2(rows.filter(r => r.paid).reduce((a, r) => a + n(r.paid.amount), 0));
    return { start, end, rows, total, totalHours, paidTotal, unpaidTotal: r2(total - rows.filter(r => r.paid && !r.changedSincePaid).reduce((a, r) => a + r.pay, 0)) };
  }
  function shareSummary() {
    const jobs = Store.list('jobs').filter(j => j.shareApplies && j.status !== 'Canceled');
    const rows = jobs.map(j => ({ job: j, m: jobMoney(j) }));
    const due = r2(rows.reduce((a, r) => a + r.m.share, 0));
    const recorded = r2(Store.list('share').reduce((a, s) => a + n(s.amount), 0));
    return { rows, due, recorded, remaining: r2(due - recorded) };
  }
  function moneyOwed() {
    let owed = 0;
    for (const j of Store.list('jobs')) { if (j.status === 'Canceled') continue; const m = jobMoney(j); if (m.balance > 0) owed += m.balance; }
    for (const inv of Store.list('invoices')) { if (inv.jobId && Store.get(inv.jobId)) continue; const st = invoiceStatus(inv); if (st.balance > 0) owed += st.balance; }
    return r2(owed);
  }
  function tradeDiff(t) { return r2(n(t.getValue) - n(t.giveValue)); }
  function edTotals(p) {
    const t = { lynn: 0, ed: 0, byType: {} };
    for (const c of (p.contributions || [])) {
      const v = n(c.value);
      if (c.party === 'Ed Robinson') t.ed += v; else t.lynn += v;
      t.byType[c.type] = (t.byType[c.type] || 0) + v;
    }
    t.lynn = r2(t.lynn); t.ed = r2(t.ed); t.total = r2(t.lynn + t.ed);
    return t;
  }
  window.Calc = { n, r2, D, money, itemsTotal, settings, invoiceStatus, jobMoney, payroll, weekRange, shareSummary, moneyOwed, tradeDiff, edTotals, laborCost };
})();
