// src/services/api.js
import axios from 'axios'

// ── Auto-detect base URL ───────────────────────────────────────────────────
// Production (HTTPS) → same domain e.g. https://tutorjamesconnect.onrender.com/api
// Development (HTTP) → http://localhost:8000/api
const BASE_URL = window.location.protocol === 'https:'
  ? `${window.location.origin}/api`
  : 'http://localhost:8000/api'

const api = axios.create({
  baseURL: BASE_URL,
})

// Attach token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh token if expired
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const res = await axios.post(
            `${BASE_URL}/accounts/token/refresh/`,
            { refresh }
          )
          localStorage.setItem('access_token', res.data.access)
          error.config.headers.Authorization = `Bearer ${res.data.access}`
          return axios(error.config)
        } catch {
          localStorage.clear()
          window.location.href = '/register/client'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api