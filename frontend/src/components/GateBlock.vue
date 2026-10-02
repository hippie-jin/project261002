<!-- C3 차단 블록 (T034) — 사유·푸는 사람·다음 행동 3줄. 타인 해제형(G5·G8)은 행동 버튼이 없다(규칙 ③). 사라지지 않는다 -->
<script setup lang="ts">
import { computed } from 'vue'
import type { GateCode } from '@/api/client'
import { gateCopy } from '@/gates/copy'
const props = defineProps<{ gate: GateCode; recordCount?: number; minRecords?: number | null; actionLabel?: string; compact?: boolean }>()
const emit = defineEmits<{ action: [] }>()
const c = computed(() => gateCopy(props.gate, { recordCount: props.recordCount, minRecords: props.minRecords }))
</script>

<template>
  <section class="gate" :class="{ compact }" role="status" aria-live="polite" :data-gate="gate">
    <h4>{{ c.title }}</h4>
    <p>사유: {{ c.reason }}</p>
    <p class="who">{{ c.releaser }}</p>
    <button v-if="!c.others && actionLabel" type="button" class="act" @click="emit('action')">{{ actionLabel }}</button>
    <slot />
  </section>
</template>

<style scoped>
.gate { border: 1px solid var(--hairline); border-radius: var(--r-md); padding: var(--s-lg); background: var(--surface-card); border-left: 3px solid var(--warning); display: flex; flex-direction: column; gap: var(--s-sm); }
.gate.compact { padding: var(--s-base); }
h4 { font-size: 16px; font-weight: 600; }
p { color: var(--body); font-size: 16px; }
.who { color: var(--muted); font-size: 14px; }
.act { align-self: flex-start; min-height: 48px; padding: 0 20px; border-radius: var(--r-sm); background: var(--surface-elevated); color: var(--ink); border: 1px solid var(--hairline-strong); font-weight: 600; }
</style>
