import { useEffect, useState } from 'react'
import * as api from '../lib/api'
import Avatar from './Avatar'
import { nameStyle, statusLabel } from '../lib/nameStyle'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur')

export default function MemberCard({
  server, member, meId, onChanged, onClose,
}: {
  server: api.ServerInfo
  member: api.Member
  meId: string
  onChanged: () => Promise<void>
  onClose: () => void
}) {
  const [prof, setProf] = useState<api.FullProfile | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [nick, setNick] = useState(member.nick ?? '')
  const p = server.perms
  const mine = member.id === meId
  const myRank = server.isOwner ? Infinity : Math.max(0, ...server.myRoles.map((id) => server.roles.find((r) => r.id === id)?.rank ?? 0))
  const theirRank = member.isOwner ? Infinity : Math.max(0, ...member.roles.map((id) => server.roles.find((r) => r.id === id)?.rank ?? 0))
  const above = !member.isOwner && (server.isOwner || myRank > theirRank)

  useEffect(() => {
    api.getProfile(member.id, server.id).then((r) => setProf(r.user)).catch(() => {})
  }, [member.id, server.id])

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      setErr(null)
    } catch (e) {
      setErr(errMsg(e))
    }
    await onChanged()
  }
  const u = prof ?? member
  const assignable = server.roles.filter((r) => r.rank < myRank)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card profile-card" onClick={(e) => e.stopPropagation()}>
        <div className="banner-img" style={{ background: prof?.banner_url ? `center/cover url(${prof.banner_url})` : u.banner_color || 'linear-gradient(90deg, var(--accent), #00e5ff55)' }} />
        <div className="row" style={{ marginTop: -34, padding: '0 6px' }}>
          <Avatar url={u.avatar_url} name={u.username} status={u.status} size={72} />
          <div style={{ minWidth: 0 }}>
            <div className="ellipsis" style={{ fontSize: 20, ...nameStyle(u.name_color, u.name_font, u.name_effect) }}>{api.displayName(member)}{member.isOwner && ' 👑'}</div>
            <div className="muted">{member.nick ? `${u.username} · ` : ''}{u.pronouns}{u.pronouns && ' · '}{statusLabel(u.status)}</div>
          </div>
        </div>
        {u.custom_status && <p>{u.custom_status.emoji} {u.custom_status.text}</p>}
        {u.bio && <p style={{ whiteSpace: 'pre-wrap' }}>{u.bio}</p>}
        {prof?.location && <div className="muted">📍 {prof.location}</div>}
        {prof?.links.map((l) => <div key={l.url}><a href={l.url} target="_blank" rel="noreferrer">🔗 {l.label}</a></div>)}
        <div className="chips" style={{ margin: '10px 0' }}>
          {member.roles.map((id) => server.roles.find((r) => r.id === id)).filter(Boolean).map((r) => (
            <span key={r!.id} className="chip"><span className="dot" style={{ background: r!.color || '#999' }} /> {r!.name}</span>
          ))}
        </div>
        <div className="muted">Membre depuis le {new Date(member.joined).toLocaleDateString('fr-FR')}</div>

        {(mine ? p.change_nickname : p.manage_nicknames && above) && (
          <>
            <label>Surnom sur ce serveur</label>
            <div className="row">
              <input value={nick} maxLength={32} placeholder={member.username} onChange={(e) => setNick(e.target.value)} />
              <button className="small" onClick={() => void run(() => api.setNick(server.id, member.id, nick.trim() || null))}>OK</button>
            </div>
          </>
        )}

        {p.manage_roles && !member.isOwner && (mine || above) && assignable.length > 0 && (
          <>
            <label>Rôles</label>
            {assignable.map((r) => (
              <label key={r.id} className="perm">
                <input type="checkbox" checked={member.roles.includes(r.id)} onChange={(e) =>
                  void run(() => api.setMemberRoles(server.id, member.id, e.target.checked ? [...member.roles, r.id] : member.roles.filter((x) => x !== r.id)))} />
                <span><span className="dot" style={{ background: r.color || '#999' }} /> {r.name}</span>
              </label>
            ))}
          </>
        )}

        <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          {!mine && p.kick_members && above && (
            <button className="small danger" onClick={() => { if (confirm(`Exclure ${member.username} ?`)) void run(async () => { await api.kickMember(server.id, member.id); onClose() }) }}>Exclure</button>
          )}
          {!mine && p.ban_members && above && (
            <button className="small danger" onClick={() => { const r = prompt(`Bannir ${member.username} ? Raison (facultatif) :`); if (r !== null) void run(async () => { await api.banMember(server.id, member.id, r); onClose() }) }}>Bannir</button>
          )}
          <button className="small ghost" onClick={onClose}>Fermer</button>
        </div>
        {err && <div className="error">{err}</div>}
      </div>
    </div>
  )
}
