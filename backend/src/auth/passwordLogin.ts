/**
 * 기관·운영 인력 아이디/비밀번호 로그인 (T024)
 * - bcrypt 비교, 아이디별 5회 실패 시 15분 잠금(423)
 * - 기관은 계약 만료여도 로그인 허용(G8 화면을 보여 주기 위해) — 데이터 접근은 org 라우터가 409 G8
 */
import bcrypt from 'bcryptjs'
import { getPool, q1 } from '../db/pool.js'

const MAX_FAIL = 5
const LOCK_MS = 15 * 60 * 1000
const failures = new Map<string, { n: number; until: number }>()
// 계정이 없을 때도 같은 시간이 걸리도록 비교할 더미 해시
const DUMMY_HASH = bcrypt.hashSync('hrh-dummy-password', 10)

export type LoginResult = { ok: true; id: number } | { ok: false; reason: 'invalid' | 'locked' | 'inactive' }

function lockKey(kind: string, loginId: string) {
  return `${kind}:${loginId.toLowerCase()}`
}

export async function passwordLogin(kind: 'owner' | 'org' | 'staff', loginId: string, password: string): Promise<LoginResult> {
  const key = lockKey(kind, loginId)
  const f = failures.get(key)
  if (f && f.until > Date.now()) return { ok: false, reason: 'locked' }

  const row =
    kind === 'owner'
      ? await q1<{ id: number; hash: string; active: number }>(
          getPool(),
          'SELECT account_id AS id, password_hash AS hash, 1 AS active FROM owner_credential WHERE login_id = ?',
          [loginId],
        )
      : kind === 'org'
      ? await q1<{ id: number; hash: string; active: number }>(
          getPool(),
          'SELECT org_account_id AS id, password_hash AS hash, 1 AS active FROM org_account WHERE login_id = ?',
          [loginId],
        )
      : await q1<{ id: number; hash: string; active: number }>(
          getPool(),
          'SELECT staff_account_id AS id, password_hash AS hash, is_active AS active FROM staff_account WHERE login_id = ?',
          [loginId],
        )
  const hash = row?.hash ?? DUMMY_HASH
  const match = await bcrypt.compare(password, hash)
  if (!row || !match) {
    const cur = failures.get(key) ?? { n: 0, until: 0 }
    cur.n += 1
    if (cur.n >= MAX_FAIL) {
      cur.until = Date.now() + LOCK_MS
      cur.n = 0
    }
    failures.set(key, cur)
    return { ok: false, reason: 'invalid' }
  }
  if (!row.active) return { ok: false, reason: 'inactive' }
  failures.delete(key)
  return { ok: true, id: row.id }
}

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10)
}
