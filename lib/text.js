'use strict';
/* Text helpers: **bold** markup → pptxgenjs runs, and a word-wrap based fit estimator. */

const stripMd = (s) => String(s == null ? '' : s).replace(/\*\*/g, '');

/** "a **b** c" → [{text:'a ',bold:false},{text:'b',bold:true},{text:' c',bold:false}] */
function parseBold(s) {
  const out = [];
  const parts = String(s == null ? '' : s).split('**');
  parts.forEach((p, i) => { if (p !== '') out.push({ text: p, bold: i % 2 === 1 }); });
  return out.length ? out : [{ text: '', bold: false }];
}

/** Greedy word wrap estimate for Poppins-like widths. Returns number of lines. */
function countLines(text, pt, widthIn, bold) {
  const cw = (bold ? 0.62 : 0.585) * pt / 72; // avg glyph width in inches (conservative)
  const maxChars = Math.max(1, widthIn / cw);
  let lines = 0;
  for (const para of stripMd(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines += 1; continue; }
    let cur = 0, l = 1;
    for (const w of words) {
      const wl = w.length;
      if (cur === 0) cur = wl;
      else if (cur + 1 + wl <= maxChars) cur += 1 + wl;
      else { l++; cur = wl; }
      while (cur > maxChars) { l++; cur -= maxChars; }
    }
    lines += l;
  }
  return lines;
}

/** Height (in) a set of paragraphs needs at a given pt size. */
function needHeight(paras, pt, widthIn, opts = {}) {
  const lh = (opts.lh || 1.5) * pt / 72;
  const gap = (opts.gap || 0) / 72;
  const indent = opts.indent || 0;
  let h = 0;
  paras.forEach((p, i) => {
    h += countLines(p, pt, widthIn - indent, opts.bold) * lh;
    if (i < paras.length - 1) h += gap;
  });
  return h;
}

/** Largest font size (pt) in [min,max] so paragraphs fit width×height; returns min if none fit. */
function fitPt(paras, widthIn, heightIn, maxPt, minPt, opts = {}) {
  for (let pt = maxPt; pt >= minPt; pt -= 0.5) {
    if (needHeight(paras, pt, widthIn, opts) <= heightIn) return pt;
  }
  return minPt;
}

module.exports = { stripMd, parseBold, countLines, needHeight, fitPt };
