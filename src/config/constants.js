// Query SQL para extraer datos de reportes por distrito
const REPORT_QUERY = `
WITH params AS (
  SELECT
    $1::bigint AS company_id,
    $2::DATE AS d1,
    $3::DATE AS d2,
    TRIM($4::TEXT) AS district_name,
    ($2::DATE - INTERVAL '7 day')::DATE AS prev_d1
),
target_locations AS (
  SELECT DISTINCT
    l.id AS location_id,
    l.name AS location,
    l.company_id,
    l.level AS current_level,
    lg.group_name AS location_group
  FROM public.location l
  JOIN public.location_group lg
    ON lg.location_id = l.id
  JOIN params p ON TRUE
  WHERE l.company_id = p.company_id
    AND LOWER(TRIM(lg.group_name)) = LOWER(p.district_name)
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
    r.status
  FROM public.report r
  JOIN params p ON TRUE
  JOIN target_locations tl
    ON tl.location_id = r.location_id
  WHERE r.company_id = p.company_id
    AND r.start_date = p.d1
    AND r.end_date = p.d2
),
report_scores AS (
  SELECT
    tr.report_id,
    tr.report_mid,
    tr.report_name,
    tr.location_id,
    tr.company_id,
    tr.status,

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
   AND cw.level = 1
  GROUP BY
    tr.report_id,
    tr.report_mid,
    tr.report_name,
    tr.location_id,
    tr.company_id,
    tr.status,
    rs.score
)
SELECT
  tl.location_id,
  tl.location,
  COALESCE(selected_level.level, tl.current_level) AS nivel,
  previous_level.level AS nivel_anterior,
  tl.location_group,

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
  rs.status

FROM target_locations tl

LEFT JOIN report_scores rs
  ON rs.location_id = tl.location_id

LEFT JOIN LATERAL (
  SELECT ll.level
  FROM public.location_level ll
  WHERE ll.location_id = tl.location_id
    AND (SELECT d1 FROM params) >= ll.start_date
    AND (
      ll.end_date IS NULL
      OR (SELECT d1 FROM params) <= ll.end_date
    )
  ORDER BY
    ll.start_date DESC,
    ll.id DESC
  LIMIT 1
) selected_level ON TRUE

LEFT JOIN LATERAL (
  SELECT ll.level
  FROM public.location_level ll
  WHERE ll.location_id = tl.location_id
    AND (SELECT prev_d1 FROM params) >= ll.start_date
    AND (
      ll.end_date IS NULL
      OR (SELECT prev_d1 FROM params) <= ll.end_date
    )
  ORDER BY
    ll.start_date DESC,
    ll.id DESC
  LIMIT 1
) previous_level ON TRUE

ORDER BY
  COALESCE(selected_level.level, tl.current_level) ASC NULLS LAST,
  rs.puntuacion DESC NULLS LAST,
  tl.location;
`;

const REGIONAL_REPORT_QUERY = `
WITH params AS (
  SELECT
    $1::bigint AS company_id,
    $2::DATE AS d1,
    $3::DATE AS d2
),
target_locations AS (
  SELECT DISTINCT
    l.id AS location_id,
    l.name AS location,
    l.company_id,
    l.level AS current_level,
    lg.group_name AS location_group
  FROM public.location l
  JOIN public.location_group lg
    ON lg.location_id = l.id
  JOIN params p ON TRUE
  WHERE l.company_id = p.company_id
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
    r.status
  FROM public.report r
  JOIN params p ON TRUE
  JOIN target_locations tl
    ON tl.location_id = r.location_id
  WHERE r.company_id = p.company_id
    AND r.start_date = p.d1
    AND r.end_date = p.d2
),
report_scores AS (
  SELECT
    tr.report_id,
    tr.report_mid,
    tr.report_name,
    tr.location_id,
    tr.company_id,
    tr.status,

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
   AND cw.level = 1
  GROUP BY
    tr.report_id,
    tr.report_mid,
    tr.report_name,
    tr.location_id,
    tr.company_id,
    tr.status,
    rs.score
),
base AS (
  SELECT
    tl.location,
    COALESCE(selected_level.level, tl.current_level) AS nivel,
    tl.location_group,
    NULLIF(REGEXP_REPLACE(tl.location_group, '\\D', '', 'g'), '')::int AS distrito_num,
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
      AND (SELECT d1 FROM params) >= ll.start_date
      AND (
        ll.end_date IS NULL
        OR (SELECT d1 FROM params) <= ll.end_date
      )
    ORDER BY
      ll.start_date DESC,
      ll.id DESC
    LIMIT 1
  ) selected_level ON TRUE
)
SELECT
  distrito_num,
  location_group,
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
WHERE distrito_num BETWEEN 1 AND 14
GROUP BY
  distrito_num,
  location_group
ORDER BY
  distrito_num;
`;

const TIME_CHECK_QUERY = `
WITH params AS (
  SELECT
    $1::bigint AS company_id,
    $2::DATE::timestamp AS start_date,
    ($3::DATE + INTERVAL '1 day')::timestamp AS end_date
)
SELECT
    l.id AS loc_id,
    MIN(lg.group_name) AS district,
    MIN(l.name) AS loc_name,

    CASE
        WHEN asam.audit_id IN (332, 337, 353, 480, 505, 620)
          THEN 'LOBBY H&R Bajas'
        WHEN asam.audit_id IN (333, 338, 355, 479, 504, 621)
          THEN 'LOBBY H&R Rush'
        WHEN asam.audit_id IN (377, 378, 508, 626)
          THEN 'DRIVE'
        ELSE 'Other'
    END AS timetype,

    MIN(asam.start) AS startdate,
    MAX(asam.start) AS enddate,

    AVG(asam.time_difference_sec) AS avg_seconds,
    COUNT(asam.time_difference_sec)::int AS avg_sample_count,

    SUM(CASE WHEN asam.time_difference_sec < 60 THEN 1 ELSE 0 END)::int AS less_than_60_count,
    SUM(CASE WHEN asam.time_difference_sec < 90 THEN 1 ELSE 0 END)::int AS less_than_90_count,
    SUM(CASE WHEN asam.time_difference_sec < 120 THEN 1 ELSE 0 END)::int AS less_than_120_count,

    SUM(CASE WHEN asam.time_difference_sec < 60 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS less_than_60,
    SUM(CASE WHEN asam.time_difference_sec < 90 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS less_than_90,
    SUM(CASE WHEN asam.time_difference_sec < 120 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS less_than_120,

    COUNT(*)::int AS sample_count

FROM public.audit_sample asam

INNER JOIN public.location l
    ON l.id = asam.location_id

LEFT JOIN public.location_group lg
    ON lg.location_id = l.id

JOIN params p
    ON TRUE

WHERE asam.audit_id IN (
    332, 337, 353,
    333, 338, 355,
    377, 378,
    480, 479,
    504, 505, 508,
    620, 621, 626
)
  AND asam.start >= p.start_date
  AND asam.start < p.end_date
  AND asam.date >= p.start_date::date
  AND asam.date < p.end_date::date
  AND l.company_id = p.company_id

GROUP BY
    l.id,
    timetype

ORDER BY
    district,
    loc_name,
    timetype;
`;

const TIME_DISTRIBUTION_QUERY = `
WITH params AS (
  SELECT
    $1::bigint AS company_id,
    $2::DATE::timestamp AS start_date,
    ($3::DATE + INTERVAL '1 day')::timestamp AS end_date
)
SELECT
    date_trunc('week', asam.date::timestamp)::date AS period_start,
    l.id AS loc_id,
    MIN(lg.group_name) AS district,
    MIN(l.name) AS loc_name,

    CASE
        WHEN asam.audit_id IN (332, 337, 353, 480, 505, 620)
          THEN 'LOBBY H&R Bajas'
        WHEN asam.audit_id IN (333, 338, 355, 479, 504, 621)
          THEN 'LOBBY H&R Rush'
        WHEN asam.audit_id IN (377, 378, 508, 626)
          THEN 'DRIVE'
        ELSE 'Other'
    END AS timetype,

    AVG(asam.time_difference_sec) AS avg_seconds,
    COUNT(asam.time_difference_sec)::int AS avg_sample_count,
    COUNT(*)::int AS sample_count

FROM public.audit_sample asam

INNER JOIN public.location l
    ON l.id = asam.location_id

LEFT JOIN public.location_group lg
    ON lg.location_id = l.id

JOIN params p
    ON TRUE

WHERE asam.audit_id IN (
    332, 337, 353,
    333, 338, 355,
    377, 378,
    480, 479,
    504, 505, 508,
    620, 621, 626
)
  AND asam.start >= p.start_date
  AND asam.start < p.end_date
  AND asam.date >= p.start_date::date
  AND asam.date < p.end_date::date
  AND l.company_id = p.company_id

GROUP BY
    period_start,
    l.id,
    timetype

ORDER BY
    period_start,
    district,
    loc_name,
    timetype;
`;

module.exports = {
  REPORT_QUERY,
  REGIONAL_REPORT_QUERY,
  TIME_CHECK_QUERY,
  TIME_DISTRIBUTION_QUERY,
};
