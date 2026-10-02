/** 진행 레일 상태 (C2) — 서버 v_store_rail + 기기 송신 대기열 */
import { defineStore } from 'pinia'
import { api } from '@/api/client'
import { pendingCount } from '@/offline/db'
import { todayKst } from '@/lib/dates'

export const useRail = defineStore('rail', {
  state: () => ({
    todayRecorded: false,
    recordCount: 0,
    g3Pass: false,
    g4Pass: false,
    g5PassThisWeek: false,
    todayPending: false,
    loaded: false,
  }),
  actions: {
    async refresh() {
      const r = await api<any>('/rail')
      if (r.ok) Object.assign(this, r.data)
      this.todayPending = (await pendingCount(todayKst())) > 0
      this.loaded = true
    },
  },
})
