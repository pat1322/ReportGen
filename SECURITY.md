# Security Policy

## Supported versions

This is a small, single-version project (no release branches). Security fixes
are applied to the `main` branch only — please make sure you're running the
latest commit before reporting an issue.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Instead, email **patrickperez1322@gmail.com** with:
- A description of the issue and its potential impact
- Steps to reproduce (a minimal example helps a lot)
- Any suggested fix, if you have one

You should get an acknowledgement within a few days. Once a fix is available,
a note will be added to the changelog/commit history crediting the report
(unless you'd prefer to stay anonymous).

## Scope and known trust boundaries

A few things worth knowing when assessing impact:

- **The uploaded spreadsheet never leaves the browser.** Only the compact,
  already-reviewed report JSON (totals, selected quotes, screenshots, free
  text) is POSTed to `/api/generate`. The server never writes the sheet or
  report JSON to disk — PPTX/PDF rendering happens in memory (PDF uses a
  temp directory that is deleted immediately after conversion).
- **Authentication is a single shared password** (HTTP Basic, via
  `APP_PASSWORD`). There is no per-user auth, so treat the password like a
  shared secret and rotate it if you suspect it has leaked. If `APP_PASSWORD`
  is unset, the app is **open to anyone with the URL** — always set it before
  sharing a deployed link.
- **`/api/generate` accepts attacker-controlled JSON** (including base64
  image data) from anyone who can authenticate. Input is size-capped and
  sanitised in `lib/validate.js` before being handed to `pptxgenjs`/`sharp`.
  If you find a way to make the server read/write outside of its temp
  directory, exhaust memory, or escape the LibreOffice sandbox via a crafted
  PPTX/image, that's a valid report.
- **PDF conversion shells out to LibreOffice** (`soffice`) as a child
  process. Reports about command injection or path traversal through that
  code path (`lib/pdf.js`) are of particular interest.

Issues in third-party dependencies (Express, pptxgenjs, sharp, LibreOffice,
PapaParse, SheetJS) should generally be reported upstream, but feel free to
flag them here too if you're not sure where they belong.
