-- =====================================================================
-- 하루한장 seed-base.sql — 운영·개발 공통 기준 데이터 (RBAC)
-- 전제: 0001_sd03_baseline.sql, 0002_plan_deltas.sql 적용 후 실행
-- 멱등: INSERT ... SELECT ... WHERE NOT EXISTS
-- 근거: data-model.md §7 (역할 6 · 권한 17 · 매트릭스)
-- 특별한 일·동의 항목·기준값 키는 0001(설계 DDL)이 이미 넣으므로 여기서 다루지 않는다
-- =====================================================================

INSERT INTO rbac_role (role_code, role_label, principal_kind)
SELECT v.c, v.l, v.k FROM (
            SELECT 'owner' AS c, '사장님' AS l, 'owner' AS k
  UNION ALL SELECT 'org_viewer',   '기관 조회 담당자', 'org'
  UNION ALL SELECT 'data_manager', '데이터 담당자',    'staff'
  UNION ALL SELECT 'operator',     '현장 운영자',      'staff'
  UNION ALL SELECT 'auditor',      '감사 담당자',      'staff'
  UNION ALL SELECT 'admin',        '시스템 관리자',    'staff') v
WHERE NOT EXISTS (SELECT 1 FROM rbac_role r WHERE r.role_code = v.c);

INSERT INTO rbac_permission (permission_code, permission_label)
SELECT v.c, v.l FROM (
            SELECT 'store.own.read' AS c,  '내 가게 정보 조회' AS l
  UNION ALL SELECT 'store.own.write',      '내 가게 설정·동의 변경'
  UNION ALL SELECT 'record.own.read',      '내 기록 조회'
  UNION ALL SELECT 'record.own.write',     '내 기록 저장'
  UNION ALL SELECT 'alert.own.write',      '내 경보 생성·확인'
  UNION ALL SELECT 'compare.own.read',     '내 지역·업종 익명 비교'
  UNION ALL SELECT 'paid.own.use',         '유료 기능 이용'
  UNION ALL SELECT 'account.own.delete',   '탈퇴'
  UNION ALL SELECT 'org.trends.read',      '관할 익명 경향 조회'
  UNION ALL SELECT 'org.problems.read',    '관할 반복 문제 조회'
  UNION ALL SELECT 'threshold.manage',     '기준값 설정'
  UNION ALL SELECT 'code.read',            '코드 목록 조회'
  UNION ALL SELECT 'code.manage',          '지역·업종·매출 구간 코드 관리'
  UNION ALL SELECT 'org.manage',           '기관·관할·기관 계정 관리'
  UNION ALL SELECT 'contract.manage',      '기관 계약 상태 관리'
  UNION ALL SELECT 'audit.read',           '감사 이력 조회'
  UNION ALL SELECT 'role.manage',          '운영 인력 계정·역할 관리') v
WHERE NOT EXISTS (SELECT 1 FROM rbac_permission p WHERE p.permission_code = v.c);

INSERT INTO rbac_role_permission (role_code, permission_code)
SELECT v.r, v.p FROM (
            SELECT 'owner' AS r, 'store.own.read' AS p
  UNION ALL SELECT 'owner', 'store.own.write'
  UNION ALL SELECT 'owner', 'record.own.read'
  UNION ALL SELECT 'owner', 'record.own.write'
  UNION ALL SELECT 'owner', 'alert.own.write'
  UNION ALL SELECT 'owner', 'compare.own.read'
  UNION ALL SELECT 'owner', 'paid.own.use'
  UNION ALL SELECT 'owner', 'account.own.delete'
  UNION ALL SELECT 'org_viewer', 'org.trends.read'
  UNION ALL SELECT 'org_viewer', 'org.problems.read'
  UNION ALL SELECT 'data_manager', 'threshold.manage'
  UNION ALL SELECT 'data_manager', 'code.read'
  UNION ALL SELECT 'operator', 'code.read'
  UNION ALL SELECT 'operator', 'code.manage'
  UNION ALL SELECT 'operator', 'org.manage'
  UNION ALL SELECT 'operator', 'contract.manage'
  UNION ALL SELECT 'auditor', 'code.read'
  UNION ALL SELECT 'auditor', 'audit.read'
  UNION ALL SELECT 'admin', 'threshold.manage'
  UNION ALL SELECT 'admin', 'code.read'
  UNION ALL SELECT 'admin', 'code.manage'
  UNION ALL SELECT 'admin', 'org.manage'
  UNION ALL SELECT 'admin', 'contract.manage'
  UNION ALL SELECT 'admin', 'audit.read'
  UNION ALL SELECT 'admin', 'role.manage') v
WHERE NOT EXISTS (SELECT 1 FROM rbac_role_permission x WHERE x.role_code = v.r AND x.permission_code = v.p);

-- 최초 관리자 계정은 시드로 만들지 않는다(운영 비밀번호를 파일에 두지 않기 위해).
-- 운영: `npm run admin:bootstrap -- --login <id>` 가 대화형으로 비밀번호를 받아 staff_account + admin 역할을 만든다(tasks T024).
