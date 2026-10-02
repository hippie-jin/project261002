/**
 * US7 유료 기능 (T080~T082)
 * - 결제는 PaymentProvider(mock) 뒤에 둔다(research R12). 권한은 성공 결제에서만(trg_entitlement_bi, G6)
 * - 보고서 내용은 기기 내 분석 모듈이 만들어 제출하고, 서버는 기간 기록 수를 다시 세어 대조한 뒤 G6·G3 트리거를 통과해야 저장한다
 * - 파일은 포함 정보 확인(G7, confirmed_at) 뒤에만 전달한다(BR-HRH-20)
 */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, q1, exec } from '../../db/pool.js'
import { gateBlocked, notFound, unprocessable } from '../../http/errors.js'
import { trackGate } from '../../gates/gateEvents.js'
import { YMD } from '../../lib/dates.js'
import { mockProvider } from './provider.js'
import { INCLUDED_ITEMS, renderBackupCsv, renderReportHtml } from './render.js'

const FEATURE = (kind: string) => (kind === 'report' ? 'report' : 'backup_export')

const exportShape = (e: any) => ({
  exportId: e.export_id,
  exportKind: e.export_kind,
  periodStart: e.period_start,
  periodEnd: e.period_end,
  recordCountSnapshot: e.record_count_snapshot,
  confidenceSnapshot: e.confidence_snapshot,
  status: e.export_status,
  confirmedAt: e.confirmed_at,
  deliveredAt: e.delivered_at,
  createdAt: e.created_at,
  includedItems: INCLUDED_ITEMS[e.export_kind as keyof typeof INCLUDED_ITEMS],
})

async function ownExport(storeId: number, id: number) {
  const e = await q1(getPool(), 'SELECT * FROM report_export WHERE export_id = ? AND store_id = ?', [id, storeId])
  if (!e) throw notFound()
  return e
}

export const paidRouter = defineRoutes('/paid', [
  [
    'get',
    '/entitlements',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const rows = await q(
        getPool(),
        `SELECT feature_code AS featureCode, MAX(valid_until) AS validUntil FROM entitlement
          WHERE store_id = ? AND (valid_until IS NULL OR valid_until >= CURRENT_DATE) GROUP BY feature_code`,
        [req.storeId],
      )
      res.json(rows)
    },
  ],
  [
    'get',
    '/exports',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const rows = await q(getPool(), 'SELECT * FROM report_export WHERE store_id = ? ORDER BY created_at DESC LIMIT 20', [req.storeId])
      res.json(rows.map(exportShape))
    },
  ],
  [
    'post',
    '/payments',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const { featureCode, simulate } = z
        .object({ featureCode: z.enum(['report', 'backup_export']), simulate: z.enum(['success', 'failed', 'canceled']).default('success') })
        .parse(req.body)
      const result = await mockProvider.charge(featureCode, simulate)
      const db = getPool()
      const pa = await exec(
        db,
        'INSERT INTO payment_attempt (store_id, feature_code, payment_result, external_ref) VALUES (?, ?, ?, ?)',
        [req.storeId, featureCode, result.result, result.externalRef],
      )
      if (result.result !== 'success') {
        await trackGate('G6', 'store', req.storeId!, 'S6', false)
        throw gateBlocked('G6', { paymentResult: result.result })
      }
      await exec(db, 'INSERT INTO entitlement (store_id, feature_code, payment_attempt_id) VALUES (?, ?, ?)', [req.storeId, featureCode, pa.insertId])
      await trackGate('G6', 'store', req.storeId!, 'S6', true)
      res.status(201).json({ featureCode, result: 'success' })
    },
  ],
  [
    'post',
    '/exports',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const input = z
        .object({
          exportKind: z.enum(['report', 'backup', 'export']),
          periodStart: z.string().regex(YMD).nullable().optional(),
          periodEnd: z.string().regex(YMD).nullable().optional(),
          recordCountSnapshot: z.number().int().min(0),
          confidenceSnapshot: z.enum(['high', 'medium', 'low']).nullable().optional(),
          reportBody: z.any().optional(),
        })
        .parse(req.body)
      const db = getPool()
      const storeId = req.storeId!
      const ent = await q1<{ entitlement_id: number }>(
        db,
        `SELECT entitlement_id FROM entitlement WHERE store_id = ? AND feature_code = ?
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE) ORDER BY granted_at DESC LIMIT 1`,
        [storeId, FEATURE(input.exportKind)],
      )
      await trackGate('G6', 'store', storeId, 'S6', Boolean(ent))
      if (!ent) throw gateBlocked('G6')
      const report = input.exportKind === 'report'
      const cnt = await q1<{ n: number }>(
        db,
        report
          ? 'SELECT COUNT(*) AS n FROM daily_record WHERE store_id = ? AND record_date BETWEEN ? AND ?'
          : 'SELECT COUNT(*) AS n FROM daily_record WHERE store_id = ?',
        report ? [storeId, input.periodStart, input.periodEnd] : [storeId],
      )
      if (Number(cnt?.n) !== input.recordCountSnapshot) throw unprocessable({ recordCountSnapshot: 'mismatch' })
      const r = await exec(
        db,
        `INSERT INTO report_export (store_id, entitlement_id, export_kind, period_start, period_end,
                                    record_count_snapshot, confidence_snapshot, report_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          storeId,
          ent.entitlement_id,
          input.exportKind,
          report ? input.periodStart : null,
          report ? input.periodEnd : null,
          input.recordCountSnapshot,
          report ? (input.confidenceSnapshot ?? null) : null,
          report ? JSON.stringify(input.reportBody ?? {}) : null,
        ],
      )
      await trackGate('G7', 'report_export', r.insertId, 'S6', false)
      res.status(201).json(exportShape(await ownExport(storeId, r.insertId)))
    },
  ],
  [
    'post',
    '/exports/:exportId/confirm',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const { exportId } = z.object({ exportId: z.coerce.number().int() }).parse(req.params)
      await ownExport(req.storeId!, exportId)
      await exec(getPool(), 'UPDATE report_export SET confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP) WHERE export_id = ?', [exportId])
      await trackGate('G7', 'report_export', exportId, 'S6', true)
      res.status(204).end()
    },
  ],
  [
    'post',
    '/exports/:exportId/decline',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const { exportId } = z.object({ exportId: z.coerce.number().int() }).parse(req.params)
      const e = await ownExport(req.storeId!, exportId)
      if (e.export_status === 'generated') await exec(getPool(), `UPDATE report_export SET export_status = 'declined' WHERE export_id = ?`, [exportId])
      res.status(204).end()
    },
  ],
  [
    'get',
    '/exports/:exportId/file',
    { perm: 'paid.own.use' },
    async (req, res) => {
      const { exportId } = z.object({ exportId: z.coerce.number().int() }).parse(req.params)
      const e = await ownExport(req.storeId!, exportId)
      if (!e.confirmed_at) {
        await trackGate('G7', 'report_export', exportId, 'S6', false)
        throw gateBlocked('G7')
      }
      if (e.export_status === 'declined') throw notFound('declined')
      if (e.export_status !== 'delivered')
        await exec(getPool(), `UPDATE report_export SET export_status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE export_id = ?`, [exportId])
      if (e.export_kind === 'report') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="haruhanjang-report-${e.period_start}_${e.period_end}.html"`)
        return res.send(renderReportHtml(e))
      }
      const csv = await renderBackupCsv(req.storeId!)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="haruhanjang-${e.export_kind}.csv"`)
      res.send(csv)
    },
  ],
])
