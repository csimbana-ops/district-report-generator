const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
let puppeteer;

const DEFAULT_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function renderPdfFromHtml(html) {
  if (canUsePuppeteer()) {
    return renderPdfWithPuppeteer(html);
  }

  const executablePath = findBrowserExecutable();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'district-report-pdf-'));
  const htmlPath = path.join(tempDir, 'report.html');
  const pdfPath = path.join(tempDir, 'report.pdf');
  const userDataDir = path.join(tempDir, 'chrome-profile');

  try {
    await fs.writeFile(htmlPath, preparePrintableHtml(html), 'utf8');
    await fs.mkdir(userDataDir, { recursive: true });

    await execFileAsync(executablePath, [
      '--headless',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      '--print-to-pdf-no-header',
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    const pdfBuffer = await fs.readFile(pdfPath);
    if (pdfBuffer.length === 0) {
      throw new Error('Chrome genero un PDF vacio');
    }

    return pdfBuffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderPdfWithPuppeteer(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(preparePrintableHtml(html), {
      waitUntil: ['load', 'networkidle0'],
      timeout: 120000,
    });

    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0in',
        right: '0in',
        bottom: '0in',
        left: '0in',
      },
    });
  } finally {
    await browser.close();
  }
}

function canUsePuppeteer() {
  try {
    puppeteer = puppeteer || require('puppeteer');
    return true;
  } catch (error) {
    return false;
  }
}

function preparePrintableHtml(html) {
  const printStyles = `
    <style>
      @page {
        /* 8.5" x 11" (US Letter) */
        size: 8.5in 11in;
        margin: 0;
      }

      html,
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    </style>
  `;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${printStyles}</head>`);
  }

  return `${printStyles}${html}`;
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    ...DEFAULT_CHROME_PATHS,
  ].filter(Boolean);

  const executablePath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!executablePath) {
    throw new Error('No se encontro Chrome o Edge para generar el PDF. Configura CHROME_PATH en .env.');
  }

  return executablePath;
}

module.exports = {
  renderPdfFromHtml,
};
