import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import Avatar from '../components/Avatar'
import ServerModal from '../components/ServerModal'
import ChatView from '../components/ChatView'
import VoiceRoom from '../components/VoiceRoom'
import ServerSettings from '../components/ServerSettings'
import MemberCard from '../components/MemberCard'
import { playMessageSound } from '../lib/sounds'
import { subscribe } from '../lib/events'
import { leaveVoice, toggleDeafen, toggleMute, useVoice } from '../lib/voice'
import { STATUSES, nameStyle, statusLabel } from '../lib/nameStyle'

type View = 'channels' | 'main' | 'members'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur')

export default function Home() {
  const { profile, update, logout } = useAuth()
  const v = useVoice()
  const [servers, setServers] = useState<api.ServerInfo[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [chanId, setChanId] = useState<string | null>(null)
  const [members, setMembers] = useState<api.Member[]>([])
  const [view, setView] = useState<View>('channels')
  const [modal, setModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newChannel, setNewChannel] = useState<string | null>(null)
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text')
  const [settings, setSettings] = useState(false)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [openMember, setOpenMember] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const server = servers.find((s) => s.id === selId) ?? servers[0] ?? null
  const channel = server?.channels.find((c) => c.id === chanId) ?? server?.channels[0] ?? null
  const serverId = server?.id ?? null
  const perms = server?.perms ?? {}
  const canSettings = Boolean(perms.manage_server || perms.manage_roles || perms.manage_channels || perms.manage_soundboard || perms.ban_members)
  const open = useRef({ channel: channel?.id, status: profile?.status, me: profile?.id })
  open.current = { channel: channel?.id, status: profile?.status, me: profile?.id }

  const refreshServers = useCallback(async () => {
    try {
      setServers(await api.listServers())
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  const refreshMembers = useCallback(async () => {
    if (!serverId) return setMembers([])
    try {
      setMembers(await api.listMembers(serverId))
    } catch {
      /* le serveur a peut-être été supprimé : la liste des serveurs se mettra à jour */
    }
  }, [serverId])

  useEffect(() => {
    void refreshServers()
    const t = setInterval(() => void refreshServers(), 8000)
    return () => clearInterval(t)
  }, [refreshServers])

  // Mises à jour instantanées envoyées par le serveur
  const latest = useRef({ refreshServers, refreshMembers })
  latest.current = { refreshServers, refreshMembers }
  useEffect(() => {
    return subscribe((type, data) => {
      if (type === 'refresh') {
        void latest.current.refreshServers()
        void latest.current.refreshMembers()
      } else if (type === 'voice') {
        void latest.current.refreshServers()
      } else if (type === 'message') {
        const cur = open.current
        if (data.author?.id === cur.me) return
        if (data.channelId !== cur.channel || document.hidden) {
          setUnread((u) => ({ ...u, [data.channelId]: (u[data.channelId] ?? 0) + 1 }))
          if (cur.status !== 'dnd') playMessageSound()
        }
      }
    })
  }, [])

  useEffect(() => {
    void refreshMembers()
    const t = setInterval(() => void refreshMembers(), 8000)
    return () => clearInterval(t)
  }, [refreshMembers])

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
    await refreshServers()
    await refreshMembers()
  }

  if (!profile) return null

  function copyInvite() {
    if (!server?.invite) return
    void navigator.clipboard?.writeText(server.invite).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Groupes : un par rôle « affiché à part » (du plus haut au plus bas), puis les autres, selon leur rôle le plus haut
  const hoisted = (server?.roles ?? []).filter((r) => r.hoist).sort((a, b) => b.rank - a.rank)
  const roleById = (id: string) => server?.roles.find((r) => r.id === id)
  const groupOf = (m: api.Member) => {
    const top = m.roles.map(roleById).filter((r): r is api.Role => Boolean(r?.hoist)).sort((a, b) => b.rank - a.rank)[0]
    return top ? top.id : m.isOwner ? 'owner' : 'members'
  }
  const sortM = (a: api.Member, b: api.Member) =>
    Number(a.status === 'offline') - Number(b.status === 'offline') || api.displayName(a).localeCompare(api.displayName(b))
  const grouped = [
    { id: 'owner', label: '👑 Propriétaire', list: members.filter((m) => m.isOwner && groupOf(m) === 'owner').sort(sortM) },
    ...hoisted.map((r) => ({ id: r.id, label: r.name, list: members.filter((m) => groupOf(m) === r.id).sort(sortM) })),
    { id: 'members', label: 'Membres', list: members.filter((m) => groupOf(m) === 'members').sort(sortM) },
  ].filter((g) => g.list.length > 0)
  const opened = members.find((m) => m.id === openMember)
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0)

  return (
    <div className="app3" data-view={view}>
      {/* Colonne des serveurs */}
      <nav className="rail">
        {servers.map((s) => (
          <button
            key={s.id}
            className={'rail-btn' + (s.id === server?.id ? ' active' : '')}
            title={s.name}
            onClick={() => { setSelId(s.id); setChanId(null); setView('channels'); setOpenMember(null) }}
          >
            {s.icon_url ? <img src={s.icon_url} alt={s.name} className="rail-icon" /> : [...s.name][0]?.toUpperCase()}
          </button>
        ))}
        <button className="rail-btn add" title="Créer ou rejoindre un serveur" onClick={() => setModal(true)}>+</button>
      </nav>

      {/* Salons */}
      <aside className="chanpanel">
        {server ? (
          <>
            <div className="panel-head row" style={{ justifyContent: 'space-between' }}>
              <strong className="ellipsis">{server.name}</strong>
              {canSettings && <button className="small ghost" title="Paramètres du serveur" onClick={() => setSettings(true)}>⚙</button>}
            </div>
            {server.description && <div className="muted">{server.description}</div>}

            {server.invite && (
              <div className="invite">
                <div className="muted">Code d&apos;invitation</div>
                <div className="row">
                  <code>{server.invite}</code>
                  <button className="small ghost" onClick={copyInvite}>{copied ? 'Copié ✓' : 'Copier'}</button>
                  <button className="small ghost" title="Générer un nouveau code" onClick={() => void act(() => api.resetInvite(server.id))}>↻</button>
                </div>
              </div>
            )}

            <div className="section-title">
              <span>SALONS</span>
              {perms.manage_channels && <button className="small ghost" onClick={() => setNewChannel('')}>+</button>}
            </div>
            {newChannel !== null && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault()
                  void act(() => api.createChannel(server.id, newChannel, newChannelType))
                  setNewChannel(null)
                }}
              >
                <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="nom-du-salon" maxLength={32} autoFocus />
                <select style={{ width: 'auto' }} value={newChannelType} onChange={(e) => setNewChannelType(e.target.value as 'text' | 'voice')}>
                  <option value="text">Texte</option>
                  <option value="voice">Vocal</option>
                </select>
                <button className="small">OK</button>
              </form>
            )}
            <div className="channels">
              {server.channels.map((c) => (
                <div key={c.id}>
                  <div className={'channel' + (c.id === channel?.id ? ' active' : '')}>
                    <button className="chan-name" onClick={() => { setChanId(c.id); setView('main'); setUnread((u) => ({ ...u, [c.id]: 0 })) }}>
                      {c.type === 'voice' ? '🔊' : c.readonly ? '📢' : '#'} {c.name}
                      {unread[c.id] > 0 && c.id !== channel?.id && <span className="badge">{unread[c.id]}</span>}
                    </button>
                  </div>
                  {c.type === 'voice' &&
                    (server.voice?.[c.id] ?? []).map((p) => {
                      const m = members.find((x) => x.id === p.userId)
                      return (
                        <div key={p.userId} className={'voice-user' + (v.speaking.includes(p.userId) ? ' speaking' : '')}>
                          <Avatar url={m?.avatar_url ?? null} name={m?.username ?? '?'} size={22} />
                          <span className="ellipsis">{m ? api.displayName(m) : '…'}</span>
                          {p.deafened ? ' 🎧✕' : p.muted ? ' 🔇' : ''}
                          {p.camera ? ' 📷' : ''}{p.screen ? ' 🖥' : ''}{p.recording ? ' 🔴' : ''}
                        </div>
                      )
                    })}
                </div>
              ))}
            </div>

            {!server.isOwner && (
              <div className="server-actions">
                <button className="small danger" onClick={() => { if (confirm(`Quitter « ${server.name} » ?`)) void act(() => api.leaveServer(server.id)) }}>Quitter le serveur</button>
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            <h2>Bienvenue 👋</h2>
            <p className="muted">Crée ton premier serveur ou rejoins celui d&apos;un ami avec son code d&apos;invitation.</p>
            <button onClick={() => setModal(true)}>Créer / rejoindre</button>
          </div>
        )}

        {/* Barre d'appel */}
        {v.channelId && (
          <div className="callbar">
            <div className="ellipsis">
              🟢 Vocal : {servers.flatMap((s) => s.channels).find((c) => c.id === v.channelId)?.name ?? '…'}
            </div>
            <div className="row">
              <button className={'small ' + (v.muted ? 'danger' : 'ghost')} title="Micro" onClick={toggleMute}>{v.muted ? '🔇' : '🎤'}</button>
              <button className={'small ' + (v.deafened ? 'danger' : 'ghost')} title="Sourdine (couper le son)" onClick={toggleDeafen}>🎧</button>
              <button className="small danger" title="Quitter le vocal" onClick={() => void leaveVoice()}>📞 Quitter</button>
            </div>
          </div>
        )}

        {/* Ma carte */}
        <div className="me">
          <div className="row">
            <Avatar url={profile.avatar_url} name={profile.username} status={profile.status} size={40} />
            <div style={{ minWidth: 0 }}>
              <div className="ellipsis" style={nameStyle(profile.name_color, profile.name_font, profile.name_effect)}>{profile.username}</div>
              <div className="muted ellipsis">{profile.custom_status ? `${profile.custom_status.emoji} ${profile.custom_status.text}` : statusLabel(profile.status)}</div>
            </div>
          </div>
          <select style={{ marginTop: 8 }} value={profile.status} onChange={(e) => void update({ status: e.target.value as api.Status })}>
            {STATUSES.filter((s) => s.id !== 'offline').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="row" style={{ marginTop: 8 }}>
            <Link to="/profile"><button className="small ghost">Réglages</button></Link>
            <button className="small ghost" onClick={() => void logout()}>Déconnexion</button>
          </div>
        </div>
      </aside>

      {/* Zone principale */}
      <main className="chat">
        {error && <div className="banner">{error}</div>}
        {server && channel ? (
          channel.type === 'voice' ? (
            <VoiceRoom key={channel.id} server={server} channel={channel} me={profile} members={members} />
          ) : (
            <ChatView key={channel.id} server={server} channel={channel} me={profile} members={members} onChanged={() => void refreshServers()} />
          )
        ) : (
          <div className="chat-body"><p className="muted">Choisis ou crée un serveur pour commencer.</p></div>
        )}
      </main>

      {/* Membres */}
      <aside className="members">
        {server &&
          grouped.map((g) => (
            <div key={g.id}>
              <div className="section-title"><span>{g.label.toUpperCase()} — {g.list.length}</span></div>
              {g.list.map((m) => {
                const rc = m.roles.map(roleById).filter((r): r is api.Role => Boolean(r?.color)).sort((x, y) => y.rank - x.rank)[0]?.color
                const css = nameStyle(rc && m.name_color === '#ffffff' && m.name_effect === 'none' ? rc : m.name_color, m.name_font, m.name_effect)
                return (
                  <button key={m.id} className={'member' + (m.status === 'offline' ? ' off' : '')} onClick={() => setOpenMember(m.id)}>
                    <Avatar url={m.avatar_url} name={m.username} status={m.status} size={34} />
                    <span style={{ minWidth: 0 }}>
                      <span className="ellipsis" style={{ display: 'block', ...css }}>{api.displayName(m)}</span>
                      {m.custom_status && <span className="muted ellipsis" style={{ display: 'block', fontSize: 12 }}>{m.custom_status.emoji} {m.custom_status.text}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
      </aside>

      <div className="mobnav">
        <button className={view === 'channels' ? '' : 'ghost'} onClick={() => setView('channels')}>Salons</button>
        <button className={view === 'main' ? '' : 'ghost'} onClick={() => setView('main')}>Chat{totalUnread > 0 && <span className="badge">{totalUnread}</span>}</button>
        <button className={view === 'members' ? '' : 'ghost'} onClick={() => setView('members')}>Membres</button>
      </div>

      {server && opened && (
        <MemberCard server={server} member={opened} meId={profile.id} onClose={() => setOpenMember(null)} onChanged={async () => { await refreshServers(); await refreshMembers() }} />
      )}
      {server && settings && (
        <ServerSettings
          server={server} members={members} meId={profile.id}
          onClose={() => setSettings(false)}
          onRefresh={async () => { await refreshServers(); await refreshMembers() }}
          onDeleted={() => { setSettings(false); void refreshServers() }}
        />
      )}
      {modal && (
        <ServerModal
          onClose={() => setModal(false)}
          onDone={(s) => {
            setModal(false)
            setSelId(s.id)
            setChanId(null)
            setView('channels')
            void refreshServers()
          }}
        />
      )}
    </div>
  )
}
