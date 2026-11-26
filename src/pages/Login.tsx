import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getServerAddress, setServerAddress } from '../lib/api'

export default function Login() {
  const { login } = useAuth()
  const [address, setAddress] = useState(getServerAddress())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      setServerAddress(address)
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
      setLoading(false)
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={onSubmit}>
        <h1>Content de te revoir !</h1>
        <label>Adresse du serveur</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="http://localhost:3000" required autoCapitalize="none" autoCorrect="off" />
        <label>Pseudo</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
        <label>Mot de passe</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <div className="error">{error}</div>}
        <button className="full" disabled={loading}>{loading ? '…' : 'Connexion'}</button>
        <div className="links">
          <span className="muted">Pas de compte ?</span>
          <Link to="/signup">Créer un compte</Link>
        </div>
      </form>
    </div>
  )
}
