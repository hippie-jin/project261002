# Quickstart: 하루한장 (개발 환경)

**전제**: Docker를 쓰지 않는다. DB는 팀 MariaDB(`mis.iptime.org:13306/ABC11pioneer2`)에 Node 드라이버로 직접 접속한다. Homebrew mysql 바이너리와 로컬 DB는 쓰지 않는다(`Intent-Plan.md`).

## 1. 준비

- Node.js 20 LTS(`.nvmrc`, 로컬 v25 에서도 동작 확인), npm, PM2(배포)
- 공공데이터포털 서비스 키(날씨·공휴일·행사) — 없으면 외부 데이터는 전부 '확인 필요'로 남는다(정상 동작)
- 카카오 REST API 키·리다이렉트 URI — 없으면 개발용 로그인(`AUTH_DEV_LOGIN=1`)만 쓴다

## 2. 환경 변수 (`backend/.env`, 저장소에 커밋하지 않는다)

```dotenv
DB_HOST=mis.iptime.org
DB_PORT=13306
DB_USER=pioneer2
DB_PASSWORD=********          # Intent-Plan.md 참조
DB_NAME=ABC11pioneer2
DB_TIMEZONE=+09:00

SESSION_JWT_SECRET=change-me
AUTH_SUBJECT_PEPPER=change-me
AUTH_DEV_LOGIN=1              # 운영에서는 0
KAKAO_REST_KEY=
KAKAO_REDIRECT_URI=http://localhost:5173/api/auth/kakao/callback

DATA_GO_KR_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
PAYMENT_PROVIDER=mock         # 3차 출시 전까지 mock
```

## 3. 설치·스키마 적용

```bash
cd backend && npm install
npm run db:migrate          # db/migrations/*.sql 순서대로 적용 (DELIMITER 해석, schema_migration 기록)
npm run db:seed:base        # RBAC 역할 6 · 권한 17
npm run db:seed:dev         # 체험 페르소나(seed/README.md), 개발 기준값(g3=14, g5=5, 경보 14일·0.3)

cd ../frontend && npm install
```

`db:migrate` 는 `0001_sd03_baseline.sql`(design/hrh_ddl.sql − 역할 절) → `0002_plan_deltas.sql`(data-model §2·§7) → `0003_view_collation.sql`(뷰 콜레이션) → `0004_id_ranges_report_body.sql` 순으로 적용하고 `schema_migration` 에 기록한다. 두 번 실행해도 안전하다.

## 4. DDL 검증 (팀 DB에서 재수행)

이전 설계 단계의 검증은 로컬 임시 MariaDB에서 했으므로 Intent-Plan 기준으로 팀 DB에서 다시 확인한다.

```bash
cd backend
npm run db:verify           # 39건, 트랜잭션 롤백 (결과: checklists/db-verify.md)
npm run rbac:check          # RBAC 권한표 26건
npm run org:guard           # 기관 라우터가 익명 뷰만 조회하는지
```

기대 결과: 모든 케이스 PASS, 실행 후 테이블에 테스트 행이 남지 않음.

## 5. 실행

```bash
cd backend && npm run dev        # http://127.0.0.1:9522/api
cd frontend && npm run dev       # http://0.0.0.0:9502 (Vite 프록시 /api → 9522)
```

### 배포 (Docker 없음 — 실제 운영 구성)

공용 Nginx 가 `https://p2.sumzip.com` → `192.168.0.19:9502` 로 프록시한다.

```bash
cd backend && npm run build                  # dist/
cd frontend && npm run build                 # dist/ (PWA, sw.js)
pm2 start deploy/ecosystem.config.cjs        # hrh-backend(127.0.0.1:9522) · hrh-frontend(vite preview 0.0.0.0:9502)
pm2 save
```

공개 체험 모드: `backend/.env` 에 `NODE_ENV=production`, `PUBLIC_DEMO=1`, `AUTH_DEV_LOGIN=1`, `COOKIE_SECURE=1`, `SEED_DEV_PASSWORD=<무작위>` — 기관·운영 시드 계정 비밀번호는 이 값이다.

## 6. 동작 확인 시나리오 (명세 독립 테스트와 대응)

| # | 시나리오 | 확인 |
|---|---|---|
| 1 | 개발 로그인 → S1 동의 체크 안 함 | 「동의하고 시작」 비활성 + G0 문구 (US1-2) |
| 2 | 동의 → 업종만 선택 | 「완료」 비활성 + G1 문구 (US1-4) |
| 3 | 가입 완료 → S2에서 손님 수 미선택 | 저장 비활성 + G2 문구 (US2-2) |
| 4 | 기록 저장 | 1초 안에 "오늘 한 장 완료", 날씨는 '확인 필요' (US2-3·4) |
| 5 | DevTools 오프라인 → 저장 | "저장됨(전송 대기)" → 온라인 복귀 후 전송 (US2-5) |
| 6 | S4 달력 | 기록한 날 ●○– + 글자, 미기록 "기록 안 한 날" (US3) |
| 7 | S3 패턴(기록 14일 미만) | G3 차단 블록 + 관점 탭 비활성 (US4-1) |
| 8 | 개발 시드의 14일 기록 픽스처 로드 후 S3 | 경향 문장 + 신뢰도 + 참고 안내 (US4-2) |
| 9 | S5 비교(익명 미동의) | G4 차단 + 「익명 참여 동의하기」 (US6-1) |
| 10 | S5 비교(동의, g5 기준 NULL) | G5 차단, 해제 버튼 없음 (US6-3) |

## 7. 테스트

```bash
cd frontend && npm run check:gate-copy                       # 게이트 문구 단일 정의
cd frontend && E2E_DEMO_PASSWORD=<SEED_DEV_PASSWORD> npm run test:e2e   # 기본 대상 https://p2.sumzip.com — 시나리오 11 + 반응형 9
cd backend && npm run db:seed:dev                            # E2E 가 바꾼 체험 데이터 되돌리기
```

결과: `checklists/acceptance.md`

주의: 개발·테스트가 같은 스키마를 쓴다(research R3). DB 테스트는 반드시 트랜잭션 헬퍼(`withRollback`)를 거쳐야 한다.
