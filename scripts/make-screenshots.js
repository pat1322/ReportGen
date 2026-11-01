'use strict';
/* Creates FICTIONAL mock "screenshots" (chat bubbles) for testing the evidence-image slots. */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'sample-data', 'screenshots');
fs.mkdirSync(dir, { recursive: true });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function mock(name, w, h, bubbles) {
  let y = 70, out = '';
  bubbles.forEach(([side, text]) => {
    const lines = text.match(/.{1,34}(\s|$)/g) || [text];
    const bh = 34 + lines.length * 30, bw = 380, x = side === 'l' ? 24 : w - bw - 24;
    out += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="22" fill="${side === 'l' ? '#E9ECEF' : '#2D7FF9'}"/>`;
    lines.forEach((ln, i) => { out += `<text x="${x + 20}" y="${y + 40 + i * 30}" font-family="Arial" font-size="22" fill="${side === 'l' ? '#222' : '#fff'}">${esc(ln.trim())}</text>`; });
    y += bh + 18;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="48" fill="#F3F4F6"/><text x="20" y="32" font-family="Arial" font-size="22" fill="#555">Fictional sample chat · demo only</text>${out}</svg>`;
  return sharp(Buffer.from(svg)).png().toFile(path.join(dir, name));
}
(async () => {
  await mock('chat1.png', 460, 900, [['l', 'Hi, I cannot log in to the app since this morning.'], ['r', 'Sorry for the trouble! Please send your full name and registered number.'], ['l', 'Sent. Thank you!']]);
  await mock('chat2.png', 560, 560, [['l', 'Is the app down for everyone?'], ['r', 'We are aware of the issue and are working on it.']]);
  await mock('chat3.png', 900, 200, [['l', 'Still waiting for my withdrawal, 3 days now.']]);
  await mock('chat4.png', 900, 420, [['l', 'Is the 300 top-up refundable if my application is declined?'], ['r', 'Please see the terms shown before payment.']]);
  await mock('chat5.png', 760, 520, [['l', 'The community page is so quiet lately.'], ['r', 'Posts now need approval before appearing.']]);
  await mock('chat6.png', 460, 760, [['l', 'Reminder: month-end deductions may take 1-2 days.']]);
  console.log('screenshots written');
})();
