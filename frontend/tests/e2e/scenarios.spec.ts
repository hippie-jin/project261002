/**
 * 수용 시나리오 E2E (T102, quickstart §6, seed/README.md 페르소나)
 * 체험 데이터를 바꾸므로 실행 후 `cd backend && npm run db:seed:dev` 로 되돌린다.
 *   E2E_SHOTS=<폴더>        스크린숏 저장 위치(선택)
 *   E2E_DEMO_PASSWORD=<pw>  기관·운영 시드 비밀번호
 */
import { test, expect, type Page } from '@playwright/test'

const SHOTS = process.env.E2E_SHOTS
const PW = process.env.E2E_DEMO_PASSWORD ?? 'hrh-dev-1234'
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}
async function asOwner(page: Page, subject: string) {
  await page.context().clearCookies()
  const r = await page.request.post('/api/auth/dev-login', { headers: { 'X-Requested-With': 'hrh' }, data: { devSubject: subject } })
  expect(r.ok()).toBeTruthy()
}
async function asPw(page: Page, kind: 'org' | 'staff', loginId: string) {
  await page.context().clearCookies()
  await page.goto(`/${kind}/login`)
  await page.getByLabel('아이디').fill(loginId)
  await page.getByLabel('비밀번호').fill(PW)
  await page.getByRole('button', { name: '로그인' }).click()
}

test('첫 화면 — 체험 페르소나와 로그인 진입', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '하루 장사, 한 장에 담다' })).toBeVisible()
  await expect(page.getByText('망원동 분식 · 기록 두 달')).toBeVisible()
  await expect(page.getByText('체험용 서비스예요')).toBeVisible()
  await shot(page, '00-landing')
})

test('US1 가입 — G0·G1 차단과 한 번에 저장, 이어서 탈퇴(T094)', async ({ page }) => {
  await page.context().clearCookies()
  const subject = `owner-e2e-${Date.now().toString(36)}`
  await page.request.post('/api/auth/dev-login', { headers: { 'X-Requested-With': 'hrh' }, data: { devSubject: subject } })
  await page.goto('/start')
  const start = page.getByRole('button', { name: '동의하고 시작' })
  await expect(start).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('필수 항목에 동의해 주세요 (G0)')).toBeVisible()
  await shot(page, '01-start-g0')
  await page.getByRole('button', { name: '동의하지 않음' }).click()
  await expect(page.getByRole('heading', { name: '동의해야 쓸 수 있어요' })).toBeVisible()
  await page.getByRole('button', { name: '처음으로' }).click()
  await page.getByText('위 내용을 확인했고 동의해요 (필수)').click()
  await start.click()
  await page.getByRole('button', { name: '분식(샘플)' }).click()
  await expect(page.getByText('지역을 골라 주세요 - 업종과 지역은 꼭 필요해요 (G1)')).toBeVisible()
  await shot(page, '02-start-g1')
  await page.getByLabel('시·구').selectOption({ label: '마포구(샘플)' })
  await page.getByLabel('동').selectOption({ label: '망원동(샘플)' })
  await page.getByRole('button', { name: '완료' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByText('오늘 장사는 어땠나요?')).toBeVisible()
  await expect(page.getByRole('button', { name: /비교 - 잠김 G4/ })).toBeVisible()
  // 탈퇴(즉시 삭제)
  await page.goto('/settings')
  await page.getByRole('button', { name: '탈퇴하기' }).click()
  await page.getByText('모든 기록이 바로 지워지는 것을 확인했어요').click()
  await page.getByRole('button', { name: '탈퇴', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  const me = await page.request.get('/api/me')
  expect(me.status()).toBe(401)
})

test('US2 30초 기록 — G2 이유 줄, 저장 즉시 완료, 날씨 확인 필요', async ({ page }) => {
  await asOwner(page, 'owner-starter')
  await page.goto('/today')
  await page.getByRole('button', { name: /좋음/ }).first().click()
  const save = page.getByRole('button', { name: '오늘 기록 저장' })
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('손님 수를 골라 주세요 - 오늘장사와 손님 수는 꼭 필요해요 (G2)')).toBeVisible()
  await shot(page, '03-today-g2')
  await page.getByRole('button', { name: '평소' }).click()
  await page.getByRole('button', { name: '할인행사' }).click()
  const t0 = Date.now()
  await save.click()
  await expect(page.getByRole('heading', { name: '오늘 한 장 완료' })).toBeVisible()
  expect(Date.now() - t0).toBeLessThan(3000)
  await expect(page.getByText('확인 필요').first()).toBeVisible()
  await shot(page, '04-today-done')
})

test('US2 오프라인 저장 → 전송 대기 → 연결 후 전송(UC2 E3)', async ({ page, context }) => {
  await asOwner(page, 'owner-starter')
  const d = new Date(Date.now() + 9 * 3600e3 - 9 * 86400e3).toISOString().slice(0, 10) // 9일 전(KST)
  await page.goto(`/today?date=${d}`)
  await page.getByRole('button', { name: /보통/ }).first().click()
  await page.getByRole('button', { name: '적음' }).click()
  await context.setOffline(true)
  await page.getByRole('button', { name: /이날 기록 저장|고쳐서 저장/ }).click()
  await expect(page.getByRole('heading', { name: '기기에 저장했어요' })).toBeVisible()
  await expect(page.getByText('전송 대기')).toBeVisible()
  await shot(page, '05-today-offline')
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(async () => (await page.request.get(`/api/records/${d}`)).status(), { timeout: 15000 })
    .toBe(200)
})

test('US3 달력 — 모양 표식, 쉼, 기록 안 한 날, 확인 필요', async ({ page }) => {
  await asOwner(page, 'owner-steady')
  await page.goto('/calendar')
  await expect(page.getByRole('grid')).toBeVisible()
  await expect(page.getByText('쉼').first()).toBeVisible()
  const recorded = page.locator('.day.recorded').first()
  await recorded.click()
  await expect(page.getByRole('button', { name: '기록 고치기' })).toBeVisible()
  await page.getByRole('button', { name: '이번 달 요약 보기' }).click()
  await expect(page.getByText(/이번 달 좋음 \d+일/)).toBeVisible()
  await shot(page, '06-calendar')
})

test('US4 패턴 — G3 차단(starter) / 경향 카드(steady)', async ({ page }) => {
  await asOwner(page, 'owner-starter')
  await page.goto('/pattern')
  await expect(page.getByText('아직 흐름을 보여 드릴 수 없어요')).toBeVisible()
  await expect(page.getByText(/기준 14일이 쌓이면 보여 드려요 \(G3\)/)).toBeVisible()
  await expect(page.getByRole('tab', { name: /요일별/ })).toHaveAttribute('aria-disabled', 'true')
  await shot(page, '07-pattern-g3')
  await asOwner(page, 'owner-steady')
  await page.goto('/pattern')
  await expect(page.getByText('참고 정보예요 - 사장님 경험과 함께 판단해 주세요').first()).toBeVisible()
  await expect(page.locator('.sentence').first()).toContainText('경향')
  await page.getByRole('tab', { name: '날씨별' }).click()
  await expect(page.getByText(/비 온 날 \d+일 중/)).toBeVisible()
  await shot(page, '08-pattern-steady')
  const text = await page.locator('main').innerText()
  for (const w of ['때문에', '덕분에']) expect(text).not.toContain(w)
})

test('US5 경보 — 앱 안 경보 카드, 확인했어요', async ({ page }) => {
  await asOwner(page, 'owner-declining')
  await page.goto('/pattern')
  await expect(page.getByText('최근 2주, 평소보다 조용한 날이 늘어나는 경향이 보여요')).toBeVisible()
  await shot(page, '09-alert')
  await page.getByRole('button', { name: '확인했어요' }).click()
  await expect(page.getByRole('button', { name: '확인했어요' })).toHaveCount(0)
})

test('US6 비교 — G4(starter) · G5(cafe) · 나란히(steady)', async ({ page }) => {
  await asOwner(page, 'owner-cafe-neighbor')
  await page.goto('/compare')
  await expect(page.getByText('아직 우리 동네 자료가 모이는 중이에요')).toBeVisible()
  await expect(page.getByText('참여 가게가 늘어나면 자동으로 풀려요')).toBeVisible()
  await shot(page, '10-compare-g5')
  await asOwner(page, 'owner-steady')
  await page.goto('/compare')
  await expect(page.getByText(/동네 익명 묶음/)).toBeVisible()
  await expect(page.getByText(/내 가게 · 같은 기간/)).toBeVisible()
  await expect(page.locator('main')).not.toContainText('상위')
  await shot(page, '11-compare-steady')
  await asOwner(page, 'owner-starter')
  await page.goto('/compare')
  await expect(page.getByText('동네 흐름을 보려면 익명 참여가 필요해요')).toBeVisible()
  await expect(page.getByRole('button', { name: '비교 보기' })).toHaveAttribute('aria-disabled', 'true')
})

test('US7 유료 — G7 확인 전 받기 비활성', async ({ page }) => {
  await asOwner(page, 'owner-paid')
  await page.goto('/paid')
  const get = page.getByRole('button', { name: '보고서 받기' })
  await expect(get).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('들어가는 정보를 확인해 주세요 (G7)')).toBeVisible()
  await shot(page, '12-paid-g7')
  await page.getByText('들어가는 정보를 확인했어요').click()
  await expect(get).toHaveAttribute('aria-disabled', 'false')
  await page.getByText('기록 백업 · 내보내기').click()
  await expect(page.getByText('결제가 끝나면 보고서를 만들 수 있어요 (G6)')).toBeVisible()
})

test.describe('데스크톱', () => {
  test.use({ viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false })

  test('US8 기관 — 표시 불가 칸·롤업 억제 / 계약 만료 G8', async ({ page }) => {
    await asPw(page, 'org', 'mapo-econ')
    await expect(page).toHaveURL(/\/org$/)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByText('표시 불가 - 표본 부족').first()).toBeVisible()
    await expect(page.getByRole('row', { name: /망원동\(샘플\)\s+분식\(샘플\)/ })).toContainText('%')
    await expect(page.getByText('개별 가게 기록과 원자료는 제공하지 않아요.')).toBeVisible()
    await shot(page, '13-org')
    await asPw(page, 'org', 'expired-merchant')
    await expect(page.getByText('이용 계약이 만료됐거나 권한이 없어요 (G8)')).toBeVisible()
    await shot(page, '14-org-g8')
  })

  test('RBAC 운영 콘솔 — 역할별 탭', async ({ page }) => {
    await asPw(page, 'staff', 'data-manager')
    await expect(page.getByRole('button', { name: '기준값' })).toBeVisible()
    await expect(page.getByRole('button', { name: '운영 인력' })).toHaveCount(0)
    await asPw(page, 'staff', 'auditor')
    await expect(page.getByRole('button', { name: '감사' })).toBeVisible()
    await expect(page.getByRole('button', { name: '기준값' })).toHaveCount(0)
    await asPw(page, 'staff', 'admin')
    await page.getByRole('button', { name: '운영 인력' }).click()
    await expect(page.getByRole('cell', { name: 'data-manager', exact: true })).toBeVisible()
    await shot(page, '15-console')
    // 사장님 세션으로 운영 화면 → 권한 없음
    await asOwner(page, 'owner-steady')
    await page.goto('/staff')
    await expect(page.getByText('이 화면을 볼 수 있는 권한이 없어요')).toBeVisible()
  })
})
