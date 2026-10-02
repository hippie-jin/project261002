<!-- C4 이유 붙은 비활성 버튼 (T035) — 비활성이면 아래 이유 줄을 상시 표시, 눌러도 이유를 다시 읽어 준다 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
const props = withDefaults(
  defineProps<{ disabled?: boolean; reason?: string; variant?: 'primary' | 'secondary'; tall?: boolean; block?: boolean; loading?: boolean }>(),
  { variant: 'primary' },
)
const emit = defineEmits<{ click: [] }>()
const id = `reason-${Math.random().toString(36).slice(2, 9)}`
const pulse = ref(false)
const off = computed(() => props.disabled || props.loading)
function onClick() {
  if (off.value) {
    pulse.value = true
    setTimeout(() => (pulse.value = false), 600)
    return
  }
  emit('click')
}
</script>

<template>
  <div class="rb" :class="{ block }">
    <button
      type="button"
      class="btn"
      :class="[variant, { tall, off }]"
      :aria-disabled="off ? 'true' : 'false'"
      :aria-describedby="disabled && reason ? id : undefined"
      @click="onClick"
    >
      <slot />
    </button>
    <p v-if="disabled && reason" :id="id" class="reason" :class="{ pulse }" role="note">{{ reason }}</p>
  </div>
</template>

<style scoped>
.rb { display: flex; flex-direction: column; gap: var(--s-xs); }
.rb.block .btn { width: 100%; }
.btn {
  min-height: 48px; padding: 0 24px; border-radius: var(--r-md); font-size: 16px; font-weight: 600; border: 1px solid transparent;
  transition: background-color 0.1s;
}
.btn.tall { min-height: 56px; }
.primary { background: var(--primary); color: var(--on-primary); }
.primary:active { background: var(--primary-active); }
.primary.off { background: var(--primary-disabled); color: var(--muted); cursor: not-allowed; }
.secondary { background: var(--surface-card); color: var(--ink); border-color: var(--hairline-strong); }
.secondary.off { color: var(--muted-soft); border-color: var(--border-strong); cursor: not-allowed; }
.reason { font-size: 14px; color: var(--muted); line-height: 1.43; }
.reason.pulse { text-decoration: underline; }
</style>
