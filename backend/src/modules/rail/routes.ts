/**
 * 진행 레일(C2)·G3 판정 (T053, T067, T068)
 * 판정은 DB(v_store_rail, fn_gate_g3)가 하고 여기서는 읽기만 한다(SD_03 D3).
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q1 } from '../../db/pool.js'
import { trackGate } from '../../gates/gateEvents.js'
import { YMD } from '../../lib/dates.js'

const num = (v: any) => (v === null || v === undefined ? null : Number(v))

export const railRouter = defineRoutes('', [
  [
    'get',
    '/rail',
    { perm: 'record.own.read' },
    async (req, res) => {
      const r = await q1(getPool(), 'SELECT * FROM v_store_rail WHERE store_id = ?', [req.storeId])
      res.json({
        todayRecorded: Boolean(r?.today_recorded),
        recordCount: Number(r?.record_count ?? 0),
        g3Pass: Boolean(r?.g3_pass),
        g4Pass: Boolean(r?.g4_pass),
        g5PassThisWeek: Boolean(r?.g5_pass_this_week),
      })
    },
  ],
  [
    'get',
    '/gates/g3',
    { perm: 'record.own.read' },
    async (req, res) => {
      const { from, to, screen } = z
        .object({
          from: z.string().regex(YMD).optional(),
          to: z.string().regex(YMD).optional(),
          screen: z.enum(['S3', 'S6']).optional(),
        })
        .parse(req.query)
      const f = from ?? '1900-01-01'
      const r = await q1(
        getPool(),
        `SELECT fn_gate_g3(?, ?, COALESCE(?, CURRENT_DATE)) AS pass,
                (SELECT COUNT(*) FROM daily_record WHERE store_id = ? AND record_date BETWEEN ? AND COALESCE(?, CURRENT_DATE)) AS cnt,
                fn_threshold('g3_min_records') AS g3, fn_threshold('alert_window_days') AS aw, fn_threshold('alert_min_decline') AS ad`,
        [req.storeId, f, to ?? null, req.storeId, f, to ?? null],
      )
      const pass = Boolean(r?.pass)
      if (screen) await trackGate('G3', 'store', req.storeId!, screen, pass)
      res.json({
        pass,
        recordCount: Number(r?.cnt ?? 0),
        minRecords: num(r?.g3),
        alertWindowDays: num(r?.aw),
        alertMinDecline: num(r?.ad),
      })
    },
  ],
])
