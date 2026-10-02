<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
const online = ref(navigator.onLine)
const set = () => (online.value = navigator.onLine)
onMounted(() => {
  window.addEventListener('online', set)
  window.addEventListener('offline', set)
})
onUnmounted(() => {
  window.removeEventListener('online', set)
  window.removeEventListener('offline', set)
})
</script>

<template>
  <p v-if="!online" class="offline" role="status">인터넷 연결이 없어요. 기록은 기기에 보관했다가 연결되면 보내요.</p>
  <RouterView />
</template>

<style scoped>
.offline { position: sticky; top: 0; z-index: 30; background: var(--warning); color: var(--on-primary); font-weight: 600; font-size: 14px; text-align: center; padding: 8px 16px; }
</style>
