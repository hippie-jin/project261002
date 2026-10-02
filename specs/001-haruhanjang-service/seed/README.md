# 체험용 시드 데이터 — 하루한장

`seed-base.sql`(운영·개발 공통 RBAC 기준 데이터)과 `seed-dev.sql`(개발·시연 전용)로 명세의 사용자 시나리오 US1~US8과 RBAC를 직접 겪어 볼 수 있다. 모든 날짜는 실행일 기준 상대 날짜라 언제 실행해도 같은 체험이 된다.

**주의**
- `seed-dev.sql` 은 개발 전용이다. 시드 러너는 `NODE_ENV=production` 이면 실행을 거부한다.
- 지역·업종·매출 구간은 `DEV-` 접두와 "(샘플)" 표기의 가상 코드다. 실제 행정 코드가 아니다.
- 기준값 `g3_min_records=14`, `alert_window_days=14` 는 명세 Assumptions의 제안값이고, `g5_min_stores=5`, `alert_min_decline=0.30` 은 **체험을 위한 임의값**이다. 운영 근거가 아니다.
- 2026년 공휴일(광복절·추석 연휴·개천절·대체공휴일)만 표시한다. 다른 해에 실행하면 공휴일이 없는 것으로 보인다. 운영 데이터는 특일 정보 API로 적재한다.
- 2026-10-03 팀 DB 에서 두 번 실행해 멱등성을 확인했다(78문장). 실행 중 `INSERT … SELECT` 는 트리거보다 NOT NULL 검사가 먼저라 `*_at_record` 를 명시하도록 고쳤다.
- 공개 체험 배포(p2.sumzip.com)에서는 기관·운영 비밀번호가 `hrh-dev-1234` 가 아니라 `backend/.env` 의 `SEED_DEV_PASSWORD`(무작위)다.

## 실행 순서

```bash
cd backend
npm run db:migrate        # 0001_sd03_baseline → 0002_plan_deltas
npm run db:seed:base      # seed-base.sql
npm run db:seed:dev       # seed-dev.sql (SET @auth_pepper, bcrypt 치환은 러너가 처리)
```

## 로그인 방법

| 종류 | 화면 | 방법 | 비밀번호 |
|---|---|---|---|
| 사장님 | 첫 화면 `/` 의 페르소나 버튼 (`AUTH_DEV_LOGIN=1` 일 때만) | 아래 subject | 없음 |
| 사장님(아이디) | `/login` | 아래 subject 를 아이디로 (`owner-new` 제외) | `SEED_DEV_PASSWORD` (공개 배포 `hrh1234`) |
| 기관 | `/org/login` | `mapo-econ`, `expired-merchant` | `SEED_DEV_PASSWORD` (로컬 기본 `hrh-dev-1234`) |
| 운영 인력 | `/staff/login` | `admin`, `data-manager`, `operator`, `auditor` | `SEED_DEV_PASSWORD` (로컬 기본 `hrh-dev-1234`) |

## 사장님 페르소나

| subject | 가게 | 상태 | 체험 시나리오 |
|---|---|---|---|
| `owner-new` (시드 없음) | — | 처음 로그인 | **US1** 안내·동의(G0)·업종/지역(G1)·쉬는 요일 생략·익명 미동의 |
| `owner-starter` | 망원동 분식 | 기록 6일, 오늘 미기록, 쉬는 요일 미입력, 익명 **미동의** | **US2** 첫 기록·G2·오프라인 전송 대기 / **US4** G3 차단(6일 < 14) / **US6** G4 차단 → 동의하기 / US4 요일 관점에서 쉬는 요일 입력 요청(UC3 A1) |
| `owner-steady` | 망원동 분식 | 60일, 일요일 휴무, 9일 주기로 빠진 날, **오늘 기록 있음**, 익명 동의 | **US2** 오늘 기록 고치기(UC2 A2) / **US3** 달력(● ○ –, 쉼, 기록 안 한 날, 확인 필요, 축제) / **US4** 금요일 좋음·비 오는 날 손님 적음·할인행사 전후·토요일 재료 부족 / **US6** 동네 비교 통과(망원 분식 동의 5곳) |
| `owner-declining` | 망원동 분식 | 42일, 최근 14일 나쁨·손님 적음, 경보 수신 끔, **새 경보 1건** | **US5** 경보 카드(앱 안 표시)·근거 보기·확인했어요 / 오늘 기록 시 새 하락 판정 |
| `owner-paid` | 합정동 카페 | 30일, 월요일 휴무, 결제 실패 1·성공 1, 보고서 권한, **확인 전 보고서 1건** | **US7** G7(확인 체크 전 받기 비활성) → 확인 → 받기 / 백업·내보내기 선택 시 G6(권한 없음) |
| `owner-neighbor-1~3` | 망원동 분식 | 0~35일, 익명 동의 | 동네 묶음을 채우는 이웃(망원 분식 5곳 중 3곳) |
| `owner-cafe-neighbor` | 합정동 카페 | 0~20일, 익명 동의 | **US6** G5 차단 체험(합정 카페 동의 2곳 < 5) |
| `owner-yeonhui` | 연희동 한식(서대문구) | 10일 | 기관 관할 밖 지역 데이터(관할 판정 확인용) |

외부 환경데이터 상태: 오늘·어제 날씨는 아직 없음(ASOS 지연), 17일 전·33일 전은 조회 실패 → 모두 '확인 필요'. 나머지는 맑음·흐림·비(7일 주기, 3일 전·10일 전 …).

## 기관·운영 페르소나

| 로그인 | 역할 | 체험 |
|---|---|---|
| `mapo-econ` | org_viewer, 계약 유효, 관할 마포구 | **US8** 마포구 대시보드: 망원동×분식 공개, 합정동×카페 "표시 불가 - 표본 부족"(G5), 마포구×업종 전체 롤업은 하위 칸 미달로 억제(FR-075), 지역행사 관점(축제 주간), 반복 문제(재료 부족) |
| `expired-merchant` | org_viewer, **계약 만료** | **US8-1** G8 차단 화면 |
| `admin` | admin | 운영 콘솔 전 탭, 역할 부여·회수 |
| `data-manager` | data_manager | 기준값 탭만(예: g3를 14→7로 바꾸면 owner-starter의 G3가 풀리지 않고 그대로 6<7, 5로 바꾸면 풀림) |
| `operator` | operator | 지역·업종 코드, 기관·관할·계약 상태(예: `expired-merchant` 계약을 active로 바꾸면 G8 해제) |
| `auditor` | auditor | 감사 탭: 게이트 이력 6건, 보고서 반출 이력, 기관 조회 이력, 익명 칸 가게 수 |

RBAC 확인 포인트: 사장님 세션으로 `/api/admin/*`·`/api/org/*` 호출 시 403, `data-manager` 로 역할 탭·기관 탭 접근 시 403, `auditor` 로 기준값 변경 시 403. 어떤 운영 역할로도 개별 사장님 기록은 조회되지 않는다.
