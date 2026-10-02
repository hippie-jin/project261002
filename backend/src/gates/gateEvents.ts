/**
 * 게이트 이력 (T021, data-model §5) — 판정은 DB 함수·뷰가 하고 여기서는 이력만 남긴다.
 * G0~G2 는 기록하지 않는다(BR-HRH-02, SD_03 §11-3).
 */
import { getPool, exec, type Db } from '../db/pool.js'

type Gate = 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8'
type Kind = 'store' | 'org' | 'report_export'
type Screen = 'S3' | 'S5' | 'S6' | 'S7'

export const RELEASE_ACTION: Record<Gate, string> = {
  G3: 'records_accumulated',
  G4: 'anon_consent',
  G5: 'participants_reached',
  G6: 'payment_success',
  G7: 'export_confirmed',
  G8: 'contract_renewed',
}

export async function openGate(gate: Gate, kind: Kind, id: number, screen: Screen, db: Db = getPool()) {
  await exec(
    db,
    `INSERT INTO gate_event (gate_code, subject_kind, subject_id, screen_code)
     SELECT ?, ?, ?, ? FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM gate_event
                         WHERE gate_code = ? AND subject_kind = ? AND subject_id = ? AND released_at IS NULL)`,
    [gate, kind, id, screen, gate, kind, id],
  )
}

export async function releaseGate(gate: Gate, kind: Kind, id: number, db: Db = getPool()) {
  await exec(
    db,
    `UPDATE gate_event SET released_at = GREATEST(CURRENT_TIMESTAMP, opened_at), release_action = ?
      WHERE gate_code = ? AND subject_kind = ? AND subject_id = ? AND released_at IS NULL`,
    [RELEASE_ACTION[gate], gate, kind, id],
  )
}

/** 판정 결과로 열기/해제를 한 번에 — 실패해도 본 요청을 막지 않는다 */
export async function trackGate(gate: Gate, kind: Kind, id: number, screen: Screen, pass: boolean) {
  try {
    if (pass) await releaseGate(gate, kind, id)
    else await openGate(gate, kind, id, screen)
  } catch (e) {
    console.error('[gate_event]', gate, kind, id, (e as Error).message)
  }
}
