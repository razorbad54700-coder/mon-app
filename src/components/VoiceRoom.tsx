import { useEffect, useRef } from 'react'
import * as api from '../lib/api'
import Avatar from './Avatar'
import { nameStyle } from '../lib/nameStyle'
import { joinVoice, leaveVoice, toggleCamera, toggleDeafen, toggleMute, useVoice } from '../lib/voice'

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
                <span style={m ? nameStyle(m.name_color, m.name_font, m.name_effect) : undefined}>{name}</span>
                {p.deafened ? ' 🎧✕' : p.muted ? ' 🔇' : ''}
              </div>
            </div>
          )
        })}
      </div>

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
            <button className="danger" onClick={() => void leaveVoice()}>📞 Quitter</button>
          </>
        )}
      </div>
    </div>
  )
}
