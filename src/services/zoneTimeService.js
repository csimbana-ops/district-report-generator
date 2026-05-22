const pool = require('../config/database');
const { buildZoneValuesSql } = require('../config/zoneLocations');

const ZONE_TIME_CHECKS = [
  {
    key: 'hot_n_ready',
    title: 'Hot N Ready',
    mode: 'target',
    auditIds: [480, 705, 882, 479, 706, 883, 493, 710, 888],
  },
  {
    key: 'pedidos_espera',
    title: 'Pedidos con espera',
    mode: 'time_only',
    auditIds: [482, 884, 707, 481, 708, 885],
  },
  {
    key: 'pedidos_grandes_espera',
    title: 'Pedidos grandes con espera',
    mode: 'time_only',
    auditIds: [886, 826, 828, 829, 887, 827],
  },
];

async function buildZoneTimeReport(d1, d2) {
  const previousRange = getPreviousWeekRange(d1, d2);
  const [currentRows, previousRows] = await Promise.all([
    loadZoneTimeRows(d1, d2),
    loadZoneTimeRows(previousRange.start, previousRange.end),
  ]);

  return {
    checks: ZONE_TIME_CHECKS.map((check) => buildCheckReport(check, currentRows, previousRows)),
  };
}

async function buildSingleZoneTimeReport(d1, d2, zoneName) {
  const fullReport = await buildZoneTimeReport(d1, d2);
  const selectedZone = String(zoneName || '').trim();

  return {
    zone_report: {
      zone_name: selectedZone,
      checks: fullReport.checks.map((check) => {
        return {
          ...check,
          zones: check.zones.filter((zone) => zone.label === selectedZone),
          locations: check.locations.filter((row) => row.zone_name === selectedZone),
        };
      }),
    },
  };
}

async function loadZoneTimeRows(d1, d2) {
  const query = `
    WITH zone_locations(zone_name, location_id) AS (
      VALUES
        ${buildZoneValuesSql()}
    ),
    params AS (
      SELECT
        $1::DATE::timestamp AS start_date,
        ($2::DATE + INTERVAL '1 day')::timestamp AS end_date
    )
    SELECT
      zl.zone_name,
      l.id AS loc_id,
      l.name AS loc_name,
      asam.audit_id,
      AVG(asam.time_difference_sec) AS avg_seconds,
      COUNT(asam.time_difference_sec)::int AS avg_sample_count,
      SUM(CASE WHEN asam.time_difference_sec < 60 THEN 1 ELSE 0 END)::int AS less_than_60_count,
      COUNT(*)::int AS sample_count
    FROM zone_locations zl
    JOIN public.location l
      ON l.id = zl.location_id
    JOIN public.audit_sample asam
      ON asam.location_id = l.id
    JOIN params p
      ON TRUE
    WHERE asam.audit_id = ANY($3::int[])
      AND asam.start >= p.start_date
      AND asam.start < p.end_date
      AND asam.date >= p.start_date::date
      AND asam.date < p.end_date::date
    GROUP BY
      zl.zone_name,
      l.id,
      l.name,
      asam.audit_id
    ORDER BY
      zl.zone_name,
      l.name
  `;
  const auditIds = [...new Set(ZONE_TIME_CHECKS.flatMap((check) => check.auditIds))];
  const result = await pool.query(query, [d1, d2, auditIds]);
  return result.rows.map(normalizeRow);
}

function buildCheckReport(check, currentRows, previousRows) {
  const current = currentRows.filter((row) => check.auditIds.includes(row.audit_id));
  const previous = previousRows.filter((row) => check.auditIds.includes(row.audit_id));
  const zones = ['Zona 1', 'Zona 2', 'Zona 3'];
  const zoneMetrics = zones.map((zoneName) => {
    return buildMetric(zoneName, current.filter((row) => row.zone_name === zoneName), previous.filter((row) => row.zone_name === zoneName), check.mode);
  });

  return {
    key: check.key,
    title: check.title,
    mode: check.mode,
    zones: zoneMetrics,
    locations: buildLocationRows(check, current, previous, zoneMetrics),
  };
}

function buildLocationRows(check, currentRows, previousRows, zoneMetrics) {
  const currentByLocation = groupBy(currentRows, (row) => row.loc_id);
  const previousByLocation = groupBy(previousRows, (row) => row.loc_id);
  const zoneMetricByName = new Map(zoneMetrics.map((zone) => [zone.label, zone]));

  return [...currentByLocation.entries()]
    .map(([locationId, rows]) => {
      const first = rows[0];
      const previous = previousByLocation.get(locationId) || [];
      const zoneMetric = zoneMetricByName.get(first.zone_name) || {};
      const metric = buildMetric(first.loc_name, rows, previous, check.mode);
      const diffSecondsAverage = subtractNullable(metric.avg_seconds, zoneMetric.avg_seconds);
      const diffPercentZone = subtractNullable(metric.less_than_60, zoneMetric.less_than_60);

      return {
        zone_name: first.zone_name,
        location: first.loc_name,
        ...metric,
        diff_seconds_average: roundNullable(diffSecondsAverage, 0),
        diff_seconds_average_label: formatSignedNumber(diffSecondsAverage),
        diff_percent_zone: roundNullable(diffPercentZone, 0),
        diff_percent_zone_label: formatPercentDifference(diffPercentZone),
      };
    })
    .sort((a, b) => {
      const zoneCompare = a.zone_name.localeCompare(b.zone_name, 'es');
      if (zoneCompare !== 0) return zoneCompare;
      return a.location.localeCompare(b.location, 'es');
    });
}

function buildMetric(label, currentRows, previousRows, mode) {
  const current = aggregateRows(currentRows);
  const previous = aggregateRows(previousRows);
  const diffSecondsPrevious = subtractNullable(current.avg_seconds, previous.avg_seconds);
  const performancePrevious = subtractNullable(current.less_than_60, previous.less_than_60);

  return {
    label,
    avg_seconds: current.avg_seconds,
    avg_label: formatSeconds(current.avg_seconds),
    diff_seconds_previous: roundNullable(diffSecondsPrevious, 0),
    diff_seconds_previous_label: formatSignedNumber(diffSecondsPrevious),
    less_than_60: current.less_than_60,
    less_than_60_label: mode === 'target' ? formatPercent(current.less_than_60) : null,
    performance_previous: mode === 'target' ? roundNullable(performancePrevious, 0) : null,
    performance_previous_label: mode === 'target' ? formatPercentDifference(performancePrevious) : null,
    sample_count: current.sample_count,
  };
}

function aggregateRows(rows) {
  const sampleCount = sum(rows.map((row) => row.sample_count));
  const avgSampleCount = sum(rows.map((row) => row.avg_sample_count));

  if (!sampleCount) {
    return {
      avg_seconds: null,
      avg_sample_count: 0,
      less_than_60_count: 0,
      sample_count: 0,
      less_than_60: null,
    };
  }

  const lessThan60 = sum(rows.map((row) => row.less_than_60_count));
  return {
    avg_seconds: avgSampleCount
      ? roundTo(sum(rows.map((row) => Number.isFinite(row.avg_seconds) ? row.avg_seconds * row.avg_sample_count : 0)) / avgSampleCount, 1)
      : null,
    avg_sample_count: avgSampleCount,
    less_than_60_count: lessThan60,
    sample_count: sampleCount,
    less_than_60: roundTo((lessThan60 * 100) / sampleCount, 1),
  };
}

function normalizeRow(row) {
  return {
    zone_name: row.zone_name,
    loc_id: row.loc_id,
    loc_name: row.loc_name,
    audit_id: Number(row.audit_id),
    avg_seconds: row.avg_seconds === null ? null : Number(row.avg_seconds),
    avg_sample_count: Number(row.avg_sample_count || 0),
    less_than_60_count: Number(row.less_than_60_count || 0),
    sample_count: Number(row.sample_count || 0),
  };
}

function getPreviousWeekRange(d1, d2) {
  return {
    start: shiftDate(d1, -7),
    end: shiftDate(d2, -7),
  };
}

function shiftDate(value, days) {
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subtractNullable(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function roundNullable(value, decimals) {
  if (!Number.isFinite(value)) return null;
  return roundTo(value, decimals);
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return 'N/A';
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} min`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}%`;
}

function formatPercentDifference(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}%`;
}

function formatSignedNumber(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return String(Math.round(value));
}

function groupBy(rows, getKey) {
  const map = new Map();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  });
  return map;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

module.exports = {
  buildZoneTimeReport,
  buildSingleZoneTimeReport,
};
