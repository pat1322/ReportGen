'use strict';
/* Generates a FICTIONAL demo dataset (sample-data/sample_interactions.csv). No real customers or messages. */
const fs = require('fs');
const path = require('path');

let seed = 20261007;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wpick = (pairs) => { const t = pairs.reduce((a, p) => a + p[1], 0); let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const THEMES = {
  login: 'App Login Issue',
  loan: 'Loan Payment / Deduction',
  maint: 'App Maintenance Update',
  wd: 'Withdrawal Delayed',
  otp: 'OTP Not Received',
  selfie: 'Selfie Verification Failed',
  card: 'Card Activation',
  rate: 'Interest Rate Inquiry',
  stmt: 'Statement Request',
};

const MSG = {
  login: ['Hi, I cannot log in to the app since this morning. It keeps saying my account is locked. What should I do?', 'The app will not open after the update. Please help, I need to check my balance today.', 'Why can\'t I sign in? I reset my password twice already.'],
  loan: ['My loan shows overdue but I funded my account before the due date. Was the deduction not processed?', 'Sept 30 pa ako nag-fund para sa due ko ng Oct 1, hindi pa rin nababawas. Please check.', 'Will there be a late fee if the auto-deduction failed on your side?'],
  maint: ['When will the scheduled maintenance be over? I have a payment to make.', 'Is the app down for everyone or just me?'],
  wd: ['I requested a withdrawal to my e-wallet 3 days ago and it still has not arrived.', 'My transfer is stuck on pending. How long does it usually take?'],
  otp: ['I did not receive my OTP even after waiting 10 minutes.', 'No OTP again today. I tried three times already.'],
  selfie: ['My selfie verification keeps failing even in good lighting.', 'The face scan says "try again" every time.'],
  card: ['How do I activate my new card?', 'I received my card but the activation option is not showing in the app.'],
  rate: ['What is the current interest rate for savings?', 'Is the interest computed daily or monthly?'],
  stmt: ['How can I get my monthly statement?', 'Can you send me a copy of my statement for September?'],
};
const RESP = {
  login: ['Hello! We\'re sorry for the trouble. Please send us your full name and registered mobile number via private message so our support team can check your account. Thank you for your patience.', 'Hi, thanks for reaching out. We are aware of intermittent access issues and our team is working on it. Please try again later and update the app to the latest version.'],
  loan: ['Hi! We are aware of an issue affecting some auto-deductions. Our team is working on it and the deduction should reflect within 1–2 days. We will adjust any affected records on our side.', 'Hello, thank you for letting us know. Please send your registered mobile number by private message so we can verify your payment status.'],
  maint: ['Hi! Maintenance updates are posted on our official page. We appreciate your patience.'],
  wd: ['Hello, to track this please share the date, amount and destination account of your withdrawal via in-app chat. Our team will check the status.'],
  otp: ['Hi! Please check your spam/junk folder and make sure your registered number is correct. If you still do not receive it, contact our support via in-app chat.'],
  selfie: ['Hello! Please try again in a well-lit area without glasses or a cap. If it still fails, message us so we can assist securely. Do not share your ID or selfie in the comments.'],
  card: ['Hi! Card activation is available under Cards > Activate. If you do not see it, please message us with your registered mobile number.'],
  rate: ['Hello! Current rates are listed in the app under Savings > Rates. Interest is computed daily and credited monthly.'],
  stmt: ['Hi! Statements are available in the app under Profile > Statements. A copy can also be sent to your registered email.'],
};
const SEEDED_POST = {
  login: ['Anyone else having trouble opening the app today? I messaged the support page and they asked for my details, then someone called me. Fixed after that.'],
  otp: ['My OTP came in right away today. The transaction was quick.'],
  wd: ['Transferred to my e-wallet this morning and it arrived in minutes.'],
  card: ['Has anyone activated the new card already? Was it easy?'],
  rate: ['Does anyone know how often the savings interest is credited?'],
};
const SEEDED_REPLY = {
  login: ['Same here at first. I messaged their page, they asked for my full name and number, then I could log in the same day.'],
  card: ['Mine was easy, it\'s under Cards in the app.'],
  loan: ['Message their page, they will check it. Mine got fixed in two days.'],
  rate: ['Check Savings > Rates in the app, it\'s listed there.'],
};
const SEEDED_REPLY_POST = {
  login: ['Can\'t log in to the app, anyone know what\'s going on?'],
  card: ['How do I activate my card?'],
  loan: ['Due date was yesterday but my payment was not deducted. What now?'],
  rate: ['What is the savings rate this month?'],
};

const rows = [['Date', 'Channel', 'Category', 'Customer Message', 'Reply Sent']];
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const d = (iso) => iso;
function day(offset, start) { const t = new Date(Date.UTC(2026, 8, 24) + (start + offset) * 86400000); return t.toISOString().slice(0, 10); }

function gen(startOffset, nDays, vol) {
  const weights = { login: 28, loan: 24, maint: 6, wd: 8, otp: 6, selfie: 10, card: 7, rate: 5, stmt: 6 };
  const wl = (m) => Object.entries(weights).map(([k, w]) => [k, w * (m[k] || 1)]);
  for (let i = 0; i < nDays; i++) {
    const date = day(i, startOffset);
    const monthEnd = /-(30|01|02)$/.test(date);
    // private messages
    const pm = Math.round(vol * (monthEnd ? 1.8 : 1) * (0.7 + rnd() * 0.6) * 50);
    for (let n = 0; n < pm; n++) {
      const k = wpick(wl({ loan: monthEnd ? 3 : 1 }));
      const casing = rnd() < 0.05 ? THEMES[k].toUpperCase() : THEMES[k];
      let reply = pick(RESP[k]);
      if (rnd() < 0.02) reply = '';
      rows.push([date, 'Private Message', casing, pick(MSG[k]), reply]);
    }
    // public comments
    const pc = Math.round(vol * (0.7 + rnd() * 0.6) * 12);
    for (let n = 0; n < pc; n++) {
      const k = wpick(wl({ login: 1.5 }));
      rows.push([date, 'Public Comment', THEMES[k], pick(MSG[k]), pick(RESP[k])]);
    }
    // seeded posts
    if (rnd() < 0.85) {
      const k = pick(Object.keys(SEEDED_POST));
      const c = 2 + Math.floor(rnd() * 4);
      for (let n = 0; n < c; n++) rows.push([date, 'Seeded Post', THEMES[k], pick(SEEDED_POST[k]), '']);
    }
    // seeded replies
    if (rnd() < 0.8) {
      const k = pick(Object.keys(SEEDED_REPLY));
      rows.push([date, 'Seeded Reply', THEMES[k], pick(SEEDED_REPLY_POST[k]), pick(SEEDED_REPLY[k])]);
    }
  }
}
gen(-14, 14, 0.8); // previous period: Sep 10 – Sep 23
gen(0, 14, 1.0);   // current period: Sep 24 – Oct 7

// edge cases (kept deliberately): a very long message and a theme with no response
rows.push(['2026-10-03', 'Public Comment', 'Statement Request', 'This is an intentionally very long fictional message used to test long-text handling. ' + 'The customer explains the situation in great detail and keeps going. '.repeat(14), 'Thanks for your message. Please contact us via in-app chat.']);

const csv = rows.map((r, i) => (i === 0 ? r.join(',') : r.map(q).join(','))).join('\n') + '\n';
const out = path.join(__dirname, '..', 'sample-data', 'sample_interactions.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv);
console.log('Wrote', out, rows.length - 1, 'rows');
