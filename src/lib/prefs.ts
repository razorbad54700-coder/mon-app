// Réglages personnels, gardés sur cet appareil (localStorage).
import { useEffect, useState } from 'react'

export type Prefs = {
  accent: string
  compact: boolean
  fontSize: number
  reduceMotion: boolean
  messageSound: boolean
  micId: string
  camId: string
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
  outputVolume: number // 0-100 : volume des autres personnes
  soundboardVolume: number // 0-100
  screenPreset: string
  screenAudio: boolean
}

export const SCREEN_PRESETS: Record<string, { label: string; width: number; height: number; fps: number; bitrate: number }> = {
  '720p30': { label: '720p — 30 images/s (léger)', width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  '1080p60': { label: '1080p — 60 images/s', width: 1920, height: 1080, fps: 60, bitrate: 6_000_000 },
  '1080p120': { label: '1080p — 120 images/s (très gourmand)', width: 1920, height: 1080, fps: 120, bitrate: 12_000_000 },
  '1440p60': { label: '1440p — 60 images/s', width: 2560, height: 1440, fps: 60, bitrate: 10_000_000 },
}

export const defaults: Prefs = {
  accent: '#7c5cff',
  compact: false,
  fontSize: 16,
  reduceMotion: false,
  messageSound: true,
  micId: '',
  camId: '',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  outputVolume: 100,
  soundboardVolume: 70,
  screenPreset: '1080p60',
  screenAudio: true,
}

const KEY = 'monapp.prefs'
let prefs: Prefs = load()
const listeners = new Set<() => void>()

function load(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...defaults }
  }
}

export const getPrefs = () => prefs

export function applyPrefs() {
  const root = document.documentElement
  root.style.setProperty('--accent', prefs.accent)
  root.style.fontSize = prefs.fontSize + 'px'
  root.dataset.compact = String(prefs.compact)
  root.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full'
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* stockage indisponible */
  }
  applyPrefs()
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  const [p, setP] = useState(prefs)
  useEffect(() => {
    const l = () => setP(prefs)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return p
}
