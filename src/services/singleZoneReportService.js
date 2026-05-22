const pool = require('../config/database');
const { ZONE_LOCATION_ROWS } = require('../config/zoneLocations');
const { attachCashierReports } = require('./cashierReportService');
const { getZoneRows } = require('./zoneReportService');
const { buildSingleZoneTimeReport } = require('./zoneTimeService');

const CORALSA_CASHIER_REPORTS_FOLDER_ID = '1s-XmNBeVdUzGTZ4-M-vs7zBT2RLoZWse';
const CORALSA_COMPANY_ID = 31;

async function generateSingleZoneReport(d1, d2, zoneName) {
  const selectedZone = normalizeZoneName(zoneName);
  const locationIds = ZONE_LOCATION_ROWS
    .filter(([name]) => normalizeZoneName(name) === selectedZone)
    .map(([, locationId]) => locationId);

  if (!d1 || !d2 || !selectedZone) {
    throw new Error('Parametros faltantes: d1, d2 y zone_name requeridos');
  }

  if (locationIds.length === 0) {
    throw new Error('Zona no encontrada');
  }

  const date1 = new Date(d1);
  const date2 = new Date(d2);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
    throw new Error('Fechas invalidas. Formato esperado: YYYY-MM-DD');
  }

  if (date1 > date2) {
    throw new Error('La fecha inicio no puede ser mayor que la fecha fin');
  }

  const [result, allZones, timeChecks] = await Promise.all([
    pool.query(buildZoneDetailQuery(), [d1, d2, locationIds]),
    getZoneRows(d1, d2),
    buildSingleZoneTimeReport(d1, d2, selectedZone),
  ]);
  const reportData = processZoneStores(result.rows, selectedZone, d1, d2, buildZoneSummary(allZones, selectedZone));
  reportData.time_checks = timeChecks;
  return attachCashierReports(reportData, d1, d2, selectedZone, {
    rootFolderId: process.env.CORALSA_CASHIER_REPORTS_DRIVE_FOLDER_ID || CORALSA_CASHIER_REPORTS_FOLDER_ID,
  });
}

function buildZoneDetailQuery() {
  return `
    WITH params AS (
      SELECT
        ${CORALSA_COMPANY_ID}::bigint AS company_id,
        $1::DATE AS d1,
        $2::DATE AS d2
    ),
    target_locations AS (
      SELECT
        l.id AS location_id,
        l.name AS location,
        l.company_id,
        l.level AS current_level
      FROM public.location l
      WHERE l.id = ANY($3::text[])
    ),
    target_reports AS (
      SELECT
        r.id AS report_id,
        r.report_mid,
        r.report_name,
        r.location_id,
        r.company_id,
        r.start_date,
        r.end_date,
        r.status,
        ll.level AS location_level
      FROM public.report r
      JOIN params p ON TRUE
      JOIN target_locations tl
        ON tl.location_id = r.location_id
      JOIN public.location_level ll
        ON ll.location_id = r.location_id
       AND p.d1 >= ll.start_date
       AND (ll.end_date IS NULL OR p.d1 <= ll.end_date)
      WHERE r.company_id = p.company_id
        AND r.start_date = p.d1
        AND r.end_date = p.d2
        AND r.location_id IS NOT NULL
    ),
    report_scores AS (
      SELECT
        tr.report_id,
        tr.report_mid,
        tr.report_name,
        tr.location_id,
        tr.company_id,
        tr.status,
        tr.location_level,
        MAX(CASE WHEN cw.category_ordinal = 'Cat1'
          THEN ROUND(((rs.cat1 / 1000.0) / NULLIF(cw.weight, 0)) * 100)
        END) AS servicio,
        MAX(CASE WHEN cw.category_ordinal = 'Cat2'
          THEN ROUND(((rs.cat2 / 1000.0) / NULLIF(cw.weight, 0)) * 100)
        END) AS apariencia,
        MAX(CASE WHEN cw.category_ordinal = 'Cat3'
          THEN ROUND(((rs.cat3 / 1000.0) / NULLIF(cw.weight, 0)) * 100)
        END) AS preparaciones,
        MAX(CASE WHEN cw.category_ordinal = 'Cat4'
          THEN ROUND(((rs.cat4 / 1000.0) / NULLIF(cw.weight, 0)) * 100)
        END) AS proc_gen,
        ROUND(rs.score / 1000.0) AS puntuacion
      FROM target_reports tr
      LEFT JOIN public.report_summary rs
        ON rs.report_mid = tr.report_mid
      LEFT JOIN public.category_weight cw
        ON cw.company_id = tr.company_id
       AND cw.level = tr.location_level
      GROUP BY
        tr.report_id,
        tr.report_mid,
        tr.report_name,
        tr.location_id,
        tr.company_id,
        tr.status,
        tr.location_level,
        rs.score
    )
    SELECT
      tl.location_id,
      tl.location,
      COALESCE(rs.location_level, selected_level.level, tl.current_level) AS nivel,
      previous_level.level AS nivel_anterior,
      rs.servicio,
      rs.apariencia,
      rs.preparaciones,
      rs.proc_gen,
      rs.puntuacion,
      CASE
        WHEN rs.report_mid IS NOT NULL THEN
          'https://grits-static-content.s3.us-east-1.amazonaws.com/loc-reports/location-report-'
          || rs.report_mid
          || '/index.html'
      END AS informe_url,
      rs.report_mid,
      rs.report_name,
      rs.status,
      lg.group_name AS location_group
    FROM target_locations tl
    LEFT JOIN report_scores rs
      ON rs.location_id = tl.location_id
    LEFT JOIN public.location_group lg
      ON lg.location_id = tl.location_id
    LEFT JOIN LATERAL (
      SELECT ll.level
      FROM public.location_level ll
      WHERE ll.location_id = tl.location_id
        AND $1::DATE >= ll.start_date
        AND (
          ll.end_date IS NULL
          OR $1::DATE <= ll.end_date
        )
      ORDER BY ll.start_date DESC, ll.id DESC
      LIMIT 1
    ) selected_level ON TRUE
    LEFT JOIN LATERAL (
      SELECT ll.level
      FROM public.location_level ll
      WHERE ll.location_id = tl.location_id
        AND ($1::DATE - INTERVAL '7 day')::DATE >= ll.start_date
        AND (
          ll.end_date IS NULL
          OR ($1::DATE - INTERVAL '7 day')::DATE <= ll.end_date
        )
      ORDER BY ll.start_date DESC, ll.id DESC
      LIMIT 1
    ) previous_level ON TRUE
    ORDER BY
      rs.puntuacion DESC NULLS LAST,
      tl.location;
  `;
}

function processZoneStores(rows, zoneName, d1, d2, zoneSummary = {}) {
  const stores = [];
  const outOfLine = [];
  const levelCounts = {
    nivel_1: 0,
    nivel_2: 0,
    nivel_3: 0,
    nivel_4: 0,
    out_of_line: 0,
  };

  rows.forEach((row) => {
    const isOutOfLine = row.informe_url === null || hasAllScoreCategoriesAtZero(row);
    const store = {
      location_id: row.location_id,
      location: row.location,
      nivel: row.nivel || 'N/A',
      nivel_anterior: row.nivel_anterior ?? null,
      location_group: zoneName,
      servicio: row.servicio ?? 'N/A',
      apariencia: row.apariencia ?? 'N/A',
      preparaciones: row.preparaciones ?? 'N/A',
      proc_gen: row.proc_gen ?? 'N/A',
      puntuacion: row.puntuacion ?? 'N/A',
      informe_url: row.informe_url,
      report_mid: row.report_mid,
      report_name: row.report_name,
      status: row.status,
      has_report: !isOutOfLine,
      is_out_of_line: isOutOfLine,
    };

    if (isOutOfLine) {
      outOfLine.push(store);
      levelCounts.out_of_line++;
      return;
    }

    stores.push(store);
    const levelKey = `nivel_${row.nivel}`;
    if (Object.prototype.hasOwnProperty.call(levelCounts, levelKey)) {
      levelCounts[levelKey]++;
    }
  });

  const allStores = [...stores, ...outOfLine];

  return {
    district: {
      name: zoneName,
      date_range: buildDateRange(d1, d2),
      total_stores: allStores.length,
      level_breakdown: levelCounts,
      regional_summary: {
        nivel_promedio: zoneSummary.nivel_promedio ?? null,
        zonal_rank_label: zoneSummary.zonal_rank_label || 'N/A',
      },
      report_type: 'zone',
      zone_summary: zoneSummary,
    },
    stores,
    out_of_line: outOfLine,
    all_stores: allStores,
    time_checks: null,
  };
}

async function getZoneStores(d1, d2, zoneName) {
  const selectedZone = normalizeZoneName(zoneName);
  const locationIds = ZONE_LOCATION_ROWS
    .filter(([name]) => normalizeZoneName(name) === selectedZone)
    .map(([, locationId]) => locationId);

  if (!d1 || !d2 || !selectedZone || locationIds.length === 0) {
    throw new Error('Parametros faltantes: d1, d2 y zone_name requeridos');
  }

  const result = await pool.query(buildZoneDetailQuery(), [d1, d2, locationIds]);
  return result.rows
    .map((row) => {
      const current = toNumber(row.nivel);
      const previous = toNumber(row.nivel_anterior);
      const hasAlert = /alert|desc/i.test(String(row.status || ''));
      let change = 'same';

      if (Number.isFinite(current) && Number.isFinite(previous) && current !== previous) {
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

function buildZoneSummary(allZones, selectedZone) {
  const ranked = [...allZones]
    .filter((row) => Number.isFinite(row.nivel_promedio))
    .sort((a, b) => {
      const levelDiff = b.nivel_promedio - a.nivel_promedio;
      if (levelDiff !== 0) return levelDiff;
      return a.distrito_num - b.distrito_num;
    });
  const selected = allZones.find((row) => row.location_group === selectedZone || row.distrito === selectedZone) || {};
  const rank = ranked.findIndex((row) => row.location_group === selectedZone || row.distrito === selectedZone) + 1;

  return {
    nivel_promedio: selected.nivel_promedio ?? null,
    puntaje_promedio: selected.puntaje_promedio ?? null,
    zonal_rank: rank || null,
    zonal_rank_total: ranked.length,
    zonal_rank_label: rank ? `(${rank}/${ranked.length})` : 'N/A',
  };
}

function getZones() {
  return [...new Set(ZONE_LOCATION_ROWS.map(([zoneName]) => zoneName))]
    .map((zoneName) => ({
      id: zoneName,
      name: zoneName,
      total_locations: ZONE_LOCATION_ROWS.filter(([name]) => name === zoneName).length,
    }));
}

function hasAllScoreCategoriesAtZero(store) {
  return ['servicio', 'apariencia', 'preparaciones', 'proc_gen']
    .every((key) => toNumber(store[key]) === 0);
}

function normalizeZoneName(value) {
  return String(value || '').trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  if (!startParts || !endParts) return `${start} - ${end}`;
  if (startParts.year === endParts.year) {
    return `${startParts.day} ${startParts.monthName} - ${endParts.day} ${endParts.monthName}, ${endParts.year}`;
  }
  return `${startParts.day} ${startParts.monthName}, ${startParts.year} - ${endParts.day} ${endParts.monthName}, ${endParts.year}`;
}

function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    monthName: months[Number(match[2]) - 1],
  };
}

module.exports = {
  generateSingleZoneReport,
  getZoneStores,
  getZones,
};
