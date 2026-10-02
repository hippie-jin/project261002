/**
 * 기기 내 패턴 분석 (T062, BR-HRH-10) — AI 없이 단순 통계. 서버로 결과를 보내지 않는다(보고서 스냅숏 제외).
 * 입력: GET /api/records 의 기록 + 외부 환경 결합 상태
 */
import { DOW, DOW_LONG, EVENT_KIND, EVENT_LABEL } from '@/labels'
import { overallConfidence, subgroupConfidence, SUBGROUP_MIN } from './confidence'
import { S } from './sentences'
import type { Confidence } from '@/labels'

export type Rec = {
  recordDate: string
  dayMood: 'good' | 'normal' | 'bad'
  customerLevel: 'many' | 'usual' | 'few'
  eventTypeCodes: string[]
  dayOfWeek: number
  env: { weatherCode: string | null; weatherStatus: 'ok' | 'needs_check' }
}

export type Finding = { key: string; label: string; sentence: string; evidence: string; confidence: Confidence; dates: string[]; hidden?: boolean }

/** 차이가 이 정도는 되어야 "경향"으로 말한다 — 잠정, confidence.ts 와 함께 데이터 담당자 확정 대상 */
const MIN_DIFF = 0.2

const goodRatio = (rs: Rec[]) => (rs.length ? rs.filter((r) => r.dayMood === 'good').length / rs.length : 0)
const fewRatio = (rs: Rec[]) => (rs.length ? rs.filter((r) => r.customerLevel === 'few').length / rs.length : 0)

export function summary(recs: Rec[], minRecords: number | null): Finding {
  return {
    key: 'summary',
    label: '요약',
    sentence: S.summary(goodRatio(recs)),
    evidence: `기록 ${recs.length}일 중 좋음 ${recs.filter((r) => r.dayMood === 'good').length}일`,
    confidence: overallConfidence(recs.length, minRecords),
    dates: recs.map((r) => r.recordDate),
  }
}

export function byDow(recs: Rec[]): Finding {
  const base = goodRatio(recs)
  let best: { dow: number; rs: Rec[]; ratio: number } | null = null
  for (let d = 1; d <= 7; d++) {
    const rs = recs.filter((r) => r.dayOfWeek === d)
    if (rs.length < SUBGROUP_MIN.low) continue
    const ratio = goodRatio(rs)
    if (!best || ratio > best.ratio) best = { dow: d, rs, ratio }
  }
  if (!best || best.ratio - base < MIN_DIFF) {
    return { key: 'dow', label: '요일별', sentence: S.dowFlat(), evidence: `기록 ${recs.length}일 기준`, confidence: subgroupConfidence(recs.length), dates: [] }
  }
  const good = best.rs.filter((r) => r.dayMood === 'good').length
  return {
    key: 'dow',
    label: '요일별',
    sentence: S.dowBest(DOW_LONG[best.dow]),
    evidence: S.dowEvidence(DOW[best.dow], best.rs.length, good),
    confidence: subgroupConfidence(best.rs.length),
    dates: best.rs.filter((r) => r.dayMood === 'good').map((r) => r.recordDate),
  }
}

export function byWeather(recs: Rec[]): Finding & { excluded: number } {
  const known = recs.filter((r) => r.env.weatherStatus === 'ok' && r.env.weatherCode)
  const excluded = recs.length - known.length
  const rain = known.filter((r) => r.env.weatherCode === 'rain' || r.env.weatherCode === 'snow')
  const other = known.filter((r) => !(r.env.weatherCode === 'rain' || r.env.weatherCode === 'snow'))
  const conf = subgroupConfidence(rain.length)
  if (rain.length < SUBGROUP_MIN.low) {
    return { key: 'weather', label: '날씨별', sentence: S.weatherFlat(), evidence: `비 온 날 기록 ${rain.length}일`, confidence: 'insufficient', dates: [], excluded, hidden: true }
  }
  const few = rain.filter((r) => r.customerLevel === 'few')
  if (fewRatio(rain) - fewRatio(other) < MIN_DIFF) {
    return { key: 'weather', label: '날씨별', sentence: S.weatherFlat(), evidence: S.rainEvidence(rain.length, few.length), confidence: conf, dates: [], excluded }
  }
  return { key: 'weather', label: '날씨별', sentence: S.rainFew(), evidence: S.rainEvidence(rain.length, few.length), confidence: conf, dates: few.map((r) => r.recordDate), excluded }
}

/** 특별한 일(활동) — 그 일이 있던 날과 다른 날 비교. code 를 주면 그 항목만 */
export function byEvents(recs: Rec[], code?: string): Finding[] {
  const codes = code ? [code] : Object.keys(EVENT_KIND).filter((c) => EVENT_KIND[c] === 'activity')
  const out: Finding[] = []
  for (const c of codes) {
    const on = recs.filter((r) => r.eventTypeCodes.includes(c))
    const off = recs.filter((r) => !r.eventTypeCodes.includes(c))
    if (on.length < SUBGROUP_MIN.low) continue
    const label = EVENT_LABEL[c]
    const good = on.filter((r) => r.dayMood === 'good').length
    const diff = goodRatio(on) - goodRatio(off)
    out.push({
      key: `event:${c}`,
      label: `특별한 일 · ${label}`,
      sentence: diff >= MIN_DIFF ? S.eventGood(label) : S.eventFlat(label),
      evidence: S.eventEvidence(label, on.length, good, goodRatio(off)),
      confidence: subgroupConfidence(on.length),
      dates: on.map((r) => r.recordDate),
    })
  }
  return out
}

export function byProblems(recs: Rec[]): Finding[] {
  const out: Finding[] = []
  for (const c of Object.keys(EVENT_KIND).filter((k) => EVENT_KIND[k] === 'problem')) {
    const on = recs.filter((r) => r.eventTypeCodes.includes(c))
    if (on.length < SUBGROUP_MIN.low) continue
    const counts = new Map<number, number>()
    on.forEach((r) => counts.set(r.dayOfWeek, (counts.get(r.dayOfWeek) ?? 0) + 1))
    const [topDow, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    const label = EVENT_LABEL[c]
    out.push({
      key: `problem:${c}`,
      label: '반복 문제',
      sentence: S.problemRepeat(label, topN / on.length >= 0.5 ? DOW[topDow] : undefined),
      evidence: S.problemEvidence(label, on.length, recs.length),
      confidence: subgroupConfidence(on.length),
      dates: on.map((r) => r.recordDate),
    })
  }
  if (!out.length) out.push({ key: 'problem:none', label: '반복 문제', sentence: S.problemNone(), evidence: `기록 ${recs.length}일 기준`, confidence: subgroupConfidence(recs.length), dates: [] })
  return out
}

export const ratios = { goodRatio, fewRatio }
