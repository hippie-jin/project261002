<!-- S8 설정·탈퇴 (T094, FR-093 잠정: 탈퇴 즉시 삭제) -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useSession } from '@/stores/session'
import { useRail } from '@/stores/rail'
import { DOW } from '@/labels'
import { subscribePush } from '@/offline/push'
import { clearLocal } from '@/offline/db'
import OwnerLayout from '@/layouts/OwnerLayout.vue'
import ChoiceChip from '@/components/ChoiceChip.vue'
import ConfirmSheet from '@/components/ConfirmSheet.vue'

const router = useRouter()
const session = useSession()
const rail = useRail()
const store = ref<any>(null)
const closed = ref<number[]>([])
const msg = ref('')
const leaving = ref(false)

onMounted(async () => {
  const r = await api<any>('/store')
  if (r.ok) {
    store.value = r.data
    closed.value = r.data.closedDays ?? []
  }
})
async function setPush(on: boolean) {
  msg.value = ''
  if (on) {
    const s = await subscribePush(session.config.vapidPublicKey)
    if (s !== 'ok') msg.value = s === 'denied' ? '알림 권한이 꺼져 있어요. 경보는 앱 안에서 보여 드려요.' : '이 환경에서는 알림을 보낼 수 없어요. 경보는 앱 안에서 보여 드려요.'
  }
  await api('/store/alert-settings', { method: 'PATCH', body: { pushEnabled: on } })
  store.value.alertPushEnabled = on
}
async function setAnon(on: boolean) {
  await api('/consents', { method: 'POST', body: { consentItemCode: 'anon_stats', agreed: on } })
  store.value.anonStatsAgreed = on
  rail.refresh()
}
async function saveClosed() {
  const r = await api('/store/closed-days', { method: 'PUT', body: { daysOfWeek: closed.value } })
  msg.value = r.ok ? '쉬는 요일을 저장했어요.' : errorText(r)
}
async function logout() {
  await session.logout()
  router.push('/')
}
async function withdraw() {
  leaving.value = false
  const r = await api('/account', { method: 'DELETE' })
  if (!r.ok) return (msg.value = errorText(r))
  await clearLocal()
  session.$reset()
  router.push('/')
}
</script>

<template>
  <OwnerLayout title="설정" :rail="null">
    <h2 class="h">설정</h2>
    <div v-if="store" class="set-grid">
      <section class="card stack">
        <h4>가게</h4>
        <p>{{ store.regionName }} · {{ store.businessTypeName }}</p>
        <p class="small muted">업종·지역 바꾸기는 아직 지원하지 않아요.</p>
      </section>
      <section class="card stack">
        <h4>쉬는 요일</h4>
        <div class="row"><ChoiceChip v-for="d in 7" :key="d" :label="DOW[d]" :selected="closed.includes(d)" @toggle="closed = closed.includes(d) ? closed.filter((x) => x !== d) : [...closed, d]" /></div>
        <button type="button" class="sec" @click="saveClosed">저장</button>
      </section>
      <section class="card stack">
        <h4>경보 알림</h4>
        <label class="check"><input type="checkbox" :checked="store.alertPushEnabled" @change="setPush(($event.target as HTMLInputElement).checked)" /> 장사 흐름이 조용해지면 알림으로 알려 주세요</label>
        <p class="small muted">끄면 경보는 앱 안에서만 보여 드려요.</p>
      </section>
      <section class="card stack">
        <h4>동네 익명 통계 참여</h4>
        <label class="check"><input type="checkbox" :checked="store.anonStatsAgreed" @change="setAnon(($event.target as HTMLInputElement).checked)" /> 내 기록을 같은 동네 익명 묶음에 보태요</label>
        <p class="small muted">그만두면 이후 동네 묶음에서 바로 빠져요. 비교 화면은 다시 동의해야 볼 수 있어요.</p>
      </section>
    </div>
    <p v-if="msg" role="status">{{ msg }}</p>
    <button type="button" class="sec" @click="logout">로그아웃</button>
    <button type="button" class="link-btn danger" @click="leaving = true">탈퇴하기</button>

    <ConfirmSheet
      :open="leaving"
      title="탈퇴하기"
      check-label="모든 기록이 바로 지워지는 것을 확인했어요"
      confirm-label="탈퇴"
      cancel-label="그만두기"
      reason="확인 체크를 해 주세요"
      @confirm="withdraw"
      @cancel="leaving = false"
    >
      <p>계정, 가게 정보, 모든 장사 기록, 경보, 보고서 이력이 바로 지워지고 되돌릴 수 없어요. 이 기기에 남은 기록도 지워요.</p>
    </ConfirmSheet>
  </OwnerLayout>
</template>

<style scoped>
.h { font-size: 22px; font-weight: 600; }
.set-grid { display: flex; flex-direction: column; gap: var(--s-lg); }
@media (min-width: 744px) { .set-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
.stack { display: flex; flex-direction: column; gap: var(--s-sm); }
.check { display: flex; gap: var(--s-sm); align-items: flex-start; min-height: 44px; }
.check input { width: 22px; height: 22px; accent-color: var(--ink); flex: none; margin-top: 2px; }
.sec { align-self: flex-start; min-height: 44px; padding: 0 16px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-card); color: var(--ink); font-weight: 600; }
.danger { color: var(--error); align-self: flex-start; }
</style>
