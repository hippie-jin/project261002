/**
 * 인증·인가 미들웨어 (T025)
 * - authenticate: 쿠키 → req.principal
 * - access(): 라우트 선언(routeMatrix)에 맞춰 공개/가입대기/권한을 검사. 미보유 403, 게이트 차단(409)과 구분
 * - ownerStore: 사장님 세션의 account_id → store_id. 경로·본문의 store_id 는 받지 않는다(FR-091)
 */
import type { NextFunction, Request, Response } from 'express'
import { readSession, type Principal } from '../auth/session.js'
import { loadPermissions } from './permissions.js'
import { forbidden, unauthorized } from '../http/errors.js'
import { getPool, q1 } from '../db/pool.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal | null
      perms?: Set<string>
      storeId?: number
    }
  }
}

export type Access = 'public' | 'pending' | 'any' | { perm: string }

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  req.principal = readSession(req)
  next()
}

export function access(a: Access) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (a === 'public') return next()
      const p = req.principal
      if (!p) throw unauthorized()
      if (a === 'pending') {
        if (p.k !== 'pending') throw forbidden('pending')
        return next()
      }
      if (p.k === 'pending') throw forbidden(typeof a === 'object' ? a.perm : 'any')
      const { perms } = await loadPermissions(p.k, p.id)
      req.perms = perms
      if (a === 'any') return next()
      if (!perms.has(a.perm)) throw forbidden(a.perm)
      if (a.perm.includes('.own.')) {
        if (p.k !== 'owner') throw forbidden(a.perm)
        const row = await q1<{ store_id: number }>(getPool(), 'SELECT store_id FROM store WHERE account_id = ?', [p.id])
        if (!row) throw forbidden('store')
        req.storeId = row.store_id
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function principalId(req: Request): number {
  const p = req.principal
  if (!p || p.k === 'pending') throw unauthorized()
  return p.id
}
