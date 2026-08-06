// public/sw.js
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })
let unreadCount = 0
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} }
  catch { payload = { title: 'TutorJamesConnect', body: event.data ? event.data.text() : '' } }
  const { title = 'TutorJamesConnect', body = '', sound_type = 'message', url = '/' } = payload
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) { client.postMessage({ type: 'push-received', title, body, sound_type, url }) }
    unreadCount++
    if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(unreadCount)
    await self.registration.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url, sound_type }, tag: url, renotify: true, vibrate: [200, 100, 200] })
  })())
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  unreadCount = 0
  if (self.navigator?.clearAppBadge) self.navigator.clearAppBadge()
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) { if (client.url.includes(url) && 'focus' in client) { client.postMessage({ type: 'notification-clicked' }); return client.focus() } }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-badge') { unreadCount = 0; if (self.navigator?.clearAppBadge) self.navigator.clearAppBadge() }
  if (event.data?.type === 'new-message') { unreadCount++; if (self.navigator?.setAppBadge) self.navigator.setAppBadge(unreadCount) }
})
