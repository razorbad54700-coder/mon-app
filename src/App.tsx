import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  const { phase, retry, logout } = useAuth()

  if (phase === 'loading') return <div className="center">Connexion au serveur…</div>

  if (phase === 'unreachable')
    return (
      <div className="center">
        <div className="card">
          <h1>Serveur injoignable</h1>
          <p className="muted">
            Le serveur ne répond pas. Vérifie qu&apos;il est lancé sur le PC de l&apos;hôte, puis réessaie.
          </p>
          <button className="full" onClick={retry}>Réessayer</button>
          <button className="full ghost" onClick={() => void logout()}>Changer de serveur</button>
        </div>
      </div>
    )

  if (phase === 'out')
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
