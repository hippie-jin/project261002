<!-- S2 오늘 기록 (T057, US2) + 저장 후 하락 판정(T074, US5) -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useRecords } from '@/stores/records'
import { useRail } from '@/stores/rail'
import { gateCopy } from '@/gates/copy'
import { CUSTOMER, MOOD, WEATHER, dateLabel } from '@/labels'
import { addDays, todayKst } from '@/lib/dates'
import { judgeDecline } from '@/analysis/decline'
import OwnerLayout from '@/layouts/OwnerLayout.vue'
import ChoiceButton from '@/components/ChoiceButton.vue'
import ChoiceChip from '@/components/ChoiceChip.vue'
import ReasonButton from '@/components/ReasonButton.vue'
import MoodMark from '@/components/MoodMark.vue'
import DataStatusTag from '@/components/DataStatusTag.vue'
import AlertCard from '@/components/AlertCard.vue'

type Mood = 'good' | 'normal' | 'bad'
type Cust = 'many' | 'usual' | 'few'
const route = useRoute()
const router = useRouter()
const records = useRecords()
const rail = useRail()

const date = computed(() => {
  const q = String(route.query.date ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= todayKst() ? q : todayKst()
})
const isToday = computed(() => date.value === todayKst())
const opts = ref<{ events: Array<{ code: string; label: string }>; salesBands: Array<{ code: string; label: string }> }>({ events: [], salesBands: [] })
const mood = ref<Mood | null>(null)
const cust = ref<Cust | null>(null)
const events = ref<string[]>([])
const band = ref<string | null>(null)
const showBand = ref(false)
const existing = ref<any>(null)
const saved = ref<{ state: 'saved' | 'queued'; record?: any } | null>(null)
const saving = ref(false)
const error = ref('')
const alertCard = ref<any>(null)
const gapNotice = ref('')
const touched = ref(false)
watch([mood, cust, events, band], () => (touched.value = true), { deep: true, flush: 'sync' })

async function load() {
  saved.value = null
  alertCard.value = null
  gapNotice.value = ''
  error.value = ''
  touched.value = false
  const forDate = date.value
  const [o, r] = await Promise.all([api<any>('/codes/record-options'), api<any>(`/records/${forDate}`)])
  if (forDate !== date.value) return // 그 사이 날짜가 바뀌었으면 버린다
  if (o.ok) opts.value = o.data
  existing.value = r.ok ? r.data : null
  // 응답이 오기 전에 사장님이 이미 고른 값은 덮어쓰지 않는다(느린 통신에서 선택이 사라지던 결함)
  if (touched.value) return
  mood.value = r.ok ? r.data.dayMood : null
  cust.value = r.ok ? r.data.customerLevel : null
  events.value = r.ok ? [...r.data.eventTypeCodes] : []
  band.value = r.ok ? r.data.salesBandCode : null
  showBand.value = Boolean(band.value)
}
onMounted(load)
watch(date, load)

const missing = computed(() => (!mood.value && !cust.value ? '오늘장사와 손님 수' : !mood.value ? '오늘장사' : !cust.value ? '손님 수' : ''))
function toggle(code: string) {
  events.value = events.value.includes(code) ? events.value.filter((c) => c !== code) : [...events.value, code]
}

async function save() {
  if (!mood.value || !cust.value) return
  saving.value = true
  error.value = ''
  let res: Awaited<ReturnType<typeof records.save>>
  try {
    res = await records.save(date.value, { dayMood: mood.value, customerLevel: cust.value, eventTypeCodes: [...events.value], salesBandCode: band.value })
  } catch {
    saving.value = false
    error.value = '기기에 저장하지 못했어요. 다시 시도해 주세요.'
    return
  }
  saving.value = false
  if (res.state === 'error') return (error.value = errorText(res.result))
  saved.value = res
  rail.refresh()
  if (res.state === 'saved' && isToday.value) checkDecline()
}

/** 저장 직후 하락 판정 — 기기 안에서(BR-HRH-10), 서버는 G3 재검증 */
async function checkDecline() {
  const g = await api<any>('/gates/g3')
  if (!g.ok || g.data.alertWindowDays == null) return
  const from = addDays(todayKst(), -(Math.round(g.data.alertWindowDays) * 2 - 1))
  const { records: recs } = await records.range(from, todayKst())
  const r = judgeDecline(recs, { minRecords: g.data.minRecords, alertWindowDays: g.data.alertWindowDays, alertMinDecline: g.data.alertMinDecline })
  if (r.kind === 'gap') gapNotice.value = `최근 ${r.windowDays}일 중 ${r.recorded}일만 기록했어요. 기록이 이어지면 흐름을 더 잘 볼 수 있어요.`
  if (r.kind === 'decline') {
    const a = await api<any>('/alerts', { method: 'POST', body: { windowStart: r.windowStart, windowEnd: r.windowEnd, trendCode: 'decline', confidenceLevel: r.confidence } })
    if (a.ok) alertCard.value = a.data
  }
}
async function ack() {
  await api(`/alerts/${alertCard.value.alertId}/ack`, { method: 'POST' })
  alertCard.value = { ...alertCard.value, status: 'acknowledged' }
}
async function mute() {
  await api('/store/alert-settings', { method: 'PATCH', body: { pushEnabled: false } })
  await ack()
}
const env = computed(() => saved.value?.record?.env)
</script>

<template>
  <OwnerLayout title="오늘 기록" rail="today">
    <div v-if="saved || alertCard" class="done-layout">
    <section v-if="saved" class="done card float" aria-live="polite">
      <p class="eyebrow">{{ dateLabel(date) }}</p>
      <h2>{{ saved.state === 'queued' ? '기기에 저장했어요' : '오늘 한 장 완료' }}</h2>
      <p class="line"><MoodMark :mood="mood!" /> · 손님 {{ CUSTOMER[cust!] }}</p>
      <p v-if="saved.state === 'queued'"><DataStatusTag kind="pending" /> 연결되면 자동으로 보내요</p>
      <dl v-else class="env">
        <div><dt>날씨</dt><dd><template v-if="env?.weatherStatus === 'ok'">{{ WEATHER[env.weatherCode] ?? env.weatherCode }}</template><DataStatusTag v-else kind="needs_check" /></dd></div>
        <div><dt>공휴일</dt><dd><template v-if="env?.holidayStatus === 'ok'">{{ env.isHoliday ? env.holidayName ?? '공휴일' : '아님' }}</template><DataStatusTag v-else kind="needs_check" /></dd></div>
        <div><dt>매출 구간</dt><dd><template v-if="band">{{ opts.salesBands.find((b) => b.code === band)?.label }}</template><DataStatusTag v-else kind="not_entered" /></dd></div>
      </dl>
      <p v-if="gapNotice" class="muted small">{{ gapNotice }}</p>
      <div class="row">
        <button type="button" class="sec" @click="saved = null">고쳐서 저장</button>
        <button type="button" class="link-btn" @click="router.push('/calendar')">달력에서 보기</button>
      </div>
    </section>
    <AlertCard v-if="alertCard" :alert="alertCard" @evidence="router.push(`/pattern?alert=${alertCard.alertId}`)" @ack="ack" @mute="mute" />
    </div>

    <div v-if="!saved" class="today-layout">
     <div class="form-col">
      <header>
        <h2 class="q">{{ isToday ? '오늘 장사는 어땠나요?' : '이날 장사는 어땠나요?' }}</h2>
        <p class="muted">{{ dateLabel(date) }}<template v-if="isToday"> · 날씨는 저장할 때 붙어요</template></p>
        <p v-if="existing" class="small">이미 기록한 날이에요. 고쳐서 저장할 수 있어요.</p>
      </header>

      <div class="pair">
      <fieldset class="group">
        <legend>오늘장사</legend>
        <div class="grid3">
          <ChoiceButton v-for="m in (['good', 'normal', 'bad'] as const)" :key="m" :label="MOOD[m].label" :sub="MOOD[m].mark" :selected="mood === m" @pick="mood = m" />
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>손님 수</legend>
        <div class="grid3">
          <ChoiceButton v-for="c in (['many', 'usual', 'few'] as const)" :key="c" :label="CUSTOMER[c]" :selected="cust === c" @pick="cust = c" />
        </div>
      </fieldset>
      </div>
      <fieldset class="group">
        <legend>특별한 일 <span class="muted small">(여러 개, 없으면 넘어가요)</span></legend>
        <div class="row">
          <ChoiceChip v-for="e in opts.events" :key="e.code" :label="e.label" :selected="events.includes(e.code)" @toggle="toggle(e.code)" />
        </div>
      </fieldset>
      <div v-if="opts.salesBands.length">
        <button v-if="!showBand" type="button" class="link-btn" @click="showBand = true">매출 구간도 남길래요 (선택)</button>
        <fieldset v-else class="group">
          <legend>매출 구간 <span class="muted small">(선택)</span></legend>
          <div class="row">
            <ChoiceChip v-for="b in opts.salesBands" :key="b.code" :label="b.label" :selected="band === b.code" @toggle="band = band === b.code ? null : b.code" />
          </div>
        </fieldset>
      </div>
     </div>
     <aside class="side-col">
      <div class="side">
        <section class="pick-summary card" aria-label="고른 내용">
          <h4>고른 내용</h4>
          <dl>
            <div><dt>오늘장사</dt><dd><MoodMark v-if="mood" :mood="mood" /><span v-else class="muted">아직 안 골랐어요</span></dd></div>
            <div><dt>손님 수</dt><dd><template v-if="cust">{{ CUSTOMER[cust] }}</template><span v-else class="muted">아직 안 골랐어요</span></dd></div>
            <div><dt>특별한 일</dt><dd>{{ events.length ? opts.events.filter((e) => events.includes(e.code)).map((e) => e.label).join(', ') : '없음' }}</dd></div>
            <div><dt>매출 구간</dt><dd><template v-if="band">{{ opts.salesBands.find((b) => b.code === band)?.label }}</template><span v-else class="muted">입력 안 함 (선택)</span></dd></div>
          </dl>
        </section>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <div class="savebar">
          <ReasonButton :disabled="!!missing" :reason="gateCopy('G2', { field: missing }).buttonReason" :loading="saving" block tall @click="save">
            {{ existing ? '고쳐서 저장' : isToday ? '오늘 기록 저장' : '이날 기록 저장' }}
          </ReasonButton>
        </div>
      </div>
     </aside>
    </div>
  </OwnerLayout>
</template>

<style scoped>
.q { font-size: 22px; font-weight: 600; }
.group { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s-sm); }
legend { font-size: 16px; font-weight: 600; margin-bottom: var(--s-sm); }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-sm); }
.savebar { position: sticky; bottom: 64px; background: var(--canvas); z-index: 5; padding: var(--s-sm) 0; }
.done { display: flex; flex-direction: column; gap: var(--s-sm); }
.eyebrow { font-size: 14px; color: var(--muted); }
.done h2 { font-size: 22px; font-weight: 600; }
.line { font-size: 18px; }
.env { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-sm); margin: 0; }
.env dt { font-size: 13px; color: var(--muted); }
.env dd { margin: 0; font-size: 15px; }
.sec { min-height: 44px; padding: 0 16px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-card); color: var(--ink); font-weight: 600; }
.err { color: var(--error); }
.today-layout, .form-col, .side, .done-layout { display: flex; flex-direction: column; gap: var(--s-lg); }
.pair { display: flex; flex-direction: column; gap: var(--s-lg); }
.pick-summary { display: none; }
.pick-summary dl { margin: var(--s-sm) 0 0; display: grid; gap: var(--s-sm); }
.pick-summary dl div { display: flex; justify-content: space-between; gap: var(--s-base); }
.pick-summary dt { color: var(--muted); font-size: 14px; flex: none; }
.pick-summary dd { margin: 0; text-align: right; }
/* 태블릿: 오늘장사·손님 수 나란히, 저장 바는 화면 아래 */
@media (min-width: 744px) {
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-lg); }
  .savebar { bottom: 0; }
  .done-layout { display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
}
/* 데스크톱: 입력 64% · 요약·저장 패널 32% (스타일가이드 §13) */
@media (min-width: 1128px) {
  .today-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); gap: var(--s-xl); align-items: start; }
  .side { position: sticky; top: var(--s-lg); }
  .pick-summary { display: block; }
  .savebar { position: static; padding: 0; }
}
</style>
