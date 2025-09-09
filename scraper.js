import puppeteer from 'puppeteer';

// ---- config (env first, then optional local fallback) ----
let SHEET_CSV_URL = process.env.SHEET_CSV_URL || '';
let NAV_TIMEOUT_MS = 35000;
let SELECT_TIMEOUT_MS = 8000;
let CONCURRENCY = 3;

try {
  const local = await import('./config.js').catch(() => ({}));
  SHEET_CSV_URL ||= local.SHEET_CSV_URL;
  NAV_TIMEOUT_MS = local.NAV_TIMEOUT_MS ?? NAV_TIMEOUT_MS;
  SELECT_TIMEOUT_MS = local.SELECT_TIMEOUT_MS ?? SELECT_TIMEOUT_MS;
  CONCURRENCY = local.CONCURRENCY ?? CONCURRENCY;
} catch {}

if (!SHEET_CSV_URL) {
  console.error('[CFG] Missing SHEET_CSV_URL (set repo secret or config.js).');
  process.exit(1);
}

const log = (...a) => console.log('[SCRAPER]', ...a);

async function fetchCsv(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return text;
}

function parseCsvToUrls(csvText) {
  return csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => !!l && /^https?:\/\//i.test(l));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function extractSalesMessage(page) {
  const data
  const result = await page.evaluate(() => {
    try {
      const kachingElement = document.getElementsByClassName('kaching-bundles-product')[0];
      let salesMessage = '';
      if (kachingElement) {
        data = JSON.parse(kachingElement.innerHTML);
        const sales = data["variants"].reduce((prev, el) => (el["inventoryQuantity"] * -1) + prev, 0);
        salesMessage = sales;
      } else {
        salesMessage = "No sales data found.";
      }
      console.log("==============================================###############Sales Message:", data);
      return { ok: true, salesMessage };
    } catch (error) {
      console.error('Error checking sales:', error && (error.stack || error.message || String(error)));
      return { ok: false, error: String(error) };
    }
  });
  return result;
}

async function processUrl(browser, url) {
  const page = await browser.newPage();
  page.on('console', msg => {
    console.log(`[PAGE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36');
    await page.setViewport({ width: 1366, height: 900 });

    log('Opening:', url);
    await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: NAV_TIMEOUT_MS });

    const res = await extractSalesMessage(page);
    if (res.ok) {
      console.log(`[RESULT] url=${url} salesMessage=${res.salesMessage}`);
    } else {
      console.log(`[RESULT] url=${url} error=${res.error}`);
    }
  } catch (e) {
    console.log(`[RESULT] url=${url} error=${e && (e.stack || e.message || String(e))}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  log('Fetching CSV:', SHEET_CSV_URL);
  const csvText = await fetchCsv(SHEET_CSV_URL);
  const urls = parseCsvToUrls(csvText);

  if (!urls.length) {
    console.error('[CSV] No URLs found. Ensure your sheet is published as CSV with one URL per line.');
    process.exit(2);
  }

  log(`Total URLs: ${urls.length}`);

  // 👉 Sandbox fix for GitHub Actions
  const browser = await puppeteer.launch({
    headless: true, // or 'new'
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const batches = chunk(urls, CONCURRENCY);
    for (const group of batches) {
      await Promise.all(group.map(u => processUrl(browser, u)));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log('Done.');
}

main().catch(err => {
  console.error('[FATAL]', err && (err.stack || err.message || String(err)));
  process.exit(1);
});
