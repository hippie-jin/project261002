<!-- C8 데이터 상태 표지 (T036) — 비어 있는 이유를 서로 다른 글자로. 회색 빈칸 금지(U4) -->
<script setup lang="ts">
const LABEL = {
  needs_check: '확인 필요',
  pending: '전송 대기',
  no_record: '기록 안 한 날',
  not_entered: '입력 안 함 (선택)',
  suppressed: '표시 불가 - 표본 부족',
} as const
defineProps<{ kind: keyof typeof LABEL }>()
</script>

<template>
  <span class="tag" :class="kind">{{ LABEL[kind] }}</span>
</template>

<style scoped>
.tag { display: inline-block; font-size: 13px; font-weight: 600; line-height: 1.2; padding: 3px 8px; border-radius: var(--r-xs); border: 1px dashed var(--border-strong); color: var(--body); background: transparent; white-space: nowrap; }
.needs_check { border-style: dashed; }
.pending { border-style: solid; border-color: var(--ink); color: var(--ink); }
.no_record { border-style: dotted; color: var(--muted); }
.not_entered { border: none; padding-left: 0; color: var(--muted); font-weight: 500; }
.suppressed { border-style: dashed; color: var(--muted); }
</style>
