<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSession } from '@/stores/session'
const session = useSession()
const router = useRouter()
async function out() {
  await session.logout()
  router.push('/')
}
</script>
<template>
  <div class="fb card">
    <h1>이 화면을 볼 수 있는 권한이 없어요</h1>
    <p class="muted">다른 계정으로 로그인하면 볼 수 있어요.</p>
    <div class="row">
      <RouterLink to="/">첫 화면으로</RouterLink>
      <button type="button" class="link-btn" @click="out">로그아웃</button>
    </div>
  </div>
</template>
<style scoped>
.fb { max-width: 480px; margin: var(--s-xxl) auto; display: flex; flex-direction: column; gap: var(--s-base); }
h1 { font-size: 22px; font-weight: 600; }
</style>
