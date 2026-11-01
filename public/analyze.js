/*
 * analyze.js — turns raw interaction rows into the report JSON used by the deck builder.
 *
 * Runs in the BROWSER (and in Node for tests). The raw spreadsheet never leaves the user's
 * machine: only the compact report JSON (top themes, selected quotes, totals, draft text)
 * is sent to the server for rendering.
 *
 * Logical fields (mapped from the user's own column names):
 *   date (optional) · channel · theme · message · response (optional) · count (optional, default 1)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Analyze = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHANNELS = ['pm', 'pc', 'sp', 'sr'];
  const CHANNEL_META = {
    pm: { label: 'Private Messages', short: 'private messages', kpi: 'Total Private Messages', unit: 'messages', topN: 5, hasResponse: true },
    pc: { label: 'Public Comments', short: 'public comments', kpi: 'Total Public Comments', unit: 'comments', topN: 5, hasResponse: true },
    sp: { label: 'Seeded Posts', short: 'seeded posts', kpi: 'Total Seeded Posts', unit: 'posts', topN: 5, hasResponse: false },
    sr: { label: 'Seeded Replies', short: 'seeded replies', kpi: 'Total Seeded Replies', unit: 'replies', topN: 4, hasResponse: true },
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const durAdj = (d) => String(d || '').replace(/^(\d+) (\w+?)s?$/, '$1-$2'); // "2 weeks" → "2-week"
  const PLACEHOLDER = (t) => '[[' + t + ']]';

  /* ---------- helpers ---------- */
  const clean = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const keyOf = (s) => clean(s).toLowerCase();
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const fmtPct = (n, d) => pct(n, d).toFixed(1).replace(/\.0$/, '') + '%';
  const num = (v) => {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    const s = clean(v).replace(/,/g, '');
    return s === '' ? NaN : Number(s);
  };
  const noun = (n, one, many) => (n === 1 ? one : many || one + 's');

  function parseDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : utc(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return null;
    }
    const s = clean(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return utc(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); // M/D/YYYY (Google Sheets US default)
    if (m) return utc(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
    const t = Date.parse(s);
    if (!isNaN(t)) { const d = new Date(t); return utc(d.getFullYear(), d.getMonth(), d.getDate()); }
    return null;
  }
  function utc(y, m, d) { return new Date(Date.UTC(y, m, d)); }
  const iso = (d) => d.toISOString().slice(0, 10);
  const DAY = 86400000;

  function periodLabel(start, end) {
    if (!start || !end) return '';
    const days = Math.round((end - start) / DAY) + 1;
    const sm = MONTHS[start.getUTCMonth()], em = MONTHS[end.getUTCMonth()];
    const sy = start.getUTCFullYear(), ey = end.getUTCFullYear();
    let range;
    if (sy === ey) range = `${sm} ${start.getUTCDate()} - ${em} ${end.getUTCDate()}, ${ey}`;
    else range = `${sm} ${start.getUTCDate()}, ${sy} - ${em} ${end.getUTCDate()}, ${ey}`;
    const dur = days % 7 === 0 ? `${days / 7} ${noun(days / 7, 'week')}` : `${days} ${noun(days, 'day')}`;
    return { range, duration: dur, days, text: `${range} (${dur})` };
  }

  /* Guess a mapping from header names so the user rarely has to touch it. */
  function guessMapping(headers) {
    const rules = {
      date: /date|day|time|created|received|posted/i,
      channel: /channel|source|platform|type|medium/i,
      theme: /theme|categor|concern|topic|inquiry|issue|tag|label/i,
      message: /message|comment|post|inquiry text|customer|content|text|body|query/i,
      response: /respon|repl|answer|agent|seeded/i,
      count: /^(count|qty|quantity|total|interactions?|volume)$/i,
    };
    const used = new Set();
    const out = {};
    for (const f of ['channel', 'theme', 'date', 'count', 'response', 'message']) {
      const h = headers.find((x) => !used.has(x) && rules[f].test(x));
      out[f] = h || '';
      if (h) used.add(h);
    }
    return out;
  }

  /* Guess which raw channel values belong to which of the 4 channels. */
  function guessChannelValues(values) {
    const rules = {
      sr: /seed\w*\s*(reply|replies)|reply.*seed/i,
      sp: /seed\w*\s*post|post.*seed/i,
      pm: /private|dm|direct|inbox|messenger|message/i,
      pc: /public|comment/i,
    };
    const out = { pm: [], pc: [], sp: [], sr: [] };
    for (const v of values) {
      for (const k of ['sr', 'sp', 'pm', 'pc']) {
        if (rules[k].test(v)) { out[k].push(v); break; }
      }
    }
    return out;
  }

  /* ---------- core analysis ---------- */
  function groupChannel(rows, ch, opts) {
    const meta = CHANNEL_META[ch];
    const groups = new Map();
    let total = 0;
    for (const r of rows) {
      total += r.count;
      const k = keyOf(r.theme) || '(uncategorized)';
      let g = groups.get(k);
      if (!g) { g = { key: k, count: 0, spellings: new Map(), rows: [] }; groups.set(k, g); }
      g.count += r.count;
      const sp = clean(r.theme) || '(Uncategorized)';
      g.spellings.set(sp, (g.spellings.get(sp) || 0) + r.count);
      g.rows.push(r);
    }
    const list = [...groups.values()].map((g) => {
      const theme = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { theme, count: g.count, rows: g.rows };
    }).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
    return { total, list };
  }

  function pickQuote(g, ch, opts, warnings) {
    const meta = CHANNEL_META[ch];
    const maxMsg = opts.maxMsg, maxResp = opts.maxResp;
    const withMsg = g.rows.filter((r) => r.message);
    const complete = withMsg.filter((r) => (!meta.hasResponse || r.response));
    const pool = complete.length ? complete : withMsg;
    const fits = pool.filter((r) => r.message.length <= maxMsg && (!r.response || r.response.length <= maxResp));
    const use = fits.length ? fits : pool;
    // most recent if dates exist, otherwise first
    const best = use.slice().sort((a, b) => (b.date ? +b.date : 0) - (a.date ? +a.date : 0))[0];
    const seen = new Set();
    const alts = use.slice().sort((a, b) => (b.date ? +b.date : 0) - (a.date ? +a.date : 0)).filter((r) => { const k = r.message + '|' + r.response; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 12).map((r) => ({ message: r.message, response: r.response }));
    const out = { message: '', response: '', flags: [], alts };
    if (!best) { out.flags.push('no message found'); warnings.push(`${meta.label}: "${g.theme}" has no message text.`); return out; }
    out.message = best.message;
    out.response = best.response || '';
    if (meta.hasResponse && !out.response) { out.flags.push('no response found'); warnings.push(`${meta.label}: "${g.theme}" has no response text.`); }
    const cut = (s, n) => {
      if (s.length <= n) return s;
      out.flags.push('shortened');
      const t = s.slice(0, n - 1); return t.slice(0, t.lastIndexOf(' ') > n * 0.6 ? t.lastIndexOf(' ') : n - 1) + '…';
    };
    out.message = cut(out.message, opts.hardMsg);
    out.response = cut(out.response, opts.hardResp);
    if (out.flags.includes('shortened')) warnings.push(`${meta.label}: "${g.theme}" quote was shortened with "…" to fit — check it.`);
    return out;
  }

  function analyze(rawRows, map, options) {
    const o = Object.assign({
      brand: '', title: 'WEEKLY REPORT', channelValues: {}, start: '', end: '', prevStart: '', prevEnd: '',
      topN: { pm: 5, pc: 5, sp: 5, sr: 4 }, maxMsg: 420, maxResp: 620, hardMsg: 700, hardResp: 900, pieSlices: 8,
    }, options || {});
    const warnings = [];
    const chanLookup = new Map();
    for (const ch of CHANNELS) for (const v of o.channelValues[ch] || []) chanLookup.set(keyOf(v), ch);

    let skippedChannel = 0, badCount = 0, noTheme = 0, noDate = 0;
    const all = [];
    for (const r of rawRows) {
      const ch = chanLookup.get(keyOf(r[map.channel]));
      if (!ch) { skippedChannel++; continue; }
      let c = 1;
      if (map.count) {
        const n = num(r[map.count]);
        if (isNaN(n) || n < 0) { badCount++; c = 1; } else c = n;
      }
      const date = map.date ? parseDate(r[map.date]) : null;
      if (map.date && !date) noDate++;
      const theme = clean(r[map.theme]);
      if (!theme) noTheme++;
      all.push({ ch, count: c, date, theme, message: clean(r[map.message]), response: map.response ? clean(r[map.response]) : '' });
    }
    if (skippedChannel) warnings.push(`${skippedChannel} row(s) were ignored because their channel value is not assigned to a report channel.`);
    if (badCount) warnings.push(`${badCount} row(s) had a missing/invalid count and were counted as 1.`);
    if (noTheme) warnings.push(`${noTheme} row(s) have no theme and appear as "(Uncategorized)".`);
    if (noDate) warnings.push(`${noDate} row(s) have an unreadable date; they are included only if no date range is set.`);

    // date range
    let start = o.start ? parseDate(o.start) : null, end = o.end ? parseDate(o.end) : null;
    const dated = all.filter((r) => r.date);
    if ((!start || !end) && dated.length) {
      start = start || new Date(Math.min(...dated.map((r) => +r.date)));
      end = end || new Date(Math.max(...dated.map((r) => +r.date)));
    }
    const inRange = (r, s, e) => (!s || !e) ? true : (r.date && r.date >= s && r.date <= e);
    const cur = all.filter((r) => inRange(r, start, end));
    if (start && end && cur.length < all.length) warnings.push(`${all.length - cur.length} row(s) fall outside ${iso(start)} – ${iso(end)} and were excluded.`);

    // previous period (only if explicitly given, or derivable and contains data)
    let pStart = o.prevStart ? parseDate(o.prevStart) : null, pEnd = o.prevEnd ? parseDate(o.prevEnd) : null;
    if (!pStart && !pEnd && start && end && dated.length) {
      const len = Math.round((end - start) / DAY) + 1;
      pEnd = new Date(+start - DAY); pStart = new Date(+pEnd - (len - 1) * DAY);
    }
    const prev = pStart && pEnd ? all.filter((r) => r.date && r.date >= pStart && r.date <= pEnd) : [];
    const hasPrev = prev.length > 0;

    const byCh = {}, prevByCh = {};
    for (const ch of CHANNELS) {
      byCh[ch] = groupChannel(cur.filter((r) => r.ch === ch), ch, o);
      prevByCh[ch] = hasPrev ? groupChannel(prev.filter((r) => r.ch === ch), ch, o) : null;
    }
    const totals = { pm: byCh.pm.total, pc: byCh.pc.total, sp: byCh.sp.total, sr: byCh.sr.total };
    totals.customer = totals.pm + totals.pc;
    totals.proactive = totals.sp + totals.sr;
    totals.total = totals.customer + totals.proactive;
    const prevTotal = hasPrev ? CHANNELS.reduce((a, ch) => a + prevByCh[ch].total, 0) : null;

    const period = periodLabel(start, end);
    const brand = clean(o.brand);

    const channels = {};
    for (const ch of CHANNELS) {
      const meta = CHANNEL_META[ch];
      const { total, list } = byCh[ch];
      const n = Math.min(o.topN[ch] || meta.topN, list.length);
      const top = list.slice(0, n);
      if (total === 0) warnings.push(`${meta.label}: no data found for this period.`);
      else if (list.length < (o.topN[ch] || meta.topN)) warnings.push(`${meta.label}: only ${list.length} theme(s) available — the table will have fewer than ${o.topN[ch] || meta.topN} rows.`);
      const rows = top.map((g) => {
        const q = pickQuote(g, ch, o, warnings);
        return { theme: g.theme, count: g.count, pct: pct(g.count, total), message: q.message, response: q.response, flags: q.flags, alts: q.alts, altIndex: 0 };
      });
      // pie: top slices + "Others"
      const slices = list.slice(0, o.pieSlices).map((g) => ({ label: g.theme, value: g.count }));
      const rest = list.slice(o.pieSlices).reduce((a, g) => a + g.count, 0);
      if (rest > 0) slices.push({ label: 'Others', value: rest });

      const insights = [];
      if (list.length) {
        const t = list[0];
        insights.push(`**${t.theme}** led with ${t.count} of ${total} ${meta.unit} (${fmtPct(t.count, total)}).`);
        if (list.length >= 3) {
          const k = Math.min(3, list.length);
          const s = list.slice(0, k).reduce((a, g) => a + g.count, 0);
          insights.push(`The top ${k} themes together account for **${fmtPct(s, total)}** of ${meta.short}.`);
        }
        if (hasPrev && prevByCh[ch].total > 0) {
          const pg = prevByCh[ch].list.find((g) => keyOf(g.theme) === keyOf(t.theme));
          insights.push(`Compared with the previous period (${pg ? pg.count : 0} → ${t.count}), the leading theme ${t.count > (pg ? pg.count : 0) ? 'increased' : t.count < (pg ? pg.count : 0) ? 'decreased' : 'was unchanged'}.`);
        }
        if (total < 20) insights.push(`The sample is small (${total} ${meta.unit}); interpret with caution.`);
        insights.push(PLACEHOLDER('Add the implication and the recommended action for this channel'));
      }
      const phrase = {
        pm: `Customer concerns received through private messages are consistently monitored, with a total of ${total} messages handled. The following are the top ${rows.length} ranked concerns:`,
        pc: `${brand || 'The brand'} consistently monitors customer concerns raised through public comments, with a total of ${total} comments handled. The following are the top ${rows.length} ranked concerns:`,
        sp: `A total of ${total} seeded posts were published during the ${period ? durAdj(period.duration) + ' ' : ''}reporting period. The following are the top ${rows.length} ranked sampled posts:`,
        sr: `A total of ${total} seeded replies were recorded during the ${period ? durAdj(period.duration) + ' ' : ''}reporting period. The following are the top ${rows.length} ranked posts with seeded replies:`,
      }[ch];
      channels[ch] = { key: ch, label: meta.label, total, intro: phrase, rows, pie: slices, insights, themeCount: list.length };
    }

    // overview
    const lead = (ch) => channels[ch].rows[0];
    const ov = [];
    ov.push(`**${totals.total} total touchpoints** were handled across all channels. Of these, ${totals.customer} were customer-initiated (private messages and public comments) and ${totals.proactive} were proactive (seeded posts and replies).`);
    for (const ch of ['pm', 'pc']) if (lead(ch)) ov.push(`**${CHANNEL_META[ch].label}:** ${lead(ch).theme} led with ${lead(ch).count} of ${totals[ch]} (${fmtPct(lead(ch).count, totals[ch])}).`);
    const leadCount = {};
    for (const ch of CHANNELS) if (lead(ch)) { const k = keyOf(lead(ch).theme); (leadCount[k] = leadCount[k] || { theme: lead(ch).theme, n: 0 }).n++; }
    const multi = Object.values(leadCount).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n)[0];
    if (multi) ov.push(`**${multi.theme}** was the leading theme in ${multi.n} of 4 channels.`);
    if (hasPrev && prevTotal > 0) {
      const d = totals.total - prevTotal;
      ov.push(`**Compared with the previous period**, total touchpoints ${d > 0 ? 'rose' : d < 0 ? 'fell' : 'were unchanged'}${d ? ' by ' + fmtPct(Math.abs(d), prevTotal) : ''} (${prevTotal} → ${totals.total}).`);
    }
    ov.push(PLACEHOLDER('Add the main customer-experience risk or pattern behind these numbers'));

    // concerns table
    const concerns = CHANNELS.map((ch) => {
      const r = lead(ch);
      return {
        channel: CHANNEL_META[ch].label,
        concern: r ? r.theme : 'No data',
        metric: r ? String(r.count) : '—',
        observation: r ? `${r.theme} accounted for ${fmtPct(r.count, totals[ch])} of ${CHANNEL_META[ch].short} in this period. ${PLACEHOLDER('Add observation')}` : 'No data for this channel in the reporting period.',
      };
    });

    // trends (facts only)
    const trends = [];
    for (const m of Object.values(leadCount).filter((x) => x.n >= 2)) trends.push(`${m.theme} was the leading theme in ${m.n} of 4 channels.`);
    if (hasPrev) {
      const cmb = (src) => { const m = new Map(); for (const ch of ['pm', 'pc']) for (const g of src[ch].list) { const k = keyOf(g.theme); const e = m.get(k) || { theme: g.theme, n: 0 }; e.n += g.count; m.set(k, e); } return m; };
      const a = cmb(byCh), b = cmb(prevByCh);
      const diffs = [...a.entries()].map(([k, v]) => ({ theme: v.theme, now: v.n, was: (b.get(k) || { n: 0 }).n })).filter((x) => x.now + x.was >= 10);
      diffs.sort((x, y) => Math.abs(y.now - y.was) - Math.abs(x.now - x.was));
      for (const d of diffs.slice(0, 3)) {
        if (d.now === d.was) continue;
        trends.push(d.was === 0 ? `${d.theme} emerged this period (0 → ${d.now} customer-initiated interactions).` : `${d.theme} ${d.now > d.was ? 'increased' : 'decreased'} from ${d.was} to ${d.now} customer-initiated interactions (${d.now > d.was ? '+' : '−'}${fmtPct(Math.abs(d.now - d.was), d.was)}).`);
      }
    } else {
      trends.push('Previous-period data was not available, so no increase or decrease is stated.');
    }
    const byDay = new Map();
    for (const r of cur) if (r.date) byDay.set(iso(r.date), (byDay.get(iso(r.date)) || 0) + r.count);
    if (byDay.size > 1) { const [d, n] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]; trends.push(`Interaction volume peaked on ${d} with ${n} touchpoints.`); }
    while (trends.length < 4) trends.push(PLACEHOLDER('Add an evidence-based trend'));

    const report = {
      meta: { brand, title: clean(o.title) || 'WEEKLY REPORT', periodLabel: period ? period.text : '', periodRange: period ? period.range : '', duration: period ? period.duration : '', startISO: start ? iso(start) : '', endISO: end ? iso(end) : '', useDefaultCoverLogo: true },
      totals,
      prevTotal,
      overview: { insights: ov },
      concerns,
      channels,
      trends: trends.slice(0, 6),
      notable1: {
        intro: `The following concerns were noted across the monitored channels during the ${period ? durAdj(period.duration) + ' ' : ''}reporting period:`.replace('  ', ' '),
        items: [
          { heading: 'Comments before seeking assistance.', text: PLACEHOLDER('Describe, with evidence'), images: [] },
          { heading: 'Extended Case Resolution', text: PLACEHOLDER('Describe, with evidence'), images: [] },
          { heading: 'Top-up requirement', text: PLACEHOLDER('Describe, with evidence'), images: [] },
        ],
      },
      notable2: {
        intro: `The following issues were monitored across the community pages over the ${period ? durAdj(period.duration) + ' ' : ''}reporting period:`.replace('  ', ' '),
        items: [
          { heading: 'Concerns on the loan top-up requirement', text: PLACEHOLDER('Describe, with evidence'), images: [] },
          { heading: 'Decline in community activity.', text: PLACEHOLDER('Describe, with evidence'), images: [] },
        ],
      },
      opportunities: [
        'MONTH-END LOAN ADVISORY', 'FASTER ACCESS RESOLUTION', 'DAILY APP STATUS UPDATE',
        'CLEARER TOP-UP AND CANCELLATION TERMS', 'GSAVE AND OTP UPDATES', 'COMMUNITY ENGAGEMENT MONITORING',
      ].map((t) => ({ title: t, text: PLACEHOLDER('Add a short, evidence-based suggestion (proposal, not an approved commitment)') })),
      summary: '',
      warnings,
    };
    report.summary = draftSummary(report);
    return report;
  }

  function draftSummary(r) {
    const m = r.meta, t = r.totals;
    const cust = {};
    for (const ch of ['pm', 'pc']) for (const row of r.channels[ch].rows) { const k = keyOf(row.theme); (cust[k] = cust[k] || { theme: row.theme, n: 0 }).n += row.count; }
    const top = Object.values(cust).sort((a, b) => b.n - a.n).slice(0, 2);
    const parts = [];
    parts.push(`The ${m.duration ? durAdj(m.duration) + ' ' : ''}(${m.periodRange || 'reporting period'}) monitoring period recorded **${t.total} touchpoints**` +
      (top.length ? `, with **${top.map((x) => x.theme).join('** and **')}** the leading customer-initiated concerns (${top.map((x) => x.n).join(' and ')} interactions across private messages and public comments).` : '.'));
    parts.push(PLACEHOLDER('Add the operational / customer-experience implications supported by the findings'));
    const acts = (r.opportunities || []).slice(0, 3).map((o) => o.title.toLowerCase());
    if (acts.length) parts.push(`Proposed priorities for the next reporting period: ${acts.join(', ')}.`);
    return parts.join(' ');
  }

  /* number of unresolved [[placeholders]] in a report */
  function countPlaceholders(report) {
    let n = 0;
    const walk = (v) => {
      if (typeof v === 'string') { const m = v.match(/\[\[[^\]]*\]\]/g); if (m) n += m.length; }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) if (k !== 'warnings') walk(v[k]);
    };
    walk(report);
    return n;
  }

  return { analyze, draftSummary, countPlaceholders, guessMapping, guessChannelValues, parseDate, periodLabel, CHANNELS, CHANNEL_META };
});
