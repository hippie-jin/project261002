-- =====================================================================
-- 하루한장 (HRH) 데이터베이스 DDL — SD_03_데이터베이스설계서_하루한장.md 부속
-- 작성일 2026-10-02
--
-- 기준: 표준 SQL. 실행 검증: MariaDB 12.0.2 (무오류 · 재실행 멱등 · 위반 거부 — SD_03 §15-2)
-- 실행: mariadb --default-character-set=utf8mb4 <db> < hrh_ddl.sql
--       (트리거·함수 본문 때문에 DELIMITER 를 쓰므로 mariadb CLI 로 실행한다)
--
-- 멱등 규약
--   테이블  : CREATE TABLE IF NOT EXISTS (제약은 테이블 정의 안에 둔다)
--   함수·트리거 : DROP ... IF EXISTS 후 CREATE
--   뷰      : CREATE OR REPLACE VIEW
--   기준 데이터 : INSERT ... SELECT ... WHERE NOT EXISTS
--
-- DBMS 전용 구문 (표준과 다른 곳과 그 이유)
--   [M1] AUTO_INCREMENT      — MariaDB 는 표준 GENERATED ... AS IDENTITY 를 지원하지 않는다
--   [M2] DELIMITER, SIGNAL SQLSTATE '45000' — 트리거·함수 본문 구분과 사용자 오류. 의미는 SQL/PSM 의 SIGNAL 과 같다
--   [M3] 트리거·함수 본문    — SQL/PSM 의 MariaDB 방언
--   [M4] WEEKDAY(), INTERVAL n DAY — 표준 EXTRACT(DOW)·날짜 산술이 MariaDB 에 없거나 다르다
--   [M5] GENERATED ... VIRTUAL — 표준 GENERATED ALWAYS AS (expr) 에 저장 방식 키워드를 붙인 형태
--   [M6] CREATE ROLE IF NOT EXISTS — 표준 CREATE ROLE 에 멱등 절을 붙인 형태
--
-- 설계 이탈 기록 (논리 설계와 다르게 구현한 곳)
--   (1) CHECK 안에서 CURRENT_DATE 를 쓸 수 없다(MariaDB 는 비결정 함수를 CHECK 에서 거부)
--       → "미래 날짜 기록 금지"는 트리거 trg_daily_record_bi 로 옮겼다
--   (2) 데이터 암호화(BR-HRH-03)는 테이블 옵션 ENCRYPTED=YES 대신 서버 설정(저장 데이터 암호화)으로 둔다.
--       키 관리 플러그인이 정해지지 않아 DDL 에 넣으면 실행이 실패한다 — SD_03 §16, §18
--   (3) 트리거에서 SELECT ... INTO NEW.col 이 거부된다(ERROR 1327) → SET NEW.col = (SELECT ...) 로 바꿨다
-- =====================================================================

-- ---------------------------------------------------------------------
-- G. 공통 코드 · 기준값 (다른 모든 영역이 참조 → 먼저 만든다)
-- ---------------------------------------------------------------------

-- 지역. 상위 지역(구) - 하위 지역(동) 2단 참조. 지역 체계·목록은 미정(SD_03 §18)
CREATE TABLE IF NOT EXISTS region (
  region_code         VARCHAR(20)  NOT NULL,
  region_name         VARCHAR(50)  NOT NULL,
  parent_region_code  VARCHAR(20)  NULL,
  CONSTRAINT pk_region PRIMARY KEY (region_code),
  CONSTRAINT fk_region_parent FOREIGN KEY (parent_region_code) REFERENCES region (region_code),
  CONSTRAINT chk_region_not_self CHECK (parent_region_code IS NULL OR parent_region_code <> region_code)
);

-- 업종. 목록 미정(SD_03 §18)
CREATE TABLE IF NOT EXISTS business_type (
  business_type_code  VARCHAR(20)  NOT NULL,
  business_type_name  VARCHAR(50)  NOT NULL,
  CONSTRAINT pk_business_type PRIMARY KEY (business_type_code)
);

-- 특별한 일 종류. UC2 기본흐름 4 의 7개 버튼
CREATE TABLE IF NOT EXISTS special_event_type (
  event_type_code     VARCHAR(20)  NOT NULL,
  event_type_label    VARCHAR(30)  NOT NULL,
  event_kind          VARCHAR(10)  NOT NULL,
  CONSTRAINT pk_special_event_type PRIMARY KEY (event_type_code),
  -- condition: 비 / activity: 할인·신메뉴·SNS·단체 / problem: 현장 문제(P3 3.6, P7 7.4 반복 문제)
  CONSTRAINT chk_set_kind CHECK (event_kind IN ('condition', 'activity', 'problem'))
);

-- BR-HRH-06: 매출은 구간으로만. 구간 값은 미정이라 행을 넣지 않는다
CREATE TABLE IF NOT EXISTS sales_band (
  sales_band_code     VARCHAR(20)  NOT NULL,
  sales_band_label    VARCHAR(30)  NOT NULL,
  sort_order          SMALLINT     NOT NULL,
  CONSTRAINT pk_sales_band PRIMARY KEY (sales_band_code),
  CONSTRAINT uq_sales_band_order UNIQUE (sort_order)
);

-- 동의 항목. UC1: 필수 동의(service) · 익명 통계 참여(anon_stats)
CREATE TABLE IF NOT EXISTS consent_item (
  consent_item_code   VARCHAR(20)  NOT NULL,
  consent_item_label  VARCHAR(50)  NOT NULL,
  is_required         BOOLEAN      NOT NULL,
  CONSTRAINT pk_consent_item PRIMARY KEY (consent_item_code)
);

-- 게이트 기준값. 원천에 수치가 없어 값은 NULL 로 둔다(근거 규율 4).
-- NULL 이면 해당 게이트는 "통과 불가"로 판정된다 — 안전 쪽 기본값
CREATE TABLE IF NOT EXISTS threshold_setting (
  setting_key         VARCHAR(30)    NOT NULL,
  setting_value       DECIMAL(10,2)  NULL,
  unit_label          VARCHAR(20)    NOT NULL,
  updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_threshold_setting PRIMARY KEY (setting_key),
  CONSTRAINT chk_threshold_key CHECK (setting_key IN
    ('g3_min_records', 'g5_min_stores', 'alert_window_days', 'alert_min_decline')),
  CONSTRAINT chk_threshold_nonneg CHECK (setting_value IS NULL OR setting_value >= 0)
);

-- ---------------------------------------------------------------------
-- A. 가게 · 동의 (P1)
-- ---------------------------------------------------------------------

-- BR-HRH-01: 개인 식별 정보 컬럼을 두지 않는다. 가입 수단이 정해지면 그때 추가(SD_03 §18)
CREATE TABLE IF NOT EXISTS account (
  account_id          BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_account PRIMARY KEY (account_id)
);

-- 동의는 덮어쓰지 않고 사건으로 쌓는다(현재 상태는 v_consent_current)
CREATE TABLE IF NOT EXISTS consent_event (
  consent_event_id    BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  account_id          BIGINT       NOT NULL,
  consent_item_code   VARCHAR(20)  NOT NULL,
  is_agreed           BOOLEAN      NOT NULL,
  occurred_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_consent_event PRIMARY KEY (consent_event_id),
  CONSTRAINT fk_ce_account FOREIGN KEY (account_id) REFERENCES account (account_id),
  CONSTRAINT fk_ce_item FOREIGN KEY (consent_item_code) REFERENCES consent_item (consent_item_code)
);
CREATE INDEX IF NOT EXISTS ix_ce_account_item ON consent_event (account_id, consent_item_code, occurred_at);

CREATE TABLE IF NOT EXISTS store (
  store_id            BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  account_id          BIGINT       NOT NULL,
  business_type_code  VARCHAR(20)  NOT NULL,                  -- G1 / UC1 E2
  region_code         VARCHAR(20)  NOT NULL,                  -- G1 / UC1 E2
  closed_days_set_at  TIMESTAMP    NULL,                      -- NULL = 쉬는 요일 미입력(UC1 A2). 0행과 구분
  alert_push_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,     -- BR-HRH-18 / UC6 A1
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_store PRIMARY KEY (store_id),
  CONSTRAINT uq_store_account UNIQUE (account_id),
  CONSTRAINT fk_store_account FOREIGN KEY (account_id) REFERENCES account (account_id),
  CONSTRAINT fk_store_bt FOREIGN KEY (business_type_code) REFERENCES business_type (business_type_code),
  CONSTRAINT fk_store_region FOREIGN KEY (region_code) REFERENCES region (region_code)
);

CREATE TABLE IF NOT EXISTS store_closed_day (
  store_id            BIGINT       NOT NULL,
  day_of_week         SMALLINT     NOT NULL,                  -- 1=월 … 7=일
  CONSTRAINT pk_store_closed_day PRIMARY KEY (store_id, day_of_week),
  CONSTRAINT fk_scd_store FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE,
  CONSTRAINT chk_scd_dow CHECK (day_of_week BETWEEN 1 AND 7)
);

-- ---------------------------------------------------------------------
-- B. 일일 기록 (P2)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_record (
  record_id                     BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  store_id                      BIGINT       NOT NULL,
  record_date                   DATE         NOT NULL,
  day_mood                      VARCHAR(10)  NOT NULL,      -- G2 / BR-HRH-05
  customer_level                VARCHAR(10)  NOT NULL,      -- G2 / BR-HRH-05
  sales_band_code               VARCHAR(20)  NULL,          -- BR-HRH-06 선택 입력. 금액 컬럼은 없다
  region_code_at_record         VARCHAR(20)  NOT NULL,      -- 유도인데 저장: 기록 시점 지역 고정(트리거가 채움)
  business_type_code_at_record  VARCHAR(20)  NOT NULL,      -- 유도인데 저장: 기록 시점 업종 고정(트리거가 채움)
  record_dow                    SMALLINT     GENERATED ALWAYS AS (WEEKDAY(record_date) + 1) VIRTUAL,  -- [M4][M5] 1=월
  revision                      INT          NOT NULL DEFAULT 1,
  created_at                    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_daily_record PRIMARY KEY (record_id),
  -- UC2 A2: 같은 날짜는 한 건. 다시 저장하면 갱신(revision 증가)
  CONSTRAINT uq_dr_store_date UNIQUE (store_id, record_date),
  CONSTRAINT fk_dr_store FOREIGN KEY (store_id) REFERENCES store (store_id),
  CONSTRAINT fk_dr_band FOREIGN KEY (sales_band_code) REFERENCES sales_band (sales_band_code),
  CONSTRAINT fk_dr_region FOREIGN KEY (region_code_at_record) REFERENCES region (region_code),
  CONSTRAINT fk_dr_bt FOREIGN KEY (business_type_code_at_record) REFERENCES business_type (business_type_code),
  -- BR-HRH-05: 오늘장사 3단계 · 손님수 3단계
  CONSTRAINT chk_dr_mood CHECK (day_mood IN ('good', 'normal', 'bad')),
  CONSTRAINT chk_dr_customer CHECK (customer_level IN ('many', 'usual', 'few')),
  CONSTRAINT chk_dr_revision CHECK (revision >= 1)
);
CREATE INDEX IF NOT EXISTS ix_dr_anon ON daily_record (region_code_at_record, business_type_code_at_record, record_date);

CREATE TABLE IF NOT EXISTS daily_record_event (
  record_id           BIGINT       NOT NULL,
  event_type_code     VARCHAR(20)  NOT NULL,
  CONSTRAINT pk_daily_record_event PRIMARY KEY (record_id, event_type_code),
  CONSTRAINT fk_dre_record FOREIGN KEY (record_id) REFERENCES daily_record (record_id) ON DELETE CASCADE,
  CONSTRAINT fk_dre_type FOREIGN KEY (event_type_code) REFERENCES special_event_type (event_type_code)
);

-- ---------------------------------------------------------------------
-- C. 외부 환경데이터 (P2 2.6 · P0)
-- BR-HRH-07: 사장님이 입력하지 않는다. 기록 행에 날씨 컬럼을 두지 않고 지역·날짜로 결합한다
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendar_day (
  cal_date            DATE         NOT NULL,
  is_holiday          BOOLEAN      NOT NULL,
  holiday_name        VARCHAR(50)  NULL,
  CONSTRAINT pk_calendar_day PRIMARY KEY (cal_date),
  CONSTRAINT chk_cd_name CHECK (is_holiday OR holiday_name IS NULL)
);

-- 날씨 값 체계(코드 목록)는 기상청 자료 형식이 정해지지 않아 자유 코드로 둔다(SD_03 §18)
CREATE TABLE IF NOT EXISTS weather_observation (
  region_code         VARCHAR(20)  NOT NULL,
  obs_date            DATE         NOT NULL,
  weather_code        VARCHAR(20)  NOT NULL,
  fetched_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_weather_observation PRIMARY KEY (region_code, obs_date),
  CONSTRAINT fk_wo_region FOREIGN KEY (region_code) REFERENCES region (region_code)
);

CREATE TABLE IF NOT EXISTS region_event (
  region_event_id     BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  region_code         VARCHAR(20)  NOT NULL,
  event_name          VARCHAR(100) NOT NULL,
  start_date          DATE         NOT NULL,
  end_date            DATE         NOT NULL,
  CONSTRAINT pk_region_event PRIMARY KEY (region_event_id),
  CONSTRAINT fk_re_region FOREIGN KEY (region_code) REFERENCES region (region_code),
  CONSTRAINT chk_re_period CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_re_region_period ON region_event (region_code, start_date, end_date);

-- 외부 조회 결과. ok 행이 없으면 해당 항목은 '확인 필요'(UC2 E1, BR-HRH-13). P0 가 재조회해 ok 로 바꾼다
CREATE TABLE IF NOT EXISTS env_fetch_job (
  region_code         VARCHAR(20)  NOT NULL,
  target_date         DATE         NOT NULL,
  data_kind           VARCHAR(12)  NOT NULL,
  fetch_status        VARCHAR(8)   NOT NULL,
  attempt_count       INT          NOT NULL DEFAULT 1,       -- 최대 재시도 횟수는 미정(SD_03 §18)
  last_attempt_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_env_fetch_job PRIMARY KEY (region_code, target_date, data_kind),
  CONSTRAINT fk_efj_region FOREIGN KEY (region_code) REFERENCES region (region_code),
  CONSTRAINT chk_efj_kind CHECK (data_kind IN ('weather', 'holiday', 'local_event')),
  CONSTRAINT chk_efj_status CHECK (fetch_status IN ('ok', 'failed')),
  CONSTRAINT chk_efj_attempt CHECK (attempt_count >= 1)
);

-- ---------------------------------------------------------------------
-- D. 경보 (P2 2.8~2.9 생성 · P3 3.1~3.2 확인)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alert (
  alert_id            BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  store_id            BIGINT       NOT NULL,
  window_start        DATE         NOT NULL,
  window_end          DATE         NOT NULL,
  trend_code          VARCHAR(20)  NOT NULL,
  confidence_level    VARCHAR(10)  NOT NULL,                  -- 유도인데 저장: 경보 당시 판정 고정
  display_channel     VARCHAR(10)  NOT NULL,                  -- push / in_app (UC6 E3, A1)
  alert_status        VARCHAR(15)  NOT NULL DEFAULT 'new',
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at     TIMESTAMP    NULL,
  CONSTRAINT pk_alert PRIMARY KEY (alert_id),
  CONSTRAINT fk_alert_store FOREIGN KEY (store_id) REFERENCES store (store_id),
  CONSTRAINT chk_alert_window CHECK (window_end >= window_start),
  CONSTRAINT chk_alert_trend CHECK (trend_code IN ('decline')),
  CONSTRAINT chk_alert_conf CHECK (confidence_level IN ('high', 'medium', 'low')),
  CONSTRAINT chk_alert_channel CHECK (display_channel IN ('push', 'in_app')),
  -- UC6 사후조건 2: 확인함 상태와 확인 시각은 함께 있다
  CONSTRAINT chk_alert_ack CHECK (
       (alert_status = 'new' AND acknowledged_at IS NULL)
    OR (alert_status = 'acknowledged' AND acknowledged_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_alert_store ON alert (store_id, alert_status, created_at);

-- ---------------------------------------------------------------------
-- E. 유료 · 내보내기 (P6)
-- ---------------------------------------------------------------------

-- 결제 시스템은 미정. 결과만 기록한다
CREATE TABLE IF NOT EXISTS payment_attempt (
  payment_attempt_id  BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  store_id            BIGINT       NOT NULL,
  feature_code        VARCHAR(20)  NOT NULL,
  payment_result      VARCHAR(10)  NOT NULL,
  external_ref        VARCHAR(100) NULL,
  attempted_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_payment_attempt PRIMARY KEY (payment_attempt_id),
  CONSTRAINT fk_pa_store FOREIGN KEY (store_id) REFERENCES store (store_id),
  CONSTRAINT chk_pa_feature CHECK (feature_code IN ('report', 'backup_export')),
  CONSTRAINT chk_pa_result CHECK (payment_result IN ('success', 'failed', 'canceled'))
);

CREATE TABLE IF NOT EXISTS entitlement (
  entitlement_id      BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  store_id            BIGINT       NOT NULL,
  feature_code        VARCHAR(20)  NOT NULL,
  payment_attempt_id  BIGINT       NOT NULL,
  granted_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until         DATE         NULL,                      -- 이용 기간 미정 → NULL(SD_03 §18)
  CONSTRAINT pk_entitlement PRIMARY KEY (entitlement_id),
  CONSTRAINT uq_ent_payment UNIQUE (payment_attempt_id),
  CONSTRAINT fk_ent_store FOREIGN KEY (store_id) REFERENCES store (store_id),
  CONSTRAINT fk_ent_payment FOREIGN KEY (payment_attempt_id) REFERENCES payment_attempt (payment_attempt_id),
  CONSTRAINT chk_ent_feature CHECK (feature_code IN ('report', 'backup_export'))
);

CREATE TABLE IF NOT EXISTS report_export (
  export_id               BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  store_id                BIGINT       NOT NULL,
  entitlement_id          BIGINT       NOT NULL,
  export_kind             VARCHAR(10)  NOT NULL,
  period_start            DATE         NULL,
  period_end              DATE         NULL,
  record_count_snapshot   INT          NOT NULL,              -- 유도인데 저장: 생성 시점 기록 수 고정
  confidence_snapshot     VARCHAR(10)  NULL,                  -- 유도인데 저장: 생성 시점 신뢰도 고정(보고서만)
  export_status           VARCHAR(10)  NOT NULL DEFAULT 'generated',
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at            TIMESTAMP    NULL,                  -- G7 포함 정보 확인 시각
  delivered_at            TIMESTAMP    NULL,
  CONSTRAINT pk_report_export PRIMARY KEY (export_id),
  CONSTRAINT fk_rx_store FOREIGN KEY (store_id) REFERENCES store (store_id),
  CONSTRAINT fk_rx_ent FOREIGN KEY (entitlement_id) REFERENCES entitlement (entitlement_id),
  CONSTRAINT chk_rx_kind CHECK (export_kind IN ('report', 'backup', 'export')),
  CONSTRAINT chk_rx_status CHECK (export_status IN ('generated', 'delivered', 'declined')),
  CONSTRAINT chk_rx_count CHECK (record_count_snapshot >= 0),
  CONSTRAINT chk_rx_conf CHECK (confidence_snapshot IS NULL OR confidence_snapshot IN ('high', 'medium', 'low')),
  -- 보고서는 기간과 신뢰도가 반드시 있다(UC7 기본흐름 4)
  CONSTRAINT chk_rx_report_period CHECK (export_kind <> 'report'
    OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start
        AND confidence_snapshot IS NOT NULL)),
  -- BR-HRH-20 / G7: 확인 없이 전달하지 않는다
  CONSTRAINT chk_rx_confirm_before_deliver CHECK (delivered_at IS NULL OR confirmed_at IS NOT NULL),
  CONSTRAINT chk_rx_delivered_state CHECK ((export_status = 'delivered') = (delivered_at IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- F. 기관 (P7)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization (
  org_id              BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  org_name            VARCHAR(100) NOT NULL,
  contract_status     VARCHAR(10)  NOT NULL,
  contract_end_date   DATE         NULL,                      -- 계약 기간 체계 미정(SD_03 §18)
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_organization PRIMARY KEY (org_id),
  CONSTRAINT chk_org_status CHECK (contract_status IN ('active', 'expired'))
);

CREATE TABLE IF NOT EXISTS org_jurisdiction (
  org_id              BIGINT       NOT NULL,
  region_code         VARCHAR(20)  NOT NULL,
  CONSTRAINT pk_org_jurisdiction PRIMARY KEY (org_id, region_code),
  CONSTRAINT fk_oj_org FOREIGN KEY (org_id) REFERENCES organization (org_id) ON DELETE CASCADE,
  CONSTRAINT fk_oj_region FOREIGN KEY (region_code) REFERENCES region (region_code)
);

-- UC8 사후조건 3: 조회 이력. 감사 대상
CREATE TABLE IF NOT EXISTS org_query_log (
  query_log_id        BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  org_id              BIGINT       NOT NULL,
  region_code         VARCHAR(20)  NOT NULL,
  business_type_code  VARCHAR(20)  NULL,                      -- NULL = 업종 전체(UC8 A2)
  period_start        DATE         NOT NULL,
  period_end          DATE         NOT NULL,
  perspective_code    VARCHAR(12)  NOT NULL,
  queried_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_org_query_log PRIMARY KEY (query_log_id),
  CONSTRAINT fk_oql_org FOREIGN KEY (org_id) REFERENCES organization (org_id),
  CONSTRAINT fk_oql_region FOREIGN KEY (region_code) REFERENCES region (region_code),
  CONSTRAINT fk_oql_bt FOREIGN KEY (business_type_code) REFERENCES business_type (business_type_code),
  CONSTRAINT chk_oql_period CHECK (period_end >= period_start),
  CONSTRAINT chk_oql_persp CHECK (perspective_code IN ('overall', 'dow', 'weather', 'local_event', 'problem'))
);

-- ---------------------------------------------------------------------
-- G. 게이트 이벤트 (1급 엔티티). 서버가 판정하는 G3~G8 의 차단·해제 이력
-- G0~G2 는 입력 완결성 게이트로 화면 버튼이 막고 NOT NULL·트리거가 최종 거부한다.
-- G0 거부는 기록하지 않는다 — 동의 전 어떤 정보도 저장하지 않는다(BR-HRH-02)
-- subject_id 는 다형 참조(store / org / report_export) → FK 대신 점검 쿼리(SD_03 §15-3)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gate_event (
  gate_event_id       BIGINT       NOT NULL AUTO_INCREMENT,   -- [M1]
  gate_code           VARCHAR(3)   NOT NULL,
  subject_kind        VARCHAR(15)  NOT NULL,
  subject_id          BIGINT       NOT NULL,
  screen_code         VARCHAR(3)   NOT NULL,
  opened_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at         TIMESTAMP    NULL,
  release_action      VARCHAR(50)  NULL,
  CONSTRAINT pk_gate_event PRIMARY KEY (gate_event_id),
  CONSTRAINT chk_ge_gate CHECK (gate_code IN ('G3', 'G4', 'G5', 'G6', 'G7', 'G8')),
  CONSTRAINT chk_ge_kind CHECK (subject_kind IN ('store', 'org', 'report_export')),
  CONSTRAINT chk_ge_screen CHECK (screen_code IN ('S3', 'S5', 'S6', 'S7')),
  -- 게이트와 대상 종류의 짝
  CONSTRAINT chk_ge_pair CHECK (
       (gate_code IN ('G3', 'G4', 'G5', 'G6') AND subject_kind = 'store')
    OR (gate_code = 'G7' AND subject_kind = 'report_export')
    OR (gate_code IN ('G5', 'G8') AND subject_kind = 'org')),
  CONSTRAINT chk_ge_release CHECK ((released_at IS NULL) = (release_action IS NULL)),
  CONSTRAINT chk_ge_order CHECK (released_at IS NULL OR released_at >= opened_at)
);
CREATE INDEX IF NOT EXISTS ix_ge_subject ON gate_event (subject_kind, subject_id, gate_code, released_at);

-- =====================================================================
-- 판정 함수 — 게이트 판정의 단일 지점
-- =====================================================================
DELIMITER $$

DROP FUNCTION IF EXISTS fn_threshold $$
CREATE FUNCTION fn_threshold(p_key VARCHAR(30)) RETURNS DECIMAL(10,2)
  READS SQL DATA
BEGIN
  DECLARE v DECIMAL(10,2) DEFAULT NULL;
  SELECT setting_value INTO v FROM threshold_setting WHERE setting_key = p_key;
  RETURN v;
END $$

-- G3 / BR-HRH-08: 기간 안 기록 수가 기준 이상이어야 통과. 기준 미정(NULL)이면 통과 불가
DROP FUNCTION IF EXISTS fn_gate_g3 $$
CREATE FUNCTION fn_gate_g3(p_store_id BIGINT, p_from DATE, p_to DATE) RETURNS BOOLEAN
  READS SQL DATA
BEGIN
  DECLARE v_min DECIMAL(10,2);
  DECLARE v_cnt INT;
  SET v_min = fn_threshold('g3_min_records');
  IF v_min IS NULL THEN RETURN FALSE; END IF;
  SELECT COUNT(*) INTO v_cnt FROM daily_record
   WHERE store_id = p_store_id AND record_date BETWEEN p_from AND p_to;
  RETURN v_cnt >= v_min;
END $$

-- G5 / BR-HRH-14: 참여 가게 수가 기준 이상이어야 통과. 기준 미정(NULL)이면 통과 불가
DROP FUNCTION IF EXISTS fn_gate_g5 $$
CREATE FUNCTION fn_gate_g5(p_store_count INT) RETURNS BOOLEAN
  READS SQL DATA
BEGIN
  DECLARE v_min DECIMAL(10,2);
  SET v_min = fn_threshold('g5_min_stores');
  IF v_min IS NULL THEN RETURN FALSE; END IF;
  RETURN p_store_count >= v_min;
END $$

DELIMITER ;

-- =====================================================================
-- 뷰 — 유도 속성의 단일 계산 지점
-- =====================================================================

-- 현재 동의 상태(항목별 최신 사건)
CREATE OR REPLACE VIEW v_consent_current AS
SELECT account_id, consent_item_code, is_agreed, occurred_at
  FROM (SELECT ce.account_id, ce.consent_item_code, ce.is_agreed, ce.occurred_at,
               ROW_NUMBER() OVER (PARTITION BY ce.account_id, ce.consent_item_code
                                  ORDER BY ce.occurred_at DESC, ce.consent_event_id DESC) AS rn
          FROM consent_event ce) t
 WHERE rn = 1;

-- G4 / BR-HRH-16: 익명 통계 참여 판정의 단일 지점
CREATE OR REPLACE VIEW v_gate_g4_store AS
SELECT s.store_id,
       COALESCE(c.is_agreed, FALSE) AS g4_pass
  FROM store s
  LEFT JOIN v_consent_current c
    ON c.account_id = s.account_id AND c.consent_item_code = 'anon_stats';

-- G3: 전체 기간 기준(S3 화면 · 진행 레일 3칸)
CREATE OR REPLACE VIEW v_gate_g3_store AS
SELECT s.store_id,
       (SELECT COUNT(*) FROM daily_record r WHERE r.store_id = s.store_id) AS record_count,
       fn_gate_g3(s.store_id, DATE '1900-01-01', CURRENT_DATE) AS g3_pass
  FROM store s;

-- G6: 기능별 유효 이용 권한
CREATE OR REPLACE VIEW v_gate_g6_store AS
SELECT e.store_id, e.feature_code, TRUE AS g6_pass
  FROM entitlement e
 WHERE e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE
 GROUP BY e.store_id, e.feature_code;

-- G8: 기관 계약 유효
CREATE OR REPLACE VIEW v_gate_g8_org AS
SELECT o.org_id,
       (o.contract_status = 'active'
        AND (o.contract_end_date IS NULL OR o.contract_end_date >= CURRENT_DATE)) AS g8_pass
  FROM organization o;

-- 기록별 외부 환경데이터 결합. ok 가 아니면 값 대신 'needs_check'(BR-HRH-13: 추정값 금지)
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

-- 월간 요약(S4 4.4)
CREATE OR REPLACE VIEW v_store_month_summary AS
SELECT r.store_id,
       r.record_date - INTERVAL (DAY(r.record_date) - 1) DAY AS month_start,   -- [M4]
       COUNT(*)                                              AS recorded_days,
       SUM(CASE WHEN r.day_mood = 'good'   THEN 1 ELSE 0 END) AS good_days,
       SUM(CASE WHEN r.day_mood = 'normal' THEN 1 ELSE 0 END) AS normal_days,
       SUM(CASE WHEN r.day_mood = 'bad'    THEN 1 ELSE 0 END) AS bad_days
  FROM daily_record r
 GROUP BY r.store_id, r.record_date - INTERVAL (DAY(r.record_date) - 1) DAY;

-- 익명 집계의 원천 행: 익명 동의 가게의 기록만(BR-HRH-16).
-- 지역은 기록 시점 지역과 그 상위 지역, 업종은 기록 시점 업종과 '*'(전체)로 펼친다(UC8 A2, S7 '마포구 전체').
-- 이 뷰는 개별 기록 단위이므로 API·기관 역할에 권한을 주지 않는다(§ 아래 GRANT).
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

-- 익명 집계 칸(전체 · 요일 · 날씨 · 지역행사). G5 판정 포함. 가게 수 n_stores 를 담으므로 내부 전용
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

-- 공개용 익명 집계(S5 · S7). G5 미달 칸은 행이 없다 → 화면은 '표시 불가'. 가게 수는 내보내지 않는다(BR-HRH-15·21)
CREATE OR REPLACE VIEW v_anon_cell AS
SELECT region_code, business_type_code, week_start, dim_kind, dim_value,
       n_records, good_ratio, few_ratio
  FROM v_anon_cell_all
 WHERE g5_pass;

-- 반복 운영 문제 익명 집계(S7 반복 문제 탭, P7 7.4). G5 는 같은 함수로 판정
CREATE OR REPLACE VIEW v_anon_problem_cell AS
SELECT c.region_code, c.business_type_code, c.week_start, d.event_type_code,
       d.n_problem_records * 1.0 / c.n_records AS problem_ratio
  FROM v_anon_cell_all c
  JOIN (SELECT s.region_code, s.business_type_code, s.week_start, e.event_type_code,
               COUNT(*) AS n_problem_records
          FROM v_anon_source s
          JOIN daily_record_event e ON e.record_id = s.record_id
          JOIN special_event_type t ON t.event_type_code = e.event_type_code AND t.event_kind = 'problem'
         GROUP BY s.region_code, s.business_type_code, s.week_start, e.event_type_code) d
    ON d.region_code = c.region_code AND d.business_type_code = c.business_type_code
   AND d.week_start = c.week_start
 WHERE c.dim_kind = 'overall' AND c.g5_pass;

-- 진행 레일(S2~S6 C2)의 단일 계산 지점
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

-- =====================================================================
-- 트리거 — CHECK 로 표현할 수 없는 다중 행·시점 의존 규칙
-- =====================================================================
DELIMITER $$

-- G0 / BR-HRH-02: 필수 동의 없이 가게 프로필을 만들 수 없다
DROP TRIGGER IF EXISTS trg_store_bi $$
CREATE TRIGGER trg_store_bi BEFORE INSERT ON store FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM v_consent_current c
                  WHERE c.account_id = NEW.account_id
                    AND c.consent_item_code = 'service' AND c.is_agreed) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'G0/BR-HRH-02: 필수 동의 기록 없이 가게 프로필을 만들 수 없음';
  END IF;
END $$

-- 기록 시점 지역·업종 고정 + 미래 날짜 금지(이탈 기록 1)
DROP TRIGGER IF EXISTS trg_daily_record_bi $$
CREATE TRIGGER trg_daily_record_bi BEFORE INSERT ON daily_record FOR EACH ROW
BEGIN
  IF NEW.record_date > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UC2: 미래 날짜는 기록할 수 없음';
  END IF;
  -- SELECT ... INTO NEW.col 은 MariaDB 에서 쓸 수 없어 SET 으로 채운다(이탈 기록 3)
  SET NEW.region_code_at_record = (SELECT region_code FROM store WHERE store_id = NEW.store_id);
  SET NEW.business_type_code_at_record = (SELECT business_type_code FROM store WHERE store_id = NEW.store_id);
END $$

-- UC2 A2: 같은 날짜 재저장은 갱신. 판본 증가, 가게·날짜·고정 스냅숏은 바꾸지 않는다
DROP TRIGGER IF EXISTS trg_daily_record_bu $$
CREATE TRIGGER trg_daily_record_bu BEFORE UPDATE ON daily_record FOR EACH ROW
BEGIN
  IF NEW.store_id <> OLD.store_id OR NEW.record_date <> OLD.record_date
     OR NEW.region_code_at_record <> OLD.region_code_at_record
     OR NEW.business_type_code_at_record <> OLD.business_type_code_at_record THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UC2 A2: 가게·날짜·기록 시점 지역/업종은 바꿀 수 없음';
  END IF;
  SET NEW.revision = OLD.revision + 1;
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END $$

-- G3 / BR-HRH-08 / UC6 E1: 판정 기간 기록이 기준 미달이면 경보를 만들 수 없다
DROP TRIGGER IF EXISTS trg_alert_bi $$
CREATE TRIGGER trg_alert_bi BEFORE INSERT ON alert FOR EACH ROW
BEGIN
  IF NOT fn_gate_g3(NEW.store_id, NEW.window_start, NEW.window_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'G3/BR-HRH-08: 기록 부족 - 경보를 만들 수 없음';
  END IF;
END $$

-- G6 / BR-HRH-19: 성공한 결제에서만 이용 권한이 생긴다
DROP TRIGGER IF EXISTS trg_entitlement_bi $$
CREATE TRIGGER trg_entitlement_bi BEFORE INSERT ON entitlement FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_attempt p
                  WHERE p.payment_attempt_id = NEW.payment_attempt_id
                    AND p.store_id = NEW.store_id
                    AND p.feature_code = NEW.feature_code
                    AND p.payment_result = 'success') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'G6/BR-HRH-19: 성공한 결제 없이 이용 권한을 만들 수 없음';
  END IF;
END $$

-- G6 + G3: 유효 권한과(보고서는) 기간 기록 충분성
DROP TRIGGER IF EXISTS trg_report_export_bi $$
CREATE TRIGGER trg_report_export_bi BEFORE INSERT ON report_export FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entitlement e
                  WHERE e.entitlement_id = NEW.entitlement_id
                    AND e.store_id = NEW.store_id
                    AND e.feature_code = CASE WHEN NEW.export_kind = 'report' THEN 'report' ELSE 'backup_export' END
                    AND (e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'G6/BR-HRH-19: 유효한 이용 권한이 없음';
  END IF;
  IF NEW.export_kind = 'report' AND NOT fn_gate_g3(NEW.store_id, NEW.period_start, NEW.period_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'G3/BR-HRH-08: 기간 기록 부족 - 보고서를 만들 수 없음';
  END IF;
END $$

-- G8 + UC8 A1: 계약 유효, 관할 안 지역(관할 지역 자신 또는 그 하위)만 조회
DROP TRIGGER IF EXISTS trg_org_query_log_bi $$
CREATE TRIGGER trg_org_query_log_bi BEFORE INSERT ON org_query_log FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM v_gate_g8_org g WHERE g.org_id = NEW.org_id AND g.g8_pass) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'G8: 이용 계약이 유효하지 않음';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_jurisdiction j
                   JOIN region r ON r.region_code = NEW.region_code
                  WHERE j.org_id = NEW.org_id
                    AND (j.region_code = r.region_code OR j.region_code = r.parent_region_code)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UC8 A1: 관할 밖 지역은 조회할 수 없음';
  END IF;
END $$

DELIMITER ;

-- =====================================================================
-- 접근 역할 — BR-HRH-21: 기관은 익명 집계 뷰만 읽는다          [M6]
-- =====================================================================
CREATE ROLE IF NOT EXISTS hrh_org_reader;
GRANT SELECT ON v_anon_cell TO hrh_org_reader;
GRANT SELECT ON v_anon_problem_cell TO hrh_org_reader;

-- =====================================================================
-- 기준 데이터 (상류 문서에 값이 있는 것만)
-- =====================================================================

-- UC2 기본흐름 4
INSERT INTO special_event_type (event_type_code, event_type_label, event_kind)
SELECT v.c, v.l, v.k FROM (
  SELECT 'rain' AS c, '비' AS l, 'condition' AS k
  UNION ALL SELECT 'discount', '할인행사', 'activity'
  UNION ALL SELECT 'new_menu', '신메뉴', 'activity'
  UNION ALL SELECT 'sns_post', 'SNS 게시', 'activity'
  UNION ALL SELECT 'group_guest', '단체손님', 'activity'
  UNION ALL SELECT 'stock_out', '재료 부족', 'problem'
  UNION ALL SELECT 'staff_absent', '직원 결근', 'problem') v
WHERE NOT EXISTS (SELECT 1 FROM special_event_type t WHERE t.event_type_code = v.c);

-- UC1 기본흐름 2·3
INSERT INTO consent_item (consent_item_code, consent_item_label, is_required)
SELECT v.c, v.l, v.r FROM (
  SELECT 'service' AS c, '데이터 활용 목적·수집 범위 동의' AS l, TRUE AS r
  UNION ALL SELECT 'anon_stats', '같은 지역·업종 익명 통계 참여', FALSE) v
WHERE NOT EXISTS (SELECT 1 FROM consent_item t WHERE t.consent_item_code = v.c);

-- 게이트 기준값: 키만 만들고 값은 비운다(SD_03 §18)
INSERT INTO threshold_setting (setting_key, setting_value, unit_label)
SELECT v.k, NULL, v.u FROM (
  SELECT 'g3_min_records' AS k, '기록 일수' AS u
  UNION ALL SELECT 'g5_min_stores', '가게 수'
  UNION ALL SELECT 'alert_window_days', '일'
  UNION ALL SELECT 'alert_min_decline', '비율') v
WHERE NOT EXISTS (SELECT 1 FROM threshold_setting t WHERE t.setting_key = v.k);

-- 업종·지역·매출 구간 목록은 원천에 없어 넣지 않는다
