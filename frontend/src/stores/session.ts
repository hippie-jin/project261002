/** 세션·권한 (T031) */
import { defineStore } from 'pinia'
import { api } from '@/api/client'

type Kind = 'owner' | 'org' | 'staff' | 'pending' | null

export const useSession = defineStore('session', {
  state: () => ({
    loaded: false,
    kind: null as Kind,
    id: null as number | null,
    roles: [] as string[],
    permissions: [] as string[],
    config: { publicDemo: false, devLogin: false, kakaoLogin: false, vapidPublicKey: null as string | null },
  }),
  getters: {
    can: (s) => (perm: string) => s.permissions.includes(perm),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return
      const [cfg, me] = await Promise.all([api<any>('/config/public'), api<any>('/me')])
      if (cfg.ok) this.config = cfg.data
      this.kind = null
      this.id = null
      this.roles = []
      this.permissions = []
      if (me.ok) {
        this.kind = me.data.kind
        this.id = me.data.id ?? null
        if (me.data.kind !== 'pending') {
          const p = await api<any>('/session/permissions')
          if (p.ok) {
            this.roles = p.data.roles
            this.permissions = p.data.permissions
          }
        }
      }
      this.loaded = true
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' })
      const { clearLocal } = await import('@/offline/db')
      await clearLocal()
      this.$reset()
      this.loaded = false
    },
  },
})
