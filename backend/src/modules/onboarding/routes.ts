/**
 * US1 가게 시작하기 (T041~T043, P1)
 * 가입 완료는 한 트랜잭션: account → auth_identity → consent_event×2 → store(+쉬는 요일) → principal_role(owner)
 * 필수 동의가 false 면 409 G0 이고 아무것도 저장하지 않는다(FR-011, BR-HRH-02)
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, exec } from '../../db/pool.js'
import { withTransaction } from '../../db/tx.js'
import { gateBlocked } from '../../http/errors.js'
import { issueSession, type Principal } from '../../auth/session.js'

const body = z.object({
  consents: z.object({ service: z.boolean(), anon_stats: z.boolean() }),
  businessTypeCode: z.string().min(1).max(20),
  regionCode: z.string().min(1).max(20),
  closedDays: z.array(z.number().int().min(1).max(7)).max(7).nullable().optional(),
})

export const onboardingRouter = defineRoutes('/onboarding', [
  [
    'get',
    '/options',
    'pending',
    async (_req, res) => {
      const db = getPool()
      const [consentItems, businessTypes, regions] = await Promise.all([
        q(db, 'SELECT consent_item_code AS code, consent_item_label AS label, is_required AS required FROM consent_item ORDER BY is_required DESC'),
        q(db, 'SELECT business_type_code AS code, business_type_name AS label FROM business_type ORDER BY business_type_name'),
        q(db, 'SELECT region_code AS code, region_name AS name, parent_region_code AS parentCode FROM region ORDER BY region_name'),
      ])
      res.json({
        consentItems: consentItems.map((c: any) => ({ ...c, required: Boolean(c.required) })),
        businessTypes,
        regions,
      })
    },
  ],
  [
    'post',
    '',
    'pending',
    async (req, res) => {
      const input = body.parse(req.body)
      if (!input.consents.service) throw gateBlocked('G0')
      const p = req.principal as Extract<Principal, { k: 'pending' }>
      const accountId = await withTransaction(async (conn) => {
        const acc = await exec(conn, 'INSERT INTO account () VALUES ()')
        const id = acc.insertId
        await exec(conn, 'INSERT INTO auth_identity (account_id, provider, subject_hash) VALUES (?, ?, ?)', [id, p.p, p.h])
        await exec(
          conn,
          `INSERT INTO consent_event (account_id, consent_item_code, is_agreed) VALUES (?, 'service', TRUE), (?, 'anon_stats', ?)`,
          [id, id, input.consents.anon_stats],
        )
        const closed = input.closedDays ?? null
        await exec(
          conn,
          `INSERT INTO store (store_id, account_id, business_type_code, region_code, closed_days_set_at)
           VALUES (?, ?, ?, ?, ${closed === null ? 'NULL' : 'CURRENT_TIMESTAMP'})`,
          [id, id, input.businessTypeCode, input.regionCode],
        )
        if (closed?.length) {
          await exec(conn, 'INSERT INTO store_closed_day (store_id, day_of_week) VALUES ?', [[...new Set(closed)].map((d) => [id, d])])
        }
        await exec(conn, `INSERT INTO principal_role (principal_kind, principal_id, role_code) VALUES ('owner', ?, 'owner')`, [id])
        await exec(conn, `INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action) VALUES ('owner', ?, 'owner', 'grant')`, [id])
        return id
      })
      issueSession(res, { k: 'owner', id: accountId })
      res.status(201).json({ status: 'active' })
    },
  ],
])
