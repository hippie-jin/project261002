<!-- C9 확인 시트 (T044) — 체크해야 진행 버튼이 켜진다. 시트 밖을 눌러 닫으면 아무것도 저장하지 않는다(U6) -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import ReasonButton from './ReasonButton.vue'
const props = defineProps<{ open: boolean; title: string; checkLabel: string; confirmLabel: string; cancelLabel?: string; reason: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const checked = ref(false)
watch(
  () => props.open,
  (o) => {
    if (o) checked.value = false
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="scrim" @click.self="emit('cancel')">
      <div class="sheet" role="dialog" aria-modal="true" :aria-label="title">
        <div class="head">
          <h4>{{ title }}</h4>
          <button type="button" class="x" aria-label="닫기" @click="emit('cancel')">✕</button>
        </div>
        <div class="body"><slot /></div>
        <label class="check"><input v-model="checked" type="checkbox" /> <span>{{ checkLabel }}</span></label>
        <ReasonButton :disabled="!checked" :reason="reason" block @click="emit('confirm')">{{ confirmLabel }}</ReasonButton>
        <button v-if="cancelLabel" type="button" class="cancel" @click="emit('cancel')">{{ cancelLabel }}</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
.sheet { background: var(--canvas); width: 100%; max-width: 560px; border-radius: var(--r-lg) var(--r-lg) 0 0; padding: var(--s-lg); display: flex; flex-direction: column; gap: var(--s-base); max-height: 90vh; overflow: auto; }
@media (min-width: 744px) { .scrim { align-items: center; } .sheet { border-radius: var(--r-lg); } }
.head { display: flex; justify-content: space-between; align-items: center; }
.x { width: 40px; height: 40px; border-radius: var(--r-full); border: none; background: var(--surface-card); color: var(--ink); font-size: 16px; }
.body { color: var(--body); }
.check { display: flex; gap: var(--s-sm); align-items: center; min-height: 48px; font-weight: 600; }
.check input { width: 22px; height: 22px; accent-color: var(--ink); }
.cancel { min-height: 48px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-elevated); color: var(--ink); font-weight: 600; }
</style>
