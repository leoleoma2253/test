# Sales Message Scraper

Reads a Google Sheet (published as CSV) of product URLs, opens each with Puppeteer, extracts the
"kaching-bundles-product" sales total, and prints results to the GitHub Actions logs.

## Setup

1. Prepare a Google Sheet with one URL per row in column A.
2. File → Share → Publish to web → select the sheet tab → CSV. Copy the CSV link.
3. In GitHub repo: Settings → Secrets and variables → Actions → New repository secret
   - Name: SHEET_CSV_URL
   - Value: (your CSV link)
4. Run the workflow (Actions → "Sales Message Scraper" → "Run workflow") or wait for the hourly schedule.

## Local dev (optional)

- `cp config.js.sample config.js` and set your CSV URL.
- `npm ci`
- `npm start`
