// src/pages/RedeemRef.jsx
import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function RedeemRef() {
  const { refCode } = useParams()
  const navigate    = useNavigate()

  useEffect(() => {
    // Save referral code to localStorage so signup page can use it
    if (refCode) {
      localStorage.setItem('ref_code', refCode)
    }
    // Redirect to signup page
    navigate('/login', { replace: true })
  }, [refCode, navigate])

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#075e54' }}>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
        Loading TutorJamesConnect...
      </div>
    </div>
  )
}