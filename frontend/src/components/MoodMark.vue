<!-- C11 장사 상태 표식 (T037) — ● 좋음 · ○ 보통 · – 나쁨, 글자 병기. 신호등 색 금지(U7) -->
<script setup lang="ts">
import { MOOD } from '@/labels'
withDefaults(defineProps<{ mood: 'good' | 'normal' | 'bad'; withLabel?: boolean }>(), { withLabel: true })
</script>

<template>
  <span class="mood" :aria-label="MOOD[mood].label"><span aria-hidden="true" class="m">{{ MOOD[mood].mark }}</span><span v-if="withLabel" aria-hidden="true">&nbsp;{{ MOOD[mood].label }}</span></span>
</template>

<style scoped>
.mood { color: var(--ink); white-space: nowrap; }
.m { font-weight: 700; }
</style>
