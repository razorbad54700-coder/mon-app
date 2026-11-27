import { useEffect, useState } from 'react'
import * as api from '../lib/api'

const blank: api.Game = { name: '', status: 'playing', platform: 'PC', hours: 0, rating: 0, favorite: false, emoji: '🎮', note: '' }

export default function GamesTab() {
  const [games, setGames] = useState<api.Game[]>([])
  const [isPublic, setPublic] = useState(true)
  const [draft, setDraft] = useState<api.Game>(blank)
  const [filter, setFilter] = useState<'all' | api.GameStatus>('all')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.getMyGames().then((r) => { setGames(r.games); setPublic(r.public); setLoaded(true) }).catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur' }))
  }, [])

  async function save(next: api.Game[], pub = isPublic, okText = 'Enregistré ✅') {
    try {
      const r = await api.saveMyGames(next, pub)
      setGames(r.games)
      setPublic(r.public)
      setMsg({ ok: true, text: okText })
      return true
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur' })
      return false
    }
  }

  const shown = games.map((g, i) => ({ g, i })).filter(({ g }) => filter === 'all' || g.status === filter)
  const patch = (i: number, p: Partial<api.Game>) => void save(games.map((g, j) => (j === i ? { ...g, ...p } : g)), isPublic, 'Enregistré ✅')

  return (
    <div>
      <p className="muted">Ta collection s&apos;affiche sur ta carte de profil. Le badge 🎮 Gamer se débloque à 5 jeux.</p>
      <label className="perm"><input type="checkbox" checked={isPublic} onChange={(e) => void save(games, e.target.checked)} /><span>Collection visible par les autres membres</span></label>

      <div className="preview">
        <div className="row">
          <input style={{ width: 64 }} maxLength={4} value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
          <input placeholder="Nom du jeu" maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="grid3" style={{ marginTop: 8 }}>
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as api.GameStatus })}>
            {Object.entries(api.GAME_STATUS_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
          <select value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })}>
            {api.PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input type="number" min={0} max={99999} placeholder="Heures" value={draft.hours || ''} onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) })} />
        </div>
        <input style={{ marginTop: 8 }} placeholder="Note perso (facultatif)" maxLength={120} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <button className="full" disabled={!draft.name.trim() || !loaded} onClick={async () => { if (await save([...games, { ...draft, name: draft.name.trim() }], isPublic, 'Jeu ajouté ✅')) setDraft(blank) }}>+ Ajouter à ma collection</button>
      </div>

      <div className="tabs">
        {(['all', 'playing', 'completed', 'backlog', 'wishlist'] as const).map((f) => (
          <button key={f} className={filter === f ? '' : 'ghost'} onClick={() => setFilter(f)}>{f === 'all' ? `Tous (${games.length})` : api.GAME_STATUS_LABEL[f]}</button>
        ))}
      </div>

      {shown.length === 0 && <p className="muted">Rien ici pour l&apos;instant.</p>}
      {shown.map(({ g, i }) => (
        <div key={g.name} className="quest">
          <div className="row">
            <span style={{ fontSize: 24 }}>{g.emoji}</span>
            <b className="grow ellipsis">{g.name}</b>
            <button className="small ghost" title="Favori" onClick={() => patch(i, { favorite: !g.favorite })}>{g.favorite ? '⭐' : '☆'}</button>
            <button className="small danger" onClick={() => { if (confirm(`Retirer ${g.name} ?`)) void save(games.filter((_, j) => j !== i), isPublic, 'Jeu retiré') }}>✕</button>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select style={{ width: 'auto' }} value={g.status} onChange={(e) => patch(i, { status: e.target.value as api.GameStatus })}>
              {Object.entries(api.GAME_STATUS_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
            <span className="muted">{g.platform} · {g.hours} h</span>
            <span title="Ta note">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="chip" style={{ background: 'none', padding: 0 }} onClick={() => patch(i, { rating: g.rating === n ? 0 : n })}>{n <= g.rating ? '★' : '☆'}</button>)}</span>
          </div>
          {g.note && <div className="muted">{g.note}</div>}
        </div>
      ))}
      {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
    </div>
  )
}
