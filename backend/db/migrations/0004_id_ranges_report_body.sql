-- =====================================================================
-- 0004_id_ranges_report_body.sql
-- 1) 자동 증가 시작값을 시드 ID 대역(900001~939999) 위로 올린다.
--    시드가 명시 ID를 넣으면 다음 자동 값이 시드 대역 안에 들어가고, 시드 재실행(대역 삭제)이
--    실제 가입자를 지우게 된다. (MariaDB 전용: ALTER TABLE … AUTO_INCREMENT)
-- 2) report_export.report_body: 보고서 내용은 기기 내 분석 모듈이 만든다(research R5).
--    G7 확인 후 서버가 전달하려면 생성 시점 내용을 고정 저장해야 한다 — "유도인데 저장"(SD_03 §2-3 형식):
--    고정 근거 = 사장님이 확인한 내용과 전달 파일이 같아야 함(BR-HRH-20). 재계산 금지.
-- =====================================================================
ALTER TABLE account         AUTO_INCREMENT = 1000001;
ALTER TABLE organization    AUTO_INCREMENT = 1000001;
ALTER TABLE org_account     AUTO_INCREMENT = 1000001;
ALTER TABLE staff_account   AUTO_INCREMENT = 1000001;
ALTER TABLE payment_attempt AUTO_INCREMENT = 1000001;
ALTER TABLE entitlement     AUTO_INCREMENT = 1000001;
ALTER TABLE report_export   AUTO_INCREMENT = 1000001;
ALTER TABLE report_export ADD COLUMN IF NOT EXISTS report_body LONGTEXT NULL;
