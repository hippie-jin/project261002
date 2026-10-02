/**
 * US6 동네 흐름 비교 (T076) — v_anon_cell(공개 칸)만 조회. 가게 수·순위는 내보내지 않는다(BR-HRH-15)
 *  G4 미통과 → 409 G4 (self), 공개 칸 없음 → 409 G5 (others)
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, q1 } from '../../db/pool.js'
import { gateBlocked } from '../../http/errors.js'
import { trackGate } from '../../gates/gateEvents.js'
import { addDays, todayKst, weekStart, weekStartsBetween } from '../../lib/dates.js'

export const compareRouter = defineRoutes('', [
  [
    'get',
    '/compare',
    { perm: 'compare.own.read' },
    async (req, res) => {
      const { period, dim } = z
        .object({ period: z.enum(['this_week', 'this_month']), dim: z.enum(['overall', 'dow', 'weather']) })
        .parse(req.query)
      const db = getPool()
      const storeId = req.storeId!
      const g4 = await q1<{ g4_pass: number }>(db, 'SELECT g4_pass FROM v_gate_g4_store WHERE store_id = ?', [storeId])
      await trackGate('G4', 'store', storeId, 'S5', Boolean(g4?.g4_pass))
      if (!g4?.g4_pass) throw gateBlocked('G4')

      const today = todayKst()
      const weeks = period === 'this_week' ? [weekStart(today)] : weekStartsBetween(`${today.slice(0, 7)}-01`, today)
      const store = await q1<{ region_code: string; business_type_code: string; region_name: string; business_type_name: string }>(
        db,
        `SELECT s.region_code, s.business_type_code, r.region_name, b.business_type_name
           FROM store s JOIN region r ON r.region_code = s.region_code JOIN business_type b ON b.business_type_code = s.business_type_code
          WHERE s.store_id = ?`,
        [storeId],
      )
      const cells = await q(
        db,
        `SELECT region_code AS regionCode, business_type_code AS businessTypeCode, week_start AS weekStart,
                dim_kind AS dimKind, dim_value AS dimValue, n_records AS nRecords, good_ratio AS goodRatio, few_ratio AS fewRatio
           FROM v_anon_cell
          WHERE region_code = ? AND business_type_code = ? AND dim_kind = ? AND week_start IN (?)`,
        [store!.region_code, store!.business_type_code, dim, weeks],
      )
      // 이번 주 overall 칸이 없으면 동네 묶음 자체가 공개 불가(G5)
      const pass = cells.length > 0
      await trackGate('G5', 'store', storeId, 'S5', pass)
      if (!pass) throw gateBlocked('G5')
      res.json({
        regionName: store!.region_name,
        businessTypeName: store!.business_type_name,
        period: { from: weeks[0], to: period === 'this_week' ? addDays(weeks[0], 6) : today },
        cells: cells.map((c: any) => ({ ...c, nRecords: Number(c.nRecords), goodRatio: Number(c.goodRatio), fewRatio: Number(c.fewRatio) })),
      })
    },
  ],
])
