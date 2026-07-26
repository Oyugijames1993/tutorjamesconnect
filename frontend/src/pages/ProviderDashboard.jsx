// src/pages/ProviderDashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

const POLL_INTERVAL_MS = 8000

export default function ProviderDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [rooms, setRooms]     = useState([])
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)

  const loadRooms = useCallback(async () => {
    try {
      const res = await api.get('/chat/rooms/')
      setRooms(res.data)
      setLastChecked(new Date())
    } catch {
      // Silent — a failed poll shouldn't disrupt the page; it'll just
      // try again on the next tick.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRooms()
    const interval = setInterval(loadRooms, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadRooms])

  const statusColor = s => s === 'active' ? '#1a7a4a' : s === 'negotiating' ? '#BA7517' : '#888'
  const statusLabel = s => s === 'active' ? 'Active' : s === 'negotiating' ? 'Negotiating' : 'Closed'

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.loadingText}>Loading your dashboard…</div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.header}>
          <div style={S.brandMark}>TJ</div>
          <div>
            <div style={S.brandName}>TutorJamesConnect</div>
            <div style={S.brandSub}>Provider Dashboard</div>
          </div>
        </div>

        <div style={S.greeting}>
          Welcome, {user?.display_name || 'there'} 👋
        </div>

        {rooms.length === 0 ? (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}>🕐</div>
            <div style={S.emptyTitle}>0 rooms assigned yet</div>
            <p style={S.emptyText}>
              The admin hasn't added you to a project room yet. This page checks
              automatically — no need to refresh, it'll appear here the moment
              you're assigned.
            </p>
          </div>
        ) : (
          <>
            <div style={S.roomCount}>
              {rooms.length} room{rooms.length !== 1 ? 's' : ''} assigned
            </div>
            <div style={S.roomList}>
              {rooms.map(r => (
                <div key={r.id} style={S.roomCard} onClick={() => navigate(`/chat/${r.id}`)}>
                  <div style={S.roomCardTop}>
                    <span style={S.roomName}>{r.name}</span>
                    <span style={{ ...S.statusPill, color: statusColor(r.status), background: statusColor(r.status) + '1a' }}>
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  <div style={S.roomMeta}>
                    Client: {r.client?.display_name || '—'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {lastChecked && (
          <div style={S.checkedText}>
            Last checked {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        <button style={S.signOutBtn} onClick={logout}>Sign Out</button>
      </div>
    </div>
  )
}

const S = {
  page: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'linear-gradient(135deg, #1a7a4a, #0d4a2e)',
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", padding: 20,
  },
  loadingText: { color: '#fff', fontSize: 15 },
  card: {
    background: '#fff', borderRadius: 16, padding: '36px 32px', width: '100%',
    maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  brandMark: {
    width: 44, height: 44, borderRadius: 11, background: '#1a7a4a', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16,
  },
  brandName: { fontSize: 15, fontWeight: 700, color: '#1a1a1a' },
  brandSub:  { fontSize: 12, color: '#888' },
  greeting:  { fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 20 },

  emptyState: { textAlign: 'center', padding: '24px 8px' },
  emptyIcon:  { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 },
  emptyText:  { fontSize: 13, color: '#888', lineHeight: 1.6, margin: 0 },

  roomCount: { fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
  roomList:  { display: 'flex', flexDirection: 'column', gap: 8 },
  roomCard: {
    border: '1.5px solid #eee', borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  roomCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roomName:    { fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  statusPill:  { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 },
  roomMeta:    { fontSize: 12, color: '#888' },

  checkedText: { fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 20 },
  signOutBtn: {
    width: '100%', padding: 10, borderRadius: 9, border: '1px solid #ddd', background: 'none',
    color: '#888', fontSize: 13, cursor: 'pointer', marginTop: 14,
  },
}
