/**
 * US5 조기 경보 (T070) — 판정은 기기 내 모듈(frontend/src/analysis/decline.ts), 서버는 G3 재검증(trg_alert_bi) 후 저장·발송
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, q1, exec } from '../../db/pool.js'
import { notFound } from '../../http/errors.js'
import { YMD } from '../../lib/dates.js'
import { pushEnabledFor, sendAlertPush } from '../push/send.js'

const shape = (a: any) => ({
  alertId: a.alert_id,
  windowStart: a.window_start,
  windowEnd: a.window_end,
  trendCode: a.trend_code,
  confidenceLevel: a.confidence_level,
  displayChannel: a.display_channel,
  status: a.alert_status,
  createdAt: a.created_at,
})

export const alertsRouter = defineRoutes('/alerts', [
  [
    'get',
    '',
    { perm: 'record.own.read' },
    async (req, res) => {
      const { status } = z.object({ status: z.enum(['new', 'acknowledged']).optional() }).parse(req.query)
      const rows = await q(
        getPool(),
        `SELECT * FROM alert WHERE store_id = ? ${status ? 'AND alert_status = ?' : ''} ORDER BY created_at DESC LIMIT 20`,
        status ? [req.storeId, status] : [req.storeId],
      )
      res.json(rows.map(shape))
    },
  ],
  [
    'post',
    '',
    { perm: 'alert.own.write' },
    async (req, res) => {
      const input = z
        .object({
          windowStart: z.string().regex(YMD),
          windowEnd: z.string().regex(YMD),
          trendCode: z.literal('decline'),
          confidenceLevel: z.enum(['high', 'medium', 'low']),
        })
        .parse(req.body)
      const accountId = (req.principal as any).id
      const push = await pushEnabledFor(req.storeId!, accountId)
      const r = await exec(
        getPool(),
        `INSERT INTO alert (store_id, window_start, window_end, trend_code, confidence_level, display_channel)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.storeId, input.windowStart, input.windowEnd, input.trendCode, input.confidenceLevel, push ? 'push' : 'in_app'],
      )
      const row = await q1(getPool(), 'SELECT * FROM alert WHERE alert_id = ?', [r.insertId])
      if (push) sendAlertPush(accountId, row.alert_id).catch((e) => console.warn('[push]', e.message))
      res.status(201).json(shape(row))
    },
  ],
  [
    'post',
    '/:alertId/ack',
    { perm: 'alert.own.write' },
    async (req, res) => {
      const { alertId } = z.object({ alertId: z.coerce.number().int() }).parse(req.params)
      const r = await exec(
        getPool(),
        `UPDATE alert SET alert_status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP
          WHERE alert_id = ? AND store_id = ? AND alert_status = 'new'`,
        [alertId, req.storeId],
      )
      if (!r.affectedRows) {
        const exists = await q1(getPool(), 'SELECT 1 FROM alert WHERE alert_id = ? AND store_id = ?', [alertId, req.storeId])
        if (!exists) throw notFound()
      }
      res.status(204).end()
    },
  ],
])
