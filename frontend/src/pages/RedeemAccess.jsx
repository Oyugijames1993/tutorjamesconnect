// src/pages/RedeemAccess.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function RedeemAccess() {
  const { token } = useParams()
  const navigate  = useNavigate()
  const { login } = useAuth()

  const [status, setStatus] = useState('working') // 'working' | 'error'
  const [error, setError]   = useState('')
  const attempted = useRef(false)

  useEffect(() => {
    // Guard against React 18 StrictMode's double-invoke in dev, which would
    // otherwise burn the single-use token on the first render alone.
    if (attempted.current) return
    attempted.current = true

    api.post('/accounts/redeem-access/', { token })
      .then(res => {
        const { user, access, refresh, room_id } = res.data
        login(user, access, refresh)

        if (user.role === 'client' && room_id) {
          navigate(`/chat/${room_id}`, { replace: true })
        } else if (user.role === 'admin') {
          navigate('/admin', { replace: true })
        } else {
          // Provider (or a client somehow without a room yet) — let the
          // general chat view sort out where they land, including
          // redirecting to /no-rooms if they truly have none right now.
          navigate('/chat', { replace: true })
        }
      })
      .catch(err => {
        setStatus('error')
        setError(err.response?.data?.error || 'This link is invalid or has expired.')
      })
  }, [token])

  if (status === 'working') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.spinner} />
          <p style={S.workingText}>Logging you in…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.errorIcon}>⚠️</div>
        <h1 style={S.title}>Link didn't work</h1>
        <p style={S.subtitle}>{error}</p>
        <Link to="/lost-access" style={S.retryBtn}>Request a new link</Link>
        <div style={S.footer}>
          <Link to="/login" style={S.footerLink}>Back to login</Link>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)',
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", padding: 20,
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '40px 36px', width: '100%',
    maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center',
  },
  spinner: {
    width: 40, height: 40, margin: '0 auto 20px', borderRadius: '50%',
    border: '4px solid #e4e9f0', borderTopColor: '#1a56a0',
    animation: 'redeemSpin 0.8s linear infinite',
  },
  workingText: { fontSize: 15, color: '#555', fontWeight: 500 },
  errorIcon:   { fontSize: 40, marginBottom: 12 },
  title:       { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' },
  subtitle:    { fontSize: 14, color: '#888', margin: '0 0 24px', lineHeight: 1.5 },
  retryBtn: {
    display: 'inline-block', padding: '12px 24px', borderRadius: 10,
    background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)', color: '#fff',
    fontSize: 14, fontWeight: 700, textDecoration: 'none',
  },
  footer:     { marginTop: 18, fontSize: 13 },
  footerLink: { color: '#1a56a0', fontWeight: 600, textDecoration: 'none' },
}

// Inject the spinner keyframes once (no global CSS file to hook into here)
if (typeof document !== 'undefined' && !document.getElementById('redeem-access-keyframes')) {
  const style = document.createElement('style')
  style.id = 'redeem-access-keyframes'
  style.textContent = '@keyframes redeemSpin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}
