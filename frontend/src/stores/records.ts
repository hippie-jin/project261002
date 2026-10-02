/**
 * 기록 저장·조회 (T056) — 낙관적 저장: 오프라인이면 기기 대기열에 넣고 '전송 대기'로 보여 준다(UC2 E3)
 */
import { defineStore } from 'pinia'
import { api, type ApiResult } from '@/api/client'
import { cacheRecords, cachedRecords, outboxItems, queueRecord, type RecordInput } from '@/offline/db'
import { requestBackgroundSync } from '@/offline/sync'
import type { Rec } from '@/analysis/patterns'

export type SaveResult = { state: 'saved'; record: any } | { state: 'queued' } | { state: 'error'; result: ApiResult<unknown> }

export const useRecords = defineStore('records', {
  state: () => ({ offline: false }),
  actions: {
    /** 기간 기록 — 서버 실패 시 기기 캐시(최신 아닐 수 있음) */
    async range(from: string, to: string): Promise<{ records: Rec[]; fromCache: boolean; pending: Record<string, RecordInput> }> {
      const pending: Record<string, RecordInput> = {}
      for (const p of await outboxItems()) if (p.date >= from && p.date <= to) pending[p.date] = p.body
      const r = await api<Rec[]>(`/records?from=${from}&to=${to}`)
      if (r.ok) {
        this.offline = false
        await cacheRecords(r.data)
        return { records: r.data, fromCache: false, pending }
      }
      if (r.kind === 'offline') {
        this.offline = true
        return { records: await cachedRecords(from, to), fromCache: true, pending }
      }
      return { records: [], fromCache: false, pending }
    },
    async save(date: string, input: RecordInput): Promise<SaveResult> {
      const r = await api<any>(`/records/${date}`, { method: 'PUT', body: input })
      if (r.ok) {
        await cacheRecords([r.data])
        return { state: 'saved', record: r.data }
      }
      if (r.kind === 'offline') {
        await queueRecord(date, input)
        void requestBackgroundSync() // 등록이 끝나길 기다리지 않는다(오프라인에서 register 가 오래 걸릴 수 있음)
        return { state: 'queued' }
      }
      return { state: 'error', result: r }
    },
  },
})
