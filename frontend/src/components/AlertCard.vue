<!-- C10 경보 카드 (T073) — error 색 글자, 배경을 칠하지 않는다. 겁주지 않는 문장(스타일가이드 §11) -->
<script setup lang="ts">
import ConfidenceBadge from './ConfidenceBadge.vue'
import { dateLabel } from '@/labels'
const props = defineProps<{ alert: { alertId: number; windowStart: string; windowEnd: string; confidenceLevel: 'high' | 'medium' | 'low'; status: string; displayChannel: string } }>()
const emit = defineEmits<{ evidence: []; ack: []; mute: [] }>()
</script>

<template>
  <article class="alert card" :class="{ done: props.alert.status === 'acknowledged' }" aria-live="polite">
    <div class="top">
      <ConfidenceBadge :level="props.alert.confidenceLevel" />
      <span class="lab">최근 흐름 · 경보</span>
    </div>
    <p class="sentence">최근 2주, 평소보다 조용한 날이 늘어나는 경향이 보여요</p>
    <p class="ev">{{ dateLabel(props.alert.windowStart) }} ~ {{ dateLabel(props.alert.windowEnd) }} 기록에서 '나쁨'·'손님 적음'이 이전보다 많았어요. 원인을 단정하지 않아요.</p>
    <div v-if="props.alert.status !== 'acknowledged'" class="row acts">
      <button type="button" class="sec" @click="emit('evidence')">근거 보기</button>
      <button type="button" class="sec" @click="emit('ack')">확인했어요</button>
      <button type="button" class="link-btn" @click="emit('mute')">경보 받지 않기</button>
    </div>
    <p v-else class="muted small">확인했어요</p>
  </article>
</template>

<style scoped>
.alert { display: flex; flex-direction: column; gap: var(--s-sm); border-left: 3px solid var(--error); }
.top { display: flex; justify-content: space-between; align-items: center; }
.lab { font-size: 13px; color: var(--muted); }
.sentence { font-size: 18px; font-weight: 600; color: var(--ink); line-height: 1.4; }
.ev { color: var(--body); }
.acts { gap: var(--s-sm); }
.sec { min-height: 44px; padding: 0 16px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-elevated); color: var(--ink); font-weight: 600; }
.done { border-left-color: var(--success); }
.done .sentence { color: var(--body); }
</style>
