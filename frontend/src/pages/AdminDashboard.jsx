// src/pages/AdminDashboard.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab]     = useState('overview')
  const [overview, setOverview]       = useState(null)
  const [clients, setClients]         = useState([])
  const [providers, setProviders]     = useState([])
  const [rooms, setRooms]             = useState([])
  const [pending, setPending]         = useState([])
  const [pendingFiles, setPendingFiles] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  const [newRoom, setNewRoom]         = useState({ name: '', client_id: '' })
  const [roomMsg, setRoomMsg]         = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/login')
      return
    }
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [ov, users, rm, pend, pf] = await Promise.all([
        api.get('/dashboard/overview/'),
        api.get('/accounts/users/'),
        api.get('/chat/rooms/'),
        api.get('/chat/admin/pending/'),
        api.get('/chat/admin/files/'),
      ])
      setOverview(ov.data)
      setClients(users.data.filter(u => u.role === 'client'))
      setProviders(users.data.filter(u => u.role === 'provider'))
      setRooms(rm.data)
      setPending(pend.data)
      setPendingFiles(pf.data)
    } catch (err) {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  const createRoom = async () => {
    if (!newRoom.name || !newRoom.client_id) {
      setRoomMsg('Please enter a room name and select a client.')
      return
    }
    try {
      await api.post('/chat/rooms/create/', {
        name:      newRoom.name,
        client_id: newRoom.client_id,
      })
      setRoomMsg('✅ Room created successfully!')
      setNewRoom({ name: '', client_id: '' })
      loadAll()
    } catch (err) {
      setRoomMsg('❌ Failed to create room.')
    }
  }

  const approveMessage = async (id) => {
    try {
      await api.post('/chat/admin/messages/' + id + '/approve/')
      setPending(prev => prev.filter(p => p.id !== id))
      setOverview(prev => ({ ...prev, pending_messages: prev.pending_messages - 1 }))
    } catch {
      setError('Failed to approve message.')
    }
  }

  const rejectMessage = async (id) => {
    try {
      await api.post('/chat/admin/messages/' + id + '/reject/')
      setPending(prev => prev.filter(p => p.id !== id))
      setOverview(prev => ({ ...prev, pending_messages: prev.pending_messages - 1 }))
    } catch {
      setError('Failed to reject message.')
    }
  }

  const approveFile = async (id) => {
    try {
      await api.post('/chat/admin/files/' + id + '/approve/')
      setPendingFiles(prev => prev.filter(f => f.id !== id))
      setOverview(prev => ({ ...prev, pending_files: prev.pending_files - 1 }))
    } catch {
      setError('Failed to approve file.')
    }
  }

  const rejectFile = async (id) => {
    try {
      await api.post('/chat/admin/files/' + id + '/reject/')
      setPendingFiles(prev => prev.filter(f => f.id !== id))
      setOverview(prev => ({ ...prev, pending_files: prev.pending_files - 1 }))
    } catch {
      setError('Failed to reject file.')
    }
  }

  const totalPending = pending.length + pendingFiles.length

  const tabs = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'clients',   label: '👤 Clients' },
    { id: 'providers', label: '🎓 Providers' },
    { id: 'rooms',     label: '💬 Chat Rooms' },
    { id: 'pending',   label: `⏳ Pending ${totalPending > 0 ? '(' + totalPending + ')' : ''}` },
  ]

  if (loading) return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingText}>Loading dashboard...</div>
    </div>
  )

  return (
    <div style={styles.app}>

      {/* ── SIDEBAR ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logo}>TutorJamesConnect</div>
          <div style={styles.logoSub}>Admin Dashboard</div>
        </div>

        <div style={styles.userInfo}>
          <div style={styles.avatar}>A</div>
          <div>
            <div style={styles.userName}>{user?.display_name || 'Admin'}</div>
            <div style={styles.userRole}>Administrator</div>
          </div>
        </div>

        <div style={styles.navList}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{
                ...styles.navItem,
                background: activeTab === tab.id ? '#1a56a0' : 'transparent',
                color:      activeTab === tab.id ? '#fff' : '#1a1a1a',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div style={styles.sidebarBottom}>
          <button style={styles.chatBtn} onClick={() => navigate('/chat/1')}>
            💬 Go to Chat
          </button>
          <button style={styles.logoutBtn} onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={styles.main}>

        <div style={styles.header}>
          <div style={styles.headerTitle}>
            {tabs.find(t => t.id === activeTab)?.label}
          </div>
          <button style={styles.refreshBtn} onClick={loadAll}>
            🔄 Refresh
          </button>
        </div>

        {error && <div style={styles.errorBanner}>{error}</div>}

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && overview && (
          <div style={styles.content}>
            <div style={styles.statsGrid}>
              {[
                { label: 'Total Clients',    value: overview.total_clients,    color: '#1a56a0', bg: '#f0f4ff' },
                { label: 'Total Providers',  value: overview.total_providers,  color: '#1a7a4a', bg: '#f0fff6' },
                { label: 'Active Rooms',     value: overview.active_rooms,     color: '#BA7517', bg: '#fff8e1' },
                { label: 'Total Rooms',      value: overview.total_rooms,      color: '#555',    bg: '#f5f5f5' },
                { label: 'Total Messages',   value: overview.total_messages,   color: '#1a56a0', bg: '#f0f4ff' },
                { label: 'Pending Messages', value: overview.pending_messages, color: '#e53e3e', bg: '#fae6e6' },
                { label: 'Total Files',      value: overview.total_files,      color: '#1a7a4a', bg: '#f0fff6' },
                { label: 'Pending Files',    value: overview.pending_files,    color: '#e53e3e', bg: '#fae6e6' },
              ].map(s => (
                <div key={s.label} style={{ ...styles.statCard, background: s.bg }}>
                  <div style={{ ...styles.statValue, color: s.color }}>{s.value}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {totalPending > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>⚠️ Items Requiring Approval</div>
                {pending.slice(0, 3).map(p => (
                  <div key={p.id} style={styles.pendingCard}>
                    <div style={styles.pendingInfo}>
                      <span style={styles.pendingFrom}>{p.sender?.display_name}</span>
                      <span style={styles.pendingReason}>⚠️ {p.flag_reason}</span>
                    </div>
                    <div style={styles.pendingBody}>"{p.body}"</div>
                    <div style={styles.pendingBtns}>
                      <button style={styles.approveBtn} onClick={() => approveMessage(p.id)}>✓ Approve</button>
                      <button style={styles.rejectBtn} onClick={() => rejectMessage(p.id)}>✕ Reject</button>
                    </div>
                  </div>
                ))}
                {pendingFiles.slice(0, 2).map(f => (
                  <div key={f.id} style={{ ...styles.pendingCard, background: '#f0f4ff', border: '1px solid #c0d4f0' }}>
                    <div style={styles.pendingInfo}>
                      <span style={styles.pendingFrom}>{f.sender?.display_name}</span>
                      <span style={{ fontSize: 12, color: '#1a56a0' }}>📎 {f.file_name}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>{f.file_size_display}</span>
                    </div>
                    <div style={styles.pendingBtns}>
                      <button style={styles.approveBtn} onClick={() => approveFile(f.id)}>✓ Approve</button>
                      <button style={styles.rejectBtn} onClick={() => rejectFile(f.id)}>✕ Reject</button>
                    </div>
                  </div>
                ))}
                {totalPending > 5 && (
                  <button style={styles.viewAllBtn} onClick={() => setActiveTab('pending')}>
                    View all {totalPending} pending items →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CLIENTS TAB ── */}
        {activeTab === 'clients' && (
          <div style={styles.content}>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>All Clients ({clients.length})</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Client ID', 'Email', 'Phone', 'Verified', 'Joined', 'Action'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                      <td style={styles.td}>
                        <span style={styles.clientId}>{c.display_name || c.client_id}</span>
                      </td>
                      <td style={styles.td}>{c.email}</td>
                      <td style={styles.td}>{c.phone_number || '—'}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          background: c.is_verified ? '#e6f4ed' : '#fae6e6',
                          color:      c.is_verified ? '#1a7a4a' : '#a0251a',
                        }}>
                          {c.is_verified ? '✓ Verified' : '✗ Unverified'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={styles.td}>
                        <button
                          style={styles.openBtn}
                          onClick={() => {
                            setNewRoom({ name: '', client_id: c.id })
                            setActiveTab('rooms')
                          }}
                        >
                          + Create Room
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PROVIDERS TAB ── */}
        {activeTab === 'providers' && (
          <div style={styles.content}>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>All Providers ({providers.length})</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Name', 'Email', 'Phone', 'Specialisation', 'Rate (Ksh/page)', 'Verified', 'Joined'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                      <td style={styles.td}>
                        <span style={styles.providerName}>{p.display_name}</span>
                      </td>
                      <td style={styles.td}>{p.email}</td>
                      <td style={styles.td}>{p.phone_number || '—'}</td>
                      <td style={styles.td}>{p.provider_profile?.specialisation || '—'}</td>
                      <td style={styles.td}>
                        {p.provider_profile
                          ? 'Ksh ' + p.provider_profile.rate_min + ' — ' + p.provider_profile.rate_max
                          : '—'}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          background: p.is_verified ? '#e6f4ed' : '#fae6e6',
                          color:      p.is_verified ? '#1a7a4a' : '#a0251a',
                        }}>
                          {p.is_verified ? '✓ Verified' : '✗ Unverified'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CHAT ROOMS TAB ── */}
        {activeTab === 'rooms' && (
          <div style={styles.content}>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>➕ Create New Chat Room</div>
              <div style={styles.formRow}>
                <input
                  style={styles.formInput}
                  placeholder="Room name e.g. Research Paper"
                  value={newRoom.name}
                  onChange={e => setNewRoom({ ...newRoom, name: e.target.value })}
                />
                <select
                  style={styles.formSelect}
                  value={newRoom.client_id}
                  onChange={e => setNewRoom({ ...newRoom, client_id: e.target.value })}
                >
                  <option value="">Select a client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.client_id}
                    </option>
                  ))}
                </select>
                <button style={styles.createBtn} onClick={createRoom}>
                  Create Room
                </button>
              </div>
              {roomMsg && (
                <div style={{
                  ...styles.roomMsg,
                  color: roomMsg.startsWith('✅') ? '#1a7a4a' : '#a0251a',
                }}>
                  {roomMsg}
                </div>
              )}
            </div>

            {/* Per-room pending items */}
            {rooms.map(r => {
              const roomPendingMsgs  = pending.filter(p => p.room === r.id)
              const roomPendingFiles = pendingFiles.filter(f => f.room === r.id)
              const hasPending = roomPendingMsgs.length > 0 || roomPendingFiles.length > 0

              return (
                <div key={r.id} style={{
                  ...styles.section,
                  border: hasPending ? '1.5px solid #f0d080' : '1px solid #e5e5e5',
                  background: hasPending ? '#fffdf0' : '#fff',
                }}>
                  {/* Room header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
                        {r.name}
                        {hasPending && (
                          <span style={{ marginLeft: 8, fontSize: 11, background: '#e53e3e', color: '#fff', borderRadius: 10, padding: '2px 7px' }}>
                            {roomPendingMsgs.length + roomPendingFiles.length} pending
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                        Client: {r.client?.display_name || '—'} ·{' '}
                        Providers: {(r.providers || []).map(p => p.display_name).join(', ') || '— Not assigned'} ·{' '}
                        <span style={{
                          color: r.status === 'active' ? '#1a7a4a' : r.status === 'negotiating' ? '#BA7517' : '#888',
                          fontWeight: 600,
                        }}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                    <button style={styles.openBtn} onClick={() => navigate('/chat/' + r.id)}>
                      Open →
                    </button>
                  </div>

                  {/* Pending messages for this room */}
                  {roomPendingMsgs.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#BA7517', marginBottom: 6 }}>
                        ⚠️ Pending Messages ({roomPendingMsgs.length})
                      </div>
                      {roomPendingMsgs.map(p => (
                        <div key={p.id} style={styles.pendingCard}>
                          <div style={styles.pendingInfo}>
                            <span style={styles.pendingFrom}>{p.sender?.display_name}</span>
                            <span style={styles.pendingReason}>⚠️ {p.flag_reason}</span>
                            <span style={styles.pendingTime}>{new Date(p.timestamp).toLocaleString()}</span>
                          </div>
                          <div style={styles.pendingBody}>"{p.body}"</div>
                          <div style={styles.pendingBtns}>
                            <button style={styles.approveBtn} onClick={() => approveMessage(p.id)}>✓ Approve</button>
                            <button style={styles.rejectBtn} onClick={() => rejectMessage(p.id)}>✕ Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending files for this room */}
                  {roomPendingFiles.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#1a56a0', marginBottom: 6 }}>
                        📎 Pending Files ({roomPendingFiles.length})
                      </div>
                      {roomPendingFiles.map(f => (
                        <div key={f.id} style={{ ...styles.pendingCard, background: '#f0f4ff', border: '1px solid #c0d4f0' }}>
                          <div style={styles.pendingInfo}>
                            <span style={styles.pendingFrom}>{f.sender?.display_name}</span>
                            <span style={{ fontSize: 12, color: '#1a56a0', fontWeight: 500 }}>
                              📄 {f.file_name}
                            </span>
                            <span style={{ fontSize: 11, color: '#888' }}>{f.file_size_display}</span>
                          </div>
                          <div style={styles.pendingBtns}>
                            <button style={styles.approveBtn} onClick={() => approveFile(f.id)}>✓ Approve</button>
                            <button style={styles.rejectBtn} onClick={() => rejectFile(f.id)}>✕ Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!hasPending && (
                    <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '4px 0' }}>
                      ✅ No pending items
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── PENDING TAB ── */}
        {activeTab === 'pending' && (
          <div style={styles.content}>

            {/* Pending Messages */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                Pending Messages ({pending.length})
              </div>
              {pending.length === 0 ? (
                <div style={styles.emptyState}>✅ No pending messages</div>
              ) : (
                pending.map(p => (
                  <div key={p.id} style={styles.pendingCard}>
                    <div style={styles.pendingInfo}>
                      <span style={styles.pendingFrom}>From: {p.sender?.display_name}</span>
                      <span style={styles.pendingReason}>⚠️ {p.flag_reason}</span>
                      <span style={styles.pendingTime}>{new Date(p.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={styles.pendingBody}>"{p.body}"</div>
                    <div style={styles.pendingBtns}>
                      <button style={styles.approveBtn} onClick={() => approveMessage(p.id)}>
                        ✓ Approve — deliver to room
                      </button>
                      <button style={styles.rejectBtn} onClick={() => rejectMessage(p.id)}>
                        ✕ Reject — delete message
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pending Files */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                Pending Files ({pendingFiles.length})
              </div>
              {pendingFiles.length === 0 ? (
                <div style={styles.emptyState}>✅ No pending files</div>
              ) : (
                pendingFiles.map(f => (
                  <div key={f.id} style={{ ...styles.pendingCard, background: '#f0f4ff', border: '1px solid #c0d4f0' }}>
                    <div style={styles.pendingInfo}>
                      <span style={styles.pendingFrom}>From: {f.sender?.display_name}</span>
                      <span style={{ fontSize: 12, color: '#1a56a0', fontWeight: 500 }}>
                        📄 {f.file_name}
                      </span>
                      <span style={{ fontSize: 11, color: '#888' }}>{f.file_size_display}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>Room: {f.room_name}</span>
                    </div>
                    <div style={styles.pendingBtns}>
                      <button style={styles.approveBtn} onClick={() => approveFile(f.id)}>
                        ✓ Approve — share in room
                      </button>
                      <button style={styles.rejectBtn} onClick={() => rejectFile(f.id)}>
                        ✕ Reject — discard file
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

const styles = {
  app: { display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif', background: '#f5f5f5', overflow: 'hidden' },
  loadingScreen: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: '16px', color: '#888' },
  sidebar: { width: '240px', background: '#ffffff', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sidebarHeader: { padding: '20px 16px 12px', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)' },
  logo: { color: '#ffffff', fontSize: '14px', fontWeight: '700' },
  logoSub: { color: '#BDD7F5', fontSize: '11px', marginTop: '3px' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', flexShrink: 0 },
  userName: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' },
  userRole: { fontSize: '11px', color: '#888' },
  navList: { flex: 1, padding: '8px', overflowY: 'auto' },
  navItem: { padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', marginBottom: '4px', transition: 'background 0.15s' },
  sidebarBottom: { padding: '12px', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '8px' },
  chatBtn: { padding: '8px', border: '1px solid #1a56a0', borderRadius: '8px', background: 'none', color: '#1a56a0', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  logoutBtn: { padding: '8px', border: '1px solid #ddd', borderRadius: '8px', background: 'none', color: '#888', fontSize: '13px', cursor: 'pointer' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: '18px', fontWeight: '700', color: '#1a1a1a' },
  refreshBtn: { padding: '7px 14px', border: '1px solid #ddd', borderRadius: '8px', background: 'none', color: '#555', fontSize: '13px', cursor: 'pointer' },
  errorBanner: { background: '#fae6e6', color: '#a0251a', padding: '10px 24px', fontSize: '13px' },
  content: { flex: 1, overflowY: 'auto', padding: '24px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' },
  statCard: { padding: '20px', borderRadius: '12px', textAlign: 'center' },
  statValue: { fontSize: '32px', fontWeight: '700', marginBottom: '6px' },
  statLabel: { fontSize: '12px', color: '#888', fontWeight: '500' },
  section: { background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e5e5e5' },
  sectionTitle: { fontSize: '15px', fontWeight: '600', color: '#1a1a1a', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { padding: '10px 14px', textAlign: 'left', background: '#f5f5f5', color: '#555', fontWeight: '600', fontSize: '12px', borderBottom: '1px solid #e5e5e5' },
  td: { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', color: '#1a1a1a' },
  badge: { padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' },
  clientId: { fontWeight: '600', color: '#1a56a0', fontSize: '13px' },
  providerName: { fontWeight: '600', color: '#1a7a4a', fontSize: '13px' },
  formRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  formInput: { flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none' },
  formSelect: { flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer' },
  createBtn: { padding: '9px 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  roomMsg: { marginTop: '10px', fontSize: '13px', fontWeight: '500' },
  openBtn: { padding: '5px 12px', borderRadius: '6px', border: '1px solid #1a56a0', background: 'none', color: '#1a56a0', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  pendingCard: { background: '#fff8e1', border: '1px solid #f0d080', borderRadius: '10px', padding: '14px', marginBottom: '10px' },
  pendingInfo: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' },
  pendingFrom: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' },
  pendingReason: { fontSize: '12px', color: '#BA7517', fontWeight: '500' },
  pendingTime: { fontSize: '11px', color: '#aaa', marginLeft: 'auto' },
  pendingBody: { fontSize: '14px', color: '#1a1a1a', marginBottom: '10px', fontStyle: 'italic' },
  pendingBtns: { display: 'flex', gap: '8px' },
  approveBtn: { flex: 1, padding: '7px', border: '1px solid #1a7a4a', borderRadius: '8px', background: 'none', color: '#1a7a4a', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  rejectBtn: { flex: 1, padding: '7px', border: '1px solid #e53e3e', borderRadius: '8px', background: 'none', color: '#e53e3e', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  viewAllBtn: { padding: '8px 16px', border: '1px solid #1a56a0', borderRadius: '8px', background: 'none', color: '#1a56a0', fontSize: '13px', cursor: 'pointer', marginTop: '8px' },
  emptyState: { textAlign: 'center', fontSize: '14px', color: '#888', padding: '40px 0' },
}
