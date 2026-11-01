# Contributing

Thanks for taking the time to contribute! This is a small project, so the
process is deliberately lightweight.

## Getting set up

```bash
npm install
npm start            # http://localhost:3000
```

PPTX export works out of the box. PDF export additionally needs LibreOffice
(`soffice` on PATH) and the fonts in `fonts/` installed locally — or just use
the Dockerfile, which sets both up.

Regenerate the fictional sample dataset / screenshots if you need fresh demo
data:
```bash
npm run sample                      # sample-data/sample_interactions.csv
node scripts/make-screenshots.js    # sample-data/screenshots/*.png
```

## Before opening a PR

```bash
npm test
```
This runs an end-to-end check: sample CSV → analysis → PPTX (and PDF, if
LibreOffice is available) — verifying totals, sorting, and pie-chart sums
along the way. Please make sure it passes.

A few project-specific things worth knowing:

- **The browser never uploads the raw spreadsheet.** All CSV/XLSX parsing
  and metric computation happens client-side in `public/analyze.js`. Only
  the finished report JSON is POSTed to the server. Keep it that way — don't
  add code paths that send raw rows to the server.
- **The server is stateless.** `lib/validate.js` re-sanitises every incoming
  report JSON (never trust client input) and `lib/deck.js` renders it in
  memory — nothing is written to disk outside of the PDF conversion's
  temp directory, which is deleted right after.
- **Slide geometry is intentional.** The coordinates in `lib/deck.js` were
  measured from a reference PPTX to match an existing design. If you change
  layout, try to keep the 20"×11.25" canvas and existing colour palette (`C`
  / `F` at the top of the file) unless the change is the point of the PR.
- No test framework/build step is used — keep dependencies minimal.

## Reporting bugs / requesting features

Please use the GitHub issue templates. For security issues, see
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Pull requests

- Keep PRs focused — one logical change per PR is easier to review.
- Describe what changed and why, and call out any manual testing you did
  (especially for anything touching `lib/deck.js`, since slide layout is hard
  to verify from a diff alone — a screenshot of the rendered PPTX/PDF helps).
- By submitting a PR you agree your contribution is licensed under this
  project's [MIT license](LICENSE).
