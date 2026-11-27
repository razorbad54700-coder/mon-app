import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import Avatar from './Avatar'
import { nameStyle } from '../lib/nameStyle'
import { canShareScreen, discardClip, joinVoice, leaveVoice, startClip, startScreen, stopClip, stopScreen, toggleCamera, toggleDeafen, toggleMute, useVoice } from '../lib/voice'
import { BUILTIN } from '../lib/sounds'

type Desktop = {
  getSources: () => Promise<{ id: string; name: string; thumb: string }[]>
  setSource: (id: string) => Promise<void>
}
const desktop = (): Desktop | undefined => (window as unknown as { monappDesktop?: Desktop }).monappDesktop

// Affiche une vidéo (le son est géré séparément, donc toujours coupé ici)
function Video({ stream, mirror }: { stream: MediaStream; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.srcObject !== stream) {
      el.srcObject = stream
      void el.play().catch(() => {})
    }
  }, [stream])
  return <video ref={ref} className={'tile-video' + (mirror ? ' mirror' : '')} autoPlay playsInline muted />
}

function ScreenPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<{ id: string; name: string; thumb: string }[] | null>(null)
  useEffect(() => {
    void desktop()?.getSources().then(setItems)
  }, [])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card settings" onClick={(e) => e.stopPropagation()}>
        <h1>Quoi partager ?</h1>
        {!items && <p className="muted">Recherche des écrans…</p>}
        <div className="sources">
          {items?.map((i) => (
            <button key={i.id} className="source ghost" onClick={() => onPick(i.id)}>
              <img src={i.thumb} alt="" />
              <span className="ellipsis">{i.name}</span>
            </button>
          ))}
        </div>
        <button className="full ghost" onClick={onClose}>Annuler</button>
      </div>
    </div>
  )
}

export default function VoiceRoom({
  server,
  channel,
  me,
  members,
}: {
  server: api.ServerInfo
  channel: api.Channel
  me: api.User
  members: api.Member[]
}) {
  const v = useVoice()
  const [picker, setPicker] = useState(false)
  const [board, setBoard] = useState(false)
  const [caption, setCaption] = useState('')
  const [target, setTarget] = useState('')
  const [clipMsg, setClipMsg] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const perms = server.perms
  const textChannels = server.channels.filter((c) => c.type === 'text')
  const inRoom = v.channelId === channel.id
  const list = inRoom ? v.participants : server.voice?.[channel.id] ?? []

  return (
    <div className="chat-wrap">
      <div className="chat-head">🔊 {channel.name}</div>
      {v.error && <div className="banner">{v.error}</div>}

      <div className="voice-grid">
        {list.length === 0 && (
          <div className="muted" style={{ padding: 20 }}>
            <h2>Personne dans ce salon pour l&apos;instant</h2>
            Clique sur « Rejoindre le vocal » pour commencer.
          </div>
        )}
        {list.filter((p) => p.screen && (p.userId === me.id ? v.localScreen : v.screens[p.userId])).map((p) => {
          const m = members.find((x) => x.id === p.userId)
          return (
            <div key={'s' + p.userId} className="tile screen">
              <Video stream={(p.userId === me.id ? v.localScreen : v.screens[p.userId]) as MediaStream} />
              <div className="tile-name">🖥 {p.userId === me.id ? 'Ton écran' : `Écran de ${m ? api.displayName(m) : '…'}`}</div>
            </div>
          )
        })}
        {list.map((p) => {
          const m = members.find((x) => x.id === p.userId)
          const name = p.userId === me.id ? me.username : m?.username ?? '…'
          const stream = p.userId === me.id ? v.localStream : v.streams[p.userId]
          const speaking = v.speaking.includes(p.userId)
          return (
            <div key={p.userId} className={'tile' + (speaking ? ' speaking' : '')}>
              {inRoom && p.camera && stream ? (
                <Video stream={stream} mirror={p.userId === me.id} />
              ) : (
                <Avatar url={(p.userId === me.id ? me.avatar_url : m?.avatar_url) ?? null} name={name} size={84} />
              )}
              <div className="tile-name">
                <span style={m ? nameStyle(m.name_color, m.name_font, m.name_effect) : undefined}>{m ? api.displayName(m) : name}</span>
                {p.deafened ? ' 🎧✕' : p.muted ? ' 🔇' : ''}{p.screen ? ' 🖥' : ''}{p.recording ? ' 🔴' : ''}
              </div>
            </div>
          )
        })}
      </div>

      {inRoom && board && (
        <div className="board">
          {[...BUILTIN.map((b) => ({ ...b })), ...server.sounds].map((x) => (
            <button key={x.id} className="ghost" onClick={() => void api.playSound(x.id).catch((e) => setClipMsg(e instanceof Error ? e.message : 'Erreur'))}>{x.emoji} {x.name}</button>
          ))}
        </div>
      )}
      {clipMsg && <div className="banner" onClick={() => setClipMsg(null)}>{clipMsg}</div>}
      <div className="voice-controls">
        {!inRoom ? (
          <button disabled={v.connecting} onClick={() => void joinVoice(channel.id, me.id)}>
            {v.connecting ? 'Connexion…' : v.channelId ? 'Changer pour ce salon' : '🔊 Rejoindre le vocal'}
          </button>
        ) : (
          <>
            <button className={v.muted ? 'danger' : 'ghost'} onClick={toggleMute}>{v.muted ? '🔇 Micro coupé' : '🎤 Micro'}</button>
            <button className={v.deafened ? 'danger' : 'ghost'} onClick={toggleDeafen}>{v.deafened ? '🎧 Sourdine activée' : '🎧 Sourdine'}</button>
            <button className={v.camera ? '' : 'ghost'} onClick={() => void toggleCamera()}>{v.camera ? '📷 Caméra activée' : '📷 Caméra'}</button>
            {perms.screen_share && canShareScreen() && (
              v.screen
                ? <button onClick={stopScreen}>🖥 Arrêter le partage</button>
                : <button className="ghost" onClick={() => (desktop() ? setPicker(true) : void startScreen())}>🖥 Partager l&apos;écran</button>
            )}
            {perms.create_clips && (
              v.recording
                ? <button className="danger" onClick={stopClip}>⏹ Arrêter le clip</button>
                : <button className="ghost" title="Enregistre jusqu'à 60 s de ton écran (ou caméra) + les voix" onClick={startClip}>🔴 Clip</button>
            )}
            {perms.use_soundboard && <button className={board ? '' : 'ghost'} onClick={() => setBoard(!board)}>🔊 Sons</button>}
            <button className="danger" onClick={() => void leaveVoice()}>📞 Quitter</button>
          </>
        )}
      </div>
      {picker && <ScreenPicker onClose={() => setPicker(false)} onPick={async (id) => { await desktop()?.setSource(id); setPicker(false); void startScreen() }} />}
      {v.clip && (
        <div className="overlay">
          <div className="card settings">
            <h1>Ton clip</h1>
            <video className="msg-clip" style={{ maxWidth: '100%' }} src={v.clip.url} controls />
            <label>Légende (facultatif)</label>
            <input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} />
            <label>Envoyer dans</label>
            <select value={target || textChannels[0]?.id} onChange={(e) => setTarget(e.target.value)}>
              {textChannels.map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}
            </select>
            {clipMsg && <div className="error">{clipMsg}</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button disabled={sending || !textChannels.length} onClick={async () => {
                setSending(true)
                try { await api.uploadClip(target || textChannels[0].id, v.clip!.blob, caption); setCaption(''); setClipMsg(null); discardClip() }
                catch (e) { setClipMsg(e instanceof Error ? e.message : 'Erreur') }
                setSending(false)
              }}>{sending ? 'Envoi…' : 'Envoyer'}</button>
              <a href={v.clip.url} download="clip.webm"><button type="button" className="ghost">Télécharger</button></a>
              <button type="button" className="danger" onClick={discardClip}>Jeter</button>
            </div>
          </div>
        </div>
      )}
      {picker && <ScreenPicker onClose={() => setPicker(false)} onPick={async (id) => { await desktop()?.setSource(id); setPicker(false); void startScreen() }} />}
      {v.clip && (
        <div className="overlay">
          <div className="card settings">
            <h1>Ton clip</h1>
            <video className="msg-clip" style={{ maxWidth: '100%' }} src={v.clip.url} controls />
            <label>Légende (facultatif)</label>
            <input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} />
            <label>Envoyer dans</label>
            <select value={target || textChannels[0]?.id} onChange={(e) => setTarget(e.target.value)}>
              {textChannels.map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}
            </select>
            {clipMsg && <div className="error">{clipMsg}</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button disabled={sending || !textChannels.length} onClick={async () => {
                setSending(true)
                try { await api.uploadClip(target || textChannels[0].id, v.clip!.blob, caption); setCaption(''); setClipMsg(null); discardClip() }
                catch (e) { setClipMsg(e instanceof Error ? e.message : 'Erreur') }
                setSending(false)
              }}>{sending ? 'Envoi…' : 'Envoyer'}</button>
              <a href={v.clip.url} download="clip.webm"><button type="button" className="ghost">Télécharger</button></a>
              <button type="button" className="danger" onClick={discardClip}>Jeter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
