class ChatWebSocket {
  constructor(roomId, token, onMessage) {
    this.roomId           = roomId
    this.token            = token
    this.onMessage        = onMessage
    this.ws               = null
    this.reconnectTimer   = null
    this.isConnected      = false
    this.intentionalClose = false
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    // ── Auto-detect WebSocket URL ──────────────────────────────────────────
    // In production (HTTPS) → wss://yourdomain.com/ws/...
    // In development (HTTP) → ws://localhost:8000/ws/...
    const isProduction = window.location.protocol === 'https:'
    const host = isProduction
      ? window.location.host
      : 'localhost:8000'
    const protocol = isProduction ? 'wss' : 'ws'
    const url = `${protocol}://${host}/ws/chat/${this.roomId}/?token=${this.token}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.isConnected      = true
      this.intentionalClose = false
      console.log(`Connected to room ${this.roomId}`)
      this.onMessage({ type: 'connected' })
    }

    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      this.onMessage(data)
    }

    this.ws.onclose = () => {
      this.isConnected = false
      if (!this.intentionalClose) {
        console.log('WebSocket closed — reconnecting in 3s...')
        this.reconnectTimer = setTimeout(() => this.connect(), 3000)
      }
    }

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }

  send(body, target = 'everyone', replyToId = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = { body, target }
      if (replyToId) payload.reply_to = replyToId
      this.ws.send(JSON.stringify(payload))
    }
  }

  disconnect() {
    this.intentionalClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) this.ws.close()
  }
}

export default ChatWebSocket