import { env } from './config/env.js'
import { createApp } from './app.js'
import { startEnvRetrySchedule } from './jobs/envRetry.js'

const { app, routeCount } = createApp()
app.listen(env.PORT, env.HOST, () => {
  console.log(`[hrh] API http://${env.HOST}:${env.PORT}/api — 라우트 ${routeCount}개 (권한 선언 확인됨)`)
  startEnvRetrySchedule()
})
