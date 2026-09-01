// src/pages/VerifyEmail.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

// Reads the pending email from router state if present (normal case,
// arriving straight from signup), falling back to localStorage so a page
// refresh mid-verification doesn't strand the user — same resilience
// concern as the mobile app, just solved with localStorage instead of
// AsyncStorage since that's this app's existing persistence pattern.
export default function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [email] = useState(() => location.state?.email || localStorage.getItem('pending_verify_email') || '')
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (email) localStorage.setItem('pending_verify_email', email)
  }, [email])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!code.trim()) {
      setError('Please enter the code sent to your email.')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/accounts/verify-otp/', { email, code: code.trim() })
      const { user, access, refresh } = res.data
      localStorage.removeItem('pending_verify_email')
      login(user, access, refresh)

      if (user.role === 'admin') {
        navigate('/admin', { replace: true })
      } else if (user.role === 'client') {
        navigate('/chat', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect code, or it has expired.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.brandMark}>TJ</div>
        <h1 style={S.title}>Verify your email</h1>
        <p style={S.subtitle}>
          {email
            ? `We sent a 6-digit code to ${email}. Enter it below to finish signing up.`
            : 'Enter the 6-digit code sent to your email.'}
        </p>

        <form onSubmit={handleSubmit} style={S.form}>
          <input
            style={S.codeInput}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            inputMode="numeric"
            maxLength={6}
            autoFocus
          />

          {error && <div style={S.errorMsg}>{error}</div>}

          <button type="submit" style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
            {submitting ? 'Verifying…' : 'Verify & Continue'}
          </button>
        </form>

        <div style={S.footer}>
          <Link to="/login" style={S.footerLink}>← Back to login</Link>
        </div>
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
    maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  brandMark: {
    width: 48, height: 48, borderRadius: '50%', background: '#00a884', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 18, marginBottom: 20,
  },
  title:    { fontSize: 22, fontWeight: 700, color: '#111b21', margin: '0 0 6px' },
  subtitle: { fontSize: 14, color: '#667781', margin: '0 0 28px', lineHeight: 1.5 },
  form:     { display: 'flex', flexDirection: 'column' },
  codeInput: {
    width: '100%', padding: '14px', borderRadius: 9, border: '1.5px solid #d7ddE0',
    fontSize: 24, letterSpacing: '0.4em', textAlign: 'center', outline: 'none',
    boxSizing: 'border-box', marginBottom: 16,
  },
  errorMsg: {
    fontSize: 13, color: '#e53e3e', background: '#fff0ef', borderRadius: 8,
    padding: '10px 12px', marginBottom: 16,
  },
  submitBtn: {
    padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: '#00a884', color: '#fff',
    fontSize: 15, fontWeight: 700, marginTop: 6,
  },
  footer:     { textAlign: 'center', marginTop: 14, fontSize: 13 },
  footerLink: { color: '#00a884', fontWeight: 600, textDecoration: 'none' },
}
