# DB 적용·검증 기록 (T018)

- 일시: 2026-10-03 (KST)
- 대상: 팀 MariaDB `12.1.2-MariaDB` · `mis.iptime.org:13306/ABC11pioneer2` (사용자 승인 후 적용)
- 방법: Node(mysql2) 러너 — Docker·Homebrew 바이너리 미사용

## 적용

| 단계 | 결과 |
|---|---|
| `npm run db:migrate` 1회차 | 0001(64문장)·0002(36문장) 적용 |
| `npm run db:migrate` 2회차 | 전부 skip (멱등) |
| `npm run db:seed:base` ×2 | 성공, 중복 없음 |
| `npm run db:seed:dev` ×2 | 성공(78문장), 중복 없음 |
| `0003_view_collation.sql` | 뷰 14개 재생성(아래 이탈 2) |
| `npm run db:verify` | **39/39 PASS**, 잔존 테스트 행 0 |

## MariaDB 12.1.2 에서 발견한 이탈

1. **`INSERT … SELECT` 는 BEFORE INSERT 트리거보다 NOT NULL 검사가 먼저다.** `daily_record.*_at_record` 를 트리거가 채운다는 설계 가정은 `INSERT … VALUES` 에서만 성립한다. 시드는 값을 명시하도록 고쳤고(트리거가 같은 값으로 덮어씀), API 저장소도 명시한다.
2. **콜레이션 혼합.** mysql2 의 `utf8mb4` 는 12.x 기본 `utf8mb4_uca1400_ai_ci` 로 연결되는데 스키마·테이블은 `utf8mb4_unicode_ci` 다. 그 커넥션에서 만든 뷰의 문자열 리터럴이 컬럼과 비교되며 오류(verify T34). 커넥션을 `UTF8MB4_UNICODE_CI` 로 고정하고 0003 으로 뷰를 재생성했다.
3. **역할 불가.** `CREATE ROLE` 권한이 없어 0001 에서 역할 절을 뺐다(research R1). T35 는 RBAC 권한표 검사로 대체.

## 케이스 결과

```
PASS T01 G0 동의 없이 가게 생성 | ER_SIGNAL_EXCEPTION G0/BR-HRH-02: 필수 동의 기록 없이 가게 프로필을 만들 수 없음
PASS T02 G1 지역 NULL | ER_BAD_NULL_ERROR Column 'region_code' cannot be null
PASS T03 G2 손님수 NULL | ER_BAD_NULL_ERROR Column 'customer_level' cannot be null
PASS T04 BR-05 오늘장사 값 범위 | ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE CONSTRAINT `chk_dr_mood` failed for `ABC11pioneer2`.`daily_record`
PASS T05 UC2 A2 같은 날짜 중복 | ER_DUP_ENTRY Duplicate entry '800001-2026-10-03' for key 'uq_dr_store_date'
PASS T06 미래 날짜 | ER_SIGNAL_EXCEPTION UC2: 미래 날짜는 기록할 수 없음
PASS T07 기록 시점 지역 스냅숏 | TST-MW TST-B1
PASS T08 재저장 시 판본 증가 | 2
PASS T09 날짜 변경 금지 | ER_SIGNAL_EXCEPTION UC2 A2: 가게·날짜·기록 시점 지역/업종은 바꿀 수 없음
PASS T10 G3 기준 미정이면 경보 거부 | ER_SIGNAL_EXCEPTION G3/BR-HRH-08: 기록 부족 - 경보를 만들 수 없음
PASS T11 G3 기준 2일 설정 후 경보 생성 | 1
PASS T12 G3 기록 1일 가게는 경보 거부 | ER_SIGNAL_EXCEPTION G3/BR-HRH-08: 기록 부족 - 경보를 만들 수 없음
PASS T13 경보 확인함인데 확인 시각 없음 | ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE CONSTRAINT `chk_alert_ack` failed for `ABC11pioneer2`.`alert`
PASS T14 G6 실패한 결제로 권한 생성 | ER_SIGNAL_EXCEPTION G6/BR-HRH-19: 성공한 결제 없이 이용 권한을 만들 수 없음
PASS T15 G6 성공한 결제로 권한 생성 | 1
PASS T16 G3 기록 없는 기간 보고서 | ER_SIGNAL_EXCEPTION G3/BR-HRH-08: 기간 기록 부족 - 보고서를 만들 수 없음
PASS T17 G7 확인 없이 전달 | ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE CONSTRAINT `chk_rx_confirm_before_deliver` failed for `ABC11pioneer2`.`
PASS T18 G7 확인 후 전달 | 1
PASS T19 G6 다른 가게 권한으로 보고서 | ER_SIGNAL_EXCEPTION G6/BR-HRH-19: 유효한 이용 권한이 없음
PASS T20 G8 계약 만료 기관 조회 | ER_SIGNAL_EXCEPTION G8: 이용 계약이 유효하지 않음
PASS T21 UC8 A1 관할 밖 지역 | ER_SIGNAL_EXCEPTION UC8 A1: 관할 밖 지역은 조회할 수 없음
PASS T22 관할 하위 지역 조회 기록 | 1
PASS T23 지역행사 기간 역전 | ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE CONSTRAINT `chk_re_period` failed for `ABC11pioneer2`.`region_event`
PASS T24 G5 기준 미정이면 익명 집계 비공개 | 0
PASS T25 BR-16 미동의 가게 제외(동의 3곳만 집계) | 3
PASS T26 G5 기준 3곳이면 공개(동×분식, 동×전체, 구×분식, 구×전체) | 4
PASS T27 G5 기준 4곳이면 다시 비공개 | 0
PASS T28 반복 문제 익명 비율(동의 가게 기록 4건 중 재료 부족 2건) | 0.50
PASS T29 동의 철회 시 G4 즉시 반영 | 0
PASS T30 BR-13 외부 조회 없음 → 확인 필요 | needs_check NULL
PASS T31 P0 재조회 성공 → 값 결합 | ok rain
PASS T32 게이트 이벤트 G7 대상 종류 불일치 | ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE CONSTRAINT `chk_ge_pair` failed for `ABC11pioneer2`.`gate_event`
PASS T33 게이트 해제 행동 없이 해제 시각 | ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE CONSTRAINT `chk_ge_release` failed for `ABC11pioneer2`.`gate_event`
PASS T34 진행 레일 뷰 | 1 2 1 1
PASS T35 기관 역할 권한은 익명 조회 2개뿐(v_principal_permission) | org.problems.read,org.trends.read
PASS T36 RBAC 역할-주체 종류 불일치 거부 | ER_SIGNAL_EXCEPTION RBAC: 역할과 주체 종류가 맞지 않음
PASS T37 RBAC 없는 주체 역할 부여 거부 | ER_SIGNAL_EXCEPTION RBAC: 존재하지 않는 주체
PASS T38 롤업 억제: 합정 카페 2곳 미달 → 구×전체 비공개, 구×분식 공개(T29 철회 가게 재동의 후) | 0 1
PASS T39 계정 삭제 → 가게·기록·경보·역할 연쇄 삭제 | 0 0 0 0
잔존 테스트 행: 0
FAILED 0 of 39
```
