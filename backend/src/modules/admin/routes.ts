/**
 * 운영 콘솔 API (T088~T092, data-model §7) — 개별 사장님 기록은 어떤 경로로도 내보내지 않는다
 */
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, q, q1, exec } from '../../db/pool.js'
import { withTransaction } from '../../db/tx.js'
import { HttpError, notFound } from '../../http/errors.js'
import { hashPassword } from '../../auth/passwordLogin.js'
import { invalidatePrincipal } from '../../rbac/permissions.js'
import { releaseGate } from '../../gates/gateEvents.js'
import { YMD } from '../../lib/dates.js'

const STAFF_ROLES = ['data_manager', 'operator', 'auditor', 'admin'] as const
const tempPassword = () => randomBytes(9).toString('base64url')
const staffId = (req: any) => req.principal.id as number

export const adminRouter = defineRoutes('/admin', [
  // T088 기준값
  [
    'get',
    '/thresholds',
    { perm: 'threshold.manage' },
    async (_req, res) => {
      const rows = await q(getPool(), 'SELECT setting_key AS `key`, setting_value AS value, unit_label AS unitLabel, updated_at AS updatedAt FROM threshold_setting ORDER BY setting_key')
      res.json(rows.map((r: any) => ({ ...r, value: r.value === null ? null : Number(r.value) })))
    },
  ],
  [
    'put',
    '/thresholds/:key',
    { perm: 'threshold.manage' },
    async (req, res) => {
      const { key } = z.object({ key: z.enum(['g3_min_records', 'g5_min_stores', 'alert_window_days', 'alert_min_decline']) }).parse(req.params)
      const { value } = z.object({ value: z.number().min(0).max(100000).nullable() }).parse(req.body)
      await exec(getPool(), 'UPDATE threshold_setting SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?', [value, key])
      res.status(204).end()
    },
  ],
  // T089 코드
  [
    'get',
    '/codes/:codeKind',
    { perm: 'code.read' },
    async (req, res) => {
      const { codeKind } = z.object({ codeKind: z.enum(['regions', 'business-types', 'sales-bands']) }).parse(req.params)
      const sql = {
        regions: 'SELECT region_code AS code, region_name AS name, parent_region_code AS parentCode, weather_station_id AS weatherStationId FROM region ORDER BY parent_region_code IS NOT NULL, region_code',
        'business-types': 'SELECT business_type_code AS code, business_type_name AS name FROM business_type ORDER BY business_type_code',
        'sales-bands': 'SELECT sales_band_code AS code, sales_band_label AS name, sort_order AS sortOrder FROM sales_band ORDER BY sort_order',
      }[codeKind]
      res.json(await q(getPool(), sql))
    },
  ],
  [
    'post',
    '/codes/:codeKind',
    { perm: 'code.manage' },
    async (req, res) => {
      const { codeKind } = z.object({ codeKind: z.enum(['regions', 'business-types', 'sales-bands']) }).parse(req.params)
      const db = getPool()
      if (codeKind === 'regions') {
        const b = z.object({ code: z.string().min(2).max(20), name: z.string().min(1).max(50), parentCode: z.string().max(20).nullable().optional(), weatherStationId: z.string().max(10).nullable().optional() }).parse(req.body)
        await exec(db, `INSERT INTO region (region_code, region_name, parent_region_code, weather_station_id) VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE region_name = VALUES(region_name), parent_region_code = VALUES(parent_region_code), weather_station_id = VALUES(weather_station_id)`,
          [b.code, b.name, b.parentCode ?? null, b.weatherStationId ?? null])
      } else if (codeKind === 'business-types') {
        const b = z.object({ code: z.string().min(2).max(20), name: z.string().min(1).max(50) }).parse(req.body)
        await exec(db, 'INSERT INTO business_type (business_type_code, business_type_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE business_type_name = VALUES(business_type_name)', [b.code, b.name])
      } else {
        const b = z.object({ code: z.string().min(2).max(20), name: z.string().min(1).max(30), sortOrder: z.number().int() }).parse(req.body)
        await exec(db, 'INSERT INTO sales_band (sales_band_code, sales_band_label, sort_order) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sales_band_label = VALUES(sales_band_label), sort_order = VALUES(sort_order)', [b.code, b.name, b.sortOrder])
      }
      res.status(204).end()
    },
  ],
  // T090 기관·계약
  [
    'get',
    '/orgs',
    { perm: 'org.manage' },
    async (_req, res) => {
      const rows = await q(
        getPool(),
        `SELECT o.org_id AS orgId, o.org_name AS orgName, o.contract_status AS contractStatus, o.contract_end_date AS contractEndDate,
                (SELECT GROUP_CONCAT(j.region_code ORDER BY j.region_code) FROM org_jurisdiction j WHERE j.org_id = o.org_id) AS juris,
                (SELECT GROUP_CONCAT(a.login_id ORDER BY a.login_id) FROM org_account a WHERE a.org_id = o.org_id) AS accounts
           FROM organization o ORDER BY o.org_id`,
      )
      res.json(rows.map((r: any) => ({ ...r, jurisdiction: r.juris ? r.juris.split(',') : [], accounts: r.accounts ? r.accounts.split(',') : [], juris: undefined })))
    },
  ],
  [
    'post',
    '/orgs',
    { perm: 'org.manage' },
    async (req, res) => {
      const b = z.object({ orgName: z.string().min(1).max(100), jurisdiction: z.array(z.string().max(20)).min(1) }).parse(req.body)
      const id = await withTransaction(async (conn) => {
        const r = await exec(conn, `INSERT INTO organization (org_name, contract_status) VALUES (?, 'active')`, [b.orgName])
        await exec(conn, 'INSERT INTO org_jurisdiction (org_id, region_code) VALUES ?', [b.jurisdiction.map((c) => [r.insertId, c])])
        return r.insertId
      })
      res.status(201).json({ orgId: id })
    },
  ],
  [
    'patch',
    '/orgs/:orgId/contract',
    { perm: 'contract.manage' },
    async (req, res) => {
      const { orgId } = z.object({ orgId: z.coerce.number().int() }).parse(req.params)
      const b = z.object({ status: z.enum(['active', 'expired']), endDate: z.string().regex(YMD).nullable().optional() }).parse(req.body)
      const r = await exec(getPool(), 'UPDATE organization SET contract_status = ?, contract_end_date = ? WHERE org_id = ?', [b.status, b.endDate ?? null, orgId])
      if (!r.affectedRows) throw notFound()
      const valid = await q1(getPool(), 'SELECT g8_pass FROM v_gate_g8_org WHERE org_id = ?', [orgId])
      if (valid?.g8_pass) await releaseGate('G8', 'org', orgId)
      res.status(204).end()
    },
  ],
  [
    'put',
    '/orgs/:orgId/jurisdiction',
    { perm: 'org.manage' },
    async (req, res) => {
      const { orgId } = z.object({ orgId: z.coerce.number().int() }).parse(req.params)
      const { regionCodes } = z.object({ regionCodes: z.array(z.string().max(20)).min(1) }).parse(req.body)
      await withTransaction(async (conn) => {
        await exec(conn, 'DELETE FROM org_jurisdiction WHERE org_id = ?', [orgId])
        await exec(conn, 'INSERT INTO org_jurisdiction (org_id, region_code) VALUES ?', [regionCodes.map((c) => [orgId, c])])
      })
      res.status(204).end()
    },
  ],
  [
    'post',
    '/orgs/:orgId/accounts',
    { perm: 'org.manage' },
    async (req, res) => {
      const { orgId } = z.object({ orgId: z.coerce.number().int() }).parse(req.params)
      const { loginId } = z.object({ loginId: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/) }).parse(req.body)
      const pw = tempPassword()
      const id = await withTransaction(async (conn) => {
        const r = await exec(conn, 'INSERT INTO org_account (org_id, login_id, password_hash) VALUES (?, ?, ?)', [orgId, loginId, await hashPassword(pw)])
        await exec(conn, `INSERT INTO principal_role (principal_kind, principal_id, role_code, granted_by_staff) VALUES ('org', ?, 'org_viewer', ?)`, [r.insertId, staffId(req)])
        await exec(conn, `INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action, acted_by_staff) VALUES ('org', ?, 'org_viewer', 'grant', ?)`, [r.insertId, staffId(req)])
        return r.insertId
      })
      res.status(201).json({ orgAccountId: id, temporaryPassword: pw })
    },
  ],
  // T091 감사
  [
    'get',
    '/audit/:auditKind',
    { perm: 'audit.read' },
    async (req, res) => {
      const { auditKind } = z.object({ auditKind: z.enum(['gate-events', 'exports', 'org-queries', 'anon-cells', 'rbac-grants']) }).parse(req.params)
      const { from, to } = z.object({ from: z.string().regex(YMD).optional(), to: z.string().regex(YMD).optional() }).parse(req.query)
      const f = from ?? '1900-01-01'
      const t = to ?? '2999-12-31'
      const sql = {
        'gate-events': `SELECT gate_event_id AS id, gate_code AS gate, subject_kind AS subjectKind, subject_id AS subjectId, screen_code AS screen,
                               opened_at AS openedAt, released_at AS releasedAt, release_action AS releaseAction
                          FROM gate_event WHERE DATE(opened_at) BETWEEN ? AND ? ORDER BY opened_at DESC LIMIT 200`,
        exports: `SELECT export_id AS id, store_id AS storeNo, export_kind AS kind, period_start AS periodStart, period_end AS periodEnd,
                         record_count_snapshot AS records, confidence_snapshot AS confidence, export_status AS status,
                         created_at AS createdAt, confirmed_at AS confirmedAt, delivered_at AS deliveredAt
                    FROM report_export WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 200`,
        'org-queries': `SELECT l.query_log_id AS id, o.org_name AS org, l.region_code AS region, COALESCE(l.business_type_code, '전체') AS businessType,
                               l.period_start AS periodStart, l.period_end AS periodEnd, l.perspective_code AS perspective, l.queried_at AS queriedAt
                          FROM org_query_log l JOIN organization o ON o.org_id = l.org_id
                         WHERE DATE(l.queried_at) BETWEEN ? AND ? ORDER BY l.queried_at DESC LIMIT 200`,
        'anon-cells': `SELECT region_code AS region, business_type_code AS businessType, week_start AS weekStart, n_stores AS stores,
                              n_records AS records, g5_pass AS g5Pass
                         FROM v_anon_cell_all WHERE dim_kind = 'overall' AND week_start BETWEEN ? AND ? ORDER BY week_start DESC, region_code, business_type_code LIMIT 300`,
        'rbac-grants': `SELECT grant_event_id AS id, principal_kind AS kind, principal_id AS principalId, role_code AS role, action,
                               acted_by_staff AS actedBy, acted_at AS actedAt
                          FROM rbac_grant_event WHERE DATE(acted_at) BETWEEN ? AND ? ORDER BY acted_at DESC LIMIT 200`,
      }[auditKind]
      res.json(await q(getPool(), sql, [f, t]))
    },
  ],
  // T092 운영 인력·역할
  [
    'get',
    '/staff',
    { perm: 'role.manage' },
    async (_req, res) => {
      const rows = await q(
        getPool(),
        `SELECT s.staff_account_id AS staffAccountId, s.login_id AS loginId, s.display_name AS displayName, s.is_active AS isActive,
                (SELECT GROUP_CONCAT(role_code ORDER BY role_code) FROM principal_role pr WHERE pr.principal_kind = 'staff' AND pr.principal_id = s.staff_account_id) AS roles
           FROM staff_account s ORDER BY s.staff_account_id`,
      )
      res.json(rows.map((r: any) => ({ ...r, isActive: Boolean(r.isActive), roles: r.roles ? r.roles.split(',') : [] })))
    },
  ],
  [
    'post',
    '/staff',
    { perm: 'role.manage' },
    async (req, res) => {
      const b = z.object({ loginId: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/), displayName: z.string().min(1).max(50), roles: z.array(z.enum(STAFF_ROLES)).min(1) }).parse(req.body)
      const pw = tempPassword()
      const id = await withTransaction(async (conn) => {
        const r = await exec(conn, 'INSERT INTO staff_account (login_id, password_hash, display_name) VALUES (?, ?, ?)', [b.loginId, await hashPassword(pw), b.displayName])
        for (const role of new Set(b.roles)) {
          await exec(conn, `INSERT INTO principal_role (principal_kind, principal_id, role_code, granted_by_staff) VALUES ('staff', ?, ?, ?)`, [r.insertId, role, staffId(req)])
          await exec(conn, `INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action, acted_by_staff) VALUES ('staff', ?, ?, 'grant', ?)`, [r.insertId, role, staffId(req)])
        }
        return r.insertId
      })
      res.status(201).json({ staffAccountId: id, temporaryPassword: pw })
    },
  ],
  [
    'patch',
    '/staff/:staffId',
    { perm: 'role.manage' },
    async (req, res) => {
      const { staffId: target } = z.object({ staffId: z.coerce.number().int() }).parse(req.params)
      const b = z.object({ roles: z.array(z.enum(STAFF_ROLES)).optional(), isActive: z.boolean().optional() }).parse(req.body)
      const me = staffId(req)
      await withTransaction(async (conn) => {
        const cur = (await q<{ role_code: string }>(conn, `SELECT role_code FROM principal_role WHERE principal_kind = 'staff' AND principal_id = ? FOR UPDATE`, [target])).map((r) => r.role_code)
        if (!(await q1(conn, 'SELECT 1 FROM staff_account WHERE staff_account_id = ?', [target]))) throw notFound()
        const next = b.roles ? [...new Set(b.roles)] : cur
        const losingAdmin = (cur.includes('admin') && !next.includes('admin')) || (b.isActive === false && cur.includes('admin'))
        if (losingAdmin) {
          if (target === me) throw new HttpError(409, { error: 'self_admin_revoke' })
          const others = await q1<{ n: number }>(
            conn,
            `SELECT COUNT(*) AS n FROM principal_role pr JOIN staff_account s ON s.staff_account_id = pr.principal_id
              WHERE pr.principal_kind = 'staff' AND pr.role_code = 'admin' AND s.is_active AND pr.principal_id <> ?`,
            [target],
          )
          if (!Number(others?.n)) throw new HttpError(409, { error: 'last_admin' })
        }
        for (const role of cur.filter((r) => !next.includes(r))) {
          await exec(conn, `DELETE FROM principal_role WHERE principal_kind = 'staff' AND principal_id = ? AND role_code = ?`, [target, role])
          await exec(conn, `INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action, acted_by_staff) VALUES ('staff', ?, ?, 'revoke', ?)`, [target, role, me])
        }
        for (const role of next.filter((r) => !cur.includes(r))) {
          await exec(conn, `INSERT INTO principal_role (principal_kind, principal_id, role_code, granted_by_staff) VALUES ('staff', ?, ?, ?)`, [target, role, me])
          await exec(conn, `INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action, acted_by_staff) VALUES ('staff', ?, ?, 'grant', ?)`, [target, role, me])
        }
        if (b.isActive !== undefined) await exec(conn, 'UPDATE staff_account SET is_active = ? WHERE staff_account_id = ?', [b.isActive, target])
      })
      invalidatePrincipal('staff', target)
      res.status(204).end()
    },
  ],
])
