/**
 * 마이그레이션 러너 (T012). Docker·mysql CLI 없이 mysql2 로 팀 DB에 적용한다.
 *   npm run db:migrate
 * - db/migrations/*.sql 을 이름순 적용, schema_migration 에 버전·체크섬 기록
 * - 이미 적용된 버전은 건너뛰고, 내용이 바뀌었으면(체크섬 불일치) 중단한다
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool, q, exec } from '../../src/db/pool.js'
import { splitSql } from './sqlSplit.js'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

async function main() {
  const pool = getPool()
  const conn = await pool.getConnection()
  try {
    await exec(
      conn,
      `CREATE TABLE IF NOT EXISTS schema_migration (
         version    VARCHAR(100) NOT NULL,
         checksum   CHAR(64)     NOT NULL,
         applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT pk_schema_migration PRIMARY KEY (version))`,
    )
    const applied = new Map(
      (await q<{ version: string; checksum: string }>(conn, 'SELECT version, checksum FROM schema_migration')).map(
        (r) => [r.version, r.checksum],
      ),
    )
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), 'utf8')
      const sum = createHash('sha256').update(sql).digest('hex')
      const prev = applied.get(file)
      if (prev) {
        if (prev !== sum) throw new Error(`${file}: 이미 적용된 마이그레이션의 내용이 바뀌었습니다(체크섬 불일치). 새 파일로 추가하세요.`)
        console.log(`skip  ${file}`)
        continue
      }
      const statements = splitSql(sql)
      console.log(`apply ${file} (${statements.length} statements)`)
      for (const [idx, st] of statements.entries()) {
        try {
          await conn.query(st)
        } catch (e: any) {
          console.error(`  실패: 문장 #${idx + 1}\n${st.slice(0, 400)}\n  → ${e.code ?? ''} ${e.message}`)
          throw e
        }
      }
      await exec(conn, 'INSERT INTO schema_migration (version, checksum) VALUES (?, ?)', [file, sum])
    }
    console.log('migrate: done')
  } finally {
    conn.release()
    await closePool()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
