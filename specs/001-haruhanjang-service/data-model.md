# Data Model: 하루한장 (Phase 1)

**기준 문서**: `design/SD_03_데이터베이스설계서_하루한장.md`(논리·물리 모델, ERD 10장), `design/hrh_ddl.sql`(DDL 전문)
**이 문서의 역할**: SD_03을 구현 기준으로 채택하고, 구현 계획에서 생긴 **변경점(research R10)** 과 엔티티별 검증 규칙·상태 전이를 구현자 관점으로 요약한다. 컬럼 전체 정의는 SD_03·DDL을 따른다.

대상 DB: 팀 MariaDB 12.1.2 `ABC11pioneer2`(KST, utf8mb4, 대소문자 구분) — research R1.

---

## 1. 엔티티 요약

| 영역 | 엔티티 | 핵심 필드 | 관계 | 출처 |
|---|---|---|---|---|
| A | `account` | account_id, created_at | 1:1 store, 1:N consent_event, 1:N auth_identity | SD_03 §5 |
| A | **`auth_identity`** (신규) | account_id, provider(`kakao`/`dev`), subject_hash(SHA-256+pepper), created_at | N:1 account, UNIQUE(provider, subject_hash) | R8 |
| A | `consent_event` | account_id, consent_item_code, is_agreed, occurred_at | N:1 account | SD_03 §5 |
| A | `store` | account_id(UNIQUE), business_type_code, region_code, closed_days_set_at, alert_push_enabled | 1:N daily_record·alert·payment_attempt·entitlement·report_export | SD_03 §5 |
| A | `store_closed_day` | store_id, day_of_week(1~7) | N:1 store | SD_03 §5 |
| A | **`push_subscription`** (신규) | account_id, endpoint(UNIQUE), p256dh, auth, created_at | N:1 account | R6 |
| B | `daily_record` | store_id, record_date, day_mood, customer_level, sales_band_code, region/business_type_code_at_record, record_dow(VIRTUAL), revision | UNIQUE(store_id, record_date) | SD_03 §6 |
| B | `daily_record_event` | record_id, event_type_code | N:1 daily_record | SD_03 §6 |
| C | `calendar_day`, `weather_observation`, `region_event`, `env_fetch_job` | 지역·날짜 단위 외부 데이터와 조회 상태 | 기록과 값 결합(FK 없음) | SD_03 §7 |
| D | `alert` | store_id, window_start/end, trend_code, confidence_level, display_channel, alert_status, acknowledged_at | N:1 store | SD_03 §8 |
| E | `payment_attempt`, `entitlement`, `report_export` | 결제 결과 → 권한 → 파일(스냅숏·확인·전달) | SD_03 §9 | SD_03 §9 |
| F | `organization`, `org_jurisdiction`, `org_query_log` | 계약 상태·관할·조회 이력 | SD_03 §10 | SD_03 §10 |
| F | **`org_account`** (신규) | org_account_id, org_id, login_id(UNIQUE), password_hash(bcrypt), created_at | N:1 organization | R8 |
| G | `region`(+ **weather_station_id** 신규), `business_type`, `special_event_type`, `sales_band`, `consent_item`, `threshold_setting`, `gate_event` | 코드·기준값·게이트 이력 | SD_03 §11 | SD_03 §11, R11 |
| — | **`schema_migration`** (신규) | version, applied_at, checksum | 마이그레이션 러너 전용 | R2 |

뷰·함수(SD_03 유지): `v_consent_current`, `v_gate_g3_store`, `v_gate_g4_store`, `v_gate_g6_store`, `v_gate_g8_org`, `v_record_env`, `v_store_month_summary`, `v_anon_source`, `v_anon_cell_all`, `v_anon_cell`(**롤업 억제 추가**), `v_anon_problem_cell`, `v_store_rail`, `fn_threshold`, `fn_gate_g3`, `fn_gate_g5`.

## 2. 설계 DDL 대비 변경 (마이그레이션 `0002_plan_deltas.sql`)

1. **역할 제거**: `CREATE ROLE hrh_org_reader`·`GRANT` 2줄을 마이그레이션에서 뺀다(권한 없음, R1). 기관 접근 제한은 API 계층(R7).
2. **신규 테이블 4개**: `auth_identity`, `org_account`, `push_subscription`, `schema_migration`.
3. **`region.weather_station_id VARCHAR(10) NULL`**: ASOS 관측소 매핑(R11). NULL이면 날씨 조회를 하지 않고 `env_fetch_job` 에 `failed` 로 남긴다(→ '확인 필요').
4. **계정 삭제 연쇄**(탈퇴, R9): `consent_event`·`store`·`auth_identity`·`push_subscription` → `account` FK에 `ON DELETE CASCADE`. `store` 하위(`store_closed_day` 기존 CASCADE, `daily_record`·`alert`·`payment_attempt`·`entitlement`·`report_export`)도 CASCADE로 바꾸고, `daily_record_event` 는 기존 CASCADE 유지. `gate_event`(다형 참조)는 탈퇴 트랜잭션에서 `subject_kind='store'` 행을 명시 삭제한다.
5. **`v_anon_cell` 롤업 억제**(명세 FR-075): 공개 조건을 `g5_pass` 에서 다음으로 강화한다.
   - 하위 지역 × 개별 업종 칸: `g5_pass`.
   - 상위 지역 또는 업종 `'*'` 칸(롤업): `g5_pass` **이고** 같은 주·관점에서 그 롤업을 구성하는 모든 하위 칸이 `g5_pass`.
   이렇게 하면 "합계 - 공개 칸 = 숨긴 칸" 역산이 불가능하다. 구현은 `v_anon_cell_all` 에 `is_rollup` 과 하위 칸 미통과 수를 붙이는 보조 뷰 `v_anon_rollup_guard` 로 한다.
6. **기준값 시드 분리**: 운영 시드는 4개 키 모두 NULL(SD_03 D4 유지). 개발 시드(`seed-dev.sql`)만 `g3_min_records=14`, `alert_window_days=14` 를 넣는다(명세 Assumptions). `g5_min_stores`·`alert_min_decline` 은 개발에서도 테스트 픽스처가 트랜잭션 안에서 임시로 넣는다.

## 3. 검증 규칙 (요청 → DB 이중 방어)

API는 zod 스키마로 먼저 거르고(사용자에게 G 코드와 이유 키 반환), DB 제약이 최종 방어선이다. 같은 규칙의 **판정 로직**은 DB 함수·뷰에만 두고 API는 그 결과를 읽는다(SD_03 D3).

| 규칙 | API 1차 검증 | DB 최종 강제 | 게이트 |
|---|---|---|---|
| 필수 동의 없이 가게 생성 불가 | onboarding 요청에 service 동의 true 필수 | `trg_store_bi` | G0 |
| 업종·지역 필수 | zod required + 코드 존재 확인 | NOT NULL + FK | G1 |
| 오늘장사·손님수 필수, 값 범위 | zod enum | NOT NULL + `chk_dr_*` | G2 |
| 미래 날짜 금지 | KST 오늘과 비교 | `trg_daily_record_bi` | — |
| 날짜당 1건 | PUT(업서트) 의미론 | `uq_dr_store_date` | — |
| 분석 기준 | `v_gate_g3_store`/`fn_gate_g3` 조회 | `trg_alert_bi`, `trg_report_export_bi` | G3 |
| 익명 동의 | `v_gate_g4_store` 조회 | `v_anon_source` 필터 | G4 |
| 최소 참여 가게 수·롤업 억제 | — (뷰 결과 그대로) | `fn_gate_g5`, `v_anon_cell` | G5 |
| 유료 권한 | `v_gate_g6_store` | `trg_entitlement_bi`, `trg_report_export_bi` | G6 |
| 확인 후 전달 | confirm 엔드포인트 선행 | `chk_rx_confirm_before_deliver` | G7 |
| 기관 계약·관할 | `v_gate_g8_org` + 관할 조회 | `trg_org_query_log_bi` | G8 |

DB가 `SIGNAL SQLSTATE '45000'` 으로 거부하면 오류 메시지 앞머리(`G3/…`, `G6/…`)를 파싱해 409 응답의 `gate` 필드로 변환한다(contracts 공통 오류 스키마).

## 4. 상태 전이

| 엔티티 | 상태 | 전이 | 트리거 |
|---|---|---|---|
| `consent_event`(항목별 현재값) | 없음 → 동의 → 철회 → 동의 … | 새 사건 행 추가만 | P1 1.5, S5 동의, S8 철회 |
| `daily_record` | 없음 → v1 → v2 … | 같은 날짜 PUT 시 `revision+1` | P2, UC2 A2 |
| `env_fetch_job` | 없음 → failed(n회) → ok | 재조회 성공 시 ok, 실패 시 attempt_count+1 | P2 2.6, P0 |
| `alert` | new → acknowledged | ack 엔드포인트 | P3 3.2 |
| `report_export` | generated → delivered / declined | confirm(confirmed_at) → deliver / decline | P6 6.5 |
| `entitlement` | 유효 → (valid_until 경과) 만료 | 시간 경과(미정, R12) | — |
| `organization.contract_status` | active ↔ expired | 운영자 수동(절차 미정) | — |
| `gate_event` | open → released | 같은 대상이 통과하는 첫 요청에서 API가 해제 | §5 |

## 5. 게이트 이벤트 기록 규칙 (서버)

- API가 게이트 차단 응답(409)을 낼 때 같은 `(gate_code, subject_kind, subject_id)` 의 열린 이벤트가 없으면 `gate_event` 를 연다.
- 같은 대상의 요청이 그 게이트를 통과하면 열린 이벤트를 `released_at=NOW()`, `release_action` 으로 닫는다. 해제 행동 값: G3 `records_accumulated`, G4 `anon_consent`, G5 `participants_reached`, G6 `payment_success`, G7 `export_confirmed`, G8 `contract_renewed`.
- G0·G1·G2는 기록하지 않는다(SD_03 §11-3).

## 6. 클라이언트 로컬 저장(IndexedDB) — 서버 스키마 밖

| 저장소 | 키 | 값 | 용도 |
|---|---|---|---|
| `outbox` | record_date | 기록 요청 본문, queued_at, attempt | 전송 대기(UC2 E3). 성공 시 삭제 |
| `record_cache` | record_date | 서버 기록 + 환경 결합 결과 | 오프라인 달력(UC4 E3), 기기 내 분석 입력 |
| `meta` | key | 마지막 동기화 시각, 레일 상태 | "최신 아닐 수 있어요" 판단 |

로그아웃·탈퇴 시 세 저장소를 모두 비운다.

## 7. 인증·인가 (RBAC) — `/speckit.tasks` 요청으로 추가

### 7-1 주체(principal)와 역할

| 주체 종류 | 테이블 | 로그인 | 역할 |
|---|---|---|---|
| `owner` 사장님 | `account` + `auth_identity` | 카카오 / 개발용 | `owner` (가입 완료 시 자동 부여) |
| `org` 기관 담당자 | `org_account` | 아이디·비밀번호 | `org_viewer` |
| `staff` 운영 인력 | **`staff_account`** (신규) | 아이디·비밀번호 | `data_manager`, `operator`, `auditor`, `admin` (복수 가능) |

운영 인력 역할의 근거: 원천 `[핵심 인적자원]`의 데이터 담당자(기준값 설계)·현장 운영자, SD_03 §3 G·F 영역 쓰기 주체("운영·데이터 담당자"), SD_03 §12 경로 4·§16의 "감사 역할 전용".

### 7-2 권한 목록과 역할 매트릭스

| 권한 | 뜻 | owner | org_viewer | data_manager | operator | auditor | admin |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `store.own.read` / `store.own.write` | 내 가게 정보·설정·동의 | O | | | | | |
| `record.own.read` / `record.own.write` | 내 기록 조회·저장 | O | | | | | |
| `alert.own.write` | 내 경보 생성·확인 | O | | | | | |
| `compare.own.read` | 내 지역·업종 익명 비교 | O | | | | | |
| `paid.own.use` | 유료 기능 | O | | | | | |
| `account.own.delete` | 탈퇴 | O | | | | | |
| `org.trends.read` / `org.problems.read` | 관할 익명 경향·반복 문제 | | O | | | | |
| `threshold.manage` | 기준값(G3·G5·경보) 설정 | | | O | | | O |
| `code.read` | 코드 목록 조회 | | | O | O | O | O |
| `code.manage` | 지역·업종·매출 구간 코드 관리 | | | | O | | O |
| `org.manage` / `contract.manage` | 기관·관할·기관 계정·계약 상태 | | | | O | | O |
| `audit.read` | 게이트·내보내기·기관 조회 이력, 익명 칸 가게 수 | | | | | O | O |
| `role.manage` | 운영 인력 계정·역할 부여 | | | | | | O |

원칙
- **소유 범위(own)는 역할로 끝나지 않는다.** `*.own.*` 권한은 세션의 account_id → store_id 로만 데이터를 조회하는 저장소 함수와 짝을 이룬다(FR-091). 경로·본문으로 다른 store_id 를 받지 않는다.
- **운영 인력도 사장님 개별 기록을 볼 수 없다.** 어떤 staff 권한도 `daily_record`·`v_anon_source` 를 노출하지 않는다. `audit.read` 는 이력 테이블과 `v_anon_cell_all` 의 칸 단위 수치(가게 수)까지만 연다(BR-HRH-15·21, 원천 `[부정적 영향]` 데이터 악용).
- **직무 분리**: 기준값을 바꾸는 사람(data_manager)과 역할을 부여하는 사람(admin)을 나눈다. admin 자신의 역할 회수는 다른 admin 만 할 수 있다(마지막 admin 회수 금지).
- **기관 권한은 데이터 범위와 결합**: `org.*.read` 는 G8(계약 유효)과 관할 지역 판정(`trg_org_query_log_bi`)을 함께 통과해야 한다.

### 7-3 테이블 (마이그레이션 `0002_plan_deltas.sql` 에 포함)

```sql
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
  password_hash    VARCHAR(100) NOT NULL,          -- bcrypt
  display_name     VARCHAR(50)  NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_staff_account PRIMARY KEY (staff_account_id),
  CONSTRAINT uq_staff_login UNIQUE (login_id)
);

-- 주체-역할 연결. principal_id 는 다형 참조(account / org_account / staff_account) → 트리거로 존재·종류 검증
CREATE TABLE IF NOT EXISTS principal_role (
  principal_kind   VARCHAR(10)  NOT NULL,
  principal_id     BIGINT       NOT NULL,
  role_code        VARCHAR(20)  NOT NULL,
  granted_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by_staff BIGINT       NULL,               -- NULL = 시스템(가입 시 owner 자동 부여, 시드)
  CONSTRAINT pk_principal_role PRIMARY KEY (principal_kind, principal_id, role_code),
  CONSTRAINT fk_pr_role FOREIGN KEY (role_code) REFERENCES rbac_role (role_code),
  CONSTRAINT fk_pr_granter FOREIGN KEY (granted_by_staff) REFERENCES staff_account (staff_account_id) ON DELETE SET NULL,
  CONSTRAINT chk_pr_kind CHECK (principal_kind IN ('owner', 'org', 'staff'))
);

-- 역할 부여·회수 감사(수정·삭제 없음)
CREATE TABLE IF NOT EXISTS rbac_grant_event (
  grant_event_id   BIGINT       NOT NULL AUTO_INCREMENT,
  principal_kind   VARCHAR(10)  NOT NULL,
  principal_id     BIGINT       NOT NULL,
  role_code        VARCHAR(20)  NOT NULL,
  action           VARCHAR(6)   NOT NULL,
  acted_by_staff   BIGINT       NULL,
  acted_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_rbac_grant_event PRIMARY KEY (grant_event_id),
  CONSTRAINT chk_rge_action CHECK (action IN ('grant', 'revoke'))
);

-- 권한 해석의 단일 지점
CREATE OR REPLACE VIEW v_principal_permission AS
SELECT pr.principal_kind, pr.principal_id, rp.permission_code
  FROM principal_role pr
  JOIN rbac_role_permission rp ON rp.role_code = pr.role_code
 GROUP BY pr.principal_kind, pr.principal_id, rp.permission_code;
```

트리거 `trg_principal_role_bi`(BEFORE INSERT): ① `rbac_role.principal_kind = NEW.principal_kind` ② 주체 존재(`account`/`org_account`/`staff_account`) — 아니면 `SIGNAL 'RBAC: …'`. 다형 참조 점검 쿼리는 SD_03 §15-3 형식으로 `principal_role` 에도 둔다. 탈퇴 트랜잭션은 `principal_role(owner, account_id)` 행을 명시 삭제한다.

### 7-4 인증·인가 흐름

1. 로그인 성공 → JWT 쿠키(`hrh_session`) 에 `{kind, id, sid}` 만 담는다. 권한 목록은 담지 않는다(회수 즉시 반영).
2. 요청마다 미들웨어 `authenticate` 가 쿠키 검증 → `loadPermissions(kind,id)` 가 `v_principal_permission` 을 조회(요청 단위 캐시, 60초 프로세스 캐시 + 역할 변경 시 무효화).
3. 라우터는 `requirePermission('record.own.write')` 처럼 선언한다. 미보유 시 **403** `{error:'forbidden', permission}`. 게이트 차단(409)과 구분한다.
4. 비활성 staff(`is_active=0`)·계약 만료 기관은 로그인 단계에서 거부된다(기관은 G8 화면 표시를 위해 로그인은 허용하고 org.* 데이터 접근만 409 G8 — FR-004 예외 규칙과 일치).
5. 로그인 시도 제한: 기관·운영 로그인은 아이디별 5회 실패 시 15분 잠금(메모리 저장소, 다중 인스턴스 시 공유 저장소로 전환).

## 8. 시드 데이터

시드는 `specs/001-haruhanjang-service/seed/` 에 있고 구현 시 `backend/db/` 로 옮긴다(tasks T015·T016).

| 파일 | 환경 | 내용 |
|---|---|---|
| `seed-base.sql` | 운영·개발 공통 | RBAC 역할 6·권한 17·역할-권한 매핑 (SD_03 DDL이 넣는 특별한 일·동의 항목·기준값 키는 제외) |
| `seed-dev.sql` | 개발 전용 | 샘플 지역·업종·매출 구간, 개발 기준값, 체험용 페르소나 9가게·기관 2곳·운영 인력 4명, 60일치 상대 날짜 기록·외부 데이터·경보·결제·보고서·게이트 이력 |
| `README.md` | — | 페르소나별 로그인 방법과 체험 가능한 사용자 시나리오 매핑 |

## 9. 구현 중 확정된 이탈 (2026-10-03, /speckit.implement)

| 항목 | 내용 | 근거 |
|---|---|---|
| `INSERT … SELECT` 와 트리거 | MariaDB 12.1 은 다중 행 INSERT 에서 BEFORE 트리거보다 NOT NULL 검사가 먼저다. `*_at_record` 를 시드·API 가 명시하고 트리거가 같은 값으로 덮어쓴다 | checklists/db-verify.md 이탈 1 |
| 콜레이션 | 커넥션을 `UTF8MB4_UNICODE_CI` 로 고정, `0003_view_collation.sql` 로 뷰 재생성 | db-verify.md 이탈 2 |
| 자동 증가 대역 | `0004` 에서 account·organization·org_account·staff_account·payment_attempt·entitlement·report_export 를 1000001 부터 — 시드 재실행이 실제 가입자를 지우지 않게 | 0004_id_ranges_report_body.sql |
| `report_export.report_body` | 보고서 내용(기기 내 분석 결과)을 생성 시점 그대로 저장 — 유도인데 저장(BR-HRH-20 확인 내용 = 전달 파일) | 0004 |
| `push_subscription.auth_secret` | 컬럼명 `auth` 대신 `auth_secret`(예약어 회피) | 0002 |
| 지역행사 조회 | 지역 코드 ↔ TourAPI 지역 매핑 미정으로 실제 조회는 하지 않고 failed 로 남긴다('확인 필요') | backend/src/jobs/envFetch.ts |
