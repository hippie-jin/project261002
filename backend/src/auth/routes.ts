/**
 * 로그인 라우트 (T023, T024)
 *  사장님: 카카오(/auth/kakao/*) · 개발용(/auth/dev-login, AUTH_DEV_LOGIN=1 일 때만 동작)
 *  기관: /org/auth/login   운영: /staff/auth/login
 */
import { z } from 'zod'
import { env } from '../config/env.js'
import { defineRoutes } from '../rbac/routeMatrix.js'
import { getPool, q1 } from '../db/pool.js'
import { clearSession, issueSession } from './session.js'
import { kakao, subjectHash, type ProviderName } from './providers.js'
import { passwordLogin } from './passwordLogin.js'
import { HttpError, notFound } from '../http/errors.js'

/** 시드 체험 페르소나 — 공개 체험 화면에서 고를 수 있도록(seed/README.md) */
export const DEMO_PERSONAS = [
  { subject: 'owner-new', label: '처음 오신 사장님', hint: '가입부터 시작 (US1)' },
  { subject: 'owner-starter', label: '망원동 분식 · 기록 6일', hint: '첫 기록, 분석 준비 중, 익명 미동의 (US2·US4·US6)' },
  { subject: 'owner-steady', label: '망원동 분식 · 기록 두 달', hint: '달력·패턴·동네 비교 (US3·US4·US6)' },
  { subject: 'owner-declining', label: '망원동 분식 · 최근 조용함', hint: '조기 경보 (US5)' },
  { subject: 'owner-paid', label: '합정동 카페 · 유료 이용', hint: '상세보고서·내보내기 (US7)' },
  { subject: 'owner-cafe-neighbor', label: '합정동 카페 · 이웃 적음', hint: '동네 자료 모이는 중 (US6 G5)' },
]

async function loginOwner(res: any, provider: ProviderName, subject: string) {
  const h = subjectHash(provider, subject)
  const row = await q1<{ account_id: number }>(
    getPool(),
    'SELECT account_id FROM auth_identity WHERE provider = ? AND subject_hash = ?',
    [provider, h],
  )
  if (row) {
    issueSession(res, { k: 'owner', id: row.account_id })
    return 'active'
  }
  issueSession(res, { k: 'pending', p: provider, h })
  return 'pending_onboarding'
}

export const authRouter = defineRoutes('', [
  [
    'get',
    '/auth/kakao/start',
    'public',
    (_req, res) => {
      if (!kakao.enabled()) throw new HttpError(503, { error: 'kakao_disabled' })
      const state = kakao.newState()
      res.cookie('hrh_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: 600_000 })
      res.redirect(kakao.authorizeUrl(state))
    },
  ],
  [
    'get',
    '/auth/kakao/callback',
    'public',
    async (req, res) => {
      const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(req.query)
      if (!state || state !== req.cookies?.hrh_oauth_state) throw new HttpError(400, { error: 'state' })
      res.clearCookie('hrh_oauth_state')
      const subject = await kakao.subjectFromCode(code)
      const status = await loginOwner(res, 'kakao', subject)
      res.redirect(status === 'active' ? '/today' : '/start')
    },
  ],
  [
    'get',
    '/auth/dev-personas',
    'public',
    (_req, res) => {
      if (!env.AUTH_DEV_LOGIN) throw notFound()
      res.json(DEMO_PERSONAS)
    },
  ],
  [
    'post',
    '/auth/dev-login',
    'public',
    async (req, res) => {
      if (!env.AUTH_DEV_LOGIN) throw notFound()
      const { devSubject } = z
        .object({ devSubject: z.string().trim().min(3).max(60).regex(/^[a-z0-9-]+$/) })
        .parse(req.body)
      const status = await loginOwner(res, 'dev', devSubject)
      res.json({ status })
    },
  ],
  [
    'post',
    '/auth/logout',
    'public',
    (_req, res) => {
      clearSession(res)
      res.status(204).end()
    },
  ],
  [
    'post',
    '/owner/auth/login',
    'public',
    async (req, res) => {
      const { loginId, password } = z.object({ loginId: z.string().min(1).max(50), password: z.string().min(1).max(200) }).parse(req.body)
      const r = await passwordLogin('owner', loginId, password)
      if (!r.ok) throw new HttpError(r.reason === 'locked' ? 423 : 401, { error: r.reason })
      issueSession(res, { k: 'owner', id: r.id })
      res.status(204).end()
    },
  ],
  [
    'post',
    '/org/auth/login',
    'public',
    async (req, res) => {
      const { loginId, password } = z.object({ loginId: z.string().min(1).max(50), password: z.string().min(1).max(200) }).parse(req.body)
      const r = await passwordLogin('org', loginId, password)
      if (!r.ok) throw new HttpError(r.reason === 'locked' ? 423 : 401, { error: r.reason })
      issueSession(res, { k: 'org', id: r.id })
      res.status(204).end()
    },
  ],
  [
    'post',
    '/staff/auth/login',
    'public',
    async (req, res) => {
      const { loginId, password } = z.object({ loginId: z.string().min(1).max(50), password: z.string().min(1).max(200) }).parse(req.body)
      const r = await passwordLogin('staff', loginId, password)
      if (!r.ok) throw new HttpError(r.reason === 'locked' ? 423 : 401, { error: r.reason })
      issueSession(res, { k: 'staff', id: r.id })
      res.status(204).end()
    },
  ],
])
