import { defineConfig, devices } from '@playwright/test'

// 기본은 공개 주소. 로컬 확인은 E2E_BASE_URL=http://127.0.0.1:9502
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1, // 같은 시드 데이터를 쓰므로 순서대로
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://p2.sumzip.com',
    ...devices['Pixel 7'], // 모바일 뷰포트(사장님 화면 기준)
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    screenshot: 'only-on-failure',
  },
})
