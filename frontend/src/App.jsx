// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import RegisterClient from './pages/RegisterClient'
import RegisterProvider from './pages/RegisterProvider'
import LostAccess from './pages/LostAccess'
import RedeemAccess from './pages/RedeemAccess'
import LinkDevice from './pages/LinkDevice'
import ProviderDashboard from './pages/ProviderDashboard'
import Login from './pages/Login'
import ChatRoom from './pages/ChatRoom'
import AdminDashboard from './pages/AdminDashboard'
import { useAuth } from './context/AuthContext'
import RedeemRef from './pages/RedeemRef'

function App() {
  const { user } = useAuth()

  // Smart root redirect — logged in users go straight to their dashboard
  const rootRedirect = () => {
    if (!user) return <Navigate to="/login" replace />
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    if (user.role === 'provider') return <Navigate to="/dashboard" replace />
    return <Navigate to="/chat" replace />
  }

  return (
    <Routes>
      <Route path="/" element={rootRedirect()} />
      <Route path="/login" element={user ? rootRedirect() : <Login />} />
      <Route path="/register/client" element={<RegisterClient />} />
      <Route path="/register/provider" element={<RegisterProvider />} />
      <Route path="/lost-access" element={<LostAccess />} />
      <Route path="/ref/:refCode" element={<RedeemRef />} />
      <Route path="/access/:token" element={<RedeemAccess />} />
      <Route path="/link/:token?" element={<LinkDevice />} />
      <Route
        path="/dashboard"
        element={user ? <ProviderDashboard /> : <Navigate to="/login" replace />}
      />
      <Route path="/no-rooms" element={<Navigate to="/dashboard" replace />} />
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




