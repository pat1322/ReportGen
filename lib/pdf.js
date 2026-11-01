'use strict';
/* PPTX → PDF via headless LibreOffice. Each call uses its own profile + temp dir; calls are queued. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const SOFFICE = process.env.SOFFICE_BIN || 'soffice';
const MAX_PARALLEL = Number(process.env.PDF_CONCURRENCY || 2);
let running = 0; const queue = [];

function slot() {
  return new Promise((resolve) => {
    const go = () => { running++; resolve(() => { running--; const n = queue.shift(); if (n) n(); }); };
    if (running < MAX_PARALLEL) go(); else queue.push(go);
  });
}

async function pptxToPdf(pptxBuffer) {
  const release = await slot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpt-'));
  try {
    const inFile = path.join(dir, 'report.pptx');
    fs.writeFileSync(inFile, pptxBuffer);
    const profile = 'file://' + path.join(dir, 'profile');
    await new Promise((resolve, reject) => {
      execFile(SOFFICE, ['-env:UserInstallation=' + profile, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, inFile],
        { timeout: Number(process.env.PDF_TIMEOUT_MS || 150000), env: Object.assign({}, process.env, { HOME: dir }) },
        (err, _o, stderr) => (err ? reject(new Error('PDF conversion failed: ' + (stderr || err.message).slice(0, 300))) : resolve()));
    });
    const out = path.join(dir, 'report.pdf');
    if (!fs.existsSync(out)) throw new Error('PDF conversion produced no file');
    return fs.readFileSync(out);
  } finally {
    release();
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}
module.exports = { pptxToPdf };
