/* Section definitions for every binder tab. */
(function () {
  'use strict';
  const { esc, icon } = UI;
  const { n, r2, D, money } = Calc;
  const SERVICES = ['Home Repairs', 'Painting', 'Drywall', 'Flooring', 'Lawn Care', 'Tree Removal', 'Make-Ready', 'Cleanup'];
  const JOB_STATUS = ['Estimate', 'Scheduled', 'In Progress', 'Completed', 'Paid', 'Canceled'];
  const METHODS = ['Cash', 'Check', 'Zelle', 'Cash App', 'Venmo', 'Card', 'Other'];
  const name = id => Fields.refName(id);
  const custOf = r => Store.get(r.customerId);
  const nextNumber = (section, prefix) => {
    let max = 0;
    for (const r of Store.list(section)) { const m = /(\d+)\s*$/.exec(r.number || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    return prefix + '-' + String(max + 1).padStart(4, '0');
  };
  const itemsTable = items => ({ cols: [{ label: 'Description', w: 0.5 }, { label: 'Qty', w: 0.12, align: 'right' }, { label: 'Price each', w: 0.18, align: 'right' }, { label: 'Amount', w: 0.2, align: 'right' }], rows: (items || []).map(it => [it.desc, String(it.qty), money(it.price), money(n(it.qty) * n(it.price))]) });
  const kvFields = (sec, rec) => sec.fields.filter(f => !['items', 'photos', 'contributions', 'note', 'calc'].includes(f.type)).map(f => [f.label, Sections.display(f, rec[f.key])]).filter(([, v]) => v !== '' && v != null);
  const billTo = rec => { const c = custOf(rec); return c ? [['Customer', c.name], ['Address', Store.get(rec.jobId)?.address || c.address || ''], ['Phone', c.phone || '']] : []; };

  const S = [
    {
      key: 'planner', label: 'Daily Planner', tab: 'Planner', color: '#b8432f', icon: 'planner', noun: 'plan item',
      intro: 'Write down what needs doing today. Pick a day, tap Add, choose what it is, and check it off when done.',
      fields: [
        { key: 'date', label: 'Day', type: 'date', default: () => D.today(), required: true },
        { key: 'time', label: 'Time (optional)', type: 'time' },
        { key: 'title', label: 'What needs doing?', type: 'text', required: true, chips: ['Estimate visit', 'Work on job', 'Pick up materials', 'Call customer', 'Collect payment', 'Friday payroll', 'Send invoice'] },
        { key: 'jobId', label: 'For which job? (optional)', type: 'ref', target: 'jobs' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
        { key: 'done', label: 'Done', type: 'toggle' },
        { key: 'remind', label: 'Also add a reminder for this', type: 'toggle', help: 'Shows in Reminders with a bell badge when it is due.' }
      ],
      title: r => r.title, sub: r => D.pretty(r.date) + (r.time ? ' · ' + Fields.fmtTime(r.time) : '') + (r.jobId ? ' · ' + name(r.jobId) : ''),
      badge: r => r.done ? { t: 'Done', c: 'ok' } : (r.date < D.today() ? { t: 'Past due', c: 'bad' } : null),
      sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (a.time || '').localeCompare(b.time || '')
    },
    {
      key: 'customers', label: 'Customers', tab: 'Customers', color: '#2f6f8f', icon: 'customers', noun: 'customer',
      intro: 'Everyone you work for. Add a name and phone; the rest is optional. Tap a customer to call, text, or see their jobs.',
      fields: [
        { key: 'name', label: 'Customer name', type: 'text', required: true },
        { key: 'phone', label: 'Phone', type: 'tel' },
        { key: 'address', label: 'Address', type: 'text', placeholder: 'Street, City', chips: ['Killeen, TX', 'Harker Heights, TX', 'Copperas Cove, TX', 'Fort Cavazos, TX', 'Belton, TX', 'Temple, TX'] },
        { key: 'email', label: 'Email (optional)', type: 'email' },
        { key: 'source', label: 'How they found you', type: 'select', blank: '—', options: ['Referral', 'Repeat customer', 'Business card', 'Facebook', 'Yard sign', 'Property manager', 'Other'] },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.name, sub: r => [r.phone, r.address].filter(Boolean).join(' · '),
      sort: (a, b) => (a.name || '').localeCompare(b.name || '')
    },
    {
      key: 'jobs', label: 'Jobs', tab: 'Jobs', color: '#c9972b', icon: 'jobs', noun: 'job',
      intro: 'One record per job. Pick the customer, the work, the price, and who is working. Costs, payments, balance, 25% share and profit add up automatically from what you record.',
      fields: [
        { key: 'title', label: 'Type of work', type: 'text', required: true, chips: SERVICES },
        { key: 'customerId', label: 'Customer', type: 'ref', target: 'customers', quickAdd: true, blank: '— pick a customer —' },
        { key: 'address', label: 'Job address', type: 'text', help: 'Filled from the customer when you pick one. Change it if the job is somewhere else.' },
        { key: 'price', label: 'Job price (agreed)', type: 'money' },
        { key: 'status', label: 'Status', type: 'segmented', options: JOB_STATUS, default: 'Scheduled', help: '"Paid" can only be chosen after payments covering the amount due are recorded.' },
        { key: 'startDate', label: 'Start date', type: 'date', default: () => D.today() },
        { key: 'endDate', label: 'Finish date', type: 'date', dateChips: ['Today', 'Tomorrow', 'In 7 days'] },
        { key: 'workerIds', label: 'Workers on this job', type: 'multiref', target: 'workers', targetLabel: 'Workers' },
        { key: 'materialsNote', label: 'Materials needed', type: 'textarea', placeholder: 'e.g. 2 gal paint, 3 sheets drywall', help: 'Materials you actually buy go in the Materials tab so their cost counts.' },
        { key: 'shareApplies', label: '25% company share applies to this job', type: 'toggle', default: true, help: 'Turn off for jobs where the company share does not apply.' },
        { key: 'photos', label: 'Photos (before / during / after)', type: 'photos' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.title, sub: r => [custOf(r)?.name, r.address, r.startDate ? D.short(r.startDate) : ''].filter(Boolean).join(' · '),
      badge: r => ({ t: r.status || 'Scheduled', c: { Paid: 'ok', Completed: 'info', Canceled: 'mute', 'In Progress': 'warn', Estimate: 'mute' }[r.status] || 'info' }),
      amount: r => money(r.price),
      sort: (a, b) => (b.startDate || '').localeCompare(a.startDate || ''),
      validate: (r) => {
        if (r.status === 'Paid') {
          const m = Calc.jobMoney(r);
          if (m.received <= 0 || m.balance > 0.004) return 'This job cannot be marked Paid yet. Recorded payments: ' + money(m.received) + ' of ' + money(m.billed) + '. Use "Record payment" on the job first.';
        }
        return null;
      }
    },
    {
      key: 'estimates', label: 'Estimates', tab: 'Estimates', color: '#4f7d3a', icon: 'estimates', noun: 'estimate',
      intro: 'Give every customer a written estimate. Tap a service to add a line, set the price, then Share it as a PDF. When they say yes, tap "Make invoice".',
      fields: [
        { key: 'number', label: 'Estimate number', type: 'text', default: () => nextNumber('estimates', 'EST') },
        { key: 'date', label: 'Date', type: 'date', default: () => D.today(), required: true },
        { key: 'validUntil', label: 'Good until', type: 'date', dateChips: ['In 14 days', 'In 30 days'], default: () => D.add(D.today(), 30) },
        { key: 'customerId', label: 'Customer', type: 'ref', target: 'customers', quickAdd: true, blank: '— pick a customer —' },
        { key: 'jobId', label: 'Job (optional)', type: 'ref', target: 'jobs' },
        { key: 'items', label: 'Work and prices', type: 'items', chips: SERVICES },
        { key: 'taxRate', label: 'Sales tax % (leave 0 if none)', type: 'number', step: 0.25, default: 0, unit: '%' },
        { key: 'status', label: 'Status', type: 'segmented', options: ['Draft', 'Sent', 'Accepted', 'Declined'], default: 'Draft' },
        { key: 'notes', label: 'Notes / terms', type: 'textarea', chips: ['50% deposit due before work starts.', 'Balance due when the job is finished.', 'Price includes materials and labor.', 'Price is for labor only; materials extra.'] }
      ],
      title: r => (r.number || 'Estimate') + ' — ' + (custOf(r)?.name || 'No customer'), sub: r => D.pretty(r.date) + ' · ' + (r.status || 'Draft') + (r.invoiceId ? ' · invoiced' : ''),
      amount: r => money(Calc.itemsTotal(r.items, r.taxRate).total),
      badge: r => ({ t: r.status || 'Draft', c: { Accepted: 'ok', Declined: 'bad', Sent: 'info' }[r.status] || 'mute' }),
      sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''),
      doc: r => { const t = Calc.itemsTotal(r.items, r.taxRate); return { title: 'Estimate', number: r.number, file: (r.number || 'estimate'), blocks: [{ kv: [['Date', D.pretty(r.date)], ['Good until', r.validUntil ? D.pretty(r.validUntil) : '']].concat(billTo(r)).concat(r.jobId ? [['Job', name(r.jobId)]] : []) }, { heading: 'Work and prices', table: itemsTable(r.items) }, { totals: [['Subtotal', money(t.subtotal)]].concat(n(r.taxRate) ? [['Tax (' + r.taxRate + '%)', money(t.tax)]] : []).concat([['Estimate total', money(t.total), true]]) }].concat(r.notes ? [{ heading: 'Notes and terms', text: r.notes }] : []).concat([{ signature: ['Customer approval (signature)', 'Date'] }]) }; }
    },
    {
      key: 'workers', label: 'Workers', tab: 'Workers', color: '#8a4f9e', icon: 'workers', noun: 'worker',
      intro: 'Your crew. Put in each person\'s hourly rate once; it fills in automatically when you log hours and run Friday payroll.',
      fields: [
        { key: 'name', label: 'Worker name', type: 'text', required: true },
        { key: 'phone', label: 'Phone', type: 'tel' },
        { key: 'trade', label: 'Main trade / skill', type: 'text', chips: ['Helper', 'Painter', 'Drywall', 'Flooring', 'Lawn crew', 'Tree work', 'Carpenter', 'General labor'] },
        { key: 'rate', label: 'Hourly pay rate', type: 'money', chips: ['12', '15', '18', '20', '25'] },
        { key: 'active', label: 'Currently working with us', type: 'toggle', default: true },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.name, sub: r => [r.trade, r.rate !== '' && r.rate != null ? money(r.rate) + '/hr' : '', r.phone].filter(Boolean).join(' · '),
      badge: r => r.active === false ? { t: 'Inactive', c: 'mute' } : null,
      sort: (a, b) => (a.name || '').localeCompare(b.name || '')
    },
    {
      key: 'hours', label: 'Hours', tab: 'Hours', color: '#2d8a84', icon: 'hours', noun: 'time entry',
      intro: 'Log hours each day: pick the worker, the job, and tap + or − for hours. These hours feed Friday payroll and job labor costs.',
      fields: [
        { key: 'date', label: 'Day worked', type: 'date', default: () => D.today(), required: true, dateChips: ['Today', 'Tomorrow'] },
        { key: 'workerId', label: 'Worker', type: 'ref', target: 'workers', blank: '— pick a worker —' },
        { key: 'jobId', label: 'Job', type: 'ref', target: 'jobs', blank: '— no job / shop time —' },
        { key: 'hours', label: 'Hours worked', type: 'number', step: 0.5, default: 8, unit: 'hrs', chips: ['4', '6', '8', '10'] },
        { key: 'rate', label: 'Hourly rate', type: 'money', help: 'Fills in from the worker. Change it only if this day pays differently.' },
        { key: 'calc', type: 'calc' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => (name(r.workerId) || 'Unknown worker') + ' — ' + n(r.hours) + ' hrs', sub: r => D.pretty(r.date) + (r.jobId ? ' · ' + name(r.jobId) : ''),
      amount: r => money(Calc.laborCost(r)),
      sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
      validate: r => !r.workerId ? 'Pick which worker these hours are for.' : (!(n(r.hours) > 0) ? 'Enter the hours worked.' : (n(r.hours) > 24 ? 'Hours for one day cannot be more than 24.' : null))
    },
    {
      key: 'payroll', label: 'Friday Payroll', tab: 'Payroll', color: '#a8323e', icon: 'payroll', noun: 'payroll payment',
      intro: 'Every Friday: check the week\'s hours, then tap "Mark paid" for each worker only after you actually pay them.',
      fields: [
        { key: 'weekEnding', label: 'Week ending (Friday)', type: 'date', required: true, dateChips: ['This Friday'] },
        { key: 'workerId', label: 'Worker', type: 'ref', target: 'workers' },
        { key: 'hours', label: 'Hours paid', type: 'number', step: 0.5 },
        { key: 'amount', label: 'Amount paid', type: 'money' },
        { key: 'paidDate', label: 'Date paid', type: 'date', required: true },
        { key: 'method', label: 'Paid by', type: 'text', chips: METHODS },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => (name(r.workerId) || 'Worker') + ' — ' + money(r.amount), sub: r => 'Week ending ' + D.short(r.weekEnding) + ' · paid ' + D.short(r.paidDate) + (r.method ? ' · ' + r.method : ''),
      badge: () => ({ t: 'Paid', c: 'ok' }),
      sort: (a, b) => (b.weekEnding || '').localeCompare(a.weekEnding || '')
    },
    {
      key: 'materials', label: 'Materials', tab: 'Materials', color: '#7a5a3a', icon: 'materials', noun: 'material',
      intro: 'Every material you buy for a job. Pick the job so the cost counts against that job\'s profit.',
      fields: [
        { key: 'name', label: 'Item', type: 'text', required: true, chips: ['Paint', 'Drywall sheets', 'Joint compound', 'Flooring', 'Lumber', 'Screws / nails', 'Caulk', 'Mulch', 'Trash bags'] },
        { key: 'jobId', label: 'For which job', type: 'ref', target: 'jobs', blank: '— not for a job / stock —' },
        { key: 'qty', label: 'Quantity', type: 'number', step: 1, default: 1 },
        { key: 'unit', label: 'Unit', type: 'select', options: ['each', 'gallon', 'sheet', 'box', 'bag', 'roll', 'sq ft', 'ft', 'lb', 'load'] },
        { key: 'unitCost', label: 'Cost each', type: 'money' },
        { key: 'calc', type: 'calc' },
        { key: 'supplier', label: 'Where bought', type: 'text', chips: ['Home Depot', 'Lowe\'s', 'Walmart', 'Supply house', 'Other'] },
        { key: 'date', label: 'Date bought', type: 'date', default: () => D.today() },
        { key: 'photos', label: 'Receipt photo', type: 'photos' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.name, sub: r => [n(r.qty) + ' ' + (r.unit || 'each'), r.jobId ? name(r.jobId) : 'No job', r.date ? D.short(r.date) : ''].join(' · '),
      amount: r => money(n(r.qty) * n(r.unitCost)),
      sort: (a, b) => (b.date || '').localeCompare(a.date || '')
    },
    {
      key: 'expenses', label: 'Expenses', tab: 'Expenses', color: '#c46a2b', icon: 'expenses', noun: 'expense',
      intro: 'Gas, tools, dump fees, rentals — anything the business spends that is not materials. Pick a job if it was for one job. Snap a photo of the receipt.',
      fields: [
        { key: 'category', label: 'What kind', type: 'text', required: true, chips: ['Fuel', 'Tools', 'Equipment rental', 'Dump fees', 'Supplies', 'Vehicle', 'Phone', 'Advertising', 'Other'] },
        { key: 'amount', label: 'Amount', type: 'money' },
        { key: 'date', label: 'Date', type: 'date', default: () => D.today() },
        { key: 'jobId', label: 'For which job (optional)', type: 'ref', target: 'jobs', blank: '— general business —' },
        { key: 'paidBy', label: 'Paid with', type: 'text', chips: ['Business card', 'Cash', 'Personal — pay back', 'Check'] },
        { key: 'photos', label: 'Receipt photo', type: 'photos' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.category, sub: r => [r.date ? D.short(r.date) : '', r.jobId ? name(r.jobId) : 'General', r.paidBy].filter(Boolean).join(' · '),
      amount: r => money(r.amount),
      sort: (a, b) => (b.date || '').localeCompare(a.date || '')
    },
    {
      key: 'invoices', label: 'Invoices', tab: 'Invoices', color: '#3557a8', icon: 'invoices', noun: 'invoice',
      intro: 'Bill the customer. Payment status comes only from payments you record — tap "Record payment" when money comes in and a receipt is made for you.',
      fields: [
        { key: 'number', label: 'Invoice number', type: 'text', default: () => nextNumber('invoices', 'INV') },
        { key: 'date', label: 'Invoice date', type: 'date', default: () => D.today(), required: true },
        { key: 'dueDate', label: 'Due date', type: 'date', dateChips: ['Today', 'In 7 days', 'In 14 days', 'In 30 days'], default: () => D.add(D.today(), 7) },
        { key: 'customerId', label: 'Customer', type: 'ref', target: 'customers', quickAdd: true, blank: '— pick a customer —' },
        { key: 'jobId', label: 'Job', type: 'ref', target: 'jobs' },
        { key: 'items', label: 'Work and prices', type: 'items', chips: SERVICES },
        { key: 'taxRate', label: 'Sales tax % (leave 0 if none)', type: 'number', step: 0.25, default: 0, unit: '%' },
        { key: 'notes', label: 'Notes', type: 'textarea', chips: ['Thank you for your business!', 'Payment due upon receipt.', 'We accept cash, check, Zelle and Cash App.'] }
      ],
      title: r => (r.number || 'Invoice') + ' — ' + (custOf(r)?.name || 'No customer'), sub: r => D.pretty(r.date) + (r.dueDate ? ' · due ' + D.short(r.dueDate) : ''),
      amount: r => money(Calc.itemsTotal(r.items, r.taxRate).total),
      badge: r => { const s = Calc.invoiceStatus(r); const overdue = s.key !== 'paid' && r.dueDate && r.dueDate < D.today(); return { t: s.key === 'paid' ? 'Paid' : (s.key === 'partial' ? 'Partly paid' : (overdue ? 'Overdue' : 'Unpaid')), c: s.key === 'paid' ? 'ok' : (overdue ? 'bad' : 'warn') }; },
      sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''),
      doc: r => { const t = Calc.itemsTotal(r.items, r.taxRate); const s = Calc.invoiceStatus(r); return { title: 'Invoice', number: r.number, file: r.number || 'invoice', blocks: [{ kv: [['Invoice date', D.pretty(r.date)], ['Due date', r.dueDate ? D.pretty(r.dueDate) : '']].concat(billTo(r)).concat(r.jobId ? [['Job', name(r.jobId)]] : []) }, { heading: 'Work and prices', table: itemsTable(r.items) }, { totals: [['Subtotal', money(t.subtotal)]].concat(n(r.taxRate) ? [['Tax (' + r.taxRate + '%)', money(t.tax)]] : []).concat([['Invoice total', money(t.total)], ['Payments received', money(s.paid)], ['Balance due', money(Math.max(s.balance, 0)), true]]) }, { kv: [['Payment status', s.status]] }].concat(r.notes ? [{ heading: 'Notes', text: r.notes }] : []) }; }
    },
    {
      key: 'receipts', label: 'Receipts', tab: 'Receipts', color: '#5c8a2f', icon: 'receipts', noun: 'receipt',
      intro: 'A receipt is a payment you received. Recording one here is what makes a job or invoice show as paid. Share the receipt PDF with the customer.',
      fields: [
        { key: 'number', label: 'Receipt number', type: 'text', default: () => nextNumber('receipts', 'RCT') },
        { key: 'date', label: 'Date received', type: 'date', default: () => D.today(), required: true },
        { key: 'customerId', label: 'Received from', type: 'ref', target: 'customers', quickAdd: true, blank: '— pick a customer —' },
        { key: 'jobId', label: 'For job', type: 'ref', target: 'jobs' },
        { key: 'invoiceId', label: 'For invoice (optional)', type: 'ref', target: 'invoices' },
        { key: 'amount', label: 'Amount received', type: 'money', required: true },
        { key: 'method', label: 'Paid by', type: 'text', chips: METHODS },
        { key: 'notes', label: 'Notes', type: 'textarea', chips: ['Deposit', 'Final payment', 'Partial payment'] }
      ],
      title: r => (r.number || 'Receipt') + ' — ' + (custOf(r)?.name || 'No customer'), sub: r => D.pretty(r.date) + (r.method ? ' · ' + r.method : '') + (r.jobId ? ' · ' + name(r.jobId) : ''),
      amount: r => money(r.amount),
      sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''),
      validate: r => !(n(r.amount) > 0) ? 'Enter the amount you received.' : null,
      doc: r => { const inv = Store.get(r.invoiceId); const s = inv ? Calc.invoiceStatus(inv) : null; const c = custOf(r); return { title: 'Payment Receipt', number: r.number, file: r.number || 'receipt', blocks: [{ kv: [['Date received', D.pretty(r.date)], ['Received from', c ? c.name : ''], ['Address', c ? c.address : ''], ['Job', r.jobId ? name(r.jobId) : ''], ['For invoice', inv ? inv.number : ''], ['Paid by', r.method || ''], ['Note', r.notes || '']] }, { totals: [['Amount received', money(r.amount), true]].concat(s ? [['Invoice total', money(s.total)], ['Total paid to date', money(s.paid)], ['Remaining balance', money(Math.max(s.balance, 0))]] : []) }, { text: 'Payment received with thanks. Please keep this receipt for your records.' }, { signature: ['Received by: ' + Sections.biz().owner, 'Date'] }] }; }
    },
    {
      key: 'share', label: '25% Company Share', tab: '25% Share', color: '#b08d1e', icon: 'share', noun: 'share payment',
      intro: 'Shows the company share owed on each job where it applies, and lets you record when the share is set aside or paid.',
      fields: [
        { key: 'date', label: 'Date', type: 'date', default: () => D.today(), required: true },
        { key: 'jobId', label: 'For job (optional)', type: 'ref', target: 'jobs', filter: j => j.shareApplies },
        { key: 'amount', label: 'Amount set aside / paid', type: 'money', required: true },
        { key: 'notes', label: 'Notes', type: 'textarea', chips: ['Moved to business savings', 'Paid to company account'] }
      ],
      title: r => 'Share recorded — ' + money(r.amount), sub: r => D.pretty(r.date) + (r.jobId ? ' · ' + name(r.jobId) : ''),
      amount: r => money(r.amount),
      sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
      validate: r => !(n(r.amount) > 0) ? 'Enter the amount.' : null
    },
    {
      key: 'sidejobs', label: 'Side Jobs', tab: 'Side Jobs', color: '#6b4fa0', icon: 'sidejobs', noun: 'side job',
      intro: 'Small extra jobs done by you or a worker. Record who did it, whether the owner approved it, and the pay that was agreed.',
      fields: [
        { key: 'description', label: 'What was the side job?', type: 'text', required: true, chips: ['Fix a door', 'Mow a yard', 'Patch drywall', 'Haul off junk', 'Paint a room'] },
        { key: 'date', label: 'Date', type: 'date', default: () => D.today() },
        { key: 'workerId', label: 'Who did it (worker)', type: 'ref', target: 'workers', blank: '— Lynn / not a worker —' },
        { key: 'doneByOther', label: 'Or someone else (name)', type: 'text' },
        { key: 'forWhom', label: 'For whom / where', type: 'text' },
        { key: 'charged', label: 'Amount charged to the customer', type: 'money' },
        { key: 'approval', label: 'Owner approval', type: 'segmented', options: ['Pending', 'Approved', 'Declined'], default: 'Pending' },
        { key: 'approvalDate', label: 'Date approved / declined', type: 'date' },
        { key: 'compAgreed', label: 'Compensation agreed (in words)', type: 'textarea', placeholder: 'e.g. Worker keeps $80, company gets $20' },
        { key: 'compAmount', label: 'Compensation amount to the person', type: 'money' },
        { key: 'compPaid', label: 'Compensation has been paid', type: 'toggle' },
        { key: 'compPaidDate', label: 'Date compensation paid', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.description, sub: r => [r.date ? D.short(r.date) : '', name(r.workerId) || r.doneByOther || 'Lynn', r.forWhom].filter(Boolean).join(' · '),
      amount: r => r.charged !== '' && r.charged != null ? money(r.charged) : '',
      badge: r => ({ t: r.approval || 'Pending', c: { Approved: 'ok', Declined: 'bad' }[r.approval] || 'warn' }),
      sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
      beforeSave: r => { if (r.approval && r.approval !== 'Pending' && !r.approvalDate) r.approvalDate = D.today(); if (r.approval === 'Pending') r.approvalDate = ''; if (r.compPaid && !r.compPaidDate) r.compPaidDate = D.today(); if (!r.compPaid) r.compPaidDate = ''; return r; }
    },
    {
      key: 'trades', label: 'Trades', tab: 'Trades', color: '#1f7a6b', icon: 'trades', noun: 'trade',
      intro: 'When you swap work or goods instead of cash. Write what you give, what you get, and a fair dollar value for each side.',
      fields: [
        { key: 'partner', label: 'Trading with', type: 'text', required: true },
        { key: 'date', label: 'Date agreed', type: 'date', default: () => D.today() },
        { key: 'giveDesc', label: 'What we give', type: 'textarea', rows: 2 },
        { key: 'giveValue', label: 'Dollar value of what we give', type: 'money' },
        { key: 'getDesc', label: 'What we get', type: 'textarea', rows: 2 },
        { key: 'getValue', label: 'Dollar value of what we get', type: 'money' },
        { key: 'calc', type: 'calc' },
        { key: 'status', label: 'Status', type: 'segmented', options: ['Not started', 'In progress', 'Completed'], default: 'Not started' },
        { key: 'completedDate', label: 'Date completed', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => 'Trade with ' + r.partner, sub: r => 'Give ' + money(r.giveValue) + ' · Get ' + money(r.getValue) + (r.date ? ' · ' + D.short(r.date) : ''),
      badge: r => ({ t: r.status || 'Not started', c: { Completed: 'ok', 'In progress': 'warn' }[r.status] || 'mute' }),
      sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
      beforeSave: r => { if (r.status === 'Completed' && !r.completedDate) r.completedDate = D.today(); return r; }
    },
    {
      key: 'ed', label: 'Ed Robinson Joint Projects', tab: 'Ed Robinson', color: '#9a3b6a', icon: 'ed', noun: 'joint project',
      intro: 'Projects done together with Ed Robinson. Record what each side put in and the compensation you both agreed to.',
      banner: 'This book does not assume who owns a project or how it is split. Only what you and Ed actually agreed should be written here.',
      fields: [
        { key: 'note', type: 'note', text: 'Nothing here assumes ownership or a split. Record only what you and Ed Robinson agreed.' },
        { key: 'name', label: 'Project name', type: 'text', required: true },
        { key: 'jobId', label: 'Linked job (optional)', type: 'ref', target: 'jobs' },
        { key: 'status', label: 'Status', type: 'segmented', options: ['Planning', 'Active', 'Finished', 'On hold'], default: 'Planning' },
        { key: 'contributions', label: 'Contributions (money, labor, materials, equipment)', type: 'contributions' },
        { key: 'agreement', label: 'Negotiated compensation / split (as agreed)', type: 'textarea', rows: 4, placeholder: 'Write the agreement in your own words', help: 'Leave blank until you and Ed have agreed.' },
        { key: 'edComp', label: 'Agreed amount to Ed Robinson (optional)', type: 'money' },
        { key: 'lynnComp', label: 'Agreed amount to Smarter Home Improvements (optional)', type: 'money' },
        { key: 'agreedDate', label: 'Date agreed', type: 'date' },
        { key: 'bothAgreed', label: 'Both of us have agreed to the above', type: 'toggle' },
        { key: 'notes', label: 'Notes', type: 'textarea' }
      ],
      title: r => r.name, sub: r => { const t = Calc.edTotals(r); return 'Lynn ' + money(t.lynn) + ' · Ed ' + money(t.ed) + (r.jobId ? ' · ' + name(r.jobId) : ''); },
      badge: r => r.bothAgreed ? { t: 'Agreed', c: 'ok' } : { t: 'No agreement recorded', c: 'warn' },
      sort: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      doc: r => { const t = Calc.edTotals(r); return { title: 'Joint Project Record', number: '', file: 'joint-project', blocks: [{ kv: [['Project', r.name], ['With', 'Ed Robinson'], ['Linked job', r.jobId ? name(r.jobId) : ''], ['Status', r.status]] }, { heading: 'Contributions', table: { cols: [{ label: 'Who', w: 0.28 }, { label: 'Type', w: 0.14 }, { label: 'What', w: 0.3 }, { label: 'Date', w: 0.14 }, { label: 'Value', w: 0.14, align: 'right' }], rows: (r.contributions || []).map(c => [c.party, c.type, c.desc, c.date ? D.short(c.date) : '', money(c.value)]) } }, { totals: [['Smarter Home Improvements', money(t.lynn)], ['Ed Robinson', money(t.ed)], ['Total contributed', money(t.total), true]] }, { heading: 'Negotiated compensation (as recorded)', text: r.agreement || 'No agreement recorded yet.' }, { kv: [['Agreed to Ed Robinson', r.edComp !== '' && r.edComp != null ? money(r.edComp) : ''], ['Agreed to company', r.lynnComp !== '' && r.lynnComp != null ? money(r.lynnComp) : ''], ['Date agreed', r.agreedDate ? D.pretty(r.agreedDate) : ''], ['Both agreed', r.bothAgreed ? 'Yes' : 'Not recorded']] }, { text: 'This record does not assume ownership or any split. It shows only what was entered as agreed.' }, { signature: ['Ernest Lynn Cope', 'Ed Robinson'] }] }; }
    },
    {
      key: 'policies', label: 'Policies', tab: 'Policies', color: '#4a5a70', icon: 'policies', noun: 'policy',
      intro: 'Your company rules in plain words — deposits, cancellations, cleanup, safety. Write them once and share them with customers or crew.',
      fields: [
        { key: 'title', label: 'Policy name', type: 'text', required: true, chips: ['Deposits', 'Payment', 'Cancellations', 'Change orders', 'Cleanup', 'Safety', 'Crew conduct', 'Warranty'] },
        { key: 'body', label: 'The policy', type: 'textarea', rows: 6 },
        { key: 'effective', label: 'Starts on', type: 'date' }
      ],
      title: r => r.title, sub: r => (r.body || '').slice(0, 80) + ((r.body || '').length > 80 ? '…' : ''),
      sort: (a, b) => (a.title || '').localeCompare(b.title || '')
    },
    {
      key: 'goals', label: 'Goals', tab: 'Goals', color: '#d08a1f', icon: 'goals', noun: 'goal',
      intro: 'What you want the business to reach. Give each goal a target date and check it off when you hit it.',
      fields: [
        { key: 'title', label: 'Goal', type: 'text', required: true },
        { key: 'targetDate', label: 'Target date', type: 'date', dateChips: ['In 30 days'] },
        { key: 'done', label: 'Reached this goal', type: 'toggle' },
        { key: 'notes', label: 'Steps / notes', type: 'textarea' }
      ],
      title: r => r.title, sub: r => (r.targetDate ? 'Target ' + D.short(r.targetDate) : 'No target date') + (r.done && r.doneDate ? ' · done ' + D.short(r.doneDate) : ''),
      badge: r => r.done ? { t: 'Done', c: 'ok' } : (r.targetDate && r.targetDate < D.today() ? { t: 'Past target', c: 'bad' } : { t: 'Working on it', c: 'info' }),
      sort: (a, b) => (a.done === b.done ? (a.targetDate || '9').localeCompare(b.targetDate || '9') : (a.done ? 1 : -1)),
      beforeSave: r => { if (r.done && !r.doneDate) r.doneDate = D.today(); if (!r.done) r.doneDate = ''; return r; }
    },
    {
      key: 'handbook', label: 'Business Handbook', tab: 'Handbook', color: '#5d3f2b', icon: 'handbook', noun: 'handbook page',
      intro: 'Simple guidance for running the business with this book. Every page can be edited or added to.',
      fields: [
        { key: 'title', label: 'Page title', type: 'text', required: true },
        { key: 'body', label: 'Guidance', type: 'textarea', rows: 8 },
        { key: 'order', label: 'Order in handbook', type: 'number', step: 1, default: 99 }
      ],
      title: r => r.title, sub: r => (r.body || '').split('\n')[0].slice(0, 90),
      sort: (a, b) => n(a.order) - n(b.order) || (a.title || '').localeCompare(b.title || '')
    },
    {
      key: 'reminders', label: 'Reminders', tab: 'Reminders', color: '#8c2f39', icon: 'reminders', noun: 'reminder', hiddenTab: true,
      intro: 'Things you must not forget. Due reminders show a number on the bell at the top.',
      fields: [
        { key: 'title', label: 'Remind me to…', type: 'text', required: true, chips: ['Call customer back', 'Collect payment', 'Order materials', 'Run Friday payroll', 'Back up my book', 'Follow up on estimate'] },
        { key: 'dueDate', label: 'Day', type: 'date', default: () => D.today(), required: true, dateChips: ['Today', 'Tomorrow', 'This Friday', 'In 7 days'] },
        { key: 'dueTime', label: 'Time', type: 'time' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
        { key: 'done', label: 'Done', type: 'toggle' }
      ],
      title: r => r.title, sub: r => D.pretty(r.dueDate) + (r.dueTime ? ' · ' + Fields.fmtTime(r.dueTime) : '') + (r.linkLabel ? ' · ' + r.linkLabel : ''),
      badge: r => r.done ? { t: 'Done', c: 'ok' } : (Sections.isDue(r) ? { t: 'Due', c: 'bad' } : null),
      sort: (a, b) => (a.done === b.done ? ((a.dueDate || '') + (a.dueTime || '')).localeCompare((b.dueDate || '') + (b.dueTime || '')) : (a.done ? 1 : -1))
    }
  ];

  const HANDBOOK = [
    ['How to use this book', 'Each colored tab is one part of the business.\n\n1. Tap a tab.\n2. Tap the big "Add" button.\n3. Tap the quick picks instead of typing when you can. Tap the microphone to talk instead of type (when your phone supports it).\n4. Tap Save.\n\nTap any record to Edit, Delete, Print or Share it. The Back button on your phone always takes you one step back. The house button takes you to the front of the book.'],
    ['Every job starts with a written estimate', 'Before work starts, give the customer a written estimate from the Estimates tab. List the work, the price, and what is included. Share it as a PDF by text or email and keep a copy. When the customer agrees, tap "Make invoice" or mark it Accepted.'],
    ['Deposits and getting paid', 'Decide your deposit policy and write it in Policies so you say the same thing every time. When money comes in — deposit, partial or final — record it right away with "Record payment". A receipt is made for you to share with the customer.'],
    ['Record every payment', 'This book only shows a job or invoice as paid when payments are recorded. It never guesses. If a customer paid, record it. If they have not, the balance stays open so nothing slips through the cracks.'],
    ['The Friday payroll routine', 'Every day: log each worker\'s hours in the Hours tab (worker, job, hours).\nEvery Friday: open Friday Payroll, check the hours and totals, pay each worker, then tap "Mark paid". Share or print the payroll sheet for your records.'],
    ['Keep every receipt', 'Put materials in the Materials tab and other spending in Expenses, with the job picked when it was for a job. Take a photo of the paper receipt. This is how the book knows each job\'s real cost and profit.'],
    ['The 25% company share', 'For jobs where it applies, the book figures the company share as a percent of the base you pick in Settings — the job price, the payments received, or the profit. It starts at 25% of the job price. Turn it off on any job where it does not apply. Record when you set the share aside in the 25% Share tab.'],
    ['Side jobs, trades and joint projects', 'Side jobs: write who did it and get the owner\'s approval before or right after.\nTrades: write what each side gives and a fair dollar value.\nJoint projects with Ed Robinson: write down what each of you put in and only the compensation you both agreed to. The book never assumes a split.'],
    ['Back up your book every week', 'Everything is saved on this phone. If the phone is lost or broken, the only copy is your backup. Once a week open Backup & Export, tap "Save a full backup", and keep the file somewhere safe (email it to yourself or save it to Google Drive).'],
    ['Good habits with customers', 'Answer the phone or call back the same day. Show up when you said. Call ahead if you are running late. Protect floors and furniture. Clean up every day. Take before and after photos. Walk the job with the customer when you finish.\n\nThis handbook is general guidance, not legal or tax advice. Talk to a tax professional about taxes and records.']
  ];
  const map = Object.fromEntries(S.map(s => [s.key, s]));
  function display(f, v) {
    if (v == null || v === '') return '';
    switch (f.type) {
      case 'money': return money(v);
      case 'date': return D.pretty(v);
      case 'time': return Fields.fmtTime(v);
      case 'ref': return name(v);
      case 'multiref': return (v || []).map(name).filter(Boolean).join(', ');
      case 'toggle': return v ? 'Yes' : 'No';
      case 'number': return String(v) + (f.unit ? ' ' + f.unit : '');
      default: return String(v);
    }
  }
  function isDue(r) {
    if (r.done || !r.dueDate) return false;
    const now = new Date();
    const due = D.parse(r.dueDate); if (r.dueTime) { const [h, m] = r.dueTime.split(':').map(Number); due.setHours(h, m); } else due.setHours(0, 0);
    return due <= now;
  }
  function biz() {
    const s = Calc.settings();
    return { name: 'Smarter Home Improvements', owner: s.owner || 'Ernest Lynn Cope', phone: s.phone || '254-338-0005', city: s.city || 'Killeen, Texas', slogan: s.slogan || 'One Call. Every Fix. Done Smarter.' };
  }
  function genericDoc(sec, rec) {
    const blocks = [{ kv: kvFields(sec, rec) }];
    if (sec.key === 'jobs') {
      const m = Calc.jobMoney(rec);
      blocks.push({ heading: 'Money summary (from recorded entries)', totals: [['Job price', money(m.price)], ['Amount billed' + (m.billedFrom === 'invoices' ? ' (invoices)' : ''), money(m.billed)], ['Materials', money(m.materials)], ['Expenses', money(m.expenses)], ['Labor (' + m.laborHours + ' hrs)', money(m.labor)], ['Total costs', money(m.costs)], ['Payments received', money(m.received)], ['Outstanding balance', money(m.balance)], ['Profit (billed - costs)', money(m.profit)]].concat(m.applies ? [['Company share (' + m.sharePct + '% of ' + shareBaseLabel(m.shareBase) + ')', money(m.share)], ['Profit after company share', money(m.afterShare)]] : [['Company share', 'Does not apply']]).concat([['Payment status', m.payStatus, true]]) });
    }
    if (sec.key === 'trades') blocks.push({ totals: [['We give', money(rec.giveValue)], ['We get', money(rec.getValue)], ['Difference (get - give)', money(Calc.tradeDiff(rec)), true]] });
    if (sec.key === 'hours') blocks.push({ totals: [['Pay for this entry', money(Calc.laborCost(rec)), true]] });
    if (sec.key === 'materials') blocks.push({ totals: [['Total cost', money(n(rec.qty) * n(rec.unitCost)), true]] });
    return { title: sec.noun.replace(/\b\w/g, c => c.toUpperCase()), number: '', file: sec.key, blocks };
  }
  function shareBaseLabel(b) { return b === 'received' ? 'payments received' : (b === 'profit' ? 'profit' : 'job price'); }
  function docFor(secKey, rec) {
    const sec = map[secKey];
    const spec = sec.doc ? sec.doc(rec) : genericDoc(sec, rec);
    spec.business = biz();
    const label = spec.number || String((sec.title && sec.title(rec)) || '').slice(0, 32);
    spec.filename = ('Smarter-' + (spec.file || secKey) + (label ? '-' + label : '') + '-' + (rec.date || rec.weekEnding || D.today())).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-') + '.pdf';
    return spec;
  }
  window.Sections = { list: S, map, SERVICES, JOB_STATUS, METHODS, HANDBOOK, display, isDue, biz, docFor, genericDoc, nextNumber, shareBaseLabel, itemsTable };
})();
