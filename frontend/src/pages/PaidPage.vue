<!-- S6 더 자세히(유료) (T083, US7) — 결제(G6) → 기간 보고서(G3) → 포함 정보 확인(G7) → 받기 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, errorText } from '@/api/client'
import { useRecords } from '@/stores/records'
import { gateCopy } from '@/gates/copy'
import { dateLabel } from '@/labels'
import { addDays, todayKst } from '@/lib/dates'
import { buildReport } from '@/analysis/report'
import OwnerLayout from '@/layouts/OwnerLayout.vue'
import GateBlock from '@/components/GateBlock.vue'
import ReasonButton from '@/components/ReasonButton.vue'
import ConfidenceBadge from '@/components/ConfidenceBadge.vue'

const recordsStore = useRecords()
const kind = ref<'report' | 'backup'>('report')
const ents = ref<string[]>([])
const exports = ref<any[]>([])
const paying = ref(false)
const payBlocked = ref(false)
const simulate = ref<'success' | 'failed' | 'canceled'>('success')
const periodDays = ref(28)
const g3 = ref<{ pass: boolean; recordCount: number; minRecords: number | null } | null>(null)
const building = ref(false)
const msg = ref('')
const current = ref<any>(null)
const confirmCheck = ref(false)

const feature = computed(() => (kind.value === 'report' ? 'report' : 'backup_export'))
const hasEnt = computed(() => ents.value.includes(feature.value))
const pEnd = computed(() => addDays(todayKst(), -1))
const pStart = computed(() => addDays(pEnd.value, -(periodDays.value - 1)))

async function load() {
  const [e, x] = await Promise.all([api<any[]>('/paid/entitlements'), api<any[]>('/paid/exports')])
  if (e.ok) ents.value = e.data.map((r) => r.featureCode)
  if (x.ok) {
    exports.value = x.data
    current.value = x.data.find((r) => r.status === 'generated') ?? null
    confirmCheck.value = Boolean(current.value?.confirmedAt)
  }
  await checkG3()
}
async function checkG3() {
  const r = await api<any>(`/gates/g3?from=${pStart.value}&to=${pEnd.value}&screen=S6`)
  if (r.ok) g3.value = r.data
}
onMounted(load)

async function pay() {
  paying.value = true
  msg.value = ''
  const r = await api('/paid/payments', { method: 'POST', body: { featureCode: feature.value, simulate: simulate.value } })
  paying.value = false
  payBlocked.value = !r.ok
  if (!r.ok && r.kind !== 'gate') msg.value = errorText(r)
  await load()
}

async function create() {
  building.value = true
  msg.value = ''
  let body: any
  if (kind.value === 'report') {
    const { records } = await recordsStore.range(pStart.value, pEnd.value)
    const rep = buildReport(records, g3.value?.minRecords ?? null)
    body = { exportKind: 'report', periodStart: pStart.value, periodEnd: pEnd.value, recordCountSnapshot: records.length, confidenceSnapshot: rep.confidence, reportBody: rep.body }
  } else {
    const { records } = await recordsStore.range('2000-01-01', todayKst())
    body = { exportKind: 'backup', recordCountSnapshot: records.length }
  }
  const r = await api<any>('/paid/exports', { method: 'POST', body })
  building.value = false
  if (!r.ok) return (msg.value = r.kind === 'gate' ? gateCopy(r.gate).reason : errorText(r))
  current.value = r.data
  confirmCheck.value = false
}
async function confirmAndDownload() {
  if (!current.value) return
  await api(`/paid/exports/${current.value.exportId}/confirm`, { method: 'POST' })
  window.location.href = `/api/paid/exports/${current.value.exportId}/file` // 서버가 G7 을 다시 확인하고 전달 처리
  setTimeout(load, 1500)
}
async function decline() {
  await api(`/paid/exports/${current.value.exportId}/decline`, { method: 'POST' })
  current.value = null
  await load()
}
const conf = (c: string | null) => (c ?? 'insufficient') as any
</script>

<template>
  <OwnerLayout title="더 자세히" :rail="null">
    <div class="narrow">
    <h2 class="h">더 자세히 (유료)</h2>
    <fieldset class="group">
      <label class="radio"><input v-model="kind" type="radio" value="report" /> 상세보고서 받기</label>
      <label class="radio"><input v-model="kind" type="radio" value="backup" /> 기록 백업 · 내보내기</label>
    </fieldset>
    <p class="small muted">이용 조건: 가격 · 기간 확인 필요 (체험에서는 결제 결과를 직접 고를 수 있어요)</p>

    <!-- 확인 전 파일이 있으면 받기 단계부터 -->
    <section v-if="current && current.exportKind === (kind === 'report' ? 'report' : 'backup')" class="card stack">
      <h4>{{ current.exportKind === 'report' ? `상세보고서 · ${dateLabel(current.periodStart)} ~ ${dateLabel(current.periodEnd)}` : '기록 백업 파일' }}</h4>
      <p class="row"><ConfidenceBadge v-if="current.exportKind === 'report'" :level="conf(current.confidenceSnapshot)" /> <span class="muted">기록 {{ current.recordCountSnapshot }}일 기준</span></p>
      <div>
        <p class="field-label">이 파일에 들어가는 정보</p>
        <ul>
          <li v-for="i in current.includedItems" :key="i">{{ i }}</li>
        </ul>
      </div>
      <p class="small">파일은 하루한장 밖으로 나가면 지켜 드릴 수 없어요.</p>
      <label class="check"><input v-model="confirmCheck" type="checkbox" /> 들어가는 정보를 확인했어요</label>
      <ReasonButton :disabled="!confirmCheck" :reason="gateCopy('G7').buttonReason" block tall @click="confirmAndDownload">{{ current.exportKind === 'report' ? '보고서 받기' : '파일 받기' }}</ReasonButton>
      <ReasonButton variant="secondary" block @click="decline">받지 않기</ReasonButton>
    </section>

    <template v-else>
      <template v-if="!hasEnt">
        <GateBlock v-if="payBlocked" gate="G6" />
        <section class="card stack">
          <h4>{{ kind === 'report' ? '상세보고서' : '백업 · 내보내기' }} 이용하기</h4>
          <label class="stack-sm"><span class="field-label">체험용 결제 결과</span>
            <select v-model="simulate" class="input">
              <option value="success">성공</option>
              <option value="failed">실패</option>
              <option value="canceled">취소</option>
            </select>
          </label>
          <ReasonButton variant="secondary" :loading="paying" block @click="pay">결제하기</ReasonButton>
        </section>
        <ReasonButton disabled :reason="gateCopy('G6').buttonReason" block tall>{{ kind === 'report' ? '보고서 만들기' : '파일 만들기' }}</ReasonButton>
      </template>

      <template v-else>
        <section v-if="kind === 'report'" class="stack">
          <label class="stack-sm"><span class="field-label">기간</span>
            <select v-model.number="periodDays" class="input" @change="checkG3">
              <option :value="14">최근 2주</option>
              <option :value="28">최근 4주</option>
              <option :value="56">최근 8주</option>
            </select>
          </label>
          <p class="small muted">{{ dateLabel(pStart) }} ~ {{ dateLabel(pEnd) }}</p>
          <GateBlock v-if="g3 && !g3.pass" gate="G3" :record-count="g3.recordCount" :min-records="g3.minRecords" compact />
          <ReasonButton :disabled="!g3?.pass" :reason="gateCopy('G3').buttonReason" :loading="building" block tall @click="create">보고서 만들기</ReasonButton>
        </section>
        <ReasonButton v-else :loading="building" block tall @click="create">백업 파일 만들기</ReasonButton>
      </template>
    </template>

    <p v-if="msg" class="err" role="alert">{{ msg }}</p>
    <p class="small muted">무료 기능(기록 · 달력 · 패턴 · 비교)은 결제와 상관없이 그대로 쓸 수 있어요.</p>

    <section v-if="exports.filter((e) => e.status !== 'generated').length" class="stack">
      <h4>지난 파일</h4>
      <ul class="hist">
        <li v-for="e in exports.filter((x) => x.status !== 'generated')" :key="e.exportId">
          {{ e.exportKind === 'report' ? '상세보고서' : '백업' }} · {{ e.status === 'delivered' ? '받음' : '받지 않음' }}
          <a v-if="e.status === 'delivered'" :href="`/api/paid/exports/${e.exportId}/file`">다시 받기</a>
        </li>
      </ul>
    </section>
    </div>
  </OwnerLayout>
</template>

<style scoped>
.h { font-size: 22px; font-weight: 600; }
/* 넓은 화면: 읽기 좋은 폭으로 가운데 정렬 */
.narrow { display: flex; flex-direction: column; gap: var(--s-lg); width: 100%; max-width: 760px; margin: 0 auto; }
.group { border: none; padding: 0; margin: 0; display: flex; gap: var(--s-lg); flex-wrap: wrap; }
.radio, .check { display: flex; gap: var(--s-sm); align-items: center; min-height: 48px; font-weight: 600; }
.radio input, .check input { width: 22px; height: 22px; accent-color: var(--ink); }
.stack { display: flex; flex-direction: column; gap: var(--s-md); }
.stack-sm { display: flex; flex-direction: column; gap: 4px; }
ul { margin: 4px 0 0; padding-left: 20px; color: var(--body); }
.hist { list-style: none; padding: 0; }
.hist li { display: flex; gap: var(--s-base); min-height: 40px; align-items: center; }
.err { color: var(--error); }
</style>
