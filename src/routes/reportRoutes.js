const express = require('express');
const reportController = require('../controllers/reportController');

const router = express.Router();

/**
 * GET /api/districts
 * Obtiene lista de distritos disponibles para una empresa.
 */
router.get('/districts', reportController.getDistricts);

/**
 * GET /api/zones
 * Obtiene lista de zonas configuradas.
 */
router.get('/zones', reportController.getZones);

/**
 * GET /api/zone-report/stores?zone_name=Zona%201&d1=2026-04-13&d2=2026-04-19
 * Lista locaciones de la zona con cambios de nivel.
 */
router.get('/zone-report/stores', reportController.getZoneStores);

/**
 * GET /api/report?district_name=D-11&d1=2026-04-13&d2=2026-04-19
 * Genera un reporte distrital desde un enlace.
 */
router.get('/report', reportController.generateReport);

/**
 * GET /api/report/stores?district_name=D-11&d1=2026-04-13&d2=2026-04-19
 * Lista tiendas del distrito con cambios de nivel.
 */
router.get('/report/stores', reportController.getDistrictStores);

/**
 * GET /api/report/pdf?district_name=D-11&d1=2026-04-13&d2=2026-04-19
 * Descarga un reporte distrital como PDF.
 */
router.get('/report/pdf', reportController.downloadDistrictReportPdf);

/**
 * POST /api/report
 * Genera un reporte basado en parametros.
 * Body: { district_name, d1, d2 }
 */
router.post('/report', reportController.generateReport);

/**
 * POST /api/report/pdf
 * Descarga un reporte distrital como PDF.
 * Body: { district_name, d1, d2 }
 */
router.post('/report/pdf', reportController.downloadDistrictReportPdf);

/**
 * GET /api/zone-report?zone_name=Zona%201&d1=2026-04-13&d2=2026-04-19
 * Genera un reporte de zona desde un enlace.
 */
router.get('/zone-report', reportController.generateZoneReport);

/**
 * POST /api/zone-report
 * Genera un reporte basado en zona.
 * Body: { zone_name, d1, d2 }
 */
router.post('/zone-report', reportController.generateZoneReport);

/**
 * GET /api/zone-report/pdf?zone_name=Zona%201&d1=2026-04-13&d2=2026-04-19
 * Descarga un reporte de zona como PDF.
 */
router.get('/zone-report/pdf', reportController.downloadZoneReportPdf);

/**
 * POST /api/zone-report/pdf
 * Descarga un reporte de zona como PDF.
 * Body: { zone_name, d1, d2 }
 */
router.post('/zone-report/pdf', reportController.downloadZoneReportPdf);

/**
 * GET /api/regional-report?region=nl&d1=2026-04-13&d2=2026-04-19
 * Genera un reporte regional desde un enlace.
 */
router.get('/regional-report', reportController.generateRegionalReport);

/**
 * GET /api/regional-report/pdf?region=nl&d1=2026-04-13&d2=2026-04-19
 * Descarga un reporte regional como PDF.
 */
router.get('/regional-report/pdf', reportController.downloadRegionalReportPdf);

/**
 * POST /api/regional-report
 * Genera un reporte regional.
 * Body: { region, d1, d2 }
 */
router.post('/regional-report', reportController.generateRegionalReport);

/**
 * POST /api/regional-report/pdf
 * Descarga un reporte regional como PDF.
 * Body: { region, d1, d2 }
 */
router.post('/regional-report/pdf', reportController.downloadRegionalReportPdf);

/**
 * GET /api/zone-regional-report?d1=2026-04-13&d2=2026-04-19
 * Genera un reporte regional por zonas desde un enlace.
 */
router.get('/zone-regional-report', reportController.generateZoneRegionalReport);

/**
 * POST /api/zone-regional-report
 * Genera un reporte regional por zonas.
 * Body: { d1, d2 }
 */
router.post('/zone-regional-report', reportController.generateZoneRegionalReport);

/**
 * GET /api/zone-regional-report/pdf?d1=2026-04-13&d2=2026-04-19
 * Descarga un reporte regional por zonas como PDF.
 */
router.get('/zone-regional-report/pdf', reportController.downloadZoneRegionalReportPdf);

/**
 * POST /api/zone-regional-report/pdf
 * Descarga un reporte regional por zonas como PDF.
 * Body: { d1, d2 }
 */
router.post('/zone-regional-report/pdf', reportController.downloadZoneRegionalReportPdf);

/**
 * GET /api/health
 * Verifica que el servidor este activo.
 */
router.get('/health', reportController.healthCheck);

module.exports = router;
