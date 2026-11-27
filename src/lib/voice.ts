// Client vocal : WebRTC en maillage (chacun envoie sa voix directement aux autres).
// Le serveur ne sert que d'intermédiaire pour la mise en relation ("signalisation").
import { useEffect, useState } from 'react'
import * as api from './api'
import { subscribe } from './events'

export type VoiceState = {
  channelId: string | null
  connecting: boolean
  participants: api.VoiceParticipant[]
  streams: Record<string, MediaStream>
  localStream: MediaStream | null
  speaking: string[]
  muted: boolean
  deafened: boolean
  camera: boolean
  error: string | null
}

const initial: VoiceState = {
  channelId: null,
  connecting: false,
  participants: [],
  streams: {},
  localStream: null,
  speaking: [],
  muted: false,
  deafened: false,
  camera: false,
  error: null,
}

let state: VoiceState = initial
const listeners = new Set<() => void>()
function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export const getVoiceState = () => state
export function subscribeVoice(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export function useVoice(): VoiceState {
  const [s, setS] = useState(getVoiceState())
  useEffect(() => subscribeVoice(() => setS(getVoiceState())), [])
  return s
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur')

type Peer = {
  pc: RTCPeerConnection
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  videoSender: RTCRtpSender | null
  pending: RTCIceCandidateInit[]
}

const peers = new Map<string, Peer>()
const audios = new Map<string, HTMLAudioElement>()
const monitors = new Map<string, () => void>()
let local: MediaStream | null = null
let myId = ''
let joinedAt = 0
let mutedBeforeDeafen = false
let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
let audioCtx: AudioContext | null = null

const sendSignal = (to: string, data: unknown) => {
  api.sendSignal(to, data).catch(() => {})
}
const pushState = () => {
  api.setVoiceState({ muted: state.muted, deafened: state.deafened, camera: state.camera }).catch(() => {})
}

// ----- Détection "qui parle" -----
function stopMonitor(id: string) {
  monitors.get(id)?.()
  monitors.delete(id)
  if (state.speaking.includes(id)) set({ speaking: state.speaking.filter((x) => x !== id) })
}
function monitor(id: string, stream: MediaStream) {
  stopMonitor(id)
  if (!stream.getAudioTracks().length) return
  try {
    audioCtx = audioCtx ?? new AudioContext()
    void audioCtx.resume()
    const src = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let max = 0
      for (const v of buf) max = Math.max(max, Math.abs(v - 128))
      const on = max > 12
      const has = state.speaking.includes(id)
      if (on && !has) set({ speaking: [...state.speaking, id] })
      else if (!on && has) set({ speaking: state.speaking.filter((x) => x !== id) })
    }, 150)
    monitors.set(id, () => {
      clearInterval(timer)
      src.disconnect()
    })
  } catch {
    /* la détection est un bonus, on ignore */
  }
}

// ----- Connexions entre joueurs -----
function playRemote(id: string, stream: MediaStream) {
  let a = audios.get(id)
  if (!a) {
    a = new Audio()
    a.autoplay = true
    audios.set(id, a)
  }
  if (a.srcObject !== stream) a.srcObject = stream
  a.muted = state.deafened
  void a.play().catch(() => {})
}

function createPeer(id: string): Peer {
  const pc = new RTCPeerConnection({ iceServers })
  const peer: Peer = { pc, polite: myId > id, makingOffer: false, ignoreOffer: false, videoSender: null, pending: [] }
  peers.set(id, peer)

  const mic = local?.getAudioTracks()[0]
  if (mic && local) pc.addTrack(mic, local)
  else pc.addTransceiver('audio', { direction: 'recvonly' })
  const cam = local?.getVideoTracks()[0]
  if (cam && local) peer.videoSender = pc.addTrack(cam, local)

  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track])
    set({ streams: { ...state.streams, [id]: stream } })
    playRemote(id, stream)
    monitor(id, stream)
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(id, { candidate: e.candidate.toJSON() })
  }
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true
      await pc.setLocalDescription()
      sendSignal(id, { description: pc.localDescription })
    } catch {
      /* on réessaiera à la prochaine négociation */
    } finally {
      peer.makingOffer = false
    }
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') pc.restartIce()
  }
  return peer
}

function dropPeer(id: string) {
  peers.get(id)?.pc.close()
  peers.delete(id)
  const a = audios.get(id)
  if (a) {
    a.pause()
    a.srcObject = null
    audios.delete(id)
  }
  stopMonitor(id)
  if (id in state.streams) {
    const rest = { ...state.streams }
    delete rest[id]
    set({ streams: rest })
  }
}

async function handleSignal(from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  if (!state.channelId || !data) return
  const peer = peers.get(from) ?? createPeer(from)
  const pc = peer.pc
  try {
    if (data.description) {
      const d = data.description
      const collision = d.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
      peer.ignoreOffer = !peer.polite && collision
      if (peer.ignoreOffer) return
      await pc.setRemoteDescription(d)
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      if (d.type === 'offer') {
        await pc.setLocalDescription()
        sendSignal(from, { description: pc.localDescription })
      }
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {})
      else peer.pending.push(data.candidate)
    }
  } catch {
    /* signal obsolète : ignoré */
  }
}

function cleanup() {
  for (const id of [...peers.keys()]) dropPeer(id)
  monitors.forEach((stop) => stop())
  monitors.clear()
  local?.getTracks().forEach((t) => t.stop())
  local = null
  void audioCtx?.close().catch(() => {})
  audioCtx = null
}

function onParticipants(list: api.VoiceParticipant[]) {
  set({ participants: list })
  if (!list.some((p) => p.userId === myId)) {
    // On n'est plus dans la liste (déconnexion côté serveur). Petite marge pour éviter un faux départ.
    if (Date.now() - joinedAt > 3000) {
      cleanup()
      set({ ...initial, error: 'Tu as été déconnecté du vocal.' })
    }
    return
  }
  for (const id of [...peers.keys()]) if (!list.some((p) => p.userId === id)) dropPeer(id)
}

subscribe((type, data) => {
  if (type === 'signal') void handleSignal(data.from, data.data)
  else if (type === 'voice' && data.channelId === state.channelId) onParticipants(data.participants)
})

// ----- Actions -----
export async function joinVoice(channelId: string, userId: string) {
  if (state.channelId === channelId || state.connecting) return
  if (state.channelId) await leaveVoice()
  set({ connecting: true, error: null })
  myId = userId
  local = new MediaStream()
  let micError: string | null = null
  if (!navigator.mediaDevices?.getUserMedia) {
    micError = "Le micro n'est pas disponible ici : tu peux écouter mais pas parler."
  } else {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      local.addTrack(mic.getAudioTracks()[0])
    } catch {
      micError = 'Micro refusé ou introuvable : tu peux écouter mais pas parler.'
    }
  }
  try {
    iceServers = await api.getIce()
  } catch {
    /* on garde les serveurs par défaut */
  }
  try {
    const participants = await api.joinVoiceChannel(channelId)
    joinedAt = Date.now()
    mutedBeforeDeafen = false
    set({
      channelId, participants, connecting: false, localStream: local,
      muted: false, deafened: false, camera: false, streams: {}, speaking: [], error: micError,
    })
    if (local.getAudioTracks().length) monitor(userId, local)
    for (const p of participants) if (p.userId !== userId) createPeer(p.userId)
  } catch (e) {
    cleanup()
    set({ ...initial, error: errMsg(e) })
  }
}

export async function leaveVoice() {
  const had = state.channelId
  cleanup()
  set({ ...initial })
  if (had) await api.leaveVoiceChannel().catch(() => {})
}

function applyMute() {
  local?.getAudioTracks().forEach((t) => {
    t.enabled = !state.muted
  })
  audios.forEach((a) => {
    a.muted = state.deafened
  })
}

export function toggleMute() {
  if (!state.channelId) return
  if (state.deafened) set({ deafened: false, muted: false })
  else set({ muted: !state.muted })
  applyMute()
  pushState()
}

export function toggleDeafen() {
  if (!state.channelId) return
  if (state.deafened) {
    set({ deafened: false, muted: mutedBeforeDeafen })
  } else {
    mutedBeforeDeafen = state.muted
    set({ deafened: true, muted: true })
  }
  applyMute()
  pushState()
}

function stopCamera() {
  const track = local?.getVideoTracks()[0]
  if (track && local) {
    track.stop()
    local.removeTrack(track)
  }
  for (const p of peers.values()) {
    if (p.videoSender) {
      try {
        p.pc.removeTrack(p.videoSender)
      } catch {
        /* déjà retirée */
      }
      p.videoSender = null
    }
  }
  set({ camera: false })
}

export async function toggleCamera() {
  if (!state.channelId || !local) return
  if (state.camera) {
    stopCamera()
    pushState()
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) return set({ error: "La caméra n'est pas disponible ici." })
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    })
    const track = s.getVideoTracks()[0]
    track.onended = () => {
      if (state.camera) {
        stopCamera()
        pushState()
      }
    }
    local.addTrack(track)
    for (const p of peers.values()) p.videoSender = p.pc.addTrack(track, local)
    set({ camera: true, error: null })
    pushState()
  } catch {
    set({ error: 'Caméra refusée ou introuvable.' })
  }
}
