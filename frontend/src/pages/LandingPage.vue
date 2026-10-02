<!-- 첫 화면 — 서비스 소개와 로그인 진입(T040). 체험 모드에서는 시드 페르소나로 바로 들어간다 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useSession } from '@/stores/session'

const session = useSession()
const router = useRouter()
const personas = ref<Array<{ subject: string; label: string; hint: string }>>([])
const error = ref('')
const busy = ref('')

onMounted(async () => {
  if (session.config.devLogin) {
    const r = await api<any[]>('/auth/dev-personas')
    if (r.ok) personas.value = r.data
  }
})

async function enter(subject: string) {
  busy.value = subject
  error.value = ''
  const r = await api<{ status: string }>('/auth/dev-login', { method: 'POST', body: { devSubject: subject } })
  busy.value = ''
  if (!r.ok) return (error.value = errorText(r))
  await session.load(true)
  router.push(r.data.status === 'active' ? '/today' : '/start')
}
</script>

<template>
  <div class="landing">
    <p v-if="session.config.publicDemo" class="demo-ribbon">체험용 서비스예요 · 모든 가게와 기록은 가상의 데이터예요</p>
    <div class="land-grid">
    <div class="intro">
    <header class="hero">
      <p class="brand">하루한장</p>
      <h1>하루 장사, 한 장에 담다</h1>
      <p class="lead">마감 후 30초, 버튼 세 묶음으로 오늘 장사를 남기면 쌓인 기록을 쉬운 문장과 달력으로 돌려드려요.</p>
    </header>
    <ul class="points">
      <li><b>30초 기록</b> — 오늘장사 · 손님 수 · 특별한 일을 버튼으로</li>
      <li><b>쉬운 문장</b> — 요일 · 날씨 · 특별한 일별 흐름을 경향으로</li>
      <li><b>익명 동네 비교</b> — 어느 가게인지, 몇 등인지는 보여 주지 않아요</li>
    </ul>
    <section class="others">
      <RouterLink to="/login">사장님 아이디로 로그인</RouterLink>
      <RouterLink to="/org/login">지자체·상인회 로그인</RouterLink>
      <RouterLink to="/staff/login">운영자 로그인</RouterLink>
    </section>
    </div>

    <div class="enter">
    <section v-if="session.config.kakaoLogin" class="stack">
      <a class="kakao" href="/api/auth/kakao/start">카카오로 시작하기</a>
    </section>

    <section v-if="personas.length" class="stack">
      <div>
        <h2 class="h">사장님 화면 체험하기</h2>
        <p class="muted small">가상의 가게를 하나 골라 들어가 보세요. 비밀번호는 필요 없어요.</p>
      </div>
      <ul class="personas">
        <li v-for="p in personas" :key="p.subject">
          <button type="button" class="persona card" :disabled="!!busy" @click="enter(p.subject)">
            <span class="pl">{{ p.label }}</span>
            <span class="ph">{{ p.hint }}</span>
            <span v-if="busy === p.subject" class="small muted">들어가는 중…</span>
          </button>
        </li>
      </ul>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
    </section>

    </div>
    </div>
    <p class="caption foot">© 2026 하루한장 · 비교 통계는 익명 묶음으로만 만들어요</p>
  </div>
</template>

<style scoped>
.landing { max-width: 560px; margin: 0 auto; padding: 0 0 var(--s-xxl); }
.points { list-style: none; margin: 0 0 var(--s-xl); padding: 0 var(--s-base); display: grid; gap: var(--s-sm); color: var(--body); }
/* 태블릿: 폭을 넓히고 체험 가게를 2열로 · 데스크톱: 소개 | 체험 가게 2단 (스타일가이드 §13) */
@media (min-width: 744px) {
  .landing { max-width: 1280px; padding: 0 var(--s-xl) var(--s-xxl); }
  .personas { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero h1 { font-size: 36px; }
}
@media (min-width: 1128px) {
  .land-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--s-xxl); align-items: start; padding-top: var(--s-xl); }
  .intro { position: sticky; top: var(--s-xl); }
  .hero { padding-top: var(--s-xl); }
  .hero h1 { font-size: 44px; line-height: 1.2; }
  .enter .stack:first-child { margin-top: var(--s-xxl); }
}
.hero { padding: var(--s-xxl) var(--s-base) var(--s-lg); display: flex; flex-direction: column; gap: var(--s-md); }
.brand { color: var(--primary); font-weight: 700; font-size: 20px; }
.lead { color: var(--body); font-size: 16px; }
.stack { padding: 0 var(--s-base); margin-bottom: var(--s-xl); }
.h { font-size: 20px; font-weight: 600; }
.personas { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-md); }
.persona { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px; padding: var(--s-base) var(--s-lg); cursor: pointer; }
.persona:hover { background: var(--canvas); border-color: var(--ink); }
.pl { font-weight: 600; font-size: 16px; color: var(--ink); }
.ph { color: var(--muted); font-size: 14px; }
.kakao { display: flex; align-items: center; justify-content: center; min-height: 56px; border-radius: var(--r-md); background: #fee500; color: #191919; font-weight: 600; text-decoration: none; }
.others { display: flex; gap: var(--s-lg); padding: 0 var(--s-base); flex-wrap: wrap; }
.others a { min-height: 48px; display: inline-flex; align-items: center; font-weight: 500; }
.err { color: var(--error); }
.foot { padding: var(--s-xl) var(--s-base) 0; }
</style>
