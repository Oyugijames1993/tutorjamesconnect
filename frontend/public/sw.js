// public/sw.js
// Runs even when no tab is open — this is what makes push notifications
// work at all when the app isn't running.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'TutorJamesConnect', body: event.data ? event.data.text() : '' }
  }

  const {
    title = 'TutorJamesConnect',
    body = '',
    sound_type = 'message',
    url = '/',
  } = payload

  event.waitUntil((async () => {
    // If a tab is open anywhere (even backgrounded/minimized), hand it the
    // payload so the PAGE'S own JS can play our actual custom sound file —
    // service workers can't play audio themselves. Also lets an already-
    // focused, already-viewing-this-room tab suppress the OS popup instead
    // of double-notifying.
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    let handledByOpenTab = false
    for (const client of allClients) {
      client.postMessage({ type: 'push-received', title, body, sound_type, url })
      handledByOpenTab = true
    }

    // Always still show the OS notification too — even if a tab is open,
    // since the person may not be looking at it right now. The sound that
    // plays for THIS system notification is whatever the OS/browser
    // defaults to; there's no cross-browser way to pick a custom file here.
    await self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url, sound_type },
      tag: url,       // collapses multiple notifications for the same room into one
      renotify: true,
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if (client.url.includes(url) && 'focus' in client) {
        return client.focus()
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url)
    }
  })())
})