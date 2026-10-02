/**
 * US2 기록 (T049·T050), US3 달력 월간 요약(T058)
 * - PUT 은 업서트: 같은 날짜면 UPDATE → trg_daily_record_bu 가 revision 증가(UC2 A2)
 * - 기록 시점 지역·업종(*_at_record)은 가게에서 읽어 명시한다(트리거도 같은 값으로 덮어씀, db-verify.md 이탈 1)
 * - 외부 데이터 결합은 응답 후 비동기(envFetch) — 저장을 기다리게 하지 않는다(FR-023)
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, q1, exec, type Db } from '../../db/pool.js'
import { withTransaction } from '../../db/tx.js'
import { notFound, unprocessable } from '../../http/errors.js'
import { todayKst, YMD } from '../../lib/dates.js'
import { scheduleEnvFetch } from '../../jobs/envFetch.js'

const EVENT_CODES = ['rain', 'discount', 'new_menu', 'sns_post', 'group_guest', 'stock_out', 'staff_absent'] as const

const recordInput = z.object({
  dayMood: z.enum(['good', 'normal', 'bad']),
  customerLevel: z.enum(['many', 'usual', 'few']),
  eventTypeCodes: z.array(z.enum(EVENT_CODES)).max(7).default([]),
  salesBandCode: z.string().max(20).nullable().optional(),
  clientQueuedAt: z.string().nullable().optional(),
})

const RECORD_SELECT = `
  SELECT r.record_id, r.record_date AS recordDate, r.day_mood AS dayMood, r.customer_level AS customerLevel,
         r.sales_band_code AS salesBandCode, r.record_dow AS dayOfWeek, r.revision,
         (SELECT GROUP_CONCAT(e.event_type_code ORDER BY e.event_type_code) FROM daily_record_event e WHERE e.record_id = r.record_id) AS events,
         v.weather_code AS weatherCode, v.weather_status AS weatherStatus,
         v.is_holiday AS isHoliday, v.holiday_status AS holidayStatus,
         v.local_event_name AS localEventName, v.local_event_status AS localEventStatus,
         (SELECT c.holiday_name FROM calendar_day c WHERE c.cal_date = r.record_date) AS holidayName
    FROM daily_record r
    JOIN v_record_env v ON v.record_id = r.record_id`

function shape(r: any) {
  return {
    recordDate: r.recordDate,
    dayMood: r.dayMood,
    customerLevel: r.customerLevel,
    eventTypeCodes: r.events ? String(r.events).split(',') : [],
    salesBandCode: r.salesBandCode,
    dayOfWeek: r.dayOfWeek,
    revision: r.revision,
    env: {
      weatherCode: r.weatherCode,
      weatherStatus: r.weatherStatus,
      isHoliday: r.isHoliday === null ? null : Boolean(r.isHoliday),
      holidayName: r.holidayName ?? null,
      holidayStatus: r.holidayStatus,
      localEventName: r.localEventName,
      localEventStatus: r.localEventStatus,
    },
  }
}

export async function getRecord(db: Db, storeId: number, date: string) {
  const r = await q1(db, `${RECORD_SELECT} WHERE r.store_id = ? AND r.record_date = ?`, [storeId, date])
  return r ? shape(r) : null
}

export const recordsRouter = defineRoutes('', [
  [
    'get',
    '/codes/record-options',
    { perm: 'record.own.read' },
    async (_req, res) => {
      const db = getPool()
      const [events, bands] = await Promise.all([
        q(db, 'SELECT event_type_code AS code, event_type_label AS label, event_kind AS kind FROM special_event_type ORDER BY FIELD(event_type_code,"rain","discount","new_menu","sns_post","group_guest","stock_out","staff_absent")'),
        q(db, 'SELECT sales_band_code AS code, sales_band_label AS label FROM sales_band ORDER BY sort_order'),
      ])
      res.json({ events, salesBands: bands })
    },
  ],
  [
    'get',
    '/records',
    { perm: 'record.own.read' },
    async (req, res) => {
      const { from, to } = z.object({ from: z.string().regex(YMD), to: z.string().regex(YMD) }).parse(req.query)
      const rows = await q(
        getPool(),
        `${RECORD_SELECT} WHERE r.store_id = ? AND r.record_date BETWEEN ? AND ? ORDER BY r.record_date`,
        [req.storeId, from, to],
      )
      res.json(rows.map(shape))
    },
  ],
  [
    'get',
    '/records/months/:month/summary',
    { perm: 'record.own.read' },
    async (req, res) => {
      const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.params)
      const start = `${month}-01`
      const db = getPool()
      const sum = await q1(
        db,
        `SELECT recorded_days AS recordedDays, good_days AS goodDays, normal_days AS normalDays, bad_days AS badDays
           FROM v_store_month_summary WHERE store_id = ? AND month_start = ?`,
        [req.storeId, start],
      )
      const top = await q(
        db,
        `SELECT e.event_type_code AS code, COUNT(*) AS count
           FROM daily_record r JOIN daily_record_event e ON e.record_id = r.record_id
          WHERE r.store_id = ? AND r.record_date >= ? AND r.record_date < ? + INTERVAL 1 MONTH
          GROUP BY e.event_type_code ORDER BY count DESC, code LIMIT 3`,
        [req.storeId, start, start],
      )
      res.json({
        recordedDays: Number(sum?.recordedDays ?? 0),
        goodDays: Number(sum?.goodDays ?? 0),
        normalDays: Number(sum?.normalDays ?? 0),
        badDays: Number(sum?.badDays ?? 0),
        topEvents: top.map((t: any) => ({ code: t.code, count: Number(t.count) })),
      })
    },
  ],
  [
    'get',
    '/records/:date',
    { perm: 'record.own.read' },
    async (req, res) => {
      const { date } = z.object({ date: z.string().regex(YMD) }).parse(req.params)
      const r = await getRecord(getPool(), req.storeId!, date)
      if (!r) throw notFound('no_record')
      res.json(r)
    },
  ],
  [
    'put',
    '/records/:date',
    { perm: 'record.own.write' },
    async (req, res) => {
      const { date } = z.object({ date: z.string().regex(YMD) }).parse(req.params)
      if (date > todayKst()) throw unprocessable({ date: 'future' })
      const input = recordInput.parse(req.body)
      const storeId = req.storeId!
      const store = await q1<{ region_code: string; business_type_code: string }>(
        getPool(),
        'SELECT region_code, business_type_code FROM store WHERE store_id = ?',
        [storeId],
      )
      const saved = await withTransaction(async (conn) => {
        await exec(
          conn,
          `INSERT INTO daily_record (store_id, record_date, day_mood, customer_level, sales_band_code,
                                     region_code_at_record, business_type_code_at_record)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE day_mood = VALUES(day_mood), customer_level = VALUES(customer_level),
                                   sales_band_code = VALUES(sales_band_code)`,
          [storeId, date, input.dayMood, input.customerLevel, input.salesBandCode ?? null, store!.region_code, store!.business_type_code],
        )
        const rec = await q1<{ record_id: number }>(conn, 'SELECT record_id FROM daily_record WHERE store_id = ? AND record_date = ?', [storeId, date])
        await exec(conn, 'DELETE FROM daily_record_event WHERE record_id = ?', [rec!.record_id])
        const codes = [...new Set(input.eventTypeCodes)]
        if (codes.length) await exec(conn, 'INSERT INTO daily_record_event (record_id, event_type_code) VALUES ?', [codes.map((c) => [rec!.record_id, c])])
        return getRecord(conn, storeId, date)
      })
      res.json(saved)
      scheduleEnvFetch(store!.region_code, date)
    },
  ],
])
