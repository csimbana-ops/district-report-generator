WITH params AS (
  SELECT
    20::bigint AS company_id,
    DATE '2026-04-13' AS d1,
    DATE '2026-04-19' AS d2
),
target_locations AS (
  SELECT
    l.id AS location_id,
    l.name AS location,
    l.company_id
  FROM public.location l
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
  tl.location,
  ll.level AS nivel,
  lg.group_name AS location_group,

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

LEFT JOIN public.location_group lg
  ON lg.location_id = tl.location_id

LEFT JOIN public.location_level ll
  ON ll.location_id = tl.location_id
 AND (SELECT d1 FROM params) >= ll.start_date
 AND (
   ll.end_date IS NULL 
   OR (SELECT d1 FROM params) <= ll.end_date
 )

ORDER BY
  rs.puntuacion DESC NULLS LAST,
  tl.location;