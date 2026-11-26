import { useState } from 'react'
import * as api from '../lib/api'

export default function ServerModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (server: api.ServerInfo) => void
}) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const server = tab === 'create' ? await api.createServer(value) : await api.joinServer(value)
      onDone(server)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h1>{tab === 'create' ? 'Créer un serveur' : 'Rejoindre un serveur'}</h1>
        <div className="row" style={{ marginBottom: 8 }}>
          <button type="button" className={tab === 'create' ? '' : 'ghost'} style={{ flex: 1 }} onClick={() => { setTab('create'); setError(null) }}>Créer</button>
          <button type="button" className={tab === 'join' ? '' : 'ghost'} style={{ flex: 1 }} onClick={() => { setTab('join'); setError(null) }}>Rejoindre</button>
        </div>
        <label>{tab === 'create' ? 'Nom du serveur' : "Code d'invitation"}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={40}
          required
          autoFocus
          autoCapitalize={tab === 'join' ? 'characters' : 'sentences'}
        />
        {error && <div className="error">{error}</div>}
        <button className="full" disabled={busy}>{busy ? '…' : tab === 'create' ? 'Créer' : 'Rejoindre'}</button>
        <button type="button" className="full ghost" onClick={onClose}>Annuler</button>
      </form>
    </div>
  )
}
