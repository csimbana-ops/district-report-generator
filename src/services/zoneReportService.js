const pool = require('../config/database');
const { buildZoneValuesSql } = require('../config/zoneLocations');
const { buildZoneTimeReport } = require('./zoneTimeService');

const CORALSA_COMPANY_ID = 31;

async function generateZoneRegionalReport(d1, d2) {
  if (!d1 || !d2) {
    throw new Error('Parametros faltantes: d1 y d2 requeridos');
  }

  const date1 = new Date(d1);
  const date2 = new Date(d2);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
    throw new Error('Fechas invalidas. Formato esperado: YYYY-MM-DD');
  }

  if (date1 > date2) {
    throw new Error('La fecha inicio no puede ser mayor que la fecha fin');
  }

  const [rows, zoneStores, timeChecks] = await Promise.all([
    getZoneRows(d1, d2),
    getZoneStoreData(d1, d2),
    buildZoneTimeReport(d1, d2),
  ]);

  assignZoneRankings(rows);

  const selectedBreakdown = buildLevelBreakdown(rows);
  const selectedSummary = buildRegionSummary(rows, selectedBreakdown);

  return {
    region: {
      code: 'zonas',
      label: 'Zonas',
      shortLabel: 'Zonas',
    },
    date_range: buildDateRange(d1, d2),
    rows,
    all_rows: rows,
    region_summaries: [selectedSummary],
    selected_region_summary: selectedSummary,
    time_checks: timeChecks,
    zone_stores: zoneStores,
    entity_label: 'Zona',
    entity_label_plural: 'Zonas',
    report_eyebrow: 'Resultados zonales',
    report_title: 'Resultados Zonales',
    summary: {
      selected_region_average: selectedSummary.nivel_promedio,
      selected_region_active_stores: selectedSummary.active_stores,
      selected_region_total_stores: selectedBreakdown.total_stores,
      selected_region_level_breakdown: selectedBreakdown,
      selected_region_districts: rows.length,
      total_districts: rows.length,
    },
  };
}

async function getZoneStoreData(d1, d2) {
  const query = `
    WITH params AS (
      SELECT
        $1::DATE AS d1,
        ($1::DATE - INTERVAL '7 day')::DATE AS prev_d1
    ),
    zone_locations(zone_name, location_id) AS (
      VALUES
        ${buildZoneValuesSql()}
    )
    SELECT
      zl.zone_name,
      l.id AS location_id,
      l.name AS location,
      COALESCE(selected_level.level, l.level) AS nivel,
      previous_level.level AS nivel_anterior
    FROM zone_locations zl
    JOIN public.location l ON l.id = zl.location_id
    CROSS JOIN params p
    LEFT JOIN LATERAL (
      SELECT ll.level FROM public.location_level ll
      WHERE ll.location_id = l.id
        AND p.d1 >= ll.start_date
        AND (ll.end_date IS NULL OR p.d1 <= ll.end_date)
      ORDER BY ll.start_date DESC, ll.id DESC LIMIT 1
    ) selected_level ON TRUE
    LEFT JOIN LATERAL (
      SELECT ll.level FROM public.location_level ll
      WHERE ll.location_id = l.id
        AND p.prev_d1 >= ll.start_date
        AND (ll.end_date IS NULL OR p.prev_d1 <= ll.end_date)
      ORDER BY ll.start_date DESC, ll.id DESC LIMIT 1
    ) previous_level ON TRUE
    ORDER BY zl.zone_name, l.name
  `;

  const result = await pool.query(query, [d1]);
  return result.rows.map(processZoneStoreRow);
}

function processZoneStoreRow(row) {
  const current = toNumber(row.nivel);
  const previous = toNumber(row.nivel_anterior);
  let change = 'same';

  if (!Number.isFinite(current)) {
    change = 'alert';
  } else if (Number.isFinite(previous) && current !== previous) {
    change = current < previous ? 'up' : 'down';
  }

  return {
    zone_name: String(row.zone_name || ''),
    location_id: String(row.location_id || ''),
    location: String(row.location || ''),
    nivel: current,
    nivel_anterior: previous,
    change,
  };
}

function assignZoneRankings(rows) {
  const sorted = [...rows].sort((a, b) => {
    const aLevel = Number.isFinite(a.nivel_promedio) ? a.nivel_promedio : Infinity;
    const bLevel = Number.isFinite(b.nivel_promedio) ? b.nivel_promedio : Infinity;
    if (aLevel !== bLevel) return aLevel - bLevel;
    return a.distrito_num - b.distrito_num;
  });

  const total = sorted.length;
  sorted.forEach((row, index) => {
    row.zona_rank = index + 1;
    row.zona_rank_total = total;
    row.zona_rank_label = `${index + 1}/${total}`;
  });
}

async function getZoneRows(d1, d2) {
  const query = `
    WITH params AS (
      SELECT
        ${CORALSA_COMPANY_ID}::bigint AS company_id,
        $1::DATE AS d1,
        $2::DATE AS d2
    ),
    zone_locations(zone_name, location_id) AS (
      VALUES
        ${buildZoneValuesSql()}
    ),
    target_locations AS (
      SELECT
        zl.zone_name,
        l.id AS location_id,
        l.name AS location,
        l.company_id,
        l.level AS current_level
      FROM zone_locations zl
      JOIN public.location l
        ON l.id = zl.location_id
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
    ),
    base AS (
      SELECT
        tl.zone_name,
        tl.location_id,
        tl.location,
        COALESCE(rs.location_level, selected_level.level, tl.current_level) AS nivel,
        rs.servicio,
        rs.apariencia,
        rs.preparaciones,
        rs.proc_gen,
        rs.puntuacion
      FROM target_locations tl
      LEFT JOIN report_scores rs
        ON rs.location_id = tl.location_id
      LEFT JOIN LATERAL (
        SELECT ll.level
        FROM public.location_level ll
        WHERE ll.location_id = tl.location_id
          AND $1::DATE >= ll.start_date
          AND (
            ll.end_date IS NULL
            OR $1::DATE <= ll.end_date
          )
        ORDER BY
          ll.start_date DESC,
          ll.id DESC
        LIMIT 1
      ) selected_level ON TRUE
    )
    SELECT
      zone_name,
      COUNT(*)::int AS total_tiendas,
      COUNT(*) FILTER (WHERE nivel = 1 AND puntuacion IS NOT NULL)::int AS nivel_1,
      COUNT(*) FILTER (WHERE nivel = 2 AND puntuacion IS NOT NULL)::int AS nivel_2,
      COUNT(*) FILTER (WHERE nivel = 3 AND puntuacion IS NOT NULL)::int AS nivel_3,
      COUNT(*) FILTER (WHERE nivel = 4 AND puntuacion IS NOT NULL)::int AS nivel_4,
      COUNT(*) FILTER (WHERE puntuacion IS NULL)::int AS fuera_de_linea,
      COUNT(puntuacion)::int AS tiendas_activas,
      ROUND(AVG(nivel::numeric) FILTER (WHERE puntuacion IS NOT NULL), 2) AS nivel_promedio,
      ROUND(AVG(servicio) FILTER (WHERE puntuacion IS NOT NULL)) AS servicio_promedio,
      ROUND(AVG(apariencia) FILTER (WHERE puntuacion IS NOT NULL)) AS apariencia_promedio,
      ROUND(AVG(preparaciones) FILTER (WHERE puntuacion IS NOT NULL)) AS preparaciones_promedio,
      ROUND(AVG(proc_gen) FILTER (WHERE puntuacion IS NOT NULL)) AS procesos_generales_promedio,
      ROUND(AVG(puntuacion) FILTER (WHERE puntuacion IS NOT NULL)) AS puntaje_promedio
    FROM base
    GROUP BY zone_name
    ORDER BY zone_name;
  `;

  const result = await pool.query(query, [d1, d2]);
  return decorateZoneRows(result.rows);
}

function decorateZoneRows(rows) {
  return rows.map((row, index) => {
    const zoneNumber = parseZoneNumber(row.zone_name) || index + 1;
    const zoneName = row.zone_name || `Zona ${zoneNumber}`;

    return {
      distrito_num: zoneNumber,
      location_group: zoneName,
      distrito: zoneName,
      manager: '',
      region_code: 'zonas',
      region_label: 'Zonas',
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
      informe_url: '#',
    };
  });
}

function buildRegionSummary(rows, breakdown) {
  const activeStores = sum(rows.map((row) => row.tiendas_activas));
  const totalStores = breakdown.total_stores;

  return {
    code: 'zonas',
    label: 'Zonas',
    shortLabel: 'Zonas',
    total_stores: totalStores,
    active_stores: activeStores,
    inactive_stores: breakdown.out_of_line,
    active_percent: percent(activeStores, totalStores),
    inactive_percent: percent(breakdown.out_of_line, totalStores),
    nivel_promedio: average(rows.map((row) => row.nivel_promedio)),
    puntaje_promedio: average(rows.map((row) => row.puntaje_promedio)),
    districts: rows.length,
    breakdown,
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

function parseZoneNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
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

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

module.exports = {
  generateZoneRegionalReport,
  getZoneRows,
};
