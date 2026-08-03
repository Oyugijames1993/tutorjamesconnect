// public/sw.js
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

// Track unread count
let unreadCount = 0

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} }
  catch { payload = { title: 'TutorJamesConnect', body: event.data ? event.data.text() : '' } }

  const {
    title = 'TutorJamesConnect',
    body = '',
    sound_type = 'message',
    url = '/',
  } = payload

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of allClients) {
      client.postMessage({ type: 'push-received', title, body, sound_type, url })
    }

    // Increment unread count
    unreadCount++

    // Update app badge (shows number on app icon)
    if (navigator.setAppBadge) {
      await navigator.setAppBadge(unreadCount)
    }

    await self.registration.showNotification(title, {
      body,
      icon:     '/icon-192.png',
      badge:    '/icon-192.png',
      data:     { url, sound_type },
      tag:      url,
      renotify: true,
      vibrate:  [200, 100, 200],
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  // Clear badge when user taps notification
  unreadCount = 0
  if (navigator.clearAppBadge) navigator.clearAppBadge()

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if (client.url.includes(url) && 'focus' in client) {
        client.postMessage({ type: 'notification-clicked' })
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})

// Clear badge when app is opened
self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-badge') {
    unreadCount = 0
    if (navigator.clearAppBadge) navigator.clearAppBadge()
  }
})
