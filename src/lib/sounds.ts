// Petits sons : sons intégrés (synthétisés, aucun fichier) + lecture des sons du serveur.
import { getPrefs } from './prefs'

let ctx: AudioContext | null = null
const audio = () => (ctx ??= new AudioContext())

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number }
function tones(notes: Note[], volume: number) {
  try {
    const c = audio()
    void c.resume()
    const now = c.currentTime
    for (const n of notes) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = n.type ?? 'sine'
      o.frequency.value = n.f
      const peak = (n.g ?? 0.4) * volume
      g.gain.setValueAtTime(0, now + n.t)
      g.gain.linearRampToValueAtTime(peak, now + n.t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d)
      o.connect(g).connect(c.destination)
      o.start(now + n.t)
      o.stop(now + n.t + n.d + 0.05)
    }
  } catch {
    /* pas de son possible */
  }
}

export const BUILTIN: { id: string; name: string; emoji: string }[] = [
  { id: 'builtin:ding', name: 'Ding', emoji: '🔔' },
  { id: 'builtin:buzzer', name: 'Buzzer', emoji: '❌' },
  { id: 'builtin:pouet', name: 'Pouet', emoji: '📯' },
  { id: 'builtin:tada', name: 'Tada', emoji: '🎉' },
]

const BUILTIN_NOTES: Record<string, Note[]> = {
  'builtin:ding': [{ f: 1318, t: 0, d: 0.6 }],
  'builtin:buzzer': [{ f: 120, t: 0, d: 0.5, type: 'sawtooth', g: 0.3 }, { f: 110, t: 0, d: 0.5, type: 'square', g: 0.2 }],
  'builtin:pouet': [{ f: 220, t: 0, d: 0.12, type: 'square', g: 0.25 }, { f: 330, t: 0.12, d: 0.3, type: 'square', g: 0.25 }],
  'builtin:tada': [
    { f: 523, t: 0, d: 0.18 }, { f: 659, t: 0.12, d: 0.18 }, { f: 784, t: 0.24, d: 0.18 },
    { f: 1046, t: 0.36, d: 0.7 }, { f: 784, t: 0.36, d: 0.7, g: 0.25 },
  ],
}

export function playBuiltin(id: string, volume = getPrefs().soundboardVolume / 100) {
  if (BUILTIN_NOTES[id]) tones(BUILTIN_NOTES[id], volume)
}

export function playUrl(url: string, volume = getPrefs().soundboardVolume / 100) {
  const a = new Audio(url)
  a.volume = Math.max(0, Math.min(1, volume))
  void a.play().catch(() => {})
}

// Petit « plop » quand un message arrive dans un autre salon
export function playMessageSound() {
  if (getPrefs().messageSound) tones([{ f: 880, t: 0, d: 0.12, g: 0.15 }, { f: 1175, t: 0.08, d: 0.18, g: 0.15 }], 1)
}
