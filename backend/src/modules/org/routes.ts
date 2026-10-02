/**
 * US8 기관 상권 대시보드 (T085)
 * - G8(계약 유효) 미통과 → 409 G8 (releasedBy others)
 * - 기대 칸(관할 지역 × 업종) 중 공개되지 않은 칸은 suppressed 로 이름만 돌려준다(수치·존재 여부 노출 없음)
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { gateBlocked, HttpError } from '../../http/errors.js'
import { trackGate } from '../../gates/gateEvents.js'
import { YMD, weekStartsBetween } from '../../lib/dates.js'
import { orgRepo } from './repository.js'

async function context(req: any) {
  const me = await orgRepo.me(req.principal.id)
  if (!me) throw new HttpError(403, { error: 'forbidden', permission: 'org' })
  await trackGate('G8', 'org', me.org_id, 'S7', Boolean(me.g8_pass))
  return me
}

const query = z.object({
  region: z.string().min(1).max(20),
  businessType: z.string().max(20).optional(),
  from: z.string().regex(YMD),
  to: z.string().regex(YMD),
  dim: z.enum(['overall', 'dow', 'weather', 'local_event']).default('overall'),
})

/** 선택 지역이 상위면 [상위 + 하위들], 하위면 [그 지역] */
async function scope(orgId: number, region: string) {
  const regions = await orgRepo.jurisdiction(orgId)
  const target = regions.find((r) => r.code === region)
  if (!target) throw new HttpError(403, { error: 'forbidden', permission: 'jurisdiction' })
  const children = regions.filter((r) => r.parentCode === region)
  return { target, rows: [target, ...children] }
}

export const orgRouter = defineRoutes('/org', [
  [
    'get',
    '/me',
    { perm: 'org.trends.read' },
    async (req, res) => {
      const me = await context(req)
      res.json({
        orgName: me.org_name,
        contractValid: Boolean(me.g8_pass),
        jurisdiction: me.g8_pass ? await orgRepo.jurisdiction(me.org_id) : [],
        businessTypes: me.g8_pass ? await orgRepo.businessTypes() : [],
      })
    },
  ],
  [
    'get',
    '/trends',
    { perm: 'org.trends.read' },
    async (req, res) => {
      const me = await context(req)
      if (!me.g8_pass) throw gateBlocked('G8')
      const qy = query.parse(req.query)
      const { rows } = await scope(me.org_id, qy.region)
      const bts = qy.businessType ? [qy.businessType] : ['*', ...(await orgRepo.businessTypes()).map((b) => b.code)]
      await orgRepo.logQuery(me.org_id, qy.region, qy.businessType ?? null, qy.from, qy.to, qy.dim)
      const weeks = weekStartsBetween(qy.from, qy.to)
      const cells = await orgRepo.cells(rows.map((r) => r.code), bts, weeks, qy.dim)
      const shown = new Set(cells.map((c: any) => `${c.regionCode}|${c.businessTypeCode}`))
      const suppressed: Array<{ regionCode: string; businessTypeCode: string }> = []
      for (const r of rows) for (const b of bts) if (!shown.has(`${r.code}|${b}`)) suppressed.push({ regionCode: r.code, businessTypeCode: b })
      res.json({
        regions: rows,
        weeks,
        cells: cells.map((c: any) => ({ ...c, nRecords: Number(c.nRecords), goodRatio: Number(c.goodRatio), fewRatio: Number(c.fewRatio) })),
        suppressed,
      })
    },
  ],
  [
    'get',
    '/problems',
    { perm: 'org.problems.read' },
    async (req, res) => {
      const me = await context(req)
      if (!me.g8_pass) throw gateBlocked('G8')
      const qy = query.parse(req.query)
      const { rows } = await scope(me.org_id, qy.region)
      const bts = qy.businessType ? [qy.businessType] : ['*']
      await orgRepo.logQuery(me.org_id, qy.region, qy.businessType ?? null, qy.from, qy.to, 'problem')
      const out = await orgRepo.problems(rows.map((r) => r.code), bts, weekStartsBetween(qy.from, qy.to))
      res.json(out.map((p: any) => ({ ...p, problemRatio: Number(p.problemRatio) })))
    },
  ],
])
