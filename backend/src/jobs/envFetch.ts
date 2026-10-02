/**
 * 외부 환경데이터 결합 (T051, P2 2.6 · BR-HRH-07)
 *  ① 날씨: 기상청 ASOS 일자료(공공데이터포털 AsosDalyInfoService) — region.weather_station_id 의 관측소
 *  ② 공휴일: 한국천문연구원 특일 정보(SpcdeInfoService/getRestDeInfo) — 월 단위
 *  ③ 지역행사: 한국관광공사 TourAPI 행사정보(searchFestival) — 지역 매핑 미정이라 조회 범위가 정해질 때까지 failed
 * 결과는 env_fetch_job 에 ok/failed 로 남긴다. 키·관측소가 없거나 자료가 아직 없으면 failed → 화면은 '확인 필요'.
 * 추정값으로 채우지 않는다(BR-HRH-13).
 */
import { env } from '../config/env.js'
import { getPool, q1, exec } from '../db/pool.js'

type Kind = 'weather' | 'holiday' | 'local_event'

async function mark(region: string, date: string, kind: Kind, ok: boolean) {
  await exec(
    getPool(),
    `INSERT INTO env_fetch_job (region_code, target_date, data_kind, fetch_status, attempt_count, last_attempt_at)
     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       attempt_count = IF(fetch_status = 'ok', attempt_count, attempt_count + 1),
       fetch_status  = IF(fetch_status = 'ok', 'ok', VALUES(fetch_status)),
       last_attempt_at = CURRENT_TIMESTAMP`,
    [region, date, kind, ok ? 'ok' : 'failed'],
  )
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text.trim().startsWith('{')) throw new Error('not json (서비스 키 또는 요청 오류)')
  return JSON.parse(text)
}

/** ASOS 일자료 → clear / cloudy / rain / snow */
async function fetchWeather(region: string, date: string): Promise<boolean> {
  const st = await q1<{ weather_station_id: string | null }>(getPool(), 'SELECT weather_station_id FROM region WHERE region_code = ?', [region])
  if (!env.DATA_GO_KR_KEY || !st?.weather_station_id) return false
  const ymd = date.replaceAll('-', '')
  const u = new URL('https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList')
  u.search = new URLSearchParams({
    serviceKey: env.DATA_GO_KR_KEY,
    dataType: 'JSON',
    dataCd: 'ASOS',
    dateCd: 'DAY',
    startDt: ymd,
    endDt: ymd,
    stnIds: st.weather_station_id,
    numOfRows: '1',
    pageNo: '1',
  }).toString()
  const j = await getJson(u.toString())
  const item = j?.response?.body?.items?.item?.[0]
  if (!item) return false // 전일 자료는 다음 날 제공 — 재조회(P0)로 채워진다
  const rain = Number(item.sumRn || 0)
  const snow = Number(item.ddMes || 0)
  const cloud = Number(item.avgTca || 0)
  const code = snow > 0 ? 'snow' : rain >= 1 ? 'rain' : cloud >= 7 ? 'cloudy' : 'clear'
  await exec(
    getPool(),
    `INSERT INTO weather_observation (region_code, obs_date, weather_code) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE weather_code = VALUES(weather_code), fetched_at = CURRENT_TIMESTAMP`,
    [region, date, code],
  )
  return true
}

/** 특일 정보 → calendar_day (해당 월 전체) */
async function fetchHoliday(date: string): Promise<boolean> {
  if (!env.DATA_GO_KR_KEY) return false
  const [y, m] = date.split('-')
  const u = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo')
  u.search = new URLSearchParams({ serviceKey: env.DATA_GO_KR_KEY, solYear: y, solMonth: m, _type: 'json', numOfRows: '50' }).toString()
  const j = await getJson(u.toString())
  const raw = j?.response?.body?.items?.item ?? []
  const items: any[] = Array.isArray(raw) ? raw : [raw]
  const holidays = new Map(items.filter((i) => i.isHoliday === 'Y').map((i) => [String(i.locdate), i.dateName as string]))
  const days = new Date(Number(y), Number(m), 0).getDate()
  for (let d = 1; d <= days; d++) {
    const ymd = `${y}-${m}-${String(d).padStart(2, '0')}`
    const name = holidays.get(ymd.replaceAll('-', '')) ?? null
    await exec(
      getPool(),
      `INSERT INTO calendar_day (cal_date, is_holiday, holiday_name) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_holiday = VALUES(is_holiday), holiday_name = VALUES(holiday_name)`,
      [ymd, name !== null, name],
    )
  }
  return true
}

/** 지역행사: 지역 코드 ↔ TourAPI 지역 매핑이 정해지지 않아(SD_03 §18) 아직 조회하지 않는다 → failed */
async function fetchLocalEvent(): Promise<boolean> {
  return false
}

export async function fetchEnv(region: string, date: string) {
  const tasks: Array<[Kind, () => Promise<boolean>]> = [
    ['weather', () => fetchWeather(region, date)],
    ['holiday', () => fetchHoliday(date)],
    ['local_event', () => fetchLocalEvent()],
  ]
  for (const [kind, fn] of tasks) {
    let ok = false
    try {
      ok = await fn()
    } catch (e) {
      console.warn(`[envFetch] ${kind} ${region} ${date}: ${(e as Error).message}`)
    }
    await mark(region, date, kind, ok)
  }
}

/** 저장 응답 뒤 비동기 실행 — 실패가 기록 저장을 막지 않는다 */
export function scheduleEnvFetch(region: string, date: string) {
  setImmediate(() => {
    fetchEnv(region, date).catch((e) => console.warn('[envFetch]', e.message))
  })
}
