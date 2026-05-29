// src/pages/RegisterClient.jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function RegisterClient() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    country_code: '+1',
    phone_number: '',
    password: '',
    confirm_password: '',
  })

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const countryCodes = [
    { code: '+1',   label: '🇺🇸 +1   (USA/Canada)' },
    { code: '+44',  label: '🇬🇧 +44  (UK)' },
    { code: '+61',  label: '🇦🇺 +61  (Australia)' },
    { code: '+971', label: '🇦🇪 +971 (UAE)' },
    { code: '+965', label: '🇰🇼 +965 (Kuwait)' },
    { code: '+966', label: '🇸🇦 +966 (Saudi Arabia)' },
    { code: '+974', label: '🇶🇦 +974 (Qatar)' },
    { code: '+973', label: '🇧🇭 +973 (Bahrain)' },
    { code: '+968', label: '🇴🇲 +968 (Oman)' },
    { code: '+254', label: '🇰🇪 +254 (Kenya)' },
    { code: '+234', label: '🇳🇬 +234 (Nigeria)' },
    { code: '+27',  label: '🇿🇦 +27  (South Africa)' },
    { code: '+91',  label: '🇮🇳 +91  (India)' },
    { code: '+92',  label: '🇵🇰 +92  (Pakistan)' },
    { code: '+880', label: '🇧🇩 +880 (Bangladesh)' },
    { code: '+94',  label: '🇱🇰 +94  (Sri Lanka)' },
    { code: '+60',  label: '🇲🇾 +60  (Malaysia)' },
    { code: '+63',  label: '🇵🇭 +63  (Philippines)' },
    { code: '+62',  label: '🇮🇩 +62  (Indonesia)' },
    { code: '+20',  label: '🇪🇬 +20  (Egypt)' },
    { code: '+212', label: '🇲🇦 +212 (Morocco)' },
    { code: '+213', label: '🇩🇿 +213 (Algeria)' },
    { code: '+216', label: '🇹🇳 +216 (Tunisia)' },
    { code: '+249', label: '🇸🇩 +249 (Sudan)' },
    { code: '+255', label: '🇹🇿 +255 (Tanzania)' },
    { code: '+256', label: '🇺🇬 +256 (Uganda)' },
    { code: '+49',  label: '🇩🇪 +49  (Germany)' },
    { code: '+33',  label: '🇫🇷 +33  (France)' },
    { code: '+34',  label: '🇪🇸 +34  (Spain)' },
    { code: '+39',  label: '🇮🇹 +39  (Italy)' },
    { code: '+31',  label: '🇳🇱 +31  (Netherlands)' },
    { code: '+46',  label: '🇸🇪 +46  (Sweden)' },
    { code: '+47',  label: '🇳🇴 +47  (Norway)' },
    { code: '+45',  label: '🇩🇰 +45  (Denmark)' },
    { code: '+353', label: '🇮🇪 +353 (Ireland)' },
    { code: '+64',  label: '🇳🇿 +64  (New Zealand)' },
    { code: '+55',  label: '🇧🇷 +55  (Brazil)' },
    { code: '+52',  label: '🇲🇽 +52  (Mexico)' },
    { code: '+54',  label: '🇦🇷 +54  (Argentina)' },
    { code: '+57',  label: '🇨🇴 +57  (Colombia)' },
    { code: '+86',  label: '🇨🇳 +86  (China)' },
    { code: '+81',  label: '🇯🇵 +81  (Japan)' },
    { code: '+82',  label: '🇰🇷 +82  (South Korea)' },
    { code: '+7',   label: '🇷🇺 +7   (Russia)' },
    { code: '+90',  label: '🇹🇷 +90  (Turkey)' },
    { code: '+964', label: '🇮🇶 +964 (Iraq)' },
    { code: '+962', label: '🇯🇴 +962 (Jordan)' },
    { code: '+961', label: '🇱🇧 +961 (Lebanon)' },
  ]

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/accounts/register/client/', {
        first_name:   form.first_name,
        last_name:    form.last_name,
        email:        form.email,
        phone_number: `${form.country_code}${form.phone_number}`,
        password:     form.password,
        password2:    form.confirm_password,
      })

      login(res.data.user, res.data.access, res.data.refresh)
      navigate('/chat/lobby')

    } catch (err) {
      const errors = err.response?.data
      if (errors && typeof errors === 'object') {
        const firstError = Object.values(errors)[0]
        setError(Array.isArray(firstError) ? firstError[0] : firstError)
      } else {
        setError('Registration failed. Please try again.')
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

        <h2 style={styles.formTitle}>Create Client Account</h2>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.row}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>First Name</label>
              <input style={styles.input} type="text" name="first_name"
                placeholder="First name" value={form.first_name}
                onChange={handleChange} required />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Last Name</label>
              <input style={styles.input} type="text" name="last_name"
                placeholder="Last name" value={form.last_name}
                onChange={handleChange} required />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input style={styles.input} type="email" name="email"
              placeholder="your@email.com" value={form.email}
              onChange={handleChange} required />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Phone Number</label>
            <div style={styles.phoneRow}>
              <select style={styles.countrySelect} name="country_code"
                value={form.country_code} onChange={handleChange}>
                {countryCodes.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input style={styles.phoneInput} type="tel" name="phone_number"
                placeholder="XXXX XXXX" value={form.phone_number}
                onChange={handleChange} required />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" name="password"
              placeholder="Create a strong password" value={form.password}
              onChange={handleChange} required />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input style={styles.input} type="password" name="confirm_password"
              placeholder="Repeat your password" value={form.confirm_password}
              onChange={handleChange} required />
          </div>

          <button style={loading ? styles.btnDisabled : styles.btn}
            type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.switchText}>
          Are you a tutor?{' '}
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
    maxWidth: '480px',
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
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '20px',
  },
  error: {
    background: '#fae6e6',
    color: '#a0251a',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  row: { display: 'flex', gap: '12px' },
  inputGroup: { flex: 1, marginBottom: '16px' },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#444',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1.5px solid #ddd',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  phoneRow: {
    display: 'flex',
    gap: '8px',
  },
  countrySelect: {
    padding: '10px 8px',
    borderRadius: '8px',
    border: '1.5px solid #ddd',
    fontSize: '13px',
    outline: 'none',
    background: '#f9f9f9',
    cursor: 'pointer',
    width: '200px',
    flexShrink: 0,
  },
  phoneInput: {
    flex: 1,
    padding: '10px 12px',
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