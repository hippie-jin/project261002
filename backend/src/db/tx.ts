import type { PoolConnection } from 'mysql2/promise'
import { getPool } from './pool.js'

/** 트랜잭션 실행 — 성공 시 commit, 예외 시 rollback */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

/** 항상 rollback — 검증·시험 전용(공유 스키마에 흔적을 남기지 않는다, research R3) */
export async function withRollback<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    return await fn(conn)
  } finally {
    await conn.rollback()
    conn.release()
  }
}
