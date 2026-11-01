'use strict';
/* End-to-end test: sample CSV → analyze → PPTX (→ PDF if soffice available). Usage: node scripts/test.js [outDir] */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const A = require('../public/analyze.js');
const { renderPptx } = require('../lib/deck');
const { pptxToPdf } = require('../lib/pdf');
const { normalizeReport } = require('../lib/validate');

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...rest] = rows;
  return { headers: h, rows: rest.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] || '']))) };
}

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'test-output'));
  fs.mkdirSync(out, { recursive: true });
  const { headers, rows } = parseCsv(fs.readFileSync(path.join(__dirname, '..', 'sample-data', 'sample_interactions.csv'), 'utf8'));
  const map = A.guessMapping(headers);
  console.log('mapping guess', map);
  assert.strictEqual(map.channel, 'Channel'); assert.strictEqual(map.theme, 'Category'); assert.strictEqual(map.date, 'Date');
  const values = [...new Set(rows.map((r) => r[map.channel]))];
  const channelValues = A.guessChannelValues(values);
  console.log('channel values', channelValues);
  assert(channelValues.pm.length && channelValues.pc.length && channelValues.sp.length && channelValues.sr.length);

  const report = A.analyze(rows, map, { brand: 'Acme Digital Bank', channelValues, start: '2026-09-24', end: '2026-10-07' });
  // metric sanity
  const sum = report.totals.pm + report.totals.pc + report.totals.sp + report.totals.sr;
  assert.strictEqual(report.totals.total, sum);
  const direct = rows.filter((r) => r.Date >= '2026-09-24' && r.Date <= '2026-10-07').length;
  assert.strictEqual(report.totals.total, direct, 'total touchpoints must equal rows in period');
  for (const k of ['pm', 'pc', 'sp', 'sr']) {
    const ch = report.channels[k];
    assert.strictEqual(ch.pie.reduce((a, b) => a + b.value, 0), ch.total, k + ' pie sums to channel total');
    for (let i = 1; i < ch.rows.length; i++) assert(ch.rows[i - 1].count >= ch.rows[i].count, k + ' sorted desc');
  }
  assert.strictEqual(report.channels.sr.rows.length <= 4, true);
  console.log('totals', report.totals, 'prev', report.prevTotal);
  console.log('placeholders left', A.countPlaceholders(report), 'warnings', report.warnings);

  // fill the human-written parts the way a user would
  report.notable1.items.forEach((it, i) => { it.text = `Fictional example concern ${i + 1}: customers raised this repeatedly during the period.`; });
  report.notable2.items.forEach((it, i) => { it.text = `Fictional example issue ${i + 1}: observed across the community pages.`; });
  report.opportunities.forEach((o) => { o.text = 'A short, evidence-based suggestion that may help set clearer expectations for customers.'; });
  report.overview.insights = report.overview.insights.map((s) => s.replace(/\[\[[^\]]*\]\]/g, 'Customers locked out near due dates raised repayment concerns.'));
  for (const k of Object.keys(report.channels)) report.channels[k].insights = report.channels[k].insights.map((s) => s.replace(/\[\[[^\]]*\]\]/g, 'Share timely status updates.'));
  report.trends = report.trends.map((s) => s.replace(/\[\[[^\]]*\]\]/g, 'Customers often commented publicly before seeking support.'));
  report.concerns.forEach((c) => { c.observation = c.observation.replace(/\[\[[^\]]*\]\]/g, 'Supports the main finding.'); });
  report.summary = A.draftSummary(report).replace(/\[\[[^\]]*\]\]/g, 'Access and payment uncertainty can affect customer trust.');
  const shot = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'sample-data', 'screenshots', `chat${n}.png`)).toString('base64');
  report.notable1.items[0].images = [shot(1), shot(2), shot(3)];
  report.notable1.items[1].images = [shot(2), shot(3)];
  report.notable1.items[2].images = [shot(4)];
  report.notable2.items[0].images = [shot(6), shot(4)];
  report.notable2.items[1].images = [shot(5)];
  assert.strictEqual(A.countPlaceholders(report), 0);

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const norm = normalizeReport(report);
  const pptx = await renderPptx(norm);
  fs.writeFileSync(path.join(out, 'WEEKLY_REPORT.pptx'), pptx);
  console.log('PPTX bytes', pptx.length);
  try {
    const pdf = await pptxToPdf(pptx);
    fs.writeFileSync(path.join(out, 'WEEKLY_REPORT.pdf'), pdf);
    console.log('PDF bytes', pdf.length);
  } catch (e) { console.log('PDF skipped:', e.message); }
  console.log('OK →', out);
})().catch((e) => { console.error(e); process.exit(1); });
