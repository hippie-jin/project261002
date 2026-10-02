<!-- S5 동네 흐름 비교 (T079, US6) — 동네 익명 묶음과 내 가게를 나란히. 순위·가게 수 없음(BR-HRH-15) -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useRail } from '@/stores/rail'
import { useRecords } from '@/stores/records'
import { gateCopy } from '@/gates/copy'
import { DOW, WEATHER } from '@/labels'
import { addDays, todayKst } from '@/lib/dates'
import { combine, combineByDim, type Cell } from '@/analysis/anonCombine'
import { S } from '@/analysis/sentences'
import { overallConfidence, subgroupConfidence } from '@/analysis/confidence'
import { ratios } from '@/analysis/patterns'
import OwnerLayout from '@/layouts/OwnerLayout.vue'
import GateBlock from '@/components/GateBlock.vue'
import ReasonButton from '@/components/ReasonButton.vue'
import TrendCard from '@/components/TrendCard.vue'
import ConfirmSheet from '@/components/ConfirmSheet.vue'

const router = useRouter()
const rail = useRail()
const recordsStore = useRecords()
const store = ref<any>(null)
const period = ref<'this_week' | 'this_month'>('this_week')
const dim = ref<'overall' | 'dow' | 'weather'>('overall')
const result = ref<any>(null)
const blocked = ref<'G4' | 'G5' | null>(null)
const error = ref('')
const loading = ref(false)
const sheet = ref(false)
const mine = ref<any[]>([])
const minRecords = ref<number | null>(null)

onMounted(async () => {
  const [s, g] = await Promise.all([api<any>('/store'), api<any>('/gates/g3')])
  if (s.ok) store.value = s.data
  if (g.ok) minRecords.value = g.data.minRecords
  if (s.ok && !s.data.anonStatsAgreed) blocked.value = 'G4'
  else await run()
})

async function run() {
  loading.value = true
  error.value = ''
  const r = await api<any>(`/compare?period=${period.value}&dim=${dim.value}`)
  loading.value = false
  if (r.ok) {
    blocked.value = null
    result.value = r.data
    const { records } = await recordsStore.range(r.data.period.from, todayKst())
    mine.value = records
    return
  }
  result.value = null
  if (r.kind === 'gate') blocked.value = r.gate as 'G4' | 'G5'
  else error.value = errorText(r)
}
async function agree() {
  sheet.value = false
  await api('/consents', { method: 'POST', body: { consentItemCode: 'anon_stats', agreed: true } })
  store.value = { ...store.value, anonStatsAgreed: true }
  rail.refresh()
  await run()
}

const who = computed(() => (store.value ? `${store.value.regionName.replace('(샘플)', '')} ${store.value.businessTypeName.replace('(샘플)', '')} 가게들` : '우리 동네'))
const neighbor = computed(() => (result.value ? combine(result.value.cells as Cell[]) : null))
const myRatio = computed(() => ({ good: ratios.goodRatio(mine.value), few: ratios.fewRatio(mine.value) }))
// 비교 기간(이번 주·이번 달) 안의 내 기록 신뢰도 — 전체 기록이 분석 기준 미만이면 '기록 부족'(UC5 E2)
const myConf = computed(() => (overallConfidence(rail.recordCount, minRecords.value) === 'insufficient' ? 'insufficient' : subgroupConfidence(mine.value.length)))
const dims = computed(() => {
  if (!result.value || dim.value === 'overall') return []
  return combineByDim(result.value.cells as Cell[])
    .sort((a, b) => a.dimValue.localeCompare(b.dimValue))
    .map((d) => ({ ...d, label: dim.value === 'dow' ? `${DOW[Number(d.dimValue)]}요일` : (WEATHER[d.dimValue] ?? d.dimValue) }))
})
function setDim(d: typeof dim.value) {
  dim.value = d
  run()
}
function setPeriod(p: typeof period.value) {
  period.value = p
  run()
}
</script>

<template>
  <OwnerLayout title="동네 흐름 비교" rail="compare">
    <section class="cond card">
      <div><span class="field-label">지역</span><p>{{ store?.regionName ?? '…' }}</p></div>
      <div><span class="field-label">업종</span><p>{{ store?.businessTypeName ?? '…' }}</p></div>
      <div>
        <span class="field-label">기간</span>
        <select class="input sm" :value="period" :disabled="blocked === 'G4'" aria-label="기간" @change="setPeriod(($event.target as HTMLSelectElement).value as any)">
          <option value="this_week">이번 주</option>
          <option value="this_month">이번 달</option>
        </select>
      </div>
    </section>

    <template v-if="blocked === 'G4'">
      <ReasonButton disabled :reason="gateCopy('G4').buttonReason" block>비교 보기</ReasonButton>
      <GateBlock gate="G4" action-label="익명 참여 동의하기" @action="sheet = true" />
      <p class="small muted">내 기록은 다른 가게에 이름 없이 묶음으로만 쓰여요.</p>
    </template>

    <template v-else-if="blocked === 'G5'">
      <div class="tabs" role="tablist">
        <button v-for="d in (['overall', 'dow', 'weather'] as const)" :key="d" type="button" role="tab" class="tab" aria-disabled="true">{{ { overall: '전체', dow: '요일별', weather: '날씨별' }[d] }}<span class="sr-only"> (비활성)</span></button>
      </div>
      <GateBlock gate="G5" />
      <p class="muted">그동안 내 가게 흐름은 패턴 탭에서 볼 수 있어요.</p>
      <button type="button" class="sec" @click="router.push('/pattern')">내 가게 흐름 보기</button>
    </template>

    <template v-else-if="result && neighbor">
      <div class="tabs" role="tablist" aria-label="관점">
        <button v-for="d in (['overall', 'dow', 'weather'] as const)" :key="d" type="button" role="tab" class="tab" :class="{ on: dim === d }" :aria-selected="dim === d" @click="setDim(d)">
          {{ { overall: '전체', dow: '요일별', weather: '날씨별' }[d] }}
        </button>
      </div>
      <div class="side">
        <TrendCard
          :label="`동네 익명 묶음 · ${period === 'this_week' ? '이번 주' : '이번 달'}`"
          :sentence="S.anon(who, neighbor.goodRatio, neighbor.fewRatio)"
          :evidence="S.anonEvidence(neighbor.goodRatio, neighbor.fewRatio)"
          :confidence="subgroupConfidence(neighbor.nRecords)"
          :show-note="false"
        />
        <TrendCard
          label="내 가게 · 같은 기간"
          :sentence="mine.length ? S.anon('우리 가게', myRatio.good, myRatio.few) : '이 기간에는 아직 기록이 없어요'"
          :evidence="mine.length ? `기록 ${mine.length}일 · ` + S.anonEvidence(myRatio.good, myRatio.few).replace(' (익명 묶음, 참고 정보)', '') : ''"
          :confidence="myConf"
          :show-note="false"
        />
      </div>
      <ul v-if="dims.length" class="dims">
        <li v-for="d in dims" :key="d.dimValue" class="card">
          <b>{{ d.label }}</b>
          <span class="muted small">{{ S.anonEvidence(d.goodRatio, d.fewRatio) }}</span>
        </li>
      </ul>
      <p class="note">참고 정보예요 - 순위나 다른 가게의 개별 값은 보여 드리지 않아요. 사장님 경험과 함께 판단해 주세요.</p>
    </template>

    <template v-else-if="error">
      <p class="err" role="alert">{{ error }}</p>
      <button type="button" class="sec" @click="run">다시 시도</button>
    </template>
    <p v-else-if="loading" class="muted">동네 흐름을 불러오는 중이에요…</p>

    <ConfirmSheet
      :open="sheet"
      title="익명 통계 참여"
      check-label="내 기록을 동네 익명 묶음에 보태는 데 동의해요"
      confirm-label="동의"
      cancel-label="다음에"
      reason="동의 체크를 해 주세요"
      @confirm="agree"
      @cancel="sheet = false"
    >
      <p>같은 동네 같은 업종 가게들의 기록을 이름 없이 묶어서만 써요. 어느 가게인지, 몇 등인지는 누구에게도 보여 주지 않아요. 언제든 설정에서 그만둘 수 있어요.</p>
    </ConfirmSheet>
  </OwnerLayout>
</template>

<style scoped>
.cond { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: var(--s-sm); padding: var(--s-base); border-radius: var(--r-xl); }
.cond p { font-weight: 600; }
.input.sm { height: 44px; }
.tabs { display: flex; gap: var(--s-lg); border-bottom: 1px solid var(--hairline); }
.tab { background: none; border: none; border-bottom: 2px solid transparent; min-height: 48px; font-size: 16px; font-weight: 600; color: var(--muted); }
.tab.on { color: var(--ink); border-bottom-color: var(--ink); }
.tab[aria-disabled='true'] { color: var(--muted-soft); cursor: not-allowed; }
.side { display: grid; gap: var(--s-base); }
@media (min-width: 744px) {
  .side { grid-template-columns: 1fr 1fr; align-items: start; } /* 동네 · 내 가게 나란히 */
  .dims { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cond { max-width: 760px; }
}
@media (min-width: 1128px) {
  .dims { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.dims { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-sm); }
.dims li { display: flex; justify-content: space-between; gap: var(--s-sm); padding: var(--s-base); flex-wrap: wrap; }
.note { color: var(--muted); font-size: 14px; }
.sec { align-self: flex-start; min-height: 44px; padding: 0 16px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-card); color: var(--ink); font-weight: 600; }
.err { color: var(--error); }
@media (max-width: 420px) { .cond { grid-template-columns: 1fr 1fr; } }
</style>
