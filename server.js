'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { renderPptx } = require('./lib/deck');
const { pptxToPdf } = require('./lib/pdf');
const { normalizeReport } = require('./lib/validate');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* Optional shared password (set APP_PASSWORD in Railway). Username can be anything. */
const PASSWORD = process.env.APP_PASSWORD || '';
function safeEq(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest(), hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
app.get('/healthz', (_req, res) => res.type('text').send('ok'));
if (PASSWORD) {
  app.use((req, res, next) => {
    const h = req.headers.authorization || '';
    if (h.startsWith('Basic ')) {
      const pass = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
      if (safeEq(pass, PASSWORD)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Report Generator"').status(401).send('Authentication required');
  });
}

app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', cacheControl: false }));
app.use('/sample-data', express.static(path.join(__dirname, 'sample-data')));

/* Stateless: the report JSON is rendered in memory and never written to disk (PDF uses a temp dir deleted after conversion). */
app.post('/api/generate', express.json({ limit: '60mb' }), async (req, res) => {
  try {
    const format = req.query.format === 'pdf' ? 'pdf' : 'pptx';
    const report = normalizeReport(req.body && req.body.report);
    const pptx = await renderPptx(report);
    const base = ('WEEKLY_REPORT_' + (report.meta.periodLabel || 'report')).replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
    if (format === 'pptx') {
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Content-Disposition': `attachment; filename="${base}.pptx"` });
      return res.send(pptx);
    }
    const pdf = await pptxToPdf(pptx);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${base}.pdf"` });
    res.send(pdf);
  } catch (e) {
    console.error('generate failed:', e.message);
    res.status(500).json({ error: 'Could not generate the report: ' + e.message });
  }
});

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, '0.0.0.0', () => console.log('Report generator listening on :' + port + (PASSWORD ? ' (password protected)' : ' (NO PASSWORD SET)')));
module.exports = app;
