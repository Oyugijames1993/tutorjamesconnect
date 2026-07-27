// src/hooks/usePushNotifications.js
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import useNotificationSound from './useNotificationSound'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [subscribed, setSubscribed] = useState(false)
  const { playSound } = useNotificationSound()

  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined'

  // Register the service worker once, and wire up the "app is open" path —
  // when the SW hands us a push payload, play our real custom sound file,
  // same profiles the in-app WebSocket notifications already use.
  useEffect(() => {
    if (!supported) return

    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('Service worker registration failed:', err)
    })

    const onMessage = (event) => {
      if (event.data?.type !== 'push-received') return
      const soundType = event.data.sound_type === 'pending' ? 'pending' : 'message'
      const profileKey = soundType === 'pending' ? 'tjc_pending_sound_profile' : 'tjc_message_sound_profile'
      const profile = localStorage.getItem(profileKey) || (soundType === 'pending' ? 'ping' : 'chime')
      const soundEnabled = localStorage.getItem('tjc_sound_enabled')
      if (soundEnabled === null || soundEnabled === 'true') {
        playSound(soundType, profile)
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [supported, playSound])

  // Check whether this device already has an active subscription, so the
  // UI can show "on" instead of asking the person to enable it again.
  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      setSubscribed(!!existing)
    })
  }, [supported])

  const enable = useCallback(async () => {
    if (!supported) return { ok: false, reason: 'Push notifications are not supported on this browser.' }

    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== 'granted') {
      return { ok: false, reason: 'Permission was not granted.' }
    }

    try {
      const { data } = await api.get('/accounts/push/vapid-public-key/')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      })

      const json = sub.toJSON()
      await api.post('/accounts/push/subscribe/', {
        endpoint: json.endpoint,
        keys: json.keys,
      })

      setSubscribed(true)
      return { ok: true }
    } catch (err) {
      console.error('Push subscribe failed:', err)
      return { ok: false, reason: 'Something went wrong enabling notifications.' }
    }
  }, [supported])

  const disable = useCallback(async () => {
    if (!supported) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api.post('/accounts/push/unsubscribe/', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
    } catch (err) {
      console.error('Push unsubscribe failed:', err)
    } finally {
      setSubscribed(false)
    }
  }, [supported])

  return { supported, permission, subscribed, enable, disable }
}
