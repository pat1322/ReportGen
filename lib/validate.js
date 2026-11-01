'use strict';
/* Defensive normalisation of the report JSON received from the browser. Never trust client input. */
const MAX_STR = 4000;

const str = (v, max = MAX_STR) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const int = (v) => { const n = Math.round(Number(v)); return isFinite(n) && n >= 0 ? n : 0; };
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const img = (v) => (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) && v.length < 14e6 ? v : '');

function normalizeReport(r) {
  r = r && typeof r === 'object' ? r : {};
  const m = r.meta || {};
  const out = {
    meta: {
      brand: str(m.brand, 120), title: str(m.title, 80) || 'WEEKLY REPORT', periodLabel: str(m.periodLabel, 120),
      useDefaultCoverLogo: m.useDefaultCoverLogo !== false, showCoverTitle: m.showCoverTitle !== false, coverLogo: img(m.coverLogo),
    },
    totals: {}, overview: { insights: arr((r.overview || {}).insights, 8).map((s) => str(s)) },
    concerns: arr(r.concerns, 4).map((c) => ({ channel: str(c.channel, 60), concern: str(c.concern, 200), metric: str(c.metric, 20), observation: str(c.observation, 500) })),
    channels: {}, trends: arr(r.trends, 6).map((s) => str(s, 600)),
    notable1: notable(r.notable1, 3), notable2: notable(r.notable2, 2),
    opportunities: arr(r.opportunities, 6).map((o) => ({ title: str((o || {}).title, 80), text: str((o || {}).text, 600) })),
    summary: str(r.summary, 3500),
  };
  for (const k of ['pm', 'pc', 'sp', 'sr']) out.totals[k] = int((r.totals || {})[k]);
  while (out.concerns.length < 4) out.concerns.push({ channel: '', concern: '', metric: '', observation: '' });
  while (out.opportunities.length < 6) out.opportunities.push({ title: '', text: '' });
  for (const k of ['pm', 'pc', 'sp', 'sr']) {
    const c = (r.channels || {})[k] || {};
    out.channels[k] = {
      key: k, label: str(c.label, 40) || k, total: int(c.total), intro: str(c.intro, 700),
      rows: arr(c.rows, 5).map((x) => ({ theme: str(x.theme, 200), count: int(x.count), message: str(x.message, 1200), response: str(x.response, 1500), flags: arr(x.flags, 4).map((f) => str(f, 40)) })),
      pie: arr(c.pie, 10).map((x) => ({ label: str(x.label, 200), value: int(x.value) })).filter((x) => x.value > 0),
      insights: arr(c.insights, 6).map((s) => str(s, 700)),
    };
  }
  return out;
}
function notable(n, count) {
  n = n || {};
  const items = arr(n.items, count).map((it) => ({ heading: str((it || {}).heading, 120), text: str((it || {}).text, 700), images: arr((it || {}).images, 3).map(img).filter(Boolean) }));
  while (items.length < count) items.push({ heading: '', text: '', images: [] });
  return { intro: str(n.intro, 400), items };
}
module.exports = { normalizeReport };
