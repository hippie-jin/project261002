/**
 * 라우터 (T031, T048) — meta.kind 로 주체 종류를, meta.perm 으로 권한을 검사한다.
 * 가입 대기(pending)는 /start 만, 사장님은 /today 로, 기관은 /org, 운영은 /staff 로 보낸다.
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    kind?: 'owner' | 'org' | 'staff' | 'pending' | 'guest'
    perm?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: () => import('@/pages/LandingPage.vue'), meta: { kind: 'guest' } },
    { path: '/start', component: () => import('@/pages/StartPage.vue'), meta: { kind: 'pending' } },
    { path: '/today', component: () => import('@/pages/TodayPage.vue'), meta: { kind: 'owner', perm: 'record.own.write' } },
    { path: '/calendar', component: () => import('@/pages/CalendarPage.vue'), meta: { kind: 'owner', perm: 'record.own.read' } },
    { path: '/pattern', component: () => import('@/pages/PatternPage.vue'), meta: { kind: 'owner', perm: 'record.own.read' } },
    { path: '/compare', component: () => import('@/pages/ComparePage.vue'), meta: { kind: 'owner', perm: 'compare.own.read' } },
    { path: '/paid', component: () => import('@/pages/PaidPage.vue'), meta: { kind: 'owner', perm: 'paid.own.use' } },
    { path: '/settings', component: () => import('@/pages/SettingsPage.vue'), meta: { kind: 'owner', perm: 'store.own.write' } },
    { path: '/login', component: () => import('@/pages/auth/OwnerLoginPage.vue'), meta: { kind: 'guest' } },
    { path: '/org/login', component: () => import('@/pages/auth/OrgLoginPage.vue'), meta: { kind: 'guest' } },
    { path: '/org', component: () => import('@/pages/org/DashboardPage.vue'), meta: { kind: 'org', perm: 'org.trends.read' } },
    { path: '/staff/login', component: () => import('@/pages/auth/StaffLoginPage.vue'), meta: { kind: 'guest' } },
    { path: '/staff', component: () => import('@/pages/staff/ConsolePage.vue'), meta: { kind: 'staff' } },
    { path: '/forbidden', component: () => import('@/pages/ForbiddenPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const HOME = { owner: '/today', org: '/org', staff: '/staff', pending: '/start' } as const

router.beforeEach(async (to) => {
  const s = useSession()
  await s.load()
  const want = to.meta.kind
  if (!want) return true
  if (want === 'guest') {
    // 이미 로그인했으면 자기 홈으로(로그인 화면은 다른 주체로 바꿀 때를 위해 허용)
    if (to.path === '/' && s.kind) return HOME[s.kind]
    return true
  }
  if (!s.kind) return to.path.startsWith('/org') ? '/org/login' : to.path.startsWith('/staff') ? '/staff/login' : '/'
  if (s.kind !== want) return s.kind === 'pending' ? '/start' : want === 'pending' ? HOME[s.kind] : '/forbidden'
  if (to.meta.perm && !s.can(to.meta.perm)) return '/forbidden'
  return true
})

export default router
