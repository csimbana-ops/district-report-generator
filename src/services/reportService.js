const pool = require('../config/database');
const { REPORT_QUERY } = require('../config/constants');
const { attachCashierReports } = require('./cashierReportService');
const { getDistrictRegionalSummary } = require('./regionalReportService');
const { buildTimeCheckReport } = require('./timeCheckService');

/**
 * Genera el reporte ejecutando el query SQL y procesando los datos.
 * @param {number} company_id - ID de la empresa
 * @param {string} d1 - Fecha de inicio (YYYY-MM-DD)
 * @param {string} d2 - Fecha de fin (YYYY-MM-DD)
 * @param {string} district_name - Nombre del distrito/mercado
 * @returns {Promise<Object>} Datos procesados del reporte
 */
async function generateReport(company_id, d1, d2, district_name) {
  try {
    const districtName = typeof district_name === 'string' ? district_name.trim() : '';

    if (!company_id || !d1 || !d2 || !districtName) {
      throw new Error('Parametros faltantes: company_id, d1, d2 y district_name requeridos');
    }

    const date1 = new Date(d1);
    const date2 = new Date(d2);
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      throw new Error('Fechas invalidas. Formato esperado: YYYY-MM-DD');
    }

    if (date1 > date2) {
      throw new Error('La fecha inicio no puede ser mayor que la fecha fin');
    }

    const result = await pool.query(REPORT_QUERY, [company_id, d1, d2, districtName]);
    const stores = result.rows;

    if (stores.length === 0) {
      return {
        district: {
          name: districtName,
          date_range: buildDateRange(d1, d2),
          total_stores: 0,
          level_breakdown: {
            nivel_1: 0,
            nivel_2: 0,
            nivel_3: 0,
            nivel_4: 0,
            out_of_line: 0,
          },
        },
        stores: [],
        out_of_line: [],
        all_stores: [],
      };
    }

    const processedData = processReportData(stores, company_id, d1, d2, districtName);
    await attachDistrictRegionalSummary(processedData, company_id, d1, d2, districtName);
    await attachTimeChecks(processedData, company_id, d1, d2, districtName);
    return attachCashierReports(processedData, d1, d2, districtName);
  } catch (error) {
    console.error('Error en generateReport:', error);
    throw error;
  }
}

async function getDistrictStores(company_id, d1, d2, district_name) {
  const districtName = typeof district_name === 'string' ? district_name.trim() : '';
  if (!company_id || !d1 || !d2 || !districtName) {
    throw new Error('Parametros faltantes: company_id, d1, d2 y district_name requeridos');
  }

  const result = await pool.query(REPORT_QUERY, [company_id, d1, d2, districtName]);
  const rows = result.rows || [];

  return rows
    .map((row) => {
      const current = toNumber(row.nivel);
      const previous = toNumber(row.nivel_anterior);
      const hasAlert = /alert|desc/i.test(String(row.status || ''));
      let change = 'same';

      if (Number.isFinite(current) && Number.isFinite(previous) && current !== previous) {
        // En este reporte, nivel 1 es mejor que nivel 4.
        change = current < previous ? 'up' : 'down';
      } else if (hasAlert) {
        change = 'alert';
      }

      return {
        location_id: row.location_id,
        location: row.location,
        nivel: row.nivel ?? 'N/A',
        nivel_anterior: row.nivel_anterior ?? null,
        change,
        has_alerta_descenso: hasAlert,
      };
    })
    .sort((a, b) => String(a.location).localeCompare(String(b.location), 'es'));
}

async function attachTimeChecks(reportData, company_id, d1, d2, districtName) {
  try {
    reportData.time_checks = await buildTimeCheckReport(company_id, d1, d2, districtName, reportData.all_stores);
  } catch (error) {
    console.warn('No se pudieron calcular tiempos operativos:', error.message);
    reportData.time_checks = {
      summary_rows: [],
      store_rows: [],
      error: error.message,
    };
  }
}

async function attachDistrictRegionalSummary(reportData, company_id, d1, d2, districtName) {
  try {
    const regionalSummary = await getDistrictRegionalSummary(company_id, d1, d2, districtName);
    const district = regionalSummary.district;

    reportData.district.regional_summary = {
      nivel_promedio: district?.nivel_promedio ?? null,
      country_average: regionalSummary.averages.country_average,
      regional_average: getRegionalAverage(regionalSummary.averages, district?.region_code),
      country_rank_label: district?.country_rank_label || 'N/A',
      regional_rank_label: district?.regional_rank_label || 'N/A',
      region_label: district?.region_label || '',
      region_name: district?.region_code === 'nl' ? 'Nuevo León' : district?.region_code === 'coahuila' ? 'Coahuila' : '',
    };
  } catch (error) {
    console.warn('No se pudo calcular resumen regional del distrito:', error.message);
    reportData.district.regional_summary = {
      nivel_promedio: null,
      country_average: null,
      regional_average: null,
      country_rank_label: 'N/A',
      regional_rank_label: 'N/A',
      region_label: '',
      region_name: '',
    };
  }
}

function getRegionalAverage(averages, regionCode) {
  if (regionCode === 'nl') return averages.nl_average;
  if (regionCode === 'coahuila') return averages.coahuila_average;
  return null;
}

/**
 * Procesa los datos del query para generar la estructura del reporte.
 * @param {Array} stores - Datos crudos del query
 * @param {number} company_id - ID de la empresa
 * @param {string} d1 - Fecha de inicio
 * @param {string} d2 - Fecha de fin
 * @param {string} district_name - Nombre del distrito/mercado
 * @returns {Object} Datos procesados
 */
function processReportData(stores, company_id, d1, d2, district_name) {
  const storesWithReport = [];
  const storesOutOfLine = [];

  const levelCounts = {
    nivel_1: 0,
    nivel_2: 0,
    nivel_3: 0,
    nivel_4: 0,
    out_of_line: 0,
  };

  const districtName = district_name || stores[0]?.location_group || `Mercado ${company_id}`;

  stores.forEach((store) => {
    const isOutOfLine = store.informe_url === null || hasAllScoreCategoriesAtZero(store);
    const storeData = {
      location_id: store.location_id,
      location: store.location,
      nivel: store.nivel || 'N/A',
      nivel_anterior: store.nivel_anterior ?? null,
      location_group: store.location_group,
      servicio: store.servicio ?? 'N/A',
      apariencia: store.apariencia ?? 'N/A',
      preparaciones: store.preparaciones ?? 'N/A',
      proc_gen: store.proc_gen ?? 'N/A',
      puntuacion: store.puntuacion ?? 'N/A',
      informe_url: store.informe_url,
      report_mid: store.report_mid,
      report_name: store.report_name,
      status: store.status,
      has_report: !isOutOfLine,
      is_out_of_line: isOutOfLine,
    };

    if (isOutOfLine) {
      storesOutOfLine.push(storeData);
      levelCounts.out_of_line++;
      return;
    }

    storesWithReport.push(storeData);

    if (store.nivel) {
      const levelKey = `nivel_${store.nivel}`;
      if (Object.prototype.hasOwnProperty.call(levelCounts, levelKey)) {
        levelCounts[levelKey]++;
      }
    }
  });

  storesWithReport.sort(compareStores);
  storesOutOfLine.sort(compareStores);

  const allStores = [...storesWithReport, ...storesOutOfLine];
  const totalStores = storesWithReport.length + storesOutOfLine.length;

  return {
    district: {
      name: districtName,
      date_range: buildDateRange(d1, d2),
      total_stores: totalStores,
      level_breakdown: levelCounts,
    },
    stores: storesWithReport,
    out_of_line: storesOutOfLine,
    all_stores: allStores,
  };
}

function hasAllScoreCategoriesAtZero(store) {
  return ['servicio', 'apariencia', 'preparaciones', 'proc_gen']
    .every((key) => toNumber(store[key]) === 0);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Obtiene lista de distritos disponibles para una empresa.
 * @param {number} company_id - ID de la empresa
 * @returns {Promise<Array>} Lista de distritos con sus detalles
 */
async function getDistricts(company_id) {
  try {
    if (!company_id) {
      throw new Error('company_id requerido');
    }

    const query = `
      SELECT
        lg.group_name AS id,
        lg.group_name AS name,
        COUNT(DISTINCT l.id)::int AS total_locations
      FROM public.location_group lg
      JOIN public.location l ON l.id = lg.location_id
      WHERE l.company_id = $1
        AND lg.group_name IS NOT NULL
      GROUP BY lg.group_name
      ORDER BY
        NULLIF(regexp_replace(lg.group_name, '\\D', '', 'g'), '')::int NULLS LAST,
        lg.group_name
    `;

    const result = await pool.query(query, [company_id]);
    return result.rows || [];
  } catch (error) {
    console.error('Error en getDistricts:', error);
    throw error;
  }
}

function compareStores(a, b) {
  const nivelA = parseInt(a.nivel, 10);
  const nivelB = parseInt(b.nivel, 10);
  const safeNivelA = Number.isFinite(nivelA) ? nivelA : 999;
  const safeNivelB = Number.isFinite(nivelB) ? nivelB : 999;

  if (safeNivelA !== safeNivelB) {
    return safeNivelA - safeNivelB;
  }

  const scoreA = parseFloat(a.puntuacion);
  const scoreB = parseFloat(b.puntuacion);
  const safeScoreA = Number.isFinite(scoreA) ? scoreA : -1;
  const safeScoreB = Number.isFinite(scoreB) ? scoreB : -1;

  if (safeScoreA !== safeScoreB) {
    return safeScoreB - safeScoreA;
  }

  return String(a.location || '').localeCompare(String(b.location || ''), 'es');
}

function buildDateRange(start, end) {
  return {
    start,
    end,
    label: formatPeriodLabel(start, end),
  };
}

function formatPeriodLabel(start, end) {
  const startParts = parseDateParts(start);
  const endParts = parseDateParts(end);

  if (!startParts || !endParts) {
    return `${start} - ${end}`;
  }

  if (startParts.year === endParts.year) {
    return `${startParts.day} ${startParts.monthName} - ${endParts.day} ${endParts.monthName}, ${endParts.year}`;
  }

  return `${startParts.day} ${startParts.monthName}, ${startParts.year} - ${endParts.day} ${endParts.monthName}, ${endParts.year}`;
}

function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

module.exports = {
  generateReport,
  processReportData,
  getDistricts,
  getDistrictStores,
};
