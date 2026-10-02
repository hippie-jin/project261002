/**
 * 가게 설정·동의·탈퇴 (T065, T072, T077, T094)
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, q1, exec } from '../../db/pool.js'
import { withTransaction } from '../../db/tx.js'
import { clearSession } from '../../auth/session.js'
import { invalidatePrincipal } from '../../rbac/permissions.js'
import { trackGate } from '../../gates/gateEvents.js'

export const storeRouter = defineRoutes('', [
  [
    'get',
    '/store',
    { perm: 'store.own.read' },
    async (req, res) => {
      const db = getPool()
      const s = await q1(
        db,
        `SELECT s.business_type_code, b.business_type_name, s.region_code, r.region_name, s.closed_days_set_at,
                s.alert_push_enabled, g.g4_pass
           FROM store s
           JOIN business_type b ON b.business_type_code = s.business_type_code
           JOIN region r ON r.region_code = s.region_code
           JOIN v_gate_g4_store g ON g.store_id = s.store_id
          WHERE s.store_id = ?`,
        [req.storeId],
      )
      const days = await q<{ day_of_week: number }>(db, 'SELECT day_of_week FROM store_closed_day WHERE store_id = ? ORDER BY day_of_week', [req.storeId])
      res.json({
        businessTypeCode: s.business_type_code,
        businessTypeName: s.business_type_name,
        regionCode: s.region_code,
        regionName: s.region_name,
        closedDays: s.closed_days_set_at ? days.map((d) => d.day_of_week) : null,
        alertPushEnabled: Boolean(s.alert_push_enabled),
        anonStatsAgreed: Boolean(s.g4_pass),
      })
    },
  ],
  [
    'put',
    '/store/closed-days',
    { perm: 'store.own.write' },
    async (req, res) => {
      const { daysOfWeek } = z.object({ daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7) }).parse(req.body)
      await withTransaction(async (conn) => {
        await exec(conn, 'DELETE FROM store_closed_day WHERE store_id = ?', [req.storeId])
        const uniq = [...new Set(daysOfWeek)]
        if (uniq.length) await exec(conn, 'INSERT INTO store_closed_day (store_id, day_of_week) VALUES ?', [uniq.map((d) => [req.storeId, d])])
        await exec(conn, 'UPDATE store SET closed_days_set_at = CURRENT_TIMESTAMP WHERE store_id = ?', [req.storeId])
      })
      res.status(204).end()
    },
  ],
  [
    'patch',
    '/store/alert-settings',
    { perm: 'store.own.write' },
    async (req, res) => {
      const { pushEnabled } = z.object({ pushEnabled: z.boolean() }).parse(req.body)
      await exec(getPool(), 'UPDATE store SET alert_push_enabled = ? WHERE store_id = ?', [pushEnabled, req.storeId])
      res.status(204).end()
    },
  ],
  [
    'post',
    '/consents',
    { perm: 'store.own.write' },
    async (req, res) => {
      const { consentItemCode, agreed } = z.object({ consentItemCode: z.literal('anon_stats'), agreed: z.boolean() }).parse(req.body)
      const accountId = (req.principal as any).id
      await exec(getPool(), 'INSERT INTO consent_event (account_id, consent_item_code, is_agreed) VALUES (?, ?, ?)', [accountId, consentItemCode, agreed])
      if (agreed) await trackGate('G4', 'store', req.storeId!, 'S5', true)
      res.status(201).json({ anonStatsAgreed: agreed })
    },
  ],
  [
    'delete',
    '/account',
    { perm: 'account.own.delete' },
    async (req, res) => {
      // 탈퇴 즉시 삭제(research R9, FR-093 잠정): 다형 참조(gate_event)는 명시 삭제, 나머지는 CASCADE·trg_account_ad
      const accountId = (req.principal as any).id
      const storeId = req.storeId!
      await withTransaction(async (conn) => {
        await exec(conn, `DELETE FROM gate_event WHERE subject_kind = 'store' AND subject_id = ?`, [storeId])
        await exec(
          conn,
          `DELETE FROM gate_event WHERE subject_kind = 'report_export' AND subject_id IN (SELECT export_id FROM report_export WHERE store_id = ?)`,
          [storeId],
        )
        await exec(conn, 'DELETE FROM account WHERE account_id = ?', [accountId])
      })
      invalidatePrincipal('owner', accountId)
      clearSession(res)
      res.status(204).end()
    },
  ],
])
