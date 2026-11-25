import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Signup() {
  const { signUp } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) return setError('Les deux mots de passe sont différents.')
    setLoading(true)
    try {
      await signUp(username, password)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={onSubmit}>
        <h1>Créer un compte</h1>
        <label>Pseudo</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} required autoComplete="username" />
        <label>Mot de passe (6 caractères min.)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        <label>Confirmer le mot de passe</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        <p className="muted">⚠️ Il n&apos;y a pas d&apos;e-mail : si tu oublies ton mot de passe, il ne pourra pas être récupéré.</p>
        {error && <div className="error">{error}</div>}
        <button className="full" disabled={loading}>{loading ? '…' : "S'inscrire"}</button>
        <div className="links"><span className="muted">Déjà un compte ?</span><Link to="/login">Se connecter</Link></div>
      </form>
    </div>
  )
}
