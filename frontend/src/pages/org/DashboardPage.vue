<!-- S7 기관 상권 대시보드 (T087, US8) — 익명 묶음만. 표본 부족 칸은 '표시 불가', 계약 만료(G8)면 전 조작 비활성 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useSession } from '@/stores/session'
import { gateCopy } from '@/gates/copy'
import { DOW, EVENT_LABEL, WEATHER } from '@/labels'
import { addDays, todayKst } from '@/lib/dates'
import { combine, combineByDim, type Cell } from '@/analysis/anonCombine'
import { S } from '@/analysis/sentences'
import { subgroupConfidence } from '@/analysis/confidence'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
import GateBlock from '@/components/GateBlock.vue'
import ReasonButton from '@/components/ReasonButton.vue'
import ConfidenceBadge from '@/components/ConfidenceBadge.vue'
import DataStatusTag from '@/components/DataStatusTag.vue'

const session = useSession()
const router = useRouter()
const me = ref<any>(null)
const tab = ref<'trends' | 'problems' | 'about'>('trends')
const region = ref('')
const bt = ref('')
const days = ref(28)
const dim = ref<'overall' | 'dow' | 'weather' | 'local_event'>('overall')
const data = ref<any>(null)
const problems = ref<any[] | null>(null)
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  const r = await api<any>('/org/me')
  if (r.ok) {
    me.value = r.data
    region.value = r.data.jurisdiction.find((j: any) => !j.parentCode)?.code ?? r.data.jurisdiction[0]?.code ?? ''
    if (r.data.contractValid) await query()
  }
})
const blocked = computed(() => me.value && !me.value.contractValid)
const from = computed(() => addDays(todayKst(), -(days.value - 1)))
const regionName = (code: string) => me.value?.jurisdiction.find((j: any) => j.code === code)?.name ?? code
const btName = (code: string) => (code === '*' ? '업종 전체' : (me.value?.businessTypes.find((b: any) => b.code === code)?.name ?? code))

async function query() {
  loading.value = true
  error.value = ''
  const qs = `region=${region.value}${bt.value ? `&businessType=${bt.value}` : ''}&from=${from.value}&to=${todayKst()}`
  if (tab.value === 'problems') {
    const r = await api<any[]>(`/org/problems?${qs}`)
    loading.value = false
    if (r.ok) problems.value = r.data
    else error.value = r.kind === 'gate' ? gateCopy(r.gate).reason : errorText(r)
    return
  }
  const r = await api<any>(`/org/trends?${qs}&dim=${dim.value}`)
  loading.value = false
  if (r.ok) data.value = r.data
  else error.value = r.kind === 'gate' ? gateCopy(r.gate).reason : errorText(r)
}
const rows = computed(() => {
  if (!data.value) return []
  const out: any[] = []
  for (const r of data.value.regions) {
    const bts = bt.value ? [bt.value] : ['*', ...me.value.businessTypes.map((b: any) => b.code)]
    for (const b of bts) {
      const cells = (data.value.cells as Cell[]).filter((c) => c.regionCode === r.code && c.businessTypeCode === b)
      const suppressed = data.value.suppressed.some((s: any) => s.regionCode === r.code && s.businessTypeCode === b)
      const agg = cells.length ? combine(cells) : null
      out.push({ key: `${r.code}|${b}`, region: r.name, bt: btName(b), parent: !r.parentCode, suppressed: suppressed || !agg, agg, dims: dim.value === 'overall' ? [] : combineByDim(cells) })
    }
  }
  return out
})
const dimLabel = (v: string) => (dim.value === 'dow' ? `${DOW[Number(v)]}` : dim.value === 'weather' ? (WEATHER[v] ?? v) : v === 'event' ? '행사 기간' : '행사 없음')
const goodWord = (r: number) => (r >= 0.5 ? '좋은 날이 많은 편' : r <= 0.2 ? '좋은 날이 적은 편' : '보통')
const fewWord = (r: number) => (r >= 0.4 ? '적은 편' : '평소')
const probRows = computed(() => {
  const g = new Map<string, { code: string; ratios: number[] }>()
  for (const p of problems.value ?? []) {
    const k = `${p.regionCode}|${p.eventTypeCode}`
    g.set(k, { code: p.eventTypeCode, ratios: [...(g.get(k)?.ratios ?? []), p.problemRatio] })
  }
  return [...g.entries()].map(([k, v]) => ({ key: k, region: regionName(k.split('|')[0]), label: EVENT_LABEL[v.code], avg: v.ratios.reduce((a, b) => a + b, 0) / v.ratios.length, weeks: v.ratios.length }))
})
const headline = computed(() => {
  const top = rows.value.find((r) => r.parent && !r.suppressed) ?? rows.value.find((r) => !r.suppressed)
  return top ? S.anon(`${top.region} ${top.bt}`, top.agg.goodRatio, top.agg.fewRatio) : null
})
async function logout() {
  await session.logout()
  router.push('/org/login')
}
function onTab(k: string) {
  tab.value = k as any
  if (!blocked.value && k !== 'about') query()
}
</script>

<template>
  <DesktopLayout
    brand="기관"
    :who="me?.orgName"
    :tabs="[{ key: 'trends', label: '상권 흐름' }, { key: 'problems', label: '반복 문제' }, { key: 'about', label: '이용 안내' }]"
    :active="tab"
    @tab="onTab"
    @logout="logout"
  >
    <p v-if="session.config.publicDemo" class="demo-ribbon">체험용 화면이에요 · 가상의 데이터예요</p>

    <template v-if="blocked">
      <GateBlock gate="G8" />
      <ReasonButton disabled :reason="gateCopy('G8').buttonReason">조회</ReasonButton>
    </template>

    <template v-else-if="tab === 'about'">
      <section class="card">
        <h3>이용 안내</h3>
        <ul>
          <li>모든 수치는 익명 통계 참여에 동의한 가게의 기록을 지역·업종 묶음으로 합친 것이에요.</li>
          <li>참여 가게가 기준보다 적은 칸은 '표시 불가 - 표본 부족'으로 가려요. 합계로 가린 칸을 거꾸로 계산할 수 없도록, 가린 칸이 있는 합계도 함께 가려요.</li>
          <li>개별 가게 기록과 원자료는 제공하지 않아요. 평가·대출·보험 심사 등 소상공인에게 불리한 목적으로 쓸 수 없어요.</li>
          <li>조회할 때마다 조건과 시각이 기록돼요.</li>
        </ul>
      </section>
    </template>

    <template v-else-if="me">
      <section class="bar card">
        <label><span class="field-label">지역</span>
          <select v-model="region" class="input"><option v-for="j in me.jurisdiction" :key="j.code" :value="j.code">{{ j.parentCode ? '　' : '' }}{{ j.name }}{{ j.parentCode ? '' : ' 전체' }}</option></select>
        </label>
        <label><span class="field-label">업종</span>
          <select v-model="bt" class="input"><option value="">전체</option><option v-for="b in me.businessTypes" :key="b.code" :value="b.code">{{ b.name }}</option></select>
        </label>
        <label><span class="field-label">기간</span>
          <select v-model.number="days" class="input"><option :value="7">최근 1주</option><option :value="28">최근 4주</option><option :value="56">최근 8주</option></select>
        </label>
        <ReasonButton :loading="loading" @click="query">조회</ReasonButton>
      </section>

      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <template v-if="tab === 'trends' && data">
        <div class="tabs" role="tablist">
          <button v-for="d in (['overall', 'dow', 'weather', 'local_event'] as const)" :key="d" type="button" role="tab" class="tab" :class="{ on: dim === d }" :aria-selected="dim === d" @click="dim = d; query()">
            {{ { overall: '전체', dow: '요일별', weather: '날씨별', local_event: '지역행사별' }[d] }}
          </button>
        </div>
        <p v-if="headline" class="headline">{{ headline }} - 참고 정보</p>
        <div class="tablewrap">
          <table>
            <thead>
              <tr><th>지역</th><th>업종</th><th>좋은 날 경향</th><th>손님 경향</th><th>신뢰도</th><th v-if="dim !== 'overall'">관점별</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.key" :class="{ parent: r.parent }">
                <td>{{ r.region }}</td>
                <td>{{ r.bt }}</td>
                <template v-if="r.suppressed">
                  <td colspan="3"><DataStatusTag kind="suppressed" /> <span class="sr-only">{{ gateCopy('G5').reason }}</span></td>
                </template>
                <template v-else>
                  <td>{{ goodWord(r.agg.goodRatio) }} <span class="muted small">({{ Math.round(r.agg.goodRatio * 100) }}%)</span></td>
                  <td>{{ fewWord(r.agg.fewRatio) }} <span class="muted small">(적은 날 {{ Math.round(r.agg.fewRatio * 100) }}%)</span></td>
                  <td><ConfidenceBadge :level="subgroupConfidence(r.agg.nRecords)" /></td>
                </template>
                <td v-if="dim !== 'overall'" class="small">
                  <span v-for="d in r.dims" :key="d.dimValue" class="dimv">{{ dimLabel(d.dimValue) }} {{ Math.round(d.goodRatio * 100) }}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="small muted" :title="gateCopy('G5').reason">표시 불가 칸: {{ gateCopy('G5').reason }}</p>
      </template>

      <template v-if="tab === 'problems' && problems">
        <table v-if="probRows.length">
          <thead><tr><th>지역</th><th>현장 문제</th><th>기록 중 비율(주 평균)</th><th>집계 주 수</th></tr></thead>
          <tbody>
            <tr v-for="p in probRows" :key="p.key"><td>{{ p.region }}</td><td>{{ p.label }}</td><td>{{ Math.round(p.avg * 100) }}%</td><td>{{ p.weeks }}</td></tr>
          </tbody>
        </table>
        <p v-else class="muted">공개 가능한 칸에서 되풀이되는 현장 문제가 아직 없어요.</p>
      </template>
      <p class="policy">개별 가게 기록과 원자료는 제공하지 않아요.</p>
    </template>
  </DesktopLayout>
</template>

<style scoped>
.bar { display: grid; grid-template-columns: 2fr 1.5fr 1.2fr auto; gap: var(--s-base); align-items: end; border-radius: var(--r-xl); }
.bar label { display: flex; flex-direction: column; gap: 4px; }
.tabs { display: flex; gap: var(--s-lg); border-bottom: 1px solid var(--hairline); }
.tab { background: none; border: none; border-bottom: 2px solid transparent; min-height: 48px; font-size: 16px; font-weight: 600; color: var(--muted); }
.tab.on { color: var(--ink); border-bottom-color: var(--ink); }
.headline { font-size: 20px; font-weight: 600; }
.tablewrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th { text-align: left; font-size: 12px; letter-spacing: 1.5px; color: var(--muted); font-weight: 600; padding: 10px 12px; border-bottom: 1px solid var(--hairline); }
td { padding: 12px; border-bottom: 1px solid var(--hairline-soft); vertical-align: middle; }
tr.parent td { font-weight: 600; color: var(--ink); background: var(--surface-card); }
.dimv { display: inline-block; margin-right: 10px; }
.policy { color: var(--muted); font-size: 14px; }
.err { color: var(--error); }
ul { padding-left: 20px; color: var(--body); line-height: 1.7; }
@media (max-width: 900px) { .bar { grid-template-columns: 1fr 1fr; } }
</style>
