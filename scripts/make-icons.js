'use strict';
/* Generates favicon / PWA / apple-touch icons from assets/logo.png (the tool's own brand mark,
   already stamped on every slide master in lib/deck.js). Re-run after changing the logo. */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'logo.png');
const OUT = path.join(__dirname, '..', 'public', 'icons');
const BG = '#201D22';

fs.mkdirSync(OUT, { recursive: true });

async function tile(size, logoFraction, { alpha = true } = {}) {
  const logoSize = Math.round(size * logoFraction);
  const logo = await sharp(SRC).resize(logoSize, logoSize, { fit: 'contain' }).toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: alpha ? { r: 0x20, g: 0x1d, b: 0x22, alpha: 1 } : BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png();
  if (!alpha) img = img.flatten({ background: BG });
  return img.toBuffer();
}

(async () => {
  const jobs = [
    ['favicon-16.png', 16, 0.74],
    ['favicon-32.png', 32, 0.74],
    ['favicon-48.png', 48, 0.74],
    ['icon-192.png', 192, 0.72],
    ['icon-512.png', 512, 0.72],
    ['icon-192-maskable.png', 192, 0.5],
    ['icon-512-maskable.png', 512, 0.5],
  ];
  for (const [name, size, frac] of jobs) {
    fs.writeFileSync(path.join(OUT, name), await tile(size, frac));
    console.log('wrote', name);
  }
  // apple-touch-icon: no alpha (iOS fills transparent areas with black otherwise)
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await tile(180, 0.72, { alpha: false }));
  console.log('wrote apple-touch-icon.png');
})();
