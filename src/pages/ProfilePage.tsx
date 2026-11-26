import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { imageToAvatar } from '../lib/api'
import Avatar from '../components/Avatar'
import { FONTS, nameStyle } from '../lib/nameStyle'

export default function ProfilePage() {
  const { profile, update } = useAuth()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [newAvatar, setNewAvatar] = useState<string | null>(null)
  const [color, setColor] = useState(profile?.name_color ?? '#ffffff')
  const [font, setFont] = useState(profile?.name_font ?? 'sans')
  const [effect, setEffect] = useState(profile?.name_effect ?? 'none')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!profile) return null
  const preview = newAvatar ?? profile.avatar_url

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setNewAvatar(await imageToAvatar(file))
      setMsg({ ok: true, text: 'Avatar chargé : clique sur Enregistrer pour valider.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Erreur' })
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await update({
        username,
        bio,
        name_color: color,
        name_font: font,
        name_effect: effect,
        ...(newAvatar ? { avatar: newAvatar } : {}),
      })
      setNewAvatar(null)
      setMsg({ ok: true, text: 'Profil enregistré ✅' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Erreur' })
    }
    setBusy(false)
  }

  return (
    <div className="center">
      <form className="card wide" onSubmit={onSave}>
        <h1>Mon profil</h1>

        <div className="preview">
          <div className="row">
            <Avatar url={preview} name={username || '?'} status={profile.status} size={80} />
            <div style={{ fontSize: 22, ...nameStyle(color, font, effect) }}>{username || 'Pseudo'}</div>
          </div>
          {bio && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{bio}</p>}
        </div>

        <label>Avatar (n&apos;importe quelle image)</label>
        <input type="file" accept="image/*" onChange={onAvatar} />

        <label>Pseudo</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} />

        <div className="grid3">
          <div>
            <label>Couleur</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div>
            <label>Police</label>
            <select value={font} onChange={(e) => setFont(e.target.value)}>
              {Object.keys(FONTS).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Effet</label>
            <select value={effect} onChange={(e) => setEffect(e.target.value)}>
              <option value="none">Aucun</option>
              <option value="glow">Lueur</option>
              <option value="gradient">Dégradé</option>
            </select>
          </div>
        </div>

        <label>Biographie ({bio.length}/190)</label>
        <textarea rows={3} maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} />

        {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}

        <div className="row" style={{ marginTop: 18 }}>
          <button style={{ flex: 1 }} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
          <Link to="/"><button type="button" className="ghost">Retour</button></Link>
        </div>
      </form>
    </div>
  )
}
