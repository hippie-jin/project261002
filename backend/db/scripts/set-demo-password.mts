/**
 * 체험 계정(기관·운영 시드) 비밀번호를 SEED_DEV_PASSWORD 로 바꾼다 — 체험 데이터는 그대로 둔다.
 *   npx tsx db/scripts/set-demo-password.ts
 */
import { env } from '../../src/config/env.js'
import { getPool, closePool, exec } from '../../src/db/pool.js'
import { hashPassword } from '../../src/auth/passwordLogin.js'

const hash = await hashPassword(env.SEED_DEV_PASSWORD)
const db = getPool()
const o = await exec(db, 'UPDATE org_account SET password_hash = ? WHERE org_account_id BETWEEN 911001 AND 911999', [hash])
const s = await exec(db, 'UPDATE staff_account SET password_hash = ? WHERE staff_account_id BETWEEN 920001 AND 920999', [hash])
console.log(`기관 계정 ${o.affectedRows}개, 운영 계정 ${s.affectedRows}개 비밀번호 변경`)
await closePool()
