import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import Avatar from '../components/Avatar'
import ServerModal from '../components/ServerModal'
import ChatView from '../components/ChatView'
import VoiceRoom from '../components/VoiceRoom'
import { subscribe } from '../lib/events'
import { leaveVoice, toggleDeafen, toggleMute, useVoice } from '../lib/voice'
import { STATUSES, nameStyle, statusLabel } from '../lib/nameStyle'

type View = 'channels' | 'main' | 'members'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur')
const ROLE_ORDER: api.Role[] = ['owner', 'admin', 'member']
const ROLE_LABEL: Record<api.Role, string> = { owner: 'Propriétaire', admin: 'Admins', member: 'Membres' }

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
  const [renaming, setRenaming] = useState<string | null>(null)
  const [openMember, setOpenMember] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const server = servers.find((s) => s.id === selId) ?? servers[0] ?? null
  const channel = server?.channels.find((c) => c.id === chanId) ?? server?.channels[0] ?? null
  const serverId = server?.id ?? null
  const isStaff = server?.role === 'owner' || server?.role === 'admin'
  const isOwner = server?.role === 'owner'

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
    return subscribe((type) => {
      if (type === 'refresh') {
        void latest.current.refreshServers()
        void latest.current.refreshMembers()
      } else if (type === 'voice') {
        void latest.current.refreshServers()
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

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    list: members
      .filter((m) => m.role === role)
      .sort((a, b) => Number(a.status === 'offline') - Number(b.status === 'offline') || a.username.localeCompare(b.username)),
  })).filter((g) => g.list.length > 0)

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
            {s.name.charAt(0).toUpperCase()}
          </button>
        ))}
        <button className="rail-btn add" title="Créer ou rejoindre un serveur" onClick={() => setModal(true)}>+</button>
      </nav>

      {/* Salons */}
      <aside className="chanpanel">
        {server ? (
          <>
            <div className="panel-head">
              {renaming !== null ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void act(() => api.renameServer(server.id, renaming))
                    setRenaming(null)
                  }}
                >
                  <input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={40} autoFocus />
                  <button className="small">OK</button>
                </form>
              ) : (
                <strong className="ellipsis">{server.name}</strong>
              )}
            </div>

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
              {isStaff && <button className="small ghost" onClick={() => setNewChannel('')}>+</button>}
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
                    <button className="chan-name" onClick={() => { setChanId(c.id); setView('main') }}>
                      {c.type === 'voice' ? '🔊' : '#'} {c.name}
                    </button>
                    {isStaff && server.channels.length > 1 && (
                      <button
                        className="small ghost"
                        title="Supprimer le salon"
                        onClick={() => { if (confirm(`Supprimer le salon ${c.name} ?`)) void act(() => api.deleteChannel(server.id, c.id)) }}
                      >✕</button>
                    )}
                  </div>
                  {c.type === 'voice' &&
                    (server.voice?.[c.id] ?? []).map((p) => {
                      const m = members.find((x) => x.id === p.userId)
                      return (
                        <div key={p.userId} className={'voice-user' + (v.speaking.includes(p.userId) ? ' speaking' : '')}>
                          <Avatar url={m?.avatar_url ?? null} name={m?.username ?? '?'} size={22} />
                          <span className="ellipsis">{m?.username ?? '…'}</span>
                          {p.deafened ? ' 🎧✕' : p.muted ? ' 🔇' : ''}
                          {p.camera ? ' 📷' : ''}
                        </div>
                      )
                    })}
                </div>
              ))}
            </div>

            <div className="server-actions">
              {isOwner && <button className="small ghost" onClick={() => setRenaming(server.name)}>Renommer</button>}
              {isOwner ? (
                <button className="small danger" onClick={() => { if (confirm(`Supprimer définitivement « ${server.name} » ?`)) void act(() => api.deleteServer(server.id)) }}>Supprimer le serveur</button>
              ) : (
                <button className="small danger" onClick={() => { if (confirm(`Quitter « ${server.name} » ?`)) void act(() => api.leaveServer(server.id)) }}>Quitter</button>
              )}
            </div>
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
              <div className="muted">{statusLabel(profile.status)}</div>
            </div>
          </div>
          <select style={{ marginTop: 8 }} value={profile.status} onChange={(e) => void update({ status: e.target.value as api.Status })}>
            {STATUSES.filter((s) => s.id !== 'offline').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="row" style={{ marginTop: 8 }}>
            <Link to="/profile"><button className="small ghost">Mon profil</button></Link>
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
            <ChatView key={channel.id} server={server} channel={channel} me={profile} members={members} />
          )
        ) : (
          <div className="chat-body"><p className="muted">Choisis ou crée un serveur pour commencer.</p></div>
        )}
      </main>

      {/* Membres */}
      <aside className="members">
        {server &&
          grouped.map((g) => (
            <div key={g.role}>
              <div className="section-title"><span>{ROLE_LABEL[g.role].toUpperCase()} — {g.list.length}</span></div>
              {g.list.map((m) => {
                const mine = m.id === profile.id
                const canRole = isOwner && !mine && m.role !== 'owner'
                const canKick = !mine && m.role !== 'owner' && (isOwner || (server.role === 'admin' && m.role === 'member'))
                return (
                  <div key={m.id}>
                    <button className={'member' + (m.status === 'offline' ? ' off' : '')} onClick={() => setOpenMember(openMember === m.id ? null : m.id)}>
                      <Avatar url={m.avatar_url} name={m.username} status={m.status} size={34} />
                      <span className="ellipsis" style={nameStyle(m.name_color, m.name_font, m.name_effect)}>{m.username}</span>
                    </button>
                    {openMember === m.id && (
                      <div className="member-card">
                        <div className="muted">{statusLabel(m.status)}</div>
                        {m.bio && <p style={{ whiteSpace: 'pre-wrap' }}>{m.bio}</p>}
                        <div className="row" style={{ flexWrap: 'wrap' }}>
                          {canRole && (
                            <button className="small ghost" onClick={() => void act(() => api.setRole(server.id, m.id, m.role === 'admin' ? 'member' : 'admin'))}>
                              {m.role === 'admin' ? 'Retirer admin' : 'Nommer admin'}
                            </button>
                          )}
                          {canKick && (
                            <button className="small danger" onClick={() => { if (confirm(`Exclure ${m.username} ?`)) void act(() => api.kickMember(server.id, m.id)) }}>
                              Exclure
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
      </aside>

      <div className="mobnav">
        <button className={view === 'channels' ? '' : 'ghost'} onClick={() => setView('channels')}>Salons</button>
        <button className={view === 'main' ? '' : 'ghost'} onClick={() => setView('main')}>Chat</button>
        <button className={view === 'members' ? '' : 'ghost'} onClick={() => setView('members')}>Membres</button>
      </div>

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
