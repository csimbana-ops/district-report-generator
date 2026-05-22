const https = require('https');

const DEFAULT_DRIVE_FOLDER_ID = '1s-XmNBeVdUzGTZ4-M-vs7zBT2RLoZWse';
const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders';
const DRIVE_EMBEDDED_FOLDER_URL = 'https://drive.google.com/embeddedfolderview?id=';
const cache = new Map();

async function attachCashierReports(reportData, d1, d2, districtName, options = {}) {
  try {
    const cashierReports = await getCashierReportsForPeriod(d1, d2, options);
    const districtKey = normalizeDistrict(districtName);

    reportData.all_stores.forEach((store) => {
      const match = findReportForStore(store, cashierReports, districtKey);
      if (match) {
        store.cashier_report_name = match.fileName;
        store.cashier_store_name = match.storeName;
        store.cashier_report_url = match.url;
      }
    });

    reportData.cashier_reports = {
      available: cashierReports.length,
      period_folder: formatDrivePeriodFolder(d1, d2),
    };
  } catch (error) {
    console.warn('No se pudieron cargar detalles de cajeros:', error.message);
    reportData.cashier_reports = {
      available: 0,
      period_folder: formatDrivePeriodFolder(d1, d2),
      error: error.message,
    };
  }

  return reportData;
}

async function getCashierReportsForPeriod(d1, d2, options = {}) {
  const rootFolderId = getRootFolderId(options);
  const periodFolderName = formatDrivePeriodFolder(d1, d2);
  const cacheKey = `${rootFolderId}:${periodFolderName}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const promise = loadCashierReports(rootFolderId, periodFolderName);
  cache.set(cacheKey, promise);
  return promise;
}

async function loadCashierReports(rootFolderId, periodFolderName) {
  const rootHtml = await fetchDriveFolderHtml(rootFolderId);
  const folders = parseDriveItems(rootHtml)
    .filter((item) => item.mimeType === 'application/vnd.google-apps.folder');
  const periodFolder = folders.find((folder) => {
    return normalizePeriodFolderName(folder.name) === normalizePeriodFolderName(periodFolderName);
  });

  if (!periodFolder) {
    return [];
  }

  const periodHtml = await fetchDriveFolderHtml(periodFolder.id);
  const files = parseDriveItems(periodHtml)
    .filter((item) => item.mimeType === 'application/pdf')
    .map(parseCashierReportFile)
    .filter(Boolean);

  return files;
}

function parseCashierReportFile(file) {
  const match = /^Promedio Cajero\s+(.+?)\s*-\s*[DZ]-?(\d+)\.pdf$/i.exec(file.name);
  if (!match) return null;

  return {
    id: file.id,
    fileName: file.name,
    storeName: match[1].trim(),
    district: `D-${match[2]}`,
    districtKey: match[2],
    url: `https://drive.google.com/file/d/${file.id}/view`,
  };
}

function findReportForStore(store, cashierReports, districtKey) {
  const storeKey = normalizeText(store.location);
  return cashierReports.find((report) => {
    return report.districtKey === districtKey && normalizeText(report.storeName) === storeKey;
  });
}

function parseDriveItems(html) {
  const embeddedItems = parseEmbeddedDriveItems(html);
  if (embeddedItems.length > 0) {
    return embeddedItems;
  }

  const itemsById = new Map();
  const nameRegex = /&quot;([^&]+?)&quot;,null,true/g;
  let match;

  while ((match = nameRegex.exec(html)) !== null) {
    const name = decodeHtml(match[1]);
    const before = html.slice(Math.max(0, match.index - 2500), match.index);
    const headers = [...before.matchAll(/\[\[null,&quot;([A-Za-z0-9_-]{20,})&quot;\],null,null,null,&quot;([^&]+)&quot;/g)];

    if (headers.length === 0) {
      continue;
    }

    const [id, mimeType] = headers[headers.length - 1].slice(1);
    if (!itemsById.has(id)) {
      itemsById.set(id, {
        id,
        mimeType: decodeHtml(mimeType),
        name,
      });
    }
  }

  return [...itemsById.values()];
}

function parseEmbeddedDriveItems(html) {
  const items = [];
  const entryRegex = /<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
  let match;

  while ((match = entryRegex.exec(html)) !== null) {
    const id = match[1];
    const href = decodeHtml(match[2]);
    const name = stripHtml(decodeHtml(match[3]));
    let mimeType = null;

    if (href.includes('/drive/folders/')) {
      mimeType = 'application/vnd.google-apps.folder';
    } else if (href.includes('/file/d/') || /\.pdf$/i.test(name)) {
      mimeType = 'application/pdf';
    }

    if (mimeType) {
      items.push({ id, mimeType, name });
    }
  }

  return items;
}

function fetchDriveFolderHtml(folderId) {
  return fetchText(`${DRIVE_EMBEDDED_FOLDER_URL}${folderId}#list`);
}

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    }, (response) => {
      const statusCode = response.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location && redirectsLeft > 0) {
        response.resume();
        resolve(fetchText(response.headers.location, redirectsLeft - 1));
        return;
      }

      if (statusCode >= 400) {
        response.resume();
        reject(new Error(`Drive respondio con estado ${statusCode}`));
        return;
      }

      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => resolve(data));
    });

    request.on('error', reject);
    request.setTimeout(20000, () => {
      request.destroy(new Error('Tiempo de espera agotado consultando Drive'));
    });
  });
}

function formatDrivePeriodFolder(d1, d2) {
  const start = parseDateParts(d1);
  const end = parseDateParts(d2);

  if (!start || !end) {
    return `${d1} - ${d2}`;
  }

  if (start.year === end.year) {
    return `${start.monthName} ${start.day} - ${end.monthName} ${end.day}, ${end.year}`;
  }

  return `${start.monthName} ${start.day}, ${start.year} - ${end.monthName} ${end.day}, ${end.year}`;
}

function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return {
    year,
    month,
    day,
    monthName: months[month - 1],
  };
}

function getRootFolderId(options = {}) {
  return extractDriveFolderId(
    options.rootFolderId ||
    options.rootFolderUrl ||
    process.env.CASHIER_REPORTS_DRIVE_FOLDER_ID ||
    process.env.CASHIER_REPORTS_DRIVE_FOLDER_URL ||
    DEFAULT_DRIVE_FOLDER_ID
  );
}

function extractDriveFolderId(value) {
  const text = String(value || '').trim();
  const folderMatch = /folders\/([A-Za-z0-9_-]+)/.exec(text);
  return folderMatch ? folderMatch[1] : text;
}

function normalizeDistrict(value) {
  const match = String(value || '').match(/\d+/);
  return match ? match[0] : '';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function normalizePeriodFolderName(value) {
  return normalizeText(value)
    .replace(/\b0+(\d)\b/g, '$1');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ');
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

module.exports = {
  attachCashierReports,
  getCashierReportsForPeriod,
  formatDrivePeriodFolder,
  parseDriveItems,
};
