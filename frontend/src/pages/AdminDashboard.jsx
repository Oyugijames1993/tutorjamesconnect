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
  const [accessRequests, setAccessRequests] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showSidebar, setShowSidebar] = useState(false)

  const [newRoom, setNewRoom]         = useState({ name: '', client_id: '' })
  const [roomMsg, setRoomMsg]         = useState('')
  const [referrals, setReferrals] = useState([])

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/login')
      return
    }
    loadAll()
    // On desktop show sidebar by default
    if (window.innerWidth >= 768) setShowSidebar(true)
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [ov, users, rm, pend, pf, ar] = await Promise.all([
        api.get('/dashboard/overview/'),
        api.get('/accounts/users/'),
        api.get('/chat/rooms/'),
        api.get('/chat/admin/pending/'),
        api.get('/chat/admin/files/'),
        api.get('/accounts/admin/access-requests/'),
        api.get('/accounts/referrals/'),
      ])
      setOverview(ov.data)
      setClients(users.data.filter(u => u.role === 'client'))
      setProviders(users.data.filter(u => u.role === 'provider'))
      setRooms(rm.data)
      setPending(pend.data)
      setPendingFiles(pf.data)
      setAccessRequests(ar.data)
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
      await api.post('/chat/rooms/create/', { name: newRoom.name, client_id: newRoom.client_id })
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
    } catch { setError('Failed to approve message.') }
  }

  const rejectMessage = async (id) => {
    try {
      await api.post('/chat/admin/messages/' + id + '/reject/')
      setPending(prev => prev.filter(p => p.id !== id))
      setOverview(prev => ({ ...prev, pending_messages: prev.pending_messages - 1 }))
    } catch { setError('Failed to reject message.') }
  }

  const approveFile = async (id) => {
    try {
      await api.post('/chat/admin/files/' + id + '/approve/')
      setPendingFiles(prev => prev.filter(f => f.id !== id))
      setOverview(prev => ({ ...prev, pending_files: prev.pending_files - 1 }))
    } catch { setError('Failed to approve file.') }
  }

  const rejectFile = async (id) => {
    try {
      await api.post('/chat/admin/files/' + id + '/reject/')
      setPendingFiles(prev => prev.filter(f => f.id !== id))
      setOverview(prev => ({ ...prev, pending_files: prev.pending_files - 1 }))
    } catch { setError('Failed to reject file.') }
  }

  const totalPending = pending.length + pendingFiles.length

  const tabs = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'clients',   label: '👤 Clients' },
    { id: 'providers', label: '🎓 Providers' },
    { id: 'rooms',     label: '💬 Chat Rooms' },
    { id: 'pending',   label: `⏳ Pending ${totalPending > 0 ? '(' + totalPending + ')' : ''}` },
    { id: 'referrals', label: '🎁 Referrals' },
    { id: 'access',    label: `🔐 Access Requests ${accessRequests.length > 0 ? '(' + accessRequests.length + ')' : ''}` },
  ]

  const handleTabClick = (tabId) => {
    setActiveTab(tabId)
    // On mobile close sidebar after selecting a tab
    if (window.innerWidth < 768) setShowSidebar(false)
  }

  if (loading) return (
    <div style={S.loadingScreen}>
      <div style={S.loadingText}>Loading dashboard...</div>
    </div>
  )

  return (
    <div style={S.app}>
      <style>{`
        * { box-sizing: border-box; }
        .tjc-nav-item:hover { background: #f0f2f5 !important; }
        .tjc-refresh:hover { border-color: #00a884 !important; color: #00a884 !important; }
        .tjc-open-btn:hover { background: #e7f8f3 !important; }
        .tjc-create-btn:hover { filter: brightness(1.06); }
        .tjc-chat-btn:hover { background: #00a884 !important; color: #fff !important; }
        .tjc-logout-btn:hover { color: #e53e3e !important; border-color: #feb2b2 !important; }
        .tjc-approve-btn:hover { background: #d9f4e3 !important; }
        .tjc-reject-btn:hover { background: #fde3e3 !important; }
        .tjc-table-row:hover { background: #f7f9fa !important; }
        .tjc-view-all:hover { background: #e7f8f3 !important; }
        .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 99; }
        .overlay.visible { display: block; }
        @media (max-width: 767px) {
          .sidebar-panel {
            position: fixed !important;
            left: 0; top: 0; bottom: 0;
            width: 280px !important;
            z-index: 100;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
          }
          .sidebar-panel.open { transform: translateX(0) !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .form-row { flex-direction: column !important; }
          .form-row input, .form-row select, .form-row button { width: 100% !important; }
          .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .content-area { padding: 14px !important; }
          .header-area { padding: 12px 16px !important; }
          .header-title { font-size: 16px !important; }
        }
      `}</style>

      {/* Overlay for mobile sidebar */}
      <div
        className={`overlay${showSidebar && window.innerWidth < 768 ? ' visible' : ''}`}
        onClick={() => setShowSidebar(false)}
      />

      {/* ── SIDEBAR ── */}
      <div className={`sidebar-panel${showSidebar ? ' open' : ''}`} style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={S.logo}>TutorJamesConnect</div>
          <div style={S.logoSub}>Admin Dashboard</div>
        </div>

        <div style={S.userInfo}>
          <div style={S.avatar}>A</div>
          <div>
            <div style={S.userName}>{user?.display_name || 'Admin'}</div>
            <div style={S.userRole}>Administrator</div>
          </div>
        </div>

        <div style={S.navList}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              className="tjc-nav-item"
              style={{
                ...S.navItem,
                background: activeTab === tab.id ? '#00a884' : 'transparent',
                color:      activeTab === tab.id ? '#fff' : '#1a1a1a',
              }}
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div style={S.sidebarBottom}>
          <button className="tjc-chat-btn" style={S.chatBtn} onClick={() => navigate('/chat/1')}>
            💬 Go to Chat
          </button>
          <button className="tjc-logout-btn" style={S.logoutBtn} onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={S.main}>

        {/* Header */}
        <div className="header-area" style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Hamburger button */}
            <button
              style={S.hamburger}
              onClick={() => setShowSidebar(v => !v)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <div className="header-title" style={S.headerTitle}>
              {tabs.find(t => t.id === activeTab)?.label}
            </div>
          </div>
          <button className="tjc-refresh" style={S.refreshBtn} onClick={loadAll}>
            🔄
          </button>
        </div>

        {error && <div style={S.errorBanner}>{error}</div>}

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && overview && (
          <div className="content-area" style={S.content}>
            <div className="stats-grid" style={S.statsGrid}>
              {[
                { label: 'Total Clients',    value: overview.total_clients,    color: '#00a884', bg: '#e7f8f3' },
                { label: 'Total Providers',  value: overview.total_providers,  color: '#1a7a4a', bg: '#f0fff6' },
                { label: 'Active Rooms',     value: overview.active_rooms,     color: '#BA7517', bg: '#fff8e1' },
                { label: 'Total Rooms',      value: overview.total_rooms,      color: '#555',    bg: '#f5f5f5' },
                { label: 'Pending Messages', value: overview.pending_messages, color: '#e53e3e', bg: '#fae6e6' },
                { label: 'Pending Files',    value: overview.pending_files,    color: '#e53e3e', bg: '#fae6e6' },
              ].map(s => (
                <div key={s.label} style={{ ...S.statCard, background: s.bg }}>
                  <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
                  <div style={S.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {totalPending > 0 && (
              <div style={S.section}>
                <div style={S.sectionTitle}>⚠️ Items Requiring Approval</div>
                {pending.slice(0, 3).map(p => (
                  <div key={p.id} style={S.pendingCard}>
                    <div style={S.pendingInfo}>
                      <span style={S.pendingFrom}>{p.sender?.display_name}</span>
                      <span style={S.pendingReason}>⚠️ {p.flag_reason}</span>
                    </div>
                    <div style={S.pendingBody}>"{p.body}"</div>
                    <div style={S.pendingBtns}>
                      <button className="tjc-approve-btn" style={S.approveBtn} onClick={() => approveMessage(p.id)}>✓ Approve</button>
                      <button className="tjc-reject-btn" style={S.rejectBtn} onClick={() => rejectMessage(p.id)}>✕ Reject</button>
                    </div>
                  </div>
                ))}
                {pendingFiles.slice(0, 2).map(f => (
                  <div key={f.id} style={{ ...S.pendingCard, background: '#e7f8f3', border: '1px solid #b6e6d8' }}>
                    <div style={S.pendingInfo}>
                      <span style={S.pendingFrom}>{f.sender?.display_name}</span>
                      <span style={{ fontSize: 12, color: '#00a884' }}>📎 {f.file_name}</span>
                    </div>
                    <div style={S.pendingBtns}>
                      <button className="tjc-approve-btn" style={S.approveBtn} onClick={() => approveFile(f.id)}>✓ Approve</button>
                      <button className="tjc-reject-btn" style={S.rejectBtn} onClick={() => rejectFile(f.id)}>✕ Reject</button>
                    </div>
                  </div>
                ))}
                {totalPending > 5 && (
                  <button className="tjc-view-all" style={S.viewAllBtn} onClick={() => setActiveTab('pending')}>
                    View all {totalPending} pending items →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CLIENTS TAB ── */}
        {activeTab === 'clients' && (
          <div className="content-area" style={S.content}>
            <div style={S.section}>
              <div style={S.sectionTitle}>All Clients ({clients.length})</div>
              <div className="table-wrap">
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Client ID', 'Email', 'Phone', 'Verified', 'Joined', 'Action'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c, i) => (
                      <tr key={c.id} className="tjc-table-row" style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                        <td style={S.td}><span style={S.clientId}>{c.display_name || c.client_id}</span></td>
                        <td style={S.td}>{c.email}</td>
                        <td style={S.td}>{c.phone_number || '—'}</td>
                        <td style={S.td}>
                          <span style={{ ...S.badge, background: c.is_verified ? '#e6f4ed' : '#fae6e6', color: c.is_verified ? '#1a7a4a' : '#a0251a' }}>
                            {c.is_verified ? '✓' : '✗'}
                          </span>
                        </td>
                        <td style={S.td}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                        <td style={S.td}>
                          <button className="tjc-open-btn" style={S.openBtn}
                            onClick={() => { setNewRoom({ name: '', client_id: c.id }); setActiveTab('rooms') }}>
                            + Room
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PROVIDERS TAB ── */}
        {activeTab === 'providers' && (
          <div className="content-area" style={S.content}>
            <div style={S.section}>
              <div style={S.sectionTitle}>All Providers ({providers.length})</div>
              <div className="table-wrap">
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Phone', 'Specialisation', 'Rate', 'Verified'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p, i) => (
                      <tr key={p.id} className="tjc-table-row" style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                        <td style={S.td}><span style={S.providerName}>{p.display_name}</span></td>
                        <td style={S.td}>{p.email}</td>
                        <td style={S.td}>{p.phone_number || '—'}</td>
                        <td style={S.td}>{p.provider_profile?.specialisation || '—'}</td>
                        <td style={S.td}>{p.provider_profile ? 'Ksh ' + p.provider_profile.rate_min + '–' + p.provider_profile.rate_max : '—'}</td>
                        <td style={S.td}>
                          <span style={{ ...S.badge, background: p.is_verified ? '#e6f4ed' : '#fae6e6', color: p.is_verified ? '#1a7a4a' : '#a0251a' }}>
                            {p.is_verified ? '✓' : '✗'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── CHAT ROOMS TAB ── */}
        {activeTab === 'rooms' && (
          <div className="content-area" style={S.content}>
            <div style={S.section}>
              <div style={S.sectionTitle}>➕ Create New Chat Room</div>
              <div className="form-row" style={S.formRow}>
                <input
                  style={S.formInput}
                  placeholder="Course name e.g. BSc Computer Science"
                  value={newRoom.name}
                  onChange={e => setNewRoom({ ...newRoom, name: e.target.value })}
                />
                <select
                  style={S.formSelect}
                  value={newRoom.client_id}
                  onChange={e => setNewRoom({ ...newRoom, client_id: e.target.value })}
                >
                  <option value="">Select a client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.display_name || c.client_id}</option>
                  ))}
                </select>
                <button className="tjc-create-btn" style={S.createBtn} onClick={createRoom}>
                  Create Room
                </button>
              </div>
              {roomMsg && <div style={{ ...S.roomMsg, color: roomMsg.startsWith('✅') ? '#1a7a4a' : '#a0251a' }}>{roomMsg}</div>}
            </div>

            {rooms.map(r => {
              const roomPendingMsgs  = pending.filter(p => p.room === r.id)
              const roomPendingFiles = pendingFiles.filter(f => f.room === r.id)
              const hasPending = roomPendingMsgs.length > 0 || roomPendingFiles.length > 0
              return (
                <div key={r.id} style={{ ...S.section, border: hasPending ? '1.5px solid #f0d080' : '1px solid #e5e5e5', background: hasPending ? '#fffdf0' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-word' }}>
                        {r.name}
                        {hasPending && <span style={{ marginLeft: 8, fontSize: 11, background: '#e53e3e', color: '#fff', borderRadius: 10, padding: '2px 7px' }}>{roomPendingMsgs.length + roomPendingFiles.length} pending</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                        Client: {r.client?.display_name || '—'} · <span style={{ color: r.status === 'active' ? '#1a7a4a' : r.status === 'negotiating' ? '#BA7517' : '#888', fontWeight: 600 }}>{r.status}</span>
                      </div>
                    </div>
                    <button className="tjc-open-btn" style={{ ...S.openBtn, flexShrink: 0 }} onClick={() => navigate('/chat/' + r.id)}>Open →</button>
                  </div>
                  {roomPendingMsgs.map(p => (
                    <div key={p.id} style={S.pendingCard}>
                      <div style={S.pendingInfo}>
                        <span style={S.pendingFrom}>{p.sender?.display_name}</span>
                        <span style={S.pendingReason}>⚠️ {p.flag_reason}</span>
                      </div>
                      <div style={S.pendingBody}>"{p.body}"</div>
                      <div style={S.pendingBtns}>
                        <button className="tjc-approve-btn" style={S.approveBtn} onClick={() => approveMessage(p.id)}>✓ Approve</button>
                        <button className="tjc-reject-btn" style={S.rejectBtn} onClick={() => rejectMessage(p.id)}>✕ Reject</button>
                      </div>
                    </div>
                  ))}
                  {roomPendingFiles.map(f => (
                    <div key={f.id} style={{ ...S.pendingCard, background: '#e7f8f3', border: '1px solid #b6e6d8' }}>
                      <div style={S.pendingInfo}>
                        <span style={S.pendingFrom}>{f.sender?.display_name}</span>
                        <span style={{ fontSize: 12, color: '#00a884' }}>📄 {f.file_name}</span>
                      </div>
                      <div style={S.pendingBtns}>
                        <button className="tjc-approve-btn" style={S.approveBtn} onClick={() => approveFile(f.id)}>✓ Approve</button>
                        <button className="tjc-reject-btn" style={S.rejectBtn} onClick={() => rejectFile(f.id)}>✕ Reject</button>
                      </div>
                    </div>
                  ))}
                  {!hasPending && <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center' }}>✅ No pending items</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* ── PENDING TAB ── */}
        {activeTab === 'pending' && (
          <div className="content-area" style={S.content}>
            <div style={S.section}>
              <div style={S.sectionTitle}>Pending Messages ({pending.length})</div>
              {pending.length === 0 ? <div style={S.emptyState}>✅ No pending messages</div> : pending.map(p => (
                <div key={p.id} style={S.pendingCard}>
                  <div style={S.pendingInfo}>
                    <span style={S.pendingFrom}>From: {p.sender?.display_name}</span>
                    <span style={S.pendingReason}>⚠️ {p.flag_reason}</span>
                    <span style={S.pendingTime}>{new Date(p.timestamp).toLocaleString()}</span>
                  </div>
                  <div style={S.pendingBody}>"{p.body}"</div>
                  <div style={S.pendingBtns}>
                    <button className="tjc-approve-btn" style={S.approveBtn} onClick={() => approveMessage(p.id)}>✓ Approve</button>
                    <button className="tjc-reject-btn" style={S.rejectBtn} onClick={() => rejectMessage(p.id)}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={S.section}>
              <div style={S.sectionTitle}>Pending Files ({pendingFiles.length})</div>
              {pendingFiles.length === 0 ? <div style={S.emptyState}>✅ No pending files</div> : pendingFiles.map(f => (
                <div key={f.id} style={{ ...S.pendingCard, background: '#e7f8f3', border: '1px solid #b6e6d8' }}>
                  <div style={S.pendingInfo}>
                    <span style={S.pendingFrom}>From: {f.sender?.display_name}</span>
                    <span style={{ fontSize: 12, color: '#00a884' }}>📄 {f.file_name}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{f.file_size_display} · {f.room_name}</span>
                  </div>
                  <div style={S.pendingBtns}>
                    <button className="tjc-approve-btn" style={S.approveBtn} onClick={() => approveFile(f.id)}>✓ Approve</button>
                    <button className="tjc-reject-btn" style={S.rejectBtn} onClick={() => rejectFile(f.id)}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACCESS REQUESTS TAB ── */}
        {activeTab === 'access' && (
          <div className="content-area" style={S.content}>
            <div style={S.section}>
              <div style={S.sectionTitle}>Pending Access Requests ({accessRequests.length})</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                Confirm it's really them, then send the link via WhatsApp.
              </div>
              {accessRequests.length === 0 ? <div style={S.emptyState}>✅ No pending access requests</div> : accessRequests.map(r => (
                <div key={r.id} style={S.pendingCard}>
                  <div style={S.pendingInfo}>
                    <span style={S.pendingFrom}>{r.user_display}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: r.role === 'provider' ? '#1a7a4a' : '#00a884' }}>
                      {r.role === 'provider' ? '🎓 Provider' : '👤 Client'}
                    </span>
                    <span style={{ fontSize: 12, color: '#888' }}>{r.phone_number || 'No phone'}</span>
                    <span style={S.pendingTime}>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {!r.is_valid && <div style={{ fontSize: 12, color: '#e53e3e', marginBottom: 8 }}>⚠️ Link expired — ask them to request again.</div>}
                  {r.phone_number ? (
                    <a
                      href={`https://wa.me/${r.phone_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${r.user_display}, here's your link back into TutorJamesConnect: ${r.magic_link}`)}`}
                      target="_blank" rel="noreferrer"
                      style={{ ...S.approveBtn, display: 'inline-block', textDecoration: 'none', textAlign: 'center', opacity: r.is_valid ? 1 : 0.5, pointerEvents: r.is_valid ? 'auto' : 'none' }}
                    >
                      📲 Send via WhatsApp
                    </a>
                  ) : (
                    <div style={{ fontSize: 12, color: '#888' }}>No phone number on file.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ── REFERRALS TAB ── */}
        {activeTab === 'referrals' && (
          <div className="content-area" style={S.content}>
            <div style={S.section}>
              <div style={S.sectionTitle}>🎁 Referrals ({referrals.length})</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                Check the box once you have given the 5% discount to the referrer.
              </div>
              {referrals.length === 0 ? (
                <div style={S.emptyState}>No referrals yet</div>
              ) : (
                <div className="table-wrap">
                  <table style={S.table}>
                    <thead>
                      <tr>
                        {['Referrer', 'Referred Student', 'Date Joined', 'Discount Given'].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                          <td style={S.td}>
                            <span style={S.clientId}>{r.referrer}</span>
                            <div style={{ fontSize: 11, color: '#888' }}>{r.referrer_client_id}</div>
                          </td>
                          <td style={S.td}>
                            <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{r.referred}</span>
                            <div style={{ fontSize: 11, color: '#888' }}>{r.referred_client_id}</div>
                          </td>
                          <td style={S.td}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td style={S.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={r.discount_given}
                                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#00a884' }}
                                onChange={async () => {
                                  try {
                                    const res = await api.post(`/accounts/referrals/${r.id}/toggle/`)
                                    setReferrals(prev => prev.map(x =>
                                      x.id === r.id ? { ...x, discount_given: res.data.discount_given } : x
                                    ))
                                  } catch { setError('Failed to update discount status.') }
                                }}
                              />
                              {r.discount_given ? (
                                <span style={{ fontSize: 12, color: '#00a884', fontWeight: 600 }}>
                                  ✅ Given {r.discount_given_at ? `on ${new Date(r.discount_given_at).toLocaleDateString()}` : ''}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: '#888' }}>Not given yet</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

const S = {
  app: { display: 'flex', height: '100vh', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", background: '#f5f5f5', overflow: 'hidden', position: 'relative' },
  loadingScreen: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: '16px', color: '#888' },
  sidebar: { width: '240px', background: '#ffffff', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '2px 0 8px rgba(0,0,0,0.06)', overflowY: 'auto' },
  sidebarHeader: { padding: '20px 16px 12px', background: 'linear-gradient(135deg, #00a884, #054c40)' },
  logo: { color: '#ffffff', fontSize: '14px', fontWeight: '700' },
  logoSub: { color: '#a8e8dc', fontSize: '11px', marginTop: '3px' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#00a884', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', flexShrink: 0 },
  userName: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' },
  userRole: { fontSize: '11px', color: '#888' },
  navList: { flex: 1, padding: '8px', overflowY: 'auto' },
  navItem: { padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', marginBottom: '4px', transition: 'background 0.15s' },
  sidebarBottom: { padding: '12px', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '8px' },
  chatBtn: { padding: '10px', border: '1px solid #00a884', borderRadius: '8px', background: 'none', color: '#00a884', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  logoutBtn: { padding: '10px', border: '1px solid #ddd', borderRadius: '8px', background: 'none', color: '#888', fontSize: '13px', cursor: 'pointer' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  header: { padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  hamburger: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#555', padding: '4px 8px', borderRadius: '6px', lineHeight: 1 },
  headerTitle: { fontSize: '18px', fontWeight: '700', color: '#1a1a1a' },
  refreshBtn: { padding: '7px 12px', border: '1px solid #ddd', borderRadius: '8px', background: 'none', color: '#555', fontSize: '16px', cursor: 'pointer', flexShrink: 0 },
  errorBanner: { background: '#fae6e6', color: '#a0251a', padding: '10px 24px', fontSize: '13px' },
  content: { flex: 1, overflowY: 'auto', padding: '20px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' },
  statCard: { padding: '16px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  statValue: { fontSize: '28px', fontWeight: '700', marginBottom: '4px' },
  statLabel: { fontSize: '11px', color: '#888', fontWeight: '500' },
  section: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #e5e5e5' },
  sectionTitle: { fontSize: '15px', fontWeight: '600', color: '#1a1a1a', marginBottom: '14px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '500px' },
  th: { padding: '10px 12px', textAlign: 'left', background: '#f5f5f5', color: '#555', fontWeight: '600', fontSize: '12px', borderBottom: '1px solid #e5e5e5', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#1a1a1a' },
  badge: { padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' },
  clientId: { fontWeight: '600', color: '#00a884', fontSize: '13px' },
  providerName: { fontWeight: '600', color: '#1a7a4a', fontSize: '13px' },
  formRow: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  formInput: { flex: 1, minWidth: '140px', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none' },
  formSelect: { flex: 1, minWidth: '140px', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer' },
  createBtn: { padding: '9px 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #00a884, #054c40)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  roomMsg: { marginTop: '10px', fontSize: '13px', fontWeight: '500' },
  openBtn: { padding: '6px 14px', borderRadius: '6px', border: '1px solid #00a884', background: 'none', color: '#00a884', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  pendingCard: { background: '#fff8e1', border: '1px solid #f0d080', borderRadius: '10px', padding: '12px', marginBottom: '10px' },
  pendingInfo: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' },
  pendingFrom: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' },
  pendingReason: { fontSize: '12px', color: '#BA7517', fontWeight: '500' },
  pendingTime: { fontSize: '11px', color: '#aaa', marginLeft: 'auto' },
  pendingBody: { fontSize: '13px', color: '#1a1a1a', marginBottom: '10px', fontStyle: 'italic', wordBreak: 'break-word' },
  pendingBtns: { display: 'flex', gap: '8px' },
  approveBtn: { flex: 1, padding: '7px', border: '1px solid #1a7a4a', borderRadius: '8px', background: 'none', color: '#1a7a4a', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  rejectBtn: { flex: 1, padding: '7px', border: '1px solid #e53e3e', borderRadius: '8px', background: 'none', color: '#e53e3e', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  viewAllBtn: { padding: '8px 16px', border: '1px solid #00a884', borderRadius: '8px', background: 'none', color: '#00a884', fontSize: '13px', cursor: 'pointer', marginTop: '8px' },
  emptyState: { textAlign: 'center', fontSize: '14px', color: '#888', padding: '30px 0' },
}
