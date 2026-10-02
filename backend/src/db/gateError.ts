/**
 * DB 오류 → HTTP 응답 변환 (T020)
 * 트리거의 SIGNAL 메시지는 'G3/BR-HRH-08: …', 'G8: …', 'RBAC: …', 'UC2: …' 형식이다(design/hrh_ddl.sql).
 * 판정 자체는 DB 가 하고, 여기서는 메시지 앞머리만 읽는다(SD_03 D3).
 */
type Mapped = { status: number; body: Record<string, unknown> }

const OTHERS = new Set(['G5', 'G8'])

export function parseDbError(err: any): Mapped | null {
  if (!err || typeof err !== 'object' || !('code' in err)) return null
  const msg: string = err.sqlMessage ?? err.message ?? ''
  if (err.code === 'ER_SIGNAL_EXCEPTION') {
    const g = /^(G[0-8])\b/.exec(msg)
    if (g) {
      const gate = g[1]
      return {
        status: 409,
        body: { error: 'gate', gate, reasonKey: gate.toLowerCase(), releasedBy: OTHERS.has(gate) ? 'others' : 'self', detail: {} },
      }
    }
    if (msg.startsWith('RBAC')) return { status: 400, body: { error: 'rbac' } }
    if (msg.includes('미래 날짜')) return { status: 422, body: { error: 'validation', fields: { date: 'future' } } }
    if (msg.includes('관할')) return { status: 403, body: { error: 'forbidden', permission: 'jurisdiction' } }
    return { status: 422, body: { error: 'validation', fields: { _: 'rule' } } }
  }
  if (err.code === 'ER_DUP_ENTRY') return { status: 409, body: { error: 'duplicate' } }
  if (err.code === 'ER_BAD_NULL_ERROR' || err.code === 'ER_NO_DEFAULT_FOR_FIELD')
    return { status: 422, body: { error: 'validation', fields: { _: 'required' } } }
  if (/CONSTRAINT `[^`]+` failed/.test(msg)) return { status: 422, body: { error: 'validation', fields: { _: 'constraint' } } }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return { status: 422, body: { error: 'validation', fields: { _: 'reference' } } }
  return null
}
