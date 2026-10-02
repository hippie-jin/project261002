import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise'
import { env } from '../config/env.js'

export type Db = Pool | PoolConnection

let pool: Pool | null = null

/** 팀 MariaDB 커넥션 풀. 커넥션마다 KST 고정(research R1) */
export function getPool(): Pool {
  if (pool) return pool
  pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'UTF8MB4_UNICODE_CI', // 스키마 기본 콜레이션과 일치(12.x 기본 uca1400 과 섞이면 뷰 비교 오류)
    timezone: env.DB_TIMEZONE,
    dateStrings: ['DATE'],
    connectionLimit: 8,
    waitForConnections: true,
    connectTimeout: 15000,
  })
  pool.on('connection', (conn) => {
    conn.query(`SET time_zone = '${env.DB_TIMEZONE}'`)
  })
  return pool
}

export async function closePool() {
  if (pool) await pool.end()
  pool = null
}

/** SELECT 결과 행 */
export async function q<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params)
  return rows as unknown as T[]
}

export async function q1<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(db, sql, params)
  return rows[0] ?? null
}

/** INSERT/UPDATE/DELETE */
export async function exec(db: Db, sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await db.query<ResultSetHeader>(sql, params)
  return res
}
