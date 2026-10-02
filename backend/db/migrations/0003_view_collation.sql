-- =====================================================================
-- 0003_view_collation.sql
-- 모든 뷰를 utf8mb4_unicode_ci 커넥션에서 다시 만든다.
-- 원인: MariaDB 12.x 의 utf8mb4 기본 콜레이션(uca1400_ai_ci)으로 만든 뷰는 문자열 리터럴('*' 등)이
--       스키마 콜레이션(unicode_ci) 컬럼과 비교될 때 "Illegal mix of collations" 를 낸다(verify T34 에서 발견).
-- 조치: 커넥션 charset 을 UTF8MB4_UNICODE_CI 로 고정(src/db/pool.ts)하고 뷰 정의를 그대로 재실행한다.
--       정의 내용은 0001·0002 의 최종 정의와 같다(0002 의 v_anon_cell·v_anon_problem_cell 재정의 반영).
-- =====================================================================
CREATE OR REPLACE VIEW v_consent_current AS
SELECT account_id, consent_item_code, is_agreed, occurred_at
  FROM (SELECT ce.account_id, ce.consent_item_code, ce.is_agreed, ce.occurred_at,
               ROW_NUMBER() OVER (PARTITION BY ce.account_id, ce.consent_item_code
                                  ORDER BY ce.occurred_at DESC, ce.consent_event_id DESC) AS rn
          FROM consent_event ce) t
 WHERE rn = 1;

CREATE OR REPLACE VIEW v_gate_g4_store AS
SELECT s.store_id,
       COALESCE(c.is_agreed, FALSE) AS g4_pass
  FROM store s
  LEFT JOIN v_consent_current c
    ON c.account_id = s.account_id AND c.consent_item_code = 'anon_stats';

CREATE OR REPLACE VIEW v_gate_g3_store AS
SELECT s.store_id,
       (SELECT COUNT(*) FROM daily_record r WHERE r.store_id = s.store_id) AS record_count,
       fn_gate_g3(s.store_id, DATE '1900-01-01', CURRENT_DATE) AS g3_pass
  FROM store s;

CREATE OR REPLACE VIEW v_gate_g6_store AS
SELECT e.store_id, e.feature_code, TRUE AS g6_pass
  FROM entitlement e
 WHERE e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE
 GROUP BY e.store_id, e.feature_code;

CREATE OR REPLACE VIEW v_gate_g8_org AS
SELECT o.org_id,
       (o.contract_status = 'active'
        AND (o.contract_end_date IS NULL OR o.contract_end_date >= CURRENT_DATE)) AS g8_pass
  FROM organization o;

CREATE OR REPLACE VIEW v_record_env AS
SELECT r.record_id, r.store_id, r.record_date,
       CASE WHEN fw.fetch_status = 'ok' THEN wo.weather_code END            AS weather_code,
       CASE WHEN fw.fetch_status = 'ok' AND wo.weather_code IS NOT NULL
            THEN 'ok' ELSE 'needs_check' END                                 AS weather_status,
       CASE WHEN fh.fetch_status = 'ok' THEN cd.is_holiday END             AS is_holiday,
       CASE WHEN fh.fetch_status = 'ok' AND cd.cal_date IS NOT NULL
            THEN 'ok' ELSE 'needs_check' END                                 AS holiday_status,
       CASE WHEN fe.fetch_status = 'ok' THEN
            (SELECT MIN(re.event_name) FROM region_event re
              WHERE re.region_code = r.region_code_at_record
                AND r.record_date BETWEEN re.start_date AND re.end_date) END AS local_event_name,
       CASE WHEN fe.fetch_status = 'ok' THEN 'ok' ELSE 'needs_check' END    AS local_event_status
  FROM daily_record r
  LEFT JOIN env_fetch_job fw ON fw.region_code = r.region_code_at_record
                            AND fw.target_date = r.record_date AND fw.data_kind = 'weather'
  LEFT JOIN weather_observation wo ON wo.region_code = r.region_code_at_record
                                  AND wo.obs_date = r.record_date
  LEFT JOIN env_fetch_job fh ON fh.region_code = r.region_code_at_record
                            AND fh.target_date = r.record_date AND fh.data_kind = 'holiday'
  LEFT JOIN calendar_day cd ON cd.cal_date = r.record_date
  LEFT JOIN env_fetch_job fe ON fe.region_code = r.region_code_at_record
                            AND fe.target_date = r.record_date AND fe.data_kind = 'local_event';

CREATE OR REPLACE VIEW v_store_month_summary AS
SELECT r.store_id,
       r.record_date - INTERVAL (DAY(r.record_date) - 1) DAY AS month_start,   -- [M4]
       COUNT(*)                                              AS recorded_days,
       SUM(CASE WHEN r.day_mood = 'good'   THEN 1 ELSE 0 END) AS good_days,
       SUM(CASE WHEN r.day_mood = 'normal' THEN 1 ELSE 0 END) AS normal_days,
       SUM(CASE WHEN r.day_mood = 'bad'    THEN 1 ELSE 0 END) AS bad_days
  FROM daily_record r
 GROUP BY r.store_id, r.record_date - INTERVAL (DAY(r.record_date) - 1) DAY;

CREATE OR REPLACE VIEW v_anon_source AS
SELECT r.record_id, r.store_id, r.record_date, r.record_dow, r.day_mood, r.customer_level,
       rs.scope_region_code AS region_code,
       bs.scope_bt_code     AS business_type_code,
       r.record_date - INTERVAL (r.record_dow - 1) DAY AS week_start            -- [M4] 월요일 시작
  FROM daily_record r
  JOIN v_gate_g4_store g ON g.store_id = r.store_id AND g.g4_pass
  JOIN region rg ON rg.region_code = r.region_code_at_record
  JOIN (SELECT region_code AS own_code, region_code AS scope_region_code FROM region
        UNION ALL
        SELECT region_code, parent_region_code FROM region WHERE parent_region_code IS NOT NULL) rs
    ON rs.own_code = r.region_code_at_record
  JOIN (SELECT business_type_code AS own_code, business_type_code AS scope_bt_code FROM business_type
        UNION ALL
        SELECT business_type_code, '*' FROM business_type) bs
    ON bs.own_code = r.business_type_code_at_record;

CREATE OR REPLACE VIEW v_anon_cell_all AS
SELECT x.region_code, x.business_type_code, x.week_start, x.dim_kind, x.dim_value,
       COUNT(DISTINCT x.store_id)                                   AS n_stores,
       COUNT(*)                                                     AS n_records,
       AVG(CASE WHEN x.day_mood = 'good' THEN 1.0 ELSE 0.0 END)     AS good_ratio,
       AVG(CASE WHEN x.customer_level = 'few' THEN 1.0 ELSE 0.0 END) AS few_ratio,
       fn_gate_g5(COUNT(DISTINCT x.store_id))                       AS g5_pass
  FROM (SELECT s.*, 'overall' AS dim_kind, '*' AS dim_value FROM v_anon_source s
        UNION ALL
        SELECT s.*, 'dow', CAST(s.record_dow AS CHAR(2)) FROM v_anon_source s
        UNION ALL
        SELECT s.*, 'weather', e.weather_code FROM v_anon_source s
          JOIN v_record_env e ON e.record_id = s.record_id AND e.weather_status = 'ok'
        UNION ALL
        SELECT s.*, 'local_event',
               CASE WHEN e.local_event_name IS NULL THEN 'none' ELSE 'event' END
          FROM v_anon_source s
          JOIN v_record_env e ON e.record_id = s.record_id AND e.local_event_status = 'ok') x
 GROUP BY x.region_code, x.business_type_code, x.week_start, x.dim_kind, x.dim_value;

CREATE OR REPLACE VIEW v_anon_rollup_guard AS
SELECT b.region_code AS region_code, '*' AS business_type_code, b.week_start, b.dim_kind, b.dim_value
  FROM v_anon_cell_all b
 WHERE NOT b.g5_pass AND b.business_type_code <> '*'
   AND NOT EXISTS (SELECT 1 FROM region c WHERE c.parent_region_code = b.region_code)
UNION
SELECT r.parent_region_code, b.business_type_code, b.week_start, b.dim_kind, b.dim_value
  FROM v_anon_cell_all b JOIN region r ON r.region_code = b.region_code
 WHERE NOT b.g5_pass AND b.business_type_code <> '*' AND r.parent_region_code IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM region c WHERE c.parent_region_code = b.region_code)
UNION
SELECT r.parent_region_code, '*', b.week_start, b.dim_kind, b.dim_value
  FROM v_anon_cell_all b JOIN region r ON r.region_code = b.region_code
 WHERE NOT b.g5_pass AND b.business_type_code <> '*' AND r.parent_region_code IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM region c WHERE c.parent_region_code = b.region_code);

CREATE OR REPLACE VIEW v_anon_cell AS
SELECT a.region_code, a.business_type_code, a.week_start, a.dim_kind, a.dim_value,
       a.n_records, a.good_ratio, a.few_ratio
  FROM v_anon_cell_all a
 WHERE a.g5_pass
   AND NOT EXISTS (SELECT 1 FROM v_anon_rollup_guard g
                    WHERE g.region_code = a.region_code AND g.business_type_code = a.business_type_code
                      AND g.week_start = a.week_start AND g.dim_kind = a.dim_kind AND g.dim_value = a.dim_value);

CREATE OR REPLACE VIEW v_anon_problem_cell AS
SELECT c.region_code, c.business_type_code, c.week_start, d.event_type_code,
       d.n_problem_records * 1.0 / c.n_records AS problem_ratio
  FROM v_anon_cell c
  JOIN (SELECT s.region_code, s.business_type_code, s.week_start, e.event_type_code,
               COUNT(*) AS n_problem_records
          FROM v_anon_source s
          JOIN daily_record_event e ON e.record_id = s.record_id
          JOIN special_event_type t ON t.event_type_code = e.event_type_code AND t.event_kind = 'problem'
         GROUP BY s.region_code, s.business_type_code, s.week_start, e.event_type_code) d
    ON d.region_code = c.region_code AND d.business_type_code = c.business_type_code
   AND d.week_start = c.week_start
 WHERE c.dim_kind = 'overall';

CREATE OR REPLACE VIEW v_store_rail AS
SELECT s.store_id,
       EXISTS (SELECT 1 FROM daily_record r
                WHERE r.store_id = s.store_id AND r.record_date = CURRENT_DATE) AS today_recorded,
       g3.record_count,
       g3.g3_pass,
       g4.g4_pass,
       COALESCE((SELECT a.g5_pass FROM v_anon_cell_all a
                  WHERE a.region_code = s.region_code
                    AND a.business_type_code = s.business_type_code
                    AND a.week_start = CURRENT_DATE - INTERVAL (WEEKDAY(CURRENT_DATE)) DAY   -- [M4]
                    AND a.dim_kind = 'overall'), FALSE) AS g5_pass_this_week
  FROM store s
  JOIN v_gate_g3_store g3 ON g3.store_id = s.store_id
  JOIN v_gate_g4_store g4 ON g4.store_id = s.store_id;

CREATE OR REPLACE VIEW v_principal_permission AS
SELECT pr.principal_kind, pr.principal_id, rp.permission_code
  FROM principal_role pr
  JOIN rbac_role_permission rp ON rp.role_code = pr.role_code
 GROUP BY pr.principal_kind, pr.principal_id, rp.permission_code;
