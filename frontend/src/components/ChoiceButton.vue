<!-- C5 단일 선택 버튼 (T045) — 72px, 라운드 14px, 선택됨 ink 채움(스타일가이드 §7) -->
<script setup lang="ts">
defineProps<{ selected: boolean; label: string; sub?: string }>()
const emit = defineEmits<{ pick: [] }>()
</script>

<template>
  <button type="button" class="choice" :class="{ selected }" :aria-pressed="selected" @click="emit('pick')">
    <span class="lb"><slot name="mark" />{{ label }}</span>
    <span v-if="sub" class="sub">{{ sub }}</span>
  </button>
</template>

<style scoped>
.choice { min-height: 72px; border-radius: var(--r-md); border: 1px solid var(--hairline-strong); background: var(--surface-elevated); color: var(--ink); font-size: 16px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: var(--s-sm); width: 100%; }
.choice:hover { border-color: var(--ink); }
.choice.selected { background: var(--ink); color: var(--canvas); border-color: var(--ink); }
.sub { font-family: var(--mono); font-size: 13px; font-weight: 500; opacity: 0.8; }
</style>
