# Research: 하루한장 구현 계획 (Phase 0)

**Feature**: `specs/001-haruhanjang-service/spec.md` · **Date**: 2026-10-02
**입력**: `Intent-Plan.md`(웹 스택·DB 설정), `design/` 설계 일체, 사용자 지시 "docker 컨테이너를 사용하지 않는다"

각 항목은 Decision / Rationale / Alternatives considered 형식이다. 사용자 확인이 필요한 결정은 **[확인 필요]** 로 표시했다.

---

## R1. 팀 데이터베이스 실측 (2026-10-02, 읽기 전용 조회)

Node `mysql2` 로 `mis.iptime.org:13306/ABC11pioneer2` 에 접속해 `SELECT VERSION()`, `SHOW GRANTS`, 스키마 테이블 수만 조회했다. 쓰기는 하지 않았다.

| 항목 | 실측값 | 계획에 주는 영향 |
|---|---|---|
| 버전 | `12.1.2-MariaDB-ubu2404-log` | VIRTUAL 생성 컬럼·CHECK·윈도 함수·`CREATE OR REPLACE VIEW` 모두 지원. 설계 DDL(12.0.2 검증)과 호환 |
| 시간대 | `@@time_zone = +09:00`, 시스템 KST | `CURRENT_DATE` 판정(오늘 기록·미래 날짜·계약 만료)이 KST 기준 — 명세 가정과 일치. 커넥션에서 `SET time_zone='+09:00'` 을 명시해 고정한다 |
| `lower_case_table_names` | 0 | 테이블 이름 대소문자 구분. 설계의 소문자 명명 그대로 사용 |
| 문자 집합 | utf8mb4 | 한글 라벨 문제 없음 |
| `sql_mode` | `STRICT_TRANS_TABLES` 포함 | NOT NULL 누락이 오류로 거부됨 — G1·G2 강제에 유리 |
| 권한 | `ABC11pioneer2.*` 에 ALL, 전역은 USAGE | **`CREATE ROLE`·`GRANT` 불가** → 설계 DDL의 역할 절을 제거하고 기관 접근 제한을 API 계층에서 강제(R7) |
| binlog | off (`log_bin=0`) | 비-SUPER 계정의 함수·트리거 생성 가능 |
| 기존 테이블 | 0개 | 충돌 없이 마이그레이션 적용 가능 |

**Decision**: 설계 DDL(`design/hrh_ddl.sql`)을 기준으로 하되 R7·R9·R10의 차이를 반영한 마이그레이션으로 적용한다.

## R2. Docker 미사용 하의 DB 접속·마이그레이션

**Decision**: 모든 DB 작업(마이그레이션·시드·검증)은 Node 스크립트가 `mysql2` 로 외부 접속 정보(`mis.iptime.org:13306`)를 써서 수행한다. `DELIMITER` 블록은 자체 마이그레이션 러너가 구분자를 해석해 문장 단위로 실행한다.

**Rationale**: 사용자 지시로 Docker 컨테이너를 쓰지 않고, `Intent-Plan.md` 는 Homebrew mysql 바이너리와 다른 DB 사용을 금지한다. 남는 합법 경로는 애플리케이션과 같은 드라이버(mysql2)로 외부 호스트에 붙는 것뿐이다. mysql2 는 `DELIMITER` 를 이해하지 못하므로(클라이언트 전용 지시어) 러너가 처리해야 한다.

**Alternatives considered**:
- `docker exec mariadb mysql …`(Intent-Plan 권장) — 사용자 지시로 제외.
- 로컬 Homebrew MariaDB(이전 DDL 검증 때 사용) — Intent-Plan 위반이므로 이후 사용하지 않는다. 해당 검증은 팀 DB에서 다시 수행한다(quickstart §4).
- ORM 마이그레이션(Knex·Prisma) — 트리거·함수·VIRTUAL 컬럼을 설계 SQL 그대로 쓰기 어렵다. 순수 SQL 파일 + 경량 러너가 설계와의 1:1 대응을 지킨다.

## R3. 테스트 데이터베이스

**Decision**: 별도 스키마를 만들지 않는다(전역 권한이 없어 `CREATE DATABASE` 불가). 통합 테스트는 `ABC11pioneer2` 에서 **트랜잭션 안에서 실행하고 항상 롤백**한다. DDL 검증(멱등·위반 거부)은 테이블 접두 없이 같은 스키마에 적용하되, 검증 데이터는 트랜잭션 롤백으로 남기지 않는다.

**Rationale**: 계정이 접근 가능한 다른 스키마(`ABC5/6/8pioneer2`, `pioneer2`)는 다른 과제의 것일 수 있어 건드리지 않는다. 트리거·CHECK·뷰는 트랜잭션 안의 DML에서도 그대로 동작한다.

**Alternatives considered**: 테스트 전용 스키마 생성(권한 없음), SQLite 대체(트리거·함수 방언이 달라 검증 의미 없음, 그리고 다른 DB 사용 금지).

**[확인 필요]** 개발용과 테스트용이 같은 스키마를 공유한다. 운영 데이터가 들어가기 시작하면 별도 스키마를 관리자에게 요청해야 한다.

## R4. 웹 스택 확정

**Decision**: `Intent-Plan.md` 스택을 그대로 쓴다.

| 계층 | 선택 | 버전 기준 |
|---|---|---|
| 프론트엔드 | Vue 3(Composition API) + TypeScript + Vite + Pinia + Vue Router | Vue 3.4+, TS 5.x, Vite 5.x, Pinia 2.x |
| 백엔드 | Node.js + Express + TypeScript | Node 20 LTS, Express 4.x |
| DB 드라이버 | mysql2/promise (커넥션 풀) | 3.x |
| 검증 | zod(요청 스키마) | 3.x |
| 테스트 | Vitest(단위·컴포넌트), Supertest(API), Playwright(E2E 모바일 뷰포트) | — |

**Node 버전**: Intent-Plan은 v20 LTS, 로컬 설치는 v25.3.0이다. `engines: ">=20"` 과 `.nvmrc` 에 20을 두고, CI·운영은 20 LTS로 맞춘다. 로컬 v25에서도 동작하는 의존성만 쓴다.

## R5. "기기 내 분석"(BR-HRH-10)과 오프라인 기록(UC2 E3)을 웹에서 구현하는 방법

**Decision**: 사장님 화면은 **설치 가능한 PWA**로 만든다.
- 개인 분석(패턴·신뢰도·경향 문장·경보 판정)은 **브라우저 안 TypeScript 모듈**(`frontend/src/analysis/`)이 수행한다. 서버는 본인 기록 원자료만 내려주고 분석 결과를 계산·저장하지 않는다(경보·보고서 스냅숏 제외).
- 오프라인 저장은 Service Worker + IndexedDB 송신 대기열(`outbox`)로 처리하고, 연결 복구 시 Background Sync(미지원 브라우저는 앱 재진입 시 재전송)로 보낸다.
- 오프라인 달력은 IndexedDB 기록 캐시로 그린다.

**Rationale**: SD_01·SD_03은 "기기 내 통계분석" 레인과 "전송 대기" 상태를 전제한다. 웹 스택에서 이를 만족하는 표준 방법이 PWA다. 서버에서 분석하면 원천의 운영비 절감 의도와 SD_03 §2-3(개인 분석은 애플리케이션·기기 내)과 어긋난다.

**신뢰도·경향 문장 단일 모듈**: SD_03 §2-3 "같은 유도값을 두 곳에서 계산하지 않는다"를 지키기 위해 신뢰도 식·문장 템플릿은 `frontend/src/analysis/` 에만 둔다. 보고서 생성(US7)은 **클라이언트가 계산한 스냅숏을 서버에 제출**하고, 서버는 G3(기간 기록 수)만 재검증한다. 동네·기관 경향 문장도 같은 프론트엔드 문장 모듈로 만든다(기관 대시보드도 같은 프론트엔드 앱의 별도 라우트).

**Alternatives considered**: 네이티브 앱(스택 불일치), 서버 분석(BR-HRH-10·SD_03 위반), 분석 모듈을 서버·클라이언트에 이중 구현(중복 계산 금지 위반).

## R6. 경보 알림(UC6)

**Decision**: Web Push(VAPID)를 쓰고, 구독이 없거나 권한이 거부되면 `display_channel='in_app'` 으로 서비스 안 카드만 표시한다(UC6 E3). 경보 판정은 기록 저장 직후 클라이언트에서 하고(SD_01 P2 2.8), 생성 요청을 서버에 보내면 서버가 G3를 재검증해 저장한 뒤 Web Push를 발송한다.

**Rationale**: 기록 저장(사용자 행위)이 계기이므로 판정 시점에 앱이 열려 있다. iOS Safari는 홈 화면에 설치된 PWA에서만 Web Push를 받으므로 in_app 경로가 반드시 필요하다 — 이미 UC6 E3가 정의한 경로다.

**Alternatives considered**: 서버 배치 판정 후 푸시(분석이 서버로 이동, R5와 충돌), 문자 메시지(전화번호 수집, BR-HRH-01 충돌).

## R7. 기관 접근 제한(BR-HRH-21)과 역할 부재

**Decision**: DB 역할 대신 **API 계층 분리**로 강제한다. 기관 라우터(`/api/org/*`)의 데이터 접근 모듈은 `v_anon_cell`·`v_anon_problem_cell` 두 뷰만 조회하도록 저장소 함수를 한정하고, 테스트로 "기관 라우터가 원천 테이블 이름을 포함한 쿼리를 실행하지 않는다"를 검사한다(쿼리 로깅 기반 계약 테스트).

**Rationale**: R1에서 `CREATE ROLE` 권한이 없음을 확인했다. 단일 DB 계정을 쓰는 이상 DB 수준 분리는 불가능하다.

**Alternatives considered**: 관리자에게 별도 읽기 전용 계정 요청 — 가장 강하지만 외부 의존. **[확인 필요]** 운영 전에 기관 전용 DB 계정(뷰 2개 SELECT만)을 관리자에게 요청하는 것을 권고한다.

## R8. 인증 — 명세 Q2(가입 수단) 미확정

**Decision (잠정)**: 사장님은 **간편 로그인(카카오 OAuth 2.0)**, 기관은 **아이디·비밀번호(bcrypt 해시)** 로 인증한다. 세션은 서버 서명 JWT를 `HttpOnly; Secure; SameSite=Lax` 쿠키로 둔다. 외부 계정 식별자는 그대로 저장하지 않고 서버 비밀값(pepper)과 함께 SHA-256 해시로만 저장한다. 개발 환경에는 `AUTH_DEV_LOGIN=1` 일 때만 열리는 개발용 로그인 공급자를 둔다.

**Rationale**: 명세 질문 Q2의 선택지 중 개인정보 최소 수집(BR-HRH-01)과 기기 변경 내성을 함께 만족한다. 인증 공급자는 `AuthProvider` 인터페이스 뒤에 두어 Q2 답이 B(휴대폰)·C(기기 익명)로 정해져도 교체 범위를 인증 모듈로 한정한다.

**[확인 필요]** 명세 Q2 답에 따라 바뀐다. 카카오 앱 키(REST API 키·리다이렉트 URI) 발급이 필요하다.

## R9. 범위·탈퇴 — 명세 Q1·Q3 미확정

**Decision (잠정)**:
- Q1(범위): **US1~US8 전부를 계획하되 3단계로 출시**한다. 1차 MVP = US1~US4(P1·P2), 2차 = US5·US6, 3차 = US7·US8. 결제 공급자와 기관 계약 등록은 3차 착수 전에 확정한다.
- Q3(탈퇴): **탈퇴 시 즉시 삭제**(계정·동의·가게·기록·경보·결제·보고서 이력 전부, 한 트랜잭션), 익명 참여만 철회하면 집계에서 제외(동의 사건 추가)한다. 탈퇴 화면은 SD_02에 없으므로 S3 하단 "설정" 진입점에 최소 화면(S8)을 추가한다.

**Rationale**: 사용자가 설계 전체의 구현 계획을 요청했으므로 범위에서 빼지 않되, 미확정 외부 의존(결제·계약)이 있는 기능을 뒤로 미뤄 일정 위험을 격리한다. 탈퇴 즉시 삭제는 질문 Q3의 선택지 중 가장 단순하고 개인정보 부담이 낮다.

**영향**: SD_03 §16의 "동의 이력 수정·삭제 없음"(FR-092)은 **탈퇴 시 예외**가 된다. 삭제 전 탈퇴 사실 자체(시각·사유 없음, 계정 식별 불가 형태)만 남길지는 법률 검토 대상이다.

**[확인 필요]** 명세 Q1·Q3 답에 따라 바뀐다.

## R10. 설계 DDL 대비 변경점

| 변경 | 이유 | 근거 |
|---|---|---|
| 역할 `hrh_org_reader` 와 `GRANT` 제거 | 권한 없음 | R1, R7 |
| `auth_identity` 테이블 추가(계정 ↔ 공급자·해시 식별자) | 로그인 필요 | R8 |
| `org_account` 테이블 추가(기관 로그인 아이디·비밀번호 해시) | 기관 로그인 필요 | R8, US8 |
| `push_subscription` 테이블 추가 | Web Push | R6 |
| `region.weather_station_id` 컬럼 추가 | 지역 → 기상 관측소 매핑 | R11 |
| A~E 영역 FK에 `ON DELETE CASCADE`(계정 삭제 연쇄) | 탈퇴 즉시 삭제 | R9 |
| `v_anon_cell` 롤업 억제: 상위 지역·업종 전체 칸은 구성 하위 칸이 **모두** G5를 통과할 때만 공개 | 역산 방지 | 명세 FR-075, SD_03 §18 |
| `threshold_setting` 초기값: 운영은 NULL 유지, 개발 시드만 `g3_min_records=14`, `alert_window_days=14` | 명세 Assumptions | spec Assumptions |
| 마이그레이션 이력 테이블 `schema_migration` | 러너가 적용 이력 관리 | R2 |

SD_03 원칙(뷰·함수 단일 판정, 유도값 비저장, 기준값 NULL이면 차단)은 그대로 유지한다.

## R11. 외부 공공 데이터 연동(BR-HRH-07)

**Decision**:
| 데이터 | 출처 | 방식 |
|---|---|---|
| 날씨 | 기상청 ASOS 일자료(공공데이터포털 `AsosDalyInfoService`) | 지역별 대표 관측소(`region.weather_station_id`)의 전일·당일 일자료. 강수량·일기 현상으로 `weather_code`(맑음/흐림/비/눈) 산출 |
| 공휴일 | 한국천문연구원 특일 정보(공공데이터포털 `SpcdeInfoService/getRestDeInfo`) | 월 단위 조회 후 `calendar_day` 적재 |
| 지역행사 | 한국관광공사 TourAPI 행사정보(`searchFestival`) | 지역 코드·기간 조회 후 `region_event` 적재 |

공통: 서비스 키는 환경변수(`DATA_GO_KR_KEY`)로 둔다. 조회 결과는 `env_fetch_job` 에 지역·날짜·종류별로 기록하고, 실패는 `failed` + 시도 횟수 증가. 재조회 배치(P0)는 Node 프로세스 안의 스케줄러(`node-cron`)로 하루 1회 이상 실행한다(명세 Assumptions).

**Rationale**: 원천이 "기상청·공공데이터포털의 무료 데이터", "지자체 지역행사·상권정보"를 지정했다. 지자체별 행사 API는 형식이 제각각이라 전국 단일 형식인 TourAPI를 1차 출처로 쓴다.

**Alternatives considered**: 단기예보(미래 예보라 기록일 실측과 다름), 지자체 개별 API(형식 분산).

**[확인 필요]** 공공데이터포털 서비스 키 발급, 지역 ↔ 관측소 매핑 기준(지역 목록이 정해지면 확정). ASOS 일자료는 전일 자료가 다음 날 오전에 제공되므로 "당일 기록"은 처음엔 '확인 필요'였다가 P0 재조회로 채워지는 것이 정상 흐름이다.

## R12. 결제(US7)

**Decision (잠정)**: `PaymentProvider` 인터페이스 뒤에 두고 1·2차 출시에서는 구현하지 않는다. 3차 착수 시 국내 PG(예: 토스페이먼츠) 중 선택한다. 개발 환경에는 성공·실패를 선택할 수 있는 모의 공급자를 둔다.

**Rationale**: 결제 수단·가격이 사업 결정 사항(명세 FR-074)이라 지금 고정할 근거가 없다.

## R13. 배포 — Docker 미사용

**Decision**: GitLab CI/CD가 빌드·테스트 후 산출물(백엔드 `dist/`, 프론트엔드 정적 파일)을 SSH로 서버에 배포한다. 서버에서는 Node 20 LTS 프로세스를 PM2로 관리하고, Nginx가 HTTPS 종단·정적 파일 제공·`/api` 리버스 프록시를 맡는다.

**Rationale**: Intent-Plan의 Nginx·GitLab CI/CD는 유지하고, 사용자 지시에 따라 Docker 패키징만 PM2 프로세스 관리로 대체한다. PWA·Web Push는 HTTPS가 필수이므로 Nginx TLS가 필요하다.

**Alternatives considered**: Docker 컨테이너(사용자 지시로 제외), systemd 단독(PM2가 무중단 재시작·로그 관리가 간편).

## R14. 성능·규모 가정

원천·설계에 수치가 없다. 명세 SC-003(저장 체감 1초 이하)과 SC-002(30초 기록)를 기준으로 다음을 목표로 둔다.
- API 응답: 기록 저장·조회 p95 300ms 이하(팀 DB 왕복 포함).
- 익명 집계 뷰: 초기 규모(가게 수백, 기록 수만)에서 조회 시 계산. 1초를 넘으면 주 단위 집계 저장으로 전환(SD_03 §15-4).
- 프론트엔드: 모바일 3G 환경 첫 화면 3초 이내, 기록 화면은 캐시에서 즉시 열림.
