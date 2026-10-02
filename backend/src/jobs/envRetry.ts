/**
 * P0 기록 보완 — 외부 데이터 재조회 (T052)
 * 매일 06:30·12:30 KST, 최근 60일 기록의 지역·날짜 중 조회 결과가 없거나 failed 인 것을 다시 조회한다.
 */
import cron from 'node-cron'
import { getPool, q } from '../db/pool.js'
import { fetchEnv } from './envFetch.js'

export async function retryMissingEnv(limit = 200) {
  const rows = await q<{ region: string; date: string }>(
    getPool(),
    `SELECT DISTINCT r.region_code_at_record AS region, r.record_date AS date
       FROM daily_record r
      WHERE r.record_date >= CURRENT_DATE - INTERVAL 60 DAY
        AND EXISTS (SELECT 1 FROM (SELECT 'weather' AS k UNION ALL SELECT 'holiday' UNION ALL SELECT 'local_event') kk
                     WHERE NOT EXISTS (SELECT 1 FROM env_fetch_job j
                                        WHERE j.region_code = r.region_code_at_record AND j.target_date = r.record_date
                                          AND j.data_kind = kk.k AND j.fetch_status = 'ok'))
      ORDER BY date DESC LIMIT ?`,
    [limit],
  )
  for (const r of rows) await fetchEnv(r.region, r.date)
  return rows.length
}

export function startEnvRetrySchedule() {
  const run = () =>
    retryMissingEnv()
      .then((n) => n && console.log(`[envRetry] 재조회 ${n}건`))
      .catch((e) => console.warn('[envRetry]', e.message))
  cron.schedule('30 6,12 * * *', run, { timezone: 'Asia/Seoul' })
}
