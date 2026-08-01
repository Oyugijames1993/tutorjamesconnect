// src/pages/Login.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [showAdmin, setShowAdmin] = useState(false)
  const [username, setUsername]   = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Enter both username and password.')
      return
    }
    setLoading(true)
    try {
      const tokenRes = await api.post('/accounts/login/', { username, password })
      const { access, refresh } = tokenRes.data
      const meRes = await api.get('/accounts/me/', { headers: { Authorization: `Bearer ${access}` } })
      login(meRes.data, access, refresh)
      navigate('/admin', { replace: true })
    } catch {
      setError('Incorrect username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.brandMark}>TJ</div>
        <h1 style={S.title}>TutorJamesConnect</h1>
        <p style={S.subtitle}>Academic project coordination, done right</p>

        {!showAdmin ? (
          <>
            <div style={S.primaryPanel}>
              <p style={S.primaryText}>
                Already have an account? If you've been logged out or switched devices,
                get a fresh link sent straight to your WhatsApp — no password needed.
              </p>
              <Link to="/lost-access" style={S.primaryBtn}>🔑 Request Access Link</Link>
            </div>

            <div style={S.divider}><span style={S.dividerText}>New here?</span></div>

            <div style={S.linksRow}>
              <Link to="/register/client" style={S.secondaryBtn}>👤 I'm a Student</Link>
              <Link to="/register/provider" style={S.secondaryBtn}>🎓 I'm a Professor</Link>
            </div>

            <button style={S.adminToggle} onClick={() => setShowAdmin(true)}>
              Admin? Sign in here
            </button>
          </>
        ) : (
          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Username</label>
              <input
                style={S.input}
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Password</label>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <div style={S.error}>{error}</div>}

            <button
              type="submit"
              style={{ ...S.primaryBtnFull, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <button
              type="button"
              style={S.backLink}
              onClick={() => { setShowAdmin(false); setError(''); setUsername(''); setPassword('') }}
            >
              ← Back
            </button>
          </form>
        )}
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
  title:    { fontSize: 22, fontWeight: 700, color: '#111b21', margin: '0 0 6px' },
  subtitle: { fontSize: 13, color: '#667781', margin: '0 0 28px' },

  primaryPanel: {
    background: '#e7f8f3', border: '1px solid #b6e6d8', borderRadius: 12,
    padding: '18px 18px 16px', marginBottom: 20, textAlign: 'left',
  },
  primaryText: { fontSize: 13, color: '#3b4a54', lineHeight: 1.55, margin: '0 0 14px' },
  primaryBtn: {
    display: 'block', width: '100%', padding: '13px', borderRadius: 10, border: 'none',
    background: '#00a884', color: '#fff', fontSize: 14, fontWeight: 700,
    textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box',
  },
  primaryBtnFull: {
    width: '100%', padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: '#00a884', color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 4,
  },

  divider: {
    display: 'flex', alignItems: 'center', margin: '4px 0 16px', color: '#c9cfd3',
  },
  dividerText: {
    margin: '0 auto', fontSize: 11, color: '#8696a0', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', background: '#fff', padding: '0 10px',
  },

  linksRow: { display: 'flex', gap: 10, marginBottom: 22 },
  secondaryBtn: {
    flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #d7ddE0',
    background: '#fff', color: '#3b4a54', fontSize: 13, fontWeight: 600,
    textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box',
  },

  adminToggle: {
    background: 'none', border: 'none', color: '#8696a0', fontSize: 12,
    cursor: 'pointer', textDecoration: 'underline', padding: 0,
  },

  label: {
    display: 'block', textAlign: 'left', fontSize: 13, fontWeight: 600,
    color: '#3b4a54', marginBottom: 6,
  },
  input: {
    width: '100%', padding: '11px 13px', borderRadius: 9, border: '1.5px solid #d7ddE0',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  error: {
    fontSize: 13, color: '#e53e3e', background: '#fff0ef', borderRadius: 8,
    padding: '10px 12px', marginBottom: 16, textAlign: 'left',
  },
  backLink: {
    display: 'block', margin: '14px auto 0', background: 'none', border: 'none',
    color: '#8696a0', fontSize: 13, cursor: 'pointer',
  },
}
