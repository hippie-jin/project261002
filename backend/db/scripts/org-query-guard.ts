/**
 * 기관 쿼리 제한 검증 (T086, research R7) — DB 역할을 쓸 수 없어 API 계층에서 강제한 것을 확인한다.
 *   npm run org:guard
 * 기관 세션으로 /api/org/* 를 호출하는 동안 실행된 SQL 을 모두 모아, 개별 기록에 닿는 객체 이름이 없는지 본다.
 */
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { getPool, closePool } from '../../src/db/pool.js'
import { todayKst, addDays } from '../../src/lib/dates.js'

// 단어 경계로 찾는다(org_account 는 account 가 아님)
const FORBIDDEN = /\b(daily_record|daily_record_event|v_anon_source|v_anon_cell_all|v_record_env|store|account|consent_event|auth_identity)\b/i

async function main() {
  const { app } = createApp()
  const pool: any = getPool()
  const seen: string[] = []
  let capture = false
  const orig = pool.query.bind(pool)
  pool.query = (sql: any, ...rest: any[]) => {
    if (capture) seen.push(typeof sql === 'string' ? sql : sql.sql)
    return orig(sql, ...rest)
  }
  const login = await request(app).post('/api/org/auth/login').set('X-Requested-With', 'hrh').send({ loginId: 'mapo-econ', password: env.SEED_DEV_PASSWORD })
  const cookie = login.headers['set-cookie'] as unknown as string[]
  const to = todayKst()
  const from = addDays(to, -27)
  capture = true
  const paths = [
    '/api/org/me',
    `/api/org/trends?region=DEV-MAPO&from=${from}&to=${to}&dim=overall`,
    `/api/org/trends?region=DEV-MAPO&businessType=DEV-SNACK&from=${from}&to=${to}&dim=dow`,
    `/api/org/trends?region=DEV-MANGWON&from=${from}&to=${to}&dim=local_event`,
    `/api/org/problems?region=DEV-MAPO&from=${from}&to=${to}`,
  ]
  for (const p of paths) {
    const r = await request(app).get(p).set('Cookie', cookie)
    console.log(`${r.status} GET ${p}`)
  }
  capture = false
  // 인증·권한 미들웨어의 공통 쿼리(principal_role, v_principal_permission)는 기관 데이터가 아니므로 제외
  const dataSql = seen.filter((s) => !/principal_role|v_principal_permission|gate_event/.test(s))
  const bad = dataSql.filter((s) => FORBIDDEN.test(s))
  console.log(`기관 요청 중 실행된 데이터 쿼리 ${dataSql.length}건, 금지 객체 참조 ${bad.length}건`)
  for (const b of bad) console.log('  FAIL', b.replace(/\s+/g, ' ').slice(0, 160))
  await closePool()
  if (bad.length) process.exit(1)
  console.log('PASS 기관 라우터는 익명 집계 뷰만 조회한다')
}

main().catch(async (e) => {
  console.error(e)
  await closePool()
  process.exit(1)
})
