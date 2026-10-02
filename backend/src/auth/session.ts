/**
 * 세션 (T022) — 서명 JWT 를 HttpOnly 쿠키로. 페이로드에는 권한을 넣지 않는다(회수 즉시 반영, data-model §7-4).
 */
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../config/env.js'

export const COOKIE = 'hrh_session'
const MAX_AGE_SEC = 7 * 24 * 3600

export type Principal =
  | { k: 'owner'; id: number; sid: string }
  | { k: 'org'; id: number; sid: string }
  | { k: 'staff'; id: number; sid: string }
  | { k: 'pending'; p: 'kakao' | 'dev'; h: string; sid: string }

type NewPrincipal =
  | { k: 'owner'; id: number }
  | { k: 'org'; id: number }
  | { k: 'staff'; id: number }
  | { k: 'pending'; p: 'kakao' | 'dev'; h: string }

export function issueSession(res: Response, p: NewPrincipal) {
  const token = jwt.sign({ ...p, sid: randomUUID() }, env.SESSION_JWT_SECRET, { expiresIn: MAX_AGE_SEC })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: MAX_AGE_SEC * 1000,
    path: '/',
  })
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' })
}

export function readSession(req: Request): Principal | null {
  const token = req.cookies?.[COOKIE]
  if (!token) return null
  try {
    return jwt.verify(token, env.SESSION_JWT_SECRET) as Principal
  } catch {
    return null
  }
}
