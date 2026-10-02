/**
 * 하락 경향 판정 (T069, UC6, BR-HRH-17) — 기록 저장 직후 기기 안에서 실행
 * 판정 기간(alertWindowDays)의 '나쁨' 또는 '손님 적음' 비율이 직전 같은 기간보다 alertMinDecline 이상 늘면 decline.
 * 기준값이 비어 있으면 판정하지 않는다(SD_03 D4). 서버는 G3 를 다시 확인한다(trg_alert_bi).
 */
import { addDays, todayKst } from '@/lib/dates'
import { overallConfidence } from './confidence'
import type { Rec } from './patterns'

export type DeclineResult =
  | { kind: 'none' }
  | { kind: 'skip'; reason: 'no_threshold' | 'insufficient' }
  | { kind: 'gap'; recorded: number; windowDays: number }
  | { kind: 'decline'; windowStart: string; windowEnd: string; confidence: 'high' | 'medium' | 'low' }

const badish = (r: Rec) => r.dayMood === 'bad' || r.customerLevel === 'few'

export function judgeDecline(recs: Rec[], t: { minRecords: number | null; alertWindowDays: number | null; alertMinDecline: number | null }): DeclineResult {
  if (t.minRecords == null || t.alertWindowDays == null || t.alertMinDecline == null) return { kind: 'skip', reason: 'no_threshold' }
  const W = Math.round(t.alertWindowDays)
  const end = todayKst()
  const start = addDays(end, -(W - 1))
  const prevStart = addDays(start, -W)
  const prevEnd = addDays(start, -1)
  const cur = recs.filter((r) => r.recordDate >= start && r.recordDate <= end)
  const prev = recs.filter((r) => r.recordDate >= prevStart && r.recordDate <= prevEnd)
  if (cur.length < W * 0.5) return { kind: 'gap', recorded: cur.length, windowDays: W }
  if (cur.length < t.minRecords || prev.length < W * 0.5) return { kind: 'skip', reason: 'insufficient' }
  const curR = cur.filter(badish).length / cur.length
  const prevR = prev.filter(badish).length / prev.length
  if (curR - prevR < t.alertMinDecline) return { kind: 'none' }
  const c = overallConfidence(cur.length, t.minRecords)
  return { kind: 'decline', windowStart: start, windowEnd: end, confidence: c === 'insufficient' ? 'low' : c }
}
