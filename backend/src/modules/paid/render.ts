/**
 * 파일 렌더링 (T082) — 형식은 미정이라 잠정: 보고서 = 인쇄용 HTML, 백업·내보내기 = CSV(UTF-8 BOM)
 * 보고서 문장은 기기 내 분석 모듈이 만든 report_body 를 그대로 쓴다(서버에서 문장을 만들지 않음 — 중복 계산 금지)
 */
import { getPool, q } from '../../db/pool.js'

export const INCLUDED_ITEMS = {
  report: ['가게 업종 · 지역', '기간 안 매일의 장사 기록과 특별한 일에서 나온 경향 문장', '기록 일수와 신뢰도'],
  backup: ['가게 업종 · 지역', '모든 날짜의 장사 기록(오늘장사 · 손님 수 · 특별한 일)', '매출 구간(입력한 날만)'],
  export: ['가게 업종 · 지역', '모든 날짜의 장사 기록(오늘장사 · 손님 수 · 특별한 일)', '매출 구간(입력한 날만)'],
} as const

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const CONF: Record<string, string> = { high: '신뢰도 높음', medium: '신뢰도 보통', low: '신뢰도 낮음' }

export function renderReportHtml(e: any) {
  let body: any = {}
  try {
    body = JSON.parse(e.report_body ?? '{}')
  } catch {
    body = {}
  }
  const sections: Array<{ title: string; sentence: string; evidence?: string }> = Array.isArray(body.sections) ? body.sections : []
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하루한장 상세보고서</title>
<style>body{font-family:Pretendard,system-ui,sans-serif;color:#222;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;word-break:keep-all}
h1{font-size:28px;margin:0 0 4px}.meta{color:#6a6a6a;font-size:14px}.badge{display:inline-block;border:1px solid #ddd;border-radius:9999px;padding:2px 10px;font-size:12px;font-weight:600}
section{border:1px solid #ddd;border-radius:14px;padding:20px;margin:16px 0}h2{font-size:18px;margin:0 0 8px}.note{color:#3f3f3f;font-size:14px}</style></head><body>
<h1>하루한장 상세보고서</h1>
<p class="meta">${esc(e.period_start)} ~ ${esc(e.period_end)} · 기록 ${esc(e.record_count_snapshot)}일 · <span class="badge">${esc(CONF[e.confidence_snapshot] ?? '')}</span></p>
${sections.map((s) => `<section><h2>${esc(s.title)}</h2><p><strong>${esc(s.sentence)}</strong></p>${s.evidence ? `<p class="note">${esc(s.evidence)}</p>` : ''}</section>`).join('\n')}
<p class="note">이 보고서의 문장은 기록에서 보인 경향을 정리한 참고 정보예요. 원인을 단정하지 않으니 사장님 경험과 함께 판단해 주세요.</p>
</body></html>`
}

const MOOD: Record<string, string> = { good: '좋음', normal: '보통', bad: '나쁨' }
const CUST: Record<string, string> = { many: '많음', usual: '평소', few: '적음' }

export async function renderBackupCsv(storeId: number) {
  const rows = await q(
    getPool(),
    `SELECT r.record_date, r.day_mood, r.customer_level,
            (SELECT GROUP_CONCAT(t.event_type_label ORDER BY t.event_type_code SEPARATOR ' / ')
               FROM daily_record_event e JOIN special_event_type t ON t.event_type_code = e.event_type_code
              WHERE e.record_id = r.record_id) AS events,
            b.sales_band_label
       FROM daily_record r LEFT JOIN sales_band b ON b.sales_band_code = r.sales_band_code
      WHERE r.store_id = ? ORDER BY r.record_date`,
    [storeId],
  )
  const cell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const lines = ['날짜,오늘장사,손님 수,특별한 일,매출 구간']
  for (const r of rows) lines.push([r.record_date, MOOD[r.day_mood], CUST[r.customer_level], r.events ?? '', r.sales_band_label ?? '입력 안 함'].map(cell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}
