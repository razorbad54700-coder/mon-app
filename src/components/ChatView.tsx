import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { subscribe } from '../lib/events'
import Avatar from './Avatar'
import { nameStyle } from '../lib/nameStyle'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur')
const fmt = (t: number) =>
  new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function ChatView({
  server,
  channel,
  me,
  members,
  onChanged,
}: {
  server: api.ServerInfo
  channel: api.Channel
  me: api.User
  members: api.Member[]
  onChanged: () => void
}) {
  const [messages, setMessages] = useState<api.Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const channelId = channel.id
  const perms = server.perms

  const load = useCallback(async () => {
    try {
      const r = await api.listMessages(channelId)
      setMessages(r.messages)
      setHasMore(r.hasMore)
      setError(null)
      stick.current = true
    } catch (e) {
      setError(errMsg(e))
    }
  }, [channelId])

  useEffect(() => {
    setMessages([])
    setHasMore(false)
    setActive(null)
    void load()
  }, [load])

  // Mises à jour en direct
  useEffect(() => {
    return subscribe((type, data) => {
      if (type === 'open') return void load()
      if (!data || data.channelId !== channelId) return
      if (type === 'message') {
        const m = api.fixMessage(data as api.Message)
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      } else if (type === 'message_deleted') {
        setMessages((prev) => prev.filter((x) => x.id !== data.id))
      } else if (type === 'reaction') {
        setMessages((prev) => prev.map((x) => (x.id === data.id ? { ...x, reactions: data.reactions } : x)))
      }
    })
  }, [channelId, load])

  // Reste en bas quand un message arrive
  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  function onScroll() {
    const el = listRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function loadOlder() {
    if (!messages.length) return
    const el = listRef.current
    const prevHeight = el?.scrollHeight ?? 0
    try {
      const r = await api.listMessages(channelId, messages[0].id)
      stick.current = false
      setMessages((prev) => [...r.messages, ...prev])
      setHasMore(r.hasMore)
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight
      })
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function send() {
    const content = text.trim()
    if ((!content && !image) || sending) return
    setSending(true)
    try {
      const m = await api.sendMessage(channelId, content, image)
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      stick.current = true
      setText('')
      setImage(null)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
    setSending(false)
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setImage(await api.imageToUpload(file))
      setError(null)
    } catch (err) {
      setError(errMsg(err))
    }
  }

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="chat-wrap">
      <div className="chat-head"># {channel.name}{channel.topic && <span className="muted"> — {channel.topic}</span>}{channel.slowmode > 0 && <span className="muted"> · ⏱ mode lent {channel.slowmode}s</span>}</div>
      {server.needsAccept && (
        <div className="rules">
          {server.community.welcome && <p><b>{server.community.welcome}</b></p>}
          <div style={{ whiteSpace: 'pre-wrap' }}>{server.community.rules || 'Sois respectueux.'}</div>
          <button style={{ marginTop: 10 }} onClick={() => void run(async () => { await api.acceptRules(server.id); onChanged() })}>J&apos;accepte le règlement</button>
        </div>
      )}
      {error && <div className="banner">{error}</div>}

      <div className="msgs" ref={listRef} onScroll={onScroll}>
        {hasMore && (
          <button className="small ghost" style={{ alignSelf: 'center', marginBottom: 8 }} onClick={() => void loadOlder()}>
            Charger les messages précédents
          </button>
        )}
        {messages.length === 0 && (
          <div className="muted" style={{ padding: 20 }}>
            <h2>Bienvenue dans #{channel.name} !</h2>
            Écris le premier message 👇
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const head = !prev || prev.author.id !== m.author.id || m.created - prev.created > 5 * 60 * 1000
          const authorIsOwner = members.find((x) => x.id === m.author.id)?.isOwner
          const canDelete = m.author.id === me.id || (perms.manage_messages && !authorIsOwner)
          const nameCss = nameStyle(
            m.author.role_color && m.author.name_color === '#ffffff' && m.author.name_effect === 'none' ? m.author.role_color : m.author.name_color,
            m.author.name_font, m.author.name_effect)
          return (
            <div key={m.id} className={'msg' + (active === m.id ? ' active' : '')} onClick={() => setActive(active === m.id ? null : m.id)}>
              {head && (
                <div className="msg-head">
                  <Avatar url={m.author.avatar_url} name={m.author.username} size={36} />
                  <span style={nameCss}>{api.displayName(m.author)}</span>
                  <span className="muted">{fmt(m.created)}</span>
                </div>
              )}
              <div className="msg-body">
                {m.content && <div className="msg-text">{m.content}</div>}
                {m.clip_url && <video className="msg-clip" src={m.clip_url} controls preload="metadata" onClick={(e) => e.stopPropagation()} />}
                {m.image_url && (
                  <a href={m.image_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    <img className="msg-img" src={m.image_url} alt="" loading="lazy" />
                  </a>
                )}
                {Object.keys(m.reactions).length > 0 && (
                  <div className="chips">
                    {Object.entries(m.reactions).map(([emoji, ids]) => (
                      <button
                        key={emoji}
                        className={'chip' + (ids.includes(me.id) ? ' mine' : '')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void run(() => api.toggleReaction(channelId, m.id, emoji))
                        }}
                      >
                        {emoji} {ids.length}
                      </button>
                    ))}
                  </div>
                )}
                {active === m.id && (
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    {perms.add_reactions && api.REACTION_EMOJIS.map((emoji) => (
                      <button key={emoji} className="chip" onClick={() => { setActive(null); void run(() => api.toggleReaction(channelId, m.id, emoji)) }}>
                        {emoji}
                      </button>
                    ))}
                    {canDelete && (
                      <button className="chip danger" title="Supprimer" onClick={() => { setActive(null); void run(() => api.deleteMessage(channelId, m.id)) }}>
                        🗑 Supprimer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {image && (
        <div className="attach">
          <img src={image} alt="" />
          <button className="small ghost" onClick={() => setImage(null)}>Retirer l&apos;image</button>
        </div>
      )}

      {!perms.send_messages || (channel.readonly && !perms.manage_messages) ? (
        <div className="composer muted">🔒 {channel.readonly ? 'Ce salon est en lecture seule.' : "Tu n'as pas la permission d'écrire ici."}</div>
      ) : (
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
        {perms.attach_files && (
          <label className="attach-btn" title="Joindre une image">
            📎
            <input type="file" accept="image/*" onChange={(e) => void pickImage(e)} hidden />
          </label>
        )}
        <textarea
          rows={1}
          value={text}
          maxLength={2000}
          placeholder={`Écrire dans #${channel.name}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button disabled={sending || (!text.trim() && !image)}>{sending ? '…' : 'Envoyer'}</button>
      </form>
      )}
    </div>
  )
}
