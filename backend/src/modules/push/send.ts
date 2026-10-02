/** Web Push 발송 (T071, research R6). VAPID 키가 없으면 항상 in_app 경로 */
import webpush from 'web-push'
import { env } from '../../config/env.js'
import { getPool, q, q1, exec } from '../../db/pool.js'

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
if (configured) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

export async function pushEnabledFor(storeId: number, accountId: number) {
  if (!configured) return false
  const r = await q1(
    getPool(),
    `SELECT s.alert_push_enabled AS on_, (SELECT COUNT(*) FROM push_subscription p WHERE p.account_id = ?) AS subs
       FROM store s WHERE s.store_id = ?`,
    [accountId, storeId],
  )
  return Boolean(r?.on_) && Number(r?.subs) > 0
}

export async function sendAlertPush(accountId: number, alertId: number) {
  const subs = await q(getPool(), 'SELECT * FROM push_subscription WHERE account_id = ?', [accountId])
  // 경보 문구는 단정하지 않는 고정 문구(BR-HRH-09)
  const payload = JSON.stringify({
    title: '하루한장',
    body: '최근 장사 흐름이 평소보다 조용해지는 경향이 보여요. 근거를 확인해 보세요.',
    url: `/pattern?alert=${alertId}`,
  })
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } }, payload)
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) await exec(getPool(), 'DELETE FROM push_subscription WHERE push_subscription_id = ?', [s.push_subscription_id])
      else throw e
    }
  }
}
