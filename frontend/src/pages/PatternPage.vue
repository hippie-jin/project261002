<!-- S3 우리 가게 흐름 (T066, US4) + 경보 상세(T075, US5) — 분석은 기기 안에서(analysis/*) -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useRecords } from '@/stores/records'
import { useRail } from '@/stores/rail'
import { DOW, EVENT_KIND, EVENT_LABEL } from '@/labels'
import { addDays, todayKst } from '@/lib/dates'
import { byDow, byEvents, byProblems, byWeather, summary, type Finding, type Rec } from '@/analysis/patterns'
import OwnerLayout from '@/layouts/OwnerLayout.vue'
import GateBlock from '@/components/GateBlock.vue'
import TrendCard from '@/components/TrendCard.vue'
import ConfidenceBadge from '@/components/ConfidenceBadge.vue'
import AlertCard from '@/components/AlertCard.vue'
import ChoiceChip from '@/components/ChoiceChip.vue'
import ConfirmSheet from '@/components/ConfirmSheet.vue'

const route = useRoute()
const router = useRouter()
const recordsStore = useRecords()
const rail = useRail()
const gate = ref<{ pass: boolean; recordCount: number; minRecords: number | null } | null>(null)
const recs = ref<Rec[]>([])
const tab = ref<'dow' | 'weather' | 'event' | 'problem'>('dow')
const eventCode = ref<string | null>(null)
const alerts = ref<any[]>([])
const store = ref<any>(null)
const askClosed = ref(false)
const closedPick = ref<number[]>([])

onMounted(async () => {
  const [g, a, s] = await Promise.all([api<any>('/gates/g3?screen=S3'), api<any[]>('/alerts'), api<any>('/store')])
  if (g.ok) gate.value = g.data
  if (s.ok) store.value = s.data
  if (a.ok) {
    const focus = Number(route.query.alert)
    alerts.value = a.data.filter((x) => x.status === 'new' || x.alertId === focus).slice(0, 1)
  }
  if (g.ok && g.data.pass) {
    const { records } = await recordsStore.range(addDays(todayKst(), -365), todayKst())
    recs.value = records
  }
})

const tabs = [
  { key: 'dow', label: '요일별' },
  { key: 'weather', label: '날씨별' },
  { key: 'event', label: '특별한 일' },
  { key: 'problem', label: '반복 문제' },
] as const
const sum = computed<Finding | null>(() => (recs.value.length ? summary(recs.value, gate.value?.minRecords ?? null) : null))
const weather = computed(() => byWeather(recs.value))
const activityCodes = computed(() => Object.keys(EVENT_KIND).filter((c) => EVENT_KIND[c] === 'activity' && recs.value.some((r) => r.eventTypeCodes.includes(c))))
const findings = computed<Finding[]>(() => {
  if (!recs.value.length) return []
  if (tab.value === 'dow') return [byDow(recs.value)]
  if (tab.value === 'weather') return weather.value.hidden ? [] : [weather.value]
  if (tab.value === 'event') return byEvents(recs.value, eventCode.value ?? undefined)
  return byProblems(recs.value)
})

function selectTab(k: typeof tab.value) {
  if (!gate.value?.pass) return
  if (k === 'dow' && store.value && store.value.closedDays === null) askClosed.value = true // UC3 A1
  tab.value = k
}
async function saveClosed() {
  await api('/store/closed-days', { method: 'PUT', body: { daysOfWeek: closedPick.value } })
  store.value = { ...store.value, closedDays: closedPick.value }
  askClosed.value = false
}
const evidence = (f: Finding) => router.push({ path: '/calendar', query: { highlight: f.dates.slice(-31).join(',') } })
async function ack(a: any) {
  await api(`/alerts/${a.alertId}/ack`, { method: 'POST' })
  a.status = 'acknowledged'
  rail.refresh()
}
async function mute(a: any) {
  await api('/store/alert-settings', { method: 'PATCH', body: { pushEnabled: false } })
  await ack(a)
}
function alertEvidence(a: any) {
  const dates: string[] = []
  for (let d = a.windowStart; d <= a.windowEnd; d = addDays(d, 1)) dates.push(d)
  router.push({ path: '/calendar', query: { highlight: dates.join(',') } })
}
</script>

<template>
  <OwnerLayout title="우리 가게 흐름" rail="pattern">
    <div v-if="alerts.length" class="alerts">
      <AlertCard v-for="a in alerts" :key="a.alertId" :alert="a" @evidence="alertEvidence(a)" @ack="ack(a)" @mute="mute(a)" />
    </div>

    <div class="tabs" role="tablist" aria-label="관점">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === t.key }"
        :aria-selected="tab === t.key"
        :aria-disabled="!gate?.pass"
        @click="selectTab(t.key)"
      >
        {{ t.label }}<span v-if="gate && !gate.pass" class="sr-only"> (비활성)</span>
      </button>
    </div>

    <template v-if="gate && !gate.pass">
      <GateBlock gate="G3" :record-count="gate.recordCount" :min-records="gate.minRecords" action-label="오늘 기록하러 가기" @action="router.push('/today')" />
      <p class="row"><ConfidenceBadge level="insufficient" /> <span class="muted">지금까지 {{ gate.recordCount }}일 기록했어요</span></p>
    </template>

    <template v-else-if="gate && sum">
      <div v-if="tab === 'event' && activityCodes.length" class="row">
        <ChoiceChip label="전체" :selected="!eventCode" @toggle="eventCode = null" />
        <ChoiceChip v-for="c in activityCodes" :key="c" :label="EVENT_LABEL[c]" :selected="eventCode === c" @toggle="eventCode = c" />
      </div>
      <div class="cards">
      <TrendCard :label="sum.label" :sentence="sum.sentence" :evidence="sum.evidence" :confidence="sum.confidence" />
      <TrendCard
        v-for="f in findings"
        :key="f.key"
        :label="f.label"
        :sentence="f.sentence"
        :evidence="f.evidence"
        :confidence="f.confidence"
        :evidence-action="f.dates.length > 0"
        @evidence="evidence(f)"
      />
      </div>
      <p v-if="tab === 'weather' && weather.hidden" class="muted">비 온 날 기록이 아직 적어 날씨별 흐름은 보여 드리지 않아요 (표본 부족)</p>
      <p v-if="tab === 'weather' && weather.excluded" class="small muted">제외된 날: 날씨 확인 필요 {{ weather.excluded }}일</p>
      <p v-if="tab === 'event' && !findings.length" class="muted">특별한 일이 있던 날이 아직 적어요.</p>
    </template>
    <p v-else-if="gate" class="muted">기록을 불러오는 중이에요…</p>

    <RouterLink to="/paid" class="paid-link">상세보고서 받기 (유료)</RouterLink>

    <ConfirmSheet
      :open="askClosed"
      title="쉬는 요일을 알려 주세요"
      check-label="쉬는 요일을 확인했어요 (없으면 그대로 체크)"
      confirm-label="저장"
      cancel-label="나중에"
      reason="확인 체크를 해 주세요"
      @confirm="saveClosed"
      @cancel="askClosed = false"
    >
      <p class="small">요일별 흐름을 볼 때 쉬는 날을 빼고 계산해요.</p>
      <div class="row" style="margin-top: 8px">
        <ChoiceChip v-for="d in 7" :key="d" :label="DOW[d]" :selected="closedPick.includes(d)" @toggle="closedPick = closedPick.includes(d) ? closedPick.filter((x) => x !== d) : [...closedPick, d]" />
      </div>
    </ConfirmSheet>
  </OwnerLayout>
</template>

<style scoped>
.tabs { display: flex; gap: var(--s-lg); border-bottom: 1px solid var(--hairline); overflow-x: auto; }
.tab { background: none; border: none; border-bottom: 2px solid transparent; min-height: 48px; font-size: 16px; font-weight: 600; color: var(--muted); white-space: nowrap; padding: 0 2px; }
.tab.on { color: var(--ink); border-bottom-color: var(--ink); }
.tab[aria-disabled='true'] { color: var(--muted-soft); cursor: not-allowed; }
.paid-link { font-size: 14px; min-height: 44px; display: inline-flex; align-items: center; }
.cards, .alerts { display: flex; flex-direction: column; gap: var(--s-base); }
/* 태블릿 2열 · 데스크톱 3열 카드 (스타일가이드 §13 — 행을 다시 배치하지 않고 열 수만 늘린다) */
@media (min-width: 744px) {
  .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-base); align-items: start; }
  .alerts { max-width: 760px; }
}
@media (min-width: 1128px) {
  .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
