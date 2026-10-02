/**
 * 시드 러너 (T016)
 *   npm run db:seed:base   → db/seed-base.sql (RBAC 기준 데이터, 운영·개발 공통)
 *   npm run db:seed:dev    → db/seed-dev.sql  (체험 페르소나, 개발·시연 전용)
 * - 파일 전체를 한 커넥션에서 실행한다(임시 테이블 seed_seq 사용)
 * - dev: SET @auth_pepper, __BCRYPT_DEV_PASSWORD__ → bcrypt(SEED_DEV_PASSWORD) 치환
 * - NODE_ENV=production 에서는 dev 시드를 거부한다
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { env } from '../../src/config/env.js'
import { getPool, closePool } from '../../src/db/pool.js'
import { splitSql } from './sqlSplit.js'

const kind = process.argv[2]
if (kind !== 'base' && kind !== 'dev') {
  console.error('사용법: tsx db/scripts/seed.ts base|dev')
  process.exit(2)
}
if (kind === 'dev' && env.NODE_ENV === 'production' && !env.PUBLIC_DEMO) {
  console.error('운영 환경(NODE_ENV=production)에서는 개발 시드를 실행하지 않습니다. 공개 체험 배포라면 PUBLIC_DEMO=1')
  process.exit(3)
}

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../seed-${kind}.sql`)

async function main() {
  let sql = readFileSync(file, 'utf8')
  if (kind === 'dev') {
    const hash = await bcrypt.hash(env.SEED_DEV_PASSWORD, 10)
    sql = sql.replaceAll('__BCRYPT_DEV_PASSWORD__', hash)
  }
  const conn = await getPool().getConnection()
  try {
    await conn.query(`SET time_zone = '${env.DB_TIMEZONE}'`)
    await conn.query('SET @auth_pepper = ?', [env.AUTH_SUBJECT_PEPPER])
    const statements = splitSql(sql)
    await conn.beginTransaction()
    for (const [i, st] of statements.entries()) {
      try {
        await conn.query(st)
      } catch (e: any) {
        console.error(`실패: 문장 #${i + 1}\n${st.slice(0, 500)}\n→ ${e.code ?? ''} ${e.message}`)
        throw e
      }
    }
    await conn.commit()
    console.log(`seed-${kind}: ${statements.length} statements OK`)
  } catch (e) {
    await conn.rollback().catch(() => {})
    throw e
  } finally {
    conn.release()
    await closePool()
  }
}

main().catch(() => process.exit(1))
