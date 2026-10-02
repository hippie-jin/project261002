/**
 * 기기 로컬 저장소 (T054, data-model §6) — IndexedDB: outbox(전송 대기) · record_cache(오프라인 달력·기기 내 분석) · meta
 * 로그아웃·탈퇴 시 모두 비운다.
 */
import { openDB, type IDBPDatabase } from 'idb'

export type RecordInput = {
  dayMood: 'good' | 'normal' | 'bad'
  customerLevel: 'many' | 'usual' | 'few'
  eventTypeCodes: string[]
  salesBandCode: string | null
}

let dbp: Promise<IDBPDatabase> | null = null
function db() {
  if (!dbp)
    dbp = openDB('haruhanjang', 1, {
      upgrade(d) {
        d.createObjectStore('outbox')
        d.createObjectStore('record_cache')
        d.createObjectStore('meta')
      },
    })
  return dbp
}

export async function queueRecord(date: string, body: RecordInput) {
  // Vue 반응형 프록시는 IndexedDB 에 복제할 수 없다(DataCloneError) — 순수 객체로 복사해 저장
  const plain: RecordInput = JSON.parse(JSON.stringify(body))
  await (await db()).put('outbox', { date, body: plain, queuedAt: new Date().toISOString() }, date)
}
export async function outboxItems(): Promise<Array<{ date: string; body: RecordInput; queuedAt: string }>> {
  return (await db()).getAll('outbox')
}
export async function removeOutbox(date: string) {
  await (await db()).delete('outbox', date)
}
export async function pendingCount(date?: string) {
  const d = await db()
  if (date) return (await d.get('outbox', date)) ? 1 : 0
  return d.count('outbox')
}
export async function cacheRecords(records: any[]) {
  const d = await db()
  const tx = d.transaction('record_cache', 'readwrite')
  for (const r of records) await tx.store.put(r, r.recordDate)
  await tx.done
  await d.put('meta', new Date().toISOString(), 'lastSync')
}
export async function cachedRecords(from: string, to: string): Promise<any[]> {
  return (await db()).getAll('record_cache', IDBKeyRange.bound(from, to))
}
export async function clearLocal() {
  const d = await db()
  await Promise.all([d.clear('outbox'), d.clear('record_cache'), d.clear('meta')])
}
