// Flux d'événements en direct envoyés par le serveur (nouveaux messages, etc.)
import { getServerAddress, getToken } from './api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (type: string, data: any) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function stopEvents() {
  source?.close()
  source = null
}

export function startEvents() {
  stopEvents()
  const base = getServerAddress()
  const token = getToken()
  if (!base || !token) return
  const es = new EventSource(`${base}/api/events?token=${encodeURIComponent(token)}`)
  source = es
  for (const type of ['message', 'message_deleted', 'reaction', 'refresh', 'voice', 'signal', 'sound', 'notice']) {
    es.addEventListener(type, (ev) => {
      let data: unknown = {}
      try {
        data = JSON.parse((ev as MessageEvent).data)
      } catch {
        /* ignoré */
      }
      listeners.forEach((l) => l(type, data))
    })
  }
  es.onopen = () => listeners.forEach((l) => l('open', {}))
}
