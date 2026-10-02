/**
 * 경향 문장 — 유일한 정의 (T063, BR-HRH-09)
 * 모든 문장은 "~하는 경향이 있어요"·"참고" 형태로 만들고, 원인 단정 표현은 금지어 검사로 막는다.
 * 개인·동네·기관·보고서 문장이 모두 여기서 나온다.
 */
import { josa } from '@/labels'

export const BANNED = ['때문에', '덕분에', '원인은', '원인이', '탓에', '!']

export function assertNoCausalLanguage(s: string): string {
  for (const w of BANNED) if (s.includes(w)) throw new Error(`단정 표현 금지어 포함: ${w} — ${s}`)
  return s
}

const pct = (r: number) => `${Math.round(r * 100)}%`

export const S = {
  dowBest: (dowLong: string) => assertNoCausalLanguage(`${dowLong}에 좋은 날이 많은 경향이 있어요`),
  dowFlat: () => assertNoCausalLanguage('요일별로 뚜렷한 차이는 아직 보이지 않아요'),
  dowEvidence: (dow: string, n: number, good: number) => `${dow}요일 ${n}번 중 ${good}번 좋음`,
  rainFew: () => assertNoCausalLanguage('비 오는 날은 손님이 적은 경향이 있어요'),
  weatherFlat: () => assertNoCausalLanguage('날씨에 따른 뚜렷한 차이는 아직 보이지 않아요'),
  rainEvidence: (n: number, few: number) => `비 온 날 ${n}일 중 ${few}일 손님 적음`,
  eventGood: (label: string) => assertNoCausalLanguage(`${josa(label, '이', '가')} 있던 날은 좋은 날이 많은 경향이 있어요`),
  eventFlat: (label: string) => assertNoCausalLanguage(`${josa(label, '이', '가')} 있던 날과 다른 날의 차이는 아직 뚜렷하지 않아요`),
  eventEvidence: (label: string, n: number, good: number, otherRatio: number) =>
    `${label} ${n}번 중 ${good}번 좋음 · 다른 날 좋음 ${pct(otherRatio)}`,
  problemRepeat: (label: string, dow?: string) =>
    assertNoCausalLanguage(dow ? `${josa(label, '이', '가')} ${dow}요일에 되풀이되는 경향이 있어요` : `${josa(label, '이', '가')} 되풀이되는 경향이 있어요`),
  problemNone: () => assertNoCausalLanguage('되풀이되는 현장 문제는 아직 보이지 않아요'),
  problemEvidence: (label: string, n: number, total: number) => `${total}일 중 ${n}일 ${label}`,
  summary: (goodRatio: number) =>
    assertNoCausalLanguage(
      goodRatio >= 0.5 ? '좋은 날이 많은 흐름이 이어지는 경향이 있어요' : goodRatio <= 0.2 ? '좋은 날이 적은 흐름이 이어지는 경향이 있어요' : '평소와 비슷한 흐름이 이어지는 경향이 있어요',
    ),
  anon: (who: string, goodRatio: number, fewRatio: number) =>
    assertNoCausalLanguage(
      fewRatio >= 0.4
        ? `${josa(who, '은', '는')} 손님이 적은 날이 많은 경향이 있어요`
        : goodRatio >= 0.5
          ? `${josa(who, '은', '는')} 좋은 날이 많은 경향이 있어요`
          : `${josa(who, '은', '는')} 평소와 비슷한 흐름인 경향이 있어요`,
    ),
  anonEvidence: (goodRatio: number, fewRatio: number) => `좋은 날 ${pct(goodRatio)} · 손님 적은 날 ${pct(fewRatio)} (익명 묶음, 참고 정보)`,
  monthSummary: (good: number, normal: number, bad: number) => `이번 달 좋음 ${good}일 · 보통 ${normal}일 · 나쁨 ${bad}일이에요`,
}
