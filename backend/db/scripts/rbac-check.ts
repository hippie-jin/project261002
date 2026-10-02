/**
 * RBAC 권한표 전수 확인 (T028, data-model §7-2)
 *   npm run rbac:check
 * 앱을 프로세스 안에서 띄워(supertest) dev 시드 주체로 로그인한 뒤, 역할별 허용·금지 경로를 확인한다.
 * 상태를 바꾸는 요청은 보내지 않는다(조회·권한 판정만).
 */
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { closePool } from '../../src/db/pool.js'

const { app } = createApp()
type Who = { label: string; login: () => Promise<string[]> }

async function cookieFrom(res: request.Response) {
  const c = res.headers['set-cookie'] as unknown as string[] | undefined
  if (!c) throw new Error(`로그인 실패 ${res.status} ${JSON.stringify(res.body)}`)
  return c
}
const owner = (subject: string): Who => ({
  label: `owner:${subject}`,
  login: async () => cookieFrom(await request(app).post('/api/auth/dev-login').set('X-Requested-With', 'hrh').send({ devSubject: subject })),
})
const pw = (kind: 'org' | 'staff', loginId: string): Who => ({
  label: `${kind}:${loginId}`,
  login: async () =>
    cookieFrom(await request(app).post(`/api/${kind}/auth/login`).set('X-Requested-With', 'hrh').send({ loginId, password: env.SEED_DEV_PASSWORD })),
})

// [주체, 경로, 기대 상태들]
const matrix: Array<[Who, string, number[]]> = [
  [owner('owner-steady'), '/api/rail', [200]],
  [owner('owner-steady'), '/api/records/months/2026-09/summary', [200]],
  [owner('owner-steady'), '/api/compare?period=this_week&dim=overall', [200]],
  [owner('owner-steady'), '/api/admin/thresholds', [403]],
  [owner('owner-steady'), '/api/admin/staff', [403]],
  [owner('owner-steady'), '/api/org/me', [403]],
  [owner('owner-starter'), '/api/compare?period=this_week&dim=overall', [409]],
  [pw('org', 'mapo-econ'), '/api/org/me', [200]],
  [pw('org', 'mapo-econ'), '/api/rail', [403]],
  [pw('org', 'mapo-econ'), '/api/admin/audit/gate-events', [403]],
  [pw('org', 'expired-merchant'), '/api/org/trends?region=DEV-MAPO&from=2026-09-01&to=2026-09-30', [409]],
  [pw('staff', 'data-manager'), '/api/admin/thresholds', [200]],
  [pw('staff', 'data-manager'), '/api/admin/staff', [403]],
  [pw('staff', 'data-manager'), '/api/admin/orgs', [403]],
  [pw('staff', 'operator'), '/api/admin/orgs', [200]],
  [pw('staff', 'operator'), '/api/admin/codes/regions', [200]],
  [pw('staff', 'operator'), '/api/admin/thresholds', [403]],
  [pw('staff', 'auditor'), '/api/admin/audit/gate-events', [200]],
  [pw('staff', 'auditor'), '/api/admin/audit/anon-cells', [200]],
  [pw('staff', 'auditor'), '/api/admin/thresholds', [403]],
  [pw('staff', 'auditor'), '/api/rail', [403]],
  [pw('staff', 'admin'), '/api/admin/staff', [200]],
  [pw('staff', 'admin'), '/api/admin/thresholds', [200]],
  [pw('staff', 'admin'), '/api/records?from=2026-09-01&to=2026-09-30', [403]],
  [pw('staff', 'admin'), '/api/org/trends?region=DEV-MAPO&from=2026-09-01&to=2026-09-30', [403]],
]

async function main() {
  const jar = new Map<string, string[]>()
  let fail = 0
  for (const [who, path, expect] of matrix) {
    if (!jar.has(who.label)) jar.set(who.label, await who.login())
    const res = await request(app).get(path).set('Cookie', jar.get(who.label)!)
    const ok = expect.includes(res.status)
    if (!ok) fail++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${who.label.padEnd(26)} GET ${path.padEnd(70)} → ${res.status}${ok ? '' : ` (기대 ${expect})`}`)
  }
  // 쓰기 요청 권한(상태 변경 없이 403 만 확인)
  const auditor = jar.get('staff:auditor')!
  const w = await request(app).put('/api/admin/thresholds/g3_min_records').set('Cookie', auditor).set('X-Requested-With', 'hrh').send({ value: 1 })
  const wOk = w.status === 403
  if (!wOk) fail++
  console.log(`${wOk ? 'PASS' : 'FAIL'} staff:auditor              PUT /api/admin/thresholds/g3_min_records → ${w.status}`)
  console.log(`FAILED ${fail} of ${matrix.length + 1}`)
  await closePool()
  if (fail) process.exit(1)
}

main().catch(async (e) => {
  console.error(e)
  await closePool()
  process.exit(1)
})
