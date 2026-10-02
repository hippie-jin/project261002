/** KST 날짜 유틸 — "오늘"의 기준은 한국 표준시(명세 Assumptions) */
export function todayKst(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 월요일 시작 주의 첫날 (DB 의 week_start 와 같은 규칙) */
export function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // 0=월
  return addDays(ymd, -dow)
}

/** from~to 기간에 걸친 주 시작일 목록 */
export function weekStartsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w)
  return out
}

export const YMD = /^\d{4}-\d{2}-\d{2}$/
