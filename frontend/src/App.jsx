import { Routes, Route, Navigate } from 'react-router-dom'
import RegisterClient from './pages/RegisterClient'
import RegisterProvider from './pages/RegisterProvider'
import LostAccess from './pages/LostAccess'
import RedeemAccess from './pages/RedeemAccess'
import Login from './pages/Login'
import ChatRoom from './pages/ChatRoom'
import AdminDashboard from './pages/AdminDashboard'
import { useAuth } from './context/AuthContext'

function NoRooms() {
  const { logout } = useAuth()
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a56a0, #0d3b6e)' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '16px', textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🕐</div>
        <h2 style={{ color: '#1a1a1a', marginBottom: 8 }}>No rooms yet</h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>You have not been assigned to any chat room yet. Please wait for the admin to assign you.</p>
        <button onClick={logout} style={{ padding: '10px 24px', background: '#1a56a0', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register/client" element={<RegisterClient />} />
      <Route path="/register/provider" element={<RegisterProvider />} />
      <Route path="/lost-access" element={<LostAccess />} />
      <Route path="/access/:token" element={<RedeemAccess />} />
      <Route path="/no-rooms" element={user ? <NoRooms /> : <Navigate to="/login" replace />} />
      <Route
        path="/chat"
        element={user ? <ChatRoom /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/chat/:roomId"
        element={user ? <ChatRoom /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin"
        element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" replace />}
      />
    </Routes>
  )
}

export default App

