/**
 * 기관 데이터 접근 — 이 파일만 기관 라우터가 쓴다 (T084, research R7, BR-HRH-21)
 * 허용 대상: v_anon_cell, v_anon_problem_cell, v_gate_g8_org, organization(이름), org_jurisdiction, region, business_type
 * 쓰기: org_query_log (트리거가 G8·관할 검사)
 * 개별 기록(daily_record, v_anon_source, v_anon_cell_all, store, account)은 조회하지 않는다 — npm run org:guard 로 검증
 */
import { getPool, q, q1, exec } from '../../db/pool.js'

export const orgRepo = {
  me: (orgAccountId: number) =>
    q1<{ org_id: number; org_name: string; g8_pass: number }>(
      getPool(),
      `SELECT o.org_id, o.org_name, g.g8_pass
         FROM org_account a JOIN organization o ON o.org_id = a.org_id JOIN v_gate_g8_org g ON g.org_id = o.org_id
        WHERE a.org_account_id = ?`,
      [orgAccountId],
    ),
  /** 관할 지역과 그 하위 지역 */
  jurisdiction: (orgId: number) =>
    q<{ code: string; name: string; parentCode: string | null }>(
      getPool(),
      `SELECT r.region_code AS code, r.region_name AS name, r.parent_region_code AS parentCode
         FROM region r
        WHERE r.region_code IN (SELECT region_code FROM org_jurisdiction WHERE org_id = ?)
           OR r.parent_region_code IN (SELECT region_code FROM org_jurisdiction WHERE org_id = ?)
        ORDER BY r.parent_region_code IS NOT NULL, r.region_name`,
      [orgId, orgId],
    ),
  businessTypes: () => q<{ code: string; name: string }>(getPool(), 'SELECT business_type_code AS code, business_type_name AS name FROM business_type ORDER BY business_type_name'),
  logQuery: (orgId: number, region: string, bt: string | null, from: string, to: string, perspective: string) =>
    exec(
      getPool(),
      'INSERT INTO org_query_log (org_id, region_code, business_type_code, period_start, period_end, perspective_code) VALUES (?, ?, ?, ?, ?, ?)',
      [orgId, region, bt, from, to, perspective],
    ),
  cells: (regions: string[], bts: string[], weeks: string[], dim: string) =>
    q(
      getPool(),
      `SELECT region_code AS regionCode, business_type_code AS businessTypeCode, week_start AS weekStart,
              dim_kind AS dimKind, dim_value AS dimValue, n_records AS nRecords, good_ratio AS goodRatio, few_ratio AS fewRatio
         FROM v_anon_cell
        WHERE region_code IN (?) AND business_type_code IN (?) AND week_start IN (?) AND dim_kind = ?`,
      [regions, bts, weeks, dim],
    ),
  problems: (regions: string[], bts: string[], weeks: string[]) =>
    q(
      getPool(),
      `SELECT region_code AS regionCode, business_type_code AS businessTypeCode, week_start AS weekStart,
              event_type_code AS eventTypeCode, problem_ratio AS problemRatio
         FROM v_anon_problem_cell
        WHERE region_code IN (?) AND business_type_code IN (?) AND week_start IN (?)`,
      [regions, bts, weeks],
    ),
}
