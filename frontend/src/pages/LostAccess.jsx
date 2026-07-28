// src/pages/LostAccess.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

const COUNTRY_CODES = [
  { code: '+965', name: 'Kuwait',                   flag: '🇰🇼' },
  { code: '+254', name: 'Kenya',                    flag: '🇰🇪' },
  { code: '+971', name: 'United Arab Emirates',     flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia',             flag: '🇸🇦' },
  { code: '+234', name: 'Nigeria',                  flag: '🇳🇬' },
  { code: '+27',  name: 'South Africa',             flag: '🇿🇦' },
  { code: '+44',  name: 'United Kingdom',           flag: '🇬🇧' },
  { code: '+91',  name: 'India',                    flag: '🇮🇳' },
  { code: '+1',   name: 'United States / Canada',   flag: '🇺🇸' },
  { code: '+353', name: 'Ireland',                  flag: '🇮🇪' },
  { code: '+61',  name: 'Australia',                flag: '🇦🇺' },
  // Full list lives in RegisterClient.jsx — trimmed here to the common
  // ones; swap in the complete COUNTRY_CODES array from there if you want
  // every country available on this page too.
]

export default function LostAccess() {
  const [role, setRole]               = useState('client')
  const [countryCode, setCountryCode] = useState('+965')
  const [localNumber, setLocalNumber] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!localNumber.trim()) {
      setError('Please enter your phone number.')
      return
    }

    const phone_number = countryCode + localNumber.trim().replace(/^0+/, '')

    setSubmitting(true)
    try {
      await api.post('/accounts/request-access/', { phone_number, role })
      setSubmitted(true)
    } catch {
      // Deliberately vague either way — matches the backend's choice not
      // to reveal whether a number is registered.
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.brandMark}>TJ</div>

        {submitted ? (
          <>
            <h1 style={S.title}>Request sent</h1>
            <p style={S.subtitle}>
              If that number is registered, the admin has been notified and will
              send you a fresh link over WhatsApp shortly.
            </p>
            <Link to="/login" style={S.backLink}>← Back to login</Link>
          </>
        ) : (
          <>
            <h1 style={S.title}>Lost access?</h1>
            <p style={S.subtitle}>
              Tell us your phone number and we'll get you a new link, sent
              straight to your WhatsApp.
            </p>

            <form onSubmit={handleSubmit} style={S.form}>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>I am a</label>
                <div style={S.roleRow}>
                  <button
                    type="button"
                    style={{ ...S.roleBtn, ...(role === 'client' ? S.roleBtnOn : {}) }}
                    onClick={() => setRole('client')}
                    disabled={submitting}
                  >
                    👤 Client
                  </button>
                  <button
                    type="button"
                    style={{ ...S.roleBtn, ...(role === 'provider' ? S.roleBtnOn : {}) }}
                    onClick={() => setRole('provider')}
                    disabled={submitting}
                  >
                    🎓 Provider
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Phone number</label>
                <div style={S.phoneRow}>
                  <select
                    style={S.countrySelect}
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    disabled={submitting}
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.name} value={c.code}>{c.flag} {c.name} ({c.code})</option>
                    ))}
                  </select>
                  <input
                    style={S.phoneInput}
                    value={localNumber}
                    onChange={e => setLocalNumber(e.target.value)}
                    placeholder="51234567"
                    disabled={submitting}
                  />
                </div>
              </div>

              {error && <div style={S.errorMsg}>{error}</div>}

              <button type="submit" style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
                {submitting ? 'Sending request…' : 'Request Access Link'}
              </button>
            </form>

            <div style={S.footer}>
              <Link to="/login" style={S.footerLink}>Back to login</Link>
              <span style={S.footerText}> · </span>
              <Link to="/register/client" style={S.footerLink}>New here? Sign up</Link>
            </div>
          </>
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
  label:    { display: 'block', fontSize: 13, fontWeight: 600, color: '#3b4a54', marginBottom: 8 },
  roleRow:  { display: 'flex', gap: 8 },
  roleBtn: {
    flex: 1, padding: '11px', borderRadius: 9, border: '1.5px solid #d7ddE0', background: '#fff',
    color: '#3b4a54', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  roleBtnOn: { background: '#00a884', borderColor: '#00a884', color: '#fff' },
  phoneRow:  { display: 'flex', gap: 8 },
  countrySelect: {
    flexShrink: 0, width: 130, padding: '11px 8px', borderRadius: 9, border: '1.5px solid #d7ddE0',
    fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer',
  },
  phoneInput: {
    flex: 1, padding: '11px 13px', borderRadius: 9, border: '1.5px solid #d7ddE0',
    fontSize: 14, outline: 'none', boxSizing: 'border-box', minWidth: 0,
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
  footer:     { textAlign: 'center', marginTop: 20, fontSize: 13 },
  footerText: { color: '#bbb' },
  footerLink: { color: '#00a884', fontWeight: 600, textDecoration: 'none' },
  backLink:   { color: '#00a884', fontWeight: 600, textDecoration: 'none', fontSize: 14 },
}
