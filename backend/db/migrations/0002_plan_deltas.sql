-- =====================================================================
-- 0002_plan_deltas.sql — 구현 계획에서 생긴 설계 DDL 대비 변경 (data-model §2, §7-3)
--   1) 로그인·푸시 테이블: auth_identity, org_account, push_subscription
--   2) region.weather_station_id (ASOS 관측소, research R11)
--   3) 탈퇴 즉시 삭제(research R9): 계정·가게 하위 FK 를 ON DELETE CASCADE 로 교체
--   4) RBAC: rbac_role, rbac_permission, rbac_role_permission, staff_account, principal_role, rbac_grant_event
--      + trg_principal_role_bi, trg_account_ad, v_principal_permission
--   5) 롤업 억제(명세 FR-075): v_anon_rollup_guard, v_anon_cell·v_anon_problem_cell 재정의
-- 러너(schema_migration)가 1회 적용을 보장한다. 개별 문장도 가능한 한 IF [NOT] EXISTS 로 작성했다.
-- MariaDB 전용: ADD COLUMN IF NOT EXISTS, DROP FOREIGN KEY IF EXISTS (표준 SQL 에 없음 — 재실행 안전을 위해 사용)
-- =====================================================================

-- 1) 로그인·푸시 ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_identity (
  account_id     BIGINT       NOT NULL,
  provider       VARCHAR(10)  NOT NULL,
  subject_hash   CHAR(64)     NOT NULL,                -- SHA-256(pepper ':' provider ':' subject), 원문 미저장(BR-HRH-01)
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_auth_identity PRIMARY KEY (provider, subject_hash),
  CONSTRAINT fk_ai_account FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE CASCADE,
  CONSTRAINT chk_ai_provider CHECK (provider IN ('kakao', 'dev'))
);

CREATE TABLE IF NOT EXISTS org_account (
  org_account_id BIGINT       NOT NULL AUTO_INCREMENT,
  org_id         BIGINT       NOT NULL,
  login_id       VARCHAR(50)  NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,                -- bcrypt
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_org_account PRIMARY KEY (org_account_id),
  CONSTRAINT uq_org_account_login UNIQUE (login_id),
  CONSTRAINT fk_oa_org FOREIGN KEY (org_id) REFERENCES organization (org_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscription (
  push_subscription_id BIGINT NOT NULL AUTO_INCREMENT,
  account_id     BIGINT       NOT NULL,
  endpoint       VARCHAR(500) NOT NULL,
  p256dh         VARCHAR(200) NOT NULL,
  auth_secret    VARCHAR(100) NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_push_subscription PRIMARY KEY (push_subscription_id),
  CONSTRAINT uq_push_endpoint UNIQUE (endpoint),
  CONSTRAINT fk_ps_account FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE CASCADE
);

-- 2) 관측소 --------------------------------------------------------------
ALTER TABLE region ADD COLUMN IF NOT EXISTS weather_station_id VARCHAR(10) NULL;

-- 3) 탈퇴 연쇄 삭제 -------------------------------------------------------
ALTER TABLE consent_event DROP FOREIGN KEY IF EXISTS fk_ce_account;
ALTER TABLE consent_event ADD CONSTRAINT fk_ce_account FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE CASCADE;
ALTER TABLE store DROP FOREIGN KEY IF EXISTS fk_store_account;
ALTER TABLE store ADD CONSTRAINT fk_store_account FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE CASCADE;
ALTER TABLE daily_record DROP FOREIGN KEY IF EXISTS fk_dr_store;
ALTER TABLE daily_record ADD CONSTRAINT fk_dr_store FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE;
ALTER TABLE alert DROP FOREIGN KEY IF EXISTS fk_alert_store;
ALTER TABLE alert ADD CONSTRAINT fk_alert_store FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE;
ALTER TABLE report_export DROP FOREIGN KEY IF EXISTS fk_rx_store;
ALTER TABLE report_export ADD CONSTRAINT fk_rx_store FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE;
ALTER TABLE report_export DROP FOREIGN KEY IF EXISTS fk_rx_ent;
ALTER TABLE report_export ADD CONSTRAINT fk_rx_ent FOREIGN KEY (entitlement_id) REFERENCES entitlement (entitlement_id) ON DELETE CASCADE;
ALTER TABLE entitlement DROP FOREIGN KEY IF EXISTS fk_ent_store;
ALTER TABLE entitlement ADD CONSTRAINT fk_ent_store FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE;
ALTER TABLE entitlement DROP FOREIGN KEY IF EXISTS fk_ent_payment;
ALTER TABLE entitlement ADD CONSTRAINT fk_ent_payment FOREIGN KEY (payment_attempt_id) REFERENCES payment_attempt (payment_attempt_id) ON DELETE CASCADE;
ALTER TABLE payment_attempt DROP FOREIGN KEY IF EXISTS fk_pa_store;
ALTER TABLE payment_attempt ADD CONSTRAINT fk_pa_store FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE;

-- 4) RBAC ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rbac_role (
  role_code        VARCHAR(20)  NOT NULL,
  role_label       VARCHAR(50)  NOT NULL,
  principal_kind   VARCHAR(10)  NOT NULL,
  CONSTRAINT pk_rbac_role PRIMARY KEY (role_code),
  CONSTRAINT chk_role_kind CHECK (principal_kind IN ('owner', 'org', 'staff'))
);

CREATE TABLE IF NOT EXISTS rbac_permission (
  permission_code  VARCHAR(40)  NOT NULL,
  permission_label VARCHAR(80)  NOT NULL,
  CONSTRAINT pk_rbac_permission PRIMARY KEY (permission_code)
);

CREATE TABLE IF NOT EXISTS rbac_role_permission (
  role_code        VARCHAR(20)  NOT NULL,
  permission_code  VARCHAR(40)  NOT NULL,
  CONSTRAINT pk_rbac_role_permission PRIMARY KEY (role_code, permission_code),
  CONSTRAINT fk_rrp_role FOREIGN KEY (role_code) REFERENCES rbac_role (role_code) ON DELETE CASCADE,
  CONSTRAINT fk_rrp_perm FOREIGN KEY (permission_code) REFERENCES rbac_permission (permission_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_account (
  staff_account_id BIGINT       NOT NULL AUTO_INCREMENT,
  login_id         VARCHAR(50)  NOT NULL,
  password_hash    VARCHAR(100) NOT NULL,
  display_name     VARCHAR(50)  NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_staff_account PRIMARY KEY (staff_account_id),
  CONSTRAINT uq_staff_login UNIQUE (login_id)
);

-- principal_id 는 다형 참조(account / org_account / staff_account) → 트리거로 존재·종류 검증
CREATE TABLE IF NOT EXISTS principal_role (
  principal_kind   VARCHAR(10)  NOT NULL,
  principal_id     BIGINT       NOT NULL,
  role_code        VARCHAR(20)  NOT NULL,
  granted_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by_staff BIGINT       NULL,
  CONSTRAINT pk_principal_role PRIMARY KEY (principal_kind, principal_id, role_code),
  CONSTRAINT fk_pr_role FOREIGN KEY (role_code) REFERENCES rbac_role (role_code),
  CONSTRAINT fk_pr_granter FOREIGN KEY (granted_by_staff) REFERENCES staff_account (staff_account_id) ON DELETE SET NULL,
  CONSTRAINT chk_pr_kind CHECK (principal_kind IN ('owner', 'org', 'staff'))
);

CREATE TABLE IF NOT EXISTS rbac_grant_event (
  grant_event_id   BIGINT       NOT NULL AUTO_INCREMENT,
  principal_kind   VARCHAR(10)  NOT NULL,
  principal_id     BIGINT       NOT NULL,
  role_code        VARCHAR(20)  NOT NULL,
  action           VARCHAR(6)   NOT NULL,
  acted_by_staff   BIGINT       NULL,
  acted_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_rbac_grant_event PRIMARY KEY (grant_event_id),
  CONSTRAINT chk_rge_action CHECK (action IN ('grant', 'revoke')),
  CONSTRAINT chk_rge_kind CHECK (principal_kind IN ('owner', 'org', 'staff'))
);

-- 권한 해석의 단일 지점 (data-model §7-4)
CREATE OR REPLACE VIEW v_principal_permission AS
SELECT pr.principal_kind, pr.principal_id, rp.permission_code
  FROM principal_role pr
  JOIN rbac_role_permission rp ON rp.role_code = pr.role_code
 GROUP BY pr.principal_kind, pr.principal_id, rp.permission_code;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_principal_role_bi $$
CREATE TRIGGER trg_principal_role_bi BEFORE INSERT ON principal_role FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rbac_role r WHERE r.role_code = NEW.role_code AND r.principal_kind = NEW.principal_kind) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RBAC: 역할과 주체 종류가 맞지 않음';
  END IF;
  IF (NEW.principal_kind = 'owner' AND NOT EXISTS (SELECT 1 FROM account a WHERE a.account_id = NEW.principal_id))
     OR (NEW.principal_kind = 'org' AND NOT EXISTS (SELECT 1 FROM org_account o WHERE o.org_account_id = NEW.principal_id))
     OR (NEW.principal_kind = 'staff' AND NOT EXISTS (SELECT 1 FROM staff_account s WHERE s.staff_account_id = NEW.principal_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RBAC: 존재하지 않는 주체';
  END IF;
END $$

-- 탈퇴(계정 삭제) 시 사장님 역할 연결 정리 — 다형 참조라 FK CASCADE 를 걸 수 없다
DROP TRIGGER IF EXISTS trg_account_ad $$
CREATE TRIGGER trg_account_ad AFTER DELETE ON account FOR EACH ROW
BEGIN
  DELETE FROM principal_role WHERE principal_kind = 'owner' AND principal_id = OLD.account_id;
END $$

DELIMITER ;

-- 5) 롤업 억제 (FR-075) ----------------------------------------------------
-- 기본 칸 = 하위 지역(자식이 없는 지역) × 개별 업종. 미달(g5_pass=FALSE)인 기본 칸이 하나라도 있으면
-- 그 칸을 포함하는 롤업 칸(같은 지역×업종 전체 / 상위 지역×같은 업종 / 상위 지역×업종 전체)을 숨긴다.
-- "합계 - 공개 칸 = 숨긴 칸" 역산을 막는다.
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

-- 반복 문제도 공개 칸(롤업 억제 적용)만 기준으로 한다
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
