/**
 * 신뢰도 산출 — 유일한 정의 (T061). 개인 화면·경보 스냅숏·보고서 스냅숏이 모두 이 함수를 쓴다(SD_03 §2-3 중복 계산 금지).
 *
 * 기준 미정 — 데이터 담당자 확정 필요(SD_03 §18, spec Assumptions).
 * 아래 상수는 체험용 잠정값이며 이 파일 한 곳에서만 바꾼다.
 */
import type { Confidence } from '@/labels'

/** 관점(요일·날씨 등) 한 묶음의 표본 기준 — 잠정 */
export const SUBGROUP_MIN = { low: 2, medium: 4, high: 8 }

/** 전체 기록 신뢰도: 기준(g3_min_records) 미만이면 기록 부족, 기준의 2배 이상이면 높음 */
export function overallConfidence(n: number, minRecords: number | null): Confidence {
  if (minRecords == null || n < minRecords) return 'insufficient'
  if (n >= minRecords * 2) return 'high'
  return 'medium'
}

/** 관점 묶음 신뢰도 — 표본이 적으면 숨기거나 낮음(UC3 E2) */
export function subgroupConfidence(n: number): Confidence {
  if (n >= SUBGROUP_MIN.high) return 'high'
  if (n >= SUBGROUP_MIN.medium) return 'medium'
  if (n >= SUBGROUP_MIN.low) return 'low'
  return 'insufficient'
}

/** 두 신뢰도 중 낮은 쪽 */
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  const order: Confidence[] = ['insufficient', 'low', 'medium', 'high']
  return order[Math.min(order.indexOf(a), order.indexOf(b))]
}
