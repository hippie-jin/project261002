<!-- S1 가게 시작하기 (T046·T047, US1) — 단계 1 동의(G0) · 단계 2 가게 정보(G1). 완료 때 한 번에 저장(U6) -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useSession } from '@/stores/session'
import { gateCopy } from '@/gates/copy'
import { DOW } from '@/labels'
import GateBlock from '@/components/GateBlock.vue'
import ReasonButton from '@/components/ReasonButton.vue'
import ChoiceButton from '@/components/ChoiceButton.vue'
import ChoiceChip from '@/components/ChoiceChip.vue'

const router = useRouter()
const session = useSession()
const step = ref<1 | 2 | 'stopped'>(1)
const agreeService = ref(false)
const agreeAnon = ref(false)
const options = ref<{ businessTypes: any[]; regions: any[] }>({ businessTypes: [], regions: [] })
const bt = ref<string | null>(null)
const upperRegion = ref('')
const region = ref('')
const closed = ref<number[]>([])
const closedTouched = ref(false)
const saving = ref(false)
const saveError = ref('')

onMounted(async () => {
  const r = await api<any>('/onboarding/options')
  if (r.ok) options.value = r.data
})
const uppers = computed(() => options.value.regions.filter((r) => !r.parentCode))
const lowers = computed(() => options.value.regions.filter((r) => r.parentCode === upperRegion.value))
const g1Field = computed(() => (!bt.value && !region.value ? '업종과 지역' : !bt.value ? '업종' : !region.value ? '지역' : ''))

function toggleDay(d: number) {
  closedTouched.value = true
  closed.value = closed.value.includes(d) ? closed.value.filter((x) => x !== d) : [...closed.value, d]
}

async function finish() {
  saving.value = true
  saveError.value = ''
  const r = await api('/onboarding', {
    method: 'POST',
    body: {
      consents: { service: agreeService.value, anon_stats: agreeAnon.value },
      businessTypeCode: bt.value,
      regionCode: region.value,
      closedDays: closedTouched.value ? closed.value : null,
    },
  })
  saving.value = false
  if (!r.ok) return (saveError.value = errorText(r)) // 입력값은 그대로 둔다(UC1 E3)
  await session.load(true)
  router.replace('/today')
}
</script>

<template>
  <div class="start">
    <p v-if="session.config.publicDemo" class="demo-ribbon">체험용 화면이에요</p>
    <header class="top">
      <span class="brand">하루한장</span>
      <span class="steps">단계 <b>{{ step === 2 ? 2 : 1 }}</b> / 2</span>
    </header>

    <main v-if="step === 1" class="main">
      <h1>시작하기 전에 알려 드려요</h1>
      <section class="card">
        <h4>이런 정보만 받아요</h4>
        <ul>
          <li>업종 · 지역 · 쉬는 요일</li>
          <li>매일 버튼으로 남기는 장사 기록</li>
          <li>매출은 금액이 아니라 구간으로, 원할 때만</li>
        </ul>
      </section>
      <section class="card">
        <h4>이렇게 지켜요</h4>
        <ul>
          <li>기록은 서버에 저장할 때 보호(암호화)해요</li>
          <li>다른 가게와 비교할 때는 익명 묶음으로만 써요</li>
          <li>어느 가게인지, 몇 등인지는 보여 주지 않아요</li>
        </ul>
      </section>
      <label class="check"><input v-model="agreeService" type="checkbox" /> <b>위 내용을 확인했고 동의해요 (필수)</b></label>
      <label class="check"><input v-model="agreeAnon" type="checkbox" /> 같은 동네 익명 통계에 내 기록을 보태요 (선택)</label>
      <GateBlock v-if="!agreeService" gate="G0" compact />
      <ReasonButton :disabled="!agreeService" :reason="gateCopy('G0').buttonReason" block tall @click="step = 2">동의하고 시작</ReasonButton>
      <ReasonButton variant="secondary" block @click="step = 'stopped'">동의하지 않음</ReasonButton>
    </main>

    <main v-else-if="step === 'stopped'" class="main">
      <h1>동의해야 쓸 수 있어요</h1>
      <p class="muted">아무 정보도 저장하지 않았어요. 마음이 바뀌면 언제든 다시 시작할 수 있어요.</p>
      <ReasonButton variant="secondary" block @click="step = 1">처음으로</ReasonButton>
    </main>

    <main v-else class="main">
      <h1>가게를 알려 주세요</h1>
      <fieldset class="group">
        <legend>업종</legend>
        <div class="grid3">
          <ChoiceButton v-for="b in options.businessTypes" :key="b.code" :label="b.label" :selected="bt === b.code" @pick="bt = b.code" />
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>지역</legend>
        <select v-model="upperRegion" class="input" aria-label="시·구" @change="region = ''">
          <option value="" disabled>시·구를 골라 주세요</option>
          <option v-for="r in uppers" :key="r.code" :value="r.code">{{ r.name }}</option>
        </select>
        <select v-model="region" class="input" aria-label="동" :disabled="!upperRegion">
          <option value="" disabled>동을 골라 주세요</option>
          <option v-for="r in lowers" :key="r.code" :value="r.code">{{ r.name }}</option>
        </select>
      </fieldset>
      <fieldset class="group">
        <legend>쉬는 요일 <span class="muted small">(여러 개, 나중에 해도 돼요)</span></legend>
        <div class="row">
          <ChoiceChip v-for="d in 7" :key="d" :label="DOW[d]" :selected="closed.includes(d)" @toggle="toggleDay(d)" />
        </div>
      </fieldset>
      <p v-if="saveError" class="err" role="alert">{{ saveError }}</p>
      <ReasonButton :disabled="!!g1Field" :reason="gateCopy('G1', { field: g1Field }).buttonReason" :loading="saving" block tall @click="finish">
        {{ saveError ? '다시 시도' : '완료' }}
      </ReasonButton>
      <button type="button" class="link-btn" @click="step = 1">이전 단계</button>
    </main>
  </div>
</template>

<style scoped>
.start { max-width: 560px; margin: 0 auto; }
@media (min-width: 744px) { .start { max-width: 760px; } .main { padding: var(--s-xl) var(--s-xl) var(--s-section); } .grid3 { grid-template-columns: repeat(4, 1fr); } }
.top { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--s-base); border-bottom: 1px solid var(--hairline); }
.brand { font-size: 20px; font-weight: 700; color: var(--primary); }
.steps { font-size: 14px; color: var(--muted); }
.main { padding: var(--s-lg) var(--s-base) var(--s-xxl); display: flex; flex-direction: column; gap: var(--s-base); }
h1 { font-size: 22px; font-weight: 600; }
ul { margin: var(--s-sm) 0 0; padding-left: 20px; color: var(--body); }
.check { display: flex; gap: var(--s-sm); align-items: flex-start; min-height: 48px; padding-top: 12px; }
.check input { width: 22px; height: 22px; accent-color: var(--ink); flex: none; margin-top: 2px; }
.group { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s-sm); }
legend { font-weight: 600; margin-bottom: var(--s-sm); }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-sm); }
.err { color: var(--error); }
</style>
