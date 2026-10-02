/**
 * 송신 대기열 비우기 (T054) — 앱 시작·online 이벤트·SW sync 메시지에서 실행
 */
import { api } from '@/api/client'
import { outboxItems, removeOutbox } from './db'

let running = false
const listeners = new Set<() => void>()
export function onSynced(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function flushOutbox() {
  if (running) return
  running = true
  let sent = 0
  try {
    for (const item of await outboxItems()) {
      const r = await api(`/records/${item.date}`, { method: 'PUT', body: { ...item.body, clientQueuedAt: item.queuedAt } })
      if (r.ok || r.kind === 'validation') {
        await removeOutbox(item.date) // 검증 실패는 다시 보내도 같다 — 버린다
        sent++
      } else break // 여전히 오프라인·서버 문제 → 다음 기회
    }
  } finally {
    running = false
  }
  if (sent) listeners.forEach((l) => l())
  return sent
}

export function startSync() {
  window.addEventListener('online', () => flushOutbox())
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data === 'flush-outbox') flushOutbox()
  })
  flushOutbox()
}

/** SW Background Sync 등록(지원 브라우저) — 앱이 닫혀 있어도 연결되면 SW 가 앱에 비우기를 요청 */
export async function requestBackgroundSync() {
  try {
    // 활성 SW 가 없으면 ready 가 영원히 기다린다 — 1초 안에 없으면 건너뛴다(앱 재진입·online 이벤트로 처리)
    const reg: any = await Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(() => r(null), 1000))])
    await reg?.sync?.register('hrh-outbox')
  } catch {
    /* 미지원 브라우저: 앱 재진입·online 이벤트로 처리 */
  }
}
