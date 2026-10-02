import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { z } from 'zod'

const here = path.dirname(fileURLToPath(import.meta.url))
// backend/.env (src/config → ../../.env, dist/src/config → ../../../.env 모두 찾는다)
loadDotenv({ path: path.resolve(here, '../../.env'), quiet: true })
loadDotenv({ path: path.resolve(here, '../../../.env'), quiet: true })

const flag = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(9522),
  HOST: z.string().default('127.0.0.1'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_TIMEZONE: z.string().default('+09:00'),
  SESSION_JWT_SECRET: z.string().min(16),
  AUTH_SUBJECT_PEPPER: z.string().min(16),
  AUTH_DEV_LOGIN: flag,
  PUBLIC_DEMO: flag,
  SEED_DEV_PASSWORD: z.string().default('hrh-dev-1234'),
  KAKAO_REST_KEY: z.string().optional().default(''),
  KAKAO_REDIRECT_URI: z.string().optional().default(''),
  DATA_GO_KR_KEY: z.string().optional().default(''),
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default('mailto:admin@example.com'),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  COOKIE_SECURE: flag,
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // 비밀값은 출력하지 않고 누락된 키 이름만 알린다
  const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  console.error(`[env] 환경 변수 오류: ${keys}`)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
