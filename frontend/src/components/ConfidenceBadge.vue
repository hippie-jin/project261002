<!-- C7 신뢰도 배지 (T038) — 알약형 11px/600, 글자로 구분 -->
<script setup lang="ts">
import { CONFIDENCE, type Confidence } from '@/labels'
defineProps<{ level: Confidence }>()
</script>

<template>
  <span class="badge" :class="level">{{ CONFIDENCE[level] }}</span>
</template>

<style scoped>
.badge { display: inline-block; font-size: 11px; font-weight: 600; line-height: 1.18; padding: 4px 12px; border-radius: var(--r-pill); background: var(--surface-elevated); box-shadow: inset 0 0 0 1px var(--hairline-strong); color: var(--ink); white-space: nowrap; }
.insufficient { background: transparent; box-shadow: inset 0 0 0 1px var(--hairline-strong); color: var(--muted); }
</style>
