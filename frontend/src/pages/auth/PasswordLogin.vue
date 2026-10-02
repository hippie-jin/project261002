<!-- 아이디·비밀번호 로그인 공용 폼 (기관·운영) -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useSession } from '@/stores/session'
import ReasonButton from '@/components/ReasonButton.vue'

const props = defineProps<{ kind: 'owner' | 'org' | 'staff'; title: string; home: string }>()
const session = useSession()
const router = useRouter()
const loginId = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const missing = computed(() => (!loginId.value ? '아이디를 입력해 주세요' : !password.value ? '비밀번호를 입력해 주세요' : ''))

async function submit() {
  busy.value = true
  error.value = ''
  const r = await api(`/${props.kind}/auth/login`, { method: 'POST', body: { loginId: loginId.value.trim(), password: password.value } })
  busy.value = false
  if (!r.ok) {
    error.value = r.kind === 'unauthorized' ? '아이디 또는 비밀번호가 맞지 않아요.' : errorText(r)
    return
  }
  await session.load(true)
  router.push(props.home)
}
</script>

<template>
  <div class="login">
    <p v-if="session.config.publicDemo" class="demo-ribbon">체험용 서비스예요</p>
    <form class="box card" @submit.prevent="!missing && submit()">
      <RouterLink to="/" class="brand">하루한장</RouterLink>
      <h1>{{ title }}</h1>
      <label class="stack-sm"><span class="field-label">아이디</span><input v-model="loginId" class="input" autocomplete="username" /></label>
      <label class="stack-sm"><span class="field-label">비밀번호</span><input v-model="password" class="input" type="password" autocomplete="current-password" /></label>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <ReasonButton :disabled="!!missing" :reason="missing" :loading="busy" block tall @click="submit">로그인</ReasonButton>
    </form>
  </div>
</template>

<style scoped>
.login { min-height: 100vh; background: var(--canvas); }
.box { max-width: 420px; margin: var(--s-xxl) auto; display: flex; flex-direction: column; gap: var(--s-base); }
.brand { color: var(--primary); font-weight: 700; text-decoration: none; }
h1 { font-size: 22px; font-weight: 600; }
.stack-sm { display: flex; flex-direction: column; gap: 4px; }
.err { color: var(--error); }
</style>
