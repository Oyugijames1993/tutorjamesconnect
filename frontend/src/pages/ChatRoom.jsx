import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'
import ChatWebSocket from '../services/websocket'
import api from '../services/api'
import useNotificationSound, { SOUND_PROFILES } from '../hooks/useNotificationSound'

export default function ChatRoom() {
  const { user, logout } = useAuth()
  const { roomId }       = useParams()
  const isAdmin          = user?.role === 'admin'
  const isProvider       = user?.role === 'provider'

  const [messages, setMessages]               = useState([])
  const [rooms, setRooms]                     = useState([])
  const [activeRoom, setActiveRoom]           = useState(null)
  const [input, setInput]                     = useState('')
  const [showSidebar, setShowSidebar]         = useState(true)
  const [showAdminPanel, setShowAdminPanel]   = useState(isAdmin)
  const [filesEnabled, setFilesEnabled]               = useState(true)
  const [providerNeedsApproval, setProviderNeedsApproval] = useState(true)
  const [clientNeedsApproval, setClientNeedsApproval]     = useState(false)
  const [pendingMessages, setPendingMessages] = useState([])
  const [pendingFiles, setPendingFiles]       = useState([])
  const [connected, setConnected]             = useState(false)
  const [error, setError]                     = useState('')
  const [availableProviders, setAvailableProviders] = useState([])
  const [availableClients, setAvailableClients]     = useState([])
  const [selectedProvider, setSelectedProvider]     = useState('')
  const [selectedClient, setSelectedClient]         = useState('')
  const [inviteMsg, setInviteMsg]                   = useState('')
  const [inviteClientMsg, setInviteClientMsg]       = useState('')
  const [invitePhone, setInvitePhone]               = useState('')
  const [unreadCounts, setUnreadCounts]             = useState({})
  const [messageTarget, setMessageTarget]           = useState('everyone')

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('tjc_sound_enabled')
    return stored === null ? true : stored === 'true'
  })
  const [messageSoundProfile, setMessageSoundProfile] = useState(() => {
    return localStorage.getItem('tjc_message_sound_profile') || 'chime'
  })
  const [pendingSoundProfile, setPendingSoundProfile] = useState(() => {
    return localStorage.getItem('tjc_pending_sound_profile') || 'ping'
  })
  const { playSound } = useNotificationSound()

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      localStorage.setItem('tjc_sound_enabled', String(next))
      return next
    })
  }, [])

  const changeMessageSoundProfile = useCallback((profileId) => {
    setMessageSoundProfile(profileId)
    localStorage.setItem('tjc_message_sound_profile', profileId)
  }, [])

  const changePendingSoundProfile = useCallback((profileId) => {
    setPendingSoundProfile(profileId)
    localStorage.setItem('tjc_pending_sound_profile', profileId)
  }, [])

  const messagesEndRef = useRef(null)
  const wsRef          = useRef(null)
  const seenIdsRef     = useRef(new Set())
  const fileInputRef   = useRef(null)
  const roomWsRefs     = useRef({})

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    api.get('/chat/rooms/').then((res) => {
      setRooms(res.data)
      if (res.data.length > 0) {
        const room = roomId
          ? res.data.find(r => r.id === parseInt(roomId)) || res.data[0]
          : res.data[0]
        setActiveRoom(room)
      }
    }).catch(err => console.error('Failed to load rooms:', err))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    api.get('/accounts/users/').then(res => {
      setAvailableProviders(res.data.filter(u => u.role === 'provider'))
      setAvailableClients(res.data.filter(u => u.role === 'client'))
    }).catch(err => console.error('Failed to load users:', err))
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    setFilesEnabled(activeRoom.files_enabled ?? true)
    setProviderNeedsApproval(activeRoom.provider_files_need_approval ?? true)
    setClientNeedsApproval(activeRoom.client_files_need_approval ?? false)
  }, [activeRoom?.id])

  useEffect(() => {
    if (!activeRoom) return
    setUnreadCounts(prev => ({ ...prev, [activeRoom.id]: 0 }))
  }, [activeRoom?.id])

  useEffect(() => {
    if (rooms.length === 0 || !activeRoom) return
    const token = localStorage.getItem('access_token')
    rooms.forEach(room => {
      if (room.id === activeRoom.id) return
      if (roomWsRefs.current[room.id]) return
      let historyLoaded = false
      const ws = new ChatWebSocket(room.id, token, (data) => {
        if (data.type === 'connected') {
          setTimeout(() => { historyLoaded = true }, 500)
          return
        }
        if ((data.type === 'message' || data.type === 'file') && historyLoaded) {
          setUnreadCounts(prev => ({ ...prev, [room.id]: (prev[room.id] || 0) + 1 }))
          if (soundEnabled) playSound('message', messageSoundProfile)
        }
      })
      ws.connect()
      roomWsRefs.current[room.id] = ws
    })
    return () => {}
  }, [rooms, activeRoom?.id, soundEnabled, messageSoundProfile, playSound])

  useEffect(() => {
    if (!activeRoom) return
    if (roomWsRefs.current[activeRoom.id]) {
      roomWsRefs.current[activeRoom.id].disconnect()
      delete roomWsRefs.current[activeRoom.id]
    }
  }, [activeRoom?.id])

  useEffect(() => {
    return () => { Object.values(roomWsRefs.current).forEach(ws => ws.disconnect()) }
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    if (wsRef.current) wsRef.current.disconnect()
    setMessages([])
    setConnected(false)
    seenIdsRef.current = new Set()
    const token = localStorage.getItem('access_token')
    wsRef.current = new ChatWebSocket(activeRoom.id, token, (data) => {
      if (data.type === 'connected') { setConnected(true); return }
      if (data.type === 'message') {
        if (data.id && seenIdsRef.current.has(data.id)) return
        if (data.id) seenIdsRef.current.add(data.id)
        setMessages(prev => [...prev, data])
        if (soundEnabled && data.sender !== user?.display_name) playSound('message', messageSoundProfile)
        return
      }
      if (data.type === 'file') {
        if (seenIdsRef.current.has(data.id)) return
        seenIdsRef.current.add(data.id)
        setMessages(prev => [...prev, data])
        if (soundEnabled && data.sender !== user?.display_name) playSound('message', messageSoundProfile)
        return
      }
      if (data.type === 'system') {
        setMessages(prev => [...prev, { type: 'system', message: data.message, id: 'sys_' + Date.now() + '_' + Math.random() }])
        return
      }
      if (data.type === 'error') {
        setError(data.error)
        setTimeout(() => setError(''), 4000)
        return
      }
      if (data.type === 'pending') {
        setPendingMessages(prev => {
          if (prev.find(p => p.id === data.id)) return prev
          return [...prev, data]
        })
        if (soundEnabled && isAdmin) playSound('pending', pendingSoundProfile)
        return
      }
      if (data.type === 'file:pending') {
        setPendingFiles(prev => {
          if (prev.find(f => f.id === data.id)) return prev
          return [...prev, data]
        })
        if (soundEnabled && isAdmin) playSound('pending', pendingSoundProfile)
        if (isAdmin) {
          setMessages(prev => {
            const pendingId = 'file_pending_' + data.id
            if (prev.find(m => m.id === pendingId)) return prev
            return [...prev, {
              type: 'file', id: pendingId, file_id: data.id,
              file_name: data.file_name, file_size: data.file_size,
              file_url: null, sender: data.sender, status: 'pending',
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }]
          })
        }
        return
      }
    })
    wsRef.current.connect()
    return () => { if (wsRef.current) wsRef.current.disconnect() }
  }, [activeRoom, soundEnabled, isAdmin, playSound, messageSoundProfile, pendingSoundProfile, user?.display_name])

  const sendMessage = () => {
    if (!input.trim() || !connected) return
    const target = (isAdmin || isProvider) ? messageTarget : 'everyone'
    wsRef.current.send(input.trim(), target)
    setInput('')
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !connected) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.post('/chat/rooms/' + activeRoom.id + '/upload-file/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    } catch {
      setError('Failed to upload file.')
      setTimeout(() => setError(''), 4000)
    }
    e.target.value = ''
  }

  const updateSetting = async (key, value) => {
    try {
      await api.patch('/chat/rooms/' + activeRoom.id + '/settings/', { [key]: value })
    } catch {
      if (key === 'files_enabled') setFilesEnabled(!value)
      if (key === 'provider_files_need_approval') setProviderNeedsApproval(!value)
      if (key === 'client_files_need_approval') setClientNeedsApproval(!value)
      setError('Failed to update setting.')
      setTimeout(() => setError(''), 3000)
    }
  }

  const inviteProvider = async () => {
    if (!selectedProvider) { setError('Please select a provider first.'); setTimeout(() => setError(''), 3000); return }
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-provider/', { provider_id: selectedProvider })
      setActiveRoom(res.data); setSelectedProvider('')
      setInviteMsg('Provider invited successfully!'); setTimeout(() => setInviteMsg(''), 3000)
      api.get('/chat/rooms/').then(r => setRooms(r.data))
    } catch { setError('Failed to invite provider.'); setTimeout(() => setError(''), 3000) }
  }

  const inviteClientByDropdown = async () => {
    if (!selectedClient) { setError('Please select a client first.'); setTimeout(() => setError(''), 3000); return }
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-client/', { client_id: selectedClient })
      setActiveRoom(res.data); setSelectedClient('')
      setInviteClientMsg('✅ Client added successfully!'); setTimeout(() => setInviteClientMsg(''), 3000)
      api.get('/chat/rooms/').then(r => setRooms(r.data))
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add client.'
      setError(msg); setTimeout(() => setError(''), 3000)
    }
  }

  const inviteClientByPhone = async () => {
    if (!invitePhone.trim()) return
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-client/', { phone_number: invitePhone.trim() })
      setActiveRoom(res.data); setInvitePhone('')
      setInviteClientMsg('✅ Client invited successfully!'); setTimeout(() => setInviteClientMsg(''), 3000)
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to invite client.'
      setInviteClientMsg('🚫 ' + msg); setTimeout(() => setInviteClientMsg(''), 4000)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const statusColor = (s) => {
    if (s === 'active') return '#10b981'
    if (s === 'negotiating') return '#f59e0b'
    return '#6b7280'
  }

  const statusLabel = (s) => {
    if (s === 'active') return 'Active'
    if (s === 'negotiating') return 'Negotiating'
    return 'Closed'
  }

  const getClientDisplay = (room) => room?.client?.display_name || room?.client || 'Client'
  const isImageFile = (filename) => /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)

  const targetConfig = {
    client:   { label: 'Client only',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '👤' },
    provider: { label: 'Provider only', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '🔧' },
    admin:    { label: 'Admin only',    color: '#6366f1', bg: 'rgba(99,102,241,0.1)',   icon: '🔑' },
  }

  const totalPending = pendingMessages.length + pendingFiles.length

  const roleColor = (role) => {
    if (role === 'admin')    return { bg: '#6366f1', light: 'rgba(99,102,241,0.12)' }
    if (role === 'provider') return { bg: '#f59e0b', light: 'rgba(245,158,11,0.12)' }
    return { bg: '#10b981', light: 'rgba(16,185,129,0.12)' }
  }

  if (!activeRoom) {
    return (
      <div style={S.loadingScreen}>
        <div style={S.loadingSpinner} />
        <div style={S.loadingText}>Loading your workspace…</div>
      </div>
    )
  }

  return (
    <div style={S.app}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        textarea:focus, input:focus, select:focus { outline: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .msg-bubble { animation: fadeIn 0.18s ease; }
        .room-item:hover { background: rgba(99,102,241,0.06) !important; }
        .send-btn:hover:not(:disabled) { background: #4f46e5 !important; transform: scale(1.04); }
        .attach-btn:hover { background: #f1f5f9 !important; }
        .target-btn:hover { filter: brightness(0.95); }
        .approve-btn:hover { background: #d1fae5 !important; }
        .reject-btn:hover  { background: #fee2e2 !important; }
        .logout-btn:hover  { background: rgba(239,68,68,0.07) !important; color: #ef4444 !important; border-color: rgba(239,68,68,0.3) !important; }
      `}</style>

      {/* ── Sidebar ── */}
      {showSidebar && (
        <aside style={S.sidebar}>
          <div style={S.sidebarTop}>
            <div style={S.brandMark}>
              <div style={S.brandIcon}>TJ</div>
              <div>
                <div style={S.brandName}>TutorJamesConnect</div>
                <div style={S.brandTagline}>Trusted globally for academic excellence</div>
              </div>
            </div>
            <div style={S.userCard}>
              <div style={{ ...S.userAvatar, background: roleColor(user?.role).bg }}>
                {user?.display_name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.userName}>{user?.display_name || 'User'}</div>
                <div style={{ ...S.userRoleBadge, background: roleColor(user?.role).light, color: roleColor(user?.role).bg }}>
                  {user?.role || 'client'}
                </div>
              </div>
            </div>
          </div>

          <div style={S.sectionLabel}>Rooms</div>
          <div style={S.roomList}>
            {rooms.length === 0 ? (
              <div style={S.emptyRooms}>No rooms yet</div>
            ) : rooms.map((room) => {
              const unread = unreadCounts[room.id] || 0
              const isActive = activeRoom?.id === room.id
              return (
                <div key={room.id} className="room-item"
                  style={{ ...S.roomItem, ...(isActive ? S.roomItemActive : {}) }}
                  onClick={() => { setActiveRoom(room); setUnreadCounts(prev => ({ ...prev, [room.id]: 0 })) }}>
                  <div style={S.roomIconWrap}>
                    <div style={{ ...S.roomIcon, background: isActive ? '#6366f1' : '#e2e8f0', color: isActive ? '#fff' : '#94a3b8' }}>
                      {room.name?.[0]?.toUpperCase() || 'R'}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...S.roomName, color: isActive ? '#1e293b' : '#334155' }}>{room.name}</div>
                    <div style={S.roomMeta}>
                      <span style={{ ...S.statusDot, background: statusColor(room.status) }} />
                      {statusLabel(room.status)}
                    </div>
                  </div>
                  {unread > 0 && !isActive && (
                    <span style={S.unreadBadge}>{unread > 99 ? '99+' : unread}</span>
                  )}
                </div>
              )
            })}
          </div>
          <button className="logout-btn" style={S.logoutBtn} onClick={logout}>
            <span>↩</span> Sign out
          </button>
        </aside>
      )}

      {/* ── Main ── */}
      <div style={S.main}>
        <header style={S.header}>
          <div style={S.headerLeft}>
            <button style={S.iconBtn} onClick={() => setShowSidebar(!showSidebar)} title="Toggle sidebar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {isAdmin && (
              <button style={{ ...S.iconBtn, position: 'relative' }} onClick={() => setShowAdminPanel(!showAdminPanel)} title="Admin controls">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 0-14.14 0M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9 9 9 0 0 1 9 9z" opacity=".3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                {totalPending > 0 && <span style={S.headerBadgeDot}>{totalPending}</span>}
              </button>
            )}
            <div style={S.headerRoomInfo}>
              <div style={S.headerRoomName}>{activeRoom.name}</div>
              <div style={S.headerRoomMeta}>
                <span style={{ ...S.statusDot, background: statusColor(activeRoom.status) }} />
                {statusLabel(activeRoom.status)}
                <span style={S.metaDivider}>·</span>
                {getClientDisplay(activeRoom)}
              </div>
            </div>
          </div>
          <div style={S.headerRight}>
            <button style={S.iconBtn} onClick={toggleSound} title={soundEnabled ? 'Mute' : 'Unmute'}>
              {soundEnabled
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              }
            </button>
            <div style={{ ...S.rolePill, background: roleColor(user?.role).light, color: roleColor(user?.role).bg }}>
              {isAdmin ? '🔑 Admin' : isProvider ? '🔧 Provider' : `Room #${activeRoom.id}`}
            </div>
          </div>
        </header>

        {error && (
          <div style={S.errorBanner}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        {/* Messages */}
        <div style={S.messages}>
          {messages.length === 0 && connected && (
            <div style={S.emptyChat}>
              <div style={S.emptyChatIcon}>💬</div>
              <div style={S.emptyChatText}>No messages yet</div>
              <div style={S.emptyChatSub}>Be the first to say something</div>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id || idx} style={S.systemMsg}>
                  <span style={S.systemMsgLine} />
                  <span style={S.systemMsgText}>{msg.message}</span>
                  <span style={S.systemMsgLine} />
                </div>
              )
            }

            if (msg.type === 'file') {
              const isImg     = isImageFile(msg.file_name)
              const isPending = msg.status === 'pending'
              return (
                <div key={msg.id || idx} className="msg-bubble" style={{ ...S.msgRow, justifyContent: 'flex-start' }}>
                  <div style={{ ...S.avatar, background: roleColor('provider').bg }}>
                    {msg.sender?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ maxWidth: '62%' }}>
                    <div style={S.msgSender}>{msg.sender}</div>
                    <div style={{ ...S.fileBubble, ...(isPending ? S.fileBubblePending : {}) }}>
                      {isPending && (
                        <div style={S.pendingBadgeInline}>
                          <span style={{ animation: 'pulse 1.5s infinite' }}>⏳</span> Awaiting approval
                        </div>
                      )}
                      <div style={S.fileHeader}>
                        <div style={S.fileIconWrap}>{isImg ? '🖼️' : '📄'}</div>
                        <div>
                          <div style={S.fileName}>{msg.file_name}</div>
                          <div style={S.fileMeta}>{msg.file_size}</div>
                        </div>
                      </div>
                      {isImg && msg.file_url && (
                        <img src={msg.file_url} alt={msg.file_name}
                          style={{ width: '100%', borderRadius: 8, marginTop: 10, maxHeight: 220, objectFit: 'cover' }} />
                      )}
                      {msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" style={S.downloadLink}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Download
                        </a>
                      )}
                      {isAdmin && isPending && (
                        <div style={S.inlineBtnRow}>
                          <button className="approve-btn" style={S.inlineApprove}
                            onClick={async () => {
                              try {
                                await api.post('/chat/admin/files/' + msg.file_id + '/approve/')
                                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'approved' } : m))
                                setPendingFiles(prev => prev.filter(f => f.id !== msg.file_id))
                              } catch { setError('Failed to approve file.') }
                            }}>✓ Approve</button>
                          <button className="reject-btn" style={S.inlineReject}
                            onClick={async () => {
                              try {
                                await api.post('/chat/admin/files/' + msg.file_id + '/reject/')
                                setMessages(prev => prev.filter(m => m.id !== msg.id))
                                setPendingFiles(prev => prev.filter(f => f.id !== msg.file_id))
                              } catch { setError('Failed to reject file.') }
                            }}>✕ Reject</button>
                        </div>
                      )}
                    </div>
                    <div style={{ ...S.msgTime, textAlign: 'left' }}>{msg.time}</div>
                  </div>
                </div>
              )
            }

            const isMe       = msg.sender === user?.display_name
            const isAdminMsg = msg.role === 'admin'
            const isFlagged  = msg.status === 'pending'
            const tc         = (isAdmin || isProvider) && msg.target && msg.target !== 'everyone' ? targetConfig[msg.target] : null
            const senderRole = msg.role || 'client'

            return (
              <div key={msg.id || idx} className="msg-bubble"
                style={{ ...S.msgRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                {!isMe && (
                  <div style={{ ...S.avatar, background: roleColor(senderRole).bg }}>
                    {msg.sender?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div style={{ maxWidth: '62%' }}>
                  {!isMe && <div style={S.msgSender}>{msg.sender}</div>}
                  <div style={{
                    ...S.bubble,
                    ...(isMe ? S.bubbleMe : isAdminMsg ? S.bubbleAdmin : S.bubbleOther),
                    ...(isFlagged ? S.bubbleFlagged : {}),
                  }}>
                    {isFlagged && (
                      <div style={S.flaggedLabel}>
                        <span style={{ animation: 'pulse 1.5s infinite' }}>⚠️</span> Pending approval
                      </div>
                    )}
                    <span style={{ color: isMe && !isFlagged ? '#fff' : '#1e293b' }}>{msg.body}</span>
                    {isAdmin && isFlagged && (
                      <div style={S.inlineBtnRow}>
                        <button className="approve-btn" style={S.inlineApprove}
                          onClick={async () => {
                            try {
                              await api.post('/chat/admin/messages/' + msg.id + '/approve/')
                              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'approved' } : m))
                              setPendingMessages(prev => prev.filter(p => p.id !== msg.id))
                            } catch { setError('Failed to approve message.') }
                          }}>✓ Approve</button>
                        <button className="reject-btn" style={S.inlineReject}
                          onClick={async () => {
                            try {
                              await api.post('/chat/admin/messages/' + msg.id + '/reject/')
                              setMessages(prev => prev.filter(m => m.id !== msg.id))
                              setPendingMessages(prev => prev.filter(p => p.id !== msg.id))
                            } catch { setError('Failed to reject message.') }
                          }}>✕ Reject</button>
                      </div>
                    )}
                  </div>
                  {tc && (
                    <div style={{ ...S.targetTag, color: tc.color, background: tc.bg, textAlign: isMe ? 'right' : 'left' }}>
                      {tc.icon} {tc.label}
                    </div>
                  )}
                  <div style={{ ...S.msgTime, textAlign: isMe ? 'right' : 'left' }}>
                    {msg.time}{isMe && !isFlagged && <span style={{ marginLeft: 4, color: '#6366f1' }}>✓✓</span>}
                  </div>
                </div>
                {isMe && (
                  <div style={{ ...S.avatar, background: roleColor(user?.role).bg }}>
                    {user?.display_name?.[0]?.toUpperCase() || 'Y'}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Client invite bar */}
        {activeRoom.status !== 'closed' && user?.role === 'client' && (
          <div style={S.inviteBar}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            <input style={S.inviteInput} placeholder="Invite friend — e.g. +254712345678"
              value={invitePhone} onChange={e => setInvitePhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') inviteClientByPhone() }} />
            <button style={S.inviteBtn} onClick={inviteClientByPhone}>Invite</button>
          </div>
        )}
        {inviteClientMsg && user?.role === 'client' && (
          <div style={{ ...S.toastBar, color: inviteClientMsg.startsWith('✅') ? '#059669' : '#dc2626', background: inviteClientMsg.startsWith('✅') ? '#d1fae5' : '#fee2e2' }}>
            {inviteClientMsg}
          </div>
        )}

        {/* Input area */}
        <div style={S.inputArea}>
          {(isAdmin || isProvider) && activeRoom.status !== 'closed' && (
            <div style={S.targetRow}>
              <span style={S.targetRowLabel}>Send to</span>
              {(isAdmin ? [
                { value: 'everyone', label: '🌐 Everyone' },
                { value: 'client',   label: '👤 Client' },
                { value: 'provider', label: '🔧 Provider' },
              ] : [
                { value: 'everyone', label: '🌐 Everyone' },
                { value: 'admin',    label: '🔑 Admin' },
              ]).map(opt => (
                <button key={opt.value} className="target-btn"
                  style={{ ...S.targetBtn, ...(messageTarget === opt.value ? S.targetBtnActive : {}) }}
                  onClick={() => setMessageTarget(opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div style={S.inputRow}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} disabled={!filesEnabled || !connected} />
            <button className="attach-btn" style={{ ...S.attachBtn, opacity: filesEnabled && connected ? 1 : 0.35 }}
              title={filesEnabled ? 'Attach file' : 'File sharing disabled'}
              onClick={() => filesEnabled && connected && fileInputRef.current?.click()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <textarea style={{
                ...S.input,
                borderColor: messageTarget === 'client' ? '#10b981' : messageTarget === 'provider' ? '#f59e0b' : messageTarget === 'admin' ? '#6366f1' : '#e2e8f0',
              }}
              placeholder={
                !connected ? 'Connecting…'
                : messageTarget === 'client'   ? 'Message to client only…'
                : messageTarget === 'provider' ? 'Message to provider only…'
                : messageTarget === 'admin'    ? 'Private message to admin…'
                : 'Type a message…'
              }
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} rows={1} disabled={!connected} />
            <button className="send-btn" style={{ ...S.sendBtn, ...(!(input.trim() && connected) ? S.sendBtnDisabled : {}) }}
              onClick={sendMessage} disabled={!input.trim() || !connected}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div style={S.inputHint}>
            <span style={{ ...S.connDot, background: connected ? '#10b981' : '#f59e0b', animation: connected ? 'none' : 'pulse 1.2s infinite' }} />
            {connected ? 'Connected · Enter to send' : 'Connecting…'}
          </div>
        </div>
      </div>

      {/* ── Admin Panel ── */}
      {isAdmin && showAdminPanel && (
        <aside style={S.adminPanel}>
          <div style={S.adminHeader}>
            <div style={S.adminHeaderLeft}>
              <div style={S.adminHeaderIcon}>⚙️</div>
              <div>
                <div style={S.adminHeaderTitle}>Controls</div>
                {totalPending > 0 && <div style={S.adminHeaderSub}>{totalPending} pending</div>}
              </div>
            </div>
            <button style={S.closeBtn} onClick={() => setShowAdminPanel(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>

            {/* Members */}
            <div style={S.panelSection}>
              <div style={S.panelSectionTitle}>Room Members</div>
              {[{ name: 'Admin (you)', role: 'admin' }, { name: getClientDisplay(activeRoom), role: 'client' }].map((m, i) => (
                <div key={i} style={S.memberRow}>
                  <div style={{ ...S.memberAvatar, background: roleColor(m.role).bg }}>{m.name[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={S.memberName}>{m.name}</div>
                    <div style={{ ...S.memberRolePill, background: roleColor(m.role).light, color: roleColor(m.role).bg }}>{m.role}</div>
                  </div>
                </div>
              ))}
              {(activeRoom.extra_clients || []).map(c => (
                <div key={c.id} style={S.memberRow}>
                  <div style={{ ...S.memberAvatar, background: roleColor('client').bg }}>{c.display_name?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={S.memberName}>{c.display_name}</div>
                    <div style={{ ...S.memberRolePill, background: roleColor('client').light, color: roleColor('client').bg }}>client</div>
                  </div>
                  <button style={S.removeBtn} onClick={async () => {
                    try {
                      const res = await api.post('/chat/rooms/' + activeRoom.id + '/remove-client/', { client_id: c.id })
                      setActiveRoom(res.data); api.get('/chat/rooms/').then(r => setRooms(r.data))
                    } catch { setError('Failed to remove client.'); setTimeout(() => setError(''), 3000) }
                  }}>✕</button>
                </div>
              ))}
              {(activeRoom.providers || []).map(p => (
                <div key={p.id} style={S.memberRow}>
                  <div style={{ ...S.memberAvatar, background: roleColor('provider').bg }}>{p.display_name?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={S.memberName}>{p.display_name}</div>
                    <div style={{ ...S.memberRolePill, background: roleColor('provider').light, color: roleColor('provider').bg }}>provider</div>
                  </div>
                  <button style={S.removeBtn} onClick={async () => {
                    try {
                      const res = await api.post('/chat/rooms/' + activeRoom.id + '/remove-provider/', { provider_id: p.id })
                      setActiveRoom(res.data); api.get('/chat/rooms/').then(r => setRooms(r.data))
                    } catch { setError('Failed to remove provider.'); setTimeout(() => setError(''), 3000) }
                  }}>✕</button>
                </div>
              ))}
            </div>

            {/* Invite */}
            <div style={S.panelSection}>
              <div style={S.panelSectionTitle}>Invite</div>
              <div style={S.inputGroup}>
                <label style={S.inputLabel}>Provider</label>
                <select style={S.select} value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
                  <option value="">Select provider…</option>
                  {availableProviders.filter(p => !(activeRoom.providers || []).find(ap => ap.id === p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
                <button style={S.primaryBtn} onClick={inviteProvider}>+ Invite Provider</button>
                {inviteMsg && <div style={S.successMsg}>{inviteMsg}</div>}
              </div>
              <div style={{ ...S.inputGroup, marginTop: 12 }}>
                <label style={S.inputLabel}>Client</label>
                <select style={S.select} value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                  <option value="">Select client…</option>
                  {availableClients.filter(c => c.id !== activeRoom.client?.id && !(activeRoom.extra_clients || []).find(ec => ec.id === c.id))
                    .map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
                <button style={S.primaryBtn} onClick={inviteClientByDropdown}>+ Add Client</button>
                {inviteClientMsg && <div style={S.successMsg}>{inviteClientMsg}</div>}
              </div>
            </div>

            {/* File Settings */}
            <div style={S.panelSection}>
              <div style={S.panelSectionTitle}>File Settings</div>
              {[
                { label: 'File sharing', sub: 'Allow files in this room', val: filesEnabled, key: 'files_enabled', set: setFilesEnabled },
                { label: 'Provider → approval', sub: 'Admin reviews provider files', val: providerNeedsApproval, key: 'provider_files_need_approval', set: setProviderNeedsApproval },
                { label: 'Client → approval', sub: 'Admin reviews client files', val: clientNeedsApproval, key: 'client_files_need_approval', set: setClientNeedsApproval },
              ].map(item => (
                <div key={item.key} style={S.toggleRow}>
                  <div style={{ flex: 1 }}>
                    <div style={S.toggleLabel}>{item.label}</div>
                    <div style={S.toggleSub}>{item.sub}</div>
                  </div>
                  <div style={{ ...S.toggle, background: item.val ? '#6366f1' : '#e2e8f0' }}
                    onClick={() => { const v = !item.val; item.set(v); updateSetting(item.key, v) }}>
                    <div style={{ ...S.toggleKnob, transform: item.val ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                {activeRoom.status !== 'closed' ? (
                  <button style={S.dangerBtn} onClick={async () => {
                    if (!window.confirm('Close this room?')) return
                    try {
                      const res = await api.post('/chat/rooms/' + activeRoom.id + '/close/')
                      setActiveRoom(res.data); api.get('/chat/rooms/').then(r => setRooms(r.data))
                    } catch { setError('Failed to close room.') }
                  }}>🔒 Close Room</button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={S.closedBadge}>🔒 Room closed</div>
                    <button style={S.ghostDangerBtn} onClick={async () => {
                      if (!window.confirm('Permanently delete this room?')) return
                      try {
                        await api.delete('/chat/rooms/' + activeRoom.id + '/delete/')
                        const res = await api.get('/chat/rooms/')
                        setRooms(res.data)
                        if (res.data.length > 0) setActiveRoom(res.data[0])
                      } catch { setError('Failed to delete room.') }
                    }}>🗑 Delete Room</button>
                  </div>
                )}
              </div>
            </div>

            {/* Sound */}
            <div style={S.panelSection}>
              <div style={S.panelSectionTitle}>Notifications</div>
              <div style={S.toggleRow}>
                <div style={{ flex: 1 }}>
                  <div style={S.toggleLabel}>Sound alerts</div>
                  <div style={S.toggleSub}>Play sound on messages</div>
                </div>
                <div style={{ ...S.toggle, background: soundEnabled ? '#6366f1' : '#e2e8f0' }} onClick={toggleSound}>
                  <div style={{ ...S.toggleKnob, transform: soundEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
                </div>
              </div>
              {soundEnabled && (
                <div style={{ marginTop: 12 }}>
                  {[
                    { title: '💬 Message sound', current: messageSoundProfile, onChange: changeMessageSoundProfile, accent: '#6366f1', type: 'message' },
                    { title: '⏳ Pending sound',  current: pendingSoundProfile,  onChange: changePendingSoundProfile,  accent: '#f59e0b', type: 'pending' },
                  ].map(picker => (
                    <div key={picker.title} style={{ marginBottom: 14 }}>
                      <div style={S.soundPickerTitle}>{picker.title}</div>
                      {SOUND_PROFILES.map(profile => (
                        <div key={profile.id}
                          style={{ ...S.soundOption, ...(picker.current === profile.id ? { background: picker.accent + '12', border: '1.5px solid ' + picker.accent } : {}) }}
                          onClick={() => picker.onChange(profile.id)}>
                          <div>
                            <div style={{ ...S.soundLabel, color: picker.current === profile.id ? picker.accent : '#334155' }}>{profile.label}</div>
                            <div style={S.soundDesc}>{profile.description}</div>
                          </div>
                          <button style={{ ...S.previewBtn, borderColor: picker.accent, color: picker.accent }}
                            onClick={e => { e.stopPropagation(); playSound(picker.type, profile.id) }}>▶</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Messages */}
            <div style={S.panelSection}>
              <div style={S.panelSectionTitle}>
                Pending Messages
                {pendingMessages.length > 0 && <span style={S.pendingCountBadge}>{pendingMessages.length}</span>}
              </div>
              {pendingMessages.length === 0 ? (
                <div style={S.emptyPanel}>All clear ✓</div>
              ) : pendingMessages.map(p => (
                <div key={p.id} style={S.pendingCard}>
                  <div style={S.pendingCardHeader}>
                    <div style={S.pendingCardFrom}>{p.sender}</div>
                    <div style={S.pendingCardReason}>⚠️ {p.reason}</div>
                  </div>
                  <div style={S.pendingCardBody}>"{p.body || p.text}"</div>
                  <div style={S.pendingCardBtns}>
                    <button className="approve-btn" style={S.approveBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/messages/' + p.id + '/approve/')
                        setPendingMessages(prev => prev.filter(x => x.id !== p.id))
                        setMessages(prev => prev.map(m => m.id === p.id ? { ...m, status: 'approved' } : m))
                      } catch { setError('Failed to approve.') }
                    }}>✓ Approve</button>
                    <button className="reject-btn" style={S.rejectBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/messages/' + p.id + '/reject/')
                        setPendingMessages(prev => prev.filter(x => x.id !== p.id))
                        setMessages(prev => prev.filter(m => m.id !== p.id))
                      } catch { setError('Failed to reject.') }
                    }}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pending Files */}
            <div style={{ ...S.panelSection, borderBottom: 'none' }}>
              <div style={S.panelSectionTitle}>
                Pending Files
                {pendingFiles.length > 0 && <span style={S.pendingCountBadge}>{pendingFiles.length}</span>}
              </div>
              {pendingFiles.length === 0 ? (
                <div style={S.emptyPanel}>All clear ✓</div>
              ) : pendingFiles.map(f => (
                <div key={f.id} style={S.pendingCard}>
                  <div style={S.pendingCardHeader}>
                    <div style={S.pendingCardFrom}>{f.sender}</div>
                    <div style={S.pendingCardReason}>📦 {f.file_size}</div>
                  </div>
                  <div style={S.pendingCardBody}>{isImageFile(f.file_name) ? '🖼️' : '📄'} {f.file_name}</div>
                  <div style={S.pendingCardBtns}>
                    <button className="approve-btn" style={S.approveBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/files/' + f.id + '/approve/')
                        setPendingFiles(prev => prev.filter(x => x.id !== f.id))
                        setMessages(prev => prev.map(m => m.id === 'file_pending_' + f.id ? { ...m, status: 'approved' } : m))
                      } catch { setError('Failed to approve.') }
                    }}>✓ Approve</button>
                    <button className="reject-btn" style={S.rejectBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/files/' + f.id + '/reject/')
                        setPendingFiles(prev => prev.filter(x => x.id !== f.id))
                        setMessages(prev => prev.filter(m => m.id !== 'file_pending_' + f.id))
                      } catch { setError('Failed to reject.') }
                    }}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </aside>
      )}
    </div>
  )
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  app:          { display: 'flex', height: '100vh', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", background: '#f8fafc', overflow: 'hidden' },
  loadingScreen:{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 14 },
  loadingSpinner: { width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText:  { fontSize: 14, color: '#94a3b8', fontWeight: 500 },

  sidebar:      { width: 260, background: '#fff', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sidebarTop:   { padding: '0 0 8px' },
  brandMark:    { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px', borderBottom: '1px solid #f1f5f9' },
  brandIcon:    { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, letterSpacing: '-0.5px' },
  brandName:    { fontSize: 13, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.2px' },
  brandTagline: { fontSize: 10, color: '#94a3b8', marginTop: 1, lineHeight: 1.4 },
  userCard:     { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', margin: '8px', borderRadius: 10, background: '#f8fafc' },
  userAvatar:   { width: 34, height: 34, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userName:     { fontSize: 13, fontWeight: 600, color: '#1e293b' },
  userRoleBadge:{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, marginTop: 2, textTransform: 'capitalize' },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 16px 6px' },
  roomList:     { flex: 1, overflowY: 'auto', padding: '0 8px' },
  emptyRooms:   { fontSize: 12, color: '#cbd5e1', textAlign: 'center', padding: '24px 0' },
  roomItem:     { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 2, transition: 'background 0.12s' },
  roomItemActive: { background: '#f0f0ff' },
  roomIconWrap: { flexShrink: 0 },
  roomIcon:     { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all 0.12s' },
  roomName:     { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  roomMeta:     { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8', marginTop: 2 },
  statusDot:    { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  unreadBadge:  { background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, flexShrink: 0 },
  logoutBtn:    { margin: '8px 12px 12px', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', transition: 'all 0.15s' },

  main:         { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  header:       { padding: '12px 20px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerLeft:   { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 8 },
  iconBtn:      { background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', position: 'relative' },
  headerBadgeDot: { position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 8, minWidth: 14, textAlign: 'center' },
  headerRoomInfo: { marginLeft: 2 },
  headerRoomName: { fontSize: 15, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.2px' },
  headerRoomMeta: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8', marginTop: 1 },
  metaDivider:  { color: '#cbd5e1' },
  rolePill:     { fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20 },

  errorBanner:  { background: '#fef2f2', color: '#dc2626', padding: '8px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #fecaca' },

  messages:     { flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14, background: '#f8fafc' },
  emptyChat:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8 },
  emptyChatIcon:{ fontSize: 40, marginBottom: 4 },
  emptyChatText:{ fontSize: 15, fontWeight: 600, color: '#334155' },
  emptyChatSub: { fontSize: 13, color: '#94a3b8' },
  systemMsg:    { display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'center', maxWidth: '80%' },
  systemMsgLine:{ flex: 1, height: 1, background: '#e2e8f0', display: 'block', minWidth: 30 },
  systemMsgText:{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', padding: '0 2px' },
  msgRow:       { display: 'flex', alignItems: 'flex-end', gap: 8 },
  avatar:       { width: 30, height: 30, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  msgSender:    { fontSize: 11, color: '#94a3b8', marginBottom: 4, paddingLeft: 4, fontWeight: 500 },
  bubble:       { padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  bubbleMe:     { background: '#6366f1', borderBottomRightRadius: 4 },
  bubbleAdmin:  { background: '#f0f0ff', borderBottomLeftRadius: 4 },
  bubbleOther:  { background: '#fff', borderBottomLeftRadius: 4, border: '1px solid #f1f5f9' },
  bubbleFlagged:{ background: '#fffbeb', border: '1.5px solid #fde68a', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  flaggedLabel: { fontSize: 11, color: '#d97706', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 },
  targetTag:    { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginTop: 4 },
  msgTime:      { fontSize: 10, color: '#cbd5e1', marginTop: 4, paddingLeft: 4, paddingRight: 4 },

  fileBubble:       { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  fileBubblePending:{ border: '1.5px solid #fde68a', background: '#fffbeb' },
  pendingBadgeInline: { fontSize: 11, color: '#d97706', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 },
  fileHeader:   { display: 'flex', alignItems: 'center', gap: 10 },
  fileIconWrap: { fontSize: 24, flexShrink: 0 },
  fileName:     { fontSize: 13, fontWeight: 600, color: '#1e293b', wordBreak: 'break-all' },
  fileMeta:     { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  downloadLink: { display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12, color: '#6366f1', fontWeight: 600, textDecoration: 'none' },
  inlineBtnRow: { display: 'flex', gap: 6, marginTop: 10 },
  inlineApprove:{ flex: 1, padding: '5px 8px', border: '1px solid #10b981', borderRadius: 6, background: '#f0fdf4', color: '#059669', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s' },
  inlineReject: { flex: 1, padding: '5px 8px', border: '1px solid #ef4444', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s' },

  inviteBar:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: '#fff', borderTop: '1px solid #f1f5f9' },
  inviteInput:  { flex: 1, padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#1e293b' },
  inviteBtn:    { padding: '7px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  toastBar:     { textAlign: 'center', fontSize: 12, padding: '5px 20px', fontWeight: 500 },
  inputArea:    { padding: '12px 16px 14px', background: '#fff', borderTop: '1px solid #f1f5f9' },
  targetRow:    { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  targetRowLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, marginRight: 2 },
  targetBtn:    { fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1.5px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', color: '#64748b', fontFamily: 'inherit', transition: 'all 0.15s' },
  targetBtnActive: { background: '#6366f1', color: '#fff', borderColor: '#6366f1', fontWeight: 600 },
  inputRow:     { display: 'flex', gap: 8, alignItems: 'flex-end' },
  attachBtn:    { background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' },
  input:        { flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, color: '#1e293b', background: '#fff', transition: 'border-color 0.2s' },
  sendBtn:      { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', fontFamily: 'inherit' },
  sendBtnDisabled: { background: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'not-allowed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
  inputHint:    { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1', marginTop: 6, paddingLeft: 2 },
  connDot:      { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },

  adminPanel:   { width: 268, background: '#fff', borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  adminHeader:  { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafe' },
  adminHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  adminHeaderIcon: { fontSize: 20 },
  adminHeaderTitle: { fontSize: 14, fontWeight: 700, color: '#1e293b' },
  adminHeaderSub: { fontSize: 11, color: '#ef4444', fontWeight: 600 },
  closeBtn:     { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4, borderRadius: 6 },
  panelSection: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9' },
  panelSectionTitle: { fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 },
  pendingCountBadge: { background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10 },

  memberRow:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  memberAvatar: { width: 28, height: 28, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  memberName:   { fontSize: 12, fontWeight: 600, color: '#1e293b' },
  memberRolePill: { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, marginTop: 2, textTransform: 'capitalize' },
  removeBtn:    { background: 'none', border: '1px solid #fecaca', borderRadius: 6, color: '#ef4444', fontSize: 11, cursor: 'pointer', padding: '2px 7px', flexShrink: 0 },

  inputGroup:   { display: 'flex', flexDirection: 'column', gap: 4 },
  inputLabel:   { fontSize: 11, fontWeight: 600, color: '#64748b' },
  select:       { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, outline: 'none', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#1e293b' },
  primaryBtn:   { width: '100%', padding: '8px', border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 },
  successMsg:   { fontSize: 11, color: '#059669', fontWeight: 600, textAlign: 'center', marginTop: 4 },

  toggleRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  toggleLabel:  { fontSize: 12, fontWeight: 500, color: '#334155' },
  toggleSub:    { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  toggle:       { width: 38, height: 20, borderRadius: 20, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleKnob:   { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },

  dangerBtn:    { width: '100%', padding: '8px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  ghostDangerBtn: { width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  closedBadge:  { width: '100%', padding: '8px', borderRadius: 8, background: '#f1f5f9', color: '#94a3b8', fontSize: 12, fontWeight: 600, textAlign: 'center', boxSizing: 'border-box' },

  soundPickerTitle: { fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 },
  soundOption:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, marginBottom: 3, cursor: 'pointer', border: '1.5px solid transparent', transition: 'all 0.15s' },
  soundLabel:   { fontSize: 12, fontWeight: 600 },
  soundDesc:    { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  previewBtn:   { background: 'none', border: '1px solid', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0 },

  pendingCard:  { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', marginBottom: 8 },
  pendingCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pendingCardFrom: { fontSize: 11, fontWeight: 700, color: '#334155' },
  pendingCardReason: { fontSize: 10, color: '#d97706', fontWeight: 600 },
  pendingCardBody: { fontSize: 12, color: '#1e293b', marginBottom: 8, wordBreak: 'break-all', fontStyle: 'italic' },
  pendingCardBtns: { display: 'flex', gap: 6 },
  approveBtn:   { flex: 1, padding: '5px', border: '1px solid #10b981', borderRadius: 6, background: '#f0fdf4', color: '#059669', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' },
  rejectBtn:    { flex: 1, padding: '5px', border: '1px solid #ef4444', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' },
  emptyPanel:   { fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '10px 0' },
}