// src/pages/LinkDevice.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function LinkDevice() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [qrContent, setQrContent] = useState('')
  const [status, setStatus] = useState('loading') // loading | pending | expired | linked | error
  const tokenRef = useRef(null)
  const pollRef  = useRef(null)

  const createSession = async () => {
    setStatus('loading')
    try {
      const res = await api.post('/accounts/qr-session/create/')
      tokenRef.current = res.data.token
      setQrContent(res.data.qr_content)
      setStatus('pending')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    createSession()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (status !== 'pending') return

    pollRef.current = setInterval(async () => {
      if (!tokenRef.current) return
      try {
        const res = await api.get(`/accounts/qr-session/${tokenRef.current}/status/`)
        const data = res.data

        if (data.status === 'expired') {
          clearInterval(pollRef.current)
          createSession()
          return
        }

        if (data.status === 'linked' && data.access) {
          clearInterval(pollRef.current)
          setStatus('linked')
          login(data.user, data.access, data.refresh)

          if (data.user.role === 'admin') {
            navigate('/admin', { replace: true })
          } else if (data.user.role === 'client' && data.room_id) {
            navigate(`/chat/${data.room_id}`, { replace: true })
          } else {
            navigate('/dashboard', { replace: true })
          }
        }
      } catch {
        // transient network hiccup — just keep polling
      }
    }, 2000)

    return () => clearInterval(pollRef.current)
  }, [status])

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.brandMark}>TJ</div>
        <h1 style={S.title}>Link a computer</h1>
        <p style={S.subtitle}>
          Open TutorJamesConnect on your phone, go to your account menu, and
          scan this code to use your account here too. Your phone stays
          logged in.
        </p>

        <div style={S.qrBox}>
          {status === 'loading' && <div style={S.qrPlaceholder}>Loading…</div>}
          {status === 'error' && (
            <div style={S.qrPlaceholder}>
              <p style={S.errorText}>Something went wrong.</p>
              <button style={S.retryBtn} onClick={createSession}>Try again</button>
            </div>
          )}
          {(status === 'pending' || status === 'linked') && qrContent && (
            <QRCodeSVG value={qrContent} size={220} level="M" />
          )}
        </div>

        {status === 'pending' && <p style={S.statusText}>Waiting for you to scan…</p>}
        {status === 'linked' && <p style={S.statusTextSuccess}>✅ Linked! Redirecting…</p>}

        <p style={S.expiryNote}>This code refreshes automatically every 2 minutes.</p>
      </div>
    </div>
  )
}

const S = {
  page: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'linear-gradient(135deg, #075e54, #054c40)',
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", padding: 20,
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '40px 36px', width: '100%',
    maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center',
  },
  brandMark: {
    width: 52, height: 52, borderRadius: '50%', background: '#00a884', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 19, margin: '0 auto 18px',
  },
  title:    { fontSize: 22, fontWeight: 700, color: '#111b21', margin: '0 0 8px' },
  subtitle: { fontSize: 13, color: '#667781', lineHeight: 1.5, margin: '0 0 24px' },
  qrBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 260, height: 260, margin: '0 auto 16px', borderRadius: 12,
    border: '1.5px solid #e9edef', background: '#fafafa',
  },
  qrPlaceholder: { fontSize: 13, color: '#8696a0', textAlign: 'center' },
  errorText: { color: '#e53e3e', marginBottom: 10 },
  retryBtn: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#00a884', color: '#fff', fontSize: 13, fontWeight: 600,
  },
  statusText:        { fontSize: 13, color: '#8696a0', marginBottom: 4 },
  statusTextSuccess: { fontSize: 13, color: '#00a884', fontWeight: 600, marginBottom: 4 },
  expiryNote: { fontSize: 11, color: '#c9cfd3', marginTop: 12 },
}
