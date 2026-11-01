# Weekly Report Generator

A small web app that turns your weekly interaction data (exported from Google Sheets as CSV/XLSX) into the **17-slide WEEKLY REPORT** — same dark/orange design as your reference deck — and lets you download it as an **editable PowerPoint (.pptx)** or **PDF**.

```
Google Sheet ──export CSV/XLSX──▶ [browser: map columns, compute, edit] ──report JSON──▶ [server: draw slides] ──▶ .pptx / .pdf
```

* **Your raw sheet never leaves the browser.** Only the finished report content (totals, top themes, chosen quotes, your text, optional screenshots) is posted to the server, rendered in memory, and discarded. Nothing is stored.
* No AI service, no Google/Canva API keys, no database.
* Charts and tables in the PPTX are native PowerPoint objects (editable).

## How a weekly run works
1. Export the Google Sheet tab as CSV (File ▸ Download) — or XLSX.
2. Open the app ▸ **1 Data**: drop the file.
3. **2 Map & settings**: confirm the column mapping (auto-guessed and remembered), tick which channel values mean Private Messages / Public Comments / Seeded Posts / Seeded Replies, set the period.
4. **3 Review & edit**: numbers, rankings and quotes are filled in. Replace the `[[red placeholders]]` (implications, notable concerns, recommendations); add screenshots for the two Notable Concerns slides.
5. **4 Export**: preview, then download PPTX or PDF.

Try it first with **"Try with fictional sample data"** on step 1. See [`docs/FIELD_MAPPING.md`](docs/FIELD_MAPPING.md) for the data format and metric definitions.

## Run locally
```bash
npm install
npm start            # http://localhost:3000
```
PDF export needs LibreOffice (`soffice` on PATH) and the fonts in `fonts/` installed. The Dockerfile does both. PPTX export works without LibreOffice.

## Deploy: GitHub → Railway
1. Create a GitHub repo and push this folder:
   ```bash
   git init && git add . && git commit -m "Report generator"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In Railway: **New Project ▸ Deploy from GitHub repo** ▸ pick the repo. Railway reads `railway.json` and builds the `Dockerfile` (it installs LibreOffice and the fonts).
3. **Variables ▸ add `APP_PASSWORD`** = a strong shared password. The site then asks for it (any username). *Do this before sharing the URL.*
4. **Settings ▸ Networking ▸ Generate Domain.** Open it, run the sample data, download both formats.
5. Every `git push` to `main` redeploys automatically.

Sizing: PDF rendering uses LibreOffice (~300–600 MB RAM while converting). Railway's Hobby plan is plenty. `PDF_CONCURRENCY` (default 2) limits parallel conversions.

### Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `APP_PASSWORD` | *(none → open!)* | Shared password (HTTP Basic) |
| `PORT` | set by Railway | |
| `PDF_CONCURRENCY` | 2 | Parallel PDF conversions |
| `PDF_TIMEOUT_MS` | 150000 | Max time for one PDF conversion |
| `RATE_LIMIT_PER_MIN` | 20 | Max `/api/generate` requests per minute per IP |

## Fonts
The design uses **League Spartan** (titles) and **Poppins** (body) — both free Google fonts, bundled in `fonts/` (OFL license) for the PDF. For `.pptx` files to look right on a PC, install those two fonts there too (otherwise PowerPoint substitutes a default font).

## What's automated vs manual
| Automated | Manual |
|---|---|
| Totals, KPI blocks, customer vs proactive split | Export the sheet and upload it |
| Ranking, top-N tables, % shares, pie charts | Confirm mapping (remembered next time) |
| Real quote selection (+ one-click alternates) | Write implications / recommendations / notable concerns |
| Previous-period comparison (only if data exists) | Add screenshots for slides 13–14 |
| Fact-based draft insights, trends, summary | Final review (checklist on step 4) |
| PPTX + PDF export | |

**Further automation (needs approval):** read the Google Sheet directly via the Google Sheets API (service account with read-only access to that one sheet), or schedule a weekly job. Not included, because it would move confidential data to a new system.

## Layout
```
server.js            Express: static UI + POST /api/generate?format=pptx|pdf
lib/deck.js          17-slide builder (pptxgenjs) — geometry measured from the reference deck
lib/pdf.js           LibreOffice PPTX→PDF
lib/validate.js      Sanitises the incoming report JSON
public/              UI (index.html, app.js, analyze.js = metrics engine, vendor/ = PapaParse + SheetJS)
assets/ fonts/       Cover art, logo, fonts (taken from your reference deck)
sample-data/         FICTIONAL demo CSV + mock screenshots
sample-output/       Demo PPTX/PDF produced from the fictional data
scripts/             make-sample.js, make-screenshots.js, test.js
```
`npm test` regenerates a demo report end-to-end and checks totals, sorting and pie sums.

## Customising
* **Colors / sizes / positions:** top of `lib/deck.js` (`C`, `F`, per-slide coordinates in inches, 20" × 11.25").
* **Cover art / logos:** replace files in `assets/` (`cover.png`, `logo.png`, `cover-client-logo.png`) or upload a cover logo in step 3.
* **Default opportunity headings / notable concern headings:** `public/analyze.js` (search `opportunities`, `notable1`).
