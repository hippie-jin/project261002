<!-- 기관·운영 데스크톱 틀 (T039) — 72px 상단 내비게이션, 활성 탭은 헤더 바닥에 붙은 2px ink 밑줄(스타일가이드 §12) -->
<script setup lang="ts">
defineProps<{ brand: string; who?: string; tabs: Array<{ key: string; label: string }>; active: string }>()
const emit = defineEmits<{ tab: [key: string]; logout: [] }>()
</script>

<template>
  <div class="desk">
    <header class="nav">
      <span class="brand">하루한장 <small>{{ brand }}</small></span>
      <nav class="tabs" aria-label="메뉴">
        <button v-for="t in tabs" :key="t.key" type="button" class="tab" :class="{ active: active === t.key }" :aria-current="active === t.key ? 'page' : undefined" @click="emit('tab', t.key)">
          {{ t.label }}
        </button>
      </nav>
      <span class="who">
        <span v-if="who">{{ who }}</span>
        <button type="button" class="link-btn" @click="emit('logout')">로그아웃</button>
      </span>
    </header>
    <main class="body"><slot /></main>
  </div>
</template>

<style scoped>
.desk { min-height: 100vh; background: var(--canvas); }
.nav { position: sticky; top: 0; z-index: 10; background: rgba(255, 255, 255, 0.92); backdrop-filter: saturate(180%) blur(12px); height: 72px; display: flex; align-items: stretch; gap: var(--s-xxl); padding: 0 var(--s-xl); border-bottom: 1px solid var(--hairline); flex-wrap: wrap; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font-size: 18px; font-weight: 800; letter-spacing: -0.04em; white-space: nowrap; }
.brand small { color: var(--muted); font-size: 13px; font-weight: 600; letter-spacing: -0.01em; margin-left: 2px; padding-left: 10px; border-left: 1px solid var(--hairline-strong); }
.tabs { display: flex; align-items: stretch; gap: var(--s-xl); flex: 1; }
.tab { position: relative; background: none; border: none; padding: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.02em; color: var(--muted); cursor: pointer; white-space: nowrap; transition: color 0.15s; }
.tab::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--ink); transform: scaleX(0); transition: transform 0.2s ease; }
.tab:hover, .tab.active { color: var(--ink); }
.tab.active::after { transform: scaleX(1); }
.who { display: flex; gap: var(--s-base); align-items: center; color: var(--muted); font-size: 14px; }
.body { max-width: 1280px; margin: 0 auto; padding: var(--s-xl); display: flex; flex-direction: column; gap: var(--s-lg); }
@media (max-width: 743px) {
  .nav { height: auto; padding: var(--s-md) var(--s-base) 0; gap: var(--s-sm); justify-content: space-between; }
  .tabs { order: 3; width: 100%; overflow-x: auto; gap: var(--s-lg); }
  .tab { min-height: 44px; }
  .body { padding: var(--s-base); }
}
</style>
