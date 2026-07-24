// src/pages/LostAccess.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

const COUNTRY_CODES = [
  { code: '+93',  name: 'Afghanistan',              flag: '🇦🇫' },
  { code: '+355', name: 'Albania',                  flag: '🇦🇱' },
  { code: '+213', name: 'Algeria',                  flag: '🇩🇿' },
  { code: '+1',   name: 'American Samoa',           flag: '🇦🇸' },
  { code: '+376', name: 'Andorra',                  flag: '🇦🇩' },
  { code: '+244', name: 'Angola',                   flag: '🇦🇴' },
  { code: '+1',   name: 'Anguilla',                 flag: '🇦🇮' },
  { code: '+1',   name: 'Antigua and Barbuda',      flag: '🇦🇬' },
  { code: '+54',  name: 'Argentina',                flag: '🇦🇷' },
  { code: '+374', name: 'Armenia',                  flag: '🇦🇲' },
  { code: '+297', name: 'Aruba',                    flag: '🇦🇼' },
  { code: '+61',  name: 'Australia',                flag: '🇦🇺' },
  { code: '+43',  name: 'Austria',                  flag: '🇦🇹' },
  { code: '+994', name: 'Azerbaijan',                flag: '🇦🇿' },
  { code: '+1',   name: 'Bahamas',                  flag: '🇧🇸' },
  { code: '+973', name: 'Bahrain',                  flag: '🇧🇭' },
  { code: '+880', name: 'Bangladesh',                flag: '🇧🇩' },
  { code: '+1',   name: 'Barbados',                 flag: '🇧🇧' },
  { code: '+375', name: 'Belarus',                  flag: '🇧🇾' },
  { code: '+32',  name: 'Belgium',                  flag: '🇧🇪' },
  { code: '+501', name: 'Belize',                   flag: '🇧🇿' },
  { code: '+229', name: 'Benin',                    flag: '🇧🇯' },
  { code: '+1',   name: 'Bermuda',                  flag: '🇧🇲' },
  { code: '+975', name: 'Bhutan',                   flag: '🇧🇹' },
  { code: '+591', name: 'Bolivia',                  flag: '🇧🇴' },
  { code: '+387', name: 'Bosnia and Herzegovina',   flag: '🇧🇦' },
  { code: '+267', name: 'Botswana',                 flag: '🇧🇼' },
  { code: '+55',  name: 'Brazil',                   flag: '🇧🇷' },
  { code: '+1',   name: 'British Virgin Islands',   flag: '🇻🇬' },
  { code: '+673', name: 'Brunei',                   flag: '🇧🇳' },
  { code: '+359', name: 'Bulgaria',                 flag: '🇧🇬' },
  { code: '+226', name: 'Burkina Faso',             flag: '🇧🇫' },
  { code: '+257', name: 'Burundi',                  flag: '🇧🇮' },
  { code: '+855', name: 'Cambodia',                 flag: '🇰🇭' },
  { code: '+237', name: 'Cameroon',                 flag: '🇨🇲' },
  { code: '+1',   name: 'Canada',                   flag: '🇨🇦' },
  { code: '+238', name: 'Cape Verde',                flag: '🇨🇻' },
  { code: '+1',   name: 'Cayman Islands',           flag: '🇰🇾' },
  { code: '+236', name: 'Central African Republic', flag: '🇨🇫' },
  { code: '+235', name: 'Chad',                     flag: '🇹🇩' },
  { code: '+56',  name: 'Chile',                    flag: '🇨🇱' },
  { code: '+86',  name: 'China',                    flag: '🇨🇳' },
  { code: '+57',  name: 'Colombia',                 flag: '🇨🇴' },
  { code: '+269', name: 'Comoros',                  flag: '🇰🇲' },
  { code: '+243', name: 'Congo (DRC)',              flag: '🇨🇩' },
  { code: '+242', name: 'Congo (Republic)',         flag: '🇨🇬' },
  { code: '+682', name: 'Cook Islands',             flag: '🇨🇰' },
  { code: '+506', name: 'Costa Rica',               flag: '🇨🇷' },
  { code: '+225', name: "Côte d'Ivoire",            flag: '🇨🇮' },
  { code: '+385', name: 'Croatia',                  flag: '🇭🇷' },
  { code: '+53',  name: 'Cuba',                     flag: '🇨🇺' },
  { code: '+357', name: 'Cyprus',                   flag: '🇨🇾' },
  { code: '+420', name: 'Czech Republic',           flag: '🇨🇿' },
  { code: '+45',  name: 'Denmark',                  flag: '🇩🇰' },
  { code: '+253', name: 'Djibouti',                 flag: '🇩🇯' },
  { code: '+1',   name: 'Dominica',                 flag: '🇩🇲' },
  { code: '+1',   name: 'Dominican Republic',       flag: '🇩🇴' },
  { code: '+593', name: 'Ecuador',                  flag: '🇪🇨' },
  { code: '+20',  name: 'Egypt',                    flag: '🇪🇬' },
  { code: '+503', name: 'El Salvador',              flag: '🇸🇻' },
  { code: '+240', name: 'Equatorial Guinea',        flag: '🇬🇶' },
  { code: '+291', name: 'Eritrea',                  flag: '🇪🇷' },
  { code: '+372', name: 'Estonia',                  flag: '🇪🇪' },
  { code: '+268', name: 'Eswatini',                 flag: '🇸🇿' },
  { code: '+251', name: 'Ethiopia',                 flag: '🇪🇹' },
  { code: '+679', name: 'Fiji',                     flag: '🇫🇯' },
  { code: '+358', name: 'Finland',                  flag: '🇫🇮' },
  { code: '+33',  name: 'France',                   flag: '🇫🇷' },
  { code: '+241', name: 'Gabon',                    flag: '🇬🇦' },
  { code: '+220', name: 'Gambia',                   flag: '🇬🇲' },
  { code: '+995', name: 'Georgia',                  flag: '🇬🇪' },
  { code: '+49',  name: 'Germany',                  flag: '🇩🇪' },
  { code: '+233', name: 'Ghana',                    flag: '🇬🇭' },
  { code: '+30',  name: 'Greece',                   flag: '🇬🇷' },
  { code: '+1',   name: 'Grenada',                  flag: '🇬🇩' },
  { code: '+502', name: 'Guatemala',                flag: '🇬🇹' },
  { code: '+224', name: 'Guinea',                   flag: '🇬🇳' },
  { code: '+245', name: 'Guinea-Bissau',            flag: '🇬🇼' },
  { code: '+592', name: 'Guyana',                   flag: '🇬🇾' },
  { code: '+509', name: 'Haiti',                    flag: '🇭🇹' },
  { code: '+504', name: 'Honduras',                 flag: '🇭🇳' },
  { code: '+852', name: 'Hong Kong',                flag: '🇭🇰' },
  { code: '+36',  name: 'Hungary',                  flag: '🇭🇺' },
  { code: '+354', name: 'Iceland',                  flag: '🇮🇸' },
  { code: '+91',  name: 'India',                    flag: '🇮🇳' },
  { code: '+62',  name: 'Indonesia',                flag: '🇮🇩' },
  { code: '+98',  name: 'Iran',                     flag: '🇮🇷' },
  { code: '+964', name: 'Iraq',                     flag: '🇮🇶' },
  { code: '+353', name: 'Ireland',                  flag: '🇮🇪' },
  { code: '+972', name: 'Israel',                   flag: '🇮🇱' },
  { code: '+39',  name: 'Italy',                    flag: '🇮🇹' },
  { code: '+1',   name: 'Jamaica',                  flag: '🇯🇲' },
  { code: '+81',  name: 'Japan',                    flag: '🇯🇵' },
  { code: '+962', name: 'Jordan',                   flag: '🇯🇴' },
  { code: '+7',   name: 'Kazakhstan',               flag: '🇰🇿' },
  { code: '+254', name: 'Kenya',                    flag: '🇰🇪' },
  { code: '+686', name: 'Kiribati',                 flag: '🇰🇮' },
  { code: '+965', name: 'Kuwait',                   flag: '🇰🇼' },
  { code: '+996', name: 'Kyrgyzstan',               flag: '🇰🇬' },
  { code: '+856', name: 'Laos',                     flag: '🇱🇦' },
  { code: '+371', name: 'Latvia',                   flag: '🇱🇻' },
  { code: '+961', name: 'Lebanon',                  flag: '🇱🇧' },
  { code: '+266', name: 'Lesotho',                  flag: '🇱🇸' },
  { code: '+231', name: 'Liberia',                  flag: '🇱🇷' },
  { code: '+218', name: 'Libya',                    flag: '🇱🇾' },
  { code: '+423', name: 'Liechtenstein',            flag: '🇱🇮' },
  { code: '+370', name: 'Lithuania',                flag: '🇱🇹' },
  { code: '+352', name: 'Luxembourg',               flag: '🇱🇺' },
  { code: '+853', name: 'Macau',                    flag: '🇲🇴' },
  { code: '+261', name: 'Madagascar',                flag: '🇲🇬' },
  { code: '+265', name: 'Malawi',                   flag: '🇲🇼' },
  { code: '+60',  name: 'Malaysia',                 flag: '🇲🇾' },
  { code: '+960', name: 'Maldives',                 flag: '🇲🇻' },
  { code: '+223', name: 'Mali',                     flag: '🇲🇱' },
  { code: '+356', name: 'Malta',                    flag: '🇲🇹' },
  { code: '+692', name: 'Marshall Islands',         flag: '🇲🇭' },
  { code: '+222', name: 'Mauritania',                flag: '🇲🇷' },
  { code: '+230', name: 'Mauritius',                flag: '🇲🇺' },
  { code: '+52',  name: 'Mexico',                   flag: '🇲🇽' },
  { code: '+691', name: 'Micronesia',                flag: '🇫🇲' },
  { code: '+373', name: 'Moldova',                  flag: '🇲🇩' },
  { code: '+377', name: 'Monaco',                   flag: '🇲🇨' },
  { code: '+976', name: 'Mongolia',                 flag: '🇲🇳' },
  { code: '+382', name: 'Montenegro',                flag: '🇲🇪' },
  { code: '+212', name: 'Morocco',                  flag: '🇲🇦' },
  { code: '+258', name: 'Mozambique',                flag: '🇲🇿' },
  { code: '+95',  name: 'Myanmar',                  flag: '🇲🇲' },
  { code: '+264', name: 'Namibia',                  flag: '🇳🇦' },
  { code: '+674', name: 'Nauru',                    flag: '🇳🇷' },
  { code: '+977', name: 'Nepal',                    flag: '🇳🇵' },
  { code: '+31',  name: 'Netherlands',              flag: '🇳🇱' },
  { code: '+64',  name: 'New Zealand',              flag: '🇳🇿' },
  { code: '+505', name: 'Nicaragua',                flag: '🇳🇮' },
  { code: '+227', name: 'Niger',                    flag: '🇳🇪' },
  { code: '+234', name: 'Nigeria',                  flag: '🇳🇬' },
  { code: '+850', name: 'North Korea',              flag: '🇰🇵' },
  { code: '+389', name: 'North Macedonia',          flag: '🇲🇰' },
  { code: '+47',  name: 'Norway',                   flag: '🇳🇴' },
  { code: '+968', name: 'Oman',                     flag: '🇴🇲' },
  { code: '+92',  name: 'Pakistan',                 flag: '🇵🇰' },
  { code: '+680', name: 'Palau',                    flag: '🇵🇼' },
  { code: '+970', name: 'Palestine',                flag: '🇵🇸' },
  { code: '+507', name: 'Panama',                   flag: '🇵🇦' },
  { code: '+675', name: 'Papua New Guinea',         flag: '🇵🇬' },
  { code: '+595', name: 'Paraguay',                 flag: '🇵🇾' },
  { code: '+51',  name: 'Peru',                     flag: '🇵🇪' },
  { code: '+63',  name: 'Philippines',              flag: '🇵🇭' },
  { code: '+48',  name: 'Poland',                   flag: '🇵🇱' },
  { code: '+351', name: 'Portugal',                 flag: '🇵🇹' },
  { code: '+1',   name: 'Puerto Rico',              flag: '🇵🇷' },
  { code: '+974', name: 'Qatar',                    flag: '🇶🇦' },
  { code: '+40',  name: 'Romania',                  flag: '🇷🇴' },
  { code: '+7',   name: 'Russia',                   flag: '🇷🇺' },
  { code: '+250', name: 'Rwanda',                   flag: '🇷🇼' },
  { code: '+1',   name: 'Saint Kitts and Nevis',    flag: '🇰🇳' },
  { code: '+1',   name: 'Saint Lucia',              flag: '🇱🇨' },
  { code: '+1',   name: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
  { code: '+685', name: 'Samoa',                    flag: '🇼🇸' },
  { code: '+378', name: 'San Marino',               flag: '🇸🇲' },
  { code: '+239', name: 'São Tomé and Príncipe',    flag: '🇸🇹' },
  { code: '+966', name: 'Saudi Arabia',             flag: '🇸🇦' },
  { code: '+221', name: 'Senegal',                  flag: '🇸🇳' },
  { code: '+381', name: 'Serbia',                   flag: '🇷🇸' },
  { code: '+248', name: 'Seychelles',               flag: '🇸🇨' },
  { code: '+232', name: 'Sierra Leone',             flag: '🇸🇱' },
  { code: '+65',  name: 'Singapore',                flag: '🇸🇬' },
  { code: '+421', name: 'Slovakia',                 flag: '🇸🇰' },
  { code: '+386', name: 'Slovenia',                 flag: '🇸🇮' },
  { code: '+677', name: 'Solomon Islands',          flag: '🇸🇧' },
  { code: '+252', name: 'Somalia',                  flag: '🇸🇴' },
  { code: '+27',  name: 'South Africa',             flag: '🇿🇦' },
  { code: '+82',  name: 'South Korea',              flag: '🇰🇷' },
  { code: '+211', name: 'South Sudan',              flag: '🇸🇸' },
  { code: '+34',  name: 'Spain',                    flag: '🇪🇸' },
  { code: '+94',  name: 'Sri Lanka',                flag: '🇱🇰' },
  { code: '+249', name: 'Sudan',                    flag: '🇸🇩' },
  { code: '+597', name: 'Suriname',                 flag: '🇸🇷' },
  { code: '+46',  name: 'Sweden',                   flag: '🇸🇪' },
  { code: '+41',  name: 'Switzerland',              flag: '🇨🇭' },
  { code: '+963', name: 'Syria',                    flag: '🇸🇾' },
  { code: '+886', name: 'Taiwan',                   flag: '🇹🇼' },
  { code: '+992', name: 'Tajikistan',                flag: '🇹🇯' },
  { code: '+255', name: 'Tanzania',                 flag: '🇹🇿' },
  { code: '+66',  name: 'Thailand',                 flag: '🇹🇭' },
  { code: '+670', name: 'Timor-Leste',               flag: '🇹🇱' },
  { code: '+228', name: 'Togo',                     flag: '🇹🇬' },
  { code: '+676', name: 'Tonga',                    flag: '🇹🇴' },
  { code: '+1',   name: 'Trinidad and Tobago',      flag: '🇹🇹' },
  { code: '+216', name: 'Tunisia',                  flag: '🇹🇳' },
  { code: '+90',  name: 'Turkey',                   flag: '🇹🇷' },
  { code: '+993', name: 'Turkmenistan',              flag: '🇹🇲' },
  { code: '+688', name: 'Tuvalu',                   flag: '🇹🇻' },
  { code: '+256', name: 'Uganda',                   flag: '🇺🇬' },
  { code: '+380', name: 'Ukraine',                  flag: '🇺🇦' },
  { code: '+971', name: 'United Arab Emirates',     flag: '🇦🇪' },
  { code: '+44',  name: 'United Kingdom',           flag: '🇬🇧' },
  { code: '+1',   name: 'United States',            flag: '🇺🇸' },
  { code: '+598', name: 'Uruguay',                  flag: '🇺🇾' },
  { code: '+998', name: 'Uzbekistan',                flag: '🇺🇿' },
  { code: '+678', name: 'Vanuatu',                  flag: '🇻🇺' },
  { code: '+379', name: 'Vatican City',              flag: '🇻🇦' },
  { code: '+58',  name: 'Venezuela',                flag: '🇻🇪' },
  { code: '+84',  name: 'Vietnam',                  flag: '🇻🇳' },
  { code: '+967', name: 'Yemen',                    flag: '🇾🇪' },
  { code: '+260', name: 'Zambia',                   flag: '🇿🇲' },
  { code: '+263', name: 'Zimbabwe',                 flag: '🇿🇼' },
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
    minHeight: '100vh', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)',
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", padding: 20,
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '40px 36px', width: '100%',
    maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  brandMark: {
    width: 48, height: 48, borderRadius: 12, background: '#1a56a0', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 18, marginBottom: 20,
  },
  title:    { fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: '0 0 6px' },
  subtitle: { fontSize: 14, color: '#888', margin: '0 0 28px', lineHeight: 1.5 },
  form:     { display: 'flex', flexDirection: 'column' },
  label:    { display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 },
  roleRow:  { display: 'flex', gap: 8 },
  roleBtn: {
    flex: 1, padding: '11px', borderRadius: 9, border: '1.5px solid #ddd', background: '#fff',
    color: '#555', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  roleBtnOn: { background: '#1a56a0', borderColor: '#1a56a0', color: '#fff' },
  phoneRow:  { display: 'flex', gap: 8 },
  countrySelect: {
    flexShrink: 0, width: 130, padding: '11px 8px', borderRadius: 9, border: '1.5px solid #ddd',
    fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer',
  },
  phoneInput: {
    flex: 1, padding: '11px 13px', borderRadius: 9, border: '1.5px solid #ddd',
    fontSize: 14, outline: 'none', boxSizing: 'border-box', minWidth: 0,
  },
  errorMsg: {
    fontSize: 13, color: '#e53e3e', background: '#fae6e6', borderRadius: 8,
    padding: '10px 12px', marginBottom: 16,
  },
  submitBtn: {
    padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)', color: '#fff',
    fontSize: 15, fontWeight: 700, marginTop: 6,
  },
  footer:     { textAlign: 'center', marginTop: 20, fontSize: 13 },
  footerText: { color: '#bbb' },
  footerLink: { color: '#1a56a0', fontWeight: 600, textDecoration: 'none' },
  backLink:   { color: '#1a56a0', fontWeight: 600, textDecoration: 'none', fontSize: 14 },
}
