# 수용 검증 기록 (T102)

- 일시: 2026-10-03 (KST) · 대상: https://p2.sumzip.com (공용 Nginx → 192.168.0.19:9502 → 127.0.0.1:9522)
- 데이터: 팀 MariaDB `ABC11pioneer2` + `seed-dev.sql` (체험 페르소나, 공개 체험 모드)

## 결과 요약

| 검증 | 명령 | 결과 |
|---|---|---|
| DB 위반 거부 | `cd backend && npm run db:verify` | 39/39 PASS, 잔존 행 0 (db-verify.md) |
| RBAC 권한표 | `npm run rbac:check` | 26/26 PASS |
| 기관 쿼리 제한 | `npm run org:guard` | 데이터 쿼리 21건 중 개별 기록 참조 0건 |
| 라우트 권한 선언 | 서버 기동 시 `assertAllRoutesDeclared` | 54/54 선언됨 |
| 게이트 문구 단일 정의 | `cd frontend && npm run check:gate-copy` | PASS |
| 브라우저 E2E (Chromium, 모바일 Pixel 7 + 데스크톱 1366) | `npx playwright test tests/e2e/scenarios.spec.ts` | 11/11 PASS (공개 주소, HTTPS) |
| 반응형 E2E (데스크톱 1440 · 태블릿 900 · 모바일) | `npx playwright test tests/e2e/responsive.spec.ts` | 9/9 PASS — 전체 20개 연속 3회 통과(2026-10-03) |
| 응답 시간 (공개 주소, 3회 중앙값) | curl | rail 0.04s · records 1년 0.05s · compare 0.18s · org/trends 0.18s · org/problems 0.15s |

## E2E 시나리오 ↔ 명세

| E2E | 명세 | 확인 내용 |
|---|---|---|
| 첫 화면 | — | 체험 표시, 페르소나 목록, 기관·운영 로그인 진입 |
| US1 가입 | US1-2·3·4, FR-011·013, T094 | G0 비활성+이유, 동의하지 않음 → 중단, G1 이유 줄, 완료 → /today, 레일 "잠김 G4", 탈퇴 후 세션 무효(401) |
| US2 30초 기록 | US2-2·3·4 | G2 이유 줄, 저장 → 3초 안 완료 표시, 날씨 '확인 필요' |
| US2 오프라인 | US2-5, UC2 E3 | 오프라인 저장 → "기기에 저장했어요"+전송 대기 → 연결 후 서버 반영 |
| US3 달력 | US3-1·2·6 | 격자, 쉼, 날짜 상세, 월간 요약 |
| US4 패턴 | US4-1·2·4·8 | G3 차단(기준 14일)·탭 비활성 / 경향 문장+참고 안내, 날씨 근거, 단정어 없음 |
| US5 경보 | US5-4·5 | 앱 안 경보 카드, 확인 후 버튼 사라짐 |
| US6 비교 | US6-1·3·4 | G5 차단(해제 버튼 없음) / 나란히, "상위" 없음 / G4 차단·비교 보기 비활성 |
| US7 유료 | US7-1·3 | G7 확인 전 받기 비활성 → 체크 후 활성, 백업 선택 시 G6 |
| US8 기관 | US8-1·3·6 | 표시 불가 칸, 망원동×분식 공개, 원자료 미제공 문구 / 계약 만료 G8 |
| RBAC 콘솔 | data-model §7 | 역할별 탭(data-manager·auditor·admin), 사장님 세션으로 /staff → 권한 없음 |

## E2E 중 발견·수정한 결함

1. 경향 카드의 "참고 정보예요 - 사장님 경험과 함께 판단해 주세요"가 표시되지 않음 — Vue Boolean prop 생략 시 false. `TrendCard` 기본값 true 로 수정(BR-HRH-11).
2. 오프라인 저장이 "저장 중"에서 멈춤 — Vue 반응형 배열을 IndexedDB 에 넣다 DataCloneError. 순수 객체로 복사 저장 + 저장 예외 시 오류 문구, Background Sync 등록은 기다리지 않도록 수정.

## 반응형 E2E 중 발견·수정한 결함

3. 모바일 하단 탭바가 처음부터 나오지 않음 — `OwnerLayout` 의 Boolean prop `tabs` 생략 시 false. 기본값 true 로 수정(기존 모바일 시나리오는 탭바를 검사하지 않아 놓쳤음).
4. 오늘 기록 화면에서 기존 기록 조회 응답이 사장님 선택보다 늦게 오면 선택을 지움(저장 버튼이 다시 꺼짐) — 선택한 뒤에는 응답이 덮어쓰지 않도록 수정.

## 확인하지 못한 것

- 카카오 로그인(키 없음), Web Push 수신(VAPID 키 없음 — 경보는 앱 안 표시 경로로 확인), 공공데이터 실제 조회(서비스 키 없음 — '확인 필요' 경로로 확인), iOS Safari 실기기, 스크린리더 실사용.
