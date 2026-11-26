import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getServerAddress, setServerAddress } from '../lib/api'

export default function Signup() {
  const { register } = useAuth()
  const [address, setAddress] = useState(getServerAddress())
  const [signupCode, setSignupCode] = useState('')
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
      setServerAddress(address)
      await register(username, password, signupCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
      setLoading(false)
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={onSubmit}>
        <h1>Créer un compte</h1>
        <label>Adresse du serveur</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="http://localhost:3000" required autoCapitalize="none" autoCorrect="off" />
        <label>Code d&apos;inscription (donné par l&apos;hôte du serveur)</label>
        <input value={signupCode} onChange={(e) => setSignupCode(e.target.value)} autoCapitalize="characters" />
        <label>Pseudo</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} required autoComplete="username" />
        <label>Mot de passe (6 caractères min.)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        <label>Confirmer le mot de passe</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        <p className="muted">⚠️ Pas d&apos;e-mail : un mot de passe oublié ne peut pas être récupéré.</p>
        {error && <div className="error">{error}</div>}
        <button className="full" disabled={loading}>{loading ? '…' : "S'inscrire"}</button>
        <div className="links"><span className="muted">Déjà un compte ?</span><Link to="/login">Se connecter</Link></div>
      </form>
    </div>
  )
}
