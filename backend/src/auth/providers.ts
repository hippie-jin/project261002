/**
 * 사장님 인증 공급자 (T023, research R8) — 명세 Q2 답이 바뀌어도 이 파일 안에서만 교체한다.
 * 외부 식별자는 저장하지 않고 SHA-256(pepper ':' provider ':' subject) 만 저장한다(BR-HRH-01).
 */
import { createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

export type ProviderName = 'kakao' | 'dev'

export function subjectHash(provider: ProviderName, subject: string) {
  return createHash('sha256').update(`${env.AUTH_SUBJECT_PEPPER}:${provider}:${subject}`).digest('hex')
}

export const kakao = {
  enabled: () => Boolean(env.KAKAO_REST_KEY && env.KAKAO_REDIRECT_URI),
  authorizeUrl(state: string) {
    const u = new URL('https://kauth.kakao.com/oauth/authorize')
    u.searchParams.set('client_id', env.KAKAO_REST_KEY)
    u.searchParams.set('redirect_uri', env.KAKAO_REDIRECT_URI)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('state', state)
    return u.toString()
  },
  /** 인가 코드 → 카카오 회원 번호(subject) */
  async subjectFromCode(code: string): Promise<string> {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.KAKAO_REST_KEY,
        redirect_uri: env.KAKAO_REDIRECT_URI,
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error(`kakao token ${tokenRes.status}`)
    const { access_token } = (await tokenRes.json()) as { access_token: string }
    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${access_token}` } })
    if (!meRes.ok) throw new Error(`kakao me ${meRes.status}`)
    const me = (await meRes.json()) as { id: number }
    return String(me.id)
  },
  newState: () => randomBytes(16).toString('hex'),
}
