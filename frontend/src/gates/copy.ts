/**
 * 게이트 표준 문구 — 유일한 정의 (T030, SD_02 §11-2)
 * 같은 게이트는 모든 화면에서 이 문구를 글자 그대로 쓴다(규칙 ④). 화면 컴포넌트는 문자열을 하드코딩하지 않는다.
 */
import type { GateCode } from '@/api/client'

export type GateCopy = { title: string; reason: string; releaser: string; buttonReason: string; others: boolean }
type Vars = { recordCount?: number; minRecords?: number | null; field?: string }

export function gateCopy(gate: GateCode, v: Vars = {}): GateCopy {
  const base = v.minRecords == null ? '기준을 정하는 중이에요' : `기준 ${v.minRecords}일이 쌓이면 보여 드려요`
  switch (gate) {
    case 'G0':
      return {
        title: '아직 시작할 수 없어요',
        reason: '필수 동의가 필요해요 (G0)',
        releaser: '푸는 사람: 사장님 - 위 필수 항목에 체크',
        buttonReason: '필수 항목에 동의해 주세요 (G0)',
        others: false,
      }
    case 'G1':
      return {
        title: '가게 정보를 마저 골라 주세요',
        reason: '업종과 지역은 꼭 필요해요 (G1)',
        releaser: '푸는 사람: 사장님 - 업종과 지역 고르기',
        buttonReason: `${v.field ?? '업종과 지역'}을 골라 주세요 - 업종과 지역은 꼭 필요해요 (G1)`,
        others: false,
      }
    case 'G2':
      return {
        title: '두 가지만 골라 주세요',
        reason: '오늘장사와 손님 수는 꼭 필요해요 (G2)',
        releaser: '푸는 사람: 사장님 - 두 가지 고르기',
        buttonReason: `${v.field ?? '오늘장사와 손님 수'}를 골라 주세요 - 오늘장사와 손님 수는 꼭 필요해요 (G2)`,
        others: false,
      }
    case 'G3':
      return {
        title: '아직 흐름을 보여 드릴 수 없어요',
        reason: `기록이 ${v.recordCount ?? 0}일이에요. ${base} (G3)`,
        releaser: '푸는 사람: 사장님 - 오늘부터 기록을 이어가면 풀려요',
        buttonReason: '기록이 더 쌓이면 볼 수 있어요 (G3)',
        others: false,
      }
    case 'G4':
      return {
        title: '동네 흐름을 보려면 익명 참여가 필요해요',
        reason: '익명 통계 참여에 동의하지 않았어요 (G4)',
        releaser: '푸는 사람: 사장님 - 내 기록을 익명 묶음에 보태면 풀려요',
        buttonReason: '익명 참여에 동의하면 볼 수 있어요 (G4)',
        others: false,
      }
    case 'G5':
      return {
        title: '아직 우리 동네 자료가 모이는 중이에요',
        reason: '같은 동네 같은 업종 참여 가게가 기준보다 적어요 (G5)',
        releaser: '참여 가게가 늘어나면 자동으로 풀려요',
        buttonReason: '자료가 모이면 볼 수 있어요 (G5)',
        others: true,
      }
    case 'G6':
      return {
        title: '유료 기능을 아직 쓸 수 없어요',
        reason: '결제가 완료되지 않았어요 (G6)',
        releaser: '푸는 사람: 사장님 - 결제를 다시 하면 풀려요',
        buttonReason: '결제가 끝나면 보고서를 만들 수 있어요 (G6)',
        others: false,
      }
    case 'G7':
      return {
        title: '받기 전에 확인해 주세요',
        reason: '들어가는 정보를 확인해 주세요 (G7)',
        releaser: '푸는 사람: 사장님 - 확인 체크',
        buttonReason: '들어가는 정보를 확인해 주세요 (G7)',
        others: false,
      }
    case 'G8':
      return {
        title: '대시보드를 열 수 없어요',
        reason: '이용 계약이 만료됐거나 권한이 없어요 (G8)',
        releaser: '푸는 사람: 기관 - 이용 계약 갱신',
        buttonReason: '계약이 확인되면 조회할 수 있어요 (G8)',
        others: true,
      }
  }
}
