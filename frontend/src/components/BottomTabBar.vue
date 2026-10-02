<!-- C1 하단 탭바 (T032, 스타일가이드 §12) — 활성 탭은 Rausch 아이콘+라벨, 나머지 muted -->
<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
const tabs = [
  { to: '/today', icon: '⌂', label: '오늘' },
  { to: '/calendar', icon: '▦', label: '달력' },
  { to: '/pattern', icon: '◔', label: '패턴' },
  { to: '/compare', icon: '⇆', label: '비교' },
]
</script>

<template>
  <nav class="tabbar" aria-label="주요 메뉴">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ active: route.path.startsWith(t.to) }" :aria-current="route.path.startsWith(t.to) ? 'page' : undefined">
      <span class="ic" aria-hidden="true">{{ t.icon }}</span>
      <span class="lb">{{ t.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: repeat(4, 1fr); background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(8px); border-top: 1px solid var(--hairline); padding-bottom: env(safe-area-inset-bottom); z-index: 20; }
.tab { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 56px; text-decoration: none; color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: -0.01em; gap: 4px; transition: color 0.15s; }
.tab .ic { font-size: 20px; line-height: 1; }
.tab.active { color: var(--ink); font-weight: 700; }
.tab .ic { padding: 3px 16px; border-radius: var(--r-pill); transition: background-color 0.15s; }
.tab.active .ic { background: var(--primary); }
@media (min-width: 744px) {
  .tabbar { max-width: 560px; margin: 0 auto; border-left: 1px solid var(--hairline); border-right: 1px solid var(--hairline); }
}
</style>
