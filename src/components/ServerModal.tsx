import { useEffect, useState } from 'react'
import * as api from '../lib/api'
import Avatar from './Avatar'

export default function ServerModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (server: api.ServerInfo) => void
}) {
  const [tab, setTab] = useState<'create' | 'join' | 'discover'>('create')
  const [found, setFound] = useState<api.DiscoverEntry[]>([])
  useEffect(() => {
    if (tab === 'discover') api.discover().then(setFound).catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [tab])
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
          <button type="button" className={tab === 'discover' ? '' : 'ghost'} style={{ flex: 1 }} onClick={() => { setTab('discover'); setError(null) }}>Découvrir</button>
        </div>
        {tab === 'discover' && (
          <div>
            {found.length === 0 && <p className="muted">Aucun serveur public pour l&apos;instant.</p>}
            {found.map((d) => (
              <div key={d.id} className="row" style={{ marginBottom: 10 }}>
                <Avatar url={d.icon_url} name={d.name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellipsis"><b>{d.name}</b> <small className="muted">· {d.memberCount} membres</small></div>
                  <div className="muted ellipsis">{d.description}</div>
                </div>
                <button type="button" className="small" disabled={busy} onClick={async () => { setBusy(true); try { onDone(await api.joinPublic(d.id)) } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); setBusy(false) } }}>{d.joined ? 'Ouvrir' : 'Rejoindre'}</button>
              </div>
            ))}
            {error && <div className="error">{error}</div>}
            <button type="button" className="full ghost" onClick={onClose}>Fermer</button>
          </div>
        )}
        {tab !== 'discover' && <>
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
        </>}
      </form>
    </div>
  )
}
