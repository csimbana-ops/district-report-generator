const pool = require('../config/database');
const { TIME_CHECK_QUERY, TIME_DISTRIBUTION_QUERY } = require('../config/constants');

const COUNTRY_LABEL = 'M\u00e9xico';

const REGION_NAMES = {
  nl: 'Nuevo León',
  coahuila: 'Coahuila',
};

REGION_NAMES.nl = 'Nuevo Le\u00f3n';

// Tiendas que no generan metricas DRIVE; se filtran por ID para soportar aliases de nombre.
const NO_DRIVE_LOCATION_IDS = new Set([
  '11d594f31c7c3fd3d1c2307f',
  '49173608705dc94603eda454',
  '1512e32546079292128d8c53',
  '700acb5a85f03da09da9950d',
  '0cc4c1e2b78054e9f8d6549b',
  '277af2d7593f918e157e3f2c',
  'ebecf98e632147b828358dc4',
  '4fba1f85f408e9e832659267',
  'a5fd98f0dc92572e48e8fb88',
  '684ef9174ab9b6f83382e864',
  '792161c218ee8875a8de5137',
  'dd6b0d02eb5e6d34993ec8dc',
  'a9ed1c0eca24f3c04b2c91c0',
  '5c4eeb00443e5256bef3424d',
  '654f4d082d48e5a7b1d30ac0',
  '782e1b5a618038d350b3c4a8',
  'f7058b834a1300fba0f9c2ee',
  'f07324afd01d3980625b804f',
  '3adfa7eb82a73a3d7004a2bf',
  '82f886a080617c310718e6a9',
  '582a9a32ec4b05bf6fd77cce',
  'aeb9b9f898c003701a9a85f1',
  '4a69507c9042d7caac46a927',
  '7972bc807b713142025af2c0',
  '2bd9f76f923f760ccfcd3ffc',
  '55fcfe9fe532c61042438294',
  'def3712537b996972aa438ba',
  'a0323979ba5760b9ed54721e',
  '29eec5d8dff20cbda3b4930d',
  '8883e337b277a0dccd72fd4e',
  'cbf8bb93b568fdea98bca8b7',
]);

const TIME_DISTRIBUTION_PERIODS = 12;
const STACKED_CHART_VIEWBOX = {
  width: 760,
  height: 310,
  x: 50,
  y: 18,
  plotWidth: 650,
  plotHeight: 205,
};

const TIME_RANGE_CATEGORIES = [
  { key: 'under_030', label: '<0.30', color: '#78ad62' },
  { key: 'thirty_to_1', label: '0.30-1.00', color: '#d9ebd3' },
  { key: 'one_to_130', label: '1.00-1.30', color: '#f7d7d6' },
  { key: 'one30_to_2', label: '1.30-2.00', color: '#ff9a9f' },
  { key: 'over_2', label: '2.00+', color: '#ff5a63' },
];

async function buildTimeCheckReport(company_id, d1, d2, districtName, districtStores = []) {
  const previousRange = getPreviousWeekRange(d1, d2);
  const periodStarts = buildWeeklyPeriodStarts(d1, TIME_DISTRIBUTION_PERIODS);
  const historicalStart = periodStarts[0] || d1;
  const [currentResult, previousResult, historicalResult] = await Promise.all([
    pool.query(TIME_CHECK_QUERY, [company_id, d1, d2]),
    pool.query(TIME_CHECK_QUERY, [company_id, previousRange.start, previousRange.end]),
    pool.query(TIME_DISTRIBUTION_QUERY, [company_id, historicalStart, d2]),
  ]);

  const rows = filterSupportedTimeRows(currentResult.rows.map(normalizeRow));
  const previousRows = filterSupportedTimeRows(previousResult.rows.map(normalizeRow));
  const historicalRows = filterSupportedTimeRows(historicalResult.rows.map(normalizeRow));
  const selectedDistrictNumber = parseDistrictNumber(districtName);
  const selectedRegion = getRegionByDistrict(selectedDistrictNumber);

  const countryRows = rows;
  const regionRows = rows.filter((row) => row.region_code === selectedRegion);
  const districtRows = rows.filter((row) => row.district_num === selectedDistrictNumber);
  const previousDistrictRows = previousRows.filter((row) => row.district_num === selectedDistrictNumber);

  return {
    district_report: buildDistrictTimeReport(
      districtName,
      selectedDistrictNumber,
      rows,
      regionRows,
      selectedRegion,
      districtRows,
      previousDistrictRows,
      historicalRows,
      periodStarts,
      districtStores
    ),
    summary_rows: [
      buildSummaryRow('País', 'LOBBY', aggregateRows(countryRows.filter(isLobbyRow))),
      buildSummaryRow('País', 'DRIVE', aggregateRows(countryRows.filter(isDriveRow))),
      buildSummaryRow(REGION_NAMES[selectedRegion] || 'Región', 'LOBBY', aggregateRows(regionRows.filter(isLobbyRow))),
      buildSummaryRow(REGION_NAMES[selectedRegion] || 'Región', 'DRIVE', aggregateRows(regionRows.filter(isDriveRow))),
      buildSummaryRow(districtName, 'LOBBY', aggregateRows(districtRows.filter(isLobbyRow))),
      buildSummaryRow(districtName, 'DRIVE', aggregateRows(districtRows.filter(isDriveRow))),
    ],
    store_rows: buildStoreRows(districtRows),
  };
}

async function buildRegionalTimeReport(company_id, d1, d2, regionCode, regionalDistrictRows = []) {
  const previousRange = getPreviousWeekRange(d1, d2);
  const [currentResult, previousResult] = await Promise.all([
    pool.query(TIME_CHECK_QUERY, [company_id, d1, d2]),
    pool.query(TIME_CHECK_QUERY, [company_id, previousRange.start, previousRange.end]),
  ]);

  const rows = filterSupportedTimeRows(currentResult.rows.map(normalizeRow));
  const previousRows = filterSupportedTimeRows(previousResult.rows.map(normalizeRow));
  const selectedRegion = String(regionCode || '').trim().toLowerCase();
  const regionRows = rows.filter((row) => row.region_code === selectedRegion);
  const previousRegionRows = previousRows.filter((row) => row.region_code === selectedRegion);
  const districtLabels = new Map(
    (Array.isArray(regionalDistrictRows) ? regionalDistrictRows : [])
      .map((row) => [Number(row.distrito_num), row.distrito || row.location_group || `D-${row.distrito_num}`])
  );

  return {
    region_code: selectedRegion,
    region_name: REGION_NAMES[selectedRegion] || 'Region',
    checks: [
      buildRegionalTimeCheckSection('Lobby', rows, previousRows, districtLabels, selectedRegion, isLobbyRow),
      buildRegionalTimeCheckSection('Drive', rows, previousRows, districtLabels, selectedRegion, isDriveRow),
    ],
  };
}

function buildRegionalTimeCheckSection(title, countryRows, previousCountryRows, districtLabels, selectedRegion, predicate) {
  const checkCountryRows = countryRows.filter(predicate);
  const checkPreviousCountryRows = previousCountryRows.filter(predicate);
  const countryMetric = buildRegionalTimeMetric('Mexico', checkCountryRows, checkPreviousCountryRows);
  const regionCodes = ['coahuila', 'nl'];
  const regionMetrics = regionCodes.map((regionCode) => {
    const metric = buildRegionalTimeMetric(
      REGION_NAMES[regionCode] || regionCode,
      countryRows.filter((row) => row.region_code === regionCode && predicate(row)),
      previousCountryRows.filter((row) => row.region_code === regionCode && predicate(row))
    );

    return {
      region_code: regionCode,
      ...attachBaselineComparison(metric, countryMetric, 'country'),
    };
  });

  const selectedRegionMetric = regionMetrics.find((row) => row.region_code === selectedRegion)
    || attachBaselineComparison(
      buildRegionalTimeMetric(
        REGION_NAMES[selectedRegion] || 'Region',
        countryRows.filter((row) => row.region_code === selectedRegion && predicate(row)),
        previousCountryRows.filter((row) => row.region_code === selectedRegion && predicate(row))
      ),
      countryMetric,
      'country'
    );

  const districtNumbers = [...districtLabels.keys()]
    .filter((districtNumber) => getRegionByDistrict(districtNumber) === selectedRegion)
    .sort((a, b) => a - b);

  return {
    title,
    country: countryMetric,
    regions: regionMetrics,
    selected_region: selectedRegionMetric,
    districts: districtNumbers.map((districtNumber) => {
      const metric = buildRegionalTimeMetric(
        districtLabels.get(districtNumber) || `D-${districtNumber}`,
        countryRows.filter((row) => row.district_num === districtNumber && predicate(row)),
        previousCountryRows.filter((row) => row.district_num === districtNumber && predicate(row))
      );

      return attachBaselineComparison(metric, selectedRegionMetric, 'region');
    }),
  };
}

function buildRegionalTimeMetric(label, currentRows, previousRows) {
  const metric = formatComparisonMetric(aggregateRows(currentRows), aggregateRows(previousRows));
  return {
    label,
    ...metric,
  };
}

function attachBaselineComparison(metric, baseline, baselineKey) {
  const diffSeconds = subtractNullable(metric.avg_seconds, baseline?.avg_seconds);
  const diffPercent = subtractNullable(metric.less_than_60, baseline?.less_than_60);

  return {
    ...metric,
    [`diff_seconds_${baselineKey}`]: roundNullable(diffSeconds, 0),
    [`diff_seconds_${baselineKey}_label`]: formatSignedNumber(diffSeconds),
    [`diff_percent_${baselineKey}`]: roundNullable(diffPercent, 0),
    [`diff_percent_${baselineKey}_label`]: formatPercentDifference(diffPercent),
  };
}

function buildDistrictTimeReport(
  districtName,
  districtNumber,
  countryRows,
  regionRows,
  selectedRegion,
  currentRows,
  previousRows,
  historicalRows,
  periodStarts,
  districtStores
) {
  const lobbyCurrentRows = currentRows.filter(isLobbyRow);
  const lobbyPreviousRows = previousRows.filter(isLobbyRow);
  const driveCurrentRows = currentRows.filter(isDriveRow);
  const drivePreviousRows = previousRows.filter(isDriveRow);

  const lobbyDistrict = aggregateRows(lobbyCurrentRows);
  const driveDistrict = aggregateRows(driveCurrentRows);

  return {
    district_name: districtName,
    district_number: districtNumber,
    overview: buildTimeOverview(countryRows, regionRows, selectedRegion, districtNumber),
    general: {
      lobby: buildGeneralMetric(districtName, lobbyCurrentRows, lobbyPreviousRows),
      drive: buildGeneralMetric(districtName, driveCurrentRows, drivePreviousRows),
    },
    distribution_charts: buildTimeDistributionCharts(
      historicalRows.filter((row) => row.district_num === districtNumber),
      periodStarts
    ),
    store_rows: buildDistrictStoreComparisonRows(
      currentRows,
      previousRows,
      lobbyDistrict,
      driveDistrict,
      districtStores
    ),
  };
}

function buildTimeOverview(countryRows, regionRows, selectedRegion, districtNumber) {
  const regionName = REGION_NAMES[selectedRegion] || 'Regi\u00f3n';

  return {
    district_label: `D-${districtNumber}`,
    sections: [
      buildTimeOverviewSection(COUNTRY_LABEL, countryRows, countryRows, districtNumber),
      buildTimeOverviewSection(regionName, regionRows, regionRows, districtNumber),
    ],
  };
}

function buildTimeDistributionCharts(rows, periodStarts) {
  return [
    buildTimeDistributionChart('Lobby', rows, periodStarts, isLobbyRow),
    buildTimeDistributionChart('Drive', rows, periodStarts, isDriveRow),
  ];
}

function buildTimeDistributionChart(title, rows, periodStarts, predicate) {
  const rowsByPeriod = groupBy(rows.filter(predicate), (row) => row.period_start);
  const periods = periodStarts.map((periodStart) => {
    return buildTimeDistributionPeriod(periodStart, rowsByPeriod.get(periodStart) || []);
  });
  const paths = buildStackedAreaPaths(periods);

  return {
    title,
    view_box: `0 0 ${STACKED_CHART_VIEWBOX.width} ${STACKED_CHART_VIEWBOX.height}`,
    plot: STACKED_CHART_VIEWBOX,
    categories: TIME_RANGE_CATEGORIES,
    periods,
    paths,
    y_labels: buildStackedAreaYLabels(),
    x_labels: buildStackedAreaXLabels(periods),
    x_ticks: buildStackedAreaXTicks(periods),
    has_data: periods.some((period) => period.total_count > 0),
  };
}

function buildTimeDistributionPeriod(periodStart, rows) {
  const counts = TIME_RANGE_CATEGORIES.reduce((acc, category) => {
    acc[category.key] = 0;
    return acc;
  }, {});
  const rowsByStore = groupBy(rows, (row) => row.loc_id);

  rowsByStore.forEach((storeRows) => {
    const aggregate = aggregateRows(storeRows);
    if (!Number.isFinite(aggregate.avg_seconds)) return;
    counts[classifyTimeRange(aggregate.avg_seconds)]++;
  });

  const total = sum(Object.values(counts));
  const values = TIME_RANGE_CATEGORIES.map((category) => {
    const count = counts[category.key] || 0;
    return {
      key: category.key,
      count,
      percent: total ? roundTo((count * 100) / total, 1) : 0,
    };
  });

  return {
    start: periodStart,
    label: formatShortDateLabel(periodStart),
    total_count: total,
    values,
  };
}

function buildStackedAreaPaths(periods) {
  const previousValues = periods.map(() => 0);

  return TIME_RANGE_CATEGORIES.map((category) => {
    const topValues = periods.map((period, index) => {
      const value = getCategoryPercent(period, category.key);
      return previousValues[index] + value;
    });
    const bottomValues = [...previousValues];

    periods.forEach((period, index) => {
      previousValues[index] += getCategoryPercent(period, category.key);
    });

    const topPoints = valuesToStepPoints(topValues, periods.length);
    const bottomPoints = valuesToStepPoints(bottomValues, periods.length).reverse();
    const points = [...topPoints, ...bottomPoints];

    return {
      key: category.key,
      color: category.color,
      d: pointsToPath(points),
      line_d: pointsToOpenPath(topPoints),
    };
  });
}

function buildStackedAreaYLabels() {
  return [0, 25, 50, 75, 100].map((value) => {
    return {
      value,
      label: `${value}%`,
      y: stackY(value),
    };
  });
}

function buildStackedAreaXLabels(periods) {
  return periods
    .map((period, index) => {
      return {
        label: period.label,
        x: stackX(index, periods.length),
      };
    })
    .filter(Boolean);
}

function buildStackedAreaXTicks(periods) {
  return periods.map((period, index) => {
    return {
      label: period.label,
      x: stackX(index, periods.length),
    };
  });
}

function valuesToStepPoints(values, total) {
  if (values.length === 0) return [];

  const points = [
    {
      x: stackX(0, total),
      y: stackY(values[0]),
    },
  ];

  for (let index = 1; index < values.length; index++) {
    const x = stackX(index, total);
    points.push({
      x,
      y: stackY(values[index - 1]),
    });
    points.push({
      x,
      y: stackY(values[index]),
    });
  }

  return points;
}

function stackX(index, total) {
  if (total <= 1) return STACKED_CHART_VIEWBOX.x;
  return roundTo(STACKED_CHART_VIEWBOX.x + (index / (total - 1)) * STACKED_CHART_VIEWBOX.plotWidth, 2);
}

function stackY(value) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return roundTo(STACKED_CHART_VIEWBOX.y + ((100 - safeValue) / 100) * STACKED_CHART_VIEWBOX.plotHeight, 2);
}

function pointsToPath(points) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
    'Z',
  ].join(' ');
}

function pointsToOpenPath(points) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
  ].join(' ');
}

function getCategoryPercent(period, categoryKey) {
  const item = period.values.find((value) => value.key === categoryKey);
  return item ? item.percent : 0;
}

function classifyTimeRange(avgSeconds) {
  if (avgSeconds < 30) return 'under_030';
  if (avgSeconds < 60) return 'thirty_to_1';
  if (avgSeconds < 90) return 'one_to_130';
  if (avgSeconds < 120) return 'one30_to_2';
  return 'over_2';
}

function buildTimeOverviewSection(scope, aggregateScopeRows, rankingScopeRows, districtNumber) {
  return {
    scope,
    rows: [
      buildTimeOverviewRow('Lobby:', aggregateScopeRows, rankingScopeRows, districtNumber, isLobbyRow),
      buildTimeOverviewRow('Drive:', aggregateScopeRows, rankingScopeRows, districtNumber, isDriveRow),
    ],
  };
}

function buildTimeOverviewRow(label, aggregateScopeRows, rankingScopeRows, districtNumber, predicate) {
  const aggregate = aggregateRows(aggregateScopeRows.filter(predicate));

  return {
    label,
    avg_label: formatSeconds(aggregate.avg_seconds),
    rank_label: buildTimeRankLabel(rankingScopeRows, districtNumber, predicate),
  };
}

function buildTimeRankLabel(rows, districtNumber, predicate) {
  const rowsByDistrict = groupBy(rows.filter(predicate), (row) => row.district_num);
  const rankedDistricts = [...rowsByDistrict.entries()]
    .map(([districtNum, districtRows]) => {
      const aggregate = aggregateRows(districtRows);
      return {
        district_num: Number(districtNum),
        avg_seconds: aggregate.avg_seconds,
      };
    })
    .filter((row) => Number.isFinite(row.avg_seconds))
    .sort((a, b) => {
      const roundedDiff = Math.round(a.avg_seconds) - Math.round(b.avg_seconds);
      if (roundedDiff !== 0) return roundedDiff;
      return a.district_num - b.district_num;
    });

  const rank = rankedDistricts.findIndex((row) => row.district_num === districtNumber) + 1;
  return rank > 0 ? `(${rank}/${rankedDistricts.length})` : 'N/A';
}

function buildGeneralMetric(label, currentRows, previousRows) {
  const current = aggregateRows(currentRows);
  const previous = aggregateRows(previousRows);
  return {
    label,
    ...formatComparisonMetric(current, previous),
  };
}

function buildDistrictStoreComparisonRows(currentRows, previousRows, lobbyDistrict, driveDistrict, districtStores) {
  const currentByStore = groupBy(currentRows, (row) => row.loc_id);
  const previousByStore = groupBy(previousRows, (row) => row.loc_id);
  const storeMap = buildStoreMap(districtStores, currentRows);
  const storeIds = [...new Set([...storeMap.keys(), ...currentByStore.keys()])];

  return storeIds
    .map((storeId) => {
      const storeCurrentRows = currentByStore.get(storeId) || [];
      const storePreviousRows = previousByStore.get(storeId) || [];
      const first = storeCurrentRows[0] || storeMap.get(storeId) || storePreviousRows[0];
      const driveEligible = isDriveEligibleLocation(storeId);

      return {
        store: first.loc_name,
        lobby: buildStoreMetric(
          aggregateRows(storeCurrentRows.filter(isLobbyRow)),
          aggregateRows(storePreviousRows.filter(isLobbyRow)),
          lobbyDistrict
        ),
        drive: driveEligible
          ? buildStoreMetric(
              aggregateRows(storeCurrentRows.filter(isDriveRow)),
              aggregateRows(storePreviousRows.filter(isDriveRow)),
              driveDistrict
            )
          : buildNotApplicableStoreMetric(),
      };
    })
    .sort((a, b) => String(a.store).localeCompare(String(b.store), 'es'));
}

function buildStoreMap(districtStores, currentRows) {
  const map = new Map();

  if (Array.isArray(districtStores)) {
    districtStores.forEach((store) => {
      const storeId = store.location_id || store.loc_id || store.id;
      const storeName = store.location || store.loc_name || store.name;
      if (storeId && storeName) {
        map.set(storeId, {
          loc_id: storeId,
          loc_name: storeName,
        });
      }
    });
  }

  currentRows.forEach((row) => {
    if (!map.has(row.loc_id)) {
      map.set(row.loc_id, row);
    }
  });

  return map;
}

function buildStoreMetric(current, previous, districtAverage) {
  const metric = formatComparisonMetric(current, previous);
  const diffSecondsAverage = subtractNullable(current.avg_seconds, districtAverage.avg_seconds);
  const diffPercentDistrict = subtractNullable(current.less_than_60, districtAverage.less_than_60);

  return {
    is_applicable: true,
    ...metric,
    diff_seconds_average: roundNullable(diffSecondsAverage, 0),
    diff_seconds_average_label: formatSignedNumber(diffSecondsAverage),
    diff_percent_district: roundNullable(diffPercentDistrict, 0),
    diff_percent_district_label: formatPercentDifference(diffPercentDistrict),
  };
}

function buildNotApplicableStoreMetric() {
  return {
    is_applicable: false,
    avg_seconds: null,
    avg_label: 'N/A',
    diff_seconds_previous: null,
    diff_seconds_previous_label: 'N/A',
    less_than_60: null,
    less_than_60_label: 'N/A',
    sample_count: 0,
    sample_count_label: '0',
    performance_previous: null,
    performance_previous_label: 'N/A',
    diff_seconds_average: null,
    diff_seconds_average_label: 'N/A',
    diff_percent_district: null,
    diff_percent_district_label: 'N/A',
  };
}

function formatComparisonMetric(current, previous) {
  const diffSecondsPrevious = subtractNullable(current.avg_seconds, previous.avg_seconds);
  const performancePrevious = subtractNullable(current.less_than_60, previous.less_than_60);

  return {
    avg_seconds: current.avg_seconds,
    avg_label: formatSeconds(current.avg_seconds),
    diff_seconds_previous: roundNullable(diffSecondsPrevious, 0),
    diff_seconds_previous_label: formatSignedNumber(diffSecondsPrevious),
    less_than_60: current.less_than_60,
    less_than_60_label: formatPercent(current.less_than_60),
    sample_count: current.sample_count,
    sample_count_label: formatCount(current.sample_count),
    performance_previous: roundNullable(performancePrevious, 0),
    performance_previous_label: formatPercentDifference(performancePrevious),
  };
}

function buildStoreRows(rows) {
  const individualRows = rows
    .filter((row) => isDriveRow(row) || isLobbyRow(row))
    .map((row) => {
      return {
        store: row.loc_name,
        district: row.district,
        check: row.timetype,
        ...aggregateRows([row]),
      };
    });

  const lobbyCombinedRows = [];
  const rowsByStore = groupBy(rows.filter(isLobbyRow), (row) => row.loc_id);

  rowsByStore.forEach((storeRows) => {
    const first = storeRows[0];
    lobbyCombinedRows.push({
      store: first.loc_name,
      district: first.district,
      check: 'LOBBY Ambas',
      ...aggregateRows(storeRows),
    });
  });

  return [...individualRows, ...lobbyCombinedRows]
    .filter((row) => row.sample_count > 0)
    .sort((a, b) => {
      const storeCompare = String(a.store).localeCompare(String(b.store), 'es');
      if (storeCompare !== 0) return storeCompare;
      return checkOrder(a.check) - checkOrder(b.check);
    });
}

function buildSummaryRow(scope, check, metrics) {
  return {
    scope,
    check,
    ...metrics,
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
      less_than_90_count: 0,
      sample_count: 0,
      less_than_60: null,
      less_than_90: null,
    };
  }

  const lessThan60 = sum(rows.map((row) => row.less_than_60_count));
  const lessThan90 = sum(rows.map((row) => row.less_than_90_count));

  return {
    avg_seconds: avgSampleCount
      ? roundTo(sum(rows.map((row) => Number.isFinite(row.avg_seconds) ? row.avg_seconds * row.avg_sample_count : 0)) / avgSampleCount, 1)
      : null,
    avg_sample_count: avgSampleCount,
    less_than_60_count: lessThan60,
    less_than_90_count: lessThan90,
    sample_count: sampleCount,
    less_than_60: roundTo((lessThan60 * 100) / sampleCount, 1),
    less_than_90: roundTo((lessThan90 * 100) / sampleCount, 1),
  };
}

function getPreviousWeekRange(d1, d2) {
  return {
    start: shiftDate(d1, -7),
    end: shiftDate(d2, -7),
  };
}

function buildWeeklyPeriodStarts(referenceDate, periodCount) {
  const currentWeekStart = getWeekStartDate(referenceDate);
  return Array.from({ length: periodCount }, (_, index) => {
    const offset = (index - periodCount + 1) * 7;
    return shiftDate(currentWeekStart, offset);
  });
}

function getWeekStartDate(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function normalizeRow(row) {
  return {
    period_start: formatDateValue(row.period_start),
    loc_id: row.loc_id,
    district: row.district,
    district_num: parseDistrictNumber(row.district),
    region_code: getRegionByDistrict(parseDistrictNumber(row.district)),
    loc_name: row.loc_name,
    timetype: row.timetype,
    avg_seconds: row.avg_seconds === null ? null : Number(row.avg_seconds),
    avg_sample_count: Number(row.avg_sample_count || 0),
    less_than_60_count: Number(row.less_than_60_count || 0),
    less_than_90_count: Number(row.less_than_90_count || 0),
    less_than_120_count: Number(row.less_than_120_count || 0),
    less_than_60: Number(row.less_than_60 || 0),
    less_than_90: Number(row.less_than_90 || 0),
    less_than_120: Number(row.less_than_120 || 0),
    sample_count: Number(row.sample_count || 0),
  };
}

function formatDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function formatShortDateLabel(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return String(value || '');
  }

  return `${months[month - 1]} ${day}`;
}

function filterSupportedTimeRows(rows) {
  return rows.filter((row) => {
    return row.district_num >= 1 && row.district_num <= 14 && isDriveApplicableRow(row);
  });
}

function isDriveApplicableRow(row) {
  return !isDriveRow(row) || isDriveEligibleLocation(row.loc_id);
}

function isDriveEligibleLocation(locationId) {
  return !NO_DRIVE_LOCATION_IDS.has(String(locationId || '').trim());
}

function isLobbyRow(row) {
  return String(row.timetype || '').startsWith('LOBBY');
}

function isDriveRow(row) {
  return row.timetype === 'DRIVE';
}

function checkOrder(check) {
  const order = {
    DRIVE: 1,
    'LOBBY H&R Bajas': 2,
    'LOBBY H&R Rush': 3,
    'LOBBY Ambas': 4,
  };

  return order[check] || 99;
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

function getRegionByDistrict(districtNumber) {
  if (districtNumber >= 1 && districtNumber <= 9) return 'nl';
  if (districtNumber >= 10 && districtNumber <= 14) return 'coahuila';
  return null;
}

function parseDistrictNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

module.exports = {
  buildTimeCheckReport,
  buildRegionalTimeReport,
};
