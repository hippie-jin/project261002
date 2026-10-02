/** 상세보고서 내용 (US7) — 같은 분석·문장 모듈로 만든다. 서버는 고정 저장·전달만 한다 */
import { byDow, byEvents, byProblems, byWeather, summary, type Rec } from './patterns'
import { overallConfidence } from './confidence'

export function buildReport(recs: Rec[], minRecords: number | null) {
  const s = summary(recs, minRecords)
  const w = byWeather(recs)
  const sections = [s, byDow(recs), ...(w.hidden ? [] : [w]), ...byEvents(recs), ...byProblems(recs)].map((f) => ({
    title: f.label,
    sentence: f.sentence,
    evidence: f.evidence,
  }))
  const c = overallConfidence(recs.length, minRecords)
  return { confidence: c === 'insufficient' ? null : c, body: { sections } }
}
