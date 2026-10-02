<!-- S9 운영 콘솔 (T093, RBAC) — 권한에 따라 탭이 보인다. 개별 사장님 기록은 어떤 탭에도 없다 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorText } from '@/api/client'
import { useSession } from '@/stores/session'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
import ReasonButton from '@/components/ReasonButton.vue'

const session = useSession()
const router = useRouter()
const ALL = [
  { key: 'thresholds', label: '기준값', perm: 'threshold.manage' },
  { key: 'codes', label: '코드', perm: 'code.read' },
  { key: 'orgs', label: '기관·계약', perm: 'org.manage' },
  { key: 'audit', label: '감사', perm: 'audit.read' },
  { key: 'staff', label: '운영 인력', perm: 'role.manage' },
]
const tabs = computed(() => ALL.filter((t) => session.can(t.perm)))
const tab = ref(tabs.value[0]?.key ?? '')
const msg = ref('')
const once = ref('') // 임시 비밀번호 1회 표시

// 기준값
const LABEL: Record<string, string> = {
  g3_min_records: '분석 최소 기록 수 (G3)',
  g5_min_stores: '비교 최소 참여 가게 수 (G5)',
  alert_window_days: '경보 판정 기간',
  alert_min_decline: '경보 하락 폭 (0~1)',
}
const thresholds = ref<any[]>([])
const edits = ref<Record<string, string>>({})
// 코드
const codeKind = ref<'regions' | 'business-types' | 'sales-bands'>('regions')
const codes = ref<any[]>([])
const newCode = ref<any>({})
// 기관
const orgs = ref<any[]>([])
const newOrg = ref({ orgName: '', jurisdiction: '' })
const newAccount = ref<Record<number, string>>({})
// 감사
const auditKind = ref('gate-events')
const audit = ref<any[]>([])
// 운영 인력
const staff = ref<any[]>([])
const newStaff = ref({ loginId: '', displayName: '', roles: [] as string[] })
const ROLES = ['data_manager', 'operator', 'auditor', 'admin']
const ROLE_LABEL: Record<string, string> = { data_manager: '데이터 담당자', operator: '현장 운영자', auditor: '감사 담당자', admin: '시스템 관리자' }

async function load() {
  msg.value = ''
  once.value = ''
  if (tab.value === 'thresholds') {
    const r = await api<any[]>('/admin/thresholds')
    if (r.ok) {
      thresholds.value = r.data
      edits.value = Object.fromEntries(r.data.map((t) => [t.key, t.value === null ? '' : String(t.value)]))
    }
  } else if (tab.value === 'codes') {
    const r = await api<any[]>(`/admin/codes/${codeKind.value}`)
    if (r.ok) codes.value = r.data
  } else if (tab.value === 'orgs') {
    const r = await api<any[]>('/admin/orgs')
    if (r.ok) orgs.value = r.data
  } else if (tab.value === 'audit') {
    const r = await api<any[]>(`/admin/audit/${auditKind.value}`)
    if (r.ok) audit.value = r.data
  } else if (tab.value === 'staff') {
    const r = await api<any[]>('/admin/staff')
    if (r.ok) staff.value = r.data
  }
}
onMounted(load)
watch([tab, codeKind, auditKind], load)

async function saveThreshold(key: string) {
  const raw = edits.value[key].trim()
  if (raw === '' && !confirm('값을 비우면 이 게이트는 계속 막혀요. 비울까요?')) return
  const r = await api(`/admin/thresholds/${key}`, { method: 'PUT', body: { value: raw === '' ? null : Number(raw) } })
  msg.value = r.ok ? '저장했어요.' : errorText(r)
  load()
}
async function addCode() {
  const body = codeKind.value === 'sales-bands' ? { ...newCode.value, sortOrder: Number(newCode.value.sortOrder) } : newCode.value
  const r = await api(`/admin/codes/${codeKind.value}`, { method: 'POST', body })
  msg.value = r.ok ? '저장했어요.' : errorText(r)
  if (r.ok) newCode.value = {}
  load()
}
async function setContract(o: any, status: 'active' | 'expired') {
  const r = await api(`/admin/orgs/${o.orgId}/contract`, { method: 'PATCH', body: { status, endDate: null } })
  msg.value = r.ok ? `계약을 ${status === 'active' ? '유효' : '만료'}로 바꿨어요.` : errorText(r)
  load()
}
async function addOrg() {
  const r = await api('/admin/orgs', { method: 'POST', body: { orgName: newOrg.value.orgName, jurisdiction: newOrg.value.jurisdiction.split(',').map((s) => s.trim()).filter(Boolean) } })
  msg.value = r.ok ? '기관을 등록했어요.' : errorText(r)
  load()
}
async function addOrgAccount(o: any) {
  const r = await api<any>(`/admin/orgs/${o.orgId}/accounts`, { method: 'POST', body: { loginId: newAccount.value[o.orgId] } })
  if (r.ok) once.value = `${newAccount.value[o.orgId]} 임시 비밀번호: ${r.data.temporaryPassword} (지금 한 번만 보여요)`
  else msg.value = errorText(r)
  load()
}
async function addStaff() {
  const r = await api<any>('/admin/staff', { method: 'POST', body: newStaff.value })
  if (r.ok) once.value = `${newStaff.value.loginId} 임시 비밀번호: ${r.data.temporaryPassword} (지금 한 번만 보여요)`
  else msg.value = errorText(r)
  load()
}
async function setRoles(s: any, role: string, on: boolean) {
  const roles = on ? [...s.roles, role] : s.roles.filter((x: string) => x !== role)
  const r = await api(`/admin/staff/${s.staffAccountId}`, { method: 'PATCH', body: { roles } })
  msg.value = r.ok ? '역할을 바꿨어요.' : r.kind === 'error' && r.status === 409 ? '마지막 관리자이거나 자기 자신의 관리자 역할은 뺄 수 없어요.' : errorText(r)
  load()
}
const cols = computed(() => (audit.value[0] ? Object.keys(audit.value[0]) : []))
async function logout() {
  await session.logout()
  router.push('/staff/login')
}
</script>

<template>
  <DesktopLayout brand="운영 콘솔" :who="session.roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ')" :tabs="tabs" :active="tab" @tab="(k) => (tab = k)" @logout="logout">
    <p v-if="session.config.publicDemo" class="demo-ribbon">체험용 화면이에요 · 바꾼 값은 체험 데이터에만 적용돼요</p>
    <p v-if="!tabs.length" class="muted">볼 수 있는 메뉴가 없어요.</p>
    <p v-if="msg" role="status">{{ msg }}</p>
    <p v-if="once" class="once" role="alert">{{ once }}</p>

    <section v-if="tab === 'thresholds'" class="card">
      <h3>기준값</h3>
      <p class="muted small">값이 비어 있으면 해당 게이트는 계속 막혀요(분석·비교·경보·보고서). 원천에 수치가 없어 데이터 담당자가 정해요.</p>
      <table>
        <tbody>
          <tr v-for="t in thresholds" :key="t.key">
            <td>{{ LABEL[t.key] ?? t.key }}</td>
            <td><input v-model="edits[t.key]" class="input sm" inputmode="decimal" :aria-label="LABEL[t.key]" /> <span class="muted small">{{ t.unitLabel }}</span></td>
            <td><button type="button" class="sec" @click="saveThreshold(t.key)">저장</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="tab === 'codes'" class="card">
      <h3>코드</h3>
      <div class="row">
        <button v-for="k in (['regions', 'business-types', 'sales-bands'] as const)" :key="k" type="button" class="pill" :class="{ on: codeKind === k }" @click="codeKind = k">{{ { regions: '지역', 'business-types': '업종', 'sales-bands': '매출 구간' }[k] }}</button>
      </div>
      <table>
        <thead><tr><th>코드</th><th>이름</th><th v-if="codeKind === 'regions'">상위</th><th v-if="codeKind === 'regions'">관측소</th></tr></thead>
        <tbody><tr v-for="c in codes" :key="c.code"><td>{{ c.code }}</td><td>{{ c.name }}</td><td v-if="codeKind === 'regions'">{{ c.parentCode ?? '-' }}</td><td v-if="codeKind === 'regions'">{{ c.weatherStationId ?? '-' }}</td></tr></tbody>
      </table>
      <div v-if="session.can('code.manage')" class="row add">
        <input v-model="newCode.code" class="input sm" placeholder="코드" aria-label="코드" />
        <input v-model="newCode.name" class="input sm" placeholder="이름" aria-label="이름" />
        <input v-if="codeKind === 'regions'" v-model="newCode.parentCode" class="input sm" placeholder="상위 코드(선택)" aria-label="상위 코드" />
        <input v-if="codeKind === 'sales-bands'" v-model="newCode.sortOrder" class="input sm" placeholder="순서" aria-label="순서" />
        <ReasonButton :disabled="!newCode.code || !newCode.name" reason="코드와 이름을 입력해 주세요" @click="addCode">추가</ReasonButton>
      </div>
    </section>

    <section v-if="tab === 'orgs'" class="card">
      <h3>기관 · 계약</h3>
      <table>
        <thead><tr><th>기관</th><th>계약</th><th>관할</th><th>기관 계정</th><th></th></tr></thead>
        <tbody>
          <tr v-for="o in orgs" :key="o.orgId">
            <td>{{ o.orgName }}</td>
            <td>{{ o.contractStatus === 'active' ? '유효' : '만료' }}</td>
            <td>{{ o.jurisdiction.join(', ') }}</td>
            <td>{{ o.accounts.join(', ') || '-' }}<div class="row"><input v-model="newAccount[o.orgId]" class="input sm" placeholder="새 아이디" aria-label="새 기관 계정 아이디" /><button type="button" class="sec" :disabled="!newAccount[o.orgId]" @click="addOrgAccount(o)">발급</button></div></td>
            <td><button v-if="session.can('contract.manage')" type="button" class="sec" @click="setContract(o, o.contractStatus === 'active' ? 'expired' : 'active')">{{ o.contractStatus === 'active' ? '만료 처리' : '유효로 갱신' }}</button></td>
          </tr>
        </tbody>
      </table>
      <div class="row add">
        <input v-model="newOrg.orgName" class="input sm" placeholder="기관 이름" aria-label="기관 이름" />
        <input v-model="newOrg.jurisdiction" class="input sm" placeholder="관할 지역 코드(쉼표로)" aria-label="관할 지역 코드" />
        <ReasonButton :disabled="!newOrg.orgName || !newOrg.jurisdiction" reason="기관 이름과 관할 지역을 입력해 주세요" @click="addOrg">기관 등록</ReasonButton>
      </div>
    </section>

    <section v-if="tab === 'audit'" class="card">
      <h3>감사</h3>
      <div class="row">
        <button v-for="k in ['gate-events', 'exports', 'org-queries', 'anon-cells', 'rbac-grants']" :key="k" type="button" class="pill" :class="{ on: auditKind === k }" @click="auditKind = k">
          {{ { 'gate-events': '게이트 이력', exports: '파일 반출', 'org-queries': '기관 조회', 'anon-cells': '익명 칸 가게 수', 'rbac-grants': '역할 변경' }[k] }}
        </button>
      </div>
      <p class="small muted">개별 사장님의 장사 기록은 감사 화면에도 나오지 않아요.</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th v-for="c in cols" :key="c">{{ c }}</th></tr></thead>
          <tbody><tr v-for="(row, i) in audit" :key="i"><td v-for="c in cols" :key="c">{{ row[c] ?? '-' }}</td></tr></tbody>
        </table>
      </div>
    </section>

    <section v-if="tab === 'staff'" class="card">
      <h3>운영 인력 · 역할</h3>
      <table>
        <thead><tr><th>아이디</th><th>이름</th><th v-for="r in ROLES" :key="r">{{ ROLE_LABEL[r] }}</th></tr></thead>
        <tbody>
          <tr v-for="s in staff" :key="s.staffAccountId">
            <td>{{ s.loginId }}</td><td>{{ s.displayName }}</td>
            <td v-for="r in ROLES" :key="r"><input type="checkbox" :checked="s.roles.includes(r)" :aria-label="`${s.loginId} ${ROLE_LABEL[r]}`" @change="setRoles(s, r, ($event.target as HTMLInputElement).checked)" /></td>
          </tr>
        </tbody>
      </table>
      <div class="row add">
        <input v-model="newStaff.loginId" class="input sm" placeholder="아이디" aria-label="새 운영 인력 아이디" />
        <input v-model="newStaff.displayName" class="input sm" placeholder="이름" aria-label="이름" />
        <label v-for="r in ROLES" :key="r" class="small"><input v-model="newStaff.roles" type="checkbox" :value="r" /> {{ ROLE_LABEL[r] }}</label>
        <ReasonButton :disabled="!newStaff.loginId || !newStaff.displayName || !newStaff.roles.length" reason="아이디·이름·역할을 정해 주세요" @click="addStaff">계정 만들기</ReasonButton>
      </div>
    </section>
  </DesktopLayout>
</template>

<style scoped>
h3 { font-size: 20px; font-weight: 600; margin-bottom: var(--s-sm); }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: var(--s-base); }
th { text-align: left; font-size: 13px; color: var(--muted); padding: 8px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
td { padding: 8px; border-bottom: 1px solid var(--hairline-soft); vertical-align: middle; }
.input.sm { height: 44px; width: auto; min-width: 140px; }
.sec { min-height: 40px; padding: 0 14px; border-radius: var(--r-sm); border: 1px solid var(--hairline-strong); background: var(--surface-elevated); color: var(--ink); font-weight: 600; }
.sec:disabled { border-color: var(--border-strong); color: var(--muted-soft); }
.pill { min-height: 40px; padding: 0 16px; border-radius: var(--r-md); border: 1px solid var(--hairline-strong); background: transparent; color: var(--body); font-size: 14px; }
.pill.on { background: var(--ink); color: var(--canvas); border-color: var(--ink); }
.add { margin-top: var(--s-base); align-items: flex-start; }
.tablewrap { overflow-x: auto; }
.once { border: 1px solid var(--ink); background: var(--primary-soft); color: var(--ink); border-radius: var(--r-sm); padding: var(--s-md); font-weight: 600; }
</style>
