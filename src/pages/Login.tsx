import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn(username, password)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={onSubmit}>
        <h1>Content de te revoir !</h1>
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
