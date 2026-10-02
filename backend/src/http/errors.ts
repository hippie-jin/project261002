import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { parseDbError } from '../db/gateError.js'

export type GateCode = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8'
const OTHERS: GateCode[] = ['G5', 'G8']

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body.error ?? status))
  }
}

/** 게이트 차단 — 409 GateBlocked (contracts) */
export function gateBlocked(gate: GateCode, detail: Record<string, unknown> = {}) {
  return new HttpError(409, {
    error: 'gate',
    gate,
    reasonKey: gate.toLowerCase(),
    releasedBy: OTHERS.includes(gate) ? 'others' : 'self',
    detail,
  })
}
export const forbidden = (permission: string) => new HttpError(403, { error: 'forbidden', permission })
export const unauthorized = () => new HttpError(401, { error: 'unauthorized' })
export const notFound = (what = 'not_found') => new HttpError(404, { error: what })
export const badRequest = (error: string, extra: Record<string, unknown> = {}) =>
  new HttpError(400, { error, ...extra })
export const unprocessable = (fields: Record<string, string>) => new HttpError(422, { error: 'validation', fields })

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json(err.body)
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const i of err.issues) fields[i.path.join('.') || '_'] = i.message
    return res.status(422).json({ error: 'validation', fields })
  }
  const mapped = parseDbError(err)
  if (mapped) return res.status(mapped.status).json(mapped.body)
  // 스택·SQL 은 응답에 넣지 않는다(FR-083)
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err)
  return res.status(500).json({ error: 'server' })
}
