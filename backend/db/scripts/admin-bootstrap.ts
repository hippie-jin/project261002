/**
 * 최초 관리자 계정 만들기 (T024) — 운영 비밀번호를 파일에 두지 않기 위해 대화형으로 입력받는다.
 *   npm run admin:bootstrap -- --login <id> [--name <표시 이름>]
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { getPool, closePool, exec, q1 } from '../../src/db/pool.js'
import { hashPassword } from '../../src/auth/passwordLogin.js'

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const login = arg('login')
  if (!login) throw new Error('사용법: npm run admin:bootstrap -- --login <id> [--name <표시 이름>]')
  const rl = createInterface({ input: stdin, output: stdout })
  const pw = await rl.question('새 관리자 비밀번호(12자 이상): ')
  rl.close()
  if (pw.length < 12) throw new Error('비밀번호는 12자 이상이어야 합니다')
  const db = getPool()
  if (await q1(db, 'SELECT 1 FROM staff_account WHERE login_id = ?', [login])) throw new Error('이미 있는 아이디입니다')
  const r = await exec(db, 'INSERT INTO staff_account (login_id, password_hash, display_name) VALUES (?, ?, ?)', [login, await hashPassword(pw), arg('name') ?? '시스템 관리자'])
  await exec(db, `INSERT INTO principal_role (principal_kind, principal_id, role_code) VALUES ('staff', ?, 'admin')`, [r.insertId])
  await exec(db, `INSERT INTO rbac_grant_event (principal_kind, principal_id, role_code, action) VALUES ('staff', ?, 'admin', 'grant')`, [r.insertId])
  console.log(`관리자 ${login} 생성 (staff_account_id ${r.insertId})`)
}

main()
  .catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
  .finally(() => closePool())
