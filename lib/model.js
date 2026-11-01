// Turns normalized records into an editable draft report.
// Everything numeric is calculated directly from the data; narrative text is a
// DRAFT that the user reviews/edits before export. Nothing is invented:
// trends are only produced when previous-period rows exist.
const CHANNELS = [
  { key: 'pm', name: 'Private Messages', kpi: 'Total Private Messages', short: 'private messages' },
  { key: 'pc', name: 'Public Comments', kpi: 'Total Public Comments', short: 'public comments' },
  { key: 'sp', name: 'Seeded Posts', kpi: 'Total Seeded Post', short: 'seeded posts' },
  { key: 'sr', name: 'Seeded Replies', kpi: 'Total Seeded Replies', short: 'seeded replies' },
];

const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
const fmtDateY = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function periodLabel(start, end) {
  if (!start || !end) return '';
  const days = Math.round((new Date(end) - new Date(start)) / 864e5) + 1;
  let dur = `${days} day${days === 1 ? '' : 's'}`;
  if (days % 7 === 0) { const w = days / 7; dur = `${w} week${w === 1 ? '' : 's'}`; }
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? fmtDate(start) : fmtDateY(start)} - ${fmtDateY(end)} (${dur})`;
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const clean = (s) => (s == null ? '' : String(s).trim());

function aggregate(records, key) {
  const cur = new Map(); const prev = new Map();
  for (const r of records) {
    if (r.channel !== key) continue;
    const m = r.period === 'previous' ? prev : cur;
    const t = clean(r.theme) || 'Uncategorized';
    const o = m.get(t) || { theme: t, count: 0, message: '', response: '' };
    o.count += r.count;
    if (!o.message && clean(r.message)) o.message = clean(r.message);
    if (!o.response && clean(r.response)) o.response = clean(r.response);
    m.set(t, o);
  }
  const themes = [...cur.values()].sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
  const total = themes.reduce((s, t) => s + t.count, 0);
  const prevTotal = [...prev.values()].reduce((s, t) => s + t.count, 0);
  themes.forEach((t) => { t.pct = pct(t.count, total); t.prev = prev.has(t.theme) ? prev.get(t.theme).count : null; });
  return { themes, total, prevTotal, hasPrev: prev.size > 0, prev };
}

function chartData(themes, maxSlices = 8) {
  const top = themes.slice(0, maxSlices).map((t) => ({ label: t.theme, value: t.count }));
  const rest = themes.slice(maxSlices).reduce((s, t) => s + t.count, 0);
  if (rest > 0) top.push({ label: 'Others', value: rest });
  return top;
}

function channelInsights(ch, a) {
  const out = [];
  const [t1, t2] = a.themes;
  if (!t1) return ['No data available for this channel in the selected period.'];
  out.push(`**${t1.theme}** is the leading theme with ${t1.count} of ${a.total} ${ch.short} (${t1.pct}%).`);
  if (t2) out.push(`**${t2.theme}** follows with ${t2.count} (${t2.pct}%); together the top two account for ${pct(t1.count + t2.count, a.total)}% of the channel.`);
  if (a.total < 20) out.push(`Small sample (${a.total} ${ch.short}) — treat these proportions as indicative only.`);
  if (a.hasPrev && t1.prev != null) {
    const d = t1.count - t1.prev;
    out.push(`Compared with the previous period, **${t1.theme}** ${d === 0 ? 'was unchanged' : (d > 0 ? 'rose' : 'fell') + ` by ${Math.abs(d)}`} (${t1.prev} → ${t1.count}).`);
  }
  if (ch.key === 'sp') out.push('Post volume reflects publishing activity and is not, by itself, evidence of engagement.');
  return out;
}

function buildDraft({ meta = {}, records = [], topN = 5 }) {
  const A = {}; CHANNELS.forEach((c) => (A[c.key] = aggregate(records, c.key)));
  const totals = {}; CHANNELS.forEach((c) => (totals[c.key] = A[c.key].total));
  const all = CHANNELS.reduce((s, c) => s + totals[c.key], 0);
  const initiated = totals.pm + totals.pc, proactive = totals.sp + totals.sr;
  const label = meta.periodLabel || periodLabel(meta.start, meta.end);

  const lead = CHANNELS.map((c) => ({ c, t: A[c.key].themes[0], a: A[c.key] }));
  const overviewInsights = [
    `**${all} total touchpoints** were handled across all channels. Of these, ${initiated} were customer-initiated and ${proactive} were proactive.`,
  ];
  const topPM = A.pm.themes[0], topPC = A.pc.themes[0];
  if (topPM) overviewInsights.push(`**The leading private-message theme is ${topPM.theme}**, with ${topPM.count} of ${A.pm.total} messages (${topPM.pct}%).`);
  if (topPC) overviewInsights.push(`**The leading public-comment theme is ${topPC.theme}**, with ${topPC.count} of ${A.pc.total} comments (${topPC.pct}%).`);
  if (A.pm.hasPrev || A.pc.hasPrev) {
    const pt = A.pm.prevTotal + A.pc.prevTotal;
    if (pt) overviewInsights.push(`**Customer-initiated volume** changed from ${pt} to ${initiated} versus the previous period.`);
  }

  const overviewTable = lead.map(({ c, t, a }) => ({
    channel: c.name, concern: t ? t.theme : '—', metric: t ? String(t.count) : '—',
    observation: t ? `${t.pct}% of ${c.short} (${t.count} of ${a.total}).` : 'No data.',
  }));

  const channels = {};
  const intro = {
    pm: `Customer concerns received through private messages, with a total of ${totals.pm} messages answered. The following are the top ${topN} ranked concerns:`,
    pc: `Customer concerns raised through public comments, with a total of ${totals.pc} comments answered. The following are the top ${topN} ranked concerns:`,
    sp: `A total of ${totals.sp} seeded posts were published during the reporting period. The following are the top ${topN} ranked themes:`,
    sr: `A total of ${totals.sr} seeded replies were recorded during the reporting period. The following are the top ${topN} ranked themes:`,
  };
  for (const c of CHANNELS) {
    const a = A[c.key];
    channels[c.key] = {
      intro: intro[c.key],
      rows: a.themes.slice(0, topN).map((t) => ({ theme: t.theme, count: t.count, message: t.message, response: t.response })),
      chart: chartData(a.themes),
      insights: channelInsights(c, a),
      themeCount: a.themes.length,
    };
  }

  // Trends: only evidence-based; period comparisons only when previous rows exist.
  const trends = [];
  for (const { c, t } of lead) if (t) trends.push(`**${c.name}:** ${t.theme} was the leading theme (${t.count}, ${t.pct}%).`);
  for (const c of CHANNELS) {
    const a = A[c.key]; if (!a.hasPrev) continue;
    const moves = a.themes.filter((t) => t.prev != null).map((t) => ({ t, d: t.count - t.prev })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const newly = a.themes.filter((t) => t.prev == null && t.count > 0).slice(0, 1);
    if (moves[0] && moves[0].d !== 0) trends.push(`**${c.name}:** ${moves[0].t.theme} ${moves[0].d > 0 ? 'increased' : 'decreased'} by ${Math.abs(moves[0].d)} (${moves[0].t.prev} → ${moves[0].t.count}) versus the previous period.`);
    if (newly[0]) trends.push(`**${c.name}:** ${newly[0].theme} is newly present this period (${newly[0].count}).`);
  }

  const concerns = Array.from({ length: 6 }, (_, i) => ({ title: '', text: '', image: '' }));
  const ranked = CHANNELS.flatMap((c) => A[c.key].themes.slice(0, 2).map((t) => ({ c, t }))).sort((x, y) => y.t.pct - x.t.pct).slice(0, 6);
  ranked.forEach(({ c, t }, i) => { concerns[i].title = t.theme; concerns[i].text = `${t.count} of ${A[c.key].total} ${c.short} (${t.pct}%). Add context here.`; });

  const opportunities = [
    ['MONTH-END LOAN ADVISORY', 'A timely reminder about deductions and payment status may help set clearer customer expectations.'],
    ['FASTER ACCESS RESOLUTION', 'Clearer callback timelines and approved messaging may help address immediate access concerns.'],
    ['DAILY APP STATUS UPDATE', 'Regular status updates may help keep customers informed about known issues.'],
    ['CLEARER TOP-UP AND CANCELLATION TERMS', 'Clearer presentation of terms before payment may help customers understand the conditions.'],
    ['GSAVE AND OTP UPDATES', 'Further coordination on delivery concerns may help provide more consistent updates.'],
    ['COMMUNITY ENGAGEMENT MONITORING', 'Continued monitoring of community discussions may help identify relevant customer concerns.'],
  ].map(([title, text]) => ({ title, text }));

  const top = lead.filter((l) => l.t).map((l) => `${l.t.theme} (${l.c.short})`).slice(0, 2).join(' and ');
  const summary = `The monitoring period${label ? ` (${label.replace(/ \(.*\)$/, '')})` : ''} recorded **${all} touchpoints**` +
    `, of which ${initiated} were customer-initiated and ${proactive} proactive.` +
    (top ? ` The primary concerns were ${top}.` : '') +
    ' Add the operational and customer-experience implications and the priority actions for the next reporting period here.';

  return {
    meta: { title: meta.title || 'WEEKLY REPORT', org: meta.org || '', start: meta.start || '', end: meta.end || '', periodLabel: label },
    totals, kpiLabels: Object.fromEntries(CHANNELS.map((c) => [c.key, c.kpi])),
    overviewInsights, overviewIntro: 'This comparison highlights the most prominent and consistent concerns per channel during the monitoring period.',
    overviewTable, channels, trends, concerns,
    concernsIntro: 'The following concerns were noted during the reporting period:',
    opportunities, summary,
    warnings: CHANNELS.filter((c) => !A[c.key].total).map((c) => `No rows found for ${c.name}.`),
  };
}

module.exports = { buildDraft, periodLabel, CHANNELS };
