// src/components/InstallBanner.jsx
import { useState, useEffect } from 'react'

const DISMISS_KEY = 'tjc_install_banner_dismissed'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')
  const [installed, setInstalled] = useState(isStandalone())
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    if (installed || dismissed) return

    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installed, dismissed])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  if (installed || dismissed) return null

  // Android/Chrome/Edge — real one-tap install
  if (deferredPrompt) {
    return (
      <div style={S.banner}>
        <span style={S.text}>📲 Install TutorJamesConnect for notifications, even when your browser's closed.</span>
        <div style={S.actions}>
          <button style={S.installBtn} onClick={install}>Install</button>
          <button style={S.dismissBtn} onClick={dismiss}>Not now</button>
        </div>
      </div>
    )
  }

  // iOS Safari — no install API exists; show manual steps instead
  if (isIOS() && !window.navigator.standalone) {
    return (
      <div style={S.banner}>
        <span style={S.text}>
          📲 For notifications on iPhone, add this to your Home Screen:
          tap <strong>Share</strong> ⬆️, then <strong>Add to Home Screen</strong>.
        </span>
        <div style={S.actions}>
          <button style={S.dismissBtn} onClick={dismiss}>Got it</button>
        </div>
      </div>
    )
  }

  return null
}

const S = {
  banner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    flexWrap: 'wrap', padding: '9px 16px', background: '#fef6e0', borderBottom: '1px solid #f0dca0',
    fontSize: 13, color: '#5b5228',
  },
  text: { flex: 1, minWidth: 200 },
  actions: { display: 'flex', gap: 8, flexShrink: 0 },
  installBtn: {
    padding: '6px 14px', borderRadius: 8, border: 'none', background: '#00a884',
    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  dismissBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid #d8c48a', background: 'none',
    color: '#5b5228', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
}
