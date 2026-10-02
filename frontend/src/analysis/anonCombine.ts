/**
 * 여러 주 익명 칸을 기록 수 가중으로 합친다 (T078) — 이번 달 비교, 기관 표의 기간 합계
 * 가게 수는 다루지 않는다(서버가 내보내지 않음, BR-HRH-15)
 */
export type Cell = { regionCode: string; businessTypeCode: string; weekStart: string; dimKind: string; dimValue: string; nRecords: number; goodRatio: number; fewRatio: number }

export function combine(cells: Cell[]): { nRecords: number; goodRatio: number; fewRatio: number } | null {
  const n = cells.reduce((s, c) => s + c.nRecords, 0)
  if (!n) return null
  return {
    nRecords: n,
    goodRatio: cells.reduce((s, c) => s + c.goodRatio * c.nRecords, 0) / n,
    fewRatio: cells.reduce((s, c) => s + c.fewRatio * c.nRecords, 0) / n,
  }
}

/** dimValue 별로 묶어 합친다(요일·날씨 관점) */
export function combineByDim(cells: Cell[]) {
  const groups = new Map<string, Cell[]>()
  for (const c of cells) groups.set(c.dimValue, [...(groups.get(c.dimValue) ?? []), c])
  return [...groups.entries()].map(([dimValue, cs]) => ({ dimValue, ...combine(cs)! }))
}
