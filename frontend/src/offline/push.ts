/** Web Push 구독 (T075) — 권한 요청은 사장님이 직접 누를 때만 */
import { api } from '@/api/client'

function urlB64ToUint8(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function subscribePush(vapidPublicKey: string | null): Promise<'ok' | 'denied' | 'unsupported' | 'unconfigured'> {
  if (!pushSupported()) return 'unsupported'
  if (!vapidPublicKey) return 'unconfigured'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapidPublicKey) }))
  const j = sub.toJSON() as any
  await api('/push/subscriptions', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } })
  return 'ok'
}
