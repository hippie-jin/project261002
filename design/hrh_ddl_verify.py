#!/usr/bin/env python3
"""hrh_ddl.sql 위반 거부 검증 (SD_03 §15-2)

빈 데이터베이스에 hrh_ddl.sql 을 두 번 실행(멱등 확인)한 뒤 이 스크립트를 실행한다.
  HRH_MARIADB="mariadb -uroot --default-character-set=utf8mb4" python3 hrh_ddl_verify.py
환경변수 HRH_MARIADB 는 데이터베이스 이름을 뺀 mariadb CLI 명령이다(대상 DB 이름은 hrh).
검증 시 테스트 행을 넣으므로 운영 DB 에서 실행하지 않는다.
"""
import os, shlex
import subprocess, sys
M=shlex.split(os.environ.get('HRH_MARIADB','mariadb -uroot --default-character-set=utf8mb4'))
def run(sql):
    r=subprocess.run(M+['hrh','-N','-B','-e',sql],capture_output=True,text=True)
    return r.returncode, (r.stdout+r.stderr).strip()
setup="""
INSERT INTO region VALUES ('GU1','마포구',NULL),('MW','망원동','GU1'),('HJ','합정동','GU1'),('GU2','서대문구',NULL);
INSERT INTO business_type VALUES ('B1','분식'),('B2','카페');
INSERT INTO account (account_id) VALUES (1),(2),(3),(4),(5);
INSERT INTO consent_event (account_id,consent_item_code,is_agreed) VALUES
 (1,'service',1),(2,'service',1),(3,'service',1),(4,'service',1),
 (1,'anon_stats',1),(2,'anon_stats',1),(3,'anon_stats',1),(4,'anon_stats',0);
INSERT INTO store (store_id,account_id,business_type_code,region_code) VALUES (1,1,'B1','MW'),(2,2,'B1','MW'),(3,3,'B1','MW'),(4,4,'B1','MW');
INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES
 (1,CURRENT_DATE,'good','few'),(2,CURRENT_DATE,'bad','few'),(3,CURRENT_DATE,'normal','usual'),(4,CURRENT_DATE,'good','many'),
 (1,CURRENT_DATE - INTERVAL 1 DAY,'good','usual');
INSERT INTO daily_record_event VALUES (1,'stock_out'),(2,'stock_out'),(3,'discount');
INSERT INTO organization (org_id,org_name,contract_status) VALUES (1,'기관A','active'),(2,'기관B','expired');
INSERT INTO org_jurisdiction VALUES (1,'GU1'),(2,'GU1');
"""
rc,out=run(setup); print('SETUP', rc, out[:300])
cases=[
 ('T01 G0 동의 없이 가게 생성','err','INSERT INTO store (account_id,business_type_code,region_code) VALUES (5,"B1","MW")','G0'),
 ('T02 G1 지역 NULL','err','INSERT INTO consent_event (account_id,consent_item_code,is_agreed) VALUES (5,"service",1); INSERT INTO store (account_id,business_type_code,region_code) VALUES (5,"B1",NULL)','null'),
 ('T03 G2 손님수 NULL','err','INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (1,CURRENT_DATE - INTERVAL 5 DAY,"good",NULL)','null'),
 ('T04 BR-05 오늘장사 값 범위','err','INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (1,CURRENT_DATE - INTERVAL 5 DAY,"great","few")','chk_dr_mood'),
 ('T05 UC2 A2 같은 날짜 중복','err','INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (1,CURRENT_DATE,"good","few")','Duplicate'),
 ('T06 미래 날짜','err','INSERT INTO daily_record (store_id,record_date,day_mood,customer_level) VALUES (1,CURRENT_DATE + INTERVAL 1 DAY,"good","few")','미래'),
 ('T07 기록 시점 지역 스냅숏','ok','SELECT region_code_at_record, business_type_code_at_record FROM daily_record WHERE record_id=1','MW\tB1'),
 ('T08 재저장 시 판본 증가','ok','UPDATE daily_record SET day_mood="normal" WHERE record_id=5; SELECT revision FROM daily_record WHERE record_id=5','2'),
 ('T09 날짜 변경 금지','err','UPDATE daily_record SET record_date=CURRENT_DATE - INTERVAL 9 DAY WHERE record_id=5','UC2 A2'),
 ('T10 G3 기준 미정이면 경보 거부','err','INSERT INTO alert (store_id,window_start,window_end,trend_code,confidence_level,display_channel) VALUES (1,CURRENT_DATE - INTERVAL 13 DAY,CURRENT_DATE,"decline","medium","push")','G3'),
 ('T11 G3 기준 2일 설정 후 경보 생성','ok','UPDATE threshold_setting SET setting_value=2 WHERE setting_key="g3_min_records"; INSERT INTO alert (store_id,window_start,window_end,trend_code,confidence_level,display_channel) VALUES (1,CURRENT_DATE - INTERVAL 13 DAY,CURRENT_DATE,"decline","medium","push"); SELECT COUNT(*) FROM alert','1'),
 ('T12 G3 기록 1일 가게는 경보 거부','err','INSERT INTO alert (store_id,window_start,window_end,trend_code,confidence_level,display_channel) VALUES (2,CURRENT_DATE - INTERVAL 13 DAY,CURRENT_DATE,"decline","medium","push")','G3'),
 ('T13 경보 확인함인데 확인 시각 없음','err','UPDATE alert SET alert_status="acknowledged" WHERE alert_id=1','chk_alert_ack'),
 ('T14 G6 실패한 결제로 권한 생성','err','INSERT INTO payment_attempt (payment_attempt_id,store_id,feature_code,payment_result) VALUES (1,1,"report","failed"); INSERT INTO entitlement (store_id,feature_code,payment_attempt_id) VALUES (1,"report",1)','G6'),
 ('T15 G6 성공한 결제로 권한 생성','ok','INSERT INTO payment_attempt (payment_attempt_id,store_id,feature_code,payment_result) VALUES (2,1,"report","success"); INSERT INTO entitlement (entitlement_id,store_id,feature_code,payment_attempt_id) VALUES (1,1,"report",2); SELECT COUNT(*) FROM entitlement','1'),
 ('T16 G3 기록 없는 기간 보고서','err','INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot) VALUES (1,1,"report","2020-01-01","2020-03-31",0,"low")','G3'),
 ('T17 G7 확인 없이 전달','err','INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot,export_status,delivered_at) VALUES (1,1,"report",CURRENT_DATE - INTERVAL 30 DAY,CURRENT_DATE,2,"low","delivered",CURRENT_TIMESTAMP)','chk_rx_confirm'),
 ('T18 G7 확인 후 전달','ok','INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot,export_status,confirmed_at,delivered_at) VALUES (1,1,"report",CURRENT_DATE - INTERVAL 30 DAY,CURRENT_DATE,2,"low","delivered",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP); SELECT COUNT(*) FROM report_export','1'),
 ('T19 G6 다른 가게 권한으로 보고서','err','INSERT INTO report_export (store_id,entitlement_id,export_kind,period_start,period_end,record_count_snapshot,confidence_snapshot) VALUES (2,1,"report",CURRENT_DATE - INTERVAL 30 DAY,CURRENT_DATE,1,"low")','G6'),
 ('T20 G8 계약 만료 기관 조회','err','INSERT INTO org_query_log (org_id,region_code,period_start,period_end,perspective_code) VALUES (2,"MW",CURRENT_DATE - INTERVAL 27 DAY,CURRENT_DATE,"overall")','G8'),
 ('T21 UC8 A1 관할 밖 지역','err','INSERT INTO org_query_log (org_id,region_code,period_start,period_end,perspective_code) VALUES (1,"GU2",CURRENT_DATE - INTERVAL 27 DAY,CURRENT_DATE,"overall")','관할'),
 ('T22 관할 하위 지역 조회 기록','ok','INSERT INTO org_query_log (org_id,region_code,period_start,period_end,perspective_code) VALUES (1,"MW",CURRENT_DATE - INTERVAL 27 DAY,CURRENT_DATE,"overall"); SELECT COUNT(*) FROM org_query_log','1'),
 ('T23 지역행사 기간 역전','err','INSERT INTO region_event (region_code,event_name,start_date,end_date) VALUES ("MW","축제",CURRENT_DATE,CURRENT_DATE - INTERVAL 1 DAY)','chk_re_period'),
 ('T24 G5 기준 미정이면 익명 집계 비공개','ok','SELECT COUNT(*) FROM v_anon_cell','0'),
 ('T25 BR-16 미동의 가게 제외(동의 3곳만 집계)','ok','SELECT n_stores FROM v_anon_cell_all WHERE region_code="MW" AND business_type_code="B1" AND dim_kind="overall" AND week_start=CURRENT_DATE - INTERVAL WEEKDAY(CURRENT_DATE) DAY','3'),
 ('T26 G5 기준 3곳이면 공개(동 + 구 + 업종 전체 롤업)','ok','UPDATE threshold_setting SET setting_value=3 WHERE setting_key="g5_min_stores"; SELECT COUNT(*) FROM v_anon_cell WHERE dim_kind="overall" AND week_start=CURRENT_DATE - INTERVAL WEEKDAY(CURRENT_DATE) DAY','4'),
 ('T27 G5 기준 4곳이면 다시 비공개','ok','UPDATE threshold_setting SET setting_value=4 WHERE setting_key="g5_min_stores"; SELECT COUNT(*) FROM v_anon_cell','0'),
 ('T28 반복 문제 익명 집계(이번 주 동의 가게 기록 4건 중 재료 부족 2건)','ok','UPDATE threshold_setting SET setting_value=3 WHERE setting_key="g5_min_stores"; SELECT ROUND(problem_ratio,2) FROM v_anon_problem_cell WHERE region_code="MW" AND business_type_code="B1" AND event_type_code="stock_out" AND week_start=CURRENT_DATE - INTERVAL WEEKDAY(CURRENT_DATE) DAY','0.50'),
 ('T29 동의 철회 시 G4 즉시 반영','ok','INSERT INTO consent_event (account_id,consent_item_code,is_agreed,occurred_at) VALUES (3,"anon_stats",0,CURRENT_TIMESTAMP + INTERVAL 1 SECOND); SELECT g4_pass FROM v_gate_g4_store WHERE store_id=3','0'),
 ('T30 BR-13 외부 조회 없음 → 확인 필요','ok','SELECT weather_status, COALESCE(weather_code,"NULL") FROM v_record_env WHERE record_id=1','needs_check\tNULL'),
 ('T31 P0 재조회 성공 → 값 결합','ok','INSERT INTO env_fetch_job (region_code,target_date,data_kind,fetch_status) VALUES ("MW",CURRENT_DATE,"weather","ok"); INSERT INTO weather_observation (region_code,obs_date,weather_code) VALUES ("MW",CURRENT_DATE,"rain"); SELECT weather_status, weather_code FROM v_record_env WHERE record_id=1','ok\train'),
 ('T32 게이트 이벤트 G7 대상 종류 불일치','err','INSERT INTO gate_event (gate_code,subject_kind,subject_id,screen_code) VALUES ("G7","store",1,"S6")','chk_ge_pair'),
 ('T33 게이트 해제 행동 없이 해제 시각','err','INSERT INTO gate_event (gate_code,subject_kind,subject_id,screen_code,released_at) VALUES ("G3","store",1,"S3",CURRENT_TIMESTAMP)','chk_ge_release'),
 ('T34 진행 레일 뷰','ok','SELECT today_recorded, record_count, g3_pass, g4_pass FROM v_store_rail WHERE store_id=1','1\t2\t1\t1'),
 ('T35 기관 역할은 원천 기록 열람 불가(권한 목록)','ok','SELECT GROUP_CONCAT(table_name ORDER BY table_name) FROM information_schema.table_privileges WHERE grantee LIKE "%hrh_org_reader%"','v_anon_cell,v_anon_problem_cell'),
]
fail=0
for name,exp,sql,needle in cases:
    rc,out=run(sql)
    if exp=='err': good = rc!=0 and (needle.lower() in out.lower())
    else: good = rc==0 and out.splitlines()[-1].strip()==needle if out else False
    if not good: fail+=1
    print(('PASS' if good else 'FAIL'), name, '|', out.replace('\n',' / ')[:150])
print('FAILED', fail, 'of', len(cases))
