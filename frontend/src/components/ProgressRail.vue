<!-- C2 진행 레일 (T033, SD_02 §2-3) — 이용 단계 4칸과 막힘을 상시 표시. 막힌 칸을 누르면 해당 화면으로 -->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRail } from '@/stores/rail'
const props = defineProps<{ current?: 'today' | 'pattern' | 'compare' | null }>()
const rail = useRail()
const router = useRouter()
onMounted(() => rail.refresh())

const steps = computed(() => [
  { key: 'start', n: 1, text: '시작 완료', state: 'done', to: null },
  {
    key: 'today',
    n: 2,
    text: rail.todayPending ? '오늘 기록 - 전송 대기' : rail.todayRecorded ? '오늘 기록 완료' : '오늘 기록 전',
    state: rail.todayRecorded || rail.todayPending ? 'done' : 'todo',
    to: '/today',
  },
  {
    key: 'pattern',
    n: 3,
    text: rail.g3Pass ? '볼 수 있어요' : `기록 ${rail.recordCount}일 - 준비 중 G3`,
    state: rail.g3Pass ? 'done' : 'blocked',
    to: '/pattern',
  },
  {
    key: 'compare',
    n: 4,
    text: !rail.g4Pass ? '비교 - 잠김 G4' : rail.g5PassThisWeek ? '비교 - 볼 수 있어요' : '비교 - 자료 모이는 중 G5',
    state: rail.g4Pass && rail.g5PassThisWeek ? 'done' : 'blocked',
    to: '/compare',
  },
])
</script>

<template>
  <nav class="rail" aria-label="이용 단계">
    <ol>
      <li v-for="(s, i) in steps" :key="s.key">
        <button
          type="button"
          class="step"
          :class="[s.state, { current: props.current === s.key }]"
          :disabled="!s.to"
          :aria-current="props.current === s.key ? 'step' : undefined"
          @click="s.to && router.push(s.to)"
        >
          <span class="n">{{ s.n }}</span> {{ s.text }}
        </button>
        <span v-if="i < steps.length - 1" class="sep" aria-hidden="true">›</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.rail { overflow-x: auto; -webkit-overflow-scrolling: touch; padding: var(--s-sm) var(--s-base); border-bottom: 1px solid var(--hairline-soft); background: var(--canvas); }
ol { list-style: none; display: flex; align-items: center; gap: var(--s-xs); margin: 0; padding: 0; white-space: nowrap; }
li { display: flex; align-items: center; gap: var(--s-xs); }
.step { font-size: 13px; border: 1px solid transparent; background: none; border-radius: var(--r-full); padding: 6px 10px; min-height: 32px; color: var(--muted); }
.step.done { color: var(--ink); }
.step.blocked { color: var(--error); }
.step.current { background: var(--primary); border-color: var(--ink); color: var(--on-primary); }
.step:disabled { cursor: default; }
.n { font-family: var(--mono); font-weight: 500; }
.sep { color: var(--muted-soft); }
</style>
