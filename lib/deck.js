'use strict';
/*
 * deck.js — builds the 17-slide weekly report as a native, editable PPTX with pptxgenjs.
 * Geometry, colours and type are measured from the reference WEEKLY REPORT.pptx (20" × 11.25").
 */
const path = require('path');
const fs = require('fs');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const { parseBold, stripMd, fitPt, needHeight, countLines } = require('./text');

const ASSETS = path.join(__dirname, '..', 'assets');
const C = { bg: '201D22', orange: 'F26E25', head: 'FF6F13', kpi: 'F58620', white: 'FFFFFF', mute: 'B9B4BF', panel: '2B2830' };
const F = { title: 'League Spartan', body: 'Poppins' };
const PIE = ['FF6F13', 'FF8F3F', 'FFAE6B', 'FFCB98', 'FFE3C8', 'C9C5CE', '9C97A3', '6F6A77', '4A4650'];
const W = 20, H = 11.25;

const nf = (n) => Number(n).toLocaleString('en-US');
const asset = (n) => path.join(ASSETS, n);

/* ---------- image prep (server side) ---------- */
async function prepImage(dataUrl) {
  const m = /^data:image\/[\w+.-]+;base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  const img = sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#201D22' }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
  const out = await img.jpeg({ quality: 84 }).toBuffer({ resolveWithObject: true });
  return { data: 'image/jpeg;base64,' + out.data.toString('base64'), w: out.info.width, h: out.info.height };
}
/** Place image inside slot box preserving aspect ratio (contain, top-left → centred). */
function contain(img, x, y, w, h) {
  const r = Math.min(w / img.w, h / img.h);
  const iw = img.w * r, ih = img.h * r;
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

/* ---------- text helpers ---------- */
function runs(text, base, boldFont) {
  return parseBold(text).map((p) => ({ text: p.text, options: Object.assign({}, base, p.bold ? { bold: true } : {}) }));
}
/** paragraphs → pptxgenjs text array. bullets: bool. */
function paragraphs(list, base, { bullets = false, gap = 0, align = 'left', lineMult } = {}) {
  const out = [];
  list.forEach((t, i) => {
    const last = i === list.length - 1;
    const rs = runs(t, base);
    rs.forEach((r, j) => {
      if (j === 0) {
        Object.assign(r.options, { align, paraSpaceAfter: last ? 0 : gap });
        if (bullets) r.options.bullet = { indent: 22 };
        if (lineMult) r.options.lineSpacingMultiple = lineMult;
      }
      if (j === rs.length - 1 && !last) r.options.breakLine = true;
    });
    out.push(...rs);
  });
  return out;
}
const tbox = (slide, text, o) => slide.addText(text, Object.assign({ isTextBox: true, margin: 0, fontFace: F.body, color: C.white, valign: 'top' }, o));

function addTitle(slide, text, o = {}) {
  tbox(slide, text, Object.assign({ x: 1, y: 0.54, w: 18, h: 1.14, fontFace: F.title, fontSize: 67, color: C.orange, align: 'center', valign: 'middle', charSpacing: 2, fit: 'shrink' }, o));
}

/* ---------- main ---------- */
async function buildDeck(report) {
  const R = report;
  const pres = new pptxgen();
  pres.defineLayout({ name: 'WIDE20', width: W, height: H });
  pres.layout = 'WIDE20';
  pres.title = `${R.meta.title || 'WEEKLY REPORT'}${R.meta.periodLabel ? ' – ' + R.meta.periodLabel : ''}`;
  pres.author = R.meta.brand || '';
  pres.theme = { headFontFace: F.title, bodyFontFace: F.body };

  pres.defineSlideMaster({
    title: 'CONTENT', background: { color: C.bg },
    objects: [{ image: { x: 18.88, y: 10.13, w: 1.09, h: 1.09, path: asset('logo.png'), altText: 'Logo' } }],
  });
  pres.defineSlideMaster({ title: 'PLAIN', background: { color: C.bg } });

  const content = (title, t) => { const s = pres.addSlide({ masterName: 'CONTENT' }); if (title) addTitle(s, title, t); return s; };
  const notes = (s, txt) => s.addNotes(txt);

  /* 1 — Cover */
  {
    const s = pres.addSlide({ masterName: 'PLAIN' });
    s.addImage({ path: asset('cover.png'), x: 0, y: 0, w: W, h: H, altText: 'Cover' });
    if (R.meta.coverLogo) {
      const li = await prepImage(R.meta.coverLogo);
      if (li) { s.addShape(pres.ShapeType.rect, { x: 7.7, y: 7.45, w: 4.9, h: 2.2, rotate: -3, fill: { color: 'F8F7F6' }, line: { type: 'none' }, objectName: 'Logo tape' }); const b = contain(li, 8.3, 7.7, 3.7, 1.7); s.addImage({ data: li.data, x: b.x, y: b.y, w: b.w, h: b.h, altText: 'Brand logo' }); }
    } else if (R.meta.useDefaultCoverLogo !== false) {
      s.addShape(pres.ShapeType.rect, { x: 7.7, y: 7.45, w: 4.9, h: 2.2, rotate: -3, fill: { color: 'F8F7F6' }, line: { type: 'none' }, objectName: 'Logo tape' });
      s.addImage({ path: asset('cover-client-logo.png'), x: 8.85, y: 7.7, w: 2.6, h: 1.82, rotate: -3, altText: 'Brand logo' });
    }
    if (R.meta.showCoverTitle !== false) {
      tbox(s, [
        { text: R.meta.title || 'WEEKLY REPORT', options: { fontFace: F.title, fontSize: 30, color: C.bg, charSpacing: 6, breakLine: true } },
        ...(R.meta.periodLabel ? [{ text: R.meta.periodLabel, options: { fontFace: F.body, fontSize: 14, color: 'B5470D', bold: true } }] : []),
      ], { x: 1, y: 9.75, w: 18, h: 1.2, align: 'center', valign: 'middle' });
    }
  }

  /* 2 — Overview */
  {
    const s = content('REPORT OVERVIEW', { y: 1.25, h: 1.46, fontSize: 85 });
    if (R.meta.periodLabel) tbox(s, R.meta.periodLabel, { x: 3.54, y: 2.73, w: 12.47, h: 0.45, fontSize: 24, color: C.kpi, align: 'center', valign: 'middle' });
    const kp = [['pm', 'Total Private Messages'], ['pc', 'Total Public Comments'], ['sp', 'Total Seeded Posts'], ['sr', 'Total Seeded Replies']];
    kp.forEach(([k, label], i) => {
      const x = [2.5, 6.33, 10.33, 14.33][i];
      s.addShape(pres.ShapeType.rect, { x, y: 3.62, w: 3.2, h: 1.59, fill: { color: C.kpi }, line: { type: 'none' }, objectName: 'KPI ' + label });
      tbox(s, nf(R.totals[k]), { x, y: 3.67, w: 3.2, h: 1.13, fontFace: F.title, fontSize: 57, align: 'center', valign: 'middle', charSpacing: 2 });
      tbox(s, label, { x, y: 4.77, w: 3.2, h: 0.3, fontSize: 14, bold: true, align: 'center', valign: 'middle' });
    });
    const ins = R.overview.insights.filter(Boolean);
    const bw = 17.0 - 0.45;
    const pt = fitPt(ins, bw, 4.0, 19, 13, { gap: 6, indent: 0.3 });
    tbox(s, [{ text: 'KEY INSIGHTS', options: { bold: true, fontSize: 23, breakLine: true, paraSpaceAfter: 6 } }, ...paragraphs(ins, { fontSize: pt }, { bullets: true, gap: 6 })], { x: 1.26, y: 5.65, w: 17.4, h: 4.45 });
    notes(s, 'Touchpoint totals are the sum of mapped counts per channel. Customer-initiated = private messages + public comments; proactive = seeded posts + seeded replies.');
  }

  /* 3 — Customers overview concerns */
  {
    const s = content('CUSTOMERS OVERVIEW CONCERNS', { x: 1.62, y: 1.15, w: 16.77, h: 0.96, fontSize: 57 });
    tbox(s, 'This comparison highlights the most prominent and consistent concerns per channel during the monitoring period.', { x: 1.85, y: 2.15, w: 16.33, h: 0.8, fontSize: 20, align: 'center' });
    const cols = [2.86, 3.94, 1.61, 8.36];
    const head = ['CHANNEL', 'CONCERN', 'METRIC', 'OBSERVATION'];
    const rowsData = R.concerns.map((c) => [c.channel, c.concern, c.metric, stripMd(c.observation)]);
    s.addTable(buildTable(head, rowsData, cols, [0.8, 1.07, 1.19, 1.12, 1.12], ['text', 'text', 'num', 'text'], { headSize: 16, bodySize: [17, 17, 24, 15], pad: 0.14 }), { x: 1.85, y: 3.57, w: 16.77, colW: cols, rowH: [0.8, 1.07, 1.19, 1.12, 1.12], border: { type: 'solid', pt: 3, color: C.white }, margin: 0.14 });
  }

  /* 4/6/8/10 + charts */
  const chSpec = {
    pm: { title: 'PRIVATE MESSAGE ACTIVITY', head: ['INQUIRY THEME', 'INTERACTION HANDLED', 'ACTUAL MESSAGE', 'HOW WE RESPONDED'], cols: [2.97, 2.26, 4.59, 6.68], x: 1.94, kinds: ['theme', 'num', 'quote', 'quote'], get: (r) => [r.theme, nf(r.count), r.message, r.response] },
    pc: { title: 'PUBLIC COMMENTS ACTIVITY', head: ['INQUIRY THEME', 'RESPONSES SENT', 'ACTUAL MESSAGE', 'HOW WE RESPONDED'], cols: [3.66, 2.13, 3.79, 7.6], x: 1.41, kinds: ['theme', 'num', 'quote', 'quote'], get: (r) => [r.theme, nf(r.count), r.message, r.response] },
    sp: { title: 'SEEDED POST ACTIVITY', head: ['INQUIRY THEME', 'POST COUNT', 'ACTUAL MESSAGE'], cols: [4.25, 2.9, 7.26], x: 2.87, kinds: ['theme', 'num', 'quote'], get: (r) => [r.theme, nf(r.count), r.message] },
    sr: { title: 'SEEDED REPLIES ACTIVITY', head: ['INQUIRY THEME', 'REPLY COUNT', 'ACTUAL POST', 'SEEDED REPLY'], cols: [2.97, 1.91, 5.5, 6.38], x: 1.63, kinds: ['theme', 'num', 'quote', 'quote'], get: (r) => [r.theme, nf(r.count), r.message, r.response] },
  };
  for (const k of ['pm', 'pc', 'sp', 'sr']) {
    const ch = R.channels[k], sp = chSpec[k];
    const tw = sp.cols.reduce((a, b) => a + b, 0);
    /* detailed table */
    {
      const s = content(sp.title);
      const introPt = 19;
      const introH = Math.max(0.78, needHeight([ch.intro], introPt, tw - 0.4, { lh: 1.35 }));
      tbox(s, ch.intro, { x: sp.x, y: 1.55, w: tw, h: introH, fontSize: introPt, align: 'center', lineSpacingMultiple: 0.9 });
      const ty = 1.55 + introH + 0.2;
      const avail = 10.7 - ty;
      const n = Math.max(1, ch.rows.length);
      const headH = 1.0;
      const rowH = Math.min(1.7, (avail - headH) / n);
      const data = ch.rows.map(sp.get);
      const rowHs = [headH].concat(ch.rows.map(() => rowH));
      s.addTable(buildTable(sp.head, data, sp.cols, rowHs, sp.kinds, { headSize: 14, pad: 0.12, quoteMax: 13, quoteMin: 8.5 }), { x: sp.x, y: ty, w: tw, colW: sp.cols, rowH: rowHs, border: { type: 'solid', pt: 3, color: C.white }, margin: 0.12 });
      if (!ch.rows.length) tbox(s, 'No data for this channel in the reporting period.', { x: sp.x, y: ty + 1.5, w: tw, h: 1, fontSize: 20, align: 'center', color: C.mute });
      const flagged = ch.rows.filter((r) => r.flags && r.flags.length);
      if (flagged.length) notes(s, 'Check: ' + flagged.map((r) => `${r.theme} (${r.flags.join(', ')})`).join('; '));
    }
    /* visual analysis */
    {
      const s = content(sp.title);
      const total = ch.pie.reduce((a, b) => a + b.value, 0) || 1;
      if (ch.pie.length) {
        s.addChart(pres.ChartType.pie, [{ name: ch.label, labels: ch.pie.map((p) => p.label), values: ch.pie.map((p) => p.value) }], {
          x: 0.5, y: 2.5, w: 5.9, h: 6.4, chartColors: PIE.slice(0, ch.pie.length),
          showLegend: false, showLabel: false, showPercent: false, showValue: false, showTitle: false,
          dataBorder: { pt: 1.5, color: C.bg }, firstSliceAng: 0, altText: `${ch.label} theme distribution`,
        });
        const lh = Math.min(0.72, 6.6 / ch.pie.length);
        ch.pie.forEach((p, i) => {
          const y = 2.55 + i * lh;
          s.addShape(pres.ShapeType.rect, { x: 6.55, y: y + 0.08, w: 0.26, h: 0.26, fill: { color: PIE[i] }, line: { type: 'none' }, objectName: 'Legend swatch ' + (i + 1) });
          const label = p.label.length > 70 ? p.label.slice(0, 68) + '…' : p.label;
          tbox(s, [
            { text: label, options: { fontSize: 13, bold: true, breakLine: true } },
            { text: `${nf(p.value)}  ·  ${(Math.round(p.value / total * 1000) / 10).toFixed(1).replace(/\.0$/, '')}%`, options: { fontSize: 12, color: C.mute } },
          ], { x: 6.95, y, w: 3.6, h: lh });
        });
      } else tbox(s, 'No data', { x: 1, y: 4, w: 9, h: 1, fontSize: 24, align: 'center', color: C.mute });
      tbox(s, 'KEY INSIGHTS', { x: 11.2, y: 2.55, w: 7.8, h: 0.6, fontFace: F.title, fontSize: 31, color: C.orange, valign: 'middle', charSpacing: 1 });
      const ins = ch.insights.filter(Boolean);
      const pt = fitPt(ins, 7.8 - 0.35, 6.6, 20, 13, { gap: 8, indent: 0.3 });
      tbox(s, paragraphs(ins, { fontSize: pt }, { bullets: true, gap: 8 }), { x: 11.2, y: 3.3, w: 7.8, h: 6.7 });
      notes(s, `Pie shows the share of each theme within ${ch.label} (denominator = ${ch.total} ${ch.label.toLowerCase()}). Slices beyond the top ${ch.pie.length > 8 ? 8 : ch.pie.length} are grouped as "Others".`);
    }
  }

  /* 12 — Key trends */
  {
    const s = content('KEY TRENDS', { y: 1.09 });
    const tr = R.trends.filter(Boolean);
    const pt = fitPt(tr, 17.75 - 0.4, 6.7, 23, 14, { gap: 22, indent: 0.3 });
    tbox(s, paragraphs(tr, { fontSize: pt }, { bullets: true, gap: 22 }), { x: 1.23, y: 2.6, w: 17.75, h: 6.9 });
  }

  /* 13 — Notable concerns (set 1) */
  {
    const s = content('NOTABLE CONCERNS', { x: 0.96 });
    tbox(s, R.notable1.intro, { x: 1.8, y: 1.62, w: 16.77, h: 0.83, fontSize: 22, align: 'center', lineSpacingMultiple: 0.9 });
    const it = R.notable1.items;
    const defs = [
      { h: [3.3, 2.72, 7.0, 1.18], t: [3.35, 3.88, 6.72, 1.18], slots: [[0.48, 2.85, 2.74, 6.01], [3.35, 5.05, 3.65, 3.8], [0.48, 9.0, 6.51, 1.3]] },
      { h: [7.48, 4.88, 5.9, 0.58], t: [7.48, 5.46, 5.87, 0.59], slots: [[7.48, 6.12, 5.87, 2.47], [7.48, 8.75, 5.87, 1.5]] },
      { h: [13.87, 4.04, 5.6, 0.58], t: [13.87, 9.41, 5.61, 0.89], slots: [[13.87, 4.71, 5.69, 4.6]] },
    ];
    await concerns(pres, s, it, defs);
  }

  /* 14 — Notable concerns (set 2) */
  {
    const s = content('NOTABLE CONCERNS', { x: 0.96 });
    tbox(s, R.notable2.intro, { x: 1.86, y: 1.62, w: 16.77, h: 0.83, fontSize: 22, align: 'center', lineSpacingMultiple: 0.9 });
    const it = R.notable2.items;
    const defs = [
      { h: [1.38, 3.32, 9.79, 0.58], t: [5.47, 3.95, 6.0, 1.47], slots: [[1.38, 3.94, 3.93, 6.45], [5.47, 5.52, 4.32, 4.88]] },
      { h: [11.56, 3.32, 7.0, 1.18], t: [15.27, 8.49, 3.31, 2.05], slots: [[11.56, 4.6, 3.55, 5.9]] },
    ];
    await concerns(pres, s, it, defs);
  }

  /* 15 — Opportunities */
  {
    const s = content('OPPORTUNITIES FOR IMPROVEMENTS', { x: 0.73, y: 1.22, w: 17.8, h: 0.89, fontSize: 52 });
    const pos = [[0.63, 2.66], [0.63, 5.13], [0.63, 7.6], [9.69, 2.66], [9.69, 5.13], [9.69, 7.6]];
    // reference order: left column 01-03, right column 04-06
    R.opportunities.slice(0, 6).forEach((o, i) => {
      const [x, y] = pos[i];
      const tw = i < 3 ? 7.0 : 7.9;
      s.addShape(pres.ShapeType.line, { x: x + 1.6, y: y + 0.05, w: 0, h: 1.95, line: { color: C.orange, width: 3 }, objectName: 'Rule ' + (i + 1) });
      tbox(s, String(i + 1).padStart(2, '0'), { x, y: y + 0.32, w: 1.5, h: 1.22, fontFace: F.title, fontSize: 50, color: C.orange, align: 'left', valign: 'middle' });
      const tpt = fitPt([o.title], tw, 0.55, 28, 18, { bold: true, lh: 1.35 });
      tbox(s, o.title, { x: x + 1.85, y: y - 0.05, w: tw, h: 0.62, fontSize: tpt, bold: true, valign: 'middle' });
      const dpt = fitPt([stripMd(o.text)], tw, 1.4, 17, 11.5, { lh: 1.4 });
      tbox(s, runs(o.text, { fontSize: dpt }), { x: x + 1.85, y: y + 0.65, w: tw, h: 1.4, lineSpacingMultiple: 0.95 });
    });
  }

  /* 16 — Summary */
  {
    const s = content('OVERALL SUMMARY', { y: 1.58 });
    const pt = fitPt([R.summary], 17.75 - 0.2, 6.2, 24, 15, { lh: 1.75 });
    tbox(s, runs(R.summary, { fontSize: pt }), { x: 1.12, y: 3.13, w: 17.75, h: 6.4, align: 'center', lineSpacingMultiple: 1.45, valign: 'top' });
  }

  /* 17 — Thank you */
  {
    const s = content('');
    tbox(s, 'THANK YOU!', { x: 1.69, y: 4.38, w: 16.62, h: 2.42, fontFace: F.title, fontSize: 142, color: C.orange, align: 'center', valign: 'middle', charSpacing: 3, fit: 'shrink' });
  }

  return pres;
}

/* concern layouts (13 & 14) */
async function concerns(pres, slide, items, defs) {
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i], it = items[i];
    if (!it) continue;
    const hp = fitPt([it.heading], d.h[2], d.h[3], 31, 20, { lh: 1.2 });
    tbox(slide, it.heading, { x: d.h[0], y: d.h[1], w: d.h[2], h: d.h[3], fontFace: F.title, fontSize: hp, color: C.orange, valign: 'top' });
    const tp = fitPt([stripMd(it.text)], d.t[2], d.t[3], 15, 10.5, { lh: 1.4 });
    tbox(slide, runs(it.text, { fontSize: tp }), { x: d.t[0], y: d.t[1], w: d.t[2], h: d.t[3], lineSpacingMultiple: 0.95 });
    const imgs = (it.images || []).slice(0, d.slots.length);
    for (let j = 0; j < imgs.length; j++) {
      const im = await prepImage(imgs[j]);
      if (!im) continue;
      const [x, y, w, h] = d.slots[j];
      const b = contain(im, x, y, w, h);
      slide.addImage({ data: im.data, x: b.x, y: b.y, w: b.w, h: b.h, altText: `Evidence for: ${it.heading}` });
    }
  }
}

/* Table builder used by all table slides */
function buildTable(head, rows, cols, rowHs, kinds, o) {
  const border = { type: 'solid', pt: 3, color: C.white };
  const headRow = head.map((h) => ({ text: h, options: { fill: { color: C.head }, color: C.white, bold: true, fontFace: F.body, fontSize: o.headSize || 14, align: 'center', valign: 'middle', border } }));
  const body = rows.map((r, ri) => {
    const rowH = rowHs[ri + 1] || rowHs[rowHs.length - 1];
    // choose one font size per row for quote cells so both quote columns match
    const quoteCols = kinds.map((k, i) => (k === 'quote' ? i : -1)).filter((i) => i >= 0);
    let qpt = o.quoteMax || 13;
    if (quoteCols.length) {
      const fits = quoteCols.map((i) => fitPt([r[i] || ' '], cols[i] - 2 * (o.pad || 0.12) - 0.05, rowH - 0.1, o.quoteMax || 13, o.quoteMin || 8.5, { lh: 1.45 }));
      qpt = Math.min(...fits);
    }
    return r.map((cell, i) => {
      const kind = kinds[i];
      const base = { fill: { color: C.bg }, color: C.white, fontFace: F.body, valign: 'middle', align: 'center', border };
      if (kind === 'num') return { text: String(cell), options: Object.assign(base, { fontSize: (o.bodySize && o.bodySize[i]) || 24, bold: false }) };
      if (kind === 'theme') {
        const p = fitPt([cell], cols[i] - 2 * (o.pad || 0.12), rowH - 0.1, 17, 10.5, { bold: true, lh: 1.4 });
        return { text: String(cell), options: Object.assign(base, { fontSize: p, bold: true }) };
      }
      if (kind === 'quote') return { text: cell && String(cell).trim() ? String(cell) : '—', options: Object.assign(base, { fontSize: qpt, color: cell ? C.white : C.mute }) };
      const p = fitPt([String(cell)], cols[i] - 2 * (o.pad || 0.12), rowH - 0.1, (o.bodySize && o.bodySize[i]) || 16, 10.5, { lh: 1.4 });
      return { text: String(cell), options: Object.assign(base, { fontSize: p }) };
    });
  });
  return [headRow, ...body];
}

/* pptxgenjs emits a stray second <a:pPr> inside multi-run paragraphs (invalid OOXML, drops bullets). Remove it. */
async function fixXml(buf) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const n of names) {
    const xml = await zip.file(n).async('string');
    const fixed = xml.replace(/(<\/a:r>)<a:pPr\b[^>]*?(?:\/>|>(?:(?!<\/a:pPr>)[\s\S])*<\/a:pPr>)/g, '$1');
    if (fixed !== xml) zip.file(n, fixed);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function renderPptx(report) {
  const pres = await buildDeck(report);
  const raw = await pres.write({ outputType: 'nodebuffer' });
  return fixXml(raw);
}

module.exports = { buildDeck, renderPptx };
