<!--
  사장님 화면 틀 (T039, 스타일가이드 §12·§13 반응형)
  - 모바일(<744): 상단 바 64px + 하단 탭바
  - 태블릿·데스크톱(≥744): 상단 72px 내비게이션 — 로고 옆 왼쪽 정렬, 메뉴는 아이콘+글자 버튼 묶음(segmented),
    지금 화면 버튼은 노랑 면(노랑은 면에만 · 글자는 ink), 하단 탭바 없음, 본문 최대 1280px
-->
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import ProgressRail from '@/components/ProgressRail.vue'
import BottomTabBar from '@/components/BottomTabBar.vue'
import { useSession } from '@/stores/session'
withDefaults(defineProps<{ title: string; rail?: 'today' | 'pattern' | 'compare' | null; tabs?: boolean }>(), {
  tabs: true, // Boolean prop 은 생략 시 false 로 바뀐다 — 하단 탭바는 기본으로 보인다
  rail: undefined,
})
const session = useSession()
const router = useRouter()
const route = useRoute()
// 아이콘은 24×24 선 그림 path — 글자만 읽지 않아도 무엇을 하는 버튼인지 알아보게 한다
const NAV = [
  { to: '/today', label: '오늘 기록', icon: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'] },
  { to: '/calendar', label: '장사 달력', icon: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M16 2v4M8 2v4M3 10h18'] },
  { to: '/pattern', label: '우리 가게 흐름', icon: ['M3 17l6-6 4 4 8-8', 'M14 7h7v7'] },
  { to: '/compare', label: '동네 비교', icon: ['M18 20V10M12 20V4M6 20v-6'] },
  { to: '/paid', label: '더 자세히', icon: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z', 'm21 21-4.3-4.3', 'M11 8v6M8 11h6'] },
]
</script>

<template>
  <div class="owner">
    <p v-if="session.config.publicDemo" class="demo-ribbon">체험용 화면이에요 · 가상의 가게 데이터를 쓰고 있어요</p>
    <header class="top">
      <div class="top-in">
        <RouterLink to="/today" class="brand" aria-label="하루한장 오늘 화면">하루한장</RouterLink>
        <h1 class="sr-only">{{ title }}</h1>
        <nav class="desk-nav" aria-label="주요 메뉴">
          <RouterLink v-for="n in NAV" :key="n.to" :to="n.to" class="nl" :class="{ on: route.path.startsWith(n.to) }" :aria-current="route.path.startsWith(n.to) ? 'page' : undefined">
            <svg class="ni" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="d in n.icon" :key="d" :d="d" />
            </svg>
            <span>{{ n.label }}</span>
          </RouterLink>
        </nav>
        <button type="button" class="icon" aria-label="설정" :class="{ on: route.path === '/settings' }" :aria-current="route.path === '/settings' ? 'page' : undefined" @click="router.push('/settings')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
    <div v-if="rail !== undefined" class="rail-wrap"><ProgressRail :current="rail" /></div>
    <main class="main" :class="{ tabs }">
      <slot />
    </main>
    <BottomTabBar v-if="tabs" class="mobile-only" />
  </div>
</template>

<style scoped>
.owner { min-height: 100vh; background: var(--canvas); }
.top { position: sticky; top: 0; z-index: 10; border-bottom: 1px solid var(--hairline); background: rgba(255, 255, 255, 0.92); backdrop-filter: saturate(180%) blur(12px); }
.top-in { height: 64px; display: flex; align-items: center; gap: var(--s-xl); padding: 0 var(--s-base); max-width: 1280px; margin: 0 auto; }

.brand { display: inline-flex; align-items: center; gap: 10px; flex: none; margin-right: auto; color: var(--ink); text-decoration: none; font-size: 18px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }

.desk-nav { display: none; }

.icon { width: 40px; height: 40px; display: inline-grid; place-items: center; flex: none; border: 0; border-radius: var(--r-md); background: transparent; color: var(--body); cursor: pointer; transition: background-color 0.15s, color 0.15s; }
.icon:hover { background: var(--surface-card); color: var(--ink); }
.icon.on { background: var(--primary); color: var(--on-primary); }
.icon:focus-visible, .brand:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.rail-wrap { max-width: 1280px; margin: 0 auto; }
.main { padding: var(--s-lg) var(--s-base) var(--s-xxl); display: flex; flex-direction: column; gap: var(--s-lg); max-width: 1280px; margin: 0 auto; }
.main.tabs { padding-bottom: 96px; }

/* 태블릿·데스크톱: 상단 내비게이션으로 바꾸고 하단 탭바를 숨긴다 */
@media (min-width: 744px) {
  .top-in { height: 72px; padding: 0 var(--s-xl); gap: var(--s-xxl); }
  .brand { margin-right: 0; }
  .desk-nav { display: flex; align-items: center; gap: var(--s-xs); padding: var(--s-xs); background: var(--surface-card); border-radius: var(--r-lg); min-width: 0; margin-right: auto; }
  .nl {
    display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; white-space: nowrap;
    border-radius: var(--r-md); color: var(--body); text-decoration: none;
    font-size: 15px; font-weight: 600; letter-spacing: -0.02em; line-height: 1;
    transition: background-color 0.15s, color 0.15s;
  }
  .ni { flex: none; color: var(--muted); transition: color 0.15s; }
  .nl:hover { background: var(--canvas); color: var(--ink); }
  .nl:hover .ni { color: var(--ink); }
  .nl:active { background: var(--hairline); }
  .nl.on { background: var(--primary); color: var(--on-primary); }
  .nl.on .ni { color: var(--on-primary); }
  .nl:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
  .rail-wrap :deep(.rail) { padding: var(--s-sm) var(--s-xl); border-bottom: none; }
  .main { padding: var(--s-xl) var(--s-xl) var(--s-section); }
  .main.tabs { padding-bottom: var(--s-section); }
  .mobile-only { display: none; }
}
@media (min-width: 744px) and (max-width: 1127px) {
  .top-in { padding: 0 var(--s-lg); gap: var(--s-lg); }
  .nl { font-size: 14px; padding: 0 12px; }
}
/* 좁은 태블릿: 다섯 버튼이 한 줄에 들어가도록 아이콘을 접고 글자만 남긴다 */
@media (min-width: 744px) and (max-width: 959px) {
  .ni { display: none; }
  .nl { padding: 0 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .nl, .ni, .icon { transition: none; }
}
</style>
