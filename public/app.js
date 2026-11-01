/* Front-end for the Weekly Report Generator. Parsing + analysis happen locally in the browser. */
(function () {
  'use strict';
  const A = window.Analyze;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  };

  const S = { headers: [], rows: [], map: {}, chanVals: { pm: [], pc: [], sp: [], sr: [] }, workbook: null, fileName: '', report: null, pdfUrl: null };
  const FIELDS = [
    ['channel', 'Channel *', true], ['theme', 'Category / inquiry theme *', true], ['message', 'Message / post text', false],
    ['response', 'Response / seeded reply', false], ['date', 'Date', false], ['count', 'Count (optional)', false],
  ];
  const CH = A.CHANNEL_META;

  /* ---------- navigation ---------- */
  function go(id) {
    document.querySelectorAll('.step').forEach((s) => s.classList.toggle('on', s.id === id));
    document.querySelectorAll('#steps button').forEach((b) => b.classList.toggle('on', b.dataset.go === id));
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

  /* ---------- step 1: load ---------- */
  $('#pick').onclick = () => $('#file').click();
  $('#file').onchange = (e) => e.target.files[0] && readFile(e.target.files[0]);
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]));
  $('#useSample').onclick = async () => {
    const r = await fetch('sample-data/sample_interactions.csv');
    const blob = await r.blob();
    readFile(new File([blob], 'sample_interactions.csv', { type: 'text/csv' }));
    $('#brand').value = 'Acme Digital Bank (fictional)';
  };

  function readFile(f) {
    S.fileName = f.name;
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      const rd = new FileReader();
      rd.onload = () => {
        const wb = XLSX.read(rd.result, { type: 'array', cellDates: true });
        S.workbook = wb;
        const sel = $('#sheetSel'); sel.innerHTML = '';
        wb.SheetNames.forEach((n) => sel.append(el('option', { value: n, text: n })));
        $('#sheetWrap').classList.toggle('hidden', wb.SheetNames.length < 2);
        sel.onchange = () => loadSheet(sel.value);
        loadSheet(wb.SheetNames[0]);
      };
      rd.readAsArrayBuffer(f);
    } else {
      $('#sheetWrap').classList.add('hidden');
      Papa.parse(f, { header: true, skipEmptyLines: 'greedy', complete: (res) => setData(res.meta.fields || [], res.data) });
    }
  }
  function loadSheet(name) {
    const ws = S.workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true, cellDates: true });
    setData(Object.keys(rows[0] || {}), rows);
  }
  function setData(headers, rows) {
    headers = headers.filter((h) => h && String(h).trim() !== '');
    S.headers = headers; S.rows = rows;
    $('#fileInfo').textContent = `${S.fileName}: ${rows.length.toLocaleString()} rows, ${headers.length} columns.`;
    if (!rows.length) { $('#fileInfo').textContent = 'No data rows found in this file/tab.'; return; }
    const saved = loadPrefs(headers);
    S.map = saved ? saved.map : A.guessMapping(headers);
    buildMapUI();
    if (saved && saved.chanVals) S.chanVals = saved.chanVals; else autoChannels();
    buildChannelUI();
    setDefaultDates();
    go('s2');
  }

  /* ---------- step 2: mapping ---------- */
  const prefKey = (h) => 'rg-prefs:' + h.join('|').toLowerCase();
  function loadPrefs(h) { try { return JSON.parse(localStorage.getItem(prefKey(h))); } catch (e) { return null; } }
  function savePrefs() { try { localStorage.setItem(prefKey(S.headers), JSON.stringify({ map: S.map, chanVals: S.chanVals })); } catch (e) { /* ignore */ } }

  function buildMapUI() {
    const box = $('#mapFields'); box.innerHTML = '';
    FIELDS.forEach(([key, label]) => {
      const sel = el('select', { 'data-f': key }, el('option', { value: '', text: '— not in my data —' }), S.headers.map((h) => el('option', { value: h, text: h })));
      sel.value = S.map[key] || '';
      sel.onchange = () => { S.map[key] = sel.value; if (key === 'channel') { autoChannels(); buildChannelUI(); } if (key === 'date') setDefaultDates(); savePrefs(); };
      box.append(el('label', {}, label, sel));
    });
  }
  function distinct(col) { const m = new Map(); S.rows.forEach((r) => { const v = String(r[col] == null ? '' : r[col]).trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }
  function autoChannels() { S.chanVals = S.map.channel ? A.guessChannelValues(distinct(S.map.channel).map((x) => x[0])) : { pm: [], pc: [], sp: [], sr: [] }; }
  function buildChannelUI() {
    const box = $('#chanMap'); box.innerHTML = '';
    if (!S.map.channel) { box.append(el('p', { class: 'note', text: 'Choose the Channel column first.' })); return; }
    const vals = distinct(S.map.channel);
    if (vals.length > 40) { box.append(el('p', { class: 'note warn-t', text: 'This column has more than 40 distinct values — it may not be the channel column.' })); }
    A.CHANNELS.forEach((ch) => {
      const chips = vals.slice(0, 40).map(([v, n]) => {
        const cb = el('input', { type: 'checkbox' }); cb.checked = (S.chanVals[ch] || []).includes(v);
        cb.onchange = () => {
          // a value can only belong to one channel
          if (cb.checked) A.CHANNELS.forEach((o) => { S.chanVals[o] = (S.chanVals[o] || []).filter((x) => x !== v); });
          else S.chanVals[ch] = (S.chanVals[ch] || []).filter((x) => x !== v);
          if (cb.checked) S.chanVals[ch].push(v);
          savePrefs(); buildChannelUI();
        };
        return el('label', { class: 'chip' }, cb, `${v} `, el('small', { text: `(${n})` }));
      });
      box.append(el('div', { class: 'chrow' }, el('b', { text: CH[ch].label }), el('div', { class: 'chips' }, chips)));
    });
  }
  function setDefaultDates() {
    if (!S.map.date) return;
    const ds = S.rows.map((r) => A.parseDate(r[S.map.date])).filter(Boolean);
    if (!ds.length) return;
    const min = new Date(Math.min(...ds)), max = new Date(Math.max(...ds));
    // default: the most recent 14 days of data if the span is long, else the entire span
    const span = Math.round((max - min) / 864e5) + 1;
    const start = span > 14 ? new Date(+max - 13 * 864e5) : min;
    $('#start').value = start.toISOString().slice(0, 10);
    $('#end').value = max.toISOString().slice(0, 10);
  }

  $('#build').onclick = () => {
    const msg = $('#buildMsg');
    if (!S.map.channel || !S.map.theme) { msg.textContent = 'Please map the Channel and Category columns.'; return; }
    if (!A.CHANNELS.some((c) => (S.chanVals[c] || []).length)) { msg.textContent = 'Assign at least one channel value.'; return; }
    msg.textContent = '';
    const n5 = Math.max(3, Math.min(5, +$('#topN').value || 5)), n4 = Math.max(2, Math.min(5, +$('#topNr').value || 4));
    S.report = A.analyze(S.rows, S.map, {
      brand: $('#brand').value, title: $('#title').value, channelValues: S.chanVals,
      start: $('#start').value, end: $('#end').value, prevStart: $('#pstart').value, prevEnd: $('#pend').value,
      topN: { pm: n5, pc: n5, sp: n5, sr: n4 },
    });
    S.report.meta.coverLogo = ''; S.report.meta.showCoverTitle = true;
    savePrefs();
    renderEditor(); go('s3');
  };

  /* ---------- step 3: editor ---------- */
  const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setp = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const hasPh = (v) => /\[\[[^\]]*\]\]/.test(v || '');
  const phClass = (n, v) => n.classList.toggle('ph-field', hasPh(v));

  function text(path, { rows = 2, label, lines = false } = {}) {
    const cur = getp(S.report, path);
    const val = lines ? cur.join('\n') : cur;
    const ta = el('textarea', { rows });
    ta.value = val; phClass(ta, val);
    ta.oninput = () => { setp(S.report, path, lines ? ta.value.split('\n').map((s) => s.trim()).filter(Boolean) : ta.value); phClass(ta, ta.value); updateBanner(); };
    return label ? el('label', {}, label, ta) : ta;
  }
  function line(path, label) {
    const i = el('input', { type: 'text' }); i.value = getp(S.report, path); phClass(i, i.value);
    i.oninput = () => { setp(S.report, path, i.value); phClass(i, i.value); updateBanner(); };
    return label ? el('label', {}, label, i) : i;
  }
  const section = (title, hint, ...kids) => el('details', { class: 'card sec', open: true }, el('summary', {}, el('b', { text: title }), hint ? el('span', { class: 'hint', text: ' — ' + hint }) : ''), ...kids);

  async function toDataUrl(file, max = 1600) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const g = c.getContext('2d'); g.fillStyle = '#201D22'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(url); }
  }
  function imageEditor(path, max, label) {
    const wrap = el('div', { class: 'imgs' });
    const draw = () => {
      wrap.innerHTML = '';
      const list = getp(S.report, path) || [];
      list.forEach((u, i) => wrap.append(el('div', { class: 'thumb' }, el('img', { src: u, alt: 'screenshot ' + (i + 1) }), el('button', { title: 'Remove', onclick: () => { list.splice(i, 1); draw(); } }, '×'))));
      if (list.length < max) {
        const inp = el('input', { type: 'file', accept: 'image/*', hidden: true });
        inp.onchange = async () => { if (inp.files[0]) { list.push(await toDataUrl(inp.files[0])); setp(S.report, path, list); draw(); } };
        wrap.append(inp, el('button', { class: 'add', onclick: () => inp.click() }, `+ ${label || 'Add screenshot'} (${list.length}/${max})`));
      }
    };
    draw(); return wrap;
  }

  function renderEditor() {
    const R = S.report, box = $('#editor'); box.innerHTML = '';
    // warnings
    const w = $('#warnings');
    w.classList.toggle('hidden', !R.warnings.length);
    w.innerHTML = '';
    if (R.warnings.length) w.append(el('b', { text: 'Check these data notes:' }), el('ul', {}, R.warnings.map((x) => el('li', { text: x }))));

    // meta + totals
    const kpis = el('div', { class: 'kpis' }, ['pm', 'pc', 'sp', 'sr'].map((k) => el('div', { class: 'kpi' }, el('div', { class: 'n', text: R.totals[k].toLocaleString() }), el('div', { text: CH[k].kpi }))));
    const logoIn = el('input', { type: 'file', accept: 'image/*', hidden: true });
    logoIn.onchange = async () => { if (logoIn.files[0]) { R.meta.coverLogo = await toDataUrl(logoIn.files[0], 800); R.meta.useDefaultCoverLogo = false; renderEditor(); } };
    box.append(section('Cover & overview (slides 1–2)', 'KPI totals are calculated, not editable',
      el('div', { class: 'grid4' }, line('meta.title', 'Report title'), line('meta.periodLabel', 'Period label (shown on cover and slide 2)'),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: R.meta.showCoverTitle, onchange: (e) => { R.meta.showCoverTitle = e.target.checked; } }), 'Show title + period on cover'),
        el('div', {}, el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: R.meta.useDefaultCoverLogo !== false && !R.meta.coverLogo, onchange: (e) => { R.meta.useDefaultCoverLogo = e.target.checked; if (e.target.checked) R.meta.coverLogo = ''; } }), 'Use the default cover logo'),
          el('button', { onclick: () => logoIn.click() }, R.meta.coverLogo ? 'Replace custom logo' : 'Upload custom cover logo'), logoIn)),
      kpis,
      text('overview.insights', { rows: 7, label: 'Key insights (one bullet per line)', lines: true })));

    // concerns table
    box.append(section('Customers overview concerns (slide 3)', 'leading theme per channel',
      R.concerns.map((c, i) => el('div', { class: 'grid4 rowgrp' }, line(`concerns.${i}.channel`, 'Channel'), line(`concerns.${i}.concern`, 'Concern'), line(`concerns.${i}.metric`, 'Metric'), text(`concerns.${i}.observation`, { label: 'Observation' })))));

    // channels
    ['pm', 'pc', 'sp', 'sr'].forEach((k, ci) => {
      const ch = R.channels[k], slides = [4 + ci * 2, 5 + ci * 2].join('–');
      const hasResp = CH[k].hasResponse;
      const lblMsg = k === 'sr' ? 'Actual post' : k === 'sp' ? 'Actual (seeded) post' : 'Actual message', lblResp = k === 'sr' ? 'Seeded reply' : 'How we responded';
      const rows = ch.rows.map((r, i) => {
        const cycle = el('button', { class: 'small', title: 'Use a different real example from your data', onclick: () => {
          if (!r.alts || r.alts.length < 2) return;
          r.altIndex = ((r.altIndex || 0) + 1) % r.alts.length; const a = r.alts[r.altIndex];
          r.message = a.message; r.response = a.response; r.flags = []; renderEditor();
        } }, `↻ another example (${(r.altIndex || 0) + 1}/${(r.alts || []).length || 1})`);
        return el('div', { class: 'rowgrp' },
          el('div', { class: 'rowhead' }, el('b', { text: `${i + 1}. ` }), line(`channels.${k}.rows.${i}.theme`), el('span', { class: 'cnt', text: `${r.count} · ${r.pct}%` }), cycle,
            r.flags && r.flags.length ? el('span', { class: 'flag', text: '⚠ ' + r.flags.join(', ') }) : ''),
          el('div', { class: 'grid2' }, text(`channels.${k}.rows.${i}.message`, { rows: 3, label: lblMsg }), hasResp ? text(`channels.${k}.rows.${i}.response`, { rows: 3, label: lblResp }) : ''));
      });
      box.append(section(`${CH[k].label} (slides ${slides})`, `${ch.total} total · ${ch.themeCount} themes`,
        text(`channels.${k}.intro`, { rows: 2, label: 'Intro paragraph' }), ...rows,
        text(`channels.${k}.insights`, { rows: 5, label: 'Key insights (one bullet per line)', lines: true })));
    });

    box.append(section('Key trends (slide 12)', '4–6 evidence-based bullets', text('trends', { rows: 7, lines: true, label: 'One trend per line' })));

    const nb = (key, slide, count, slotsPer) => section(`Notable concerns (slide ${slide})`, 'screenshots are optional',
      text(`${key}.intro`, { rows: 2, label: 'Intro line' }),
      R[key].items.map((it, i) => el('div', { class: 'rowgrp' }, line(`${key}.items.${i}.heading`, `Concern ${i + 1} heading`), text(`${key}.items.${i}.text`, { rows: 3, label: 'Explanation' }), imageEditor(`${key}.items.${i}.images`, slotsPer[i], 'Add evidence screenshot'))));
    box.append(nb('notable1', 13, 3, [3, 2, 1]), nb('notable2', 14, 2, [2, 1]));

    box.append(section('Opportunities for improvements (slide 15)', 'proposals, not approved commitments',
      R.opportunities.map((o, i) => el('div', { class: 'grid2 rowgrp' }, line(`opportunities.${i}.title`, `0${i + 1} · Heading`), text(`opportunities.${i}.text`, { rows: 3, label: 'Description' })))));

    const sumTa = text('summary', { rows: 8, label: 'Overall summary (slide 16) — one cohesive paragraph' });
    box.append(section('Overall summary (slide 16)', 'must agree with the numbers on other slides',
      sumTa, el('button', { onclick: () => { R.summary = A.draftSummary(R); renderEditor(); } }, '↻ Re-draft summary from current numbers + opportunity titles')));
    updateBanner();
  }

  function updateBanner() {
    const n = A.countPlaceholders(S.report), b = $('#banner');
    b.className = 'banner ' + (n ? 'bad' : 'good');
    b.textContent = n ? `${n} placeholder${n > 1 ? 's' : ''} still need your text (highlighted in red).` : 'All placeholders are filled — ready to export.';
  }

  /* ---------- step 4: export ---------- */
  function payload() {
    const r = JSON.parse(JSON.stringify(S.report));
    for (const k of Object.keys(r.channels)) r.channels[k].rows.forEach((x) => { delete x.alts; });
    return { report: r };
  }
  async function call(format) {
    const msg = $('#exportMsg');
    const n = A.countPlaceholders(S.report);
    if (!S.report) { msg.textContent = 'Build a draft report first (steps 1–3).'; return null; }
    if (n && !$('#allowPh').checked) { msg.textContent = `${n} placeholder(s) are still in the report. Fill them in step 3, or tick “Export even if placeholders are present”.`; return null; }
    msg.textContent = format === 'pdf' ? 'Rendering PDF… (can take 10–40 s)' : 'Building PowerPoint…';
    const res = await fetch('/api/generate?format=' + format, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    if (!res.ok) { let m = res.statusText; try { m = (await res.json()).error; } catch (e) { /* ignore */ } msg.textContent = 'Error: ' + m; return null; }
    msg.textContent = '';
    return res.blob();
  }
  const fname = (ext) => `WEEKLY_REPORT_${(S.report.meta.periodLabel || 'report').replace(/[^\w.-]+/g, '_')}.${ext}`;
  function save(blob, name) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  async function pdfBlob() { return S.pdfBlob || (S.pdfBlob = await call('pdf')); }
  $('#btnPreview').onclick = async () => {
    S.pdfBlob = null; const b = await pdfBlob(); if (!b) return;
    if (S.pdfUrl) URL.revokeObjectURL(S.pdfUrl); S.pdfUrl = URL.createObjectURL(b);
    const f = $('#preview'); f.src = S.pdfUrl; f.classList.remove('hidden');
  };
  $('#btnPdf').onclick = async () => { S.pdfBlob = null; const b = await pdfBlob(); if (b) save(b, fname('pdf')); };
  $('#btnPptx').onclick = async () => { const b = await call('pptx'); if (b) save(b, fname('pptx')); };
})();
