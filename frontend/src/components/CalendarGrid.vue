<!-- 장사 달력 격자 (T059, 스타일가이드 §10) — 지름 40px 원 날짜, 아래 모양 표식. 쉼/기록 안 한 날 구분 -->
<script setup lang="ts">
import { computed } from 'vue'
import { MOOD } from '@/labels'
import { dowOf, monthDays, todayKst } from '@/lib/dates'

const props = defineProps<{
  month: string
  records: Record<string, { dayMood: 'good' | 'normal' | 'bad'; env?: any; pending?: boolean }>
  closedDays: number[] | null
  selected?: string | null
  highlight?: string[]
}>()
const emit = defineEmits<{ pick: [date: string] }>()
const today = todayKst()
const cells = computed(() => {
  const days = monthDays(props.month)
  const lead = dowOf(days[0]) - 1 // 월요일 시작
  return [...Array(lead).fill(null), ...days]
})
function state(d: string) {
  const r = props.records[d]
  if (r) return r.pending ? 'pending' : 'recorded'
  if (d > today) return 'future'
  if (props.closedDays?.includes(dowOf(d))) return 'closed'
  return 'none'
}
function aria(d: string) {
  const r = props.records[d]
  const day = Number(d.slice(8))
  if (r) return `${day}일 ${MOOD[r.dayMood].label}${r.env?.isHoliday ? ', ' + (r.env.holidayName ?? '공휴일') : ''}`
  const s = state(d)
  return `${day}일 ${s === 'closed' ? '쉬는 날' : s === 'future' ? '' : '기록 안 한 날'}`
}
</script>

<template>
  <div class="cal" role="grid" :aria-label="`${month} 장사 달력`">
    <div class="head" role="row">
      <span v-for="w in ['월', '화', '수', '목', '금', '토', '일']" :key="w" role="columnheader">{{ w }}</span>
    </div>
    <div class="grid">
      <template v-for="(d, i) in cells" :key="i">
        <span v-if="!d" class="blank" />
        <button
          v-else
          type="button"
          class="day"
          :class="[state(d), { sel: selected === d, hl: highlight?.includes(d), today: d === today }]"
          :disabled="state(d) === 'future'"
          :aria-label="aria(d)"
          :aria-pressed="selected === d"
          @click="emit('pick', d)"
        >
          <span class="num">{{ Number(d.slice(8)) }}</span>
          <span class="mk" aria-hidden="true">
            <template v-if="records[d]">{{ MOOD[records[d].dayMood].mark }}</template>
            <template v-else-if="state(d) === 'closed'">쉼</template>
            <template v-else-if="state(d) === 'none'">·</template>
          </span>
          <span v-if="records[d]?.env?.isHoliday || records[d]?.env?.localEventName" class="ev" aria-hidden="true">{{ records[d]?.env?.localEventName ? '행사' : '휴일' }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cal { width: 100%; }
.head, .grid { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; }
.head span { font-size: 12px; font-weight: 600; letter-spacing: 1.5px; color: var(--muted); padding: var(--s-xs) 0; }
.grid { gap: var(--s-xs); }
.blank { min-height: 64px; }
.day { background: none; border: none; min-height: 64px; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 2px 0; color: var(--ink); }
.num { width: 40px; height: 40px; border-radius: var(--r-sm); background: var(--surface-card); font-family: var(--mono); font-weight: 500; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.day.sel .num { background: var(--ink); color: var(--canvas); outline: 3px solid var(--primary); outline-offset: 1px; }
.day.hl .num { background: var(--primary-soft); box-shadow: inset 0 0 0 2px var(--ink); }
.day.today .num { font-weight: 700; }
.mk { font-size: 13px; line-height: 1; min-height: 13px; font-weight: 700; }
.day.closed .mk, .day.none .mk { color: var(--muted); font-weight: 500; }
.day.future { color: var(--muted-soft); }
.day.future .num { background: transparent; border: 1px dashed var(--hairline); }
.day.pending .mk::after { content: '*'; }
.ev { font-size: 10px; color: var(--muted); }
</style>
