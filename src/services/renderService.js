const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

/**
 * Renderiza el template HTML inyectando los datos del reporte.
 * @param {Object} reportData - Datos del reporte procesados
 * @param {string} logoPath - Ruta de la carpeta de imagenes
 * @param {number} company_id - ID de la empresa
 * @returns {Promise<string>} HTML compilado
 */
async function renderHTML(reportData, logoPath, company_id, options = {}) {
  try {
    const logo = loadLogo(logoPath, company_id);

    const templatePath = path.join(__dirname, '../templates/reportTemplate.html');
    const template = fs.readFileSync(templatePath, 'utf-8');

    return ejs.render(template, {
      district: reportData.district,
      stores: reportData.stores,
      out_of_line: reportData.out_of_line,
      all_stores: reportData.all_stores,
      time_checks: reportData.time_checks,
      logoBase64: logo.logoBase64,
      logoMimeType: logo.logoMimeType,
      logoExists: logo.logoExists,
      company_id,
      store_changes: options.store_changes || null,
    });
  } catch (error) {
    console.error('Error en renderHTML:', error);
    throw error;
  }
}

async function renderRegionalHTML(reportData, logoPath, company_id) {
  try {
    const logo = loadLogo(logoPath, company_id);
    const templatePath = path.join(__dirname, '../templates/regionalReportTemplate.html');
    const template = fs.readFileSync(templatePath, 'utf-8');

    return ejs.render(template, {
      region: reportData.region,
      date_range: reportData.date_range,
      summary: reportData.summary,
      rows: reportData.rows,
      all_rows: reportData.all_rows,
      region_summaries: reportData.region_summaries || [],
      selected_region_summary: reportData.selected_region_summary || null,
      time_checks: reportData.time_checks || null,
      zone_stores: reportData.zone_stores || null,
      entity_label: reportData.entity_label || 'Distrito',
      entity_label_plural: reportData.entity_label_plural || 'Distritos',
      report_eyebrow: reportData.report_eyebrow || 'Resultados regionales',
      report_title: reportData.report_title || `Regi&oacute;n: ${reportData.region.label}`,
      logoBase64: logo.logoBase64,
      logoMimeType: logo.logoMimeType,
      logoExists: logo.logoExists,
      company_id,
    });
  } catch (error) {
    console.error('Error en renderRegionalHTML:', error);
    throw error;
  }
}

function loadLogo(logoPath, company_id) {
  const logoFile = findLogoFile(logoPath, company_id);
  let logoBase64 = null;
  let logoMimeType = 'image/png';
  let logoExists = false;

  if (logoFile) {
    const logoData = fs.readFileSync(logoFile);
    logoBase64 = logoData.toString('base64');
    logoMimeType = getMimeType(logoFile);
    logoExists = true;
  }

  return {
    logoBase64,
    logoMimeType,
    logoExists,
  };
}

function findLogoFile(logoPath, company_id) {
  if (!fs.existsSync(logoPath)) {
    return null;
  }

  const candidates = [
    `${company_id}.png`,
    `${company_id}.jpg`,
    `${company_id}.jpeg`,
    `${company_id}.webp`,
    'LogoLittle.png',
    'logo.png',
    'logo.jpg',
    'logo.jpeg',
    'logo.webp',
  ];

  for (const candidate of candidates) {
    const candidatePath = path.join(logoPath, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  const imageFile = fs.readdirSync(logoPath)
    .find((fileName) => /\.(png|jpe?g|webp)$/i.test(fileName));

  return imageFile ? path.join(logoPath, imageFile) : null;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  return mimeTypes[extension] || 'image/png';
}

/**
 * Formatea un numero como moneda o porcentaje.
 * @param {number} value - Valor a formatear
 * @param {string} type - Tipo de formato ('percentage' o 'number')
 * @returns {string} Valor formateado
 */
function formatValue(value, type = 'number') {
  if (value === null || value === undefined || value === 'N/A') {
    return 'N/A';
  }

  if (type === 'percentage') {
    return `${value}%`;
  }

  return value.toString();
}

module.exports = {
  renderHTML,
  renderRegionalHTML,
  formatValue,
};
