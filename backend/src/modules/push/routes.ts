/** Web Push 구독 (T071) */
import { z } from 'zod'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { getPool, exec } from '../../db/pool.js'

export const pushRouter = defineRoutes('/push', [
  [
    'post',
    '/subscriptions',
    { perm: 'store.own.write' },
    async (req, res) => {
      const s = z
        .object({ endpoint: z.string().url().max(500), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) })
        .parse(req.body)
      await exec(
        getPool(),
        `INSERT INTO push_subscription (account_id, endpoint, p256dh, auth_secret) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), p256dh = VALUES(p256dh), auth_secret = VALUES(auth_secret)`,
        [(req.principal as any).id, s.endpoint, s.keys.p256dh, s.keys.auth],
      )
      res.status(201).end()
    },
  ],
  [
    'delete',
    '/subscriptions',
    { perm: 'store.own.write' },
    async (req, res) => {
      const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body)
      await exec(getPool(), 'DELETE FROM push_subscription WHERE endpoint = ? AND account_id = ?', [endpoint, (req.principal as any).id])
      res.status(204).end()
    },
  ],
])
