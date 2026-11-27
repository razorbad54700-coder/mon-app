import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import Avatar from '../components/Avatar'
import { FONTS, nameStyle } from '../lib/nameStyle'
import { SCREEN_PRESETS, setPrefs, usePrefs } from '../lib/prefs'
import { applyVolume } from '../lib/voice'
import { playMessageSound } from '../lib/sounds'

type Tab = 'profile' | 'look' | 'av' | 'screen'
const ACCENTS = ['#7c5cff', '#00b8d9', '#23a55a', '#f0b232', '#f23f43', '#ff4ecd', '#ff7a45']

export default function ProfilePage() {
  const { profile, update } = useAuth()
  const prefs = usePrefs()
  const [tab, setTab] = useState<Tab>('profile')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '')
  const [location, setLocation] = useState('')
  const [csEmoji, setCsEmoji] = useState(profile?.custom_status?.emoji ?? '')
  const [csText, setCsText] = useState(profile?.custom_status?.text ?? '')
  const [links, setLinks] = useState<api.ProfileLink[]>([])
  const [bannerColor, setBannerColor] = useState(profile?.banner_color || '#3a2a8a')
  const [useBannerColor, setUseBannerColor] = useState(Boolean(profile?.banner_color))
  const [newAvatar, setNewAvatar] = useState<string | null | undefined>(undefined)
  const [newBanner, setNewBanner] = useState<string | null | undefined>(undefined)
  const [color, setColor] = useState(profile?.name_color ?? '#ffffff')
  const [font, setFont] = useState(profile?.name_font ?? 'sans')
  const [effect, setEffect] = useState(profile?.name_effect ?? 'none')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    api.getMe().then((u) => { setLocation(u.location); setLinks(u.links) }).catch(() => {})
  }, [])
  useEffect(() => {
    if (tab !== 'av' || !navigator.mediaDevices?.enumerateDevices) return
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {})
  }, [tab])

  if (!profile) return null
  const avatarPreview = newAvatar === undefined ? profile.avatar_url : newAvatar
  const err = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur' })

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await update({
        username, bio, pronouns, location,
        custom_status: csEmoji || csText ? { emoji: csEmoji, text: csText } : null,
        links: links.filter((l) => l.url.trim()),
        banner_color: useBannerColor ? bannerColor : '',
        name_color: color, name_font: font, name_effect: effect,
        ...(newAvatar !== undefined ? { avatar: newAvatar } : {}),
        ...(newBanner !== undefined ? { banner: newBanner } : {}),
      })
      setNewAvatar(undefined)
      setNewBanner(undefined)
      setMsg({ ok: true, text: 'Profil enregistré ✅' })
    } catch (e2) {
      err(e2)
    }
    setBusy(false)
  }

  const mics = devices.filter((d) => d.kind === 'audioinput')
  const cams = devices.filter((d) => d.kind === 'videoinput')
  const bannerStyle = newBanner ? `center/cover url(${newBanner})` : newBanner === undefined && profile.banner_url ? `center/cover url(${profile.banner_url})` : useBannerColor ? bannerColor : 'linear-gradient(90deg, var(--accent), #00e5ff55)'

  return (
    <div className="center">
      <div className="card wide">
        <h1>Réglages</h1>
        <div className="tabs">
          {([['profile', 'Profil'], ['look', 'Apparence'], ['av', 'Audio / Vidéo'], ['screen', 'Partage d’écran']] as [Tab, string][]).map(([id, l]) => (
            <button key={id} className={tab === id ? '' : 'ghost'} onClick={() => { setTab(id); setMsg(null) }}>{l}</button>
          ))}
        </div>

        {tab === 'profile' && (
          <form onSubmit={onSave}>
            <div className="preview" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="banner-img" style={{ background: bannerStyle }} />
              <div style={{ padding: 14 }}>
                <div className="row" style={{ marginTop: -44 }}>
                  <Avatar url={avatarPreview ?? null} name={username || '?'} status={profile.status} size={80} />
                  <div>
                    <div style={{ fontSize: 22, ...nameStyle(color, font, effect) }}>{username || 'Pseudo'}</div>
                    <div className="muted">{pronouns}</div>
                  </div>
                </div>
                {(csEmoji || csText) && <p>{csEmoji} {csText}</p>}
                {bio && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{bio}</p>}
              </div>
            </div>

            <label>Avatar</label>
            <div className="row">
              <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setNewAvatar(await api.imageToAvatar(f)) } catch (x) { err(x) } }} />
              {avatarPreview && <button type="button" className="small ghost" onClick={() => setNewAvatar(null)}>Retirer</button>}
            </div>
            <label>Bannière (image) — ou une couleur ci-dessous</label>
            <div className="row">
              <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setNewBanner(await api.imageToAvatar(f, 640, true)) } catch (x) { err(x) } }} />
              <button type="button" className="small ghost" onClick={() => setNewBanner(null)}>Retirer</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label className="perm" style={{ margin: 0 }}><input type="checkbox" checked={useBannerColor} onChange={(e) => setUseBannerColor(e.target.checked)} /><span>Couleur de bannière</span></label>
              <input type="color" style={{ width: 70 }} value={bannerColor} onChange={(e) => { setBannerColor(e.target.value); setUseBannerColor(true) }} />
            </div>

            <label>Pseudo (tous les caractères sont permis : lettres, emojis, symboles…)</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
            <div className="grid3">
              <div><label>Couleur</label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
              <div><label>Police</label>
                <select value={font} onChange={(e) => setFont(e.target.value)}>{Object.keys(FONTS).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
              <div><label>Effet</label>
                <select value={effect} onChange={(e) => setEffect(e.target.value)}>
                  <option value="none">Aucun</option><option value="glow">Lueur</option><option value="gradient">Dégradé</option>
                </select></div>
            </div>

            <label>Statut personnalisé</label>
            <div className="row">
              <input style={{ width: 70 }} placeholder="😀" maxLength={4} value={csEmoji} onChange={(e) => setCsEmoji(e.target.value)} />
              <input placeholder="Ce que tu fais en ce moment" maxLength={60} value={csText} onChange={(e) => setCsText(e.target.value)} />
            </div>
            <div className="grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div><label>Pronoms</label><input maxLength={40} value={pronouns} onChange={(e) => setPronouns(e.target.value)} /></div>
              <div><label>Lieu</label><input maxLength={40} value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            </div>
            <label>Biographie ({bio.length}/190)</label>
            <textarea rows={3} maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} />

            <label>Liens (5 max, commençant par https://)</label>
            {links.map((l, i) => (
              <div key={i} className="row" style={{ marginBottom: 6 }}>
                <input style={{ width: 130 }} placeholder="Nom" maxLength={30} value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input placeholder="https://…" maxLength={200} value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <button type="button" className="small danger" onClick={() => setLinks(links.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {links.length < 5 && <button type="button" className="small ghost" onClick={() => setLinks([...links, { label: '', url: '' }])}>+ Ajouter un lien</button>}

            {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
            <div className="row" style={{ marginTop: 18 }}>
              <button style={{ flex: 1 }} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
              <Link to="/"><button type="button" className="ghost">Retour</button></Link>
            </div>
          </form>
        )}

        {tab === 'look' && (
          <div>
            <label>Couleur d&apos;accent</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {ACCENTS.map((c) => (
                <button key={c} type="button" className="swatch" style={{ background: c, outline: prefs.accent === c ? '3px solid #fff' : 'none' }} onClick={() => setPrefs({ accent: c })} />
              ))}
              <input type="color" style={{ width: 60 }} value={prefs.accent} onChange={(e) => setPrefs({ accent: e.target.value })} />
            </div>
            <label>Taille du texte : {prefs.fontSize} px</label>
            <input type="range" min={13} max={20} value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })} />
            <label className="perm"><input type="checkbox" checked={prefs.compact} onChange={(e) => setPrefs({ compact: e.target.checked })} /><span>Mode compact (messages plus serrés)</span></label>
            <label className="perm"><input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /><span>Réduire les animations</span></label>
            <label className="perm"><input type="checkbox" checked={prefs.messageSound} onChange={(e) => { setPrefs({ messageSound: e.target.checked }); if (e.target.checked) playMessageSound() }} /><span>Son quand un message arrive dans un autre salon</span></label>
            <p className="muted">Ces réglages sont gardés sur cet appareil.</p>
          </div>
        )}

        {tab === 'av' && (
          <div>
            <label>Microphone (pris en compte à la prochaine connexion au vocal)</label>
            <select value={prefs.micId} onChange={(e) => setPrefs({ micId: e.target.value })}>
              <option value="">Par défaut</option>
              {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micro'}</option>)}
            </select>
            <label>Caméra</label>
            <select value={prefs.camId} onChange={(e) => setPrefs({ camId: e.target.value })}>
              <option value="">Par défaut</option>
              {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Caméra'}</option>)}
            </select>
            {devices.length > 0 && devices.every((d) => !d.label) && <p className="muted">Les noms des appareils apparaissent après avoir autorisé le micro une première fois (rejoins un vocal).</p>}
            <label className="perm"><input type="checkbox" checked={prefs.noiseSuppression} onChange={(e) => setPrefs({ noiseSuppression: e.target.checked })} /><span>Réduction du bruit</span></label>
            <label className="perm"><input type="checkbox" checked={prefs.echoCancellation} onChange={(e) => setPrefs({ echoCancellation: e.target.checked })} /><span>Suppression de l&apos;écho</span></label>
            <label className="perm"><input type="checkbox" checked={prefs.autoGainControl} onChange={(e) => setPrefs({ autoGainControl: e.target.checked })} /><span>Réglage automatique du volume du micro</span></label>
            <label>Volume des autres : {prefs.outputVolume} %</label>
            <input type="range" min={0} max={100} value={prefs.outputVolume} onChange={(e) => { setPrefs({ outputVolume: Number(e.target.value) }); applyVolume() }} />
            <label>Volume du soundboard : {prefs.soundboardVolume} %</label>
            <input type="range" min={0} max={100} value={prefs.soundboardVolume} onChange={(e) => setPrefs({ soundboardVolume: Number(e.target.value) })} />
          </div>
        )}

        {tab === 'screen' && (
          <div>
            <label>Qualité du partage d&apos;écran</label>
            <select value={prefs.screenPreset} onChange={(e) => setPrefs({ screenPreset: e.target.value })}>
              {Object.entries(SCREEN_PRESETS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
            <label className="perm"><input type="checkbox" checked={prefs.screenAudio} onChange={(e) => setPrefs({ screenAudio: e.target.checked })} /><span>Partager aussi le son de l&apos;ordinateur (si possible)</span></label>
            <p className="muted">
              120 images/s demande un PC puissant <b>et</b> beaucoup de débit montant : chaque spectateur reçoit son propre flux
              (jusqu&apos;à 12 Mb/s × le nombre de spectateurs). Si ça saccade, choisis 1080p60 ou 720p30. Le partage d&apos;écran se lance
              depuis l&apos;appli Windows ou un navigateur sur ordinateur ; sur téléphone on peut seulement regarder.
            </p>
          </div>
        )}
        {tab !== 'profile' && <div className="row" style={{ marginTop: 18 }}><Link to="/"><button type="button" className="ghost">Retour</button></Link></div>}
      </div>
    </div>
  )
}
