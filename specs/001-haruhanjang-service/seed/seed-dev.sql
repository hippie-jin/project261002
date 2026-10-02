-- =====================================================================
-- 하루한장 seed-dev.sql — 개발·시연 전용 체험 데이터
-- 전제: 0001_sd03_baseline.sql, 0002_plan_deltas.sql, seed-base.sql 적용 후 실행
-- 실행: backend/db/scripts/seed.ts 가 한 커넥션에서 실행한다(임시 테이블 사용).
--   러너가 먼저 실행:  SET time_zone = '+09:00'; SET @auth_pepper = <AUTH_SUBJECT_PEPPER>;
--   러너가 치환:       __BCRYPT_DEV_PASSWORD__ → bcrypt('hrh-dev-1234') 해시
-- 멱등: 시드 ID 대역(가게 900001~, 기관 910001~, 기관 계정 911001~, 운영 920001~, 결제·보고서 930001~)과
--       'DEV-' 접두 코드만 지우고 다시 만든다. 그 밖의 데이터는 건드리지 않는다.
-- 날짜: 전부 CURRENT_DATE 기준 상대 날짜 — 언제 실행해도 같은 체험이 된다.
-- 운영 DB에서 실행 금지. 러너는 NODE_ENV=production 이면 거부한다(tasks T016).
-- 페르소나와 체험 시나리오: seed/README.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 이전 시드 정리 (자식 → 부모 순. 0002 의 CASCADE 유무와 무관하게 동작)
-- ---------------------------------------------------------------------
DELETE FROM gate_event
 WHERE (subject_kind = 'store'         AND subject_id BETWEEN 900001 AND 900999)
    OR (subject_kind = 'org'           AND subject_id BETWEEN 910001 AND 910999)
    OR (subject_kind = 'report_export' AND subject_id BETWEEN 930001 AND 930999);
DELETE FROM rbac_grant_event
 WHERE (principal_kind = 'owner' AND principal_id BETWEEN 900001 AND 900999)
    OR (principal_kind = 'org'   AND principal_id BETWEEN 911001 AND 911999)
    OR (principal_kind = 'staff' AND principal_id BETWEEN 920001 AND 920999);
DELETE FROM principal_role
 WHERE (principal_kind = 'owner' AND principal_id BETWEEN 900001 AND 900999)
    OR (principal_kind = 'org'   AND principal_id BETWEEN 911001 AND 911999)
    OR (principal_kind = 'staff' AND principal_id BETWEEN 920001 AND 920999);
DELETE FROM report_export   WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM entitlement     WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM payment_attempt WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM alert           WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM daily_record_event
 WHERE record_id IN (SELECT record_id FROM daily_record WHERE store_id BETWEEN 900001 AND 900999);
DELETE FROM daily_record      WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM store_closed_day  WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM store             WHERE store_id BETWEEN 900001 AND 900999;
DELETE FROM push_subscription WHERE account_id BETWEEN 900001 AND 900999;
DELETE FROM auth_identity     WHERE account_id BETWEEN 900001 AND 900999;
DELETE FROM owner_credential  WHERE account_id BETWEEN 900001 AND 900999;
DELETE FROM consent_event     WHERE account_id BETWEEN 900001 AND 900999;
DELETE FROM account           WHERE account_id BETWEEN 900001 AND 900999;
DELETE FROM org_query_log     WHERE org_id BETWEEN 910001 AND 910999;
DELETE FROM org_account       WHERE org_id BETWEEN 910001 AND 910999;
DELETE FROM org_jurisdiction  WHERE org_id BETWEEN 910001 AND 910999;
DELETE FROM organization      WHERE org_id BETWEEN 910001 AND 910999;
DELETE FROM staff_account     WHERE staff_account_id BETWEEN 920001 AND 920999;
DELETE FROM weather_observation WHERE region_code LIKE 'DEV-%';
DELETE FROM env_fetch_job       WHERE region_code LIKE 'DEV-%';
DELETE FROM region_event        WHERE region_code LIKE 'DEV-%';

-- ---------------------------------------------------------------------
-- 1. 샘플 코드 (실제 행정 코드가 아님 — 'DEV-' 접두와 '(샘플)' 표기)
-- ---------------------------------------------------------------------
INSERT INTO region (region_code, region_name, parent_region_code, weather_station_id)
SELECT v.c, v.n, v.p, v.w FROM (
            SELECT 'DEV-MAPO' AS c, '마포구(샘플)' AS n, CAST(NULL AS CHAR(20)) AS p, '108' AS w
  UNION ALL SELECT 'DEV-SDM',  '서대문구(샘플)', NULL, '108') v
WHERE NOT EXISTS (SELECT 1 FROM region r WHERE r.region_code = v.c);

INSERT INTO region (region_code, region_name, parent_region_code, weather_station_id)
SELECT v.c, v.n, v.p, v.w FROM (
            SELECT 'DEV-MANGWON' AS c, '망원동(샘플)' AS n, 'DEV-MAPO' AS p, '108' AS w
  UNION ALL SELECT 'DEV-HAPJEONG', '합정동(샘플)', 'DEV-MAPO', '108'
  UNION ALL SELECT 'DEV-SEOGYO',   '서교동(샘플)', 'DEV-MAPO', '108'
  UNION ALL SELECT 'DEV-YEONHUI',  '연희동(샘플)', 'DEV-SDM',  '108') v
WHERE NOT EXISTS (SELECT 1 FROM region r WHERE r.region_code = v.c);

INSERT INTO business_type (business_type_code, business_type_name)
SELECT v.c, v.n FROM (
            SELECT 'DEV-SNACK' AS c, '분식(샘플)' AS n
  UNION ALL SELECT 'DEV-CAFE',   '카페(샘플)'
  UNION ALL SELECT 'DEV-KOREAN', '한식(샘플)'
  UNION ALL SELECT 'DEV-BEAUTY', '미용(샘플)') v
WHERE NOT EXISTS (SELECT 1 FROM business_type b WHERE b.business_type_code = v.c);

INSERT INTO sales_band (sales_band_code, sales_band_label, sort_order)
SELECT v.c, v.l, v.o FROM (
            SELECT 'DEV-B1' AS c, '하루 30만 원 미만(샘플)' AS l, 901 AS o
  UNION ALL SELECT 'DEV-B2', '30~60만 원(샘플)',      902
  UNION ALL SELECT 'DEV-B3', '60만 원 이상(샘플)',    903) v
WHERE NOT EXISTS (SELECT 1 FROM sales_band s WHERE s.sales_band_code = v.c);

-- 개발 전용 기준값. g3·경보 기간은 명세 Assumptions 제안값, g5·하락 폭은 체험용 임의값(운영 근거 아님)
UPDATE threshold_setting SET setting_value = 14,   updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'g3_min_records';
UPDATE threshold_setting SET setting_value = 5,    updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'g5_min_stores';
UPDATE threshold_setting SET setting_value = 14,   updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'alert_window_days';
UPDATE threshold_setting SET setting_value = 0.30, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'alert_min_decline';

-- ---------------------------------------------------------------------
-- 2. 일련번호 보조 테이블 (0~99)
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS seed_seq;
CREATE TEMPORARY TABLE seed_seq (n INT NOT NULL PRIMARY KEY);
INSERT INTO seed_seq (n)
SELECT a.d + 10 * b.d
  FROM (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
 CROSS JOIN
       (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b;

-- ---------------------------------------------------------------------
-- 3. 사장님 계정·동의·가게 (가게 ID = 계정 ID)
-- ---------------------------------------------------------------------
INSERT INTO account (account_id, created_at) VALUES
  (900001, CURRENT_TIMESTAMP - INTERVAL 7 DAY),     -- owner-starter
  (900002, CURRENT_TIMESTAMP - INTERVAL 62 DAY),    -- owner-steady
  (900003, CURRENT_TIMESTAMP - INTERVAL 44 DAY),    -- owner-declining
  (900004, CURRENT_TIMESTAMP - INTERVAL 32 DAY),    -- owner-paid
  (900005, CURRENT_TIMESTAMP - INTERVAL 37 DAY),    -- owner-neighbor-1
  (900006, CURRENT_TIMESTAMP - INTERVAL 37 DAY),    -- owner-neighbor-2
  (900007, CURRENT_TIMESTAMP - INTERVAL 37 DAY),    -- owner-neighbor-3
  (900008, CURRENT_TIMESTAMP - INTERVAL 22 DAY),    -- owner-cafe-neighbor
  (900009, CURRENT_TIMESTAMP - INTERVAL 12 DAY);    -- owner-yeonhui

-- 개발용 로그인 식별자: subject_hash = SHA-256(pepper ':dev:' subject) — research R8
INSERT INTO auth_identity (account_id, provider, subject_hash)
SELECT v.id, 'dev', SHA2(CONCAT(@auth_pepper, ':dev:', v.s), 256) FROM (
            SELECT 900001 AS id, 'owner-starter' AS s
  UNION ALL SELECT 900002, 'owner-steady'
  UNION ALL SELECT 900003, 'owner-declining'
  UNION ALL SELECT 900004, 'owner-paid'
  UNION ALL SELECT 900005, 'owner-neighbor-1'
  UNION ALL SELECT 900006, 'owner-neighbor-2'
  UNION ALL SELECT 900007, 'owner-neighbor-3'
  UNION ALL SELECT 900008, 'owner-cafe-neighbor'
  UNION ALL SELECT 900009, 'owner-yeonhui') v;

-- 사장님 아이디·비밀번호 로그인(0005): 아이디 = 체험 subject, 비밀번호 = SEED_DEV_PASSWORD
INSERT INTO owner_credential (account_id, login_id, password_hash)
SELECT v.id, v.s, '__BCRYPT_DEV_PASSWORD__' FROM (
            SELECT 900001 AS id, 'owner-starter' AS s
  UNION ALL SELECT 900002, 'owner-steady'
  UNION ALL SELECT 900003, 'owner-declining'
  UNION ALL SELECT 900004, 'owner-paid'
  UNION ALL SELECT 900005, 'owner-neighbor-1'
  UNION ALL SELECT 900006, 'owner-neighbor-2'
  UNION ALL SELECT 900007, 'owner-neighbor-3'
  UNION ALL SELECT 900008, 'owner-cafe-neighbor'
  UNION ALL SELECT 900009, 'owner-yeonhui') v;

-- 필수 동의: 전원. 익명 통계 참여: 900001(starter) 만 미동의
INSERT INTO consent_event (account_id, consent_item_code, is_agreed, occurred_at)
SELECT a.account_id, 'service', TRUE, a.created_at FROM account a WHERE a.account_id BETWEEN 900001 AND 900009;
INSERT INTO consent_event (account_id, consent_item_code, is_agreed, occurred_at)
SELECT a.account_id, 'anon_stats', a.account_id <> 900001, a.created_at FROM account a WHERE a.account_id BETWEEN 900001 AND 900009;

INSERT INTO store (store_id, account_id, business_type_code, region_code, closed_days_set_at, alert_push_enabled, created_at) VALUES
  (900001, 900001, 'DEV-SNACK',  'DEV-MANGWON',  NULL,                                  TRUE,  CURRENT_TIMESTAMP - INTERVAL 7 DAY),
  (900002, 900002, 'DEV-SNACK',  'DEV-MANGWON',  CURRENT_TIMESTAMP - INTERVAL 62 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 62 DAY),
  (900003, 900003, 'DEV-SNACK',  'DEV-MANGWON',  CURRENT_TIMESTAMP - INTERVAL 44 DAY,   FALSE, CURRENT_TIMESTAMP - INTERVAL 44 DAY),
  (900004, 900004, 'DEV-CAFE',   'DEV-HAPJEONG', CURRENT_TIMESTAMP - INTERVAL 32 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 32 DAY),
  (900005, 900005, 'DEV-SNACK',  'DEV-MANGWON',  CURRENT_TIMESTAMP - INTERVAL 37 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 37 DAY),
  (900006, 900006, 'DEV-SNACK',  'DEV-MANGWON',  CURRENT_TIMESTAMP - INTERVAL 37 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 37 DAY),
  (900007, 900007, 'DEV-SNACK',  'DEV-MANGWON',  CURRENT_TIMESTAMP - INTERVAL 37 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 37 DAY),
  (900008, 900008, 'DEV-CAFE',   'DEV-HAPJEONG', CURRENT_TIMESTAMP - INTERVAL 22 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 22 DAY),
  (900009, 900009, 'DEV-KOREAN', 'DEV-YEONHUI',  CURRENT_TIMESTAMP - INTERVAL 12 DAY,   TRUE,  CURRENT_TIMESTAMP - INTERVAL 12 DAY);

-- 쉬는 요일: steady 일요일(7), cafe 월요일(1). declining 은 "쉬는 날 없음"(set_at 있음 + 0행), starter 는 "미입력"(set_at NULL)
INSERT INTO store_closed_day (store_id, day_of_week) VALUES (900002, 7), (900004, 1);

-- ---------------------------------------------------------------------
-- 4. 일일 기록 (n = 오늘로부터 며칠 전, dow 1=월 … 7=일)
--    *_at_record 는 INSERT…SELECT 에서 트리거보다 NOT NULL 검사가 먼저라 명시한다(트리거가 같은 값으로 덮어씀)
--    지역 공통 비 오는 날: MOD(n,7)=3 (아래 5절 날씨와 일치)
-- ---------------------------------------------------------------------

-- 900001 owner-starter: 최근 6일(1~6일 전), 오늘 미기록 → US2 첫 기록, US4 G3 차단(6일 < 14)
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, region_code_at_record, business_type_code_at_record)
SELECT 900001, s.d,
       CASE MOD(s.n, 3) WHEN 0 THEN 'good' WHEN 1 THEN 'normal' ELSE 'bad' END,
       CASE MOD(s.n, 3) WHEN 0 THEN 'many' WHEN 1 THEN 'usual' ELSE 'few' END,
       (SELECT region_code FROM store WHERE store_id = 900001), (SELECT business_type_code FROM store WHERE store_id = 900001)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d FROM seed_seq) s
 WHERE s.n BETWEEN 1 AND 6;

-- 900002 owner-steady: 0~60일 전, 일요일 휴무, MOD(n,9)=4 인 날은 기록 안 함
--   패턴: 금요일 좋음 · 비 오는 날 손님 적음 · 할인행사 날 좋음 · 주말 손님 많음
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, sales_band_code, region_code_at_record, business_type_code_at_record)
SELECT 900002, s.d,
       CASE WHEN MOD(s.n, 7) = 3 THEN (CASE WHEN MOD(s.n, 2) = 0 THEN 'bad' ELSE 'normal' END)
            WHEN s.dow = 5 THEN 'good'
            WHEN MOD(s.n, 10) = 0 THEN 'good'
            WHEN s.dow IN (1, 2) THEN 'normal'
            WHEN MOD(s.n, 3) = 0 THEN 'good'
            ELSE 'normal' END,
       CASE WHEN MOD(s.n, 7) = 3 THEN 'few'
            WHEN s.dow IN (5, 6) THEN 'many'
            ELSE 'usual' END,
       CASE WHEN MOD(s.n, 4) = 0 THEN NULL
            WHEN s.dow IN (5, 6) THEN 'DEV-B3'
            ELSE 'DEV-B2' END,
       (SELECT region_code FROM store WHERE store_id = 900002), (SELECT business_type_code FROM store WHERE store_id = 900002)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d, WEEKDAY(CURRENT_DATE - INTERVAL n DAY) + 1 AS dow FROM seed_seq) s
 WHERE s.n BETWEEN 0 AND 60 AND s.dow <> 7 AND MOD(s.n, 9) <> 4;

-- 900003 owner-declining: 1~42일 전 매일. 최근 14일은 나쁨·손님 적음, 그 전은 보통 이상 → US5 경보
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, region_code_at_record, business_type_code_at_record)
SELECT 900003, s.d,
       CASE WHEN s.n <= 14 THEN (CASE WHEN MOD(s.n, 4) = 0 THEN 'normal' ELSE 'bad' END)
            WHEN s.dow IN (5, 6) OR MOD(s.n, 3) = 0 THEN 'good'
            ELSE 'normal' END,
       CASE WHEN s.n <= 14 THEN 'few'
            WHEN s.dow IN (5, 6) THEN 'many'
            ELSE 'usual' END,
       (SELECT region_code FROM store WHERE store_id = 900003), (SELECT business_type_code FROM store WHERE store_id = 900003)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d, WEEKDAY(CURRENT_DATE - INTERVAL n DAY) + 1 AS dow FROM seed_seq) s
 WHERE s.n BETWEEN 1 AND 42;

-- 900004 owner-paid (합정 카페): 1~30일 전, 월요일 휴무 → US7 보고서 기간 충족
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, sales_band_code, region_code_at_record, business_type_code_at_record)
SELECT 900004, s.d,
       CASE WHEN s.dow IN (6, 7) THEN 'good'
            WHEN MOD(s.n, 7) = 3 THEN 'normal'
            WHEN MOD(s.n, 2) = 0 THEN 'good'
            ELSE 'normal' END,
       CASE WHEN s.dow IN (6, 7) THEN 'many'
            WHEN MOD(s.n, 7) = 3 THEN 'few'
            ELSE 'usual' END,
       CASE WHEN s.dow IN (6, 7) THEN 'DEV-B2' ELSE 'DEV-B1' END,
       (SELECT region_code FROM store WHERE store_id = 900004), (SELECT business_type_code FROM store WHERE store_id = 900004)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d, WEEKDAY(CURRENT_DATE - INTERVAL n DAY) + 1 AS dow FROM seed_seq) s
 WHERE s.n BETWEEN 1 AND 30 AND s.dow <> 1;

-- 900005~900007 망원 분식 이웃 3곳: 0~35일 전, 가게마다 다른 날 하루씩 빠짐 → 망원 분식 동의 가게 5곳(G5 통과)
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, region_code_at_record, business_type_code_at_record)
SELECT st.id, s.d,
       CASE WHEN MOD(s.n, 7) = 3 THEN 'bad'
            WHEN MOD(s.n + st.k, 3) = 0 THEN 'good'
            ELSE 'normal' END,
       CASE WHEN MOD(s.n, 7) = 3 THEN 'few'
            WHEN s.dow IN (5, 6) THEN 'many'
            ELSE 'usual' END,
       (SELECT region_code FROM store WHERE store_id = st.id), (SELECT business_type_code FROM store WHERE store_id = st.id)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d, WEEKDAY(CURRENT_DATE - INTERVAL n DAY) + 1 AS dow FROM seed_seq) s
 CROSS JOIN (SELECT 900005 AS id, 1 AS k UNION ALL SELECT 900006, 2 UNION ALL SELECT 900007, 3) st
 WHERE s.n BETWEEN 0 AND 35 AND MOD(s.n + st.k, 11) <> 0;

-- 900008 합정 카페 이웃: 0~20일 전 → 합정 카페 동의 가게 2곳(G5 미달, 표시 불가 칸)
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, region_code_at_record, business_type_code_at_record)
SELECT 900008, s.d,
       CASE WHEN s.dow IN (6, 7) THEN 'good' ELSE 'normal' END,
       CASE WHEN s.dow IN (6, 7) THEN 'many' ELSE 'usual' END,
       (SELECT region_code FROM store WHERE store_id = 900008), (SELECT business_type_code FROM store WHERE store_id = 900008)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d, WEEKDAY(CURRENT_DATE - INTERVAL n DAY) + 1 AS dow FROM seed_seq) s
 WHERE s.n BETWEEN 0 AND 20;

-- 900009 연희 한식(서대문, 기관 관할 밖): 1~10일 전
INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, region_code_at_record, business_type_code_at_record)
SELECT 900009, s.d,
       CASE WHEN MOD(s.n, 2) = 0 THEN 'good' ELSE 'normal' END,
       'usual',
       (SELECT region_code FROM store WHERE store_id = 900009), (SELECT business_type_code FROM store WHERE store_id = 900009)
  FROM (SELECT n, CURRENT_DATE - INTERVAL n DAY AS d FROM seed_seq) s
 WHERE s.n BETWEEN 1 AND 10;

-- 특별한 일
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'rain' FROM daily_record r
 WHERE r.store_id BETWEEN 900001 AND 900009 AND MOD(DATEDIFF(CURRENT_DATE, r.record_date), 7) = 3;
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'discount' FROM daily_record r
 WHERE r.store_id = 900002 AND MOD(DATEDIFF(CURRENT_DATE, r.record_date), 10) = 0;
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'new_menu' FROM daily_record r
 WHERE r.store_id = 900002 AND DATEDIFF(CURRENT_DATE, r.record_date) = 30;
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'sns_post' FROM daily_record r
 WHERE r.store_id = 900002 AND MOD(DATEDIFF(CURRENT_DATE, r.record_date), 15) = 0;
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'stock_out' FROM daily_record r
 WHERE (r.store_id = 900002 AND r.record_dow = 6 AND MOD(DATEDIFF(CURRENT_DATE, r.record_date), 2) = 0)
    OR (r.store_id = 900005 AND MOD(DATEDIFF(CURRENT_DATE, r.record_date), 6) = 1);
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'staff_absent' FROM daily_record r
 WHERE r.store_id = 900003 AND DATEDIFF(CURRENT_DATE, r.record_date) IN (3, 9, 12);
INSERT INTO daily_record_event (record_id, event_type_code)
SELECT r.record_id, 'group_guest' FROM daily_record r
 WHERE r.store_id = 900004 AND MOD(DATEDIFF(CURRENT_DATE, r.record_date), 8) = 5;

-- ---------------------------------------------------------------------
-- 5. 외부 환경데이터 (망원·합정·연희)
--    날씨: 2~60일 전 ok. 0·1일 전은 아직 없음(ASOS 일자료 지연 — research R11), 17·33일 전은 조회 실패
--    → 오늘·어제 기록과 17·33일 전 기록은 '확인 필요'로 보인다(US2-4, US3-4, US4-4)
-- ---------------------------------------------------------------------
INSERT INTO weather_observation (region_code, obs_date, weather_code)
SELECT rg.c, CURRENT_DATE - INTERVAL s.n DAY,
       CASE WHEN MOD(s.n, 7) = 3 THEN 'rain' WHEN MOD(s.n, 5) = 0 THEN 'cloudy' ELSE 'clear' END
  FROM seed_seq s
 CROSS JOIN (SELECT 'DEV-MANGWON' AS c UNION ALL SELECT 'DEV-HAPJEONG' UNION ALL SELECT 'DEV-YEONHUI') rg
 WHERE s.n BETWEEN 2 AND 60 AND s.n NOT IN (17, 33);

INSERT INTO env_fetch_job (region_code, target_date, data_kind, fetch_status, attempt_count, last_attempt_at)
SELECT rg.c, CURRENT_DATE - INTERVAL s.n DAY, 'weather',
       CASE WHEN s.n IN (17, 33) THEN 'failed' ELSE 'ok' END,
       CASE WHEN s.n IN (17, 33) THEN 3 ELSE 1 END,
       CURRENT_TIMESTAMP - INTERVAL (s.n - 1) DAY
  FROM seed_seq s
 CROSS JOIN (SELECT 'DEV-MANGWON' AS c UNION ALL SELECT 'DEV-HAPJEONG' UNION ALL SELECT 'DEV-YEONHUI') rg
 WHERE s.n BETWEEN 2 AND 60;

INSERT INTO env_fetch_job (region_code, target_date, data_kind, fetch_status, attempt_count, last_attempt_at)
SELECT rg.c, CURRENT_DATE - INTERVAL s.n DAY, k.kind, 'ok', 1, CURRENT_TIMESTAMP - INTERVAL s.n DAY
  FROM seed_seq s
 CROSS JOIN (SELECT 'DEV-MANGWON' AS c UNION ALL SELECT 'DEV-HAPJEONG' UNION ALL SELECT 'DEV-YEONHUI') rg
 CROSS JOIN (SELECT 'holiday' AS kind UNION ALL SELECT 'local_event') k
 WHERE s.n BETWEEN 0 AND 60;

-- 공휴일 표: 범위 안 날짜를 평일로 채운 뒤 2026년 공휴일만 표시(다른 해에 실행하면 공휴일 없음으로 보인다)
INSERT INTO calendar_day (cal_date, is_holiday, holiday_name)
SELECT CURRENT_DATE - INTERVAL s.n DAY, FALSE, NULL FROM seed_seq s
 WHERE s.n BETWEEN 0 AND 60
   AND NOT EXISTS (SELECT 1 FROM calendar_day c WHERE c.cal_date = CURRENT_DATE - INTERVAL s.n DAY);
UPDATE calendar_day SET is_holiday = TRUE, holiday_name = '광복절'          WHERE cal_date = DATE '2026-08-15';
UPDATE calendar_day SET is_holiday = TRUE, holiday_name = '추석 연휴'       WHERE cal_date IN (DATE '2026-09-24', DATE '2026-09-26');
UPDATE calendar_day SET is_holiday = TRUE, holiday_name = '추석'            WHERE cal_date = DATE '2026-09-25';
UPDATE calendar_day SET is_holiday = TRUE, holiday_name = '개천절'          WHERE cal_date = DATE '2026-10-03';
UPDATE calendar_day SET is_holiday = TRUE, holiday_name = '대체공휴일(개천절)' WHERE cal_date = DATE '2026-10-05';

-- 지역행사(가상): 18~20일 전 망원동 → US8 지역행사 관점, US3 달력 행사 표시
INSERT INTO region_event (region_code, event_name, start_date, end_date) VALUES
  ('DEV-MANGWON', '망원 한강 축제(샘플)', CURRENT_DATE - INTERVAL 20 DAY, CURRENT_DATE - INTERVAL 18 DAY);

-- ---------------------------------------------------------------------
-- 6. 경보 (G3 트리거 통과: 판정 기간 14일 기록 ≥ 기준 14)
-- ---------------------------------------------------------------------
INSERT INTO alert (store_id, window_start, window_end, trend_code, confidence_level, display_channel, alert_status, created_at) VALUES
  (900003, CURRENT_DATE - INTERVAL 14 DAY, CURRENT_DATE - INTERVAL 1 DAY, 'decline', 'medium', 'in_app', 'new',
   CURRENT_TIMESTAMP - INTERVAL 20 HOUR);

-- ---------------------------------------------------------------------
-- 7. 유료 (owner-paid): 실패 1건 → 성공 1건 → 보고서 권한 → 확인 전 보고서 1건(G7)
--    백업·내보내기 권한은 없음 → G6 체험
-- ---------------------------------------------------------------------
INSERT INTO payment_attempt (payment_attempt_id, store_id, feature_code, payment_result, external_ref, attempted_at) VALUES
  (930101, 900004, 'report', 'failed',  'mock-fail-001', CURRENT_TIMESTAMP - INTERVAL 3 DAY),
  (930102, 900004, 'report', 'success', 'mock-ok-002',   CURRENT_TIMESTAMP - INTERVAL 2 DAY);
INSERT INTO entitlement (entitlement_id, store_id, feature_code, payment_attempt_id, granted_at, valid_until) VALUES
  (930201, 900004, 'report', 930102, CURRENT_TIMESTAMP - INTERVAL 2 DAY, NULL);
INSERT INTO report_export (export_id, store_id, entitlement_id, export_kind, period_start, period_end,
                           record_count_snapshot, confidence_snapshot, export_status, created_at)
SELECT 930301, 900004, 930201, 'report', CURRENT_DATE - INTERVAL 28 DAY, CURRENT_DATE - INTERVAL 1 DAY,
       COUNT(*), 'medium', 'generated', CURRENT_TIMESTAMP - INTERVAL 1 DAY
  FROM daily_record
 WHERE store_id = 900004 AND record_date BETWEEN CURRENT_DATE - INTERVAL 28 DAY AND CURRENT_DATE - INTERVAL 1 DAY;

-- ---------------------------------------------------------------------
-- 8. 기관 (조회 이력은 트리거가 G8·관할을 검사)
-- ---------------------------------------------------------------------
INSERT INTO organization (org_id, org_name, contract_status, contract_end_date) VALUES
  (910001, '○○구청 지역경제과(샘플)', 'active',  NULL),
  (910002, '△△상인회(샘플)',          'expired', CURRENT_DATE - INTERVAL 10 DAY);
INSERT INTO org_jurisdiction (org_id, region_code) VALUES (910001, 'DEV-MAPO'), (910002, 'DEV-MAPO');
INSERT INTO org_account (org_account_id, org_id, login_id, password_hash) VALUES
  (911001, 910001, 'mapo-econ',        '__BCRYPT_DEV_PASSWORD__'),
  (911002, 910002, 'expired-merchant', '__BCRYPT_DEV_PASSWORD__');
INSERT INTO org_query_log (org_id, region_code, business_type_code, period_start, period_end, perspective_code, queried_at) VALUES
  (910001, 'DEV-MAPO', NULL, CURRENT_DATE - INTERVAL 27 DAY, CURRENT_DATE, 'overall', CURRENT_TIMESTAMP - INTERVAL 1 DAY);

-- ---------------------------------------------------------------------
-- 9. 운영 인력
-- ---------------------------------------------------------------------
INSERT INTO staff_account (staff_account_id, login_id, password_hash, display_name) VALUES
  (920001, 'admin',        '__BCRYPT_DEV_PASSWORD__', '시스템 관리자(샘플)'),
  (920002, 'data-manager', '__BCRYPT_DEV_PASSWORD__', '데이터 담당자(샘플)'),
  (920003, 'operator',     '__BCRYPT_DEV_PASSWORD__', '현장 운영자(샘플)'),
  (920004, 'auditor',      '__BCRYPT_DEV_PASSWORD__', '감사 담당자(샘플)');

-- ---------------------------------------------------------------------
-- 10. 역할 부여 (trg_principal_role_bi 가 주체 존재·종류를 검사)
-- ---------------------------------------------------------------------
INSERT INTO principal_role (principal_kind, principal_id, role_code)
SELECT 'owner', a.account_id, 'owner' FROM account a WHERE a.account_id BETWEEN 900001 AND 900009;
INSERT INTO principal_role (principal_kind, principal_id, role_code) VALUES
  ('org',   911001, 'org_viewer'),
  ('org',   911002, 'org_viewer'),
  ('staff', 920001, 'admin'),
  ('staff', 920002, 'data_manager'),
  ('staff', 920003, 'operator'),
  ('staff', 920004, 'auditor');
INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action, acted_by_staff)
SELECT principal_kind, principal_id, role_code, 'grant', NULL FROM principal_role
 WHERE (principal_kind = 'owner' AND principal_id BETWEEN 900001 AND 900999)
    OR (principal_kind = 'org'   AND principal_id BETWEEN 911001 AND 911999)
    OR (principal_kind = 'staff' AND principal_id BETWEEN 920001 AND 920999);

-- ---------------------------------------------------------------------
-- 11. 게이트 이력 (운영 콘솔 감사 탭 체험)
-- ---------------------------------------------------------------------
INSERT INTO gate_event (gate_code, subject_kind, subject_id, screen_code, opened_at, released_at, release_action) VALUES
  ('G3', 'store',         900001, 'S3', CURRENT_TIMESTAMP - INTERVAL 2 DAY,  NULL, NULL),
  ('G4', 'store',         900001, 'S5', CURRENT_TIMESTAMP - INTERVAL 1 DAY,  NULL, NULL),
  ('G5', 'store',         900008, 'S5', CURRENT_TIMESTAMP - INTERVAL 1 DAY,  NULL, NULL),
  ('G6', 'store',         900004, 'S6', CURRENT_TIMESTAMP - INTERVAL 3 DAY,  CURRENT_TIMESTAMP - INTERVAL 2 DAY, 'payment_success'),
  ('G7', 'report_export', 930301, 'S6', CURRENT_TIMESTAMP - INTERVAL 1 DAY,  NULL, NULL),
  ('G8', 'org',           910002, 'S7', CURRENT_TIMESTAMP - INTERVAL 10 DAY, NULL, NULL);

DROP TEMPORARY TABLE IF EXISTS seed_seq;
