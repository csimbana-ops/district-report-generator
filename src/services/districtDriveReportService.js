const https = require('https');
const { parseDriveItems } = require('./cashierReportService');

const DEFAULT_DISTRICT_REPORTS_FOLDER_ID = '1j887H00335d3wsLUghEQmtwlMdHIl5cc';
const DRIVE_EMBEDDED_FOLDER_URL = 'https://drive.google.com/embeddedfolderview?id=';
const cache = new Map();

async function attachDistrictDriveReports(reportData, d1, d2) {
  try {
    const reports = await getDistrictDriveReportsForPeriod(d1, d2);

    reportData.rows.forEach((row) => {
      const match = findReportForDistrict(row, reports);
      if (match) {
        row.informe_url = match.url;
        row.informe_name = match.fileName;
        row.informe_source = 'drive';
      }
    });

    reportData.district_drive_reports = {
      available: reports.length,
      period_folder: formatDrivePeriodFolder(d1, d2),
    };
  } catch (error) {
    console.warn('No se pudieron cargar reportes distritales de Drive:', error.message);
    reportData.district_drive_reports = {
      available: 0,
      period_folder: formatDrivePeriodFolder(d1, d2),
      error: error.message,
    };
  }

  return reportData;
}

async function getDistrictDriveReportsForPeriod(d1, d2) {
  const rootFolderId = getRootFolderId();
  const periodFolderName = formatDrivePeriodFolder(d1, d2);
  const cacheKey = `${rootFolderId}:${periodFolderName}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const promise = loadDistrictDriveReports(rootFolderId, periodFolderName);
  cache.set(cacheKey, promise);
  return promise;
}

async function loadDistrictDriveReports(rootFolderId, periodFolderName) {
  const rootHtml = await fetchDriveFolderHtml(rootFolderId);
  const folders = parseDriveItems(rootHtml)
    .filter((item) => item.mimeType === 'application/vnd.google-apps.folder');
  const periodFolder = folders.find((folder) => {
    return normalizeText(folder.name) === normalizeText(periodFolderName);
  });

  if (!periodFolder) {
    return [];
  }

  const periodHtml = await fetchDriveFolderHtml(periodFolder.id);
  return parseDriveItems(periodHtml)
    .filter((item) => item.mimeType === 'application/pdf')
    .map(parseDistrictReportFile)
    .filter(Boolean);
}

function parseDistrictReportFile(file) {
  const match = /^D-?(\d+)\s+(.+?)\.pdf$/i.exec(file.name);
  if (!match) return null;

  return {
    id: file.id,
    fileName: file.name,
    districtNumber: Number(match[1]),
    regionName: match[2].trim(),
    regionKey: normalizeRegion(match[2]),
    url: `https://drive.google.com/file/d/${file.id}/view`,
  };
}

function findReportForDistrict(row, reports) {
  const districtNumber = Number(row.distrito_num);
  const regionKey = normalizeRegion(row.region_label || row.region_code || '');

  return reports.find((report) => {
    if (report.districtNumber !== districtNumber) return false;
    if (!regionKey || !report.regionKey) return true;
    return report.regionKey === regionKey;
  }) || reports.find((report) => report.districtNumber === districtNumber);
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
    return `${d1} ${d2}`;
  }

  return `${start.month}/${start.day} ${end.month}/${end.day}`;
}

function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getRootFolderId() {
  return extractDriveFolderId(
    process.env.DISTRICT_REPORTS_DRIVE_FOLDER_ID ||
    process.env.DISTRICT_REPORTS_DRIVE_FOLDER_URL ||
    DEFAULT_DISTRICT_REPORTS_FOLDER_ID
  );
}

function extractDriveFolderId(value) {
  const text = String(value || '').trim();
  const folderMatch = /folders\/([A-Za-z0-9_-]+)/.exec(text);
  return folderMatch ? folderMatch[1] : text;
}

function normalizeRegion(value) {
  const text = normalizeText(value);
  if (text.includes('nuevo leon') || text === 'nl') return 'nl';
  if (text.includes('coahuila') || text === 'coah') return 'coahuila';
  return text;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

module.exports = {
  attachDistrictDriveReports,
  getDistrictDriveReportsForPeriod,
  formatDrivePeriodFolder,
};
