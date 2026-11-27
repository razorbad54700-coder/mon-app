import { useEffect, useState } from 'react'
import * as api from '../lib/api'
import Avatar from './Avatar'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur')
type Tab = 'general' | 'community' | 'roles' | 'channels' | 'sounds' | 'bans'
const GROUPS = ['Général', 'Modération', 'Membres', 'Texte', 'Vocal']

function PermEditor({ value, onChange, mine }: { value: api.Perms; onChange: (p: api.Perms) => void; mine: api.Perms }) {
  return (
    <div>
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="section-title" style={{ marginTop: 12 }}><span>{g.toUpperCase()}</span></div>
          {api.PERM_LIST.filter((p) => p.group === g).map((p) => {
            const locked = !mine[p.key] && !value[p.key]
            return (
              <label key={p.key} className={'perm' + (locked ? ' locked' : '')} title={locked ? "Tu n'as pas cette permission" : ''}>
                <input
                  type="checkbox"
                  checked={Boolean(value[p.key])}
                  disabled={locked}
                  onChange={(e) => onChange({ ...value, [p.key]: e.target.checked })}
                />
                <span>
                  {p.label}
                  {p.hint && <small className="muted"> — {p.hint}</small>}
                </span>
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function ServerSettings({
  server, members, meId, onClose, onRefresh, onDeleted,
}: {
  server: api.ServerInfo
  members: api.Member[]
  meId: string
  onClose: () => void
  onRefresh: () => Promise<void>
  onDeleted: () => void
}) {
  const p = server.perms
  const tabs: [Tab, string, boolean][] = [
    ['general', 'Général', Boolean(p.manage_server)],
    ['community', 'Communauté', Boolean(p.manage_server)],
    ['roles', 'Rôles', Boolean(p.manage_roles)],
    ['channels', 'Salons', Boolean(p.manage_channels)],
    ['sounds', 'Soundboard', Boolean(p.manage_soundboard)],
    ['bans', 'Bannis', Boolean(p.ban_members)],
  ]
  const visible = tabs.filter((t) => t[2])
  const [tab, setTab] = useState<Tab>(visible[0]?.[0] ?? 'general')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function run(fn: () => Promise<unknown>, okText = 'Enregistré ✅') {
    try {
      await fn()
      await onRefresh()
      setMsg({ ok: true, text: okText })
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) })
    }
  }

  // --- Général ---
  const [name, setName] = useState(server.name)
  const [desc, setDesc] = useState(server.description)
  const [icon, setIcon] = useState<string | null | undefined>(undefined)
  // --- Communauté ---
  const [com, setCom] = useState(server.community)
  // --- Rôles ---
  const [sel, setSel] = useState<string>('everyone')
  const role = server.roles.find((r) => r.id === sel)
  const [rName, setRName] = useState('')
  const [rColor, setRColor] = useState('#7c5cff')
  const [rHoist, setRHoist] = useState(false)
  const [rPerms, setRPerms] = useState<api.Perms>({})
  useEffect(() => {
    if (sel === 'everyone') setRPerms(server.everyone?.permissions ?? {})
    else if (role) {
      setRName(role.name)
      setRColor(role.color || '#7c5cff')
      setRHoist(role.hoist)
      setRPerms(role.permissions)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, server.roles.length])
  const myRank = server.isOwner ? Infinity : Math.max(0, ...server.myRoles.map((id) => server.roles.find((r) => r.id === id)?.rank ?? 0))
  const editable = sel === 'everyone' || (role && role.rank < myRank)
  // --- Salons ---
  const [chSel, setChSel] = useState(server.channels[0]?.id ?? '')
  const ch = server.channels.find((c) => c.id === chSel)
  const [cName, setCName] = useState('')
  const [cTopic, setCTopic] = useState('')
  const [cSlow, setCSlow] = useState(0)
  const [cRO, setCRO] = useState(false)
  useEffect(() => {
    if (ch) { setCName(ch.name); setCTopic(ch.topic); setCSlow(ch.slowmode); setCRO(ch.readonly) }
  }, [ch?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // --- Sons ---
  const [sName, setSName] = useState('')
  const [sEmoji, setSEmoji] = useState('🔊')
  // --- Bannis ---
  const [bans, setBans] = useState<{ userId: string; username: string; reason: string; at: number }[]>([])
  useEffect(() => {
    if (tab === 'bans') api.listBans(server.id).then(setBans).catch((e) => setMsg({ ok: false, text: errMsg(e) }))
  }, [tab, server.id])

  async function pickIcon(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setIcon(await api.imageToAvatar(f, 128))
  }

  async function pickSound(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 400 * 1024) return setMsg({ ok: false, text: 'Son trop lourd (400 Ko max).' })
    const dur = await new Promise<number>((res) => {
      const a = new Audio(URL.createObjectURL(f))
      a.onloadedmetadata = () => res(a.duration)
      a.onerror = () => res(0)
    })
    if (!dur) return setMsg({ ok: false, text: 'Fichier audio illisible.' })
    if (dur > 6) return setMsg({ ok: false, text: 'Son trop long (6 secondes max).' })
    const data = await api.fileToDataUrl(f)
    void run(() => api.addSound(server.id, sName || f.name.replace(/\.[^.]+$/, '').slice(0, 24), sEmoji, data), 'Son ajouté ✅')
    setSName('')
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card settings" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0 }}>Paramètres — {server.name}</h1>
          <button className="small ghost" onClick={onClose}>✕</button>
        </div>
        <div className="tabs">
          {visible.map(([id, label]) => (
            <button key={id} className={tab === id ? '' : 'ghost'} onClick={() => { setTab(id); setMsg(null) }}>{label}</button>
          ))}
        </div>
        {visible.length === 0 && <p className="muted">Tu n&apos;as aucune permission de gestion sur ce serveur.</p>}

        {tab === 'general' && (
          <div>
            <div className="row">
              <Avatar url={icon === undefined ? server.icon_url : icon} name={name} size={64} />
              <div style={{ flex: 1 }}>
                <label>Icône</label>
                <input type="file" accept="image/*" onChange={(e) => void pickIcon(e)} />
              </div>
              {(icon || server.icon_url) && icon !== null && <button className="small ghost" onClick={() => setIcon(null)}>Retirer</button>}
            </div>
            <label>Nom du serveur</label>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <label>Description ({desc.length}/300)</label>
            <textarea rows={3} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => void run(() => api.updateServer(server.id, { name, description: desc, ...(icon !== undefined ? { icon } : {}) }))}>Enregistrer</button>
              <button className="ghost" onClick={() => void run(() => api.resetInvite(server.id), 'Nouveau code généré ✅')}>Nouveau code d&apos;invitation</button>
            </div>
            <label>Transférer la propriété</label>
            {server.isOwner ? (
              <select value="" onChange={(e) => { const m = members.find((x) => x.id === e.target.value); if (m && confirm(`Donner le serveur à ${m.username} ? Tu ne seras plus propriétaire.`)) void run(() => api.transferServer(server.id, m.id), 'Propriété transférée ✅') }}>
                <option value="">Choisir un membre…</option>
                {members.filter((m) => m.id !== meId).map((m) => <option key={m.id} value={m.id}>{api.displayName(m)}</option>)}
              </select>
            ) : <p className="muted">Réservé au propriétaire.</p>}
            {server.isOwner && (
              <button className="danger full" onClick={() => { if (confirm(`Supprimer définitivement « ${server.name} » ?`)) void api.deleteServer(server.id).then(onDeleted).catch((e) => setMsg({ ok: false, text: errMsg(e) })) }}>
                Supprimer le serveur
              </button>
            )}
          </div>
        )}

        {tab === 'community' && (
          <div>
            <label className="perm"><input type="checkbox" checked={com.enabled} onChange={(e) => setCom({ ...com, enabled: e.target.checked })} /><span>Activer le mode Communauté</span></label>
            {com.enabled && (
              <>
                <label>Règlement ({com.rules.length}/2000)</label>
                <textarea rows={5} maxLength={2000} value={com.rules} onChange={(e) => setCom({ ...com, rules: e.target.value })} />
                <label>Message d&apos;accueil</label>
                <textarea rows={2} maxLength={500} value={com.welcome} onChange={(e) => setCom({ ...com, welcome: e.target.value })} />
                <label className="perm"><input type="checkbox" checked={com.requireAccept} onChange={(e) => setCom({ ...com, requireAccept: e.target.checked })} /><span>Les nouveaux doivent accepter le règlement avant de parler</span></label>
                <label className="perm"><input type="checkbox" checked={com.public} onChange={(e) => setCom({ ...com, public: e.target.checked })} /><span>Serveur public : visible dans « Découvrir » (description obligatoire)</span></label>
              </>
            )}
            <button className="full" onClick={() => void run(() => api.updateServer(server.id, { community: com }))}>Enregistrer</button>
          </div>
        )}

        {tab === 'roles' && (
          <div className="roles-layout">
            <div className="role-list">
              <button className={sel === 'everyone' ? '' : 'ghost'} onClick={() => setSel('everyone')}>@everyone</button>
              {server.roles.map((r) => (
                <div key={r.id} className="row" style={{ gap: 4 }}>
                  <button className={'grow ' + (sel === r.id ? '' : 'ghost')} onClick={() => setSel(r.id)}>
                    <span className="dot" style={{ background: r.color || '#999' }} /> {r.name}
                  </button>
                  {r.rank < myRank && (
                    <>
                      <button className="small ghost" title="Monter" onClick={() => void run(() => api.moveRole(server.id, r.id, 'up'), 'Ordre modifié ✅')}>↑</button>
                      <button className="small ghost" title="Descendre" onClick={() => void run(() => api.moveRole(server.id, r.id, 'down'), 'Ordre modifié ✅')}>↓</button>
                    </>
                  )}
                </div>
              ))}
              <button className="ghost" onClick={() => void run(async () => {
                await api.createRole(server.id, { name: 'Nouveau rôle', color: '#7c5cff', hoist: false, permissions: {} })
              }, 'Rôle créé ✅')}>+ Nouveau rôle</button>
              <p className="muted">Plus un rôle est haut, plus il a de pouvoir sur ceux du dessous.</p>
            </div>
            <div className="role-edit">
              {sel !== 'everyone' && role && (
                <>
                  <label>Nom</label>
                  <input value={rName} maxLength={32} onChange={(e) => setRName(e.target.value)} disabled={!editable} />
                  <div className="row">
                    <div><label>Couleur</label><input type="color" value={rColor} onChange={(e) => setRColor(e.target.value)} disabled={!editable} /></div>
                    <label className="perm" style={{ marginTop: 24 }}><input type="checkbox" checked={rHoist} onChange={(e) => setRHoist(e.target.checked)} disabled={!editable} /><span>Afficher à part dans la liste des membres</span></label>
                  </div>
                </>
              )}
              {sel === 'everyone' && <p className="muted">Permissions de base de <b>tous</b> les membres. Les rôles ajoutent des permissions par-dessus.</p>}
              {!editable && <p className="error">Ce rôle est au-dessus du tien : tu ne peux pas le modifier.</p>}
              <PermEditor value={rPerms} onChange={setRPerms} mine={p} />
              {editable && (
                <div className="row" style={{ marginTop: 14 }}>
                  <button disabled={!editable} onClick={() => void run(() => sel === 'everyone'
                    ? api.updateServer(server.id, { everyone: { permissions: rPerms } })
                    : api.updateRole(server.id, sel, { name: rName, color: rColor, hoist: rHoist, permissions: rPerms }))}>Enregistrer</button>
                  {sel !== 'everyone' && (
                    <button className="danger" onClick={() => { if (confirm(`Supprimer le rôle ${rName} ?`)) void run(async () => { await api.deleteRole(server.id, sel); setSel('everyone') }, 'Rôle supprimé ✅') }}>Supprimer</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'channels' && (
          <div>
            <label>Salon</label>
            <select value={chSel} onChange={(e) => setChSel(e.target.value)}>
              {server.channels.map((c) => <option key={c.id} value={c.id}>{c.type === 'voice' ? '🔊' : '#'} {c.name}</option>)}
            </select>
            {ch && (
              <>
                <label>Nom</label>
                <input value={cName} maxLength={32} onChange={(e) => setCName(e.target.value)} />
                <label>Sujet</label>
                <input value={cTopic} maxLength={200} onChange={(e) => setCTopic(e.target.value)} />
                {ch.type === 'text' && (
                  <>
                    <label>Mode lent (secondes entre deux messages, 0 = désactivé)</label>
                    <input type="number" min={0} max={21600} value={cSlow} onChange={(e) => setCSlow(Number(e.target.value))} />
                    <label className="perm"><input type="checkbox" checked={cRO} onChange={(e) => setCRO(e.target.checked)} /><span>Lecture seule (seuls les modérateurs écrivent)</span></label>
                  </>
                )}
                <div className="row" style={{ marginTop: 14 }}>
                  <button onClick={() => void run(() => api.updateChannel(server.id, ch.id, { name: cName, topic: cTopic, ...(ch.type === 'text' ? { slowmode: cSlow, readonly: cRO } : {}) }))}>Enregistrer</button>
                  {server.channels.length > 1 && (
                    <button className="danger" onClick={() => { if (confirm(`Supprimer ${ch.name} ?`)) void run(async () => { await api.deleteChannel(server.id, ch.id); setChSel(server.channels.find((c) => c.id !== ch.id)?.id ?? '') }, 'Salon supprimé ✅') }}>Supprimer</button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'sounds' && (
          <div>
            <p className="muted">Sons du serveur (jusqu&apos;à 24, 6 s et 400 Ko max chacun : mp3, wav, ogg). Les 4 sons intégrés sont toujours là.</p>
            {server.sounds.map((s) => (
              <div key={s.id} className="row" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{s.emoji}</span><span className="grow">{s.name}</span>
                <button className="small ghost" onClick={() => void new Audio(s.url).play()}>▶</button>
                <button className="small danger" onClick={() => void run(() => api.deleteSound(server.id, s.id), 'Son supprimé ✅')}>✕</button>
              </div>
            ))}
            <label>Ajouter un son</label>
            <div className="row">
              <input style={{ width: 70 }} value={sEmoji} maxLength={4} onChange={(e) => setSEmoji(e.target.value)} />
              <input placeholder="Nom du son" value={sName} maxLength={24} onChange={(e) => setSName(e.target.value)} />
            </div>
            <input type="file" accept="audio/*" style={{ marginTop: 8 }} onChange={(e) => void pickSound(e)} />
          </div>
        )}

        {tab === 'bans' && (
          <div>
            {bans.length === 0 && <p className="muted">Personne n&apos;est banni.</p>}
            {bans.map((b) => (
              <div key={b.userId} className="row" style={{ marginBottom: 6 }}>
                <span className="grow">{b.username} {b.reason && <small className="muted">— {b.reason}</small>}</span>
                <button className="small ghost" onClick={() => void run(async () => { await api.unban(server.id, b.userId); setBans(await api.listBans(server.id)) }, 'Débanni ✅')}>Débannir</button>
              </div>
            ))}
          </div>
        )}

        {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
      </div>
    </div>
  )
}
