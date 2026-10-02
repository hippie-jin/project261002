# Implementation Plan: 하루한장 — 소상공인 일일 장사 기록·분석 서비스

**Branch**: `001-haruhanjang-service` (git 저장소 아님 — 브랜치 없음) | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-haruhanjang-service/spec.md` + `design/` 설계 일체(UC_00~08, SD_01~03, 스타일가이드) + `Intent-Plan.md`(웹 스택·DB) + 사용자 지시 "docker 컨테이너를 사용하지 않는다"

## Summary

사장님용 모바일 PWA(Vue 3)와 Express API, 팀 MariaDB로 하루한장을 구현한다. 핵심 경로는 **30초 기록(US2)** 이고, 분석·경보 판정은 브라우저 안 통계 모듈이(BR-HRH-10), 게이트 판정은 SD_03의 DB 함수·뷰가 단일 지점으로 맡는다. 익명 비교·기관 대시보드는 G5 통과 칸만 공개하는 뷰를 API가 그대로 내보낸다. Docker 없이 Node 스크립트로 마이그레이션하고, 배포는 PM2 + Nginx로 한다. 출시는 3단계(MVP US1~4 → US5·6 → US7·8)다.

명세의 미해결 질문 3건(Q1 범위, Q2 가입 수단, Q3 탈퇴 처리)은 사용자 답을 받지 못해 research R8·R9에서 **잠정 결정**으로 진행했다. 답이 다르면 해당 모듈(인증·탈퇴·출시 순서)만 바뀌도록 경계를 두었다.

## Technical Context

**Language/Version**: TypeScript 5.x — 백엔드 Node.js 20 LTS(로컬 v25.3.0에서도 동작하도록 의존성 선택), 프론트엔드 브라우저(ES2022)

**Primary Dependencies**: 프론트엔드 Vue 3.4+(Composition API), Vite 5, Pinia 2, Vue Router 4, vite-plugin-pwa(Workbox), idb(IndexedDB) / 백엔드 Express 4, mysql2 3(promise 풀), zod 3, jsonwebtoken, bcrypt, web-push, node-cron, undici(외부 API)

**Storage**: 팀 MariaDB 12.1.2 `ABC11pioneer2`(KST, utf8mb4, 대소문자 구분) — 외부 호스트 직접 접속, Docker·Homebrew·다른 DB 미사용. 브라우저 IndexedDB(송신 대기열·기록 캐시)

**Testing**: Vitest(백엔드·프론트엔드 단위, 분석 모듈), Supertest(API 계약·게이트 409), Playwright(모바일 뷰포트 E2E), DB 위반 거부 검증 스크립트(트랜잭션 롤백)

**Target Platform**: 모바일 브라우저(Android Chrome, iOS Safari — 홈 화면 설치 PWA) + 데스크톱 브라우저(기관 대시보드), Linux 서버(Node 20 + PM2 + Nginx HTTPS)

**Project Type**: web-service — frontend(SPA/PWA) + backend(REST API)

**Performance Goals**: 기록 저장 체감 1초 이하(SC-003, 낙관적 UI + 비동기 외부 결합), API p95 300ms 이하, 모바일 첫 화면 3초 이내, 익명 집계 조회 1초 이내(초과 시 집계 저장 전환)

**Constraints**: Docker 미사용(사용자), 지정 DB 외 사용 금지(Intent-Plan), DB 전역 권한 없음(역할·스키마 생성 불가, research R1), 개인 분석은 기기 내(BR-HRH-10), 게이트 판정 단일 지점(SD_03 D3), 기준값 NULL이면 차단(SD_03 D4), 본문 16px·버튼 48/72px(FR-080), 오프라인 기록 가능(UC2 E3)

**Scale/Scope**: 화면 9개(S1~S7 + 설정·탈퇴 S8 + 운영 콘솔 S9) + 로그인 3종(개발·기관·운영), API 경로 43개(contracts/openapi.yaml), 테이블 34개(SD_03 24 + 계획 신규 4 + RBAC 6), 뷰 14·함수 3·트리거 8. 초기 규모 가정: 가게 수백, 기록 수만 건

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

이 프로젝트에는 `.specify/memory/constitution.md` 가 없다. 대신 사용자가 명시한 제약과 설계 문서의 규율을 게이트로 쓴다.

| # | 게이트 | 출처 | Phase 0 전 | Phase 1 후 |
|:--:|---|---|:--:|:--:|
| C1 | Docker 컨테이너를 쓰지 않는다 | 사용자 지시 | 통과 | 통과 — 마이그레이션·검증·배포 모두 Node/PM2 (R2, R13) |
| C2 | 지정 팀 DB 외 DB·Homebrew 바이너리 금지 | Intent-Plan | **위반 이력** — 설계 단계 DDL 검증을 로컬 Homebrew MariaDB로 수행 | 통과 — 재검증을 팀 DB에서 수행하도록 계획(quickstart §4), 이후 로컬 DB 사용 없음 |
| C3 | 웹 스택 Vue 3 + Node/Express + mysql2 | Intent-Plan | 통과 | 통과 (R4) |
| C4 | 게이트 판정은 DB 함수·뷰 한 곳 | SD_03 D3 | 통과 | 통과 — API는 뷰 결과·SIGNAL 메시지만 사용 (data-model §3) |
| C5 | 유도값 이중 계산 금지 | SD_03 §2-3 | 통과 | 통과 — 신뢰도·문장 모듈은 프론트엔드 1곳, 서버는 스냅숏 저장만 (R5) |
| C6 | 기준값을 지어내지 않는다 | SD_03 D4, 명세 Assumptions | 통과 | 통과 — 운영 NULL, 개발 시드만 명세 가정값 (data-model §2-6) |
| C7 | 개인 식별 정보 최소 수집 | BR-HRH-01 | 조건부 — 가입 수단 미정 | 통과(잠정) — 외부 식별자 해시만 저장 (R8) |
| C8 | 기관에 개별 기록 비노출 | BR-HRH-21 | 통과 | **조건부** — DB 역할 불가로 API 계층 강제 + 계약 테스트 (R7). 운영 전 전용 DB 계정 요청 권고 |
| C10 | 인가는 역할-권한 단일 해석 지점, 운영 인력도 개별 기록 비노출 | 사용자 요청(RBAC), BR-HRH-21 | — | 통과 — `v_principal_permission` 단일 해석, staff 권한에 기록 조회 없음 (data-model §7) |
| C9 | 명세 미해결 질문 해소 | spec.md | **미해소** (Q1·Q2·Q3) | 잠정 결정으로 진행 — 사용자 확인 필요 (R8, R9) |

**판정**: 진행 가능. C2는 과거 위반을 시정 계획으로 처리했고, C8·C9는 사유를 아래 Complexity Tracking과 research에 기록했다.

## Project Structure

### Documentation (this feature)

```text
specs/001-haruhanjang-service/
├── spec.md              # 명세 (speckit.specify)
├── plan.md              # 이 파일
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── openapi.yaml     # Phase 1 (OpenAPI 3.0.3, 31 paths, 검증 통과)
├── checklists/
│   └── requirements.md  # 명세 품질 점검
└── tasks.md             # Phase 2 (speckit.tasks — 이 명령에서 만들지 않음)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.ts                    # Express 조립, /api 라우터, 오류 처리(SIGNAL → 409 GateBlocked)
│   ├── config/env.ts             # zod 환경 변수 검증
│   ├── db/
│   │   ├── pool.ts               # mysql2 풀, 커넥션마다 SET time_zone='+09:00'
│   │   ├── tx.ts                 # withTransaction / withRollback(테스트)
│   │   └── gateError.ts          # 'G3/BR-HRH-08: …' 메시지 → {gate, reasonKey}
│   ├── auth/                     # AuthProvider(kakao, dev), JWT 쿠키, 기관·운영 로그인, 잠금
│   ├── rbac/                     # loadPermissions(v_principal_permission), requirePermission, 소유 범위 가드
│   ├── gates/gateEvents.ts       # gate_event 열기·해제 (data-model §5)
│   ├── modules/
│   │   ├── onboarding/           # S1 — 한 트랜잭션 가입 (P1)
│   │   ├── store/                # 가게·쉬는 요일·경보 설정·동의 사건·탈퇴
│   │   ├── records/              # S2·S4 — 업서트, 기간 조회(v_record_env), 월간 요약
│   │   ├── rail/                 # v_store_rail, /gates/g3
│   │   ├── alerts/               # 경보 생성(G3 재검증)·확인·푸시 발송
│   │   ├── compare/              # S5 — v_anon_cell 조회
│   │   ├── paid/                 # S6 — PaymentProvider(mock), 권한, 보고서·내보내기
│   │   ├── org/                  # S7 — 기관 전용 저장소(익명 뷰 2개만), 조회 이력
│   │   ├── admin/                # S9 — 기준값·코드·기관/계약·감사·운영 인력/역할
│   │   └── push/                 # Web Push 구독
│   └── jobs/
│       ├── envFetch.ts           # P2 2.6 외부 결합(저장 후 비동기)
│       └── envRetry.ts           # P0 재조회 (node-cron, 하루 1회 이상)
├── db/
│   ├── migrations/
│   │   ├── 0001_sd03_baseline.sql   # design/hrh_ddl.sql − 역할 절
│   │   └── 0002_plan_deltas.sql     # data-model §2
│   ├── seed-base.sql             # RBAC 역할·권한 (specs/.../seed/seed-base.sql)
│   ├── seed-dev.sql              # 체험 페르소나·60일 기록 (specs/.../seed/seed-dev.sql)
│   └── scripts/
│       ├── migrate.ts            # DELIMITER 해석 러너
│       └── verify.ts             # 위반 거부 검증(트랜잭션 롤백)
└── tests/
    ├── contract/                 # openapi.yaml 대비 응답 형태, 기관 라우터 쿼리 제한
    ├── integration/              # 게이트 G0~G8 409, 업서트, 탈퇴 연쇄 삭제
    └── unit/

frontend/
├── src/
│   ├── analysis/                 # 기기 내 분석 단일 모듈: 신뢰도, 패턴, 전후 차이, 반복 문제, 하락 판정, 경향 문장 템플릿
│   ├── offline/                  # IndexedDB outbox·record_cache, 동기화
│   ├── components/               # C1~C11 (SD_02 §3)
│   ├── pages/
│   │   ├── StartPage.vue         # S1
│   │   ├── TodayPage.vue         # S2
│   │   ├── PatternPage.vue       # S3
│   │   ├── CalendarPage.vue      # S4
│   │   ├── ComparePage.vue       # S5
│   │   ├── PaidPage.vue          # S6
│   │   ├── SettingsPage.vue      # S8 (탈퇴·익명 철회·경보 수신)
│   │   ├── org/DashboardPage.vue # S7 (데스크톱 레이아웃)
│   │   ├── staff/ConsolePage.vue # S9 운영 콘솔 (권한별 탭)
│   │   └── auth/                 # DevLogin, OrgLogin, StaffLogin
│   ├── gates/copy.ts             # SD_02 §11-2 표준 문구(게이트별 단일 정의)
│   ├── stores/                   # Pinia: session, rail, records, alerts
│   ├── styles/tokens.css         # 스타일가이드 토큰(Rausch, ink, radius, spacing)
│   └── sw.ts                     # Service Worker (캐시, Background Sync, Push)
└── tests/
    ├── unit/                     # analysis/* 문장 금지어·신뢰도·판정
    └── e2e/                      # Playwright 모바일 시나리오(quickstart §6)
```

**Structure Decision**: Intent-Plan의 프론트엔드·백엔드 분리 구조(`frontend/`, `backend/`)를 따른다. 기관 대시보드는 별도 앱으로 나누지 않고 같은 프론트엔드의 `/org` 라우트(데스크톱 레이아웃)로 둔다 — 경향 문장 모듈을 공유해야 하기 때문이다(C5).

## Phase 0 / Phase 1 산출물

| 산출물 | 상태 | 핵심 |
|---|---|---|
| [research.md](./research.md) | 완료 | 팀 DB 실측(R1), Docker 없는 마이그레이션(R2), PWA 기기 내 분석(R5), 역할 대체(R7), 잠정 결정 R8·R9, 외부 API(R11), 배포(R13) |
| [data-model.md](./data-model.md) | 완료 | SD_03 채택 + 변경 9건, 이중 방어 규칙, 상태 전이, 게이트 이벤트 규칙, IndexedDB |
| [contracts/openapi.yaml](./contracts/openapi.yaml) | 완료 | 31 paths, 409 GateBlocked 공통 스키마, 익명 칸에 가게 수 필드 없음. swagger-parser 검증 통과 |
| [seed/](./seed/) | 완료(`/speckit.tasks`) | seed-base(RBAC 역할 6·권한 17), seed-dev(페르소나 9가게·기관 2·운영 4, 60일 상대 날짜), README(시나리오 매핑). DB 미실행 |
| [quickstart.md](./quickstart.md) | 완료 | Docker 없는 설치·마이그레이션·팀 DB 재검증·동작 확인 10건 |
| `CLAUDE.md` (에이전트 컨텍스트) | 완료 | 스택·제약·명령 요약 (spec-kit 스크립트 부재로 수동 작성) |

## 단계별 출시 (Phase 2 tasks 입력)

| 단계 | 사용자 시나리오 | 선행 조건 |
|---|---|---|
| 0 기반 | 마이그레이션 러너, 팀 DB 재검증, 인증(dev + kakao + 기관·운영) + RBAC, 시드, 공통 컴포넌트 C1~C4·C8·C11, 오류·게이트 처리 | 카카오 키(없으면 dev만) |
| 1 MVP | US1 시작하기, US2 30초 기록(+오프라인, 외부 결합·P0), US3 달력, US4 패턴 | 공공데이터 키(없어도 '확인 필요'로 동작), g3 기준값 확정 |
| 2 | US5 조기 경보(Web Push), US6 동네 비교, S8 설정·탈퇴 | 경보 하락 폭·g5 기준값 확정, VAPID 키 |
| 3 | US7 유료(결제 공급자), US8 기관 대시보드 | 결제 공급자·가격, 기관 계정 등록 절차, 기관 전용 DB 계정(권고) |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 자체 SQL 마이그레이션 러너(DELIMITER 해석) | 트리거·함수를 설계 SQL 그대로 적용해야 하고 Docker·mysql CLI를 쓸 수 없음 | ORM 마이그레이션은 트리거·VIRTUAL 컬럼을 설계와 1:1로 표현하기 어렵고, CLI는 Intent-Plan·사용자 지시로 금지 |
| BR-HRH-21을 DB 역할 대신 API 계층으로 강제(C8) | 계정에 `CREATE ROLE` 권한 없음(R1) | DB 역할 — 권한이 없어 불가. 운영 전 관리자에게 전용 계정 요청 권고 |
| 개발·테스트 스키마 공유(트랜잭션 롤백) | `CREATE DATABASE` 권한 없음, 다른 스키마는 타 과제 소유 가능성 | 별도 테스트 스키마 — 권한 없음 |
| 명세 미해결 3건을 잠정 결정으로 진행(C9) | 사용자가 답 없이 계획 단계를 요청 | 진행 중단 — 사용자 요청과 맞지 않음. 대신 결정을 모듈 경계 안에 격리 |
