/**
 * Express 조립 (T019) — 모든 라우터는 /api 에 전체 경로로 마운트하고, 기동 시 권한 선언 누락을 검사한다(T027)
 */
import express, { type Router } from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { authenticate } from './rbac/middleware.js'
import { assertAllRoutesDeclared, defineRoutes } from './rbac/routeMatrix.js'
import { errorHandler, HttpError } from './http/errors.js'
import { getPool, q1 } from './db/pool.js'
import { authRouter } from './auth/routes.js'
import { sessionRouter } from './modules/session/routes.js'
import { onboardingRouter } from './modules/onboarding/routes.js'
import { storeRouter } from './modules/store/routes.js'
import { recordsRouter } from './modules/records/routes.js'
import { railRouter } from './modules/rail/routes.js'
import { alertsRouter } from './modules/alerts/routes.js'
import { pushRouter } from './modules/push/routes.js'
import { compareRouter } from './modules/compare/routes.js'
import { paidRouter } from './modules/paid/routes.js'
import { orgRouter } from './modules/org/routes.js'
import { adminRouter } from './modules/admin/routes.js'

const healthRouter = defineRoutes('', [
  [
    'get',
    '/health',
    'public',
    async (_req, res) => {
      const r = await q1(getPool(), 'SELECT 1 AS ok')
      res.json({ ok: r?.ok === 1 })
    },
  ],
])

export const apiRouters: Router[] = [
  healthRouter,
  authRouter,
  sessionRouter,
  onboardingRouter,
  storeRouter,
  recordsRouter,
  railRouter,
  alertsRouter,
  pushRouter,
  compareRouter,
  paidRouter,
  orgRouter,
  adminRouter,
]

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback, uniquelocal') // 공용 Nginx → Vite preview → Express
  app.use(helmet({ contentSecurityPolicy: false })) // API 응답만 — 화면 CSP 는 프론트엔드 서버 담당
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  // CSRF: 상태 변경 요청은 같은 출처 fetch 가 붙이는 헤더를 요구(T099) — SameSite=Lax 와 이중 방어
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('X-Requested-With') !== 'hrh')
      return next(new HttpError(403, { error: 'csrf' }))
    next()
  })
  app.use('/api', authenticate)
  for (const r of apiRouters) app.use('/api', r)
  app.use('/api', (_req, _res, next) => next(new HttpError(404, { error: 'not_found' })))
  app.use(errorHandler)
  const n = assertAllRoutesDeclared(apiRouters)
  return { app, routeCount: n }
}
