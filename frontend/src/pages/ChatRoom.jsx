import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'
import ChatWebSocket from '../services/websocket'
import api from '../services/api'
import useNotificationSound, { SOUND_PROFILES } from '../hooks/useNotificationSound'

// ── Design Tokens — WhatsApp theme ────────────────────────────────────────────
const C = {
  // Primary — WhatsApp teal, used for header/brand/active accents
  navy:        '#075e54',
  navyHover:   '#064e45',
  // Green — the signature action color (send button, own bubbles, active states)
  gold:        '#00a884',
  goldDark:    '#008a6e',
  goldLight:   '#e7f8f3',
  goldBorder:  '#b6e6d8',
  // Backgrounds
  bg:          '#f0f2f5',
  sidebarBg:   '#ffffff',
  chatBg:      '#efeae2',
  // Borders
  border:      '#e9edef',
  borderLight: '#f0f2f5',
  // Text
  text:        '#111b21',
  textMid:     '#3b4a54',
  textSoft:    '#667781',
  textFaint:   '#8696a0',
  // Role colors — lighter, friendlier
  adminBg:     '#e7f8f3', adminText: '#008a6e',
  providerBg:  '#fef6e0', providerText: '#8a6d00',
  clientBg:    '#e9f3ff', clientText:   '#2a5298',
  // Status
  green:       '#00a884',
  greenLight:  '#e7f8f3',
  amber:       '#d69e2e',
  amberLight:  '#fef6e0',
  red:         '#e53e3e',
  redLight:    '#fff0ef',
  white:       '#ffffff',
}

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
  const [rightTab, setRightTab]               = useState('members')
  const [showRightPanel, setShowRightPanel]   = useState(true)
  const [filesEnabled, setFilesEnabled]       = useState(true)
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
  const [searchQuery, setSearchQuery]               = useState('')

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('tjc_sound_enabled')
    return stored === null ? true : stored === 'true'
  })
  const [messageSoundProfile, setMessageSoundProfile] = useState(() =>
    localStorage.getItem('tjc_message_sound_profile') || 'chime')
  const [pendingSoundProfile, setPendingSoundProfile] = useState(() =>
    localStorage.getItem('tjc_pending_sound_profile') || 'ping')
  const { playSound } = useNotificationSound()

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      localStorage.setItem('tjc_sound_enabled', String(next))
      return next
    })
  }, [])
  const changeMessageSoundProfile = useCallback((id) => {
    setMessageSoundProfile(id); localStorage.setItem('tjc_message_sound_profile', id)
  }, [])
  const changePendingSoundProfile = useCallback((id) => {
    setPendingSoundProfile(id); localStorage.setItem('tjc_pending_sound_profile', id)
  }, [])

  const messagesEndRef = useRef(null)
  const wsRef          = useRef(null)
  const seenIdsRef     = useRef(new Set())
  const fileInputRef   = useRef(null)
  const roomWsRefs     = useRef({})

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    api.get('/chat/rooms/').then(res => {
      setRooms(res.data)
      if (res.data.length > 0) {
        const room = roomId ? res.data.find(r => r.id === parseInt(roomId)) || res.data[0] : res.data[0]
        setActiveRoom(room)
      }
    }).catch(err => console.error('Failed to load rooms:', err))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    api.get('/accounts/users/').then(res => {
      setAvailableProviders(res.data.filter(u => u.role === 'provider'))
      setAvailableClients(res.data.filter(u => u.role === 'client'))
    })
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
      if (room.id === activeRoom.id || roomWsRefs.current[room.id]) return
      let historyLoaded = false
      const ws = new ChatWebSocket(room.id, token, data => {
        if (data.type === 'connected') { setTimeout(() => { historyLoaded = true }, 500); return }
        if ((data.type === 'message' || data.type === 'file') && historyLoaded) {
          setUnreadCounts(prev => ({ ...prev, [room.id]: (prev[room.id] || 0) + 1 }))
          if (soundEnabled) playSound('message', messageSoundProfile)
        }
      })
      ws.connect(); roomWsRefs.current[room.id] = ws
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

  useEffect(() => { return () => Object.values(roomWsRefs.current).forEach(ws => ws.disconnect()) }, [])

  useEffect(() => {
    if (!activeRoom) return
    if (wsRef.current) wsRef.current.disconnect()
    setMessages([]); setConnected(false); seenIdsRef.current = new Set()
    const token = localStorage.getItem('access_token')
    wsRef.current = new ChatWebSocket(activeRoom.id, token, data => {
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
        setMessages(prev => {
          const idx = prev.findIndex(m => m.type === 'file' && m.file_id === data.file_id)
          if (idx !== -1) {
            const updated = [...prev]
            updated[idx] = { ...updated[idx], ...data }
            return updated
          }
          return [...prev, data]
        })
        if (soundEnabled && data.sender !== user?.display_name) playSound('message', messageSoundProfile)
        return
      }
      if (data.type === 'file:rejected') {
        setMessages(prev => prev.filter(m => !(m.type === 'file' && m.file_id === data.id)))
        setPendingFiles(prev => prev.filter(f => f.id !== data.id))
        return
      }
      if (data.type === 'system') {
        setMessages(prev => [...prev, { type: 'system', message: data.message, id: 'sys_' + Date.now() + '_' + Math.random() }])
        return
      }
      if (data.type === 'error') { setError(data.error); setTimeout(() => setError(''), 4000); return }
      if (data.type === 'pending') {
        setPendingMessages(prev => prev.find(p => p.id === data.id) ? prev : [...prev, data])
        if (soundEnabled && isAdmin) playSound('pending', pendingSoundProfile)
        return
      }
      if (data.type === 'file:rejected') {
        const pid = 'file_pending_' + data.id
        setMessages(prev => prev.filter(m => m.id !== pid && m.file_id !== data.id))
        setPendingFiles(prev => prev.filter(f => f.id !== data.id))
        return
      }
      if (data.type === 'file:pending') {
        setPendingFiles(prev => prev.find(f => f.id === data.id) ? prev : [...prev, data])
        if (soundEnabled && isAdmin) playSound('pending', pendingSoundProfile)
        const isMine = data.sender === user?.display_name
        if (isAdmin || isMine) {
          setMessages(prev => {
            const pid = 'file_pending_' + data.id
            if (prev.find(m => m.id === pid)) return prev
            return [...prev, { type: 'file', id: pid, file_id: data.id, file_name: data.file_name, file_size: data.file_size, file_url: data.file_url ?? null, sender: data.sender, role: data.role, status: 'pending', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]
          })
        }
      }
    })
    wsRef.current.connect()
    return () => { if (wsRef.current) wsRef.current.disconnect() }
  }, [activeRoom, soundEnabled, isAdmin, playSound, messageSoundProfile, pendingSoundProfile, user?.display_name])

  const sendMessage = () => {
    if (!input.trim() || !connected) return
    wsRef.current.send(input.trim(), (isAdmin || isProvider) ? messageTarget : 'everyone')
    setInput('')
  }

  const handleFileUpload = async e => {
    const file = e.target.files[0]; if (!file || !activeRoom || !connected) return
    const fd = new FormData(); fd.append('file', file)
    try {
      await api.post('/chat/rooms/' + activeRoom.id + '/upload-file/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      // The pending/approved bubble itself arrives via the websocket
      // ('file' event, status 'pending' or 'approved') — the upload
      // response only carries {file_id, status}, not enough to render.
    }
    catch { setError('Failed to upload file.'); setTimeout(() => setError(''), 4000) }
    e.target.value = ''
  }

  const updateSetting = async (key, value) => {
    try { await api.patch('/chat/rooms/' + activeRoom.id + '/settings/', { [key]: value }) }
    catch {
      if (key === 'files_enabled') setFilesEnabled(!value)
      if (key === 'provider_files_need_approval') setProviderNeedsApproval(!value)
      if (key === 'client_files_need_approval') setClientNeedsApproval(!value)
      setError('Failed to update setting.'); setTimeout(() => setError(''), 3000)
    }
  }

  const inviteProvider = async () => {
    if (!selectedProvider) { setError('Select a provider first'); setTimeout(() => setError(''), 3000); return }
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-provider/', { provider_id: selectedProvider })
      setActiveRoom(res.data); setSelectedProvider('')
      setInviteMsg('Provider invited!'); setTimeout(() => setInviteMsg(''), 3000)
      api.get('/chat/rooms/').then(r => setRooms(r.data))
    } catch { setError('Failed to invite provider.'); setTimeout(() => setError(''), 3000) }
  }

  const inviteClientByDropdown = async () => {
    if (!selectedClient) { setError('Select a client first'); setTimeout(() => setError(''), 3000); return }
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-client/', { client_id: selectedClient })
      setActiveRoom(res.data); setSelectedClient('')
      setInviteClientMsg('✅ Client added!'); setTimeout(() => setInviteClientMsg(''), 3000)
      api.get('/chat/rooms/').then(r => setRooms(r.data))
    } catch (err) { setError(err.response?.data?.error || 'Failed to add client.'); setTimeout(() => setError(''), 3000) }
  }

  const inviteClientByPhone = async () => {
    if (!invitePhone.trim()) return
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-client/', { phone_number: invitePhone.trim() })
      setActiveRoom(res.data); setInvitePhone('')
      setInviteClientMsg('✅ Client invited!'); setTimeout(() => setInviteClientMsg(''), 3000)
    } catch (err) {
      setInviteClientMsg('🚫 ' + (err.response?.data?.error || 'Failed'))
      setTimeout(() => setInviteClientMsg(''), 4000)
    }
  }

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  const statusColor = s => s === 'active' ? C.green : s === 'negotiating' ? C.amber : C.textFaint
  const statusLabel = s => s === 'active' ? 'Active' : s === 'negotiating' ? 'Negotiating' : 'Closed'
  const getClientDisplay = room => room?.client?.display_name || room?.client || 'Client'
  const isImageFile = fn => /\.(jpg|jpeg|png|gif|webp)$/i.test(fn)
  const totalPending = pendingMessages.length + pendingFiles.length

  const roleStyle = role => {
    if (role === 'admin')    return { bg: C.adminBg,    text: C.adminText    }
    if (role === 'provider') return { bg: C.providerBg, text: C.providerText }
    return                          { bg: C.clientBg,   text: C.clientText   }
  }

  const avatarBg = name => {
    const colors = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#10b981','#06b6d4','#6366f1','#f59e0b']
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return colors[Math.abs(h) % colors.length]
  }

  const targetOptions = isAdmin
    ? [{ value: 'everyone', label: 'Everyone', icon: '🌐' }, { value: 'client', label: 'Client', icon: '👤' }, { value: 'provider', label: 'Provider', icon: '🔧' }]
    : [{ value: 'everyone', label: 'Everyone', icon: '🌐' }, { value: 'admin', label: 'Admin', icon: '🔑' }]

  const allMembers = activeRoom ? (() => {
    const clientId = activeRoom.client?.id ?? activeRoom.client
    const rows = [
      { name: getClientDisplay(activeRoom), role: 'client', online: true, id: clientId },
      ...(activeRoom.providers || []).map(p => ({ name: p.display_name, role: 'provider', online: false, id: p.id, isProvider: true })),
      ...(activeRoom.extra_clients || []).map(c => ({ name: c.display_name, role: 'client', online: false, id: c.id, isExtraClient: true })),
    ]
    const meIsListed = rows.some(r => r.id === user?.id)
    if (!meIsListed) {
      rows.unshift({ name: user?.display_name || 'You', role: user?.role || 'client', online: true, id: user?.id })
    }
    return rows.map(r => r.id === user?.id ? { ...r, isYou: true } : r)
  })() : []

  if (!activeRoom) return (
    <div style={S.loadingScreen}>
      <div style={S.spinner} />
      <div style={S.loadingText}>Loading workspace…</div>
    </div>
  )

  return (
    <div style={S.app}>
      <style>{css}</style>

      {/* ═══ LEFT SIDEBAR ═══ */}
      {showSidebar && (
        <aside style={S.sidebar}>
          {/* Brand header — teal strip at top only */}
          <div style={S.sidebarBrand}>
            <div style={S.brandMark}>TJ</div>
            <div>
              <div style={S.brandName}>TutorJamesConnect</div>
              <div style={S.brandTagline}>Academic Excellence Platform</div>
            </div>
          </div>

          {/* User card */}
          <div style={S.userCard}>
            <div style={{ ...S.userAv, background: avatarBg(user?.display_name) }}>
              {user?.display_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.userName}>{user?.display_name || 'User'}</div>
              <span style={{ ...S.rolePill, background: roleStyle(user?.role).bg, color: roleStyle(user?.role).text }}>
                {user?.role || 'client'}
              </span>
            </div>
          </div>

          {/* Search */}
          <div style={S.searchWrap}>
            <svg style={S.searchIco} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input style={S.searchInput} placeholder="Search rooms or members…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>

          {/* New Room */}
          {isAdmin && (
            <div style={{ padding: '0 12px 12px' }}>
              <button className="tjc-newroom" style={S.newRoomBtn}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New Room
              </button>
            </div>
          )}

          {/* Rooms */}
          <div style={S.secLabel}>ROOMS</div>
          <div style={S.roomList}>
            {rooms.filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())).map(room => {
              const unread = unreadCounts[room.id] || 0
              const isActive = activeRoom?.id === room.id
              return (
                <div key={room.id} className="tjc-room"
                  style={{ ...S.roomItem, ...(isActive ? S.roomItemActive : {}) }}
                  onClick={() => { setActiveRoom(room); setUnreadCounts(prev => ({ ...prev, [room.id]: 0 })) }}>
                  <div style={{ ...S.roomAv, background: isActive ? C.gold : avatarBg(room.name), color: '#fff' }}>
                    {room.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...S.roomName, color: isActive ? C.navy : C.text, fontWeight: isActive ? 700 : 600 }}>{room.name}</div>
                    <div style={S.roomMeta}>
                      <span style={{ ...S.dot, background: statusColor(room.status) }} />
                      {statusLabel(room.status)}
                    </div>
                  </div>
                  {unread > 0 && !isActive && <span style={S.badge}>{unread > 99 ? '99+' : unread}</span>}
                </div>
              )
            })}
          </div>

          <div style={{ flex: 1 }} />
          <button className="tjc-signout" style={S.signOutBtn} onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </aside>
      )}

      {/* ═══ MAIN ═══ */}
      <div style={S.main}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.headerL}>
            <button className="tjc-icon" style={S.iconBtn} onClick={() => setShowSidebar(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div style={{ ...S.roomHeaderAv, background: avatarBg(activeRoom.name) }}>
              {activeRoom.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={S.headerRoomName}>{activeRoom.name}</div>
              <div style={S.headerRoomMeta}>
                <span style={{ ...S.dot, background: statusColor(activeRoom.status) }} />
                {statusLabel(activeRoom.status)}
                <span style={S.sep}>·</span>
                {allMembers.length} members
                <span style={S.sep}>·</span>
                Files {filesEnabled ? 'enabled' : 'disabled'}
              </div>
            </div>
          </div>
          <div style={S.headerR}>
            <button className="tjc-icon" style={S.iconBtn}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
            <button className="tjc-icon" style={S.iconBtn}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>
            <button className="tjc-icon" style={{ ...S.iconBtn, position: 'relative' }} onClick={() => setShowRightPanel(v => !v)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              {totalPending > 0 && <span style={S.headerDot} />}
            </button>
            <button className="tjc-icon" style={S.iconBtn} onClick={toggleSound}>
              {soundEnabled
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              }
            </button>
          </div>
        </div>

        {error && <div style={S.errorBar}>{error}</div>}

        {/* Messages */}
        <div style={S.messages}>
          {messages.length === 0 && connected && (
            <div style={S.emptyChat}>
              <div style={S.emptyIcon}>💬</div>
              <div style={S.emptyTitle}>No messages yet</div>
              <div style={S.emptySub}>Start the conversation</div>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.type === 'system') return (
              <div key={msg.id || idx} style={S.sysMsg}>
                <span style={S.sysText}>{msg.message}</span>
              </div>
            )

            if (msg.type === 'file') {
              const isImg = isImageFile(msg.file_name)
              const isPending = msg.status === 'pending'
              return (
                <div key={msg.id || idx} style={{ ...S.msgRow, justifyContent: 'flex-start' }}>
                  <div style={{ ...S.msgAv, background: avatarBg(msg.sender) }}>{msg.sender?.[0]?.toUpperCase()}</div>
                  <div style={{ maxWidth: '60%' }}>
                    <div style={S.msgMeta}>
                      <span style={S.msgSender}>{msg.sender}</span>
                      {msg.role && <span style={{ ...S.rolePill, background: roleStyle(msg.role).bg, color: roleStyle(msg.role).text }}>{msg.role}</span>}
                    </div>
                    <div style={{ ...S.fileBubble, ...(isPending ? { borderColor: C.goldBorder, background: C.goldLight } : {}) }}>
                      {isPending && <div style={S.pendingTag}>⏳ Awaiting approval</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 26 }}>{isImg ? '🖼️' : '📄'}</span>
                        <div><div style={S.fileName}>{msg.file_name}</div><div style={S.fileMeta}>{msg.file_size}</div></div>
                      </div>
                      {isImg && msg.file_url && <img src={msg.file_url} alt={msg.file_name} style={{ width: '100%', borderRadius: 8, marginTop: 10, maxHeight: 200, objectFit: 'cover' }} />}
                      {msg.file_url && <a href={msg.file_url} target="_blank" rel="noreferrer" style={S.dlLink}>↓ Download</a>}
                      {isAdmin && isPending && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <button className="tjc-approve" style={S.appBtn} onClick={async () => {
                            try { await api.post('/chat/admin/files/' + msg.file_id + '/approve/'); setMessages(p => p.map(m => m.id === msg.id ? { ...m, status: 'approved' } : m)); setPendingFiles(p => p.filter(f => f.id !== msg.file_id)) }
                            catch { setError('Failed to approve.') }
                          }}>✓ Approve</button>
                          <button className="tjc-reject" style={S.rejBtn} onClick={async () => {
                            try { await api.post('/chat/admin/files/' + msg.file_id + '/reject/'); setMessages(p => p.filter(m => m.id !== msg.id)); setPendingFiles(p => p.filter(f => f.id !== msg.file_id)) }
                            catch { setError('Failed to reject.') }
                          }}>✕ Reject</button>
                        </div>
                      )}
                    </div>
                    <div style={S.msgTime}>{msg.time}</div>
                  </div>
                </div>
              )
            }

            const isMe      = msg.sender === user?.display_name
            const isFlagged = msg.status === 'pending'
            const sRole     = msg.role || 'client'
            const showVis   = (isAdmin || isProvider) && msg.target && msg.target !== 'everyone'
            const visColor  = msg.target === 'client' ? { bg: C.clientBg, text: C.clientText } : msg.target === 'provider' ? { bg: C.providerBg, text: C.providerText } : { bg: C.adminBg, text: C.adminText }

            return (
              <div key={msg.id || idx} style={{ ...S.msgRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                {!isMe && <div style={{ ...S.msgAv, background: avatarBg(msg.sender) }}>{msg.sender?.[0]?.toUpperCase()}</div>}
                <div style={{ maxWidth: '62%' }}>
                  {!isMe && (
                    <div style={{ ...S.msgMeta, justifyContent: 'flex-start' }}>
                      <span style={S.msgSender}>{msg.sender}</span>
                      <span style={{ ...S.rolePill, background: roleStyle(sRole).bg, color: roleStyle(sRole).text }}>{sRole}</span>
                    </div>
                  )}
                  <div style={{
                    ...S.bubble,
                    ...(isMe ? S.bubbleMe : S.bubbleOther),
                    ...(isFlagged ? { background: C.amberLight, border: `1.5px solid ${C.goldBorder}`, boxShadow: 'none' } : {}),
                  }}>
                    {isFlagged && <div style={S.flagTag}>⚠️ Pending approval</div>}
                    <span style={{ color: C.text }}>{msg.body}</span>
                    {isAdmin && isFlagged && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button className="tjc-approve" style={S.appBtn} onClick={async () => {
                          try { await api.post('/chat/admin/messages/' + msg.id + '/approve/'); setMessages(p => p.map(m => m.id === msg.id ? { ...m, status: 'approved' } : m)); setPendingMessages(p => p.filter(x => x.id !== msg.id)) }
                          catch { setError('Failed to approve.') }
                        }}>✓ Approve</button>
                        <button className="tjc-reject" style={S.rejBtn} onClick={async () => {
                          try { await api.post('/chat/admin/messages/' + msg.id + '/reject/'); setMessages(p => p.filter(m => m.id !== msg.id)); setPendingMessages(p => p.filter(x => x.id !== msg.id)) }
                          catch { setError('Failed to reject.') }
                        }}>✕ Reject</button>
                      </div>
                    )}
                  </div>
                  {showVis && (
                    <div style={{ ...S.visPill, background: visColor.bg, color: visColor.text, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      👁 Visible to: {msg.target === 'client' ? 'Client only' : msg.target === 'provider' ? 'Provider only' : 'Admin only'}
                    </div>
                  )}
                  <div style={{ ...S.msgTime, textAlign: isMe ? 'right' : 'left' }}>
                    {msg.time}{isMe && !isFlagged && <span style={{ color: C.gold, marginLeft: 4 }}>✓✓</span>}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Client invite */}
        {activeRoom.status !== 'closed' && user?.role === 'client' && (
          <div style={S.inviteBar}>
            <input style={S.inviteInput} placeholder="Invite a friend — e.g. +254712345678"
              value={invitePhone} onChange={e => setInvitePhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inviteClientByPhone()} />
            <button style={S.inviteBtn} onClick={inviteClientByPhone}>Invite</button>
          </div>
        )}
        {inviteClientMsg && user?.role === 'client' && (
          <div style={{ textAlign: 'center', fontSize: 12, padding: '4px 20px', fontWeight: 500, color: inviteClientMsg.startsWith('✅') ? C.green : C.red, background: inviteClientMsg.startsWith('✅') ? C.greenLight : C.redLight }}>
            {inviteClientMsg}
          </div>
        )}

        {/* Input */}
        <div style={S.inputArea}>
          <div style={S.inputBox}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} disabled={!filesEnabled || !connected} />
            <button className="tjc-icon" style={{ ...S.inputIco, opacity: filesEnabled && connected ? 1 : 0.3 }}
              onClick={() => filesEnabled && connected && fileInputRef.current?.click()}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <textarea style={S.textarea}
              placeholder={!connected ? 'Connecting…' : messageTarget === 'client' ? 'Message to client only…' : messageTarget === 'provider' ? 'Message to provider only…' : messageTarget === 'admin' ? 'Private message to admin…' : 'Type a message'}
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} rows={1} disabled={!connected} />
            <button className="tjc-icon" style={S.inputIco}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <button className="tjc-send"
              style={{ ...S.sendBtn, ...(!(input.trim() && connected) ? S.sendOff : {}) }}
              onClick={sendMessage} disabled={!input.trim() || !connected}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
            </button>
          </div>
          {(isAdmin || isProvider) && activeRoom.status !== 'closed' && (
            <div style={S.targetRow}>
              <span style={S.targetLbl}>Send to:</span>
              {targetOptions.map(opt => (
                <button key={opt.value} className="tjc-target"
                  style={{ ...S.targetBtn, ...(messageTarget === opt.value ? S.targetOn : {}) }}
                  onClick={() => setMessageTarget(opt.value)}>
                  {opt.icon} {opt.label}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: connected ? C.green : C.amber }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                {connected ? 'Connected' : 'Connecting…'}
              </div>
            </div>
          )}
          {!(isAdmin || isProvider) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, fontSize: 11, color: connected ? C.green : C.amber, marginTop: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {connected ? 'Connected · Enter to send' : 'Connecting…'}
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      {showRightPanel && (
        <aside style={S.rightPanel}>
          <div style={S.tabs}>
            {['members', 'roominfo'].map(t => (
              <button key={t} className="tjc-tab"
                style={{ ...S.tab, ...(rightTab === t ? S.tabOn : {}) }}
                onClick={() => setRightTab(t)}>
                {t === 'members' ? 'Members' : 'Room Info'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rightTab === 'members' && (
              <>
                <div style={S.rSec}>
                  <div style={S.rSecHdr}>
                    MEMBERS ({allMembers.length})
                    {isAdmin && <button style={S.addBtn} onClick={() => setRightTab('roominfo')}>+ Add</button>}
                  </div>
                  {allMembers.map((m, i) => (
                    <div key={i} style={S.memberRow}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ ...S.memberAv, background: avatarBg(m.name) }}>{m.name?.[0]?.toUpperCase()}</div>
                        <span style={{ ...S.onlineDot, background: m.online ? C.green : C.textFaint }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.memberName}>{m.name}{m.isYou ? ' (You)' : ''}</div>
                        <div style={{ fontSize: 11, color: m.online ? C.green : C.textFaint, marginTop: 1 }}>
                          {m.online ? '● Online' : '● Offline'}
                        </div>
                      </div>
                      <span style={{ ...S.rolePill, background: roleStyle(m.role).bg, color: roleStyle(m.role).text }}>
                        {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                      </span>
                      {isAdmin && (m.isProvider || m.isExtraClient) && (
                        <button style={S.removeBtn} onClick={async () => {
                          try {
                            const ep = m.isProvider ? 'remove-provider' : 'remove-client'
                            const key = m.isProvider ? 'provider_id' : 'client_id'
                            const res = await api.post('/chat/rooms/' + activeRoom.id + '/' + ep + '/', { [key]: m.id })
                            setActiveRoom(res.data); api.get('/chat/rooms/').then(r => setRooms(r.data))
                          } catch { setError('Failed to remove.') }
                        }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>

                {isAdmin && (
                  <>
                    <div className="tjc-action" style={S.actionRow} onClick={() => setRightTab('roominfo')}>
                      <div style={S.actionIco}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></div>
                      <span style={S.actionLbl}>Invite Members</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                    <div className="tjc-action" style={S.actionRow} onClick={() => setRightTab('roominfo')}>
                      <div style={S.actionIco}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 0-14.14 0" opacity=".4"/></svg></div>
                      <span style={S.actionLbl}>Room Settings</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </>
                )}

                {isAdmin && (
                  <div style={S.rSec}>
                    <div style={S.rSecHdr}>FILE SETTINGS</div>
                    {[
                      { label: 'File sharing', sub: 'Allow files in this room', val: filesEnabled, key: 'files_enabled', set: setFilesEnabled },
                      { label: 'Provider → approval', sub: 'Admin reviews provider files', val: providerNeedsApproval, key: 'provider_files_need_approval', set: setProviderNeedsApproval },
                      { label: 'Client → approval', sub: 'Client reviews provider files', val: clientNeedsApproval, key: 'client_files_need_approval', set: setClientNeedsApproval },
                    ].map(item => (
                      <div key={item.key} style={S.togRow}>
                        <div style={{ flex: 1 }}>
                          <div style={S.togLbl}>{item.label}</div>
                          <div style={S.togSub}>{item.sub}</div>
                        </div>
                        <div style={{ ...S.tog, background: item.val ? C.gold : C.border }}
                          onClick={() => { const v = !item.val; item.set(v); updateSetting(item.key, v) }}>
                          <div style={{ ...S.togKnob, transform: item.val ? 'translateX(18px)' : 'translateX(2px)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isAdmin && (pendingMessages.length > 0 || pendingFiles.length > 0) && (
                  <div style={S.rSec}>
                    <div style={S.rSecHdr}>
                      PENDING
                      <span style={{ background: C.red, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{totalPending}</span>
                    </div>
                    {[...pendingMessages.map(p => ({ ...p, _type: 'msg' })), ...pendingFiles.map(f => ({ ...f, _type: 'file' }))].map(item => (
                      <div key={item.id} style={S.pendCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{item.sender}</span>
                          <span style={{ fontSize: 10, color: C.amber }}>{item._type === 'msg' ? `⚠️ ${item.reason}` : `📦 ${item.file_size}`}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.textMid, fontStyle: 'italic', marginBottom: 7 }}>
                          {item._type === 'msg' ? `"${item.body || item.text}"` : `${isImageFile(item.file_name) ? '🖼️' : '📄'} ${item.file_name}`}
                        </div>
                        {item._type === 'file' && (item.file_url || item.file) && (
                          <div style={{ marginBottom: 8 }}>
                            {isImageFile(item.file_name) && (
                              <img src={item.file_url || item.file} alt={item.file_name} style={{ width: '100%', borderRadius: 6, marginBottom: 6, maxHeight: 140, objectFit: 'cover' }} />
                            )}
                            <a href={item.file_url || item.file} target="_blank" rel="noreferrer" style={{ ...S.dlLink, marginTop: 0, fontSize: 11 }}>
                              👁 Preview / Download before deciding
                            </a>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="tjc-approve" style={S.appBtn} onClick={async () => {
                            try {
                              if (item._type === 'msg') { await api.post('/chat/admin/messages/' + item.id + '/approve/'); setPendingMessages(p => p.filter(x => x.id !== item.id)); setMessages(p => p.map(m => m.id === item.id ? { ...m, status: 'approved' } : m)) }
                              else { await api.post('/chat/admin/files/' + item.id + '/approve/'); setPendingFiles(p => p.filter(x => x.id !== item.id)); setMessages(p => p.map(m => m.id === 'file_pending_' + item.id ? { ...m, status: 'approved' } : m)) }
                            } catch { setError('Failed to approve.') }
                          }}>✓ Approve</button>
                          <button className="tjc-reject" style={S.rejBtn} onClick={async () => {
                            try {
                              if (item._type === 'msg') { await api.post('/chat/admin/messages/' + item.id + '/reject/'); setPendingMessages(p => p.filter(x => x.id !== item.id)); setMessages(p => p.filter(m => m.id !== item.id)) }
                              else { await api.post('/chat/admin/files/' + item.id + '/reject/'); setPendingFiles(p => p.filter(x => x.id !== item.id)); setMessages(p => p.filter(m => m.id !== 'file_pending_' + item.id)) }
                            } catch { setError('Failed to reject.') }
                          }}>✕ Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isAdmin && (
                  <div style={{ padding: '12px 14px' }}>
                    {activeRoom.status !== 'closed' ? (
                      <button style={S.closeRoomBtn} onClick={async () => {
                        if (!window.confirm('Close this room?')) return
                        try { const res = await api.post('/chat/rooms/' + activeRoom.id + '/close/'); setActiveRoom(res.data); api.get('/chat/rooms/').then(r => setRooms(r.data)) }
                        catch { setError('Failed to close room.') }
                      }}>🔒 Close Room</button>
                    ) : (
                      <button style={S.closeRoomBtn} onClick={async () => {
                        if (!window.confirm('Permanently delete this room?')) return
                        try { await api.delete('/chat/rooms/' + activeRoom.id + '/delete/'); const res = await api.get('/chat/rooms/'); setRooms(res.data); if (res.data.length > 0) setActiveRoom(res.data[0]) }
                        catch { setError('Failed to delete room.') }
                      }}>🗑 Delete Room</button>
                    )}
                  </div>
                )}
              </>
            )}

            {rightTab === 'roominfo' && isAdmin && (
              <div style={S.rSec}>
                <div style={S.rSecHdr}>INVITE PROVIDER</div>
                <select style={S.sel} value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
                  <option value="">Select provider…</option>
                  {availableProviders.filter(p => !(activeRoom.providers || []).find(ap => ap.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
                <button style={S.priBtn} onClick={inviteProvider}>+ Invite Provider</button>
                {inviteMsg && <div style={{ color: C.green, fontSize: 12, marginTop: 6, textAlign: 'center', fontWeight: 600 }}>{inviteMsg}</div>}

                <div style={{ ...S.rSecHdr, marginTop: 16 }}>INVITE CLIENT</div>
                <select style={S.sel} value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                  <option value="">Select client…</option>
                  {availableClients.filter(c => c.id !== activeRoom.client?.id && !(activeRoom.extra_clients || []).find(ec => ec.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
                <button style={S.priBtn} onClick={inviteClientByDropdown}>+ Add Client</button>
                {inviteClientMsg && <div style={{ color: C.green, fontSize: 12, marginTop: 6, textAlign: 'center', fontWeight: 600 }}>{inviteClientMsg}</div>}

                <div style={{ ...S.rSecHdr, marginTop: 16 }}>NOTIFICATION SOUNDS</div>
                <div style={S.togRow}>
                  <div style={{ flex: 1 }}><div style={S.togLbl}>Sound alerts</div><div style={S.togSub}>Play on new messages</div></div>
                  <div style={{ ...S.tog, background: soundEnabled ? C.gold : C.border }} onClick={toggleSound}>
                    <div style={{ ...S.togKnob, transform: soundEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
                  </div>
                </div>
                {soundEnabled && SOUND_PROFILES.map(profile => (
                  <div key={profile.id}
                    style={{ ...S.soundOpt, ...(messageSoundProfile === profile.id ? { background: C.adminBg, border: `1.5px solid ${C.gold}` } : {}) }}
                    onClick={() => changeMessageSoundProfile(profile.id)}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: messageSoundProfile === profile.id ? C.navy : C.textMid }}>{profile.label}</div>
                    <button style={S.prevBtn} onClick={e => { e.stopPropagation(); playSound('message', profile.id) }}>▶</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-thumb { background: #cfd8dc; border-radius: 6px; }
  textarea, input, select, button { font-family: inherit; }
  textarea:focus, input:focus, select:focus { outline: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
  .tjc-newroom { transition: all 0.15s; }
  .tjc-newroom:hover { background: #008a6e !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,168,132,0.35) !important; }
  .tjc-room:hover { background: #f5f6f6 !important; }
  .tjc-icon:hover { background: #f0f2f5 !important; color: #075e54 !important; }
  .tjc-send:hover:not(:disabled) { background: #008a6e !important; transform: scale(1.06); box-shadow: 0 4px 14px rgba(0,168,132,0.45) !important; }
  .tjc-target:hover { border-color: #00a884 !important; color: #00a884 !important; }
  .tjc-approve:hover { background: #c3e6cb !important; }
  .tjc-reject:hover  { background: #f5c6cb !important; }
  .tjc-action:hover  { background: #f5f8fd !important; }
  .tjc-signout:hover { color: #e53e3e !important; border-color: #feb2b2 !important; background: #fff5f5 !important; }
  .tjc-tab:hover { color: #075e54 !important; }
`

const S = {
  app:          { display: 'flex', height: '100vh', background: '#f0f2f5', overflow: 'hidden', fontFamily: "'Segoe UI',Helvetica,Arial,sans-serif" },
  loadingScreen:{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', gap: 12 },
  spinner:      { width: 32, height: 32, border: '3px solid #e9edef', borderTopColor: '#00a884', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText:  { fontSize: 14, color: '#667781' },

  // ── Sidebar (white + teal top strip) ──────────────────────────────────────
  sidebar:      { width: 280, background: '#ffffff', borderRight: '1px solid #e9edef', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  sidebarBrand: { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 14px', background: '#075e54' },
  brandMark:    { width: 36, height: 36, borderRadius: '50%', background: '#00a884', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, letterSpacing: '-0.5px' },
  brandName:    { fontSize: 14, fontWeight: 600, color: '#ffffff' },
  brandTagline: { fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 2, letterSpacing: '0.03em' },
  userCard:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '10px 10px 4px', borderRadius: 10, background: '#f7f8fa', border: '1px solid #e9edef' },
  userAv:       { width: 32, height: 32, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userName:     { fontSize: 13, fontWeight: 600, color: '#111b21' },
  rolePill:     { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginTop: 2, textTransform: 'capitalize' },
  searchWrap:   { margin: '6px 10px 4px', position: 'relative' },
  searchIco:    { position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput:  { width: '100%', padding: '8px 10px 8px 28px', borderRadius: 20, border: '1px solid #e9edef', fontSize: 13, color: '#111b21', background: '#f0f2f5' },
  newRoomBtn:   { width: '100%', padding: '9px', border: 'none', borderRadius: 22, background: '#00a884', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,168,132,0.28)' },
  secLabel:     { fontSize: 9, fontWeight: 700, color: '#8696a0', letterSpacing: '0.1em', padding: '10px 14px 3px' },
  roomList:     { padding: '0 6px 4px' },
  roomItem:     { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 1, transition: 'background 0.12s' },
  roomItemActive: { background: '#e7f8f3', borderLeft: '3px solid #00a884', paddingLeft: 5 },
  roomAv:       { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  roomName:     { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  roomMeta:     { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8696a0', marginTop: 2 },
  dot:          { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  badge:        { background: '#00a884', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, flexShrink: 0 },
  dmItem:       { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 1, transition: 'background 0.12s' },
  dmAv:         { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 },
  dmName:       { fontSize: 12, fontWeight: 600, color: '#111b21' },
  dmStatus:     { fontSize: 10, marginTop: 1, fontWeight: 500 },
  onlineDot:    { position: 'absolute', bottom: 1, right: 1, width: 8, height: 8, borderRadius: '50%', border: '2px solid #fff' },
  signOutBtn:   { margin: '8px 10px 14px', padding: '8px 12px', border: '1px solid #e9edef', borderRadius: 8, background: 'none', color: '#8696a0', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s' },

  // ── Main ──────────────────────────────────────────────────────────────────
  main:         { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: '#efeae2' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#f0f2f5', borderBottom: '1px solid #e9edef' },
  headerL:      { display: 'flex', alignItems: 'center', gap: 11 },
  headerR:      { display: 'flex', alignItems: 'center', gap: 3 },
  iconBtn:      { background: 'none', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', color: '#54656f', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', position: 'relative' },
  roomHeaderAv: { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  headerRoomName: { fontSize: 15, fontWeight: 600, color: '#111b21', letterSpacing: '-0.1px' },
  headerRoomMeta: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#667781', marginTop: 2 },
  sep:          { color: '#c9cfd3' },
  headerDot:    { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#e53e3e' },
  errorBar:     { background: '#fff0ef', color: '#e53e3e', padding: '7px 18px', fontSize: 13, borderBottom: '1px solid #feb2b2' },

  messages:     {
    flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 2,
    background: '#efeae2',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23e0dbd0' fill-opacity='0.4'%3E%3Ccircle cx='10' cy='10' r='1.4'/%3E%3Ccircle cx='50' cy='30' r='1.4'/%3E%3Ccircle cx='90' cy='10' r='1.4'/%3E%3Ccircle cx='30' cy='70' r='1.4'/%3E%3Ccircle cx='70' cy='90' r='1.4'/%3E%3C/g%3E%3C/svg%3E\")",
  },
  emptyChat:    { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon:    { fontSize: 44, marginBottom: 6 },
  emptyTitle:   { fontSize: 15, fontWeight: 700, color: '#111b21' },
  emptySub:     { fontSize: 13, color: '#8696a0' },
  sysMsg:       { alignSelf: 'center', maxWidth: '80%', margin: '8px 0', background: '#fff3c4', borderRadius: 7, padding: '5px 12px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' },
  sysText:      { fontSize: 12, color: '#5b5228', textAlign: 'center' },

  msgRow:       { display: 'flex', alignItems: 'flex-end', gap: 8, animation: 'fadeUp 0.15s ease', marginBottom: 10 },
  msgAv:        { width: 30, height: 30, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  msgMeta:      { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 },
  msgSender:    { fontSize: 12, fontWeight: 700, color: '#00a884' },
  bubble:       { padding: '7px 9px 8px', borderRadius: 8, fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word', position: 'relative' },
  bubbleMe:     { background: '#d9fdd3', borderTopRightRadius: 0, boxShadow: '0 1px 1px rgba(0,0,0,0.08)' },
  bubbleOther:  { background: '#ffffff', borderTopLeftRadius: 0, boxShadow: '0 1px 1px rgba(0,0,0,0.08)' },
  flagTag:      { fontSize: 11, color: '#d69e2e', fontWeight: 600, marginBottom: 5 },
  visPill:      { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, marginTop: 4 },
  msgTime:      { fontSize: 10, color: '#8696a0', marginTop: 3, paddingLeft: 2 },

  fileBubble:   { background: '#ffffff', borderRadius: 8, padding: '11px 13px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' },
  pendingTag:   { fontSize: 11, color: '#d69e2e', fontWeight: 600, marginBottom: 7 },
  fileName:     { fontSize: 13, fontWeight: 600, color: '#111b21', wordBreak: 'break-all' },
  fileMeta:     { fontSize: 11, color: '#8696a0', marginTop: 1 },
  dlLink:       { display: 'inline-block', marginTop: 8, fontSize: 12, color: '#00a884', fontWeight: 600, textDecoration: 'none' },

  inviteBar:    { display: 'flex', gap: 8, padding: '8px 18px', borderTop: '1px solid #e9edef', background: '#f0f2f5' },
  inviteInput:  { flex: 1, padding: '7px 11px', borderRadius: 20, border: '1.5px solid #e9edef', fontSize: 13, color: '#111b21' },
  inviteBtn:    { padding: '7px 15px', borderRadius: 20, border: 'none', background: '#00a884', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },

  inputArea:    { padding: '10px 14px 12px', background: '#f0f2f5', borderTop: '1px solid #e9edef' },
  inputBox:     { display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', borderRadius: 24, padding: '5px 8px' },
  inputIco:     { background: 'none', border: 'none', padding: '6px', cursor: 'pointer', color: '#8696a0', display: 'flex', alignItems: 'center', borderRadius: '50%', flexShrink: 0, transition: 'color 0.15s' },
  textarea:     { flex: 1, background: 'none', border: 'none', fontSize: 14, color: '#111b21', resize: 'none', lineHeight: 1.5, padding: '8px 0' },
  sendBtn:      { width: 38, height: 38, borderRadius: '50%', background: '#00a884', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(0,168,132,0.28)' },
  sendOff:      { background: '#c6cdd1', boxShadow: 'none', cursor: 'not-allowed' },
  targetRow:    { display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
  targetLbl:    { fontSize: 11, color: '#8696a0', fontWeight: 600 },
  targetBtn:    { fontSize: 11, padding: '4px 11px', borderRadius: 20, border: '1.5px solid #e9edef', cursor: 'pointer', background: '#fff', color: '#54656f', transition: 'all 0.15s', fontFamily: 'inherit' },
  targetOn:     { background: '#00a884', color: '#fff', borderColor: '#00a884', fontWeight: 600 },

  appBtn:       { flex: 1, padding: '5px 8px', border: '1px solid #9ae6b4', borderRadius: 6, background: '#f0fff4', color: '#276749', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s', fontFamily: 'inherit' },
  rejBtn:       { flex: 1, padding: '5px 8px', border: '1px solid #feb2b2', borderRadius: 6, background: '#fff5f5', color: '#e53e3e', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s', fontFamily: 'inherit' },

  // ── Right panel ───────────────────────────────────────────────────────────
  rightPanel:   { width: 280, background: '#ffffff', borderLeft: '1px solid #e9edef', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  tabs:         { display: 'flex', borderBottom: '1px solid #e9edef', padding: '0 14px' },
  tab:          { flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 500, color: '#8696a0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '3px solid transparent', transition: 'all 0.15s', marginBottom: -1, fontFamily: 'inherit' },
  tabOn:        { color: '#075e54', borderBottomColor: '#00a884', fontWeight: 700 },

  rSec:         { padding: '12px 14px', borderBottom: '1px solid #e9edef' },
  rSecHdr:      { fontSize: 10, fontWeight: 700, color: '#8696a0', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  addBtn:       { fontSize: 12, fontWeight: 600, color: '#00a884', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  memberRow:    { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 },
  memberAv:     { width: 32, height: 32, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 },
  memberName:   { fontSize: 13, fontWeight: 600, color: '#111b21' },
  removeBtn:    { background: 'none', border: '1px solid #feb2b2', borderRadius: 5, color: '#e53e3e', fontSize: 10, cursor: 'pointer', padding: '2px 6px', flexShrink: 0, marginLeft: 'auto', fontFamily: 'inherit' },

  actionRow:    { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid #e9edef', transition: 'background 0.12s', cursor: 'pointer' },
  actionIco:    { width: 30, height: 30, borderRadius: 7, background: '#e7f8f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionLbl:    { flex: 1, fontSize: 13, fontWeight: 500, color: '#3b4a54' },

  togRow:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  togLbl:       { fontSize: 12, fontWeight: 500, color: '#3b4a54' },
  togSub:       { fontSize: 10, color: '#8696a0', marginTop: 1 },
  tog:          { width: 38, height: 20, borderRadius: 20, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  togKnob:      { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },

  sel:          { width: '100%', padding: '7px 9px', borderRadius: 7, border: '1.5px solid #e9edef', fontSize: 12, color: '#111b21', background: '#fff', cursor: 'pointer', marginBottom: 6, fontFamily: 'inherit' },
  priBtn:       { width: '100%', padding: '8px', border: 'none', borderRadius: 20, background: '#00a884', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 4, fontFamily: 'inherit' },

  soundOpt:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 7, marginBottom: 3, cursor: 'pointer', border: '1.5px solid transparent', transition: 'all 0.15s' },
  prevBtn:      { background: 'none', border: '1px solid #00a884', borderRadius: 5, padding: '2px 7px', fontSize: 10, cursor: 'pointer', color: '#00a884', flexShrink: 0, fontFamily: 'inherit' },

  pendCard:     { background: '#fef6e0', border: '1px solid #f0dca0', borderRadius: 9, padding: '9px 11px', marginBottom: 7 },
  closeRoomBtn: { width: '100%', padding: '8px', border: '1px solid #feb2b2', borderRadius: 20, background: '#fff5f5', color: '#e53e3e', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' },
}

