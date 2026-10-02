<!-- S4 장사 달력 (T060, US3) — 게이트 없음. 빈 날·확인 필요·전송 대기를 서로 다른 표지로(U4) -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useRecords } from '@/stores/records'
import { CUSTOMER, EVENT_LABEL, WEATHER, dateLabel } from '@/labels'
import { monthDays, shiftMonth, todayKst, dowOf } from '@/lib/dates'
import { S } from '@/analysis/sentences'
import OwnerLayout from '@/layouts/OwnerLayout.vue'
import CalendarGrid from '@/components/CalendarGrid.vue'
import MoodMark from '@/components/MoodMark.vue'
import DataStatusTag from '@/components/DataStatusTag.vue'

const route = useRoute()
const router = useRouter()
const recordsStore = useRecords()
const highlight = computed(() => (route.query.highlight ? String(route.query.highlight).split(',') : []))
const month = ref((highlight.value[0] ?? todayKst()).slice(0, 7))
const byDate = ref<Record<string, any>>({})
const fromCache = ref(false)
const closedDays = ref<number[] | null>(null)
const selected = ref<string | null>(null)
const summary = ref<any>(null)
const showSummary = ref(false)
const bands = ref<Record<string, string>>({})

async function load() {
  const days = monthDays(month.value)
  const { records, fromCache: fc, pending } = await recordsStore.range(days[0], days[days.length - 1])
  const map: Record<string, any> = {}
  for (const r of records) map[r.recordDate] = r
  for (const [d, body] of Object.entries(pending)) map[d] = { ...body, recordDate: d, pending: true }
  byDate.value = map
  fromCache.value = fc
  summary.value = null
  showSummary.value = false
}
onMounted(async () => {
  const [s, o] = await Promise.all([api<any>('/store'), api<any>('/codes/record-options')])
  if (s.ok) closedDays.value = s.data.closedDays
  if (o.ok) bands.value = Object.fromEntries(o.data.salesBands.map((b: any) => [b.code, b.label]))
  await load()
})
watch(month, load)

function pick(d: string) {
  if (!byDate.value[d] && !closedDays.value?.includes(dowOf(d))) return router.push(`/today?date=${d}`) // 빈 날 → 그 날짜로 기록(UC4 A1)
  selected.value = d
}
async function openSummary() {
  const r = await api<any>(`/records/months/${month.value}/summary`)
  if (r.ok) summary.value = r.data
  showSummary.value = true
}
const sel = computed(() => (selected.value ? byDate.value[selected.value] : null))
const empty = computed(() => Object.keys(byDate.value).length === 0)
const monthTitle = computed(() => `${month.value.slice(0, 4)}년 ${Number(month.value.slice(5))}월`)
</script>

<template>
  <OwnerLayout title="장사 달력" :rail="null">
    <p v-if="fromCache" class="small muted" role="status">연결이 없어 기기에 있는 기록으로 보여 드려요 · 최신 아닐 수 있어요</p>
    <div class="cal-layout">
    <div class="cal-col">
    <div class="monthnav">
      <button type="button" class="round" aria-label="이전 달" @click="month = shiftMonth(month, -1)">‹</button>
      <h2>{{ monthTitle }}</h2>
      <button type="button" class="round" aria-label="다음 달" :disabled="month >= todayKst().slice(0, 7)" @click="month = shiftMonth(month, 1)">›</button>
    </div>
    <CalendarGrid :month="month" :records="byDate" :closed-days="closedDays" :selected="selected" :highlight="highlight" @pick="pick" />
    <p class="legend small muted">● 좋음 · ○ 보통 · – 나쁨 · 쉼 = 쉬는 요일 · 점(·) = 기록 안 한 날</p>
    </div>
    <aside class="side-col">
    <section v-if="!sel && !(empty && !fromCache)" class="card hint desk-only">
      <h4>날짜를 눌러 보세요</h4>
      <p class="muted">기록한 날은 그날의 한 장을, 기록 안 한 날은 그 날짜 기록 화면을 열어요.</p>
    </section>

    <section v-if="empty && !fromCache" class="card">
      <h4>오늘부터 한 장씩 채워보세요</h4>
      <p class="muted">이 달에는 아직 기록이 없어요.</p>
      <button type="button" class="sec" @click="router.push('/today')">오늘 기록하러 가기</button>
    </section>

    <section v-if="sel" class="card float detail" aria-live="polite">
      <h4>{{ dateLabel(selected!) }} · <MoodMark :mood="sel.dayMood" /> · 손님 {{ CUSTOMER[sel.customerLevel as 'many'] }}</h4>
      <p v-if="sel.pending"><DataStatusTag kind="pending" /></p>
      <p>특별한 일: {{ sel.eventTypeCodes?.length ? sel.eventTypeCodes.map((c: string) => EVENT_LABEL[c]).join(', ') : '없음' }}</p>
      <dl v-if="!sel.pending" class="env">
        <div><dt>날씨</dt><dd><template v-if="sel.env.weatherStatus === 'ok'">{{ WEATHER[sel.env.weatherCode] ?? sel.env.weatherCode }}</template><DataStatusTag v-else kind="needs_check" /></dd></div>
        <div><dt>공휴일</dt><dd><template v-if="sel.env.holidayStatus === 'ok'">{{ sel.env.isHoliday ? sel.env.holidayName ?? '공휴일' : '아님' }}</template><DataStatusTag v-else kind="needs_check" /></dd></div>
        <div><dt>지역행사</dt><dd><template v-if="sel.env.localEventStatus === 'ok'">{{ sel.env.localEventName ?? '없음' }}</template><DataStatusTag v-else kind="needs_check" /></dd></div>
        <div><dt>매출 구간</dt><dd><template v-if="sel.salesBandCode">{{ bands[sel.salesBandCode] ?? sel.salesBandCode }}</template><DataStatusTag v-else kind="not_entered" /></dd></div>
      </dl>
      <button type="button" class="sec" @click="router.push(`/today?date=${selected}`)">기록 고치기</button>
    </section>

    <button v-if="!showSummary" type="button" class="sec" @click="openSummary">이번 달 요약 보기</button>
    <section v-else-if="summary" class="card">
      <h4>{{ S.monthSummary(summary.goodDays, summary.normalDays, summary.badDays) }}</h4>
      <p class="muted">기록한 날 {{ summary.recordedDays }}일<template v-if="summary.topEvents.length"> · 자주 있던 일: {{ summary.topEvents.map((e: any) => `${EVENT_LABEL[e.code]} ${e.count}번`).join(', ') }}</template></p>
    </section>
    </aside>
    </div>
  </OwnerLayout>
</template>

<style scoped>
.monthnav { display: flex; align-items: center; justify-content: space-between; }
.monthnav h2 { font-size: 20px; font-weight: 600; }
.round { width: 40px; height: 40px; border-radius: var(--r-full); border: 0; background: var(--surface-card); color: var(--ink); font-size: 20px; }
.round:disabled { color: var(--muted-soft); }
.detail { display: flex; flex-direction: column; gap: var(--s-sm); }
.env { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-sm); margin: 0; }
.env dt { font-size: 13px; color: var(--muted); }
.env dd { margin: 0; }
.sec { align-self: flex-start; min-height: 44px; padding: 0 16px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-card); color: var(--ink); font-weight: 600; }
.legend { margin-top: calc(-1 * var(--s-sm)); }
.cal-layout, .cal-col, .side-col { display: flex; flex-direction: column; gap: var(--s-lg); }
.desk-only { display: none; }
/* 태블릿: 달력과 상세 패널 2열, 데스크톱: 64% · 32% (스타일가이드 §13) */
@media (min-width: 744px) {
  .cal-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr); gap: var(--s-xl); align-items: start; }
  .side-col { position: sticky; top: var(--s-lg); }
  .desk-only { display: block; }
}
@media (min-width: 1128px) {
  .cal-layout { grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); }
  .cal-col :deep(.blank), .cal-col :deep(.day) { min-height: 84px; }
  .cal-col :deep(.num) { width: 48px; height: 48px; font-size: 16px; }
}
</style>
