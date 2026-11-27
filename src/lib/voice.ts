// Client vocal : WebRTC en maillage (chacun envoie sa voix directement aux autres).
// Le serveur ne sert que d'intermédiaire pour la mise en relation ("signalisation").
import { useEffect, useState } from 'react'
import * as api from './api'
import { subscribe } from './events'
import { SCREEN_PRESETS, getPrefs } from './prefs'
import { playBuiltin, playUrl } from './sounds'

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
  screen: boolean
  localScreen: MediaStream | null
  screens: Record<string, MediaStream>
  recording: boolean
  clip: { blob: Blob; url: string } | null
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
  screen: false,
  localScreen: null,
  screens: {},
  recording: false,
  clip: null,
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
  screenSenders: RTCRtpSender[]
  pending: RTCIceCandidateInit[]
}

const peers = new Map<string, Peer>()
const audios = new Map<string, HTMLAudioElement>()
const monitors = new Map<string, () => void>()
const remote = new Map<string, Map<string, MediaStream>>() // flux reçus, par personne puis par id de flux
const screenIds = new Map<string, Set<string>>() // ids de flux qui sont des partages d'écran
let screenStream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let recCtx: AudioContext | null = null
let recTimer: ReturnType<typeof setTimeout> | null = null
let recKeep = true
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
  api
    .setVoiceState({
      muted: state.muted,
      deafened: state.deafened,
      camera: state.camera,
      screen: state.screen,
      screenStreamId: screenStream?.id ?? null,
      recording: state.recording,
    })
    .catch(() => {})
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
  a.volume = getPrefs().outputVolume / 100
  void a.play().catch(() => {})
}
function stopAudio(key: string) {
  const a = audios.get(key)
  if (a) {
    a.pause()
    a.srcObject = null
    audios.delete(key)
  }
}
export function applyVolume() {
  audios.forEach((a) => {
    a.volume = getPrefs().outputVolume / 100
  })
}

// Range les flux reçus d'une personne : voix/caméra d'un côté, partage d'écran de l'autre
function reclassify(id: string) {
  const known = screenIds.get(id) ?? new Set<string>()
  const live = [...(remote.get(id)?.values() ?? [])].filter((st) => st.getTracks().length > 0)
  const main = live.find((st) => !known.has(st.id))
  const screen = live.find((st) => known.has(st.id))
  const streams = { ...state.streams }
  const screens = { ...state.screens }
  if (main) streams[id] = main
  else delete streams[id]
  if (screen) screens[id] = screen
  else delete screens[id]
  set({ streams, screens })
  if (main) {
    playRemote(id, main)
    if (!monitors.has(id)) monitor(id, main)
  } else stopAudio(id)
  if (screen && screen.getAudioTracks().length) playRemote(id + ':screen', screen)
  else stopAudio(id + ':screen')
}

function createPeer(id: string): Peer {
  const pc = new RTCPeerConnection({ iceServers })
  const peer: Peer = { pc, polite: myId > id, makingOffer: false, ignoreOffer: false, videoSender: null, screenSenders: [], pending: [] }
  peers.set(id, peer)

  const mic = local?.getAudioTracks()[0]
  if (mic && local) pc.addTrack(mic, local)
  else pc.addTransceiver('audio', { direction: 'recvonly' })
  const cam = local?.getVideoTracks()[0]
  if (cam && local) peer.videoSender = pc.addTrack(cam, local)
  if (screenStream) addScreenToPeer(peer)

  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track])
    const map = remote.get(id) ?? new Map<string, MediaStream>()
    remote.set(id, map)
    if (!map.has(stream.id)) {
      map.set(stream.id, stream)
      stream.onremovetrack = () => reclassify(id)
    }
    reclassify(id)
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
  stopAudio(id + ':screen')
  stopMonitor(id)
  remote.delete(id)
  screenIds.delete(id)
  if (id in state.streams || id in state.screens) {
    const streams = { ...state.streams }
    const screens = { ...state.screens }
    delete streams[id]
    delete screens[id]
    set({ streams, screens })
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
  stopClipRecorder(false)
  screenStream?.getTracks().forEach((t) => t.stop())
  screenStream = null
  local?.getTracks().forEach((t) => t.stop())
  local = null
  void audioCtx?.close().catch(() => {})
  audioCtx = null
}

function onParticipants(list: api.VoiceParticipant[]) {
  set({ participants: list })
  for (const p of list) {
    if (p.userId === myId || !p.screenStreamId) continue
    const known = screenIds.get(p.userId) ?? new Set<string>()
    if (!known.has(p.screenStreamId)) {
      known.add(p.screenStreamId)
      screenIds.set(p.userId, known)
    }
  }
  for (const id of peers.keys()) reclassify(id)
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
  else if (type === 'sound' && data.channelId === state.channelId && !state.deafened) {
    if (data.url) playUrl(api.absUrl(data.url) as string)
    else playBuiltin(data.soundId)
  }
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
      const pr = getPrefs()
      const audio: MediaTrackConstraints = {
        echoCancellation: pr.echoCancellation,
        noiseSuppression: pr.noiseSuppression,
        autoGainControl: pr.autoGainControl,
      }
      if (pr.micId) audio.deviceId = { ideal: pr.micId }
      const mic = await navigator.mediaDevices.getUserMedia({ audio })
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
    remote.clear()
    screenIds.clear()
    set({
      channelId, participants, connecting: false, localStream: local,
      muted: false, deafened: false, camera: false, screen: false, localScreen: null, screens: {}, recording: false, streams: {}, speaking: [], error: micError,
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
      video: {
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        ...(getPrefs().camId ? { deviceId: { ideal: getPrefs().camId } } : {}),
      },
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

// ----- Partage d'écran (ordinateur uniquement) -----
function addScreenToPeer(p: Peer) {
  if (!screenStream) return
  for (const track of screenStream.getTracks()) {
    const sender = p.pc.addTrack(track, screenStream)
    p.screenSenders.push(sender)
    if (track.kind === 'video') {
      setTimeout(() => void tuneSender(sender), 400)
      setTimeout(() => void tuneSender(sender), 3000)
    }
  }
}

// Demande au navigateur de privilégier la fluidité et d'autoriser un gros débit
async function tuneSender(sender: RTCRtpSender) {
  const preset = SCREEN_PRESETS[getPrefs().screenPreset] ?? SCREEN_PRESETS['1080p60']
  try {
    const params = sender.getParameters() as RTCRtpSendParameters & { degradationPreference?: string }
    if (!params.encodings || !params.encodings.length) params.encodings = [{}]
    params.encodings[0].maxBitrate = preset.bitrate
    params.encodings[0].maxFramerate = preset.fps
    params.degradationPreference = 'maintain-framerate'
    await sender.setParameters(params)
  } catch {
    /* pas supporté : on garde les réglages par défaut */
  }
}

export const canShareScreen = () => Boolean(navigator.mediaDevices?.getDisplayMedia)

export async function startScreen() {
  if (!state.channelId || !local || state.screen) return
  if (!canShareScreen()) return set({ error: "Le partage d'écran n'est pas disponible sur cet appareil (ordinateur seulement)." })
  const pr = getPrefs()
  const preset = SCREEN_PRESETS[pr.screenPreset] ?? SCREEN_PRESETS['1080p60']
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps, max: preset.fps } },
      audio: pr.screenAudio,
    })
    const vt = s.getVideoTracks()[0]
    if (vt) {
      vt.contentHint = 'motion'
      vt.onended = () => stopScreen()
    }
    screenStream = s
    for (const p of peers.values()) addScreenToPeer(p)
    set({ screen: true, localScreen: s, error: null })
    pushState()
  } catch (e) {
    if (!(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError'))) set({ error: "Impossible de partager l'écran." })
  }
}

export function stopScreen() {
  if (!screenStream) return
  screenStream.getTracks().forEach((t) => t.stop())
  for (const p of peers.values()) {
    for (const sender of p.screenSenders) {
      try {
        p.pc.removeTrack(sender)
      } catch {
        /* déjà retiré */
      }
    }
    p.screenSenders = []
  }
  screenStream = null
  set({ screen: false, localScreen: null })
  pushState()
}

// ----- Clips (enregistrement manuel, 60 s max) -----
export const MAX_CLIP_SECONDS = 60

function stopClipRecorder(keep: boolean) {
  if (recTimer) clearTimeout(recTimer)
  recTimer = null
  recKeep = keep
  if (recorder && recorder.state !== 'inactive') recorder.stop()
  else {
    void recCtx?.close().catch(() => {})
    recCtx = null
  }
  recorder = null
}

export function startClip() {
  if (!state.channelId || state.recording) return
  const video = screenStream?.getVideoTracks()[0] ?? local?.getVideoTracks()[0]
  if (!video) return set({ error: 'Pour faire un clip, partage ton écran ou active ta caméra.' })
  if (typeof MediaRecorder === 'undefined') return set({ error: "L'enregistrement n'est pas disponible sur cet appareil." })
  discardClip()
  try {
    recCtx = new AudioContext()
    const dest = recCtx.createMediaStreamDestination()
    const add = (s: MediaStream | null | undefined) => {
      if (s && s.getAudioTracks().length) recCtx!.createMediaStreamSource(s).connect(dest)
    }
    add(local)
    add(screenStream)
    Object.values(state.streams).forEach(add)
    const out = new MediaStream([video, ...dest.stream.getAudioTracks()])
    const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    const rec = new MediaRecorder(out, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    rec.onstop = () => {
      void recCtx?.close().catch(() => {})
      recCtx = null
      if (recKeep && chunks.length) {
        const blob = new Blob(chunks, { type: 'video/webm' })
        set({ recording: false, clip: { blob, url: URL.createObjectURL(blob) } })
      } else set({ recording: false })
      pushState()
    }
    recKeep = true
    recorder = rec
    rec.start(1000)
    recTimer = setTimeout(() => stopClipRecorder(true), MAX_CLIP_SECONDS * 1000)
    set({ recording: true, error: null })
    pushState()
  } catch {
    stopClipRecorder(false)
    set({ error: "Impossible de démarrer l'enregistrement." })
  }
}

export const stopClip = () => stopClipRecorder(true)

export function discardClip() {
  if (state.clip) URL.revokeObjectURL(state.clip.url)
  if (state.clip) set({ clip: null })
}
