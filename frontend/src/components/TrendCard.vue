<!-- C6 경향 카드 (T064) — 문장 + 신뢰도 + 참고 안내를 한 덩어리로만(U3). 원인 단정 금지 -->
<script setup lang="ts">
import ConfidenceBadge from './ConfidenceBadge.vue'
import type { Confidence } from '@/labels'
withDefaults(defineProps<{ label: string; sentence: string; evidence?: string; confidence: Confidence; showNote?: boolean; evidenceAction?: boolean }>(), {
  showNote: true, // Boolean prop 은 생략 시 false 로 바뀐다 — 참고 안내는 기본으로 보인다(BR-HRH-11)
})
const emit = defineEmits<{ evidence: [] }>()
</script>

<template>
  <article class="trend card float">
    <div class="top">
      <ConfidenceBadge :level="confidence" />
      <span class="lab">{{ label }}</span>
    </div>
    <p class="sentence">{{ sentence }}</p>
    <p v-if="evidence" class="ev">{{ evidence }}</p>
    <p v-if="showNote" class="note">참고 정보예요 - 사장님 경험과 함께 판단해 주세요</p>
    <button v-if="evidenceAction" type="button" class="link-btn" @click="emit('evidence')">근거 날짜 보기</button>
  </article>
</template>

<style scoped>
.trend { display: flex; flex-direction: column; gap: var(--s-sm); }
.top { display: flex; justify-content: space-between; align-items: center; gap: var(--s-sm); }
.lab { font-size: 13px; color: var(--muted); }
.sentence { font-size: 20px; font-weight: 600; line-height: 1.35; letter-spacing: -0.18px; }
.ev { color: var(--body); font-size: 16px; }
.note { color: var(--muted); font-size: 14px; }
.link-btn { align-self: flex-start; }
</style>
