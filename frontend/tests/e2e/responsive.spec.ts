/**
 * 반응형 레이아웃 E2E — 스타일가이드 §13 구간(모바일 <744 · 태블릿 744~1127 · 데스크톱 ≥1128)
 * 요소의 실제 위치(boundingBox)로 열 배치를 확인한다. 체험 데이터를 바꾸므로 실행 후 db:seed:dev 로 되돌린다.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'

async function asOwner(page: Page, subject: string) {
  await page.context().clearCookies()
  const r = await page.request.post('/api/auth/dev-login', { headers: { 'X-Requested-With': 'hrh' }, data: { devSubject: subject } })
  expect(r.ok()).toBeTruthy()
}
async function box(l: Locator) {
  const b = await l.boundingBox()
  expect(b, '요소가 화면에 있어야 함').not.toBeNull()
  return b!
}
/** a 가 b 의 왼쪽에 나란히(같은 줄) 있는가 */
async function sideBySide(a: Locator, b: Locator) {
  const [x, y] = [await box(a), await box(b)]
  expect(x.x + x.width).toBeLessThanOrEqual(y.x + 1)
  expect(Math.abs(x.y - y.y)).toBeLessThan(Math.max(x.height, y.height))
}
/** a 가 b 의 위에 쌓여 있는가 */
async function stacked(a: Locator, b: Locator) {
  const [x, y] = [await box(a), await box(b)]
  expect(x.y + x.height).toBeLessThanOrEqual(y.y + 1)
}
async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, '가로 스크롤이 생기면 안 됨').toBeLessThanOrEqual(1)
}

test.describe('데스크톱 1440 — 사장님 화면', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

  test('첫 화면 — 소개 | 체험 가게 2단, 체험 가게 2열', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/')
    const intro = page.locator('.intro')
    const enter = page.locator('.enter')
    await sideBySide(intro, enter)
    const p = page.locator('.persona')
    await sideBySide(p.nth(0), p.nth(1))
    await noHorizontalScroll(page)
  })

  test('공통 틀 — 상단 메뉴, 하단 탭바 없음, 최대 폭 1280', async ({ page }) => {
    await asOwner(page, 'owner-steady')
    await page.goto('/calendar')
    const nav = page.getByRole('navigation', { name: '주요 메뉴' })
    await expect(nav.getByRole('link', { name: '장사 달력' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.tabbar')).toBeHidden()
    expect((await box(page.locator('main'))).width).toBeLessThanOrEqual(1280)
    // 상단 메뉴로 화면 이동
    await nav.getByRole('link', { name: '우리 가게 흐름' }).click()
    await expect(page).toHaveURL(/\/pattern$/)
    await noHorizontalScroll(page)
  })

  test('오늘 기록 — 입력 | 고른 내용·저장 패널, 패널이 선택을 따라 바뀜', async ({ page }) => {
    await asOwner(page, 'owner-starter')
    // 다른 시나리오(오늘 기록·9일 전 오프라인)와 겹치지 않도록 기록이 없는 11일 전 날짜를 쓴다
    const d = new Date(Date.now() + 9 * 3600e3 - 11 * 86400e3).toISOString().slice(0, 10)
    await page.goto(`/today?date=${d}`)
    const form = page.locator('.form-col')
    const side = page.locator('.side-col')
    await sideBySide(form, side)
    const summary = page.getByRole('region', { name: '고른 내용' })
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('아직 안 골랐어요')
    // 오늘장사 · 손님 수 나란히
    await sideBySide(page.getByRole('group', { name: '오늘장사' }), page.getByRole('group', { name: '손님 수' }))
    await page.getByRole('button', { name: /보통/ }).first().click()
    await page.getByRole('button', { name: '많음' }).click()
    await page.getByRole('button', { name: '신메뉴' }).click()
    await expect(summary).toContainText('보통')
    await expect(summary).toContainText('많음')
    await expect(summary).toContainText('신메뉴')
    // 저장 버튼은 오른쪽 패널 안
    const save = page.getByRole('button', { name: '이날 기록 저장' })
    const [s, sb] = [await box(save), await box(side)]
    expect(s.x).toBeGreaterThanOrEqual(sb.x - 1)
    await save.click()
    await expect(page.getByRole('heading', { name: '오늘 한 장 완료' })).toBeVisible()
    await noHorizontalScroll(page)
  })

  test('장사 달력 — 달력 | 상세 패널, 날짜 칸 48px', async ({ page }) => {
    await asOwner(page, 'owner-steady')
    await page.goto('/calendar')
    await expect(page.getByRole('heading', { name: '날짜를 눌러 보세요' })).toBeVisible()
    await page.locator('.day.recorded').first().click()
    await sideBySide(page.locator('.cal-col'), page.locator('.detail'))
    const num = await box(page.locator('.day.recorded .num').first())
    expect(num.width).toBeGreaterThanOrEqual(47)
    await noHorizontalScroll(page)
  })

  test('우리 가게 흐름 — 경향 카드 3열', async ({ page }) => {
    await asOwner(page, 'owner-steady')
    await page.goto('/pattern')
    await page.getByRole('tab', { name: '특별한 일' }).click()
    const cards = page.locator('.cards > .trend')
    await expect(cards.nth(2)).toBeVisible()
    await sideBySide(cards.nth(0), cards.nth(1))
    await sideBySide(cards.nth(1), cards.nth(2))
    await noHorizontalScroll(page)
  })

  test('동네 비교 — 동네 묶음 | 내 가게 나란히', async ({ page }) => {
    await asOwner(page, 'owner-steady')
    await page.goto('/compare')
    const t = page.locator('.side > .trend')
    await expect(t.nth(1)).toBeVisible()
    await sideBySide(t.nth(0), t.nth(1))
    await noHorizontalScroll(page)
  })

  test('설정 — 카드 2열, 더 자세히 — 읽기 폭 760', async ({ page }) => {
    await asOwner(page, 'owner-paid')
    await page.goto('/settings')
    const c = page.locator('.set-grid > .card')
    await sideBySide(c.nth(0), c.nth(1))
    await page.goto('/paid')
    expect((await box(page.locator('.narrow'))).width).toBeLessThanOrEqual(760)
    await noHorizontalScroll(page)
  })
})

test.describe('태블릿 900 — 사장님 화면', () => {
  test.use({ viewport: { width: 900, height: 1100 }, isMobile: false, hasTouch: true })

  test('상단 메뉴, 입력 1열 + 고른 내용 패널 숨김, 경향 카드 2열', async ({ page }) => {
    await asOwner(page, 'owner-steady')
    await page.goto('/today')
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible()
    await expect(page.locator('.tabbar')).toBeHidden()
    await expect(page.getByRole('region', { name: '고른 내용' })).toBeHidden()
    await stacked(page.locator('.form-col'), page.locator('.side-col'))
    await sideBySide(page.getByRole('group', { name: '오늘장사' }), page.getByRole('group', { name: '손님 수' }))
    await page.goto('/pattern')
    await page.getByRole('tab', { name: '특별한 일' }).click()
    const cards = page.locator('.cards > .trend')
    await sideBySide(cards.nth(0), cards.nth(1))
    await stacked(cards.nth(0), cards.nth(2)) // 3번째 카드는 다음 줄
    await page.goto('/calendar')
    await page.locator('.day.recorded').first().click()
    await sideBySide(page.locator('.cal-col'), page.locator('.detail'))
    await noHorizontalScroll(page)
  })
})

test.describe('모바일 — 기존 배치 유지', () => {
  // 기본 설정(playwright.config.ts)이 Pixel 7 모바일 뷰포트

  test('하단 탭바, 상단 메뉴 숨김, 한 줄로 쌓기', async ({ page }) => {
    await asOwner(page, 'owner-steady')
    await page.goto('/today')
    await expect(page.locator('.tabbar')).toBeVisible()
    await expect(page.getByRole('navigation', { name: '주요 메뉴' }).first()).toBeVisible() // 하단 탭바(같은 이름)
    await expect(page.locator('.desk-nav')).toBeHidden()
    await stacked(page.getByRole('group', { name: '오늘장사' }), page.getByRole('group', { name: '손님 수' }))
    await page.goto('/compare')
    const t = page.locator('.side > .trend')
    await stacked(t.nth(0), t.nth(1))
    await noHorizontalScroll(page)
  })
})
