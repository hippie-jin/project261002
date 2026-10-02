/** 코드 → 화면 글자 (C11 장사 상태 표식 포함). 장사 상태는 색이 아니라 모양과 글자로(U7) */
export const MOOD = {
  good: { mark: '●', label: '좋음' },
  normal: { mark: '○', label: '보통' },
  bad: { mark: '–', label: '나쁨' },
} as const
export const CUSTOMER = { many: '많음', usual: '평소', few: '적음' } as const
export const EVENT_LABEL: Record<string, string> = {
  rain: '비',
  discount: '할인행사',
  new_menu: '신메뉴',
  sns_post: 'SNS 게시',
  group_guest: '단체손님',
  stock_out: '재료 부족',
  staff_absent: '직원 결근',
}
export const EVENT_KIND: Record<string, 'condition' | 'activity' | 'problem'> = {
  rain: 'condition',
  discount: 'activity',
  new_menu: 'activity',
  sns_post: 'activity',
  group_guest: 'activity',
  stock_out: 'problem',
  staff_absent: 'problem',
}
export const WEATHER: Record<string, string> = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' }
export const DOW = ['', '월', '화', '수', '목', '금', '토', '일'] // 1=월 … 7=일
export const DOW_LONG = ['', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
export const CONFIDENCE = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
  insufficient: '기록 부족 - 참고만',
} as const
export type Confidence = keyof typeof CONFIDENCE

export function dateLabel(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[((d.getDay() + 6) % 7) + 1]})`
}

/** 받침 유무에 따라 조사를 붙인다: josa('할인행사', '이', '가') → '할인행사가' */
export function josa(word: string, withFinal: string, withoutFinal: string) {
  const c = word.charCodeAt(word.length - 1)
  const hasFinal = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false
  return word + (hasFinal ? withFinal : withoutFinal)
}
export const eulReul = (w: string) => josa(w, '을', '를')
