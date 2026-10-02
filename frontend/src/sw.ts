/// <reference lib="webworker" />
/**
 * Service Worker (T055, T075) — 앱 셸 프리캐시, Background Sync(대기열 비우기 요청), Web Push 표시·클릭
 * /api 는 캐시하지 않는다(기록 대기열은 앱의 IndexedDB 가 관리).
 */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any }

precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

async function askClientsToFlush() {
  const cs = await self.clients.matchAll({ type: 'window' })
  cs.forEach((c) => c.postMessage('flush-outbox'))
}
self.addEventListener('sync', (e: any) => {
  if (e.tag === 'hrh-outbox') e.waitUntil(askClientsToFlush())
})

self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? { title: '하루한장', body: '확인할 내용이 있어요', url: '/today' }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png', data: { url: data.url } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/today'
  e.waitUntil(
    (async () => {
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const c = cs[0] as WindowClient | undefined
      if (c) {
        await c.navigate(url)
        return c.focus()
      }
      return self.clients.openWindow(url)
    })(),
  )
})
