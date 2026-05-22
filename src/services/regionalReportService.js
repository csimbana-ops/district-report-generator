const pool = require('../config/database');
const { REGIONAL_REPORT_QUERY } = require('../config/constants');
const { buildRegionalTimeReport } = require('./timeCheckService');
const { attachDistrictDriveReports } = require('./districtDriveReportService');

const REGIONS = {
  nl: {
    code: 'nl',
    label: 'Nuevo León',
    shortLabel: 'NL',
    minDistrict: 1,
    maxDistrict: 9,
    managers: {
      1: 'Alejandro Gonzalez',
      2: 'Lilian Ibañez',
      3: 'Valery Quiroga',
      4: 'Jesús García',
      5: 'Orlando Cepeda',
      6: 'Vanessa Alonso',
      7: 'Vicente Galván',
      8: 'Adrián Duque',
      9: 'Abraham Palacios',
    },
  },
  coahuila: {
    code: 'coahuila',
    label: 'Coahuila',
    shortLabel: 'Coah',
    minDistrict: 10,
    maxDistrict: 14,
    managers: {
      10: 'David Solorzano',
      11: 'Iván Jimenez',
      12: 'Ana Patricia Guerrero',
      13: 'Teresa Flores',
      14: 'Alejandro Hernandez',
    },
  },
};

async function generateRegionalReport(company_id, d1, d2, region) {
  const selectedRegion = normalizeRegion(region);

  if (!company_id || !d1 || !d2 || !selectedRegion) {
    throw new Error('Parametros faltantes: company_id, d1, d2 y region requeridos');
  }

  const date1 = new Date(d1);
  const date2 = new Date(d2);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
    throw new Error('Fechas invalidas. Formato esperado: YYYY-MM-DD');
  }

  if (date1 > date2) {
    throw new Error('La fecha inicio no puede ser mayor que la fecha fin');
  }

  const allDistricts = await getRegionalRows(company_id, d1, d2);
  const selectedRows = allDistricts.filter((row) => row.region_code === selectedRegion.code);

  const averages = getRegionalAverages(allDistricts);
  const selectedBreakdown = buildLevelBreakdown(selectedRows);
  const regionSummaries = buildRegionSummaries(allDistricts);
  const selectedRegionSummary = regionSummaries.find((item) => item.code === selectedRegion.code) || null;
  const timeChecks = await attachRegionalTimeChecks(company_id, d1, d2, selectedRegion.code, selectedRows);

  const reportData = {
    region: selectedRegion,
    date_range: buildDateRange(d1, d2),
    rows: selectedRows,
    all_rows: allDistricts,
    region_summaries: regionSummaries,
    selected_region_summary: selectedRegionSummary,
    time_checks: timeChecks,
    summary: {
      country_average: averages.country_average,
      nl_average: averages.nl_average,
      coahuila_average: averages.coahuila_average,
      selected_region_average: selectedRegion.code === 'nl' ? averages.nl_average : averages.coahuila_average,
      selected_region_active_stores: sum(selectedRows.map((row) => row.tiendas_activas)),
      selected_region_total_stores: selectedBreakdown.total_stores,
      selected_region_level_breakdown: selectedBreakdown,
      selected_region_districts: selectedRows.length,
      total_districts: allDistricts.length,
    },
  };

  return attachDistrictDriveReports(reportData, d1, d2);
}

async function attachRegionalTimeChecks(company_id, d1, d2, regionCode, selectedRows) {
  try {
    return await buildRegionalTimeReport(company_id, d1, d2, regionCode, selectedRows);
  } catch (error) {
    console.warn('No se pudieron calcular tiempos regionales:', error.message);
    return {
      error: error.message,
      checks: [],
    };
  }
}

function buildRegionSummaries(allDistricts) {
  return Object.values(REGIONS).map((region) => {
    const rows = allDistricts.filter((row) => row.region_code === region.code);
    const breakdown = buildLevelBreakdown(rows);
    const activeStores = sum(rows.map((row) => row.tiendas_activas));
    const inactiveStores = breakdown.out_of_line;
    const totalStores = breakdown.total_stores;

    return {
      code: region.code,
      label: region.label,
      shortLabel: region.shortLabel,
      total_stores: totalStores,
      active_stores: activeStores,
      inactive_stores: inactiveStores,
      active_percent: percent(activeStores, totalStores),
      inactive_percent: percent(inactiveStores, totalStores),
      nivel_promedio: average(rows.map((row) => row.nivel_promedio)),
      puntaje_promedio: average(rows.map((row) => row.puntaje_promedio)),
      districts: rows.length,
      breakdown,
    };
  });
}

async function getRegionalRows(company_id, d1, d2) {
  const result = await pool.query(REGIONAL_REPORT_QUERY, [company_id, d1, d2]);
  return decorateDistrictRows(result.rows, d1, d2);
}

async function getDistrictRegionalSummary(company_id, d1, d2, districtName) {
  const allDistricts = await getRegionalRows(company_id, d1, d2);
  const districtNumber = parseDistrictNumber(districtName);
  const district = allDistricts.find((row) => row.distrito_num === districtNumber) || null;
  const averages = getRegionalAverages(allDistricts);

  return {
    district,
    averages,
  };
}

function getRegionalAverages(allDistricts) {
  return {
    country_average: average(allDistricts.map((row) => row.nivel_promedio)),
    nl_average: average(allDistricts.filter((row) => row.region_code === 'nl').map((row) => row.nivel_promedio)),
    coahuila_average: average(allDistricts.filter((row) => row.region_code === 'coahuila').map((row) => row.nivel_promedio)),
  };
}

function buildLevelBreakdown(rows) {
  return {
    total_stores: sum(rows.map((row) => row.total_tiendas)),
    nivel_1: sum(rows.map((row) => row.nivel_1)),
    nivel_2: sum(rows.map((row) => row.nivel_2)),
    nivel_3: sum(rows.map((row) => row.nivel_3)),
    nivel_4: sum(rows.map((row) => row.nivel_4)),
    out_of_line: sum(rows.map((row) => row.fuera_de_linea)),
  };
}

function decorateDistrictRows(rows, d1, d2) {
  const mappedRows = rows
    .map((row) => {
      const districtNumber = Number(row.distrito_num);
      const region = getRegionByDistrict(districtNumber);
      if (!region) return null;

      const manager = region.managers[districtNumber] || 'Sin responsable';
      const locationGroup = row.location_group || `D-${districtNumber}`;

      return {
        distrito_num: districtNumber,
        location_group: locationGroup,
        distrito: `${locationGroup} (${manager})`,
        manager,
        region_code: region.code,
        region_label: region.shortLabel,
        total_tiendas: Number(row.total_tiendas || 0),
        nivel_1: Number(row.nivel_1 || 0),
        nivel_2: Number(row.nivel_2 || 0),
        nivel_3: Number(row.nivel_3 || 0),
        nivel_4: Number(row.nivel_4 || 0),
        fuera_de_linea: Number(row.fuera_de_linea || 0),
        tiendas_activas: Number(row.tiendas_activas || 0),
        nivel_promedio: toNumber(row.nivel_promedio),
        servicio_promedio: toNumber(row.servicio_promedio),
        apariencia_promedio: toNumber(row.apariencia_promedio),
        preparaciones_promedio: toNumber(row.preparaciones_promedio),
        procesos_generales_promedio: toNumber(row.procesos_generales_promedio),
        puntaje_promedio: toNumber(row.puntaje_promedio),
        informe_url: `/api/report?district_name=${encodeURIComponent(locationGroup)}&d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`,
      };
    })
    .filter(Boolean);

  assignRanking(mappedRows, null, 'country_rank', 'country_rank_total');
  assignRanking(
    mappedRows.filter((row) => row.region_code === 'nl'),
    null,
    'regional_rank',
    'regional_rank_total'
  );
  assignRanking(
    mappedRows.filter((row) => row.region_code === 'coahuila'),
    null,
    'regional_rank',
    'regional_rank_total'
  );

  return mappedRows;
}

function assignRanking(rows, _scope, rankKey, totalKey) {
  const total = rows.length;
  const sorted = [...rows].sort((a, b) => {
    const levelDiff = sortNumberDesc(a.nivel_promedio, b.nivel_promedio);
    if (levelDiff !== 0) return levelDiff;

    const scoreDiff = sortNumberDesc(a.puntaje_promedio, b.puntaje_promedio);
    if (scoreDiff !== 0) return scoreDiff;

    return a.distrito_num - b.distrito_num;
  });

  sorted.forEach((row, index) => {
    row[rankKey] = index + 1;
    row[totalKey] = total;
    row[`${rankKey}_label`] = `(${index + 1}/${total})`;
  });
}

function normalizeRegion(value) {
  const text = String(value || '').trim().toLowerCase();

  if (['nl', 'nuevo leon', 'nuevo león', 'nuevoleon'].includes(text)) {
    return REGIONS.nl;
  }

  if (['coahuila', 'coah', 'coahuilla'].includes(text)) {
    return REGIONS.coahuila;
  }

  return null;
}

function parseDistrictNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function getRegionByDistrict(districtNumber) {
  if (districtNumber >= REGIONS.nl.minDistrict && districtNumber <= REGIONS.nl.maxDistrict) {
    return REGIONS.nl;
  }

  if (districtNumber >= REGIONS.coahuila.minDistrict && districtNumber <= REGIONS.coahuila.maxDistrict) {
    return REGIONS.coahuila;
  }

  return null;
}

function sortNumberDesc(a, b) {
  const safeA = Number.isFinite(a) ? a : -Infinity;
  const safeB = Number.isFinite(b) ? b : -Infinity;
  return safeB - safeA;
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return null;

  return roundTo(numbers.reduce((total, value) => total + value, 0) / numbers.length, 2);
}

function percent(value, total) {
  const safeTotal = Number(total || 0);
  if (!safeTotal) return 0;
  return roundTo((Number(value || 0) * 100) / safeTotal, 1);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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
  generateRegionalReport,
  getDistrictRegionalSummary,
  getRegionalRows,
  normalizeRegion,
};
