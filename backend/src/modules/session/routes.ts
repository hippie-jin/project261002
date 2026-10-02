/** 세션 상태·권한 (T026) */
import { env } from '../../config/env.js'
import { defineRoutes } from '../../rbac/routeMatrix.js'
import { loadPermissions } from '../../rbac/permissions.js'
import { kakao } from '../../auth/providers.js'

export const sessionRouter = defineRoutes('', [
  [
    'get',
    '/config/public',
    'public',
    (_req, res) => {
      res.json({
        publicDemo: env.PUBLIC_DEMO,
        devLogin: env.AUTH_DEV_LOGIN,
        kakaoLogin: kakao.enabled(),
        vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
      })
    },
  ],
  [
    'get',
    '/me',
    'public',
    (req, res) => {
      const p = req.principal
      if (!p) return res.status(401).json({ error: 'unauthorized' })
      if (p.k === 'pending') return res.json({ status: 'pending_onboarding', kind: 'pending' })
      res.json({ status: 'active', kind: p.k, id: p.id })
    },
  ],
  [
    'get',
    '/session/permissions',
    'any',
    async (req, res) => {
      const p = req.principal as { k: 'owner' | 'org' | 'staff'; id: number }
      const { perms, roles } = await loadPermissions(p.k, p.id)
      res.json({ kind: p.k, id: p.id, roles, permissions: [...perms].sort() })
    },
  ],
])
