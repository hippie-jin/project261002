/**
 * 라우트-권한 선언 (T027)
 * 모든 API 라우트는 defineRoutes() 로만 등록한다. 등록과 동시에 접근 규칙(public/pending/any/권한)을 기록하고,
 * 기동 시 assertAllRoutesDeclared() 가 Express 에 실제로 붙은 라우트와 대조해 선언 없는 라우트가 있으면 기동을 멈춘다.
 */
import { Router, type RequestHandler } from 'express'
import { access, type Access } from './middleware.js'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'
export type RouteDecl = { method: Method; path: string; access: Access }

export const declared: RouteDecl[] = []

/** 비동기 핸들러 예외를 오류 미들웨어로 넘긴다 */
export const wrap =
  (fn: (...args: Parameters<RequestHandler>) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }

export function defineRoutes(prefix: string, routes: Array<[Method, string, Access, ...RequestHandler[]]>) {
  const r = Router()
  for (const [method, path, acc, ...handlers] of routes) {
    declared.push({ method, path: prefix + path, access: acc })
    r[method](prefix + path, access(acc), ...handlers.map((h) => wrap(h as any)))
  }
  return r
}

/** /api 아래 붙은 라우터의 라우트 중 선언 없는 것이 있으면 예외 (모든 라우터는 /api 에 전체 경로로 마운트) */
export function assertAllRoutesDeclared(apiRouters: Router[]) {
  const found: string[] = []
  for (const router of apiRouters) {
    for (const layer of (router as any).stack) {
      if (layer.route) for (const m of Object.keys(layer.route.methods)) found.push(`${m} ${layer.route.path}`)
    }
  }
  const set = new Set(declared.map((d) => `${d.method} ${d.path}`))
  const missing = found.filter((f) => !set.has(f))
  if (missing.length) throw new Error(`권한 선언 없는 라우트: ${missing.join(', ')}`)
  return found.length
}
