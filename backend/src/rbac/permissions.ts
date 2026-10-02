/**
 * 권한 해석 (T025) — 단일 지점은 DB 뷰 v_principal_permission (data-model §7-4)
 */
import { getPool, q } from '../db/pool.js'

type Kind = 'owner' | 'org' | 'staff'
const TTL = 60_000
const cache = new Map<string, { at: number; perms: Set<string>; roles: string[] }>()

export async function loadPermissions(kind: Kind, id: number) {
  const key = `${kind}:${id}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit
  const [perms, roles] = await Promise.all([
    q<{ permission_code: string }>(
      getPool(),
      'SELECT permission_code FROM v_principal_permission WHERE principal_kind = ? AND principal_id = ?',
      [kind, id],
    ),
    q<{ role_code: string }>(
      getPool(),
      'SELECT role_code FROM principal_role WHERE principal_kind = ? AND principal_id = ? ORDER BY role_code',
      [kind, id],
    ),
  ])
  const entry = { at: Date.now(), perms: new Set(perms.map((p) => p.permission_code)), roles: roles.map((r) => r.role_code) }
  cache.set(key, entry)
  return entry
}

/** 역할 변경 직후 호출 — 다음 요청에서 다시 읽는다 */
export function invalidatePrincipal(kind: Kind, id: number) {
  cache.delete(`${kind}:${id}`)
}
