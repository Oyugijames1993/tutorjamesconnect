// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [form, setForm]       = useState({ username: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/accounts/login/', {
        username: form.username,
        password: form.password,
      })

      const meRes = await api.get('/accounts/me/', {
        headers: { Authorization: 'Bearer ' + res.data.access }
      })

      login(meRes.data, res.data.access, res.data.refresh)

      if (meRes.data.role === 'admin') {
        navigate('/admin')
      } else {
        const roomsRes = await api.get('/chat/rooms/', {
          headers: { Authorization: 'Bearer ' + res.data.access }
        })
        const rooms = roomsRes.data
        if (rooms.length > 0) {
          navigate('/chat/' + rooms[0].id)
        } else {
          navigate('/no-rooms')
        }
      }

    } catch (err) {
      const data = err.response?.data
      if (data?.detail) {
        setError(data.detail)
      } else if (data && typeof data === 'object') {
        const first = Object.values(data)[0]
        setError(Array.isArray(first) ? first[0] : first)
      } else {
        setError('Invalid username or password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        <div style={styles.header}>
          <h1 style={styles.title}>TutorJamesConnect</h1>
          <p style={styles.subtitle}>
            Trusted by students across the globe for projects, assignments, and academic excellence.
          </p>
        </div>

        <h2 style={styles.formTitle}>Welcome Back</h2>
        <p style={styles.formSub}>Sign in to your account</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              name="username"
              placeholder="Enter your username"
              value={form.username}
              onChange={handleChange}
              required
              autoFocus
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <button
            style={loading ? styles.btnDisabled : styles.btn}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={styles.switchText}>
          Don't have an account?{' '}
          <Link to="/register/client" style={styles.link}>
            Register as Client
          </Link>
          {' · '}
          <Link to="/register/provider" style={styles.link}>
            Register as Provider
          </Link>
        </p>

      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a56a0 0%, #0d3b6e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
    padding: '16px',
    background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)',
    borderRadius: '12px',
  },
  title: {
    color: '#ffffff',
    fontSize: '26px',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subtitle: {
    color: '#BDD7F5',
    fontSize: '13px',
    margin: 0,
    lineHeight: '1.5',
  },
  formTitle: {
    fontSize: '22px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '4px',
  },
  formSub: {
    fontSize: '13px',
    color: '#888',
    marginBottom: '24px',
  },
  error: {
    background: '#fae6e6',
    color: '#a0251a',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  inputGroup: { marginBottom: '16px' },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#444',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: '8px',
    border: '1.5px solid #ddd',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  btn: {
    width: '100%',
    padding: '12px',
    background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px',
  },
  btnDisabled: {
    width: '100%',
    padding: '12px',
    background: '#aaa',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'not-allowed',
    marginTop: '8px',
  },
  switchText: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#666',
    marginTop: '20px',
  },
  link: {
    color: '#1a56a0',
    fontWeight: '600',
    textDecoration: 'none',
  },
}