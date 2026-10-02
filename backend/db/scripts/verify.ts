/**
 * DB 위반 거부 검증 (T017) — design/hrh_ddl_verify.py 35케이스 Node 이식 + 계획 변경분 추가 케이스
 *   npm run db:verify
 * 모든 케이스는 하나의 트랜잭션 안에서 실행하고 끝에 rollback 한다(공유 스키마에 흔적 없음, research R3).
 * 시드 데이터와 겹치지 않도록 ID 800001~ 과 'TST-' 코드를 쓰고, 기준값은 트랜잭션 안에서만 바꾼다.
 */
import type { PoolConnection } from 'mysql2/promise'
import { getPool, closePool } from '../../src/db/pool.js'

type Case = { name: string; expect: 'ok' | 'err'; sql: string; needle: string }

const SETUP = `
UPDATE threshold_setting SET setting_value = NULL;
INSERT INTO region (region_code, region_name, parent_region_code) VALUES ('TST-GU1','마포구T',NULL),('TST-GU2','서대문구T',NULL);
INSERT INTO region (region_code, region_name, parent_region_code) VALUES ('TST-MW','망원동T','TST-GU1'),('TST-HJ','합정동T','TST-GU1');
INSERT INTO business_type VALUES ('TST-B1','분식T'),('TST-B2','카페T');
INSERT INTO account (account_id) VALUES (800001),(800002),(800003),(800004),(800005);
INSERT INTO consent_event (account_id,consent_item_code,is_agreed) VALUES
 (800001,'service',1),(800002,'service',1),(800003,'service',1),(800004,'service',1),
 (800001,'anon_stats',1),(800002,'anon_stats',1),(800003,'anon_stats',1),(800004,'anon_stats',0);
INSERT INTO store (store_id,account_id,business_type_code,region_code) VALUES (800001,800001,'TST-B1','TST-MW'),(800002,800002,'TST-B1','TST-MW'),(800003,800003,'TST-B1','TST-MW'),(800004,800004,'TST-B1','TST-MW');
INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800001,CURRENT_DATE,'good','few');
INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800002,CURRENT_DATE,'bad','few');
INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800003,CURRENT_DATE,'normal','usual');
INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800004,CURRENT_DATE,'good','many');
INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800001,CURRENT_DATE - INTERVAL 1 DAY,'good','usual');
INSERT INTO daily_record_event (record_id,event_type_code) SELECT record_id,'stock_out' FROM daily_record WHERE store_id IN (800001,800002) AND record_date = CURRENT_DATE;
INSERT INTO daily_record_event (record_id,event_type_code) SELECT record_id,'discount' FROM daily_record WHERE store_id = 800003 AND record_date = CURRENT_DATE;
INSERT INTO organization (org_id,org_name,contract_status) VALUES (800001,'기관A','active'),(800002,'기관B','expired');
INSERT INTO org_jurisdiction VALUES (800001,'TST-GU1'),(800002,'TST-GU1');
`
const WEEK = `CURRENT_DATE - INTERVAL WEEKDAY(CURRENT_DATE) DAY`
const R1 = `(SELECT record_id FROM daily_record WHERE store_id=800001 AND record_date=CURRENT_DATE)`
const R5 = `(SELECT record_id FROM daily_record WHERE store_id=800001 AND record_date=CURRENT_DATE - INTERVAL 1 DAY)`

const cases: Case[] = [
  { name: 'T01 G0 동의 없이 가게 생성', expect: 'err', needle: 'G0', sql: `INSERT INTO store (account_id,business_type_code,region_code) VALUES (800005,'TST-B1','TST-MW')` },
  { name: 'T02 G1 지역 NULL', expect: 'err', needle: 'null', sql: `INSERT INTO consent_event (account_id,consent_item_code,is_agreed) VALUES (800005,'service',1); INSERT INTO store (account_id,business_type_code,region_code) VALUES (800005,'TST-B1',NULL)` },
  { name: 'T03 G2 손님수 NULL', expect: 'err', needle: 'null', sql: `INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800001,CURRENT_DATE - INTERVAL 5 DAY,'good',NULL)` },
  { name: 'T04 BR-05 오늘장사 값 범위', expect: 'err', needle: 'chk_dr_mood', sql: `INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800001,CURRENT_DATE - INTERVAL 5 DAY,'great','few')` },
  { name: 'T05 UC2 A2 같은 날짜 중복', expect: 'err', needle: 'Duplicate', sql: `INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800001,CURRENT_DATE,'good','few')` },
  { name: 'T06 미래 날짜', expect: 'err', needle: '미래', sql: `INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800001,CURRENT_DATE + INTERVAL 1 DAY,'good','few')` },
  { name: 'T07 기록 시점 지역 스냅숏', expect: 'ok', needle: 'TST-MW\tTST-B1', sql: `SELECT region_code_at_record, business_type_code_at_record FROM daily_record WHERE record_id=${R1}` },
  { name: 'T08 재저장 시 판본 증가', expect: 'ok', needle: '2', sql: `UPDATE daily_record SET day_mood='normal' WHERE record_id=${R5}; SELECT revision FROM daily_record WHERE record_id=${R5}` },
  { name: 'T09 날짜 변경 금지', expect: 'err', needle: 'UC2 A2', sql: `UPDATE daily_record SET record_date=CURRENT_DATE - INTERVAL 9 DAY WHERE store_id=800001 AND record_date=CURRENT_DATE - INTERVAL 1 DAY` },
  { name: 'T10 G3 기준 미정이면 경보 거부', expect: 'err', needle: 'G3', sql: `INSERT INTO alert (store_id,window_start,window_end,trend_code,confidence_level,display_channel) VALUES (800001,CURRENT_DATE - INTERVAL 13 DAY,CURRENT_DATE,'decline','medium','push')` },
  { name: 'T11 G3 기준 2일 설정 후 경보 생성', expect: 'ok', needle: '1', sql: `UPDATE threshold_setting SET setting_value=2 WHERE setting_key='g3_min_records'; INSERT INTO alert (store_id,window_start,window_end,trend_code,confidence_level,display_channel) VALUES (800001,CURRENT_DATE - INTERVAL 13 DAY,CURRENT_DATE,'decline','medium','push'); SELECT COUNT(*) FROM alert WHERE store_id=800001` },
  { name: 'T12 G3 기록 1일 가게는 경보 거부', expect: 'err', needle: 'G3', sql: `INSERT INTO alert (store_id,window_start,window_end,trend_code,confidence_level,display_channel) VALUES (800002,CURRENT_DATE - INTERVAL 13 DAY,CURRENT_DATE,'decline','medium','push')` },
  { name: 'T13 경보 확인함인데 확인 시각 없음', expect: 'err', needle: 'chk_alert_ack', sql: `UPDATE alert SET alert_status='acknowledged' WHERE store_id=800001` },
  { name: 'T14 G6 실패한 결제로 권한 생성', expect: 'err', needle: 'G6', sql: `INSERT INTO payment_attempt (payment_attempt_id,store_id,feature_code,payment_result) VALUES (800001,800001,'report','failed'); INSERT INTO entitlement (store_id,feature_code,payment_attempt_id) VALUES (800001,'report',800001)` },
  { name: 'T15 G6 성공한 결제로 권한 생성', expect: 'ok', needle: '1', sql: `INSERT INTO payment_attempt (payment_attempt_id,store_id,feature_code,payment_result) VALUES (800002,800001,'report','success'); INSERT INTO entitlement (entitlement_id,store_id,feature_code,payment_attempt_id) VALUES (800001,800001,'report',800002); SELECT COUNT(*) FROM entitlement WHERE store_id=800001` },
  { name: 'T16 G3 기록 없는 기간 보고서', expect: 'err', needle: 'G3', sql: `INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot) VALUES (800001,800001,'report','2020-01-01','2020-03-31',0,'low')` },
  { name: 'T17 G7 확인 없이 전달', expect: 'err', needle: 'chk_rx_confirm', sql: `INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot,export_status,delivered_at) VALUES (800001,800001,'report',CURRENT_DATE - INTERVAL 30 DAY,CURRENT_DATE,2,'low','delivered',CURRENT_TIMESTAMP)` },
  { name: 'T18 G7 확인 후 전달', expect: 'ok', needle: '1', sql: `INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot,export_status,confirmed_at,delivered_at) VALUES (800001,800001,'report',CURRENT_DATE - INTERVAL 30 DAY,CURRENT_DATE,2,'low','delivered',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP); SELECT COUNT(*) FROM report_export WHERE store_id=800001` },
  { name: 'T19 G6 다른 가게 권한으로 보고서', expect: 'err', needle: 'G6', sql: `INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot) VALUES (800002,800001,'report',CURRENT_DATE - INTERVAL 30 DAY,CURRENT_DATE,1,'low')` },
  { name: 'T20 G8 계약 만료 기관 조회', expect: 'err', needle: 'G8', sql: `INSERT INTO org_query_log (org_id,region_code,period_start,period_end,perspective_code) VALUES (800002,'TST-MW',CURRENT_DATE - INTERVAL 27 DAY,CURRENT_DATE,'overall')` },
  { name: 'T21 UC8 A1 관할 밖 지역', expect: 'err', needle: '관할', sql: `INSERT INTO org_query_log (org_id,region_code,period_start,period_end,perspective_code) VALUES (800001,'TST-GU2',CURRENT_DATE - INTERVAL 27 DAY,CURRENT_DATE,'overall')` },
  { name: 'T22 관할 하위 지역 조회 기록', expect: 'ok', needle: '1', sql: `INSERT INTO org_query_log (org_id,region_code,period_start,period_end,perspective_code) VALUES (800001,'TST-MW',CURRENT_DATE - INTERVAL 27 DAY,CURRENT_DATE,'overall'); SELECT COUNT(*) FROM org_query_log WHERE org_id=800001` },
  { name: 'T23 지역행사 기간 역전', expect: 'err', needle: 'chk_re_period', sql: `INSERT INTO region_event (region_code,event_name,start_date,end_date) VALUES ('TST-MW','축제',CURRENT_DATE,CURRENT_DATE - INTERVAL 1 DAY)` },
  { name: 'T24 G5 기준 미정이면 익명 집계 비공개', expect: 'ok', needle: '0', sql: `SELECT COUNT(*) FROM v_anon_cell WHERE region_code LIKE 'TST-%'` },
  { name: 'T25 BR-16 미동의 가게 제외(동의 3곳만 집계)', expect: 'ok', needle: '3', sql: `SELECT n_stores FROM v_anon_cell_all WHERE region_code='TST-MW' AND business_type_code='TST-B1' AND dim_kind='overall' AND week_start=${WEEK}` },
  { name: 'T26 G5 기준 3곳이면 공개(동×분식, 동×전체, 구×분식, 구×전체)', expect: 'ok', needle: '4', sql: `UPDATE threshold_setting SET setting_value=3 WHERE setting_key='g5_min_stores'; SELECT COUNT(*) FROM v_anon_cell WHERE region_code LIKE 'TST-%' AND dim_kind='overall' AND week_start=${WEEK}` },
  { name: 'T27 G5 기준 4곳이면 다시 비공개', expect: 'ok', needle: '0', sql: `UPDATE threshold_setting SET setting_value=4 WHERE setting_key='g5_min_stores'; SELECT COUNT(*) FROM v_anon_cell WHERE region_code LIKE 'TST-%'` },
  { name: 'T28 반복 문제 익명 비율(동의 가게 기록 4건 중 재료 부족 2건)', expect: 'ok', needle: '0.50', sql: `UPDATE threshold_setting SET setting_value=3 WHERE setting_key='g5_min_stores'; SELECT ROUND(problem_ratio,2) FROM v_anon_problem_cell WHERE region_code='TST-MW' AND business_type_code='TST-B1' AND event_type_code='stock_out' AND week_start=${WEEK}` },
  { name: 'T29 동의 철회 시 G4 즉시 반영', expect: 'ok', needle: '0', sql: `INSERT INTO consent_event (account_id,consent_item_code,is_agreed,occurred_at) VALUES (800003,'anon_stats',0,CURRENT_TIMESTAMP + INTERVAL 1 SECOND); SELECT g4_pass FROM v_gate_g4_store WHERE store_id=800003` },
  { name: 'T30 BR-13 외부 조회 없음 → 확인 필요', expect: 'ok', needle: 'needs_check\tNULL', sql: `SELECT weather_status, COALESCE(weather_code,'NULL') FROM v_record_env WHERE record_id=${R1}` },
  { name: 'T31 P0 재조회 성공 → 값 결합', expect: 'ok', needle: 'ok\train', sql: `INSERT INTO env_fetch_job (region_code,target_date,data_kind,fetch_status) VALUES ('TST-MW',CURRENT_DATE,'weather','ok'); INSERT INTO weather_observation (region_code,obs_date,weather_code) VALUES ('TST-MW',CURRENT_DATE,'rain'); SELECT weather_status, weather_code FROM v_record_env WHERE record_id=${R1}` },
  { name: 'T32 게이트 이벤트 G7 대상 종류 불일치', expect: 'err', needle: 'chk_ge_pair', sql: `INSERT INTO gate_event (gate_code,subject_kind,subject_id,screen_code) VALUES ('G7','store',800001,'S6')` },
  { name: 'T33 게이트 해제 행동 없이 해제 시각', expect: 'err', needle: 'chk_ge_release', sql: `INSERT INTO gate_event (gate_code,subject_kind,subject_id,screen_code,released_at) VALUES ('G3','store',800001,'S3',CURRENT_TIMESTAMP)` },
  { name: 'T34 진행 레일 뷰', expect: 'ok', needle: '1\t2\t1\t1', sql: `SELECT today_recorded, record_count, g3_pass, g4_pass FROM v_store_rail WHERE store_id=800001` },
  // T35 원래는 DB 역할 권한 검사 — 팀 DB 에서는 역할을 만들 수 없어(research R1) RBAC 권한 해석 뷰 검사로 대체
  { name: 'T35 기관 역할 권한은 익명 조회 2개뿐(v_principal_permission)', expect: 'ok', needle: 'org.problems.read,org.trends.read', sql: `SELECT GROUP_CONCAT(permission_code ORDER BY permission_code) FROM rbac_role_permission WHERE role_code='org_viewer'` },
  // 계획 변경분 (0002)
  { name: 'T36 RBAC 역할-주체 종류 불일치 거부', expect: 'err', needle: 'RBAC', sql: `INSERT INTO principal_role (principal_kind,principal_id,role_code) VALUES ('owner',800001,'admin')` },
  { name: 'T37 RBAC 없는 주체 역할 부여 거부', expect: 'err', needle: 'RBAC', sql: `INSERT INTO principal_role (principal_kind,principal_id,role_code) VALUES ('staff',899999,'admin')` },
  { name: 'T38 롤업 억제: 합정 카페 2곳 미달 → 구×전체 비공개, 구×분식 공개(T29 철회 가게 재동의 후)', expect: 'ok', needle: '0\t1', sql: `UPDATE threshold_setting SET setting_value=3 WHERE setting_key='g5_min_stores'; INSERT INTO consent_event (account_id,consent_item_code,is_agreed,occurred_at) VALUES (800003,'anon_stats',1,CURRENT_TIMESTAMP + INTERVAL 2 SECOND); INSERT INTO account (account_id) VALUES (800011),(800012); INSERT INTO consent_event (account_id,consent_item_code,is_agreed) VALUES (800011,'service',1),(800012,'service',1),(800011,'anon_stats',1),(800012,'anon_stats',1); INSERT INTO store (store_id,account_id,business_type_code,region_code) VALUES (800011,800011,'TST-B2','TST-HJ'),(800012,800012,'TST-B2','TST-HJ'); INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800011,CURRENT_DATE,'good','many'); INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (800012,CURRENT_DATE,'good','many'); SELECT (SELECT COUNT(*) FROM v_anon_cell WHERE region_code='TST-GU1' AND business_type_code='*' AND dim_kind='overall' AND week_start=${WEEK}), (SELECT COUNT(*) FROM v_anon_cell WHERE region_code='TST-GU1' AND business_type_code='TST-B1' AND dim_kind='overall' AND week_start=${WEEK})` },
  { name: 'T39 계정 삭제 → 가게·기록·경보·역할 연쇄 삭제', expect: 'ok', needle: '0\t0\t0\t0', sql: `INSERT INTO principal_role (principal_kind,principal_id,role_code) VALUES ('owner',800001,'owner'); DELETE FROM gate_event WHERE subject_kind='store' AND subject_id=800001; DELETE FROM account WHERE account_id=800001; SELECT (SELECT COUNT(*) FROM store WHERE store_id=800001),(SELECT COUNT(*) FROM daily_record WHERE store_id=800001),(SELECT COUNT(*) FROM alert WHERE store_id=800001),(SELECT COUNT(*) FROM principal_role WHERE principal_kind='owner' AND principal_id=800001)` },
]

async function runMulti(conn: PoolConnection, sql: string): Promise<string> {
  let last: any = null
  for (const st of sql.split(/;\s*/).filter((s) => s.trim())) {
    const [rows] = await conn.query(st)
    last = rows
  }
  if (Array.isArray(last) && last.length) {
    return Object.values(last[0] as object)
      .map((v) => (v === null ? 'NULL' : String(v)))
      .join('\t')
  }
  return ''
}

async function main() {
  const conn = await getPool().getConnection()
  let fail = 0
  try {
    await conn.beginTransaction()
    for (const st of SETUP.split(/;\s*\n/).filter((s) => s.trim())) await conn.query(st)
    for (const c of cases) {
      let ok = false
      let detail = ''
      try {
        const out = await runMulti(conn, c.sql)
        detail = out
        ok = c.expect === 'ok' && (out === c.needle || Number(out) === Number(c.needle))
      } catch (e: any) {
        detail = `${e.code ?? ''} ${e.message}`
        ok = c.expect === 'err' && detail.toLowerCase().includes(c.needle.toLowerCase())
      }
      if (!ok) fail++
      console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name} | ${detail.replace(/\s+/g, ' ').slice(0, 110)}`)
    }
  } finally {
    await conn.rollback()
    // 잔존 확인
    const [rows]: any = await conn.query(
      "SELECT (SELECT COUNT(*) FROM account WHERE account_id BETWEEN 800000 AND 800999) + (SELECT COUNT(*) FROM region WHERE region_code LIKE 'TST-%') AS leftover",
    )
    console.log(`잔존 테스트 행: ${rows[0].leftover}`)
    conn.release()
    await closePool()
  }
  console.log(`FAILED ${fail} of ${cases.length}`)
  if (fail) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
