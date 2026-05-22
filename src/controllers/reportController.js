const { generateReport, getDistricts, getDistrictStores } = require('../services/reportService');
const { generateRegionalReport: buildRegionalReport } = require('../services/regionalReportService');
const { generateZoneRegionalReport: buildZoneRegionalReport } = require('../services/zoneReportService');
const { generateSingleZoneReport, getZones, getZoneStores } = require('../services/singleZoneReportService');
const { renderHTML, renderRegionalHTML } = require('../services/renderService');
const { renderPdfFromHtml } = require('../services/pdfService');
const path = require('path');

const DEFAULT_COMPANY_ID = 20;

/**
 * Controlador para generar reportes.
 */
const reportController = {
  /**
   * Genera un reporte y retorna HTML.
   */
  async generateReport(req, res) {
    try {
      const { html } = await buildDistrictReportHtml(req);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error('Error en generateReport:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el reporte',
        message: error.message,
      });
    }
  },

  /**
   * Genera un reporte distrital y retorna PDF descargable.
   */
  async downloadDistrictReportPdf(req, res) {
    try {
      const { html, reportData, selectedDistrict } = await buildDistrictReportHtml(req);
      const pdfBuffer = await renderPdfFromHtml(html);
      const fileName = buildPdfFileName(selectedDistrict, reportData?.district?.regional_summary?.region_name);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error en downloadDistrictReportPdf:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el PDF del reporte',
        message: error.message,
      });
    }
  },

  /**
   * Genera un reporte regional y retorna HTML.
   */
  async generateRegionalReport(req, res) {
    try {
      const { html } = await buildRegionalReportHtml(req);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error('Error en generateRegionalReport:', error);
      res.status(500).json({
        error: 'Error generando el reporte regional',
        message: error.message,
      });
    }
  },

  /**
   * Genera un reporte regional y retorna PDF descargable.
   */
  async downloadRegionalReportPdf(req, res) {
    try {
      const { html, reportData } = await buildRegionalReportHtml(req);
      const pdfBuffer = await renderPdfFromHtml(html);
      const fileName = buildPdfFileName('Regional', reportData?.region?.label);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error en downloadRegionalReportPdf:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el PDF regional',
        message: error.message,
      });
    }
  },

  /**
   * Genera un reporte regional de zonas y retorna HTML.
   */
  async generateZoneRegionalReport(req, res) {
    try {
      const { html } = await buildZoneRegionalReportHtml(req);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error('Error en generateZoneRegionalReport:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el reporte regional de zonas',
        message: error.message,
      });
    }
  },

  /**
   * Genera un reporte regional de zonas y retorna PDF descargable.
   */
  async downloadZoneRegionalReportPdf(req, res) {
    try {
      const { html, reportData } = await buildZoneRegionalReportHtml(req);
      const pdfBuffer = await renderPdfFromHtml(html);
      const fileName = buildPdfFileName('Regional', reportData?.region?.label);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error en downloadZoneRegionalReportPdf:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el PDF regional de zonas',
        message: error.message,
      });
    }
  },

  async getZones(req, res) {
    res.json({
      zones: getZones(),
    });
  },

  async generateZoneReport(req, res) {
    try {
      const { html } = await buildZoneReportHtml(req);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error('Error en generateZoneReport:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el reporte de zona',
        message: error.message,
      });
    }
  },

  async getZoneStores(req, res) {
    try {
      const input = req.method === 'GET' ? req.query : req.body;
      const { d1, d2, zone_name, zone_id } = input;
      const selectedZone = String(zone_name || zone_id || '').trim();

      if (!d1 || !d2 || !selectedZone) {
        return res.status(400).json({
          error: 'Parametros faltantes: d1, d2 y zone_name requeridos',
        });
      }

      const stores = await getZoneStores(d1, d2, selectedZone);
      res.json({
        zone_name: selectedZone,
        d1,
        d2,
        stores,
      });
    } catch (error) {
      console.error('Error en getZoneStores:', error);
      res.status(500).json({
        error: 'Error obteniendo locaciones de la zona',
        message: error.message,
      });
    }
  },

  async downloadZoneReportPdf(req, res) {
    try {
      const { html, selectedZone } = await buildZoneReportHtml(req);
      const pdfBuffer = await renderPdfFromHtml(html);
      const fileName = buildPdfFileName(selectedZone, 'Zonas');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error en downloadZoneReportPdf:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Error generando el PDF de zona',
        message: error.message,
      });
    }
  },

  /**
   * Health check endpoint.
   */
  async healthCheck(req, res) {
    res.json({
      status: 'OK',
      message: 'Servidor de reportes activo',
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Obtiene lista de distritos disponibles.
   */
  async getDistricts(req, res) {
    try {
      const { company_id } = req.query;
      const effectiveCompanyId = parseInt(company_id || DEFAULT_COMPANY_ID, 10);

      if (isNaN(effectiveCompanyId)) {
        return res.status(400).json({
          error: 'company_id debe ser un numero valido',
        });
      }

      const districts = await getDistricts(effectiveCompanyId);

      res.json({
        company_id: effectiveCompanyId,
        districts,
      });
    } catch (error) {
      console.error('Error en getDistricts:', error);
      res.status(500).json({
        error: 'Error obteniendo distritos',
        message: error.message,
      });
    }
  },

  /**
   * GET /api/report/stores?district_name=D-11&d1=2026-04-13&d2=2026-04-19
   * Lista tiendas del distrito con cambios de nivel.
   */
  async getDistrictStores(req, res) {
    try {
      const input = req.method === 'GET' ? req.query : req.body;
      const { company_id, d1, d2, district_id, district_name } = input;
      const selectedDistrict = String(district_name || district_id || '').trim();
      const effectiveCompanyId = parseInt(company_id || DEFAULT_COMPANY_ID, 10);

      if (!d1 || !d2 || !selectedDistrict) {
        return res.status(400).json({
          error: 'Parametros faltantes: d1, d2 y district_name requeridos',
        });
      }

      if (isNaN(effectiveCompanyId)) {
        return res.status(400).json({
          error: 'company_id debe ser un numero valido',
        });
      }

      const stores = await getDistrictStores(effectiveCompanyId, d1, d2, selectedDistrict);
      res.json({
        company_id: effectiveCompanyId,
        district_name: selectedDistrict,
        d1,
        d2,
        stores,
      });
    } catch (error) {
      console.error('Error en getDistrictStores:', error);
      res.status(500).json({
        error: 'Error obteniendo tiendas del distrito',
        message: error.message,
      });
    }
  },
};

async function buildDistrictReportHtml(req) {
  const reportPayload = await buildDistrictReportData(req);
  const logoPath = path.join(process.cwd(), process.env.IMG_PATH || './img');
  const html = await renderHTML(reportPayload.reportData, logoPath, reportPayload.effectiveCompanyId, {
    store_changes: reportPayload.store_changes,
  });

  return {
    ...reportPayload,
    html,
  };
}

async function buildDistrictReportData(req) {
  const input = req.method === 'GET' ? req.query : req.body;
  const { company_id, d1, d2, district_id, district_name, store_changes } = input;
  const selectedDistrict = String(district_name || district_id || '').trim();
  const effectiveCompanyId = parseInt(company_id || DEFAULT_COMPANY_ID, 10);

  if (!d1 || !d2 || !selectedDistrict) {
    const error = new Error('Parametros faltantes: d1, d2 y district_name requeridos');
    error.statusCode = 400;
    throw error;
  }

  if (isNaN(effectiveCompanyId)) {
    const error = new Error('company_id debe ser un numero valido');
    error.statusCode = 400;
    throw error;
  }

  const reportData = await generateReport(
    effectiveCompanyId,
    d1,
    d2,
    selectedDistrict
  );

  return {
    reportData,
    d1,
    d2,
    selectedDistrict,
    effectiveCompanyId,
    store_changes: store_changes && typeof store_changes === 'object' ? store_changes : null,
  };
}

async function buildRegionalReportHtml(req) {
  const input = req.method === 'GET' ? req.query : req.body;
  const { company_id, d1, d2, region } = input;
  const effectiveCompanyId = parseInt(company_id || DEFAULT_COMPANY_ID, 10);

  if (!d1 || !d2 || !region) {
    const error = new Error('Parametros faltantes: d1, d2 y region requeridos');
    error.statusCode = 400;
    throw error;
  }

  if (isNaN(effectiveCompanyId)) {
    const error = new Error('company_id debe ser un numero valido');
    error.statusCode = 400;
    throw error;
  }

  const reportData = await buildRegionalReport(
    effectiveCompanyId,
    d1,
    d2,
    region
  );
  const logoPath = path.join(process.cwd(), process.env.IMG_PATH || './img');
  const html = await renderRegionalHTML(reportData, logoPath, effectiveCompanyId);

  return {
    reportData,
    effectiveCompanyId,
    html,
  };
}

async function buildZoneRegionalReportHtml(req) {
  const input = req.method === 'GET' ? req.query : req.body;
  const { d1, d2, company_id } = input;
  const effectiveCompanyId = parseInt(company_id || DEFAULT_COMPANY_ID, 10);

  if (!d1 || !d2) {
    const error = new Error('Parametros faltantes: d1 y d2 requeridos');
    error.statusCode = 400;
    throw error;
  }

  const reportData = await buildZoneRegionalReport(d1, d2);
  const logoPath = path.join(process.cwd(), process.env.IMG_PATH || './img');
  const html = await renderRegionalHTML(reportData, logoPath, effectiveCompanyId);

  return {
    reportData,
    effectiveCompanyId,
    html,
  };
}

async function buildZoneReportHtml(req) {
  const input = req.method === 'GET' ? req.query : req.body;
  const { d1, d2, zone_name, zone_id, company_id, store_changes } = input;
  const selectedZone = String(zone_name || zone_id || '').trim();
  const effectiveCompanyId = parseInt(company_id || DEFAULT_COMPANY_ID, 10);

  if (!d1 || !d2 || !selectedZone) {
    const error = new Error('Parametros faltantes: d1, d2 y zone_name requeridos');
    error.statusCode = 400;
    throw error;
  }

  const reportData = await generateSingleZoneReport(d1, d2, selectedZone);
  const logoPath = path.join(process.cwd(), process.env.IMG_PATH || './img');
  const html = await renderHTML(reportData, logoPath, effectiveCompanyId, {
    store_changes: store_changes && typeof store_changes === 'object' ? store_changes : null,
  });

  return {
    reportData,
    effectiveCompanyId,
    selectedZone,
    html,
  };
}

function buildPdfFileName(districtName, regionName) {
  const district = sanitizeFileNamePart(districtName || 'Distrito');
  const region = sanitizeFileNamePart(regionName || '');
  return `${[district, region].filter(Boolean).join(' ')}.pdf`;
}

function sanitizeFileNamePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = reportController;
