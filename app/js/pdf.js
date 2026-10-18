/* Branded PDF builder (jsPDF, fully offline). */
(function () {
  'use strict';
  const NAVY = [16, 33, 64], GOLD = [201, 151, 38], INK = [30, 34, 44], MUTED = [100, 106, 120], LINE = [215, 205, 180];
  let logoData = null;
  async function loadLogo() {
    if (logoData) return logoData;
    const res = await fetch('assets/logo.jpg');
    const blob = await res.blob();
    logoData = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = bad; fr.readAsDataURL(blob); });
    return logoData;
  }
  const clean = s => String(s == null ? '' : s)
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/\u2022/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

  let loading = null;
  function ensureLib() {
    if (window.jspdf) return Promise.resolve();
    if (!loading) loading = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'js/vendor/jspdf.umd.min.js';
      sc.onload = () => res();
      sc.onerror = () => { loading = null; rej(new Error('The PDF maker could not load. Please try again.')); };
      document.head.appendChild(sc);
    });
    return loading;
  }
  async function build(spec) {
    await ensureLib();
    const { jsPDF } = window.jspdf;
    const biz = spec.business;
    const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: !(window.Native && window.Native.on) });
    doc.setProperties({ title: clean(spec.title + (spec.number ? ' ' + spec.number : '')), author: clean(biz.owner), creator: 'Smarter Home Improvements - My Business Book', subject: clean(biz.name) });
    const W = 612, H = 792, M = 44;
    let y = 0;
    const logo = await loadLogo();
    function header() {
      doc.setFillColor(...NAVY); doc.rect(0, 0, W, 8, 'F');
      doc.setFillColor(...GOLD); doc.rect(0, 8, W, 2.5, 'F');
      const lw = 190, lh = lw * 496 / 1134;
      doc.addImage(logo, 'JPEG', M - 6, 22, lw, lh, 'logo', 'FAST');
      doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text(clean(biz.name), W - M, 40, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK);
      doc.text(clean(biz.owner + ', Owner'), W - M, 56, { align: 'right' });
      doc.text(clean(biz.phone), W - M, 70, { align: 'right' });
      doc.text(clean(biz.city), W - M, 84, { align: 'right' });
      doc.setFont('helvetica', 'italic'); doc.setTextColor(...GOLD);
      doc.text(clean(biz.slogan), W - M, 98, { align: 'right' });
      y = 22 + lh + 14;
      doc.setFillColor(...NAVY); doc.roundedRect(M, y, W - 2 * M, 34, 4, 4, 'F');
      doc.setDrawColor(...GOLD); doc.setLineWidth(1.2); doc.roundedRect(M + 3, y + 3, W - 2 * M - 6, 28, 3, 3, 'S');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(clean(spec.title.toUpperCase()), M + 14, y + 22.5);
      if (spec.number) { doc.setTextColor(...GOLD); doc.setFontSize(13); doc.text(clean(spec.number), W - M - 14, y + 22.5, { align: 'right' }); }
      y += 52;
    }
    function footer() {
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...GOLD); doc.setLineWidth(1); doc.line(M, H - 40, W - M, H - 40);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
        doc.text(clean(biz.name + '  |  ' + biz.phone + '  |  ' + biz.city), M, H - 26);
        doc.text('Page ' + i + ' of ' + pages, W - M, H - 26, { align: 'right' });
      }
    }
    function need(h) { if (y + h > H - 56) { doc.addPage(); y = 50; } }
    function heading(t) {
      need(30);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
      doc.text(clean(t), M, y + 12);
      doc.setDrawColor(...GOLD); doc.setLineWidth(1); doc.line(M, y + 17, W - M, y + 17);
      y += 26;
    }
    function kv(rows) {
      doc.setFontSize(10.5);
      for (const [k, v] of rows) {
        if (v == null || v === '') continue;
        const lines = doc.splitTextToSize(clean(v), W - 2 * M - 150);
        need(14 * lines.length + 4);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED); doc.text(clean(k), M, y + 10);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text(lines, M + 150, y + 10);
        y += 14 * lines.length + 3;
      }
      y += 6;
    }
    function paragraph(t) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(clean(t), W - 2 * M);
      for (const ln of lines) { need(14); doc.text(ln, M, y + 10); y += 14; }
      y += 6;
    }
    function table(cols, rows, opts) {
      opts = opts || {};
      const total = W - 2 * M;
      const widths = cols.map(c => c.w * total);
      const drawHead = () => {
        need(24);
        doc.setFillColor(...NAVY); doc.rect(M, y, total, 22, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
        let x = M;
        cols.forEach((c, i) => { const tx = c.align === 'right' ? x + widths[i] - 6 : x + 6; doc.text(clean(c.label), tx, y + 15, { align: c.align === 'right' ? 'right' : 'left' }); x += widths[i]; });
        y += 22;
      };
      drawHead();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      rows.forEach((row, ri) => {
        const cells = row.map((v, i) => doc.splitTextToSize(clean(v), widths[i] - 12));
        const h = Math.max(...cells.map(c => c.length)) * 13 + 9;
        if (y + h > H - 56) { doc.addPage(); y = 50; drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); }
        if (ri % 2 === 1) { doc.setFillColor(248, 244, 232); doc.rect(M, y, total, h, 'F'); }
        doc.setTextColor(...INK);
        let x = M;
        cells.forEach((c, i) => { const al = cols[i].align === 'right'; doc.text(c, al ? x + widths[i] - 6 : x + 6, y + 14, { align: al ? 'right' : 'left' }); x += widths[i]; });
        doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, y + h, M + total, y + h);
        y += h;
      });
      if (!rows.length) { need(20); doc.setTextColor(...MUTED); doc.text('No entries.', M + 6, y + 14); y += 20; }
      y += 8;
    }
    function totals(rows) {
      for (const [k, v, bold] of rows) {
        need(bold ? 26 : 18);
        if (bold) { doc.setFillColor(...NAVY); doc.rect(W - M - 230, y, 230, 22, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); }
        else { doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); }
        doc.text(clean(k), W - M - 220, y + 15);
        doc.text(clean(v), W - M - 8, y + 15, { align: 'right' });
        y += bold ? 26 : 18;
      }
      y += 6;
    }
    header();
    for (const block of spec.blocks || []) {
      if (block.heading) heading(block.heading);
      if (block.kv) kv(block.kv);
      if (block.table) table(block.table.cols, block.table.rows);
      if (block.totals) totals(block.totals);
      if (block.text) paragraph(block.text);
      if (block.signature) {
        need(70); y += 30;
        doc.setDrawColor(...INK); doc.setLineWidth(0.7);
        doc.line(M, y, M + 220, y); doc.line(W - M - 160, y, W - M, y);
        doc.setFontSize(9.5); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal');
        doc.text(clean(block.signature[0]), M, y + 13); doc.text(clean(block.signature[1] || 'Date'), W - M - 160, y + 13);
        y += 30;
      }
    }
    need(30);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...GOLD);
    doc.text('Thank you for choosing Smarter Home Improvements!', W / 2, y + 16, { align: 'center' });
    footer();
    return doc;
  }
  async function blob(spec) { const d = await build(spec); return d.output('blob'); }
  window.PDF = { build, blob, loadLogo, clean };
})();
