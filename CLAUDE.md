# 하루한장 (project261002)

소상공인 일일 장사 기록·분석 서비스. 설계는 `design/`, 명세·계획은 `specs/001-haruhanjang-service/`.

## Active Technologies
- Frontend: Vue 3.4+ (Composition API) + TypeScript 5 + Vite 5 + Pinia 2 + Vue Router 4, PWA(vite-plugin-pwa, IndexedDB via idb)
- Backend: Node.js 20 LTS + Express 4 + TypeScript 5, mysql2 3 (promise pool), zod, web-push, node-cron
- DB: 팀 MariaDB 12.1.2 `ABC11pioneer2` (mis.iptime.org:13306, KST, utf8mb4, 대소문자 구분)
- Test: Vitest, Supertest, Playwright

## Constraints
- Docker 컨테이너를 쓰지 않는다. Homebrew mysql 바이너리·로컬 DB·다른 DB를 쓰지 않는다. DB 작업은 Node(mysql2) 스크립트로만.
- DB 계정은 스키마 권한만 있다: CREATE ROLE / CREATE DATABASE 불가. 테스트는 트랜잭션 롤백(`withRollback`).
- 게이트(G0~G8) 판정은 DB 함수·뷰(`fn_gate_g3`, `fn_gate_g5`, `v_gate_*`)에서만. API는 결과를 읽고 409 GateBlocked로 변환.
- 신뢰도·경향 문장·패턴·하락 판정은 `frontend/src/analysis/` 한 곳에서만 계산(기기 내 분석, BR-HRH-10).
- 기준값(threshold_setting)은 운영에서 NULL — NULL이면 해당 게이트는 막힌다. 수치를 지어내지 않는다.
- 기관 API(`/api/org/*`)는 `v_anon_cell`, `v_anon_problem_cell` 만 조회한다.
- RBAC: 주체 owner/org/staff, 권한 해석은 `v_principal_permission` 한 곳. 권한 없음 403, 게이트 차단 409. 어떤 staff 역할도 개별 사장님 기록을 조회하지 않는다(data-model §7).
- 화면 문구: 원인 단정 금지("~하는 경향이 있어요"), 게이트 문구는 `frontend/src/gates/copy.ts` 단일 정의.

## Commands
- `cd backend && npm run db:migrate` / `npm run db:seed:base` / `npm run db:seed:dev` / `npm run db:verify`
- `cd backend && npm run rbac:check` / `npm run org:guard`
- `cd backend && npm run dev` (127.0.0.1:9522), `cd frontend && npm run dev` (0.0.0.0:9502)
- 배포: 각 패키지 `npm run build` 후 `pm2 start deploy/ecosystem.config.cjs` — https://p2.sumzip.com → 192.168.0.19:9502
- `cd frontend && npm run check:gate-copy`, `E2E_DEMO_PASSWORD=… npm run test:e2e` (후 `db:seed:dev` 로 체험 데이터 복원)
- 공유 머신: 프로세스 정지는 `pm2 stop hrh-backend|hrh-frontend` 로만(넓은 pkill 금지 — 다른 사용자 프로세스)

## Key Docs
- 명세: `specs/001-haruhanjang-service/spec.md`
- 계획: `specs/001-haruhanjang-service/plan.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`
- 설계: `design/UC_*.md`, `design/SD_01~03_*.md`, `design/hrh_ddl.sql`, `design/스타일가이드-1.html`(현행 · 밝은 화면 변형/노랑, 토큰 `frontend/src/styles/tokens.css`), 이전 `design/스타일가이드_하루한장.html`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
