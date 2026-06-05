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

  // ── Sound notifications ────────────────────────────────────────────────────
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
  // ──────────────────────────────────────────────────────────────────────────

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
          setUnreadCounts(prev => ({
            ...prev,
            [room.id]: (prev[room.id] || 0) + 1
          }))
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
    return () => {
      Object.values(roomWsRefs.current).forEach(ws => ws.disconnect())
    }
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    if (wsRef.current) wsRef.current.disconnect()
    setMessages([])
    setConnected(false)
    seenIdsRef.current = new Set()
    const token = localStorage.getItem('access_token')
    wsRef.current = new ChatWebSocket(
      activeRoom.id,
      token,
      (data) => {
        if (data.type === 'connected') { setConnected(true); return }

        if (data.type === 'message') {
          if (data.id && seenIdsRef.current.has(data.id)) return
          if (data.id) seenIdsRef.current.add(data.id)
          setMessages(prev => [...prev, data])
          if (soundEnabled && data.sender !== user?.display_name) {
            playSound('message', messageSoundProfile)
          }
          return
        }

        if (data.type === 'file') {
          if (seenIdsRef.current.has(data.id)) return
          seenIdsRef.current.add(data.id)
          setMessages(prev => [...prev, data])
          if (soundEnabled && data.sender !== user?.display_name) {
            playSound('message', messageSoundProfile)
          }
          return
        }

        if (data.type === 'system') {
          setMessages(prev => [...prev, {
            type: 'system',
            message: data.message,
            id: 'sys_' + Date.now() + '_' + Math.random()
          }])
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
                type:      'file',
                id:        pendingId,
                file_id:   data.id,
                file_name: data.file_name,
                file_size: data.file_size,
                file_url:  null,
                sender:    data.sender,
                status:    'pending',
                time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }]
            })
          }
          return
        }
      }
    )
    wsRef.current.connect()
    return () => { if (wsRef.current) wsRef.current.disconnect() }
  }, [activeRoom, soundEnabled, isAdmin, playSound, messageSoundProfile, pendingSoundProfile, user?.display_name])

  const sendMessage = () => {
    if (!input.trim() || !connected) return
    const target = (isAdmin || isProvider) ? messageTarget : 'everyone'
    wsRef.current.send(input.trim(), target)
    setInput('')
    if (isAdmin || isProvider) setMessageTarget('everyone')
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
    if (!selectedProvider) {
      setError('Please select a provider first.')
      setTimeout(() => setError(''), 3000)
      return
    }
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-provider/', {
        provider_id: selectedProvider,
      })
      setActiveRoom(res.data)
      setSelectedProvider('')
      setInviteMsg('Provider invited successfully!')
      setTimeout(() => setInviteMsg(''), 3000)
      api.get('/chat/rooms/').then(r => setRooms(r.data))
    } catch {
      setError('Failed to invite provider.')
      setTimeout(() => setError(''), 3000)
    }
  }

  const inviteClientByDropdown = async () => {
    if (!selectedClient) {
      setError('Please select a client first.')
      setTimeout(() => setError(''), 3000)
      return
    }
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-client/', {
        client_id: selectedClient,
      })
      setActiveRoom(res.data)
      setSelectedClient('')
      setInviteClientMsg('✅ Client added successfully!')
      setTimeout(() => setInviteClientMsg(''), 3000)
      api.get('/chat/rooms/').then(r => setRooms(r.data))
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add client.'
      setError(msg)
      setTimeout(() => setError(''), 3000)
    }
  }

  const inviteClientByPhone = async () => {
    if (!invitePhone.trim()) return
    try {
      const res = await api.post('/chat/rooms/' + activeRoom.id + '/invite-client/', {
        phone_number: invitePhone.trim()
      })
      setActiveRoom(res.data)
      setInvitePhone('')
      setInviteClientMsg('✅ Client invited successfully!')
      setTimeout(() => setInviteClientMsg(''), 3000)
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to invite client.'
      setInviteClientMsg('🚫 ' + msg)
      setTimeout(() => setInviteClientMsg(''), 4000)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const statusColor = (s) => {
    if (s === 'active') return '#1a7a4a'
    if (s === 'negotiating') return '#BA7517'
    return '#888'
  }

  const statusLabel = (s) => {
    if (s === 'active') return '● Active'
    if (s === 'negotiating') return '● Negotiating'
    return '● Closed'
  }

  const getClientDisplay = (room) => {
    return room?.client?.display_name || room?.client || 'client'
  }

  const isImageFile = (filename) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)
  }

  const targetLabel = (target) => {
    if (target === 'client')   return { text: '👤 Client only',   color: '#1a7a4a', bg: '#e6f4ed' }
    if (target === 'provider') return { text: '🔧 Provider only', color: '#BA7517', bg: '#fff3e0' }
    if (target === 'admin')    return { text: '🔑 Admin only',    color: '#1a56a0', bg: '#eef3fc' }
    return null
  }

  const totalPending = pendingMessages.length + pendingFiles.length

  if (!activeRoom) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingText}>Loading your chat rooms...</div>
      </div>
    )
  }

  return (
    <div style={styles.app}>

      {showSidebar && (
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={styles.logo}>TutorJamesConnect</div>
            <div style={styles.logoSub}>Trusted globally for academic excellence</div>
          </div>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>{user?.display_name?.[0]?.toUpperCase() || 'U'}</div>
            <div>
              <div style={styles.userName}>{user?.display_name || 'User'}</div>
              <div style={styles.userRole}>{user?.role || 'client'}</div>
            </div>
          </div>
          <div style={styles.roomsLabel}>CHAT ROOMS</div>
          <div style={styles.roomList}>
            {rooms.length === 0 ? (
              <div style={styles.noRooms}>No chat rooms yet</div>
            ) : (
              rooms.map((room) => {
                const unread = unreadCounts[room.id] || 0
                const isActive = activeRoom?.id === room.id
                return (
                  <div
                    key={room.id}
                    style={{
                      ...styles.roomItem,
                      background: isActive ? '#1a56a0' : 'transparent',
                      color: isActive ? '#fff' : '#1a1a1a',
                    }}
                    onClick={() => {
                      setActiveRoom(room)
                      setUnreadCounts(prev => ({ ...prev, [room.id]: 0 }))
                    }}
                  >
                    <div style={styles.roomItemTop}>
                      <span style={styles.roomName}>{room.name}</span>
                      {unread > 0 && !isActive && (
                        <span style={styles.unreadBadge}>
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                    <div style={{ ...styles.roomSub, color: isActive ? '#BDD7F5' : '#888' }}>
                      {getClientDisplay(room)} &nbsp;·&nbsp;
                      <span style={{ color: statusColor(room.status) }}>{statusLabel(room.status)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <button style={styles.logoutBtn} onClick={logout}>Sign Out</button>
        </div>
      )}

      <div style={styles.main}>
        <div style={styles.chatHeader}>
          <div style={styles.chatHeaderLeft}>
            <button style={styles.menuBtn} onClick={() => setShowSidebar(!showSidebar)}>☰</button>
            {isAdmin && (
              <button style={styles.menuBtn} onClick={() => setShowAdminPanel(!showAdminPanel)}>
                ⚙️
                {totalPending > 0 && (
                  <span style={styles.adminBadge}>{totalPending}</span>
                )}
              </button>
            )}
            <div>
              <div style={styles.chatTitle}>{activeRoom.name}</div>
              <div style={styles.chatSub}>
                Client: {getClientDisplay(activeRoom)} &nbsp;·&nbsp;
                <span style={{ color: statusColor(activeRoom.status) }}>{statusLabel(activeRoom.status)}</span>
              </div>
            </div>
          </div>
          <div style={styles.chatHeaderRight}>
            <button
              style={styles.soundBtn}
              onClick={toggleSound}
              title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
            <div style={styles.headerBadge}>{isAdmin ? '🔑 Admin' : 'Room #' + activeRoom.id}</div>
          </div>
        </div>

        {error && <div style={styles.errorBanner}>🚫 {error}</div>}

        <div style={styles.messages}>
          {messages.length === 0 && connected && (
            <div style={styles.emptyChat}>No messages yet. Say hello! 👋</div>
          )}
          {messages.map((msg, idx) => {

            if (msg.type === 'system') {
              return <div key={msg.id || idx} style={styles.systemMsg}>{msg.message}</div>
            }

            if (msg.type === 'file') {
              const isImg     = isImageFile(msg.file_name)
              const isPending = msg.status === 'pending'
              return (
                <div key={msg.id || idx} style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
                  <div style={{ ...styles.msgAvatar, background: '#BA7517' }}>
                    {msg.sender?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ maxWidth: '65%' }}>
                    <div style={styles.msgSender}>{msg.sender}</div>
                    <div style={{
                      ...styles.fileBubble,
                      border: isPending ? '1.5px solid #f0d080' : '1px solid #e5e5e5',
                      background: isPending ? '#fffdf0' : '#fff',
                    }}>
                      {isPending && (
                        <div style={{ fontSize: 11, color: '#BA7517', fontWeight: 600, marginBottom: 6 }}>
                          ⏳ Awaiting admin approval
                        </div>
                      )}
                      <div style={styles.fileBubbleHeader}>
                        <span style={{ fontSize: 22 }}>{isImg ? '🖼️' : '📄'}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={styles.fileBubbleName}>{msg.file_name}</div>
                          <div style={styles.fileBubbleMeta}>{msg.file_size}</div>
                        </div>
                      </div>
                      {isImg && msg.file_url && (
                        <img
                          src={msg.file_url}
                          alt={msg.file_name}
                          style={{ width: '100%', borderRadius: 8, marginTop: 8, maxHeight: 200, objectFit: 'cover' }}
                        />
                      )}
                      {msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" style={styles.fileDl}>
                          Download
                        </a>
                      )}
                      {isAdmin && isPending && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button
                            style={styles.inlineApproveBtn}
                            onClick={async () => {
                              try {
                                await api.post('/chat/admin/files/' + msg.file_id + '/approve/')
                                setMessages(prev => prev.map(m =>
                                  m.id === msg.id ? { ...m, status: 'approved' } : m
                                ))
                                setPendingFiles(prev => prev.filter(f => f.id !== msg.file_id))
                              } catch { setError('Failed to approve file.') }
                            }}
                          >✓ Approve</button>
                          <button
                            style={styles.inlineRejectBtn}
                            onClick={async () => {
                              try {
                                await api.post('/chat/admin/files/' + msg.file_id + '/reject/')
                                setMessages(prev => prev.filter(m => m.id !== msg.id))
                                setPendingFiles(prev => prev.filter(f => f.id !== msg.file_id))
                              } catch { setError('Failed to reject file.') }
                            }}
                          >✕ Reject</button>
                        </div>
                      )}
                    </div>
                    <div style={{ ...styles.msgTime, textAlign: 'left' }}>{msg.time}</div>
                  </div>
                </div>
              )
            }

            const isMe       = msg.sender === user?.display_name
            const isAdminMsg = msg.role === 'admin'
            const isFlagged  = msg.status === 'pending'
            const tLabel     = (isAdmin || isProvider) ? targetLabel(msg.target) : null

            return (
              <div key={msg.id || idx} style={{ ...styles.msgRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                {!isMe && (
                  <div style={{ ...styles.msgAvatar, background: isAdminMsg ? '#1a56a0' : '#1a7a4a' }}>
                    {msg.sender?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div style={{ maxWidth: '65%' }}>
                  {!isMe && <div style={styles.msgSender}>{msg.sender}</div>}
                  <div style={{
                    ...styles.bubble,
                    background: isFlagged ? '#fff8e1' : isMe ? '#1a56a0' : isAdminMsg ? '#f0f4ff' : '#f0fff6',
                    color: isMe && !isFlagged ? '#fff' : '#1a1a1a',
                    border: isFlagged ? '1.5px solid #f0d080' : 'none',
                    borderBottomRightRadius: isMe ? '4px' : '16px',
                    borderBottomLeftRadius:  isMe ? '16px' : '4px',
                  }}>
                    {isFlagged && (
                      <div style={{ fontSize: 11, color: '#BA7517', fontWeight: 600, marginBottom: 4 }}>
                        ⚠️ Flagged — awaiting approval
                      </div>
                    )}
                    {msg.body}
                    {isAdmin && isFlagged && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button
                          style={styles.inlineApproveBtn}
                          onClick={async () => {
                            try {
                              await api.post('/chat/admin/messages/' + msg.id + '/approve/')
                              setMessages(prev => prev.map(m =>
                                m.id === msg.id ? { ...m, status: 'approved' } : m
                              ))
                              setPendingMessages(prev => prev.filter(p => p.id !== msg.id))
                            } catch { setError('Failed to approve message.') }
                          }}
                        >✓ Approve</button>
                        <button
                          style={styles.inlineRejectBtn}
                          onClick={async () => {
                            try {
                              await api.post('/chat/admin/messages/' + msg.id + '/reject/')
                              setMessages(prev => prev.filter(m => m.id !== msg.id))
                              setPendingMessages(prev => prev.filter(p => p.id !== msg.id))
                            } catch { setError('Failed to reject message.') }
                          }}
                        >✕ Reject</button>
                      </div>
                    )}
                  </div>
                  {tLabel && (
                    <div style={{
                      display: 'inline-block',
                      fontSize: 10,
                      fontWeight: 600,
                      color: tLabel.color,
                      background: tLabel.bg,
                      borderRadius: 10,
                      padding: '2px 8px',
                      marginTop: 3,
                      marginLeft: isMe ? 0 : 4,
                    }}>
                      {tLabel.text}
                    </div>
                  )}
                  <div style={{ ...styles.msgTime, textAlign: isMe ? 'right' : 'left' }}>
                    {msg.time} {isMe && !isFlagged && '✓✓'}
                  </div>
                </div>
                {isMe && (
                  <div style={{ ...styles.msgAvatar, background: isAdmin ? '#1a56a0' : '#1a7a4a' }}>
                    {user?.display_name?.[0]?.toUpperCase() || 'Y'}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {activeRoom.status !== 'closed' && user?.role === 'client' && (
          <div style={styles.inviteClientBar}>
            <input
              style={styles.inviteClientInput}
              placeholder="Invite a friend e.g. +96512345678"
              value={invitePhone}
              onChange={e => setInvitePhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') inviteClientByPhone() }}
            />
            <button style={styles.inviteClientBtn} onClick={inviteClientByPhone}>Invite</button>
          </div>
        )}
        {inviteClientMsg && user?.role === 'client' && (
          <div style={{
            textAlign: 'center', fontSize: 12, padding: '4px 20px',
            color: inviteClientMsg.startsWith('✅') ? '#1a7a4a' : '#a0251a',
            background: inviteClientMsg.startsWith('✅') ? '#e6f4ed' : '#fae6e6',
          }}>
            {inviteClientMsg}
          </div>
        )}

        <div style={styles.inputArea}>
          {/* Target selector — admin and provider only */}
          {(isAdmin || isProvider) && activeRoom.status !== 'closed' && (
            <div style={styles.targetRow}>
              <span style={styles.targetLabel}>Send to:</span>
              {(isAdmin ? [
                { value: 'everyone', label: '🌐 Everyone' },
                { value: 'client',   label: '👤 Client only' },
                { value: 'provider', label: '🔧 Provider only' },
              ] : [
                { value: 'everyone', label: '🌐 Everyone' },
                { value: 'admin',    label: '🔑 Admin only' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  style={{
                    ...styles.targetBtn,
                    background:  messageTarget === opt.value ? '#1a56a0' : '#f0f0f0',
                    color:       messageTarget === opt.value ? '#fff' : '#555',
                    borderColor: messageTarget === opt.value ? '#1a56a0' : '#ddd',
                    fontWeight:  messageTarget === opt.value ? 700 : 400,
                  }}
                  onClick={() => setMessageTarget(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div style={styles.inputRow}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              disabled={!filesEnabled || !connected}
            />
            <button
              style={{ ...styles.attachBtn, opacity: filesEnabled && connected ? 1 : 0.4 }}
              title={filesEnabled ? 'Attach file' : 'File sharing disabled'}
              onClick={() => filesEnabled && connected && fileInputRef.current?.click()}
            >📎</button>
            <textarea
              style={{
                ...styles.input,
                borderColor: messageTarget === 'client'   ? '#1a7a4a'
                           : messageTarget === 'provider' ? '#BA7517'
                           : messageTarget === 'admin'    ? '#1a56a0'
                           : '#ddd',
              }}
              placeholder={
                connected
                  ? messageTarget === 'client'   ? 'Message to client only...'
                  : messageTarget === 'provider' ? 'Message to provider only...'
                  : messageTarget === 'admin'    ? 'Private message to admin...'
                  : 'Type a message...'
                  : 'Connecting...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={!connected}
            />
            <button
              style={input.trim() && connected ? styles.sendBtn : styles.sendBtnDisabled}
              onClick={sendMessage}
              disabled={!input.trim() || !connected}
            >➤</button>
          </div>
          <div style={styles.inputHint}>
            {connected ? '● Connected · Press Enter to send' : '● Connecting to room...'}
          </div>
        </div>
      </div>

      {isAdmin && showAdminPanel && (
        <div style={styles.adminPanel}>
          <div style={styles.adminHeader}>
            <div style={styles.adminTitle}>
              Admin Controls
              {totalPending > 0 && (
                <span style={{ marginLeft: 8, background: '#e53e3e', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10 }}>
                  {totalPending}
                </span>
              )}
            </div>
            <button style={styles.closePanel} onClick={() => setShowAdminPanel(false)}>✕</button>
          </div>

          {/* Room Members */}
          <div style={styles.panelSection}>
            <div style={styles.panelLabel}>ROOM MEMBERS</div>
            <div style={styles.memberRow}>
              <div style={{ ...styles.memberAv, background: '#1a56a0' }}>A</div>
              <div>
                <div style={styles.memberName}>Admin</div>
                <div style={styles.memberRole}>admin</div>
              </div>
            </div>
            <div style={styles.memberRow}>
              <div style={{ ...styles.memberAv, background: '#1a7a4a' }}>C</div>
              <div>
                <div style={styles.memberName}>{getClientDisplay(activeRoom)}</div>
                <div style={styles.memberRole}>client</div>
              </div>
            </div>
            {(activeRoom.extra_clients || []).map(c => (
              <div key={c.id} style={styles.memberRow}>
                <div style={{ ...styles.memberAv, background: '#1a7a4a' }}>C</div>
                <div style={{ flex: 1 }}>
                  <div style={styles.memberName}>{c.display_name}</div>
                  <div style={styles.memberRole}>client (invited)</div>
                </div>
                <button style={styles.removeBtn} onClick={async () => {
                  try {
                    const res = await api.post('/chat/rooms/' + activeRoom.id + '/remove-client/', { client_id: c.id })
                    setActiveRoom(res.data)
                    api.get('/chat/rooms/').then(r => setRooms(r.data))
                  } catch {
                    setError('Failed to remove client.')
                    setTimeout(() => setError(''), 3000)
                  }
                }}>✕</button>
              </div>
            ))}
            {(activeRoom.providers || []).map(p => (
              <div key={p.id} style={styles.memberRow}>
                <div style={{ ...styles.memberAv, background: '#BA7517' }}>P</div>
                <div style={{ flex: 1 }}>
                  <div style={styles.memberName}>{p.display_name}</div>
                  <div style={styles.memberRole}>provider</div>
                </div>
                <button style={styles.removeBtn} onClick={async () => {
                  try {
                    const res = await api.post('/chat/rooms/' + activeRoom.id + '/remove-provider/', { provider_id: p.id })
                    setActiveRoom(res.data)
                    api.get('/chat/rooms/').then(r => setRooms(r.data))
                  } catch {
                    setError('Failed to remove provider.')
                    setTimeout(() => setError(''), 3000)
                  }
                }}>✕</button>
              </div>
            ))}

            <div style={styles.panelLabel}>INVITE PROVIDER</div>
            <select style={styles.providerSelect} value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
              <option value="">Select a provider to invite</option>
              {availableProviders
                .filter(p => !(activeRoom.providers || []).find(ap => ap.id === p.id))
                .map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)
              }
            </select>
            <button style={styles.inviteBtn} onClick={inviteProvider}>+ Invite Provider</button>
            {inviteMsg && <div style={styles.inviteSuccess}>{inviteMsg}</div>}

            <div style={{ ...styles.panelLabel, marginTop: 12 }}>INVITE CLIENT</div>
            <select style={styles.providerSelect} value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
              <option value="">Select a client to add</option>
              {availableClients
                .filter(c => c.id !== activeRoom.client?.id && !(activeRoom.extra_clients || []).find(ec => ec.id === c.id))
                .map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)
              }
            </select>
            <button style={styles.inviteBtn} onClick={inviteClientByDropdown}>+ Add Client</button>
            {inviteClientMsg && <div style={styles.inviteSuccess}>{inviteClientMsg}</div>}
          </div>

          {/* File Settings */}
          <div style={styles.panelSection}>
            <div style={styles.panelLabel}>FILE SETTINGS</div>
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>File Sharing</div>
                <div style={styles.toggleSub}>Enable/disable for room</div>
              </div>
              <div style={{ ...styles.toggle, background: filesEnabled ? '#1a56a0' : '#ccc' }}
                onClick={() => { const val = !filesEnabled; setFilesEnabled(val); updateSetting('files_enabled', val) }}>
                <div style={{ ...styles.toggleKnob, transform: filesEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
              </div>
            </div>
            <div style={{ ...styles.toggleRow, marginTop: 12 }}>
              <div>
                <div style={styles.toggleLabel}>Provider → Client</div>
                <div style={styles.toggleSub}>ON = admin must approve</div>
              </div>
              <div style={{ ...styles.toggle, background: providerNeedsApproval ? '#1a56a0' : '#ccc' }}
                onClick={() => { const val = !providerNeedsApproval; setProviderNeedsApproval(val); updateSetting('provider_files_need_approval', val) }}>
                <div style={{ ...styles.toggleKnob, transform: providerNeedsApproval ? 'translateX(18px)' : 'translateX(2px)' }} />
              </div>
            </div>
            <div style={{ ...styles.toggleRow, marginTop: 12 }}>
              <div>
                <div style={styles.toggleLabel}>Client → Provider</div>
                <div style={styles.toggleSub}>ON = admin must approve</div>
              </div>
              <div style={{ ...styles.toggle, background: clientNeedsApproval ? '#1a56a0' : '#ccc' }}
                onClick={() => { const val = !clientNeedsApproval; setClientNeedsApproval(val); updateSetting('client_files_need_approval', val) }}>
                <div style={{ ...styles.toggleKnob, transform: clientNeedsApproval ? 'translateX(18px)' : 'translateX(2px)' }} />
              </div>
            </div>
            {activeRoom.status !== 'closed' ? (
              <button style={{ ...styles.closeRoomBtn, marginTop: 14 }}
                onClick={async () => {
                  if (!window.confirm('Are you sure you want to close this room?')) return
                  try {
                    const res = await api.post('/chat/rooms/' + activeRoom.id + '/close/')
                    setActiveRoom(res.data)
                    api.get('/chat/rooms/').then(r => setRooms(r.data))
                  } catch { setError('Failed to close room.') }
                }}>
                🔒 Close Room
              </button>
            ) : (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={styles.roomClosedBadge}>🔒 This room is closed</div>
                <button style={styles.deleteRoomBtn}
                  onClick={async () => {
                    if (!window.confirm('Permanently delete this room? This cannot be undone.')) return
                    try {
                      await api.delete('/chat/rooms/' + activeRoom.id + '/delete/')
                      const res = await api.get('/chat/rooms/')
                      setRooms(res.data)
                      if (res.data.length > 0) setActiveRoom(res.data[0])
                    } catch { setError('Failed to delete room.') }
                  }}>
                  🗑 Delete Room
                </button>
              </div>
            )}
          </div>

          {/* Sound Settings */}
          <div style={styles.panelSection}>
            <div style={styles.panelLabel}>NOTIFICATION SOUNDS</div>
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Sound Alerts</div>
                <div style={styles.toggleSub}>Play sound on new message</div>
              </div>
              <div style={{ ...styles.toggle, background: soundEnabled ? '#1a56a0' : '#ccc' }} onClick={toggleSound}>
                <div style={{ ...styles.toggleKnob, transform: soundEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
              </div>
            </div>
            {soundEnabled && (
              <>
                <div style={{ marginTop: 14 }}>
                  <div style={styles.soundPickerTitle}>💬 Message Sound</div>
                  {SOUND_PROFILES.map(profile => (
                    <div
                      key={profile.id}
                      style={{
                        ...styles.soundOption,
                        background: messageSoundProfile === profile.id ? '#eef3fc' : 'transparent',
                        border: messageSoundProfile === profile.id ? '1.5px solid #1a56a0' : '1.5px solid transparent',
                      }}
                      onClick={() => changeMessageSoundProfile(profile.id)}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: messageSoundProfile === profile.id ? '#1a56a0' : '#333' }}>
                          {profile.label}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>{profile.description}</div>
                      </div>
                      <button
                        style={styles.previewBtn}
                        onClick={(e) => { e.stopPropagation(); playSound('message', profile.id) }}
                      >▶</button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={styles.soundPickerTitle}>⏳ Pending Approval Sound</div>
                  {SOUND_PROFILES.map(profile => (
                    <div
                      key={profile.id}
                      style={{
                        ...styles.soundOption,
                        background: pendingSoundProfile === profile.id ? '#fff8e1' : 'transparent',
                        border: pendingSoundProfile === profile.id ? '1.5px solid #BA7517' : '1.5px solid transparent',
                      }}
                      onClick={() => changePendingSoundProfile(profile.id)}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: pendingSoundProfile === profile.id ? '#BA7517' : '#333' }}>
                          {profile.label}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>{profile.description}</div>
                      </div>
                      <button
                        style={{ ...styles.previewBtn, borderColor: '#BA7517', color: '#BA7517' }}
                        onClick={(e) => { e.stopPropagation(); playSound('pending', profile.id) }}
                      >▶</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pending Messages */}
          <div style={styles.panelSection}>
            <div style={styles.panelLabel}>
              PENDING MESSAGES
              {pendingMessages.length > 0 && <span style={styles.pendingCount}> ({pendingMessages.length})</span>}
            </div>
            {pendingMessages.length === 0 ? (
              <div style={styles.noPending}>No pending messages</div>
            ) : (
              pendingMessages.map((p) => (
                <div key={p.id} style={styles.pendingItem}>
                  <div style={styles.pendingFrom}>{p.sender}</div>
                  <div style={styles.pendingText}>"{p.body || p.text}"</div>
                  <div style={styles.pendingReason}>⚠️ {p.reason}</div>
                  <div style={styles.pendingBtns}>
                    <button style={styles.approveBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/messages/' + p.id + '/approve/')
                        setPendingMessages(prev => prev.filter(x => x.id !== p.id))
                        setMessages(prev => prev.map(m => m.id === p.id ? { ...m, status: 'approved' } : m))
                      } catch { setError('Failed to approve message.') }
                    }}>✓ Approve</button>
                    <button style={styles.rejectBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/messages/' + p.id + '/reject/')
                        setPendingMessages(prev => prev.filter(x => x.id !== p.id))
                        setMessages(prev => prev.filter(m => m.id !== p.id))
                      } catch { setError('Failed to reject message.') }
                    }}>✕ Reject</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pending Files */}
          <div style={{ ...styles.panelSection, flex: 1, overflowY: 'auto' }}>
            <div style={styles.panelLabel}>
              PENDING FILES
              {pendingFiles.length > 0 && <span style={styles.pendingCount}> ({pendingFiles.length})</span>}
            </div>
            {pendingFiles.length === 0 ? (
              <div style={styles.noPending}>No pending files</div>
            ) : (
              pendingFiles.map((f) => (
                <div key={f.id} style={styles.pendingItem}>
                  <div style={styles.pendingFrom}>{f.sender}</div>
                  <div style={styles.pendingText}>{isImageFile(f.file_name) ? '🖼️' : '📄'} {f.file_name}</div>
                  <div style={styles.pendingReason}>📦 {f.file_size}</div>
                  <div style={styles.pendingBtns}>
                    <button style={styles.approveBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/files/' + f.id + '/approve/')
                        setPendingFiles(prev => prev.filter(x => x.id !== f.id))
                        setMessages(prev => prev.map(m => m.id === 'file_pending_' + f.id ? { ...m, status: 'approved' } : m))
                      } catch { setError('Failed to approve file.') }
                    }}>✓ Approve</button>
                    <button style={styles.rejectBtn} onClick={async () => {
                      try {
                        await api.post('/chat/admin/files/' + f.id + '/reject/')
                        setPendingFiles(prev => prev.filter(x => x.id !== f.id))
                        setMessages(prev => prev.filter(m => m.id !== 'file_pending_' + f.id))
                      } catch { setError('Failed to reject file.') }
                    }}>✕ Reject</button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </div>
  )
}

const styles = {
  app: { display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif', background: '#f5f5f5', overflow: 'hidden' },
  loadingScreen: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' },
  loadingText: { fontSize: '16px', color: '#888' },
  sidebar: { width: '260px', background: '#ffffff', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sidebarHeader: { padding: '20px 16px 12px', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)' },
  logo: { color: '#ffffff', fontSize: '15px', fontWeight: '700' },
  logoSub: { color: '#BDD7F5', fontSize: '10px', marginTop: '4px', lineHeight: '1.4' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#1a56a0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', flexShrink: 0 },
  userName: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' },
  userRole: { fontSize: '11px', color: '#888', textTransform: 'capitalize' },
  roomsLabel: { fontSize: '10px', fontWeight: '600', color: '#888', letterSpacing: '0.08em', padding: '12px 16px 6px' },
  roomList: { flex: 1, overflowY: 'auto', padding: '4px 8px' },
  noRooms: { fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '20px 0' },
  roomItem: { padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', transition: 'background 0.15s' },
  roomItemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  roomName: { fontSize: '13px', fontWeight: '600' },
  roomSub: { fontSize: '11px', marginTop: '3px' },
  unreadBadge: { background: '#e53e3e', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' },
  adminBadge: { position: 'absolute', top: '-4px', right: '-4px', background: '#e53e3e', color: '#fff', fontSize: '9px', fontWeight: '700', padding: '1px 4px', borderRadius: '8px', minWidth: '14px', textAlign: 'center' },
  logoutBtn: { margin: '12px', padding: '9px', border: '1px solid #ddd', borderRadius: '8px', background: 'none', color: '#888', fontSize: '13px', cursor: 'pointer', textAlign: 'center' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  chatHeader: { padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  chatHeaderLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  chatHeaderRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  menuBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#555', padding: '0 4px', position: 'relative' },
  soundBtn: { background: 'none', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', padding: '4px 8px', color: '#555', lineHeight: 1 },
  chatTitle: { fontSize: '15px', fontWeight: '600', color: '#1a1a1a' },
  chatSub: { fontSize: '12px', color: '#888', marginTop: '2px' },
  headerBadge: { background: '#f0f4ff', color: '#1a56a0', fontSize: '12px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px' },
  errorBanner: { background: '#fae6e6', color: '#a0251a', padding: '8px 20px', fontSize: '13px', textAlign: 'center', borderBottom: '1px solid #f0c0c0' },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  emptyChat: { textAlign: 'center', fontSize: '14px', color: '#aaa', marginTop: '40px' },
  systemMsg: { textAlign: 'center', fontSize: '12px', color: '#888', background: '#f5f5f5', padding: '6px 16px', borderRadius: '20px', alignSelf: 'center' },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: '8px' },
  msgAvatar: { width: '28px', height: '28px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  msgSender: { fontSize: '11px', color: '#888', marginBottom: '3px', paddingLeft: '4px' },
  bubble: { padding: '10px 14px', borderRadius: '16px', fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' },
  msgTime: { fontSize: '10px', color: '#aaa', marginTop: '4px', paddingLeft: '4px', paddingRight: '4px' },
  fileBubble: { background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '10px 14px' },
  fileBubbleHeader: { display: 'flex', alignItems: 'center', gap: '10px' },
  fileBubbleName: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a', wordBreak: 'break-all' },
  fileBubbleMeta: { fontSize: '11px', color: '#888', marginTop: '2px' },
  fileDl: { display: 'block', marginTop: '10px', fontSize: '12px', color: '#1a56a0', fontWeight: '600', textDecoration: 'none' },
  inputArea: { padding: '12px 20px 16px', background: '#fff', borderTop: '1px solid #e5e5e5' },
  targetRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  targetLabel: { fontSize: 11, color: '#888', fontWeight: 600, marginRight: 2 },
  targetBtn: { fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s' },
  inputRow: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
  attachBtn: { background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 10px', fontSize: '16px', cursor: 'pointer', flexShrink: 0 },
  input: { flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '14px', outline: 'none', resize: 'none', fontFamily: 'Arial, sans-serif', lineHeight: '1.5', transition: 'border-color 0.2s' },
  sendBtn: { background: '#1a56a0', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '18px', cursor: 'pointer', flexShrink: 0 },
  sendBtnDisabled: { background: '#ddd', color: '#aaa', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '18px', cursor: 'not-allowed', flexShrink: 0 },
  inputHint: { fontSize: '11px', color: '#bbb', marginTop: '6px', textAlign: 'center' },
  inviteClientBar: { display: 'flex', gap: 8, padding: '8px 20px', background: '#f9f9f9', borderTop: '1px solid #f0f0f0' },
  inviteClientInput: { flex: 1, padding: '7px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none' },
  inviteClientBtn: { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#1a56a0', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  adminPanel: { width: '260px', background: '#ffffff', borderLeft: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  adminHeader: { padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)' },
  adminTitle: { fontSize: '14px', fontWeight: '600', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 },
  closePanel: { background: 'none', border: 'none', color: '#BDD7F5', fontSize: '16px', cursor: 'pointer' },
  panelSection: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  panelLabel: { fontSize: '10px', fontWeight: '600', color: '#888', letterSpacing: '0.08em', marginBottom: '10px' },
  pendingCount: { color: '#e53e3e', fontWeight: '700' },
  memberRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  memberAv: { width: '28px', height: '28px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  memberName: { fontSize: '13px', fontWeight: '600', color: '#1a1a1a' },
  memberRole: { fontSize: '11px', color: '#888', textTransform: 'capitalize' },
  providerSelect: { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '12px', outline: 'none', background: '#fff', cursor: 'pointer', marginBottom: '6px', marginTop: '6px', boxSizing: 'border-box' },
  inviteBtn: { width: '100%', padding: '7px', border: '1px solid #1a56a0', borderRadius: '8px', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  inviteSuccess: { fontSize: '12px', color: '#1a7a4a', fontWeight: '600', marginTop: '8px', textAlign: 'center' },
  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: '12px', color: '#444' },
  toggleSub: { fontSize: '10px', color: '#aaa', marginTop: '1px' },
  toggle: { width: '38px', height: '20px', borderRadius: '20px', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleKnob: { position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'transform 0.2s' },
  soundPickerTitle: { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #f0f0f0' },
  soundOption: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, marginBottom: 3, cursor: 'pointer' },
  previewBtn: { background: 'none', border: '1px solid #1a56a0', borderRadius: 6, padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: '#1a56a0', flexShrink: 0 },
  pendingItem: { background: '#fff8e1', border: '1px solid #f0d080', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' },
  pendingFrom: { fontSize: '11px', fontWeight: '600', color: '#444', marginBottom: '3px' },
  pendingText: { fontSize: '12px', color: '#1a1a1a', marginBottom: '4px', wordBreak: 'break-all' },
  pendingReason: { fontSize: '11px', color: '#BA7517', marginBottom: '6px' },
  pendingBtns: { display: 'flex', gap: '6px' },
  approveBtn: { flex: 1, padding: '4px', border: '1px solid #1a7a4a', borderRadius: '6px', background: 'none', color: '#1a7a4a', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  rejectBtn: { flex: 1, padding: '4px', border: '1px solid #e53e3e', borderRadius: '6px', background: 'none', color: '#e53e3e', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  noPending: { fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '10px 0' },
  closeRoomBtn: { width: '100%', padding: '7px', marginTop: '10px', border: '1px solid #e53e3e', borderRadius: '8px', background: 'none', color: '#e53e3e', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  roomClosedBadge: { width: '100%', padding: '7px', borderRadius: '8px', background: '#f5f5f5', color: '#888', fontSize: '12px', fontWeight: '600', textAlign: 'center', boxSizing: 'border-box' },
  removeBtn: { background: 'none', border: '1px solid #e53e3e', borderRadius: '6px', color: '#e53e3e', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '2px 7px', flexShrink: 0 },
  inlineApproveBtn: { flex: 1, padding: '4px 8px', border: '1px solid #1a7a4a', borderRadius: '6px', background: '#e6f4ed', color: '#1a7a4a', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  inlineRejectBtn:  { flex: 1, padding: '4px 8px', border: '1px solid #e53e3e', borderRadius: '6px', background: '#fae6e6', color: '#e53e3e', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  deleteRoomBtn:    { width: '100%', padding: '7px', border: '1px solid #888', borderRadius: '8px', background: '#f5f5f5', color: '#555', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
}