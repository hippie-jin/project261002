---
description: "하루한장 구현 작업 목록"
---

# Tasks: 하루한장 — 소상공인 일일 장사 기록·분석 서비스

**Input**: `specs/001-haruhanjang-service/` — plan.md, spec.md, research.md, data-model.md(§7 RBAC, §8 시드), contracts/openapi.yaml(43 paths), quickstart.md, seed/
**함께 볼 설계**: `design/스타일가이드_하루한장.html`(토큰·컴포넌트 규격), `design/SD_02_UIUX설계서_하루한장.md`(화면·와이어프레임·게이트 문구), `design/SD_03_데이터베이스설계서_하루한장.md`, `design/hrh_ddl.sql`
**사용자 요청 반영**: ① `Intent-Tasks.md` 의 스킬을 단계별로 지정 ② 유저 스토리를 체험할 수 있는 시드 데이터(`seed/` — 이미 작성됨, T015~T016에서 적용) ③ 인증·인가(RBAC) 추가 구현(Phase 2 T022~T028, Phase 11 운영 콘솔)

**Tests**: 명세가 TDD를 요구하지 않아 단위 테스트 작업은 넣지 않았다. 대신 계획이 필수로 정한 **검증 스크립트**(DB 위반 거부 T017, RBAC 매트릭스 T028, 기관 쿼리 제한 T086, 수용 시나리오 T102)만 포함한다.

**제약(모든 작업 공통)**: Docker 미사용 · 팀 MariaDB `ABC11pioneer2` 외 DB 금지(Homebrew mysql 바이너리 금지) · DB 작업은 Node(mysql2) 스크립트로만 · 게이트 판정은 DB 함수·뷰 한 곳 · 분석·문장은 `frontend/src/analysis/` 한 곳 · 원인 단정 문구 금지 · 화면당 Rausch 주 버튼 1개.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일, 선행 작업 없음 → 병렬 가능
- **[Story]**: US1~US8(spec.md), ADM(운영 콘솔 — RBAC 관리, 사용자 요청)
- 경로는 plan.md 구조(`backend/`, `frontend/`) 기준

## 단계별 권장 스킬 (`Intent-Tasks.md`)

| 단계 | 스킬 |
|---|---|
| DB 마이그레이션·시드·뷰 (T012~T018, T101) | `/database-design` |
| 인증·RBAC (T022~T028, T040, T088~T093) | `/authentication` |
| REST 엔드포인트 (모듈 routes·service) | `/api-development` |
| Vue 컴포넌트·화면 (C1~C11, 각 Page) | `/frontend-design` |
| 반응형 (T039, T096) | `/responsive-layout` |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 저장소 골격과 공통 설정

- [X] T001 저장소 골격 생성: `backend/`, `frontend/`, `deploy/`, 루트 `.nvmrc`(`20`), `.gitignore`(node_modules, dist, `.env`, `*.local`), 루트 `README.md`(specs·design·quickstart 링크)
- [X] T002 [P] 백엔드 초기화 `backend/package.json`·`backend/tsconfig.json`: TypeScript strict, target ES2022, module NodeNext, `engines.node >=20`. 의존성 express@4 mysql2@3 zod jsonwebtoken bcrypt cookie-parser helmet web-push node-cron undici, 개발 의존성 typescript tsx vitest supertest @types/express @types/jsonwebtoken @types/bcrypt @types/cookie-parser @types/web-push @types/node-cron. scripts: `dev`(tsx watch src/server.ts), `build`, `start`, `db:migrate`, `db:seed:base`, `db:seed:dev`, `db:verify`, `rbac:check`, `admin:bootstrap`
- [X] T003 [P] 프론트엔드 초기화 `frontend/`: Vite vue-ts 템플릿, pinia vue-router@4 vite-plugin-pwa idb 추가. `frontend/vite.config.ts` 에 `/api` → `http://localhost:3000` 프록시, PWA 플러그인 `injectManifest`(src `src/sw.ts`)
- [X] T004 [P] ESLint(flat config)·Prettier 설정 `backend/eslint.config.js`, `frontend/eslint.config.js`, 루트 `.prettierrc`
- [X] T005 [P] `backend/.env.example` 작성(quickstart §2 항목 전부, 비밀번호·키는 빈 값). 실제 `.env` 는 커밋하지 않음
- [X] T006 [P] 스타일가이드 토큰 이식 `frontend/src/styles/tokens.css`: `design/스타일가이드_하루한장.html` 의 `:root` 변수 그대로(--primary #ff385c, --primary-active, --primary-disabled #ffd1da, --error, --ink, --body, --muted, --hairline, --surface-*, --font, --r-*, --s-*, --shadow 단일 그림자). `frontend/src/styles/base.css`: body 16px·ink·canvas 흰색, `word-break: keep-all`, 버튼 기본 라운드 8px, 포커스 2px ink 테두리(빛 번짐 없음)
- [X] T007 [P] `frontend/index.html`: `lang="ko"`, viewport, theme-color #ffffff, Pretendard·Inter 웹폰트 링크, 앱 제목 "하루한장"
- [X] T008 [P] 배포 골격(Docker 없음): `.gitlab-ci.yml`(install → lint → build → 수동 deploy 잡: SSH로 dist 업로드 후 `pm2 reload`), `deploy/ecosystem.config.cjs`(PM2, Node 20, `NODE_ENV=production`), `deploy/nginx/haruhanjang.conf`(HTTPS, `/api` → 127.0.0.1:3000 프록시, SPA fallback, `sw.js` no-cache)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB 스키마·시드, 인증·RBAC, API 공통 처리, 공통 UI. 모든 유저 스토리의 전제

**CRITICAL**: 이 단계가 끝나기 전에는 유저 스토리 작업을 시작하지 않는다

### DB (스킬: `/database-design`)

- [X] T009 `backend/src/config/env.ts`: zod로 환경 변수 검증(DB_*, DB_TIMEZONE 기본 +09:00, SESSION_JWT_SECRET, AUTH_SUBJECT_PEPPER, AUTH_DEV_LOGIN, KAKAO_*, DATA_GO_KR_KEY, VAPID_*, PAYMENT_PROVIDER). 누락 시 기동 중단
- [X] T010 `backend/src/db/pool.ts`: mysql2/promise 풀, `charset: 'utf8mb4'`, 새 커넥션마다 `SET time_zone = '+09:00'`, `dateStrings: ['DATE']`(DATE를 문자열로 받아 시간대 밀림 방지)
- [X] T011 `backend/src/db/tx.ts`: `withTransaction(fn)`(commit/rollback), `withRollback(fn)`(항상 rollback — 검증·시험 전용)
- [X] T012 `backend/db/scripts/migrate.ts`: `backend/db/migrations/*.sql` 을 이름순 적용. `DELIMITER xx` 줄을 해석해 문장 단위로 분리 실행(mysql2는 DELIMITER 미지원 — research R2), `schema_migration(version, applied_at, checksum)` 기록, 이미 적용된 버전은 건너뜀, 체크섬 불일치 시 중단
- [X] T013 `backend/db/migrations/0001_sd03_baseline.sql`: `design/hrh_ddl.sql` 복사 후 **역할 절(`CREATE ROLE hrh_org_reader`, `GRANT` 2줄) 제거**(팀 DB 권한 없음 — research R1). 머리 주석에 출처·제거 사유 기록
- [X] T014 `backend/db/migrations/0002_plan_deltas.sql`: data-model §2 항목 2~6 + §7-3 전부 — `auth_identity`·`org_account`·`push_subscription`·`schema_migration`, `region.weather_station_id`(ADD COLUMN IF NOT EXISTS), 계정·가게 하위 FK를 `ON DELETE CASCADE` 로 교체(`DROP FOREIGN KEY IF EXISTS` → `ADD CONSTRAINT`), RBAC 6테이블, `trg_principal_role_bi`, `v_principal_permission`, 롤업 억제 `v_anon_rollup_guard` + `v_anon_cell` 재정의(상위 지역·업종 '*' 칸은 구성 하위 칸이 모두 G5 통과일 때만 공개). 멱등 작성
- [X] T015 [P] 시드 배치: `specs/001-haruhanjang-service/seed/seed-base.sql` → `backend/db/seed-base.sql`, `seed-dev.sql` → `backend/db/seed-dev.sql` 복사(내용 변경 시 specs 쪽도 함께 갱신)
- [X] T016 `backend/db/scripts/seed.ts`: 파일을 **단일 커넥션**에서 실행(임시 테이블 사용), 실행 전 `SET time_zone='+09:00'`, `SET @auth_pepper = ?`(AUTH_SUBJECT_PEPPER), `__BCRYPT_DEV_PASSWORD__` 를 `bcrypt('hrh-dev-1234')` 로 치환, `NODE_ENV=production` 이면 dev 시드 거부. `db:seed:base`·`db:seed:dev` 각각 **두 번 실행해 멱등** 확인
- [X] T017 `backend/db/scripts/verify.ts`(`npm run db:verify`): `design/hrh_ddl_verify.py` 35케이스를 Node로 이식해 `withRollback` 안에서 실행 + 추가 케이스(① principal_role 종류 불일치 거부 ② 없는 주체 역할 부여 거부 ③ 롤업 억제: 하위 칸 1개 미달이면 상위 칸 비공개 ④ 계정 삭제 시 가게·기록·경보 연쇄 삭제). 실행 후 잔존 행 0 확인
- [X] T018 팀 DB 적용·검증: `ABC11pioneer2` 에 `db:migrate` 2회 → `db:seed:base` → `db:verify` 실행, 결과를 `specs/001-haruhanjang-service/checklists/db-verify.md` 에 기록(통과 수, 실패 원인, MariaDB 12.1.2 이탈 사항). **공용 DB 쓰기이므로 실행 전 사용자 확인**

### API 공통 (스킬: `/api-development`)

- [X] T019 `backend/src/app.ts`·`backend/src/server.ts`: Express 조립(json 1MB 제한, cookie-parser, helmet), `/api` 라우터, `/api/health`(DB ping), 정적 파일은 Nginx 담당
- [X] T020 `backend/src/http/errors.ts`·`backend/src/db/gateError.ts`: ① SIGNAL 메시지 `G3/BR-HRH-08: …` → 409 `GateBlocked{gate, reasonKey, releasedBy}` ② `RBAC: …` → 400 ③ zod 실패 → 422 `{error:'validation', fields}` ④ 그 외 500 일반 문구(스택·SQL 노출 금지, FR-083). G5·G8은 `releasedBy:'others'`
- [X] T021 `backend/src/gates/gateEvents.ts`: `openGate(gate, kind, id, screen)`(열린 이벤트 없을 때만), `releaseGate(gate, kind, id, action)` — data-model §5 규칙, G0~G2 기록 안 함

### 인증·RBAC (스킬: `/authentication`)

- [X] T022 `backend/src/auth/session.ts`: 서명 JWT를 `hrh_session` 쿠키(HttpOnly, Secure(운영), SameSite=Lax, 7일)로 발급·검증. 페이로드는 `{kind:'owner'|'org'|'staff'|'pending', id, sid}` 만(권한 미포함). `POST /api/auth/logout`
- [X] T023 `backend/src/auth/providers/AuthProvider.ts`, `dev.ts`, `kakao.ts`, `backend/src/auth/routes.ts`: subject_hash = SHA-256(pepper + ':' + provider + ':' + subject). 카카오 `/auth/kakao/start`(state 쿠키로 CSRF 방지)·`/auth/kakao/callback`, 개발용 `POST /auth/dev-login`(AUTH_DEV_LOGIN=1 일 때만 라우터 등록). 기존 `auth_identity` 있으면 owner 세션, 없으면 `pending` 세션(가입 대기)
- [X] T024 `backend/src/auth/passwordLogin.ts`: 기관(`/org/auth/login` → org_account)·운영(`/staff/auth/login` → staff_account, `is_active` 확인) 로그인, bcrypt 비교, 아이디별 5회 실패 15분 잠금(423). 기관은 계약 만료여도 로그인 허용(G8 화면 표시 — data-model §7-4). `backend/db/scripts/admin-bootstrap.ts`(`npm run admin:bootstrap -- --login <id>`): 대화형 비밀번호 입력 → staff_account + admin 역할 + rbac_grant_event
- [X] T025 `backend/src/rbac/permissions.ts`·`backend/src/rbac/middleware.ts`: `loadPermissions(kind,id)` 는 `v_principal_permission` 조회(60초 캐시, `invalidatePrincipal()` 제공), `authenticate`(쿠키 → req.principal), `requireKind(...)`, `requirePermission(code)`(미보유 403 `{error:'forbidden', permission}`), `ownerScope`(account_id → store_id 해석, 경로·본문의 store_id 무시 — FR-091)
- [X] T026 `backend/src/modules/session/routes.ts`: `GET /api/me`(owner·pending 상태), `GET /api/session/permissions`(kind·roles·permissions)
- [X] T027 `backend/src/rbac/routeMatrix.ts`: 모든 라우트를 `{method, path, permission | 'public' | 'pending'}` 로 선언하고, 기동 시 Express에 등록된 라우트 중 선언 없는 것이 있으면 기동 실패
- [X] T028 `backend/db/scripts/rbac-check.ts`(`npm run rbac:check`): dev 시드 주체로 로그인해 data-model §7-2 매트릭스 전수 확인 — owner→`/admin/*`·`/org/*` 403, org_viewer→owner API 403, data_manager→`/admin/staff` 403, auditor→`PUT /admin/thresholds` 403, 각 역할의 허용 경로 2xx/409. 결과 표를 콘솔 출력

### 프론트엔드 공통 (스킬: `/frontend-design`, `/responsive-layout`)

- [X] T029 `frontend/src/api/client.ts`: fetch 래퍼(credentials include, JSON), 응답 분류 `ok | gate(GateBlocked) | forbidden | validation | offline | error`. 오류 화면에는 기술 용어 없이 고정 문구
- [X] T030 `frontend/src/gates/copy.ts`: SD_02 §11-2 게이트 표준 문구(G0~G8의 사유·푸는 사람·비활성 이유 줄)를 **유일한 정의**로 두고, `{recordCount}`·`{minRecords}` 치환. 기준 미정(null)이면 "기준 N일" 대신 "기준을 정하는 중이에요" 문구
- [X] T031 `frontend/src/stores/session.ts`(Pinia: principal, permissions), `frontend/src/router/index.ts`: 라우트 meta `{kind, permission}` 가드 — pending → `/start`, owner → `/today`, org → `/org`, staff → `/staff`, 권한 없음 → 권한 안내 화면
- [X] T032 [P] C1 `frontend/src/components/BottomTabBar.vue`: 오늘·달력·패턴·비교 4탭, 활성 Rausch 아이콘+라벨, 나머지 muted, 터치 48px 이상(스타일가이드 §12)
- [X] T033 [P] C2 `frontend/src/components/ProgressRail.vue`: `GET /api/rail` 결과로 4칸(1 시작 완료 · 2 오늘 기록 전/완료/전송 대기 · 3 기록 n일 - 준비 중 G3/볼 수 있어요 · 4 비교 잠김 G4/자료 모이는 중 G5/볼 수 있어요), 현재 화면 칸 테두리 강조, 막힌 칸 누르면 해당 화면 차단 블록으로 이동(SD_02 §2-3)
- [X] T034 [P] C3 `frontend/src/components/GateBlock.vue`: 사유(게이트 ID 병기)·푸는 사람·다음 행동 3줄, `copy.ts` 키만 받음. `releasedBy='others'` 면 행동 버튼 없음, 칸 단위 변형(S7). 토스트·자동 사라짐 금지
- [X] T035 [P] C4 `frontend/src/components/ReasonButton.vue`: 주(Rausch, 비활성 #ffd1da)·보조 변형, 높이 48px(저장 56px 전체 폭 prop), 비활성 시 아래 이유 줄 ink 글자 상시 표시, `aria-disabled` + `aria-describedby`(이유 줄), 눌러도 이유를 다시 읽음
- [X] T036 [P] C8 `frontend/src/components/DataStatusTag.vue`: 5종(확인 필요 · 전송 대기 · 기록 안 한 날 · 입력 안 함(선택) · 표시 불가 - 표본 부족)을 서로 다른 글자로. 회색 빈칸 금지
- [X] T037 [P] C11 `frontend/src/components/MoodMark.vue`: ● 좋음 · ○ 보통 · – 나쁨 + 글자, 스크린리더는 "좋음" 등으로 읽음. 신호등 색 금지
- [X] T038 [P] C7 `frontend/src/components/ConfidenceBadge.vue`: 알약형 11px/600, 신뢰도 높음·보통·낮음·기록 부족 - 참고만(글자로 구분)
- [X] T039 `frontend/src/layouts/OwnerLayout.vue`(상단 바 64px, C2 레일, C1 탭바, 본문 최대 폭, 하단 고정 행동 바 슬롯)·`frontend/src/layouts/DesktopLayout.vue`(80px 상단 내비게이션, 활성 탭 2px ink 밑줄 — 기관·운영용). 브레이크포인트 744/1128/1440(스타일가이드 §13)
- [X] T040 `frontend/src/pages/auth/DevLoginPage.vue`(subject 입력, AUTH_DEV_LOGIN 환경에서만 라우트 노출), `OrgLoginPage.vue`, `StaffLoginPage.vue`(잠금 423 안내), 카카오 로그인 버튼(`/api/auth/kakao/start`)

**Checkpoint**: 스키마·시드·RBAC·공통 컴포넌트 준비 완료 — 유저 스토리 착수 가능

---

## Phase 3: User Story 1 - 가게 시작하기 (Priority: P1) 🎯 MVP

**Goal**: 안내 확인 → 필수 동의(G0) → 업종·지역(G1)·쉬는 요일(선택)·익명 참여(선택) → 한 트랜잭션 가입, owner 역할 자동 부여

**Independent Test**: dev 로그인 `owner-new` → 동의 미체크 시 「동의하고 시작」 비활성+G0 문구 → 「동의하지 않음」 시 DB에 아무 행도 없음 → 동의·업종만 선택 시 「완료」 비활성+G1 → 지역까지 고르면 가입 완료, `/today` 이동, `principal_role(owner)` 생성

- [X] T041 [P] [US1] `backend/src/modules/onboarding/repository.ts`: 선택지 조회(consent_item, business_type, region 상·하위)
- [X] T042 [US1] `backend/src/modules/onboarding/service.ts`: `withTransaction` 안에서 account → auth_identity → consent_event(service, anon_stats) → store(closedDays null이면 `closed_days_set_at` NULL, 배열이면 NOW()+행) → principal_role(owner) → rbac_grant_event. service=false면 409 G0 이고 **어떤 쓰기도 하지 않음**(FR-011). 실패 시 전체 롤백(UC1 E3)
- [X] T043 [US1] `backend/src/modules/onboarding/routes.ts`: `GET /api/onboarding/options`, `POST /api/onboarding`(pending 세션 전용, zod, 성공 시 owner 세션 재발급) — routeMatrix 등록
- [X] T044 [P] [US1] C9 `frontend/src/components/ConfirmSheet.vue`: 체크해야 Rausch 진행 버튼 활성, 「동의하지 않음」 보조 버튼 항상 활성, scrim 50%, 라운드 20px, 시트 밖 닫기 = 저장 없음
- [X] T045 [P] [US1] C5 `frontend/src/components/ChoiceButton.vue`(단일, 72px, 3열, 라운드 14px)·`ChoiceChip.vue`(다중, 40px 알약형, 14/500) — 선택됨 ink 채움·흰 글자(스타일가이드 §7)
- [X] T046 [US1] `frontend/src/pages/StartPage.vue` 단계 1: SD_02 S1 와이어프레임 — "이런 정보만 받아요/이렇게 지켜요" 안내, 필수·선택 체크, G0 GateBlock, 「동의하고 시작」 ReasonButton, 「동의하지 않음」 → 중단 안내 화면("동의해야 쓸 수 있어요")
- [X] T047 [US1] `frontend/src/pages/StartPage.vue` 단계 2: 업종 ChoiceButton, 지역 상위→하위 선택, 쉬는 요일 ChoiceChip(나중에 해도 돼요), 「완료」 ReasonButton(G1 이유 줄 "○○을 골라 주세요"), 저장 실패 시 입력 유지 + 「다시 시도」
- [X] T048 [US1] `frontend/src/router/index.ts`: pending 세션은 `/start` 외 접근 차단, 가입 직후 `/today` 로 이동하고 레일 4칸이 익명 미동의면 `잠김 G4` 로 시작

**Checkpoint**: US1 단독 동작 — 새 사장님이 가입할 수 있다

---

## Phase 4: User Story 2 - 오늘 장사 30초 기록 (Priority: P1) 🎯 MVP

**Goal**: 한 화면 세 묶음 버튼 기록, 즉시 완료 표시, 외부 데이터 비동기 결합(P2 2.6)·재조회(P0), 오프라인 전송 대기

**Independent Test**: `owner-starter` 로 로그인 → 손님 수 미선택 시 저장 비활성+G2 → 저장 1초 안에 "오늘 한 장 완료" + 날씨 '확인 필요' → DevTools 오프라인 저장 시 "저장됨(전송 대기)" → 온라인 복귀 후 서버 반영. `owner-steady` 로 오늘 기록 고치기 → revision 2

- [X] T049 [P] [US2] `backend/src/modules/records/repository.ts`: 업서트(같은 날짜면 UPDATE → `trg_daily_record_bu` 가 revision 증가), `daily_record_event` 같은 트랜잭션에서 교체, 조회는 `v_record_env` 결합(env 상태 포함), 기간 조회
- [X] T050 [US2] `backend/src/modules/records/routes.ts`: `PUT /api/records/:date`(zod enum, KST 미래 날짜 422, 트리거 거부도 422로 변환), `GET /api/records/:date`(없으면 404 = 기록 안 한 날), `GET /api/records?from&to` — `record.own.*` + ownerScope
- [X] T051 [US2] `backend/src/jobs/envFetch.ts`: 저장 응답 후 비동기로 기록 지역·날짜의 ① 날씨(ASOS 일자료 `AsosDalyInfoService`, `region.weather_station_id`; 강수·일기현상 → clear/cloudy/rain/snow) ② 공휴일(`SpcdeInfoService/getRestDeInfo` 월 단위 → calendar_day) ③ 지역행사(TourAPI `searchFestival` → region_event) 조회, 결과를 `env_fetch_job` 에 ok/failed 기록. 서비스 키·관측소 없음 → failed(추정값 금지)
- [X] T052 [US2] `backend/src/jobs/envRetry.ts`: node-cron 매일 06:30·12:30 KST, 기록이 있는 지역·날짜 중 job 없음·failed 를 재조회(attempt_count 증가) — P0
- [X] T053 [US2] `backend/src/modules/rail/routes.ts`: `GET /api/rail`(v_store_rail), `GET /api/gates/g3?from&to`(fn_gate_g3 + 기록 수 + minRecords null 허용)
- [X] T054 [P] [US2] `frontend/src/offline/db.ts`(idb: `outbox`, `record_cache`, `meta`)·`frontend/src/offline/sync.ts`(online 이벤트·앱 시작 시 outbox 비우기, 성공 시 삭제, Background Sync 태그 등록)
- [X] T055 [P] [US2] `frontend/src/sw.ts`: 앱 셸 프리캐시, `/api/records` PUT Background Sync 재전송, 웹 앱 매니페스트(이름 하루한장, 아이콘, display standalone)
- [X] T056 [US2] `frontend/src/stores/records.ts`: 낙관적 저장(캐시 즉시 반영 → 완료 표시), 오프라인이면 outbox 적재 후 레일 2칸 `전송 대기`, 동기화 완료 시 `저장됨`
- [X] T057 [US2] `frontend/src/pages/TodayPage.vue`: SD_02 S2 와이어프레임 — 질문·날짜, 오늘장사 3 ChoiceButton+MoodMark, 손님 수 3, 특별한 일 7 ChoiceChip(비·할인행사·신메뉴·SNS 게시·단체손님·재료 부족·직원 결근, 직접 입력 없음), 「매출 구간도 남길래요」 펼침(sales_band 목록), 하단 고정 56px 저장 ReasonButton(G2 이유 줄), 완료 카드(MoodMark + DataStatusTag 확인 필요/전송 대기), 기존 기록 채움 수정 모드(UC2 A2), `?date=` 과거 날짜 기록(UC2 A3), 30초 안에 끝나도록 스크롤 없는 배치

**Checkpoint**: US1+US2 = MVP — 가입하고 매일 기록할 수 있다

---

## Phase 5: User Story 3 - 장사 달력 (Priority: P2)

**Goal**: 월 달력(● ○ –·쉼·기록 안 한 날·확인 필요·공휴일·행사), 그날의 한 장, 월간 요약, 오프라인 표시. 게이트 없음

**Independent Test**: `owner-steady` → 달력에 일요일 "쉼", 9일 주기 "기록 안 한 날", 17·33일 전 "확인 필요", 축제 표시 → 빈 날 누르면 그 날짜 기록 화면 → 월간 요약. `owner-new` 가입 직후 빈 달력 + 기록 시작 안내

- [X] T058 [P] [US3] `backend/src/modules/records/summary.ts` + 라우트 `GET /api/records/months/:month/summary`(v_store_month_summary + 특별한 일 상위 3)
- [X] T059 [P] [US3] `frontend/src/components/CalendarGrid.vue`: 지름 40px 원 날짜 칸, 아래 MoodMark 모양 표식, `쉼`(store 쉬는 요일)·`기록 안 한 날`·공휴일/행사 작은 글자, `highlightDates` prop(S3 근거), 범례(스타일가이드 §10)
- [X] T060 [US3] `frontend/src/pages/CalendarPage.vue`: 달 이동, 날짜 상세 카드(오늘장사·손님 수·특별한 일·날씨·공휴일·행사·매출 구간 — 결측은 DataStatusTag), 「기록 고치기」·빈 날 → `/today?date=`, 기록 0건 달 안내(UC4 E1), 오프라인이면 record_cache로 그리고 "최신 아닐 수 있어요"(UC4 E3), 「이번 달 요약 보기」

**Checkpoint**: US3 단독 동작

---

## Phase 6: User Story 4 - 장사 패턴 확인 (Priority: P2)

**Goal**: G3 통과 시 요일·날씨·특별한 일 전후·반복 문제 경향(문장+신뢰도+참고 안내+근거), 미통과 시 차단 블록. 분석은 기기 내 단일 모듈

**Independent Test**: `owner-starter` → G3 차단(기록 6일·기준 14일), 관점 탭 4개 비활성, 「오늘 기록하러 가기」. `owner-steady` → 요일별 "금요일에 좋은 날이 많은 경향", 날씨별 비 오는 날 손님 적음 + 제외된 날 수, 할인행사 전후, 토요일 재료 부족, 근거 날짜 → 달력 강조

- [X] T061 [P] [US4] `frontend/src/analysis/confidence.ts`: 신뢰도 4단계 산출 **유일 정의**(입력: 표본 수·기준 minRecords). 산출 기준 상수는 이 파일 한 곳에 `// 기준 미정 — 데이터 담당자 확정 필요` 주석과 함께
- [X] T062 [P] [US4] `frontend/src/analysis/patterns.ts`: 요일별 분포, 날씨별(needs_check 제외·제외 일수 반환), 특별한 일 전후 차이, 반복 문제(problem 종류 빈도·요일), 관점별 표본 부족 판정(UC3 E2)
- [X] T063 [P] [US4] `frontend/src/analysis/sentences.ts`: "~하는 경향이 있어요" 템플릿, 근거 수치 문장("금요일 11번 중 9번 좋음"), 참고 안내 문구, 금지어 목록("때문에", "덕분에", "원인", "!")과 `assertNoCausalLanguage()` — 모든 문장 생성 경로가 통과해야 함
- [X] T064 [P] [US4] C6 `frontend/src/components/TrendCard.vue`: 단독형·나란히형·표형 변형, ConfidenceBadge + 관점 라벨 + 굵은 경향 문장 + 근거 수치 + "참고 정보예요 - 사장님 경험과 함께 판단해 주세요" + 「근거 날짜 보기」, 라운드 14px·단일 그림자
- [X] T065 [US4] `backend/src/modules/store/routes.ts`: `GET /api/store`, `PUT /api/store/closed-days`(빈 배열 = 쉬는 날 없음, `closed_days_set_at` 갱신) — `store.own.*`
- [X] T066 [US4] `frontend/src/pages/PatternPage.vue`: 진입 시 `/api/gates/g3` → 미통과면 GateBlock(G3, 기록 n일·기준 N일) + 관점 탭 비활성 + 「오늘 기록하러 가기」, 통과면 요약 경향 → 관점 탭 4개(요일별·날씨별·특별한 일·반복 문제), 요일별 진입 시 쉬는 요일 미입력이면 입력 시트(UC3 A1), 제외된 날 표시, 근거 → `/calendar?highlight=`, 하단 「상세보고서 받기(유료)」 텍스트 링크
- [X] T067 [US4] G3 이력: `GET /api/gates/g3?screen=S3` 호출 시 서버가 미통과면 `openGate('G3','store',id,'S3')`, 통과면 `releaseGate(..., 'records_accumulated')`(T021 사용)

**Checkpoint**: US4 단독 동작

---

## Phase 7: User Story 5 - 장사 하락 조기 경보 (Priority: P3)

**Goal**: 기록 저장 직후 기기 내 하락 판정 → 서버 G3 재검증 후 경보 저장·Web Push 또는 앱 안 표시 → 근거·확인

**Independent Test**: `owner-declining` → S3 상단에 새 경보 카드(앱 안 표시, 경보 수신 끔) → 근거 보기(최근 14일 흐름) → 「확인했어요」 후 다시 안 보임. 오늘 기록 저장 시 새 하락 판정 → 경보 생성. `owner-starter` 는 하락이어도 경보 없음(G3)

- [X] T068 [US5] `contracts/openapi.yaml` 갱신: `GET /api/gates/g3` 응답에 `alertWindowDays`, `alertMinDecline`(nullable) 추가 — 기기 내 판정의 입력. 백엔드 T053 응답도 함께 수정
- [X] T069 [P] [US5] `frontend/src/analysis/decline.ts`: 판정 기간(alertWindowDays) 기록이 G3 미달이면 판정 안 함, 기록 공백 비율 높으면 `gap`(UC6 E2), 나쁨·손님 적음 비율이 직전 동일 기간 대비 alertMinDecline 이상 증가하면 `decline` + 신뢰도(confidence.ts 사용). 기준 null이면 판정 안 함
- [X] T070 [US5] `backend/src/modules/alerts/routes.ts`·`service.ts`: `POST /api/alerts`(trg_alert_bi 409 G3 변환, `store.alert_push_enabled` 와 구독 유무로 display_channel 결정), `GET /api/alerts?status=`, `POST /api/alerts/:id/ack`(소유 확인) — `alert.own.write`. 미확인 경보가 여러 개면 응답은 최신 순(대체 규칙 미확정 — spec Assumptions)
- [X] T071 [US5] `backend/src/modules/push/routes.ts`·`backend/src/modules/push/send.ts`: `POST/DELETE /api/push/subscriptions`, web-push VAPID 발송(경보 문구는 sentences 규칙과 같은 고정 문구), 410 응답 구독 삭제
- [X] T072 [US5] `backend/src/modules/store/routes.ts` 에 `PATCH /api/store/alert-settings` 추가
- [X] T073 [P] [US5] C10 `frontend/src/components/AlertCard.vue`: 신뢰도 배지·"최근 흐름" 라벨·경향 문장(error 색 글자, 배경 칠하지 않음)·「근거 보기」·「확인했어요」·「경보 받지 않기」 텍스트 링크, 확인함 접힘 상태
- [X] T074 [US5] `frontend/src/pages/TodayPage.vue` 저장 후 흐름: decline.ts 실행 → `gap` 이면 기록 공백 안내, `decline` 이면 `POST /api/alerts` → 완료 카드 아래 AlertCard(in_app)
- [X] T075 [US5] `frontend/src/pages/PatternPage.vue` 경보 섹션(`?alert=id` 로 펼침) + `frontend/src/sw.ts` 의 push·notificationclick 처리(→ `/pattern?alert=id`) + `frontend/src/offline/push.ts`(권한 요청은 첫 경보 생성 직후 또는 설정 화면에서만, 거부 시 in_app 유지)

**Checkpoint**: US5 단독 동작

---

## Phase 8: User Story 6 - 동네·업종 익명 비교 (Priority: P3)

**Goal**: G4(익명 동의)·G5(최소 참여 가게 수) 통과 시 동네 묶음 경향과 내 경향을 나란히, 순위·가게 수 없음

**Independent Test**: `owner-starter` → G4 차단 + 「익명 참여 동의하기」 → 동의 후 재판정. `owner-steady` → 이번 주/이번 달 동네 경향(망원 분식 5곳) vs 내 경향 나란히. `owner-cafe-neighbor` → G5 차단(해제 버튼 없음) + 내 가게 흐름 보기

- [X] T076 [US6] `backend/src/modules/compare/repository.ts`·`routes.ts`: `GET /api/compare?period&dim` — `v_gate_g4_store` 미통과 409 G4, 내 가게 region/business_type 고정, this_week = 이번 주 week_start 1개, this_month = 이번 달에 걸친 주들, `v_anon_cell` 조회 결과 없으면 409 G5(`releasedBy:'others'`), G4·G5 게이트 이력 기록 — `compare.own.read`
- [X] T077 [US6] `backend/src/modules/store/routes.ts` 에 `POST /api/consents`(anon_stats 동의·철회 사건 추가, 응답 후 레일 재계산) 추가
- [X] T078 [P] [US6] `frontend/src/analysis/anonCombine.ts`: 여러 주 칸을 n_records 가중 평균으로 합침(이번 달), 동네 경향 문장은 sentences.ts 로만 생성
- [X] T079 [US6] `frontend/src/pages/ComparePage.vue`: SD_02 S5 — 조건 바(지역·업종 고정 표시 + 기간, 스타일가이드 §8 세그먼트 바), 「비교 보기」 ReasonButton(G4), G4 GateBlock + ConfirmSheet(익명 참여 동의형), G5 GateBlock(행동 버튼 없음) + 「내 가게 흐름 보기」, TrendCard 나란히형(왼쪽 동네 익명, 오른쪽 내 가게 — 내 기록 부족 시 ConfidenceBadge 기록 부족), 관점 탭(요일·날씨), 통신 실패 시 「다시 시도」. 순위·백분위·가게 수 표시 금지(스타일가이드의 "상위 30%" 배지 사용 안 함)

**Checkpoint**: US6 단독 동작

---

## Phase 9: User Story 7 - 상세보고서·내보내기 (유료) (Priority: P4)

**Goal**: 결제(모의 공급자) → 권한(G6) → 기간 보고서(G3) → 포함 정보 확인(G7) → 받기

**Independent Test**: `owner-paid` → 확인 전 보고서: 체크 전 「보고서 받기」 비활성(G7) → 체크 후 받기 → delivered. 백업·내보내기 선택 시 G6 차단 + 「결제하기」(mock 실패/성공 선택). 무료 기능은 결제 실패와 무관하게 동작

- [X] T080 [P] [US7] `backend/src/modules/paid/providers/PaymentProvider.ts`·`mockProvider.ts`: 인터페이스(`charge(feature) → {result, externalRef}`), mock 은 요청 본문의 `simulate: 'success'|'failed'|'canceled'` 로 결과 결정. 실제 PG는 결정 후(research R12)
- [X] T081 [US7] `backend/src/modules/paid/service.ts`·`routes.ts`: `POST /api/paid/payments`(시도 기록, 성공 시 entitlement — 트리거가 G6 강제), `GET /api/paid/entitlements`, `POST /api/paid/exports`(클라이언트 스냅숏 수신, 서버가 기간 기록 수를 다시 세어 불일치 시 422, 트리거 G6·G3 409), `POST /api/paid/exports/:id/confirm`, `GET /api/paid/exports/:id/file`(미확인 409 G7, 성공 시 delivered), `POST /api/paid/exports/:id/decline` — `paid.own.use`
- [X] T082 [US7] `backend/src/modules/paid/render.ts`: 파일 형식이 미정이므로 잠정 — 보고서는 인쇄용 HTML(스타일가이드 토큰, 경향 문장·신뢰도·기간), 백업·내보내기는 CSV(UTF-8 BOM, 날짜·오늘장사·손님 수·특별한 일·매출 구간). 포함 정보 목록 상수(`includedItems`)도 이 파일에
- [X] T083 [US7] `frontend/src/pages/PaidPage.vue`: SD_02 S6 — 기능 라디오, 이용 조건 "확인 필요", G6 GateBlock + 「결제하기」, 기간 선택 + 「보고서 만들기」(G6·G3 ReasonButton, 보고서 내용은 analysis 모듈로 생성), 포함 정보 목록 + 확인 체크 + 「보고서 받기」(G7) + 「받지 않기」, 무료 기능 안내 문구

**Checkpoint**: US7 단독 동작

---

## Phase 10: User Story 8 - 기관 익명 상권 대시보드 (Priority: P4)

**Goal**: 계약 유효(G8)·관할 안에서 지역×업종 익명 경향, 미달 칸 표시 불가(G5), 롤업 억제, 반복 문제, 조회 이력

**Independent Test**: `mapo-econ` → 망원동×분식 공개, 합정동×카페 "표시 불가 - 표본 부족", 마포구×업종 전체는 억제, 지역행사 관점(축제 주간), 반복 문제(재료 부족) → 조회마다 org_query_log 증가. `expired-merchant` → G8 차단, 조회 조건 전부 비활성

- [X] T084 [US8] `backend/src/modules/org/repository.ts`: **이 파일만** 기관 데이터 접근 — `v_anon_cell`·`v_anon_problem_cell`·`v_gate_g8_org`·`org_jurisdiction`·`region`·`business_type` 만 조회, `org_query_log` 만 삽입(트리거가 G8·관할 검사)
- [X] T085 [US8] `backend/src/modules/org/routes.ts`: `GET /api/org/me`, `GET /api/org/trends`(관할 하위 지역 × 업종의 기대 칸 목록 − 반환 칸 = `suppressed`, 수치 없음), `GET /api/org/problems` — `org.trends.read`/`org.problems.read`, G8 미통과 409(`releasedBy:'others'`) + gate_event
- [X] T086 [US8] 기관 쿼리 제한 검증 `backend/db/scripts/org-query-guard.ts`(`npm run org:guard`): mysql2 쿼리 훅으로 `/api/org/*` 요청 중 실행된 SQL을 수집해 `daily_record`·`v_anon_source`·`v_anon_cell_all`·`store`·`account` 문자열이 없음을 확인(research R7 계약 검증)
- [X] T087 [US8] `frontend/src/pages/org/DashboardPage.vue`: DesktopLayout, SD_02 S7 — 상단 내비게이션(상권 흐름·반복 문제·이용 안내·기관명), 조건 바(관할 지역 드롭다운·업종·기간·「조회」), 경향 표(칸 단위 DataStatusTag 표시 불가 + G5 이유 hover), 관점 탭(요일·날씨·지역행사), 반복 문제 탭, "개별 가게 기록과 원자료는 제공하지 않아요" 상시 문구, G8 시 GateBlock(others) + 전 조작 비활성, 키보드 이동 순서(조건 → 조회 → 표 → 탭)

**Checkpoint**: US8 단독 동작

---

## Phase 11: 운영 콘솔 — RBAC 관리 (ADM, 사용자 요청)

**Goal**: 운영 인력(data_manager·operator·auditor·admin)이 권한별로 기준값·코드·기관/계약·감사·역할을 관리. 개별 사장님 기록은 어떤 역할에도 노출하지 않음

**Independent Test**: `data-manager` → 기준값 탭만 보임, g3 14→5 변경 시 `owner-starter` G3 해제(레일 3칸 변화). `operator` → `expired-merchant` 계약 active 전환 시 G8 해제. `auditor` → 감사 탭(게이트 6건·반출·기관 조회·익명 칸 가게 수) 조회, 기준값 변경 403. `admin` → 운영 인력 생성·역할 교체, 마지막 admin 회수 409. `npm run rbac:check` 전부 통과

- [X] T088 [P] [ADM] `backend/src/modules/admin/thresholds.ts`: `GET /api/admin/thresholds`, `PUT /api/admin/thresholds/:key`(null 허용 = 차단, 0 이상) — `threshold.manage`
- [X] T089 [P] [ADM] `backend/src/modules/admin/codes.ts`: `GET/POST /api/admin/codes/:codeKind`(regions: parent·weather_station_id 포함, business-types, sales-bands). 사용 중 코드 삭제 미제공 — `code.read`/`code.manage`
- [X] T090 [P] [ADM] `backend/src/modules/admin/orgs.ts`: 기관 목록·등록, `PATCH /contract`(G8 해제 경로, 해당 기관 열린 G8 이벤트 release `contract_renewed`), `PUT /jurisdiction`, `POST /accounts`(임시 비밀번호 1회 반환, bcrypt 저장, principal_role org_viewer + rbac_grant_event) — `org.manage`/`contract.manage`
- [X] T091 [P] [ADM] `backend/src/modules/admin/audit.ts`: `GET /api/admin/audit/:auditKind` — gate-events, exports(반출 시각·기간·스냅숏, store_id는 내부 번호만), org-queries, anon-cells(`v_anon_cell_all` 의 칸 단위 n_stores·g5_pass, 가게 ID 없음), rbac-grants — `audit.read`
- [X] T092 [ADM] `backend/src/modules/admin/staff.ts`: `GET/POST /api/admin/staff`, `PATCH /api/admin/staff/:id`(역할 교체·비활성화, 마지막 활성 admin 회수·자기 admin 회수 409, 변경마다 rbac_grant_event, `invalidatePrincipal()`) — `role.manage`
- [X] T093 [ADM] `frontend/src/pages/staff/ConsolePage.vue`: DesktopLayout, `GET /api/session/permissions` 로 탭 필터 — 기준값(값 비우면 "이 게이트는 계속 막혀요" 경고 확인), 코드, 기관·계약·기관 계정(임시 비밀번호 1회 표시), 감사(기간 필터 표), 운영 인력(역할 체크박스). 화면당 Rausch 주 버튼 1개

**Checkpoint**: RBAC 관리 동작, `rbac:check` 통과

---

## Phase 12: Polish & Cross-Cutting Concerns

- [X] T094 설정·탈퇴 S8(FR-093 잠정, research R9): `backend/src/modules/store/routes.ts` 에 `DELETE /api/account`(한 트랜잭션: principal_role·gate_event(store) 명시 삭제 → account 삭제로 CASCADE, 세션 삭제) — `account.own.delete`. `frontend/src/pages/SettingsPage.vue`: 경보 수신, 익명 참여 동의·철회, 쉬는 요일, 로그아웃, 탈퇴(ConfirmSheet, 삭제 범위 안내), 탈퇴·로그아웃 시 IndexedDB 3저장소 비우기. S3 하단에 설정 진입점
- [X] T095 [P] 접근성 점검·수정(FR-080~083): 본문 16px 이상, 터치 48px·기록 버튼 72px, 비활성 버튼 aria + 이유 낭독, MoodMark 낭독 문구, GateBlock 화면 진입 시 첫 안내, 명암(ink·muted on white, 비활성 버튼 이유 줄 ink) — 결과 `specs/001-haruhanjang-service/checklists/a11y.md`
- [X] T096 [P] 반응형(스타일가이드 §13): <744 카드 1열·탭바·조건 바 세로·저장 하단 고정, 744~1128 달력+상세 2열, 1128~ 기관·운영 64/32 레이아웃, >1440 최대 1280px — `/responsive-layout`
- [X] T097 [P] 스타일가이드 Do/Don't 감사: 화면별 Rausch 주 버튼 1개, 신호등 색 0, 그림자 단일 토큰만, 각진 모서리 0, 원인 단정 문구 0(sentences.ts 금지어 검사를 전 화면 고정 문구에도 적용) — 결과 `specs/001-haruhanjang-service/checklists/ui-style.md`
- [X] T098 [P] 게이트 문구 일관성 검사 `frontend/scripts/check-gate-copy.ts`: `GateBlock`·`ReasonButton` 의 이유 문구가 모두 `gates/copy.ts` 키에서 오는지 정적 검사(문자열 하드코딩 0)
- [X] T099 보안 강화: helmet CSP(self + 폰트 출처), 상태 변경 요청 CSRF(SameSite=Lax + `X-Requested-With` 헤더 요구), 로그인 경로 rate limit, 운영 쿠키 Secure, 오류 응답에 스택·SQL 없음, `.env` 비밀값 로그 출력 금지
- [X] T100 전역 오류·오프라인 규칙(SD_02 §12-3): api client 분류별 고정 문구, 결과 영역 자리 표시, 통신 실패 「다시 시도」, 오프라인 배너
- [X] T101 성능: dev 시드로 `EXPLAIN` — `/api/compare`·`/api/org/trends`·`/api/rail` 1초 이내 확인, 초과 시 인덱스 보강 또는 주 단위 집계 저장 전환안 작성(SD_03 §15-4)
- [X] T102 수용 검증: quickstart §6 시나리오 10건 + `seed/README.md` 페르소나 체험 전부 + `npm run rbac:check` + `npm run org:guard` + `npm run db:verify` 실행, 결과 `specs/001-haruhanjang-service/checklists/acceptance.md`
- [X] T103 [P] 문서 갱신: `quickstart.md`(실제 명령·포트), `seed/README.md`(실행 결과 반영, "DB 미실행" 문구 제거), 루트 `CLAUDE.md`
- [X] T104 배포 리허설(Docker 없음): 스테이징 서버에 Node 20 + PM2 + Nginx 설정 적용, HTTPS에서 PWA 설치·Web Push 수신·Background Sync 확인

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: 선행 없음
- **Phase 2 Foundational**: Setup 완료 후. **모든 유저 스토리를 막는다.** T018(팀 DB 적용)은 사용자 확인 필요
- **Phase 3~10 (US1~US8)**: Foundational 완료 후 시작
- **Phase 11 ADM**: Foundational 완료 후(T022~T028 RBAC 필요). US 단계와 병렬 가능
- **Phase 12 Polish**: 원하는 스토리 완료 후

### User Story Dependencies

| 스토리 | 선행 | 비고 |
|---|---|---|
| US1 가입 | Foundational | 다른 스토리는 시드 페르소나로 US1 없이도 시험 가능 |
| US2 기록 | Foundational | 시드 `owner-starter` 로 단독 시험 |
| US3 달력 | Foundational (+ US2의 `GET /records`, T049·T050) | 같은 records 모듈 공유 |
| US4 패턴 | Foundational (+ T049·T050·T053) | 분석 모듈 신설 |
| US5 경보 | US4 분석 모듈(T061·T063), US2 TodayPage(T057) | 판정은 기록 저장 직후 |
| US6 비교 | Foundational (+ T061·T063·T064) | 내 경향에 분석 모듈 사용 |
| US7 유료 | Foundational (+ T061·T063 보고서 내용) | 결제는 mock |
| US8 기관 | Foundational (+ T064 TrendCard 표형) | 기관 로그인 T024 |
| ADM | Foundational | 독립 |

### Within Each User Story

저장소(repository) → 서비스 → 라우트(routeMatrix 등록) → 프론트 컴포넌트 → 페이지. 게이트 문구는 항상 `copy.ts` 경유.

### Parallel Opportunities

- Setup: T002~T008 동시
- Foundational: T015 ∥ T019~T021 ∥ T029~T030, 공통 컴포넌트 T032~T038 동시
- 스토리 단위: US1·US2·US3·US8·ADM 은 Foundational 직후 동시 착수 가능, US4 분석 모듈(T061~T064) 완료 후 US5·US6·US7 동시
- ADM 백엔드 T088~T091 동시

---

## Parallel Example: Foundational 공통 컴포넌트

```bash
Task: "C1 BottomTabBar.vue in frontend/src/components/BottomTabBar.vue"
Task: "C2 ProgressRail.vue in frontend/src/components/ProgressRail.vue"
Task: "C3 GateBlock.vue in frontend/src/components/GateBlock.vue"
Task: "C4 ReasonButton.vue in frontend/src/components/ReasonButton.vue"
Task: "C8 DataStatusTag.vue / C11 MoodMark.vue / C7 ConfidenceBadge.vue"
```

## Parallel Example: User Story 4 분석 모듈

```bash
Task: "confidence.ts in frontend/src/analysis/confidence.ts"
Task: "patterns.ts in frontend/src/analysis/patterns.ts"
Task: "sentences.ts in frontend/src/analysis/sentences.ts"
Task: "TrendCard.vue in frontend/src/components/TrendCard.vue"
```

## Parallel Example: ADM 백엔드

```bash
Task: "thresholds.ts in backend/src/modules/admin/thresholds.ts"
Task: "codes.ts in backend/src/modules/admin/codes.ts"
Task: "orgs.ts in backend/src/modules/admin/orgs.ts"
Task: "audit.ts in backend/src/modules/admin/audit.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2, 모두 P1)

1. Phase 1 Setup → Phase 2 Foundational(시드·RBAC 포함, T018은 사용자 확인 후)
2. Phase 3 US1 → Phase 4 US2
3. **STOP and VALIDATE**: `owner-new` 가입, `owner-starter` 기록·오프라인, `owner-steady` 기록 고치기
4. 시연

### Incremental Delivery (plan.md 출시 단계와 일치)

1. 1차: Setup + Foundational + US1~US4 (+ ADM 기준값 탭 T088·T093 일부 — g3 기준값을 운영자가 넣을 수 있어야 US4가 열림)
2. 2차: US5 + US6 + 설정·탈퇴(T094)
3. 3차: US7 + US8 + ADM 전체 (결제 공급자·기관 계약 절차 확정 후)
4. 각 단계 끝에 T102 수용 검증의 해당 부분 실행

### 미확정 사항이 작업에 주는 영향

| 미확정 | 영향 작업 | 처리 |
|---|---|---|
| 명세 Q2 가입 수단 | T023 | AuthProvider 경계 안에서만 교체 |
| 명세 Q3 탈퇴 처리 | T094, T014 CASCADE | 잠정 "즉시 삭제" |
| 명세 Q1 범위 | Phase 9·10 | 3차로 배치 |
| 기준값(g3·g5·경보) | T061, T069, US4~US8 | 운영 NULL → 차단. ADM에서 입력 |
| 결제 공급자·파일 형식 | T080, T082 | mock·잠정 형식 |
| 경보 대체 규칙 | T070 | 최신 순 표시만 |

---

## Notes

- [P] = 다른 파일·선행 없음, [Story] = 추적용 라벨
- 시드는 이미 작성되어 있으나 **DB에서 실행해 보지 않았다** — T016에서 처음 실행·멱등 확인
- 공용 팀 DB에 쓰는 작업(T018, T016 실행, T102)은 실행 전 사용자 확인
- 각 Checkpoint에서 해당 스토리를 시드 페르소나로 단독 검증
- 금지: Docker, 로컬·다른 DB, 게이트 판정 중복 구현, 분석·문장 로직 중복, 토스트로 게이트 표현
