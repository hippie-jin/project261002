<!-- C5 다중 선택 칩 (T045) — 40px 알약형, 14/500 -->
<script setup lang="ts">
defineProps<{ selected: boolean; label: string }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button type="button" class="chip" :class="{ selected }" :aria-pressed="selected" @click="emit('toggle')">{{ label }}</button>
</template>

<style scoped>
.chip { min-height: 40px; padding: 0 16px; border-radius: var(--r-md); border: 1px solid var(--hairline-strong); background: transparent; color: var(--body); font-size: 14px; font-weight: 500; }
.chip:hover { border-color: var(--ink); }
.chip.selected { background: var(--primary-soft); color: var(--ink); border-color: var(--ink); }
.chip.selected::before { content: '✓ '; color: var(--ink); }
</style>
