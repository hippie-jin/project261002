/** 결제 공급자 경계 (T080, research R12). 실제 PG 는 사업 결정 후 이 인터페이스로 추가한다. */
export interface PaymentProvider {
  charge(feature: 'report' | 'backup_export', simulate: 'success' | 'failed' | 'canceled'): Promise<{ result: 'success' | 'failed' | 'canceled'; externalRef: string }>
}

/** 모의 공급자 — 체험 화면에서 성공·실패·취소를 고를 수 있다 */
export const mockProvider: PaymentProvider = {
  async charge(_feature, simulate) {
    return { result: simulate, externalRef: `mock-${simulate}-${Date.now()}` }
  },
}
